// Word giống mẫu in: các phần trang trí của mẫu HyMath (khung tiêu đề + ô thí sinh, dải PHẦN, đầu/chân trang) được biên dịch
// bằng CHÍNH mẫu TeX rồi đặt vào Word thành ảnh nét cao, nên nhìn y như PDF. Câu hỏi, phương án, công thức vẫn là chữ/Equation sửa được.
// Tệp này phần thuần (có kiểm thử): tìm lệnh tiêu đề, các dòng PHẦN, dựng tài liệu "trang trí", cắt khoảng trắng của ảnh.
import { HYMATH_THEMES } from './hymath.template';
import { themeOf } from './examtheme';

/** Đọc `n` nhóm {…} liền sau vị trí `i` (bỏ khoảng trắng giữa các nhóm). null nếu thiếu hoặc ngoặc lệch. */
export function braceArgs(s: string, i: number, n: number): { args: string[]; end: number } | null {
  const args: string[] = [];
  let p = i;
  for (let k = 0; k < n; k++) {
    while (p < s.length && /\s/.test(s[p])) p++;
    if (s[p] !== '{') return null;
    let depth = 0;
    const start = p;
    for (; p < s.length; p++) {
      const c = s[p];
      if (c === '\\') { p++; continue; }
      if (c === '{') depth++;
      else if (c === '}' && --depth === 0) break;
    }
    if (depth !== 0) return null;
    args.push(s.slice(start + 1, p));
    p++;
  }
  return { args, end: p };
}

/** Bỏ chú thích % (giữ \%) để không bắt nhầm lệnh nằm trong dòng chú thích. */
export const stripComments = (s: string): string => s.split('\n').map((l) => l.replace(/(^|[^\\])%.*$/, '$1')).join('\n');

export interface ExamTitle { raw: string; kind: 'so' | 'thi'; school: string; exam: string; subject: string; code: string }

/** Lệnh tiêu đề đầu tiên của tệp đề: \TieuDeDeSo{Trường}{Kỳ thi}{Môn}{Thời gian}{Mã} hoặc \TieuDeDeThi{Sở}{Trường}{Kỳ thi}{Môn}{Phút}{Mã}. */
export function findTitle(tex: string): ExamTitle | null {
  const s = stripComments(tex);
  const m = /\\TieuDeDe(So|Thi)(?![A-Za-z])/.exec(s);
  if (!m) return null;
  const so = m[1] === 'So';
  const r = braceArgs(s, m.index + m[0].length, so ? 5 : 6);
  if (!r) return null;
  const a = r.args;
  return so
    ? { raw: s.slice(m.index, r.end), kind: 'so', school: a[0], exam: a[1], subject: a[2], code: a[4].trim() }
    : { raw: s.slice(m.index, r.end), kind: 'thi', school: `${a[0]} ${a[1]}`, exam: a[2], subject: a[3], code: a[5].trim() };
}

/** Các dòng tiêu đề phần viết dạng \textbf{PHẦN …}, theo thứ tự trong tệp (mẫu HyMath tự dựng thành dải màu). */
export function findParts(tex: string): string[] {
  const s = stripComments(tex);
  const out: string[] = [];
  const re = /\\textbf(?![A-Za-z])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const r = braceArgs(s, m.index + m[0].length, 1);
    if (!r) continue;
    if (/^\s*PHẦN(?![\p{L}])/u.test(r.args[0].normalize('NFC'))) out.push(s.slice(m.index, r.end));
    re.lastIndex = r.end;
  }
  return out;
}

/** Tài liệu "trang trí": mỗi phần một trang, không đầu/chân trang; trang cuối chỉ có đầu/chân trang bên trái (bỏ vạch kẻ, bỏ số trang). */
export function decorBody(title: ExamTitle | null, parts: readonly string[]): string {
  const pages: string[] = ['\\pagestyle{empty}'];
  if (title) pages.push(`${title.raw}\\par\\newpage`);
  for (const p of parts) pages.push(`\\noindent${p}\\par\\newpage`);
  pages.push('\\fancyhead[R]{}\\fancyfoot[R]{}\\renewcommand{\\headrule}{}\\renewcommand{\\footrule}{}\\thispagestyle{fancy}\\null\\newpage');
  return pages.join('\n') + '\n';
}

/** Màu nhấn của mẫu (ThemeBase trong tệp mẫu), dạng RRGGBB. Bản in đen trắng dùng đen. */
export function themeAccent(themeId: string, print = false): string {
  if (print) return '000000';
  const t = themeOf(themeId);
  const tex = HYMATH_THEMES.find((x) => x.file === t.file)?.tex ?? '';
  return /\\definecolor\{ThemeBase\}\{HTML\}\{([0-9A-Fa-f]{6})\}/.exec(tex)?.[1].toUpperCase() ?? '1F55A4';
}

export interface Box { x: number; y: number; w: number; h: number }

/** Khung bao các điểm ảnh không trắng trong vùng [y0, y1) (ảnh RGBA rộng `w`). null nếu toàn trắng. */
export function inkBox(px: Uint8ClampedArray, w: number, y0: number, y1: number, x0 = 0, x1 = w): Box | null {
  let minX = x1, minY = y1, maxX = -1, maxY = -1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      if (px[i + 3] > 10 && (px[i] < 245 || px[i + 1] < 245 || px[i + 2] < 245)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
