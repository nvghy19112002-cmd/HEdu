// Chuẩn bị mã đề trước khi gửi Pandoc xuất Word (thuần, có kiểm thử): bỏ các dòng khai báo riêng của đề và thay mỗi hình TikZ
// bằng một lệnh chèn ảnh PNG (Pandoc không đọc được TikZ; giao diện dịch từng hình ra PNG rồi gửi sang).

export interface WordFig { name: string; /** mã TikZ nguyên văn của hình */ code: string }

const DEF_LINE = /^\\def\\(made|socau[a-z]*)\b.*$/;

/** Vị trí idx có nằm sau một dấu % chưa bị thoát trong cùng dòng không (đang là chú thích). */
function inComment(src: string, idx: number): boolean {
  const ls = src.lastIndexOf('\n', idx - 1) + 1;
  for (let i = ls; i < idx; i++) {
    if (src[i] === '\\') { i++; continue; }
    if (src[i] === '%') return true;
  }
  return false;
}

export function prepareBody(tex: string): { body: string; figs: WordFig[] } {
  const lines = tex.replace(/\r\n?/g, '\n').split('\n').filter((l) => !DEF_LINE.test(l.trim()));
  const src = lines.join('\n');
  const figs: WordFig[] = [];
  let out = '';
  let last = 0;
  const re = /\\begin\{tikzpicture\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (inComment(src, m.index)) continue;
    const endTag = '\\end{tikzpicture}';
    const e = src.indexOf(endTag, m.index);
    if (e < 0) break;
    const end = e + endTag.length;
    const n = figs.length + 1;
    figs.push({ name: `wfig${n}.png`, code: src.slice(m.index, end) });
    out += src.slice(last, m.index) + `\\includegraphics[width=@@W${n}@@]{wfig${n}.png}`;
    last = end;
    re.lastIndex = end;
  }
  return { body: out + src.slice(last), figs };
}

/** Điền chiều rộng thật (cm) của từng hình sau khi đã dịch ra PNG. */
export function fillWidths(body: string, widthsCm: readonly number[]): string {
  return body.replace(/@@W(\d+)@@/g, (_m, n: string) => `${(widthsCm[Number(n) - 1] ?? 6).toFixed(2)}cm`);
}

// ---------- cảnh báo lệnh Word sẽ bỏ qua ----------
// Pandoc bỏ lặng lẽ các lệnh LaTeX nó không biết (ngoài công thức). Ta quét trước để báo tên lệnh cho thầy cô.
const KNOWN = new Set(('made begin end item choice choiceTF shortans loigiai True immini heva hoac caulc cauds caukq cautl zlabel mbox name textbf textit emph underline text textrm textsf texttt ' +
  'includegraphics par newline linebreak noindent quad qquad hfill centering label ref cite footnote textsubscript textsuperscript ' +
  'dots ldots hline cline multicolumn multirow tiny small footnotesize large Large indent bigskip medskip smallskip hspace vspace newpage clearpage pagebreak ' +
  'ensuremath dfrac tfrac frac sqrt color textcolor').split(/\s+/));

function stripMath(s: string): string {
  return s
    .replace(/\\begin\{(equation\*?|align\*?|gather\*?|multline\*?|eqnarray\*?|displaymath|math)\}[\s\S]*?\\end\{\1\}/g, ' ')
    .replace(/\\\[[\s\S]*?\\\]/g, ' ')
    .replace(/\\\([\s\S]*?\\\)/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$(?:\\.|[^$\\])*\$/g, ' ');
}

/** Tên các lệnh ngoài công thức mà Word sẽ bỏ qua (không có trong danh sách đã biết). Bỏ dòng chú thích. */
export function strangeCommands(body: string): string[] {
  const noComments = body.split('\n').map((l) => {
    for (let i = 0; i < l.length; i++) { if (l[i] === '\\') { i++; continue; } if (l[i] === '%') return l.slice(0, i); }
    return l;
  }).join('\n');
  const set = new Set<string>();
  for (const m of stripMath(noComments).matchAll(/\\([A-Za-z]+)/g)) if (!KNOWN.has(m[1])) set.add(m[1]);
  return [...set].sort();
}
