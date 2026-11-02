import { inputName, WRAP_MAIN, wrapFiles } from './examwrap';
import { heduFiles } from './hedusty';
import { MAIN_HEAD } from './examgen';
import type { Question } from './types';

let fails = 0;
const t = (name: string, ok: boolean) => { if (!ok) { fails++; console.log(`  ✗ ${name}`); } else console.log(`  ✓ ${name}`); };

const DATA = '\\setcounter{ex}{0}\n\\begin{ex}\nCho $\\triangle ABC$.\n\\choice{a}{\\True b}{c}{d}\n\\end{ex}\n';
const w = wrapFiles('de/toan10_gk1.tex', DATA, 'hedu');
t('tệp chỉ có dữ liệu ⇒ có bộ tệp bọc', !!w && w[0].path === WRAP_MAIN);
t('tệp bọc: cùng phần đầu với đề do Tạo đề dựng, \\input đúng tên (bỏ thư mục, đuôi)', !!w && w[0].text === `${MAIN_HEAD}\n\\input{toan10_gk1}\n\\end{document}\n`);
t('kèm đủ bộ khai báo của mẫu in (giống hệt heduFiles)', !!w && JSON.stringify(w.slice(1)) === JSON.stringify(heduFiles([{ latex: DATA }] as unknown as Question[], '')));
t('tệp đã có \\documentclass ⇒ không bọc', wrapFiles('main.tex', '\\documentclass{book}\n\\begin{document}x\\end{document}', 'hedu') === null);
t('\\documentclass bị chú thích vẫn là tệp dữ liệu', wrapFiles('a.tex', '%\\documentclass{book}\n\\begin{ex}x\\end{ex}', 'hedu') !== null);
t('tên tệp có khoảng trắng / ký tự TeX ⇒ không bọc', wrapFiles('de thi.tex', DATA, 'hedu') === null && inputName('a%b.tex') === null && inputName('x{y}.tex') === null);
t('tên tiếng Việt, gạch nối, dấu chấm được', inputName('đề-thi_11.v2.tex') === 'đề-thi_11.v2');
t('mẫu lạ ⇒ dùng mẫu mặc định', JSON.stringify(wrapFiles('a.tex', DATA, 'khong-co')) === JSON.stringify(wrapFiles('a.tex', DATA, 'hedu')));

if (fails) { console.log(`\n${fails} test lỗi`); process.exit(1); }
console.log('\nOK');
