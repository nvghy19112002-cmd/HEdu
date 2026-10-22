// Chuyển đoạn văn bản LaTeX (chữ xen công thức) thành HTML để xem trước.
// Công thức dùng KaTeX. Hình TikZ chưa vẽ được trong trình duyệt: hiện khung
// giữ chỗ; bản Windows sẽ biên dịch thật bằng LaTeX.
import katex from 'katex';
import { extractDefs, type ParsedQuestion } from './extest';
import { renderFlow, type FigMeta } from './textflow';

export const MACROS: Record<string, string> = {
  '\\R': '\\mathbb{R}',
  '\\N': '\\mathbb{N}',
  '\\Z': '\\mathbb{Z}',
  '\\Q': '\\mathbb{Q}',
  '\\heva': '\\left\\{\\begin{aligned}#1\\end{aligned}\\right.',
  '\\hoac': '\\left[\\begin{aligned}#1\\end{aligned}\\right.',
  '\\vec': '\\overrightarrow{#1}',
  '\\True': '',
  // Vài lệnh chỉ có nghĩa khi in bằng LaTeX; trong công thức thì coi như khoảng trắng,
  // nếu không KaTeX báo "Undefined control sequence" và cả câu không xem trước được.
  '\\hfill': '\\;',
  '\\noindent': '',
  '\\medskip': '',
  '\\smallskip': '',
  '\\bigskip': '',
  '\\vspace': '',
  '\\hspace': '\\;',
};

/** KaTeX báo "No character metrics" cho mọi chữ tiếng Việt trong \text{…}.
 *  Chữ vẫn hiện đúng, chỉ là cảnh báo, nên tắt tiếng để bảng điều khiển không bị ngập
 *  và để cảnh báo thật của app dễ thấy. */
export function quietly<T>(fn: () => T): T {
  const warn = console.warn;
  console.warn = () => {};
  try { return fn(); } finally { console.warn = warn; }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderMath(tex: string, display: boolean): string {
  try {
    return quietly(() => katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: false, macros: { ...MACROS }, output: 'html' }));
  } catch {
    return `<code class="math-err">${esc(tex)}</code>`;
  }
}

const TIKZ_RE = /\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g;

/** Dọn mã chỉ dùng cho bản in trước khi vẽ lên màn hình. */
export function cleanForDisplay(src: string): string {
  // \immini{…}{…}, \lq, \rq… do bộ dựng chữ (textflow.ts) xử lý theo cấu trúc, nên ở đây chỉ bỏ khai báo.
  return extractDefs(src).text.replace(/\\colon\b/g, ':');
}

function figureLabel(code: string): string {
  if (/\\tkzTab/.test(code)) return 'Bảng biến thiên (tkz-tab)';
  if (/tdplot/.test(code)) return 'Hình không gian (tikz-3dplot)';
  return 'Hình vẽ TikZ';
}

/** Một mẩu của đoạn LaTeX: chữ thường hoặc công thức. */
export interface Seg { kind: 'text' | 'math'; value: string; display: boolean }

/** Tách đoạn LaTeX thành chữ và công thức ($…$, $$…$$, \(…\), \[…\]). */
export function segments(src: string): Seg[] {
  const out: Seg[] = [];
  let buf = '';
  let i = 0;
  const flush = () => { if (buf) { out.push({ kind: 'text', value: buf, display: false }); buf = ''; } };
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\' && src[i + 1] === '$') { buf += '$'; i += 2; continue; }
    if (ch === '$') {
      const display = src[i + 1] === '$';
      const open = display ? 2 : 1;
      const close = display ? src.indexOf('$$', i + 2) : findDollar(src, i + 1);
      if (close < 0) { buf += src.slice(i); break; }
      flush();
      out.push({ kind: 'math', value: src.slice(i + open, close), display });
      i = close + open;
      continue;
    }
    if (ch === '\\' && (src[i + 1] === '(' || src[i + 1] === '[')) {
      const display = src[i + 1] === '[';
      const end = src.indexOf(display ? '\\]' : '\\)', i + 2);
      if (end < 0) { buf += src.slice(i); break; }
      flush();
      out.push({ kind: 'math', value: src.slice(i + 2, end), display });
      i = end + 2;
      continue;
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

/** Thay mỗi hình TikZ bằng một dấu hiệu để xử lý riêng. */
export function maskFigures(src: string): { text: string; figures: string[] } {
  const figures: string[] = [];
  const text = cleanForDisplay(src).replace(TIKZ_RE, (m) => {
    figures.push(m);
    return `\u0000FIG${figures.length - 1}\u0000`;
  });
  return { text, figures };
}

export { figureLabel };

/** Một mảnh để vẽ: đoạn HTML đã dựng, hình TikZ cần biên dịch riêng, hoặc dấu mở/đóng một khối bố cục. */
export type Part =
  | { kind: 'html'; html: string }
  | { kind: 'figure'; code: string; label: string; size?: FigMeta }
  | { kind: 'open'; cls: string }
  | { kind: 'close' };

const hooks = { renderMath, findDollar: (s: string, from: number) => findDollar(s, from) };

export interface PartsResult { parts: Part[]; unsupported: string[]; figures: number }

/** Tách đoạn LaTeX thành các mảnh chữ, hình và khối bố cục, kèm danh sách lệnh chưa dựng được. */
export function renderPartsEx(src: string): PartsResult {
  if (!src) return { parts: [], unsupported: [], figures: 0 };
  const { text, figures } = maskFigures(src);
  const flow = renderFlow(text, hooks);
  const out: Part[] = [];
  const re = /\u0000FIG(\d+)\u0000|\u0002O:([^\u0003]*)\u0003|\u0002C\u0003/g;
  let last = 0;
  let nFig = 0;
  let m: RegExpExecArray | null;
  const html = (h: string) => { if (h.trim() || h.includes('<br') || h.includes('tx-hs')) out.push({ kind: 'html', html: h }); };
  while ((m = re.exec(flow.html))) {
    html(flow.html.slice(last, m.index));
    last = re.lastIndex;
    if (m[1] != null) {
      const code = figures[Number(m[1])] ?? '';
      out.push({ kind: 'figure', code, label: figureLabel(code), size: flow.meta[Number(m[1])] });
      nFig++;
    } else if (m[2] != null) out.push({ kind: 'open', cls: m[2] });
    else out.push({ kind: 'close' });
  }
  const tail = flow.html.slice(last);
  html(tail);
  if (!out.length) out.push({ kind: 'html', html: tail });
  return { parts: out, unsupported: flow.unsupported, figures: nFig };
}

export function renderParts(src: string): Part[] {
  return renderPartsEx(src).parts;
}

/** HTML thuần (không có hình thật): dùng cho thử nghiệm và nơi không chạy được TeX. */
export function renderLatexText(src: string): string {
  if (!src) return '';
  const { text, figures } = maskFigures(src);
  const flow = renderFlow(text, hooks);
  return flow.html
    .replace(/\u0002O:([^\u0003]*)\u0003/g, '<div class="$1">')
    .replace(/\u0002C\u0003/g, '</div>')
    .replace(/\u0000FIG(\d+)\u0000/g, (_, k) => {
      const label = figureLabel(figures[Number(k)]);
      return `<span class="fig-ph" role="img" aria-label="${label}"><span class="fig-ph-t">${label}</span><span class="fig-ph-s">Biên dịch khi chạy bản cài trên Windows</span></span>`;
    });
}

function findDollar(s: string, from: number): number {
  for (let j = from; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue; }
    if (s[j] === '$') return j;
  }
  return -1;
}

const countTikz = (s: string) => (s.match(/\\begin\{tikzpicture\}/g) ?? []).length;

/**
 * Những chỗ bản xem trước CHƯA dựng chuẩn một câu: lệnh chưa hiểu, hoặc số hình hiện ra
 * khác số hình có trong mã. Rỗng nghĩa là xem trước đã dựng đủ (chưa phải đã biên dịch bằng TeX).
 */
export function previewProblems(p: ParsedQuestion, raw?: string): string[] {
  const pieces = [p.stem, p.figure ?? '', ...p.options.map((o) => o.text), p.solution ?? '', p.tail ?? '', p.shortAnswer ?? ''];
  const unsup = new Set<string>();
  let shown = 0;
  for (const piece of pieces) {
    if (!piece) continue;
    const r = renderPartsEx(piece);
    r.unsupported.forEach((u) => unsup.add(u));
    shown += r.figures;
  }
  const out: string[] = [];
  if (unsup.size) out.push(`Chưa hiểu: ${[...unsup].slice(0, 6).join(', ')}${unsup.size > 6 ? '…' : ''}.`);
  const want = countTikz(raw ?? pieces.join('\n')) - countTikz(p.defs ?? '') ;
  const total = raw != null ? countTikz(raw) - countTikz(p.defs ?? '') : want;
  if (shown !== total) out.push(`Hiện ${shown}/${total} hình trong mã.`);
  return out;
}
