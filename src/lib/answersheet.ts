// Phiếu trả lời trắc nghiệm trống (A4) dựng bằng TikZ: Họ tên, Số báo danh (6 cột), Mã đề (3 cột), Phần I (A–D, tối đa 40 câu),
// Phần II (Đúng/Sai 4 ý, tối đa 8 câu), Phần III (đáp số 4 ô: dấu −, dấu phẩy, chữ số 0–9, tối đa 6 câu). Thuần, có kiểm thử.
// Bố cục do HEdu tự thiết kế theo cấu trúc đề THPT 2025; chỉ vẽ các khối cần cho đề (số câu từng phần).

export const SHEET_MAX = { p1: 40, p2: 8, p3: 6 } as const;
export interface SheetOpts {
  /** dòng tiêu đề phụ (kỳ thi, năm học), có thể rỗng */
  subtitle: string;
  /** môn thi (ghi ở khung thông tin), có thể rỗng */
  subject: string;
  /** số câu Phần I, II, III */
  p1: number;
  p2: number;
  p3: number;
}

/** Số câu hợp lệ cho phiếu; trả null nếu hợp lệ, ngược lại là lý do. */
export function sheetProblem(o: Pick<SheetOpts, 'p1' | 'p2' | 'p3'>): string | null {
  const bad = (n: number, max: number) => !Number.isInteger(n) || n < 0 || n > max;
  if (bad(o.p1, SHEET_MAX.p1) || bad(o.p2, SHEET_MAX.p2) || bad(o.p3, SHEET_MAX.p3)) {
    return `Phiếu chỉ chứa tối đa ${SHEET_MAX.p1} câu Phần I, ${SHEET_MAX.p2} câu Phần II, ${SHEET_MAX.p3} câu Phần III (đề có ${o.p1}, ${o.p2}, ${o.p3}).`;
  }
  if (o.p1 + o.p2 + o.p3 === 0) return 'Đề chưa có câu trắc nghiệm nào để làm phiếu.';
  return null;
}

/** Chữ an toàn để đặt trong TeX (bỏ lệnh và ký tự đặc biệt). */
export const texText = (s: string): string => s.replace(/[\\{}$&#^_%~]/g, ' ').replace(/\s+/g, ' ').trim();

export function answerSheetTex(o: SheetOpts): string {
  const why = sheetProblem(o);
  if (why) throw new Error(why);
  const sub = texText(o.subtitle);
  const subj = texText(o.subject);
  const blocks1 = Math.ceil(o.p1 / 10);
  const L: string[] = [];
  const A = (s: string) => L.push(s);
  A(String.raw`\documentclass[a4paper,12pt]{article}`);
  A(String.raw`\usepackage[utf8]{inputenc}\usepackage[T5]{fontenc}\usepackage{tikz}`);
  A(String.raw`\usepackage[paperwidth=210mm,paperheight=297mm,margin=0mm]{geometry}`);
  A(String.raw`\pagestyle{empty}\setlength{\parindent}{0pt}`);
  A(String.raw`\newcommand{\bub}[3]{\draw[line width=.35pt] (#1,#2) circle (1.75mm); \node[font=\fontsize{5.5}{6}\selectfont] at (#1,#2) {#3};}`);
  A(String.raw`\begin{document}\thispagestyle{empty}`);
  A(String.raw`\begin{tikzpicture}[remember picture,overlay,x=1mm,y=-1mm,shift={(current page.north west)}]`);
  A(String.raw`\node[font=\bfseries\Large] at (105,11) {PHIẾU TRẢ LỜI TRẮC NGHIỆM};`);
  if (sub) A(String.raw`\node[font=\small\itshape] at (105,17.5) {${sub}};`);
  // khung thông tin thí sinh
  A(String.raw`\draw[line width=.5pt] (10,22) rectangle (112,80);`);
  A(String.raw`\node[anchor=west](f1) at (13,28) {Họ và tên:};\draw[dotted] (f1.south east) -- (f1.south -| 108,0);`);
  A(String.raw`\node[anchor=west](f2) at (13,37) {Lớp:};\draw[dotted] (f2.south east) -- (f2.south -| 50,0);`);
  A(String.raw`\node[anchor=west](f3) at (53,37) {Ngày sinh:};\draw[dotted] (f3.south east) -- (f3.south -| 108,0);`);
  A(String.raw`\node[anchor=west](f4) at (13,46) {Phòng thi:};\draw[dotted] (f4.south east) -- (f4.south -| 50,0);`);
  A(String.raw`\node[anchor=west](f5) at (53,46) {Môn thi: ${subj}};\draw[dotted] (f5.south east) -- (f5.south -| 108,0);`);
  A(String.raw`\node[anchor=west](f6) at (13,55) {Chữ ký thí sinh:};\draw[dotted] (f6.south east) -- (f6.south -| 108,0);`);
  A(String.raw`\node[anchor=west,font=\footnotesize\itshape] at (13,65) {Dùng bút chì đen tô kín ô tròn; tô đúng một ô cho mỗi lựa chọn.};`);
  A(String.raw`\node[anchor=west,font=\footnotesize\itshape] at (13,71) {Muốn bỏ chọn thì tẩy sạch, không gạch chéo.};`);
  // số báo danh: 6 cột × 10 hàng; mã đề: 3 cột × 10 hàng
  A(String.raw`\node[font=\small\bfseries] at (131,24.5) {Số báo danh};`);
  A(String.raw`\foreach \c in {0,...,5}{\draw (118+\c*5,27) rectangle (123+\c*5,32.5);}`);
  A(String.raw`\foreach \c in {0,...,5}{\foreach \d in {0,...,9}{\bub{120.5+\c*5}{36+\d*4.6}{\d}}}`);
  A(String.raw`\node[font=\small\bfseries] at (164,24.5) {Mã đề};`);
  A(String.raw`\foreach \c in {0,...,2}{\draw (156+\c*5,27) rectangle (161+\c*5,32.5);}`);
  A(String.raw`\foreach \c in {0,...,2}{\foreach \d in {0,...,9}{\bub{158.5+\c*5}{36+\d*4.6}{\d}}}`);
  let y = 86;
  // Phần I
  if (o.p1 > 0) {
    A(String.raw`\node[anchor=west,font=\bfseries] at (10,${y}) {PHẦN I};`);
    for (let b = 0; b < blocks1; b++) {
      const x0 = 10 + b * 47.5;
      const first = b * 10 + 1;
      const last = Math.min(o.p1, b * 10 + 10);
      A(String.raw`\draw[line width=.5pt] (${x0},${y + 3}) rectangle (${x0 + 45},${y + 3 + 59});`);
      A(String.raw`\foreach \l [count=\i from 0] in {A,B,C,D}{\node[font=\scriptsize] at (${x0 + 14.5}+\i*6,${y + 7}) {\l};}`);
      for (let q = first; q <= last; q++) {
        const r = q - first;
        const yy = y + 12 + r * 5.2;
        A(String.raw`\node[font=\footnotesize] at (${x0 + 5},${yy}) {${q}};`);
        A(String.raw`\foreach \l [count=\i from 0] in {A,B,C,D}{\bub{${x0 + 14.5}+\i*6}{${yy}}{\l}}`);
      }
    }
    y += 66;
  }
  // Phần II
  if (o.p2 > 0) {
    A(String.raw`\node[anchor=west,font=\bfseries] at (10,${y}) {PHẦN II};`);
    const w = 190 / 8;
    for (let k = 0; k < o.p2; k++) {
      const x0 = 10 + k * w;
      A(String.raw`\draw[line width=.5pt] (${x0},${y + 3}) rectangle (${x0 + w - 1.2},${y + 3 + 34});`);
      A(String.raw`\node[font=\scriptsize\bfseries] at (${x0 + (w - 1.2) / 2},${y + 6.5}) {Câu ${k + 1}};`);
      A(String.raw`\node[font=\fontsize{5.5}{6}\selectfont] at (${x0 + 10},${y + 10.5}) {Đúng};\node[font=\fontsize{5.5}{6}\selectfont] at (${x0 + 17},${y + 10.5}) {Sai};`);
      A(String.raw`\foreach \l [count=\i from 0] in {a,b,c,d}{\node[font=\scriptsize] at (${x0 + 3},${y + 16}+\i*5.6) {\l)};\bub{${x0 + 10}}{${y + 16}+\i*5.6}{}\bub{${x0 + 17}}{${y + 16}+\i*5.6}{}}`);
    }
    y += 43;
  }
  // Phần III
  if (o.p3 > 0) {
    A(String.raw`\node[anchor=west,font=\bfseries] at (10,${y}) {PHẦN III};`);
    const w = 190 / 6;
    for (let k = 0; k < o.p3; k++) {
      const x0 = 10 + k * w;
      A(String.raw`\draw[line width=.5pt] (${x0},${y + 3}) rectangle (${x0 + w - 1.2},${y + 3 + 74});`);
      A(String.raw`\node[font=\scriptsize\bfseries] at (${x0 + (w - 1.2) / 2},${y + 6.5}) {Câu ${k + 1}};`);
      A(String.raw`\foreach \c in {0,...,3}{\draw (${x0 + 3.5}+\c*6.3,${y + 9}) rectangle (${x0 + 8.8}+\c*6.3,${y + 14.5});}`);
      for (let c = 0; c < 4; c++) {
        const bx = x0 + 6.1 + c * 6.3;
        if (c === 0) A(String.raw`\bub{${bx}}{${y + 19}}{$-$}`);
        else A(String.raw`\bub{${bx}}{${y + 23.6}}{,}`);
        for (let d = 0; d < 10; d++) A(String.raw`\bub{${bx}}{${y + 28.2 + d * 4.6}}{${d}}`);
      }
    }
  }
  A(String.raw`\end{tikzpicture}`);
  A(String.raw`\end{document}`);
  return L.join('\n') + '\n';
}
