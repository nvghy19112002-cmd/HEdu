import { figureOf, figureState, _resetFigureCache } from './figure';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
const ex = (body: string) => `\\begin{ex}\n${body}\n\\end{ex}`;
const TK = '\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}';
console.log('Câu có hình hay không (phân tích tĩnh)');

ok(figureState(ex('Tính $\\dfrac{1}{2}+\\sqrt{3}$.\n\\choice{1}{2}{3}{4}')) === 'no', 'câu thuần chữ/công thức ⇒ không');
ok(figureState(ex(`Cho đồ thị\n${TK}\nTìm cực trị.`)) === 'yes', 'tikzpicture trong đề ⇒ có');
ok(figureState(ex(`\\immini{Cho hàm số $y=x^2$.}{${TK}}`)) === 'yes', 'hình ở nhóm thứ hai của \\immini ⇒ có');
ok(figureState(ex(`Đề\n\\begin{center}${TK}\\end{center}`)) === 'yes', 'hình trong center ⇒ có');
ok(figureState(ex(`Chọn\n\\choice{${TK}}{B}{C}{D}`)) === 'yes', 'hình trong phương án ⇒ có');
ok(figureState(ex(`Chọn\n\\choice{A}{B}{C}{D}\n${TK}`)) === 'yes', 'hình ở phần đuôi sau \\choice ⇒ có');
ok(figureState(ex('Xem\n\\includegraphics[width=3cm]{h1.png}')) === 'yes', '\\includegraphics ⇒ có');
ok(figureState(ex('\\begin{tikzpicture}\\tkzTabInit{x/1,y/1}{$-\\infty$,$+\\infty$}\\end{tikzpicture}')) === 'yes', 'bảng biến thiên tkz-tab ⇒ có');
ok(figureState(ex('\\tikz \\draw (0,0) circle (1);')) === 'yes', '\\tikz một dòng ⇒ có');

console.log('Chỉ xét phần học sinh nhìn thấy');
ok(figureState(ex(`Đề chỉ chữ.\n\\loigiai{Xem hình ${TK}}`)) === 'no', 'hình chỉ trong \\loigiai ⇒ không');
ok(figureState(ex(`Đề\n${TK}\n\\loigiai{Giải}`)) === 'yes', 'hình ở đề, lời giải không hình ⇒ có');
ok(figureState(ex(`Đề chỉ chữ.\n% ${TK}\n`)) === 'no', 'hình bị chú thích % ⇒ không');
ok(figureState(ex(`Giá 50\\% ${TK}`)) === 'yes', '\\% không phải chú thích');

console.log('Bảng không phải hình');
ok(figureState(ex('\\begin{tabular}{|c|c|}\\hline a&b\\\\\\hline\\end{tabular}')) === 'no', 'tabular thuần ⇒ không');
ok(figureState(ex('$$\\begin{array}{cc}1&2\\end{array}$$')) === 'no', 'array trong công thức ⇒ không');

console.log('Lệnh tự định nghĩa');
ok(figureState(ex(`\\newcommand{\\hinhA}{${TK}}\nCho \\hinhA .`)) === 'yes', 'lệnh chứa hình và được gọi ⇒ có');
ok(figureState(ex(`\\newcommand{\\hinhA}{${TK}}\nĐề chỉ chữ.`)) === 'no', 'lệnh chứa hình nhưng không gọi ⇒ không');
ok(figureState(ex(`\\def\\hinhB{${TK}}\nXét \\hinhB .`)) === 'yes', '\\def chứa hình và được gọi ⇒ có');
ok(figureState(ex('\\def\\a{3}\nTính $\\a+1$.')) === 'no', '\\def số thường ⇒ không');
ok(figureState(ex('Cho \\hinhve{3} ở dưới.')) === 'unknown', 'lệnh tên kiểu hình chưa định nghĩa ⇒ chưa xác định');
ok(figureState(ex('\\input{hinh1}\nTính.')) === 'unknown', '\\input ⇒ chưa xác định');
ok(figureState(ex('Cho $f(x)={1$ \\choice{A}{B}{C}{D}')) === 'unknown', 'ngoặc lệch, không thấy hình ⇒ chưa xác định (không khẳng định không)');
ok(figureState(ex(`Cho ${TK} và $\\{x\\}$`)) === 'yes', 'đã thấy hình thì ngoặc lệch không đổi kết quả');

console.log('Trường hợp biên');
ok(figureState('') === 'no' && figureState('chỉ chữ') === 'no', 'rỗng / không có lệnh ⇒ không');
ok(figureState(ex('\\tikzset{a/.style={red}} Tính 1+1.')) === 'no', '\\tikzset một mình không phải hình');
ok(figureState(ex('x'.repeat(100000) + ' ' + TK)) === 'yes', 'chuỗi 100KB vẫn đúng');

console.log('Bộ nhớ đệm');
_resetFigureCache();
const q1 = { uid: 'a', latex: ex('Chữ') };
ok(figureOf(q1) === 'no', 'lần đầu tính');
ok(figureOf({ uid: 'a', latex: ex(`Chữ ${TK}`) }) === 'yes', 'đổi nội dung thì tính lại');

// Hiệu năng: 3.000 câu đa dạng
const sample = [ex('Tính $1+1$.'), ex(`Đề ${TK}`), ex(`\\immini{A}{${TK}}\\loigiai{ ${TK} }`), ex('\\choice{1}{2}{3}{4}')];
const big = Array.from({ length: 3000 }, (_, i) => ({ uid: 'q' + i, latex: sample[i % 4] + ' ' + i }));
const t0 = performance.now(); for (const q of big) figureOf(q); const cold = performance.now() - t0;
const t1 = performance.now(); for (const q of big) figureOf(q); const warm = performance.now() - t1;
ok(cold < 500 && warm < 50, `3.000 câu: lần đầu ${cold.toFixed(1)} ms, lần sau ${warm.toFixed(1)} ms`);
if (fail) { console.log(`${fail} lỗi`); process.exit(1); }
