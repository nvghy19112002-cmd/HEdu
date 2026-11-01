import { appendText, exportName } from './scratchfile';

let fails = 0;
const t = (name: string, ok: boolean) => { if (!ok) { fails++; console.log(`  ✗ ${name}`); } else console.log(`  ✓ ${name}`); };

t('bàn nháp trống thì lấy nguyên tệp', appendText('', '\\begin{ex}\nA\n\\end{ex}\n') === '\\begin{ex}\nA\n\\end{ex}\n');
t('tệp trống không đổi bàn nháp', appendText('abc\n', '  \n') === 'abc\n');
t('nối cách một dòng trống, giữ nguyên chữ', appendText('X\n\n\n', '\n\nY\n') === 'X\n\nY\n');
t('tên tệp theo giờ', exportName(new Date(2026, 10, 1, 9, 5)) === 'ban-nhap-20261101-0905.tex');

if (fails) { console.log(`\n${fails} test lỗi`); process.exit(1); }
console.log('\nOK');
