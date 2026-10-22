// Hỏi TeX Live (qua Rust) xem từng gói/thư viện trong bảng tổng hợp có thật sự dùng được không,
// rồi dịch kết quả thành trạng thái dễ hiểu cho giáo viên. Chỉ tra cứu, không cài, không sửa gì.
import { invoke, isDesktop } from './platform';
import { getSettings, onSettingsChange, asTikzErr, defaultPreamble, setSettings, type TikzErr } from './tikz';
import { kindLabel, type PkgRow } from './packages';

export type PkgState =
  | 'dung-duoc'      // TeX Live có tệp
  | 'thieu'          // đã khai báo/cần nhưng TeX Live không có tệp
  | 'chua-khai-bao'  // TeX Live có tệp nhưng chưa ai khai báo, nên hình sẽ lỗi
  | 'tai-nguyen'     // \input / hình ngoài: HEdu không biết thư mục chứa
  | 'chua-kiem-tra'; // bản web hoặc chưa kiểm xong

export type PkgLevel = 'loi' | 'canh' | 'ok' | 'tin';

export interface PkgStatus {
  row: PkgRow;
  state: PkgState;
  level: PkgLevel;
  /** đường dẫn kpsewhich tìm được (nếu có) */
  path?: string;
  /** câu ngắn nói chuyện gì xảy ra */
  message: string;
  /** gợi ý việc cần làm */
  hint?: string;
}

export interface CheckResult {
  items: PkgStatus[];
  /** khác null = không chạy được TeX Live; items lúc này chỉ là 'chua-kiem-tra' */
  texError: TikzErr | null;
}

interface FileHit { file: string; path: string | null }

/** Nhớ theo (thư mục bin | tệp), xoá khi đổi cài đặt hoặc bấm Kiểm tra lại. */
const memo = new Map<string, string | null>();
onSettingsChange(() => memo.clear());
export const forgetChecks = () => memo.clear();

const binKey = () => getSettings().texBin.trim();

export async function checkRows(rows: PkgRow[]): Promise<CheckResult> {
  if (!isDesktop()) {
    return { items: rows.map((row) => describe(row, undefined)), texError: null };
  }
  const bin = binKey();
  const need = [...new Set(rows.map((r) => r.file).filter((f) => !memo.has(bin + '|' + f)))];
  if (need.length) {
    try {
      const hits = await invoke<FileHit[]>('tex_check_files', { files: need, texBin: bin || null });
      for (const h of hits) memo.set(bin + '|' + h.file, h.path);
    } catch (e) {
      return { items: rows.map((row) => describe(row, undefined)), texError: asTikzErr(e) };
    }
  }
  return { items: rows.map((row) => describe(row, memo.get(bin + '|' + row.file) ?? null)), texError: null };
}

/** path: undefined = chưa kiểm; null = không có; chuỗi = có. */
function describe(row: PkgRow, path: string | null | undefined): PkgStatus {
  const what = `${kindLabel(row.kind)} “${row.name}”`;
  const usedBy = row.questions.length ? ` (${row.questions.length} câu dùng)` : '';
  if (path === undefined) {
    return { row, state: 'chua-kiem-tra', level: 'tin', message: `${what}: chưa kiểm tra với TeX Live.` };
  }
  if (row.kind === 'input') {
    return path
      ? { row, state: 'dung-duoc', level: 'ok', path, message: `${what}: tìm thấy.` }
      : {
          row, state: 'tai-nguyen', level: 'canh',
          message: `${what}: HEdu chưa biết tệp này nằm ở đâu${usedBy}.`,
          hint: 'Đây là tệp riêng của bạn (hình, đoạn mã dùng chung…), không phải gói TeX Live. Hãy đặt nó cùng thư mục với file .tex hoặc nhập nội dung tệp vào trực tiếp.',
        };
  }
  if (path) {
    if (row.declared === 'khong') {
      return {
        row, state: 'chua-khai-bao', level: 'canh', path,
        message: `${what}: TeX Live có sẵn nhưng chưa được khai báo${usedBy}.`,
        hint: `${row.why[0] ? `Lý do nghi: ${row.why[0]}. ` : ''}Hình sẽ lỗi cho tới khi đầu file dùng để vẽ hình có \\usepackage{${row.name}}.`,
      };
    }
    return { row, state: 'dung-duoc', level: 'ok', path, message: `${what}: dùng được.` };
  }
  const whereDecl = row.declared === 'hedu' ? 'đầu file HEdu dùng để vẽ hình' : row.declared === 'file' ? 'file của bạn' : 'các lệnh trong câu';
  return {
    row, state: 'thieu', level: 'loi',
    message: `Thiếu ${what}${usedBy}: TeX Live đang chọn không có tệp ${row.file}.`,
    hint: `Khai báo từ ${whereDecl}. Hãy cài gói chứa tệp này bằng TeX Live Manager rồi bấm Kiểm tra lại.`,
  };
}

/** Thêm \usepackage vào đầu file HEdu dùng để vẽ hình. Chỉ gọi sau khi người dùng xác nhận. */
export async function addPackageToRenderPreamble(name: string): Promise<void> {
  const s = getSettings();
  const base = s.preamble.trim() ? s.preamble : await defaultPreamble();
  if (new RegExp(`\\\\usepackage(\\[[^\\]]*\\])?\\{[^}]*\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b[^}]*\\}`).test(base)) return;
  setSettings({ ...s, preamble: base.replace(/\s+$/, '') + `\n\\usepackage{${name}}` });
}

export interface PkgHit { package: string; file: string }

const found = new Map<string, PkgHit[]>();
/** Tra tên gói TeX Live chứa tệp. `global` chỉ được truyền true khi người dùng đã đồng ý dùng mạng. */
export async function findPackage(file: string, global: boolean): Promise<PkgHit[]> {
  const k = binKey() + '|' + file;
  const hit = found.get(k);
  if (hit) return hit;
  const r = await invoke<PkgHit[]>('tex_find_package', { file, texBin: binKey() || null, global });
  found.set(k, r);
  return r;
}

/** Lệnh người dùng chép để cài. Chỉ in ra, HEdu không tự chạy. */
export function installCommand(pkgs: PkgHit[], file: string): string {
  if (pkgs.length) return pkgs.map((p) => `tlmgr install ${p.package}`).join('\n');
  return `tlmgr search --global --file "/${file}"`;
}

// ---------- Phân loại lỗi khi biên dịch ----------

export type TexErrKind = 'thieu-goi' | 'thieu-tep' | 'xung-dot' | 'engine' | 'cu-phap' | 'khac';

export interface TexErrInfo { kind: TexErrKind; label: string; file?: string; detail: string }

/** Đọc log TeX và nói lỗi thuộc loại nào, để không đề nghị cài gói khi lỗi là do mã sai. */
export function classifyTexLog(message: string, log: string): TexErrInfo {
  const text = `${message}\n${log}`;
  let m = /File [`'‘]([^'’`]+\.(?:sty|cls|code\.tex))['’] not found/.exec(text);
  if (m) return { kind: 'thieu-goi', label: 'Thiếu gói LaTeX', file: m[1], detail: `TeX Live không có tệp ${m[1]}.` };
  m = /(?:File|I can't find file) [`'‘]?([^'’`\s]+)['’]? ?(?:not found|\.)/.exec(text);
  if (m && /not found|can't find file/i.test(text)) return { kind: 'thieu-tep', label: 'Thiếu tệp ngoài', file: m[1], detail: `Không thấy tệp ${m[1]} (hình hoặc \\input).` };
  if (/Option clash for package|incompatible with|Incompatible (?:list|package)|Package .* Error: .*version/i.test(text)) {
    return { kind: 'xung-dot', label: 'Xung đột gói', detail: 'Hai gói hoặc hai tuỳ chọn không đi cùng nhau.' };
  }
  if (/requires? (?:Lua|Xe)\s?TeX|only (?:works|runs) with (?:Lua|Xe)|Unicode engine|fontspec Error|luaotfload|Lua(?:La)?TeX/i.test(text) && /error|!/.test(text)) {
    return { kind: 'engine', label: 'Cần bộ dịch khác', detail: 'Mã này cần LuaLaTeX hoặc XeLaTeX; đổi “Bộ dịch” ở mục Hệ thống.' };
  }
  if (/Undefined control sequence|Missing \$ inserted|Missing \{ inserted|Runaway argument|Extra \}|Misplaced|Illegal parameter|Paragraph ended before|Too many \}|Package pgf Error|Package tikz Error|Package tkz/i.test(text)) {
    return { kind: 'cu-phap', label: 'Lỗi mã LaTeX', detail: 'Mã có lỗi hoặc dùng lệnh chưa được khai báo gói. Xem log để biết dòng nào.' };
  }
  return { kind: 'khac', label: 'Lỗi khi dịch', detail: message };
}
