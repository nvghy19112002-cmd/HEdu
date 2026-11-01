import { buildScratchExam, defaultExamName, whyNotExam } from './scratchexam';
import { scanScratch } from './texscratch';

let fails = 0;
const t = (name: string, ok: boolean) => { if (!ok) { fails++; console.log(`  ✗ ${name}`); } else console.log(`  ✓ ${name}`); };

const content = '% đầu\n\\begin{ex}%[2D1H1-1]\nCâu một $x^2$\n\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}\n\\loigiai{a}\n\\end{ex}\n';
const scan = scanScratch(content);

t('bàn nháp tốt lưu được', whyNotExam(scan, content) === null);
t('trống thì không lưu', whyNotExam(scanScratch(''), '') !== null);
t('có \\documentclass thì từ chối và nói rõ', (whyNotExam(scanScratch('\\documentclass{article}\n' + content), '\\documentclass{article}\n' + content) ?? '').includes('documentclass'));
t('chưa có khối hoàn chỉnh thì từ chối', whyNotExam(scanScratch('\\begin{ex}\ndở'), '\\begin{ex}\ndở') !== null);

const files = buildScratchExam(content, scan.blocks.map((b) => b.text), '');
const by = new Map(files.map((f) => [f.path, f.text] as const));
t('đủ tệp: main, khai báo, hedu.sty, gói thêm, cauhoi', ['main.tex', 'khaibaochung.tex', 'hedu.sty', 'hedu-khaibao.tex', 'hedu-goithem.tex', 'cauhoi.tex'].every((p) => by.has(p)));
t('cauhoi.tex là NGUYÊN VĂN bàn nháp', by.get('cauhoi.tex') === content);
t('thêm xuống dòng cuối nếu thiếu, không đổi gì khác', buildScratchExam('abc', [], '').find((f) => f.path === 'cauhoi.tex')?.text === 'abc\n');
t('main.tex nạp khaibaochung và cauhoi', (by.get('main.tex') ?? '').includes('\\input{khaibaochung}') && (by.get('main.tex') ?? '').includes('\\input{cauhoi}'));
t('hình TikZ ⇒ gói tikz có trong hedu-goithem hoặc khai báo chung', /tikz/i.test((by.get('hedu-goithem.tex') ?? '') + (by.get('hedu-khaibao.tex') ?? '')));
t('gói thêm do giáo viên chọn được nối vào', (buildScratchExam(content, [], '', ['abc']).find((f) => f.path === 'hedu-goithem.tex')?.text ?? '').includes('\\usepackage{abc}'));
t('tên đề mặc định có ngày', defaultExamName('Đề giữa kì 1', new Date(2026, 10, 1)) === 'Đề giữa kì 1 01-11-2026');
t('tên rỗng dùng "Bàn nháp"', defaultExamName('  ', new Date(2026, 10, 1)) === 'Bàn nháp 01-11-2026');

if (fails) { console.log(`\n${fails} test lỗi`); process.exit(1); }
console.log('\nOK');
