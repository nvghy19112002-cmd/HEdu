// Soạn thảo LaTeX kiểu TeXstudio — phần thuần (không phụ thuộc CodeMirror, kiểm thử bằng Node):
// danh sách lệnh/môi trường hay dùng (kèm ex_test), lệnh/môi trường có sẵn trong tệp, tìm \begin cần tự đóng, khối môi trường để thu gọn.
// Phần gắn vào trình soạn ở texextras.ts.

/** `tpl` theo cú pháp mẫu của CodeMirror: ${1}, ${2}… là ô nhảy bằng Tab, ${0} là chỗ con trỏ cuối. */
export interface TexCmd { name: string; tpl?: string; detail: string }

const c = (name: string, detail: string, tpl?: string): TexCmd => ({ name, detail, ...(tpl ? { tpl } : {}) });

export const TEX_COMMANDS: readonly TexCmd[] = [
  // ex_test (đề trắc nghiệm)
  c('choice', 'ex_test: 4 phương án', '\\choice\n{${1}}\n{${2}}\n{${3}}\n{${4}}'),
  c('choiceTF', 'ex_test: 4 ý đúng/sai', '\\choiceTF\n{${1}}\n{${2}}\n{${3}}\n{${4}}'),
  c('True', 'ex_test: đánh dấu đáp án đúng', '\\True '),
  c('loigiai', 'ex_test: lời giải', '\\loigiai{\n\t${1}\n}'),
  c('shortans', 'ex_test: đáp án trả lời ngắn', '\\shortans{${1}}'),
  c('immini', 'ex_test: chữ trái, hình phải', '\\immini{${1}}{${2}}'),
  c('hoac', 'hoặc (ngoặc vuông)', '\\hoac{${1}\\\\${2}}'),
  c('heva', 'hệ (ngoặc nhọn)', '\\heva{${1}\\\\${2}}'),
  // phân số, căn, mũ
  c('dfrac', 'phân số lớn', '\\dfrac{${1}}{${2}}'),
  c('frac', 'phân số', '\\frac{${1}}{${2}}'),
  c('tfrac', 'phân số nhỏ', '\\tfrac{${1}}{${2}}'),
  c('sqrt', 'căn bậc hai', '\\sqrt{${1}}'),
  c('sqrt[]', 'căn bậc n', '\\sqrt[${1}]{${2}}'),
  c('overline', 'gạch trên', '\\overline{${1}}'),
  c('widehat', 'góc (mũ rộng)', '\\widehat{${1}}'),
  c('overrightarrow', 'vectơ', '\\overrightarrow{${1}}'),
  c('vec', 'vectơ (ngắn)', '\\vec{${1}}'),
  c('left(', 'ngoặc tròn co giãn', '\\left(${1}\\right)'),
  c('left[', 'ngoặc vuông co giãn', '\\left[${1}\\right]'),
  c('left|', 'trị tuyệt đối co giãn', '\\left|${1}\\right|'),
  c('lim', 'giới hạn', '\\lim\\limits_{${1:x \\to +\\infty}} '),
  c('int', 'tích phân', '\\int\\limits_{${1}}^{${2}} ${3}\\,\\mathrm{d}x'),
  c('sum', 'tổng', '\\sum\\limits_{${1}}^{${2}} '),
  c('log', 'lôgarit'), c('ln', 'lôgarit tự nhiên'), c('sin', 'sin'), c('cos', 'cos'), c('tan', 'tan'), c('cot', 'cot'),
  c('infty', '∞'), c('circ', 'độ (°)'), c('pi', 'π'), c('alpha', 'α'), c('beta', 'β'), c('Delta', 'Δ'), c('varphi', 'φ'),
  c('cdot', '·'), c('times', '×'), c('pm', '±'), c('le', '≤'), c('ge', '≥'), c('leq', '≤'), c('geq', '≥'), c('ne', '≠'), c('approx', '≈'),
  c('in', '∈'), c('notin', '∉'), c('subset', '⊂'), c('cup', '∪'), c('cap', '∩'), c('emptyset', '∅'), c('varnothing', '∅'),
  c('mathbb', 'tập số (ℝ, ℕ…)', '\\mathbb{${1:R}}'), c('Rightarrow', '⇒'), c('Leftrightarrow', '⇔'), c('perp', '⊥'), c('parallel', '∥'), c('triangle', 'tam giác'), c('angle', 'góc'),
  c('mathrm', 'chữ đứng trong công thức', '\\mathrm{${1}}'), c('text', 'chữ trong công thức', '\\text{${1}}'),
  // chữ, bố cục
  c('textbf', 'chữ đậm', '\\textbf{${1}}'), c('textit', 'chữ nghiêng', '\\textit{${1}}'), c('underline', 'gạch chân', '\\underline{${1}}'), c('emph', 'nhấn mạnh', '\\emph{${1}}'),
  c('item', 'mục danh sách', '\\item '), c('par', 'xuống đoạn'), c('newpage', 'sang trang'), c('noindent', 'không thụt đầu dòng'), c('hfill', 'đẩy giãn ngang'),
  c('vspace', 'khoảng cách dọc', '\\vspace{${1:6pt}}'), c('hspace', 'khoảng cách ngang', '\\hspace{${1:1cm}}'),
  c('includegraphics', 'chèn ảnh', '\\includegraphics[width=${1:0.5}\\linewidth]{${2}}'),
  c('input', 'chèn tệp', '\\input{${1}}'), c('setcounter', 'đặt số đếm', '\\setcounter{${1:ex}}{${2:0}}'),
  c('begin', 'mở môi trường', '\\begin{${1}}\n\t${0}\n\\end{${1}}'),
  // TikZ
  c('draw', 'TikZ: vẽ', '\\draw ${1}(${2}) -- (${3});'), c('node', 'TikZ: nút chữ', '\\node at (${1}) {${2}};'), c('fill', 'TikZ: tô', '\\fill ${1};'), c('coordinate', 'TikZ: điểm', '\\coordinate (${1}) at (${2});'),
];

export interface TexEnv { name: string; detail: string; /** phần sau \begin{name} (tham số), vd {c|c} */ args?: string }
export const TEX_ENVS: readonly TexEnv[] = [
  { name: 'ex', detail: 'câu hỏi (ex_test)' }, { name: 'center', detail: 'căn giữa' }, { name: 'tikzpicture', detail: 'hình TikZ' },
  { name: 'enumerate', detail: 'danh sách đánh số' }, { name: 'itemize', detail: 'danh sách gạch đầu dòng' }, { name: 'tabular', detail: 'bảng', args: '{|c|c|}' },
  { name: 'align*', detail: 'nhiều dòng công thức' }, { name: 'cases', detail: 'hệ/trường hợp' }, { name: 'array', detail: 'mảng', args: '{ll}' }, { name: 'minipage', detail: 'khung nhỏ', args: '{0.5\\linewidth}' },
  { name: 'multicols', detail: 'nhiều cột', args: '{2}' }, { name: 'tabular*', detail: 'bảng giãn', args: '{\\linewidth}{@{\\extracolsep{\\fill}}cc}' }, { name: 'figure', detail: 'hình nổi' },
];

/** Lệnh xuất hiện trong tệp (kể cả lệnh tự định nghĩa bằng \newcommand/\def), để gợi ý cùng danh sách chuẩn. */
export function docCommands(text: string, limit = 400): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\\([A-Za-z@]{2,})/g)) { out.add(m[1]); if (out.size >= limit) break; }
  return [...out];
}

/** Môi trường đã dùng trong tệp. */
export function docEnvs(text: string, limit = 100): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\\begin\{([A-Za-z*@]+)\}/g)) { out.add(m[1]); if (out.size >= limit) break; }
  return [...out];
}

/** Dòng (tính tới con trỏ) kết thúc bằng \begin{name}[…]{…} ⇒ tên môi trường; còn không ⇒ null. Bỏ qua dòng là chú thích. */
export function beginAtEnd(lineBefore: string): string | null {
  const m = /\\begin\{([A-Za-z*@]+)\}(?:\[[^\]\n]*\]|\{[^{}\n]*\})*\s*$/.exec(lineBefore);
  if (!m) return null;
  const pct = lineBefore.slice(0, m.index).search(/(?<!\\)%/);
  return pct >= 0 ? null : m[1];
}

/** Môi trường `name` trong cả tệp còn thiếu \end (số \begin nhiều hơn số \end, không tính dòng chú thích) ⇒ cần tự thêm \end. */
export function needsEnd(doc: string, name: string): boolean {
  const esc = name.replace(/[*]/g, '\\*');
  const strip = doc.split('\n').map((l) => { const i = l.search(/(?<!\\)%/); return i >= 0 ? l.slice(0, i) : l; }).join('\n');
  const b = strip.match(new RegExp(`\\\\begin\\{${esc}\\}`, 'g'))?.length ?? 0;
  const e = strip.match(new RegExp(`\\\\end\\{${esc}\\}`, 'g'))?.length ?? 0;
  return b > e;
}

/**
 * Khối môi trường để thu gọn: dòng `from` có \begin{name} ⇒ số dòng có \end{name} khớp (tính lồng nhau cùng tên), hoặc null.
 * `lines` là các dòng của tệp (đánh số từ 0).
 */
export function envBlock(lines: readonly string[], from: number): { name: string; end: number } | null {
  const m = /\\begin\{([A-Za-z*@]+)\}/.exec(lines[from] ?? '');
  if (!m) return null;
  const name = m[1];
  const tag = new RegExp(`\\\\(begin|end)\\{${name.replace(/[*]/g, '\\*')}\\}`, 'g');
  let depth = 0;
  for (let i = from; i < lines.length && i < from + 5000; i++) {
    const l = lines[i];
    const cut = l.search(/(?<!\\)%/);
    const code = cut >= 0 ? l.slice(0, cut) : l;
    for (const t of code.slice(i === from ? m.index : 0).matchAll(tag)) {
      depth += t[1] === 'begin' ? 1 : -1;
      if (depth === 0) return i === from ? null : { name, end: i };
    }
  }
  return null;
}

/**
 * Ctrl+T như TeXstudio: mọi dòng (có chữ) đều đã bắt đầu bằng % (sau khoảng trắng) ⇒ bỏ một dấu %; ngược lại thêm % ở ĐẦU mỗi dòng có chữ.
 * Dòng trống giữ nguyên.
 */
export function toggleCommentLines(lines: readonly string[]): string[] {
  const filled = lines.filter((l) => l.trim());
  if (filled.length && filled.every((l) => /^\s*%/.test(l))) return uncommentLines(lines);
  return lines.map((l) => (l.trim() ? `%${l}` : l));
}

/** Ctrl+U: bỏ một dấu % đầu dòng (sau khoảng trắng) ở các dòng đang chú thích. */
export const uncommentLines = (lines: readonly string[]): string[] => lines.map((l) => l.replace(/^(\s*)%/, '$1'));

/** Môi trường gần nhất còn mở tính tới con trỏ (Alt+Enter đóng nó, như TeXstudio); không có ⇒ null. Bỏ qua phần chú thích. */
export function lastOpenEnv(before: string): string | null {
  const stack: string[] = [];
  for (const raw of before.split('\n')) {
    const cut = raw.search(/(?<!\\)%/);
    const line = cut >= 0 ? raw.slice(0, cut) : raw;
    for (const m of line.matchAll(/\\(begin|end)\{([A-Za-z*@]+)\}/g)) {
      if (m[1] === 'begin') stack.push(m[2]);
      else { const i = stack.lastIndexOf(m[2]); if (i >= 0) stack.splice(i, 1); }
    }
  }
  return stack.at(-1) ?? null;
}
