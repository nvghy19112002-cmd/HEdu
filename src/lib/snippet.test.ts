import { plainSnippet } from './snippet';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
console.log('Trích đoạn cho danh sách');
const a = plainSnippet('Cho hàm số $y=\\dfrac{x-1}{x+2}$ có đồ thị \\textbf{như hình} bên. \\hspace{3cm} % ghi chú\n Tính $\\sqrt{x}\\le 3$.');
ok(!/[\\{}$]/.test(a), `không lộ lệnh/ngoặc/đô-la: “${a}”`);
ok(a.includes('(x-1)/(x+2)') && a.includes('như hình') && a.includes('≤'), 'giữ chữ và công thức dưới dạng đọc được');
ok(!a.includes('ghi chú') && !a.includes('3cm'), 'bỏ chú thích % và tham số \\hspace');
const b = plainSnippet('Xét \\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture} hình trên.');
ok(/\[hình\]/.test(b) && !/draw/.test(b), 'hình TikZ thay bằng [hình]');
ok(plainSnippet('x '.repeat(200), 50).length <= 51, 'cắt ngắn có dấu …');
if (fail) { console.log(`${fail} lỗi`); process.exit(1); }
