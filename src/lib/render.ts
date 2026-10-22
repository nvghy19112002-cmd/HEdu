// Chuyển đoạn văn bản LaTeX (chữ xen công thức) thành HTML để xem trước.
// Công thức dùng KaTeX. Hình TikZ chưa vẽ được trong trình duyệt: hiện khung
// giữ chỗ; bản Windows sẽ biên dịch thật bằng LaTeX.
import katex from 'katex';

const MACROS: Record<string, string> = {
  '\\R': '\\mathbb{R}',
  '\\N': '\\mathbb{N}',
  '\\Z': '\\mathbb{Z}',
  '\\Q': '\\mathbb{Q}',
  '\\heva': '\\left\\{\\begin{aligned}#1\\end{aligned}\\right.',
  '\\hoac': '\\left[\\begin{aligned}#1\\end{aligned}\\right.',
  '\\vec': '\\overrightarrow{#1}',
  '\\True': '',
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderMath(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: false, macros: { ...MACROS }, output: 'html' });
  } catch {
    return `<code class="math-err">${esc(tex)}</code>`;
  }
}

const TIKZ_RE = /\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g;

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

/** Tách công thức $…$, $$…$$, \(…\), \[…\] khỏi chữ */
export function renderLatexText(src: string): string {
  if (!src) return '';
  const figures: string[] = [];
  const text = src.replace(TIKZ_RE, (m) => {
    figures.push(m);
    return `\u0000FIG${figures.length - 1}\u0000`;
  });

  let out = '';
  let i = 0;
  let buf = '';
  const flush = () => { if (buf) { out += renderTextPart(buf); buf = ''; } };
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\' && (text[i + 1] === '$')) { buf += '$'; i += 2; continue; }
    if (ch === '$') {
      const display = text[i + 1] === '$';
      const open = display ? 2 : 1;
      const close = display ? text.indexOf('$$', i + 2) : findDollar(text, i + 1);
      if (close < 0) { buf += text.slice(i); break; }
      flush();
      out += renderMath(text.slice(i + open, close), display);
      i = close + open;
      continue;
    }
    if (ch === '\\' && (text[i + 1] === '(' || text[i + 1] === '[')) {
      const display = text[i + 1] === '[';
      const end = text.indexOf(display ? '\\]' : '\\)', i + 2);
      if (end < 0) { buf += text.slice(i); break; }
      flush();
      out += renderMath(text.slice(i + 2, end), display);
      i = end + 2;
      continue;
    }
    buf += ch;
    i++;
  }
  flush();

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
