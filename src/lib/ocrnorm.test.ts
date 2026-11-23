import { normalizeOcr, stretchBrackets } from './ocrnorm';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
const n = (s: string) => normalizeOcr(s);

console.log('Tự chuẩn hoá mã OCR');
ok(stretchBrackets('\\left(\\dfrac{1}{2}\\right)').n === 0, 'đã có \\left \\right: để nguyên');
ok(stretchBrackets('(x+1)^2').n === 0, 'bên trong thấp: giữ ngoặc thường');
ok(stretchBrackets('\\left(-\\infty;\\dfrac12\\right]').n === 0, 'đã có cỡ dù lệch loại: để nguyên');
ok(stretchBrackets('(\\dfrac{1}{2};3]').n === 0, 'khoảng nửa mở có phân số: không đoán');
ok(stretchBrackets('f\\left(x\\right)=(\\dfrac{x+1}{2})^2').s === 'f\\left(x\\right)=\\left(\\dfrac{x+1}{2}\\right)^2', 'bọc trọn cặp có phân số');
ok(stretchBrackets('[(\\dfrac{a}{b})+1]').s === '\\left[\\left(\\dfrac{a}{b}\\right)+1\\right]', 'lồng nhau: bọc cả hai tầng');
ok(stretchBrackets('\\dfrac{(a+b)}{(\\sum x)}').s === '\\dfrac{(a+b)}{\\left(\\sum x\\right)}', 'ngoặc trong { } của \\dfrac xét riêng từng tầng');

const r = n('Cho $y=\\frac{x}{2}$ với $x≥0.5$ và (đoạn chữ 1.5) % chú thích 0.5 (\\dfrac12)\n\\begin{tikzpicture}\\draw (0.5,1.5)--(\\frac{1}{2},0);\\end{tikzpicture} −3');
ok(r.tex.includes('$y=\\dfrac{x}{2}$') && r.tex.includes('$x\\ge 0{,}5$'), '\\frac → \\dfrac, ≥ → \\ge, 0.5 → 0{,}5 trong toán');
ok(r.tex.includes('(đoạn chữ 1.5)') && r.tex.includes('% chú thích 0.5 (\\dfrac12)'), 'chữ thường và chú thích: không đụng số thập phân, ngoặc');
ok(r.tex.includes('\\draw (0.5,1.5)--(\\frac{1}{2},0);'), 'tikzpicture: không đụng');
ok(r.tex.endsWith(' -3'), 'dấu trừ Unicode ngoài toán → -');
const cnt = Object.fromEntries(r.changes.map((c) => [c.rule, c.count]));
ok(cnt.dfrac === 1 && cnt.decimal === 1 && cnt.unicode === 2 && !cnt['left-right'], 'đếm đúng từng loại thay đổi');
ok(n('$\\$5$ và \\(\\left|\\dfrac{1}{x}\\right|\\)').changes.length === 0, '\\$ trong toán và \\left| có sẵn: không đổi gì');
ok(n('\\[ \\lim\\limits_{x\\to 0}(\\dfrac{\\sin x}{x}) \\]').tex.includes('\\left(\\dfrac{\\sin x}{x}\\right)'), 'toán hiển thị \\[ \\] cũng chuẩn hoá');
ok(n('Không có gì').changes.length === 0, 'không có gì để sửa ⇒ danh sách rỗng');

if (fail) process.exit(1);
console.log('ocrnorm: đạt hết.');
