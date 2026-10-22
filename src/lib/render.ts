// Chuyển đoạn văn bản LaTeX (chữ xen công thức) thành HTML để xem trước.
// Công thức dùng KaTeX. Hình TikZ chưa vẽ được trong trình duyệt: hiện khung
// giữ chỗ; bản Windows sẽ biên dịch thật bằng LaTeX.
import katex from 'katex';
import { extractDefs, unwrapImmini } from './extest';

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
  return unwrapImmini(extractDefs(src).text).text
    .replace(/\\lq\\lq\s*/g, '\u201C')
    .replace(/\\rq\\rq/g, '\u201D')
    .replace(/\\colon\b/g, ':');
}

function figureLabel(code: string): string {
  if (/\\tkzTab/.test(code)) return 'Bảng biến thiên (tkz-tab)';
  if (/tdplot/.test(code)) return 'Hình không gian (tikz-3dplot)';
  return 'Hình vẽ TikZ';
}

/** Xử lý phần chữ (ngoài công thức): vài lệnh định dạng thường gặp */
function renderTextPart(t: string): string {
  let s = esc(t);
  s = s.replace(/\\(begin|end)\{(center|enumerate|itemize|flushleft|flushright)\}/g, '');
  s = s.replace(/\\item\s*/g, '<br>• ');
  s = s.replace(/\\textbf\{([^{}]*)\}/g, '<b>$1</b>');
  s = s.replace(/\\(textit|emph)\{([^{}]*)\}/g, '<i>$2</i>');
  s = s.replace(/\\underline\{([^{}]*)\}/g, '<u>$1</u>');
  s = s.replace(/\\\\(\[[^\]]*\])?/g, '<br>');
  s = s.replace(/\\(newline|par)\b/g, '<br>');
  s = s.replace(/\n\s*\n/g, '<br>');
  s = s.replace(/~/g, '&nbsp;');
  s = s.replace(/\\(%|&|#|_)/g, '$1');
  s = s.replace(/\\(hfill|noindent|centering|medskip|bigskip|smallskip)\b/g, ' ');
  return s;
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

export function renderLatexText(src: string): string {
  if (!src) return '';
  const { text, figures } = maskFigures(src);
  let out = '';
  for (const seg of segments(text)) {
    out += seg.kind === 'math' ? renderMath(seg.value, seg.display) : renderTextPart(seg.value);
  }
  return out.replace(/\u0000FIG(\d+)\u0000/g, (_, k) => {
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
