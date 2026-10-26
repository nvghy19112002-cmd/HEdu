// Biên dịch cả dự án đề thành PDF (E2a): kiểu dữ liệu khớp Rust `examcompile.rs`, gọi lệnh và hàm thuần để hiển thị kết quả.
// Ba chế độ: "de" (không lời giải) và "loigiai" chỉ có khi HEdu nhận diện CHẮC cách bật/tắt lời giải của ex_test (Rust examprofile.rs); "nguyen-van" = chưa xác định, có thể chứa lời giải.
import { invoke } from './platform';

export type Engine = 'pdflatex' | 'xelatex' | 'lualatex';
export const ENGINES: { id: Engine; label: string }[] = [
  { id: 'pdflatex', label: 'pdfLaTeX' },
  { id: 'xelatex', label: 'XeLaTeX' },
  { id: 'lualatex', label: 'LuaLaTeX' },
];

export type ExamMode = 'nguyen-van' | 'de' | 'loigiai';
export const MODES: { id: ExamMode; label: string }[] = [
  { id: 'de', label: 'Đề (không lời giải)' },
  { id: 'loigiai', label: 'Lời giải' },
  { id: 'nguyen-van', label: 'Nguyên văn (chưa xác định)' },
];
export interface CompileOpts { engine?: Engine; timeoutSecs?: number; runs?: number; texBin?: string; force?: boolean; mode?: ExamMode }
export interface ProfileChange { file: string; line: number; before: string; after: string }
export interface ProfileInfo { available: boolean; reason: string | null; file: string | null; line: number | null; options: string[] }
export interface Diag { severity: 'error' | 'warning'; file: string | null; line: number | null; inProject: boolean; message: string; context: string[] }
export interface GoodInfo { fingerprint: string; engine: string; mode: string; texVersion: string; pages: number | null; bytes: number; at: string; pdfPath: string }
export type CompileStatus = 'ok' | 'failed' | 'timeout' | 'cancelled' | 'no-tex' | 'no-profile';
export interface CompileOut {
  status: CompileStatus; message: string; published: boolean; cached: boolean; invalidPdf: boolean; keptPrevious: boolean;
  pages: number | null; runs: number; ms: number; engine: string; texVersion: string; fingerprint: string; mode: string;
  diagnostics: Diag[]; errorCount: number; warningCount: number; warnings: string[]; rawLog: string; lastGood: GoodInfo | null; treeGuard: boolean; profileChanges: ProfileChange[];
}

export const examCompile = (id: string, opts: CompileOpts) => invoke<CompileOut>('exam_compile', { id, opts });
export const examCompileCancel = (id: string) => invoke<boolean>('exam_compile_cancel', { id });
export const examCompileLast = (id: string, mode: ExamMode = 'nguyen-van') => invoke<GoodInfo | null>('exam_compile_last', { id, mode });
export const examCompileAll = (id: string) => invoke<GoodInfo[]>('exam_compile_all', { id });
export const examProfiles = (id: string) => invoke<ProfileInfo>('exam_profiles', { id });

/** Nhãn và lời nhắc theo chế độ PDF. */
export const MODE_NOTE: Record<ExamMode, string> = {
  de: 'PDF ĐỀ: HEdu đã biên dịch với ex_test ở chế độ không lời giải (bản dẫn xuất trong thư mục build, tệp nguồn không đổi).',
  loigiai: 'PDF LỜI GIẢI: có lời giải. KHÔNG phát cho học sinh.',
  'nguyen-van': 'PDF biên dịch nguyên văn: HEdu chưa xác định đây là bản ĐỀ hay bản LỜI GIẢI, nên có thể chứa lời giải. Đừng phát cho học sinh khi chưa xem lại.',
};
export const modeLabel = (m: string): string => MODES.find((x) => x.id === m)?.label ?? m;
/** Gợi ý tên tệp khi lưu bản sao PDF: de_<tên>.pdf / dap-an_<tên>.pdf / nguyen-van_<tên>.pdf */
export function pdfFileName(mode: ExamMode, name: string): string {
  const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60) || 'de-thi';
  return `${mode === 'de' ? 'de' : mode === 'loigiai' ? 'dap-an' : 'nguyen-van'}_${slug}.pdf`;
}

export const RAW_MODE_NOTE = 'PDF biên dịch nguyên văn: HEdu chưa xác định đây là bản ĐỀ hay bản LỜI GIẢI, nên có thể chứa lời giải. Đừng phát cho học sinh khi chưa xem lại.';

export type Tone = 'ok' | 'warn' | 'bad';
/** Câu tóm tắt và mức độ để tô màu; mọi trạng thái không phải thành công đều KHÔNG được hiện như thành công. */
export function summarize(o: CompileOut): { text: string; tone: Tone } {
  switch (o.status) {
    case 'ok': return { text: o.message, tone: o.warnings.length || o.warningCount ? 'warn' : 'ok' };
    case 'no-tex': return { text: o.message, tone: 'bad' };
    case 'no-profile': return { text: o.message, tone: 'warn' };
    case 'cancelled': return { text: o.message, tone: 'warn' };
    default: return { text: o.message, tone: 'bad' };
  }
}

export interface DiagGroup { file: string | null; inProject: boolean; items: Diag[] }

/** Nhóm theo tệp (lỗi trước cảnh báo, theo dòng). Mục không nêu tệp nằm cuối nhóm "Không rõ tệp". */
export function groupDiagnostics(ds: readonly Diag[]): DiagGroup[] {
  const m = new Map<string, DiagGroup>();
  for (const d of ds) {
    const k = d.file ?? '';
    let g = m.get(k);
    if (!g) { g = { file: d.file, inProject: d.inProject, items: [] }; m.set(k, g); }
    g.items.push(d);
  }
  const rank = (d: Diag) => (d.severity === 'error' ? 0 : 1);
  for (const g of m.values()) g.items.sort((a, b) => rank(a) - rank(b) || (a.line ?? 0) - (b.line ?? 0));
  return [...m.values()].sort((a, b) => (a.file === null ? 1 : 0) - (b.file === null ? 1 : 0) || (a.file ?? '').localeCompare(b.file ?? ''));
}

/** Chỉ cho "nhảy tới dòng" khi chắc chắn tệp nằm trong dự án và có số dòng. */
export const canJump = (d: Diag): boolean => d.inProject && !!d.file && d.line !== null && d.line > 0;
