// Đọc các khai báo gói LaTeX trong file .tex (Issue #1, giai đoạn P1).
// Chỉ ĐỌC: không sửa, không bỏ gì khỏi mã gốc. Kết quả dùng để hỏi TeX Live "máy có tệp này không".
//
// Cố ý bỏ qua: dòng chú thích (%), \begin{verbatim}…\end{verbatim}, \verb|…|, để khỏi báo nhầm
// một dòng \usepackage đã bị tắt hoặc chỉ được nhắc tới trong ví dụ.

export type DeclKind = 'package' | 'class' | 'tikzlib' | 'pgfplotslib' | 'input';

export interface Decl {
  kind: DeclKind;
  /** tên người dùng viết, ví dụ tikz-3dplot */
  name: string;
  /** tệp cần tìm bằng kpsewhich, ví dụ tikz-3dplot.sty */
  file: string;
  options?: string;
}

const KIND_LABEL: Record<DeclKind, string> = {
  package: 'gói',
  class: 'lớp tài liệu',
  tikzlib: 'thư viện TikZ',
  pgfplotslib: 'thư viện pgfplots',
  input: 'tệp ngoài',
};
export const kindLabel = (k: DeclKind) => KIND_LABEL[k];

/** Thay phần không phải mã (chú thích, verbatim) bằng khoảng trắng, giữ nguyên độ dài và xuống dòng. */
export function maskNonCode(src: string): string {
  const blank = (s: string) => s.replace(/[^\n]/g, ' ');
  let t = src.replace(/\\begin\{(verbatim\*?|lstlisting|minted|Verbatim)\}[\s\S]*?\\end\{\1\}/g, (m) => blank(m));
  t = t.replace(/\\verb\*?(.)[^\n]*?\1/g, (m) => blank(m));
  return t
    .split('\n')
    .map((line) => {
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '\\') { i++; continue; }
        if (line[i] === '%') return line.slice(0, i) + ' '.repeat(line.length - i);
      }
      return line;
    })
    .join('\n');
}

const names = (s: string) => s.split(',').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);

/** Tệp cần có cho từng loại khai báo. */
export function fileOf(kind: DeclKind, name: string): string {
  switch (kind) {
    case 'package': return `${name}.sty`;
    case 'class': return `${name}.cls`;
    case 'tikzlib': return `tikzlibrary${name}.code.tex`;
    case 'pgfplotslib': return `pgfplotslibrary${name}.code.tex`;
    case 'input': return /\.[A-Za-z0-9]+$/.test(name) ? name : `${name}.tex`;
  }
}

/** Lấy mọi khai báo gói trong một đoạn mã (đã bỏ chú thích). Mỗi (loại, tên) chỉ trả một lần. */
export function extractDecls(src: string): Decl[] {
  const text = maskNonCode(src);
  const out: Decl[] = [];
  const seen = new Set<string>();
  const add = (kind: DeclKind, name: string, options?: string) => {
    const key = kind + '\u0000' + name;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, name, file: fileOf(kind, name), ...(options ? { options } : {}) });
  };
  const re = /\\(usepackage|RequirePackage|documentclass|LoadClass|usetikzlibrary|usepgfplotslibrary|input|include)\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const [, cmd, opt, arg] = m;
    if (cmd === 'usepackage' || cmd === 'RequirePackage') names(arg).forEach((n) => add('package', n, opt?.trim()));
    else if (cmd === 'documentclass' || cmd === 'LoadClass') names(arg).forEach((n) => add('class', n, opt?.trim()));
    else if (cmd === 'usetikzlibrary') names(arg).forEach((n) => add('tikzlib', n));
    else if (cmd === 'usepgfplotslibrary') names(arg).forEach((n) => add('pgfplotslib', n));
    else {
      // \input{tệp} / \include{tệp}: tên có thể chứa đường dẫn; bỏ qua nếu là macro (\jobname…)
      const n = arg.trim();
      if (n && !n.includes('\\')) add('input', n);
    }
  }
  return out;
}

/** Phần nằm NGOÀI các khối \begin{ex}…\end{ex}: đầu file, và mọi thứ chen giữa các câu. */
export function outsideEx(src: string): string {
  return src.replace(/\\begin\{ex\}[\s\S]*?\\end\{ex\}/g, '\n');
}

/**
 * Bằng chứng "câu này cần gói X" dựa trên lệnh được dùng. Chỉ liệt kê những lệnh đặc trưng,
 * không thể nhầm sang gói khác; lệnh nào không có trong bảng thì HEdu không đoán.
 */
const EVIDENCE: { re: RegExp; pkg: string; why: string }[] = [
  { re: /\\tkzTab[A-Za-z]*|\\begin\{tkzTab/, pkg: 'tkz-tab', why: 'dùng lệnh \\tkzTab… (bảng biến thiên)' },
  { re: /\\tdplot[A-Za-z]*/, pkg: 'tikz-3dplot', why: 'dùng lệnh \\tdplot… (hình không gian)' },
  { re: /\\begin\{axis\}|\\addplot\b/, pkg: 'pgfplots', why: 'dùng môi trường axis / \\addplot (đồ thị)' },
  { re: /\\tkz(?!Tab)[A-Z][A-Za-z]*/, pkg: 'tkz-euclide', why: 'dùng lệnh \\tkz… (hình học)' },
  { re: /\\includegraphics\b/, pkg: 'graphicx', why: 'dùng \\includegraphics' },
  { re: /\\resizebox\b|\\scalebox\b|\\rotatebox\b/, pkg: 'graphicx', why: 'dùng \\resizebox / \\scalebox' },
  { re: /\\(?:definecolor|textcolor|colorbox)\b/, pkg: 'xcolor', why: 'dùng lệnh màu (\\definecolor, \\textcolor…)' },
  { re: /\\begin\{tikzpicture\}/, pkg: 'tikz', why: 'có hình tikzpicture' },
  // gói hay gặp trong đề Toán / Lý / Hoá: lệnh đặc trưng, không trùng gói khác
  { re: /\\(?:SI|si|qty|unit|num|ang)\s*\{/, pkg: 'siunitx', why: 'dùng lệnh đơn vị \\SI / \\num… (siunitx)' },
  { re: /\\[bx]?cancel\s*\{/, pkg: 'cancel', why: 'dùng \\cancel (gạch chéo rút gọn)' },
  { re: /\\ce\s*\{/, pkg: 'mhchem', why: 'dùng \\ce (công thức hoá học)' },
  { re: /\\begin\{tikzcd\}/, pkg: 'tikz-cd', why: 'dùng môi trường tikzcd' },
  { re: /\\begin\{circuitikz\}/, pkg: 'circuitikz', why: 'dùng môi trường circuitikz (mạch điện)' },
  { re: /\\multirow\s*[{[]/, pkg: 'multirow', why: 'dùng \\multirow trong bảng' },
  { re: /\\(?:toprule|midrule|bottomrule)\b/, pkg: 'booktabs', why: 'dùng \\toprule / \\midrule (bảng)' },
  { re: /\\begin\{tabularx\}/, pkg: 'tabularx', why: 'dùng môi trường tabularx' },
  { re: /\\begin\{longtable\}/, pkg: 'longtable', why: 'dùng môi trường longtable' },
  { re: /\\diagbox\b/, pkg: 'diagbox', why: 'dùng \\diagbox (ô chéo trong bảng)' },
  { re: /\\ding\s*\{/, pkg: 'pifont', why: 'dùng \\ding (ký hiệu)' },
  { re: /\\polylongdiv\b|\\polyhornerscheme\b/, pkg: 'polynom', why: 'dùng phép chia đa thức (polynom)' },
  { re: /\\op(?:add|sub|mul|div)\b/, pkg: 'xlop', why: 'dùng phép tính đặt cột (xlop)' },
  { re: /\\begin\{dcases\*?\}|\\coloneqq\b|\\mathclap\b/, pkg: 'mathtools', why: 'dùng dcases / \\coloneqq (mathtools)' },
  { re: /\\xlongequal\b/, pkg: 'extarrows', why: 'dùng \\xlongequal' },
  { re: /\\systeme\s*\{/, pkg: 'systeme', why: 'dùng \\systeme (hệ phương trình)' },
  { re: /\\begin\{CD\}/, pkg: 'amscd', why: 'dùng môi trường CD' },
];

export interface Evidence { pkg: string; file: string; why: string }

export function evidenceOf(src: string): Evidence[] {
  const text = maskNonCode(src);
  const out: Evidence[] = [];
  for (const e of EVIDENCE) {
    if (e.re.test(text) && !out.some((o) => o.pkg === e.pkg)) out.push({ pkg: e.pkg, file: `${e.pkg}.sty`, why: e.why });
  }
  return out;
}

/** Một dòng trong bảng tổng hợp. */
export interface PkgRow {
  /** khoá duy nhất: loại + tên */
  key: string;
  kind: DeclKind;
  name: string;
  file: string;
  /** khai báo trong file người dùng, hay chỉ là gói HEdu tự nạp khi vẽ hình */
  declared: 'file' | 'hedu' | 'khong';
  /** các câu (số thứ tự từ 0) dùng gói này theo bằng chứng lệnh */
  questions: number[];
  /** ghi chú lý do (từ bằng chứng) */
  why: string[];
}

/**
 * Gom mọi thứ cần kiểm: khai báo ngoài câu (áp dụng cho cả file), khai báo trong từng câu,
 * và gói suy ra từ lệnh nhưng chưa ai khai báo. `heduPreamble` là đầu file HEdu dùng khi vẽ hình.
 */
export function collectRows(src: string, blocks: string[], heduPreamble: string): PkgRow[] {
  const rows = new Map<string, PkgRow>();
  const get = (kind: DeclKind, name: string, declared: PkgRow['declared']): PkgRow => {
    const key = kind + ':' + name;
    let r = rows.get(key);
    if (!r) {
      r = { key, kind, name, file: fileOf(kind, name), declared, questions: [], why: [] };
      rows.set(key, r);
    } else if (r.declared !== 'file' && declared === 'file') r.declared = 'file';
    return r;
  };

  for (const d of extractDecls(outsideEx(src))) get(d.kind, d.name, 'file');
  blocks.forEach((b, i) => {
    for (const d of extractDecls(b)) {
      const r = get(d.kind, d.name, 'file');
      if (!r.questions.includes(i)) r.questions.push(i);
    }
  });

  const heduNames = new Set(extractDecls(heduPreamble).filter((d) => d.kind === 'package').map((d) => d.name));
  // tikz tự nạp graphicx và xcolor, nên đầu file nào có tikz thì hai gói này coi như đã có
  if (heduNames.has('tikz')) { heduNames.add('graphicx'); heduNames.add('xcolor'); }
  for (const n of extractDecls(heduPreamble).filter((d) => d.kind === 'package').map((d) => d.name)) get('package', n, 'hedu');

  blocks.forEach((b, i) => {
    for (const ev of evidenceOf(b)) {
      const key = 'package:' + ev.pkg;
      const known = rows.get(key);
      const r = known ?? get('package', ev.pkg, heduNames.has(ev.pkg) ? 'hedu' : 'khong');
      if (!r.questions.includes(i)) r.questions.push(i);
      if (!r.why.includes(ev.why)) r.why.push(ev.why);
    }
  });

  return [...rows.values()];
}
