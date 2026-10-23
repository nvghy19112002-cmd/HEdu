// Suy ra "câu có hình hay không" bằng phân tích tĩnh mã LaTeX (KHÔNG biên dịch TikZ, KHÔNG lưu vào dữ liệu).
// Ba trạng thái: có / không / chưa xác định. "Chưa xác định" không bao giờ được gộp vào "không".
// Chỉ xét phần học sinh nhìn thấy: mọi thứ TRƯỚC \loigiai đầu tiên (đề, nhóm hình của \immini, phương án, phần đuôi).
import { readGroup, stripComments } from './extest';

export type FigureState = 'yes' | 'no' | 'unknown';

/** Dấu hiệu chắc chắn là hình. Bảng biến thiên tkz-tab nằm trong tikzpicture nên được tính là hình. */
const MARK = /\\begin\{(?:tikzpicture|tikzcd|circuitikz|pspicture|picture|asy|axis|figure\*?|wrapfigure)\}|\\tikz(?![A-Za-z])|\\(?:includegraphics|includesvg|includepdf|epsfig|psfig)(?![A-Za-z])/g;
/** Lệnh tự định nghĩa: \newcommand{\ten}[n]{…}, \renewcommand, \providecommand, \def\ten#1{…} */
const DEF = /\\(?:(?:re|provide)?newcommand\*?\s*\{?\s*(\\[A-Za-z]+)\s*\}?|def\s*(\\[A-Za-z]+))/g;
/** Tên lệnh gợi ý là hình nhưng không thấy mã hình ở trong câu. */
const FIGLIKE = /\\(?:hinh|hinhve|dothi|bbt|figure|fig|picture|graphic|anh|img|hv)[A-Za-z0-9]*(?![A-Za-z])/i;
const EXTERNAL = /\\(?:input|include|import|subfile)(?![A-Za-z])/;

function questionPart(text: string): string {
  const m = /\\loigiai(?![A-Za-z])/.exec(text);
  return m ? text.slice(0, m.index) : text;
}

function braceBalanced(s: string): boolean {
  let d = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { i++; continue; }
    if (c === '{') d++;
    else if (c === '}') { d--; if (d < 0) return false; }
  }
  return d === 0;
}

export function figureState(latex: string): FigureState {
  if (!latex || latex.indexOf('\\') < 0) return 'no';
  const full = stripComments(latex).text;
  const q = questionPart(full);

  // 1. Khai báo lệnh mà thân có chứa mã hình: dấu hiệu bên trong thân chưa phải là hình hiện ra.
  const figMacros: { name: string; from: number; to: number }[] = [];
  DEF.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DEF.exec(q))) {
    let i = m.index + m[0].length;
    // bỏ qua tham số [n] / #1#2 rồi đọc nhóm thân
    while (i < q.length && /[\s\[\]0-9#]/.test(q[i])) i++;
    const g = readGroup(q, i);
    if (!g) continue;
    MARK.lastIndex = 0;
    if (MARK.test(g[0])) figMacros.push({ name: m[1] || m[2], from: m.index, to: g[1] });
    DEF.lastIndex = Math.max(DEF.lastIndex, g[1]);
  }
  const inDef = (p: number) => figMacros.some((r) => p >= r.from && p < r.to);

  // 2. Dấu hiệu hình nằm ngoài thân định nghĩa ⇒ có.
  MARK.lastIndex = 0;
  while ((m = MARK.exec(q))) if (!inDef(m.index)) return 'yes';

  // 3. Gọi lệnh đã định nghĩa chứa hình ⇒ có.
  for (const r of figMacros) {
    const re = new RegExp(r.name.replace(/\\/g, '\\\\') + '(?![A-Za-z])', 'g');
    while ((m = re.exec(q))) if (m.index < r.from || m.index >= r.to) return 'yes';
  }

  // 4. Không thấy mã hình, nhưng còn dấu hiệu có thể là hình ẩn ⇒ chưa xác định.
  if (!braceBalanced(q)) return 'unknown';
  if (EXTERNAL.test(q)) return 'unknown';
  const fl = FIGLIKE.exec(q);
  if (fl && !figMacros.some((r) => r.name === fl[0])) return 'unknown';
  return 'no';
}

// Bộ nhớ đệm theo uid: chỉ tính lại khi nội dung đổi.
const cache = new Map<string, { latex: string; v: FigureState }>();
export function figureOf(q: { uid: string; latex: string }): FigureState {
  const c = cache.get(q.uid);
  if (c && c.latex === q.latex) return c.v;
  const v = figureState(q.latex);
  cache.set(q.uid, { latex: q.latex, v });
  return v;
}
export function _resetFigureCache() { cache.clear(); }

export type FigureFilter = 'all' | 'yes' | 'no' | 'unknown';
export const FIGURE_LABEL: Record<FigureFilter, string> = { all: 'Tất cả', yes: 'Có hình', no: 'Không hình', unknown: 'Chưa xác định' };
