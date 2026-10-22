// Bộ cặp thử KHÓ cho bộ dò trùng (dữ liệu giả lập, KHÔNG phải câu thật của ngân hàng).
// Mỗi cặp có nhãn mong đợi do người đặt ra theo định nghĩa trong tài liệu thiết kế:
//   raw       giống nguyên mã
//   same      cùng câu, chỉ khác trình bày
//   conflict  cùng đề/phương án/hình nhưng đáp án đúng khác
//   near      gần trùng: cùng dữ kiện, khác cách diễn đạt
//   template  cùng mẫu nhưng khác dữ kiện (số, dấu, điều kiện, hình, loại câu)
//   unrelated không liên quan
//   insufficient không đủ bằng chứng (mã lỗi/thiếu)
// Điểm đo trên bộ này là điểm trên BỘ THỬ, không phải độ chính xác trên ngân hàng thật.
import type { DupKind } from './dup2';
export type { DupKind };
export interface DupPair { id: string; note: string; a: string; b: string; expect: DupKind }

const ex = (body: string) => `\\begin{ex}\n${body}\n\\end{ex}`;
const fig = (s: string) => `\\begin{center}\n\\begin{tikzpicture}\n${s}\n\\end{tikzpicture}\n\\end{center}`;
const tn = (stem: string, o: [string, string, string, string], t = 0) => ex(`${stem}\n\\choice\n${o.map((x, i) => `{${i === t ? '\\True ' : ''}${x}}`).join('\n')}`);
const ds = (stem: string, o: [string, string, string, string], t: number[]) => ex(`${stem}\n\\choiceTF\n${o.map((x, i) => `{${t.includes(i) ? '\\True ' : ''}${x}}`).join('\n')}`);
const tln = (stem: string, ans: string) => ex(`${stem}\n\\shortans{${ans}}`);
const tl = (stem: string) => ex(stem);

const S1 = 'Cho hàm số $y=x^3-3x+2$. Tìm tọa độ điểm cực đại của đồ thị hàm số đã cho.';
const O1: [string, string, string, string] = ['$(-1;4)$', '$(1;0)$', '$(0;2)$', '$(2;4)$'];
const S2 = 'Có bao nhiêu cách chọn $3$ bạn từ một nhóm $10$ bạn để làm trực nhật?';
const S3 = 'Tập nghiệm của bất phương trình $\\dfrac{x-1}{x+2}>0$ là';
const O3: [string, string, string, string] = ['$(-\\infty;-2)\\cup(1;+\\infty)$', '$(-2;1)$', '$(1;+\\infty)$', '$(-\\infty;1)$'];

export const DUP_PAIRS: DupPair[] = [
  // ----- giống nguyên mã / cùng câu -----
  { id: 'raw-1', note: 'hai bản y hệt', a: tn(S1, O1), b: tn(S1, O1), expect: 'raw' },
  { id: 'raw-2', note: 'chỉ khác kiểu xuống dòng CRLF', a: tn(S1, O1), b: tn(S1, O1).replace(/\n/g, '\r\n'), expect: 'raw' },
  { id: 'same-ws', note: 'khác khoảng trắng', a: tn(S1, O1), b: tn(S1.replace('Cho hàm số', 'Cho   hàm  số'), O1), expect: 'same' },
  { id: 'same-comment', note: 'khác chú thích %, khác ID', a: '\\begin{ex}%[2D1H1-1]\n' + S1 + '\n\\choice{\\True $(-1;4)$}{$(1;0)$}{$(0;2)$}{$(2;4)$}\n\\end{ex}', b: '\\begin{ex}%[2D1N9-9]\n' + S1 + ' % ghi chú riêng\n\\choice{\\True $(-1;4)$}{$(1;0)$}{$(0;2)$}{$(2;4)$}\n\\end{ex}', expect: 'same' },
  { id: 'same-dfrac', note: 'dfrac so với frac', a: tn(S3, O3), b: tn(S3.replace('\\dfrac', '\\frac'), O3), expect: 'same' },
  { id: 'same-leftright', note: '\\left \\right chỉ là định dạng', a: tn('Giá trị của $\\left(1+\\dfrac{1}{2}\\right)^2$ bằng', ['$\\dfrac94$', '$2$', '$3$', '$\\dfrac32$']), b: tn('Giá trị của $(1+\\dfrac{1}{2})^2$ bằng', ['$\\dfrac94$', '$2$', '$3$', '$\\dfrac32$']), expect: 'same' },
  { id: 'same-brace-exp', note: 'x^2 so với x^{2}', a: tn('Đạo hàm của $y=x^2$ là', ['$2x$', '$x$', '$x^2$', '$2$']), b: tn('Đạo hàm của $y=x^{2}$ là', ['$2x$', '$x$', '$x^{2}$', '$2$']), expect: 'same' },
  { id: 'same-reorder', note: 'đảo thứ tự phương án, đáp án đúng đi theo', a: tn(S1, O1, 0), b: tn(S1, [O1[2], O1[3], O1[0], O1[1]], 2), expect: 'same' },
  { id: 'same-solution', note: 'cùng đề và đáp án, lời giải viết khác', a: ex(`${S2}\n\\shortans{120}\n\\loigiai{Số cách là $\\mathrm{C}_{10}^3=120$.}`), b: ex(`${S2}\n\\shortans{120}\n\\loigiai{Chọn tổ hợp chập $3$ của $10$ phần tử nên có $120$ cách.}`), expect: 'same' },
  { id: 'same-lang', note: 'khác nhóm lớp/chương nhưng cùng nội dung (siêu dữ liệu không dùng)', a: '\\begin{ex}%[2D1H1-1]\n' + S2 + '\n\\shortans{120}\n\\end{ex}', b: '\\begin{ex}%[1D2N5-3]\n' + S2 + '\n\\shortans{120}\n\\end{ex}', expect: 'same' },

  // ----- mâu thuẫn đáp án -----
  { id: 'conf-true', note: '\\True đặt ở A so với B', a: tn(S1, O1, 0), b: tn(S1, O1, 1), expect: 'conflict' },
  { id: 'conf-short', note: 'đáp án ngắn 120 so với 720', a: tln(S2, '120'), b: tln(S2, '720'), expect: 'conflict' },
  { id: 'conf-ds', note: 'cờ Đ/S của một ý khác', a: ds('Cho hàm số $y=x^2$. Xét các mệnh đề:', ['Hàm số đồng biến trên $\\mathbb{R}$.', 'Đồ thị đi qua gốc tọa độ.', 'Hàm số chẵn.', 'Giá trị nhỏ nhất bằng $0$.'], [1, 2, 3]), b: ds('Cho hàm số $y=x^2$. Xét các mệnh đề:', ['Hàm số đồng biến trên $\\mathbb{R}$.', 'Đồ thị đi qua gốc tọa độ.', 'Hàm số chẵn.', 'Giá trị nhỏ nhất bằng $0$.'], [0, 1, 2, 3]), expect: 'conflict' },

  // ----- cùng mẫu, khác dữ kiện -----
  { id: 'tmp-frac', note: '\\frac{1}{23} so với \\frac{12}{3} (xoá ngoặc làm trùng giả)', a: tn('Giá trị của biểu thức $\\frac{1}{23}$ bằng bao nhiêu?', ['$1$', '$2$', '$3$', '$4$']), b: tn('Giá trị của biểu thức $\\frac{12}{3}$ bằng bao nhiêu?', ['$1$', '$2$', '$3$', '$4$']), expect: 'template' },
  { id: 'tmp-num', note: 'đổi 10 bạn thành 12 bạn', a: tln(S2, '120'), b: tln(S2.replace('$10$', '$12$'), '120'), expect: 'template' },
  { id: 'tmp-lt', note: 'x>0 so với x<0', a: tn('Tập nghiệm của bất phương trình $x>0$ trên $\\mathbb{R}$ là', ['$(0;+\\infty)$', '$(-\\infty;0)$', '$\\mathbb{R}$', '$\\emptyset$']), b: tn('Tập nghiệm của bất phương trình $x<0$ trên $\\mathbb{R}$ là', ['$(0;+\\infty)$', '$(-\\infty;0)$', '$\\mathbb{R}$', '$\\emptyset$']), expect: 'template' },
  { id: 'tmp-le', note: '\\le so với \\ge', a: tn('Tìm $x$ thỏa mãn $2x-4\\le 0$.', ['$x\\le2$', '$x\\ge2$', '$x<2$', '$x>2$']), b: tn('Tìm $x$ thỏa mãn $2x-4\\ge 0$.', ['$x\\le2$', '$x\\ge2$', '$x<2$', '$x>2$']), expect: 'template' },
  { id: 'tmp-deriv', note: 'f(x) so với f\'(x)', a: tn('Cho $f(x)=x^2+1$. Giá trị $f(2)$ bằng', ['$1$', '$4$', '$5$', '$2$']), b: tn('Cho $f(x)=x^2+1$. Giá trị $f\'(2)$ bằng', ['$1$', '$4$', '$5$', '$2$']), expect: 'template' },
  { id: 'tmp-sign', note: 'đổi dấu cộng thành trừ', a: tn('Cho $a=3$, $b=5$. Tính $a+b$.', ['$8$', '$2$', '$-2$', '$15$']), b: tn('Cho $a=3$, $b=5$. Tính $a-b$.', ['$8$', '$2$', '$-2$', '$15$']), expect: 'template' },
  { id: 'tmp-neg', note: 'có \\neg so với không có', a: tn('Mệnh đề phủ định của $\\neg P$ với $P$: "$x^2>0$" là', ['$x^2\\le0$', '$x^2>0$', '$x^2<0$', '$x^2=0$']), b: tn('Mệnh đề phủ định của $P$ với $P$: "$x^2>0$" là', ['$x^2\\le0$', '$x^2>0$', '$x^2<0$', '$x^2=0$']), expect: 'template' },
  { id: 'tmp-coef', note: 'đổi hệ số đa thức', a: tn(S1, O1), b: tn(S1.replace('x^3-3x+2', 'x^3-12x+2'), O1), expect: 'template' },
  { id: 'tmp-domain', note: 'đổi miền xác định', a: tn('Giá trị lớn nhất của $y=x^2$ trên đoạn $[0;2]$ là', ['$0$', '$2$', '$4$', '$1$']), b: tn('Giá trị lớn nhất của $y=x^2$ trên đoạn $[0;3]$ là', ['$0$', '$2$', '$4$', '$1$']), expect: 'template' },
  { id: 'tmp-fig', note: 'cùng chữ, hình vẽ khác (đặt trong đề)', a: tn('Cho hình vẽ sau. Diện tích phần tô màu bằng\n' + fig('\\fill[gray] (0,0) circle (1);'), ['$\\pi$', '$2\\pi$', '$4$', '$1$']), b: tn('Cho hình vẽ sau. Diện tích phần tô màu bằng\n' + fig('\\fill[gray] (0,0) rectangle (2,2);'), ['$\\pi$', '$2\\pi$', '$4$', '$1$']), expect: 'template' },
  { id: 'tmp-immini', note: 'cùng chữ, hình khác trong \\immini', a: ex('\\immini{Cho hình bên. Diện tích phần tô màu bằng\n\\choice{\\True $\\pi$}{$2\\pi$}{$4$}{$1$}}{' + fig('\\fill (0,0) circle (1);') + '}'), b: ex('\\immini{Cho hình bên. Diện tích phần tô màu bằng\n\\choice{\\True $\\pi$}{$2\\pi$}{$4$}{$1$}}{' + fig('\\fill (0,0) rectangle (2,2);') + '}'), expect: 'template' },
  { id: 'tmp-venn', note: 'biểu đồ Venn: vùng tô giao so với hợp', a: tn('Phần tô đậm trong hình là tập hợp nào sau đây?\n' + fig('\\draw (0,0) circle (1) (1,0) circle (1);\n\\begin{scope}\\clip (0,0) circle (1);\\fill[gray] (1,0) circle (1);\\end{scope}'), ['$A\\cap B$', '$A\\cup B$', '$A\\setminus B$', '$B\\setminus A$']), b: tn('Phần tô đậm trong hình là tập hợp nào sau đây?\n' + fig('\\draw (0,0) circle (1) (1,0) circle (1);\n\\fill[gray] (0,0) circle (1);\\fill[gray] (1,0) circle (1);'), ['$A\\cap B$', '$A\\cup B$', '$A\\setminus B$', '$B\\setminus A$']), expect: 'template' },
  { id: 'tmp-figtail', note: 'hình đặt sau \\choice (tail) khác', a: ex('Xét đồ thị sau:\n\\choice{\\True $1$}{$2$}{$3$}{$4$}\n' + fig('\\draw (0,0)--(1,1);')), b: ex('Xét đồ thị sau:\n\\choice{\\True $1$}{$2$}{$3$}{$4$}\n' + fig('\\draw (0,0)--(1,-1);')), expect: 'template' },
  { id: 'tmp-type', note: 'cùng đề chữ nhưng khác loại câu (TN so với TLN so với TL)', a: tn(S1, O1), b: tl(S1), expect: 'template' },
  { id: 'tmp-type2', note: 'trả lời ngắn so với tự luận', a: tln(S2, '120'), b: tl(S2), expect: 'template' },

  // ----- gần trùng: cùng dữ kiện, diễn đạt khác -----
  { id: 'near-words', note: 'thêm "Hãy", đổi từ nối', a: tn(S1, O1), b: tn('Cho hàm số $y=x^3-3x+2$. Hãy tìm tọa độ điểm cực đại của đồ thị hàm số đã cho.', O1), expect: 'near' },
  { id: 'near-order-ds', note: 'đúng/sai: đổi thứ tự các ý', a: ds('Cho hàm số $y=x^2$. Xét các mệnh đề:', ['Hàm số đồng biến trên $\\mathbb{R}$.', 'Đồ thị đi qua gốc tọa độ.', 'Hàm số chẵn.', 'Giá trị nhỏ nhất bằng $0$.'], [1, 2, 3]), b: ds('Cho hàm số $y=x^2$. Xét các mệnh đề:', ['Đồ thị đi qua gốc tọa độ.', 'Hàm số chẵn.', 'Hàm số đồng biến trên $\\mathbb{R}$.', 'Giá trị nhỏ nhất bằng $0$.'], [0, 1, 3]), expect: 'near' },
  { id: 'near-rephrase', note: 'viết lại câu hỏi, giữ nguyên số liệu', a: tln(S2, '120'), b: tln('Một nhóm có $10$ bạn. Có bao nhiêu cách chọn ra $3$ bạn để làm trực nhật?', '120'), expect: 'near' },

  // ----- không liên quan -----
  { id: 'un-1', note: 'hai chủ đề khác hẳn', a: tn(S1, O1), b: tln(S2, '120'), expect: 'unrelated' },
  { id: 'un-2', note: 'cùng dạng nhưng khác đề (tập nghiệm khác)', a: tn(S3, O3), b: tn('Tập nghiệm của phương trình $\\log_2 x=3$ là', ['$\\{8\\}$', '$\\{6\\}$', '$\\{9\\}$', '$\\{3\\}$']), expect: 'unrelated' },
  { id: 'un-3', note: 'cùng câu mở đầu "Cho hàm số" nhưng khác', a: tn('Cho hàm số $y=\\sin x$. Chu kỳ của hàm số là', ['$2\\pi$', '$\\pi$', '$1$', '$4$']), b: tn('Cho hàm số $y=\\ln x$. Tập xác định của hàm số là', ['$(0;+\\infty)$', '$\\mathbb{R}$', '$[0;+\\infty)$', '$\\mathbb{R}\\setminus\\{0\\}$']), expect: 'unrelated' },

  // ----- không đủ bằng chứng -----
  { id: 'ins-dollar', note: 'một câu lẻ dấu $', a: tn(S1, O1), b: ex('Cho hàm số $y=x^3-3x+2. Tìm tọa độ điểm cực đại của đồ thị hàm số đã cho.\n\\choice{\\True $(-1;4)$}{$(1;0)$}{$(0;2)$}{$(2;4)$}'), expect: 'insufficient' },
  { id: 'ins-3opts', note: 'một câu chỉ có 3 phương án', a: tn(S1, O1), b: ex(S1 + '\n\\choice{\\True $(-1;4)$}{$(1;0)$}{$(0;2)$}'), expect: 'insufficient' },
];
