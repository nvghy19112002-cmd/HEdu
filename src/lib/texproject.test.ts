import { BUNDLED_FILES, buildProject, collectNeeds, MAIN_TEX, requirementsMd, safeFolderName, verbatimTex } from './texproject';
import { KHAIBAOCHUNG_TEX } from './texproject.template';
import type { Question } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
const mk = (latex: string) => ({ latex } as unknown as Question);

const q1 = mk(`\\begin{ex}%[0H2V1-1]\n  Cho $\\dfrac{a}{b}$ % ghi chú\n  \\choice{\\True $1$}{$2$}{$3$}{$4$}\n  \\loigiai{x}\n\\end{ex}`);
const q2 = mk(`\\begin{ex}\n \\begin{tikzpicture}\\tkzTabInit{$x$/1}{$0$}\\end{tikzpicture}\n \\usepackage{tabvar}\n\\end{ex}\n`);

console.log('Kiểu 1: nguyên văn');
ok(verbatimTex([q1, q2]) === q1.latex + '\n\n' + q2.latex + '\n', 'đúng từng ký tự, cách nhau một dòng trống, không tiêu đề');
ok(!verbatimTex([q1]).includes('HEdu') && !verbatimTex([q1]).includes('\\documentclass'), 'không thêm khai báo hay ghi chú nào');

console.log('Kiểu 2: thư mục');
const files = buildProject([q1, q2], '\\usepackage{tikz}\\usepackage{esvect}', 'bo-de');
ok(files.map((f) => f.path).join() === 'main.tex,khaibaochung.tex,hedu.sty,hedu-khaibao.tex,hedu-goithem.tex,cauhoi.tex,CAN-CO-GI.md', 'đủ file văn bản (khai báo qua hedu.sty)');
ok(files.find((f) => f.path === 'cauhoi.tex')!.text === verbatimTex([q1, q2]), 'cauhoi.tex = đúng kiểu 1');
ok(MAIN_TEX.includes('\\input{khaibaochung}') && MAIN_TEX.includes('\\input{cauhoi}'), 'main.tex nạp khai báo và câu hỏi');
ok(!/0812|Nhất Linh/.test(KHAIBAOCHUNG_TEX), 'khai báo không chứa thông tin cá nhân');
ok(KHAIBAOCHUNG_TEX.indexOf('\\input{shared-content}') < KHAIBAOCHUNG_TEX.indexOf('{mathpazo}'), 'shared-content nạp trước mathpazo');
ok(BUNDLED_FILES.length === 6 && BUNDLED_FILES.includes('ex_test.sty'), 'danh sách file đi kèm khớp bản nhúng');

console.log('CAN-CO-GI');
const needs = collectNeeds([q1, q2], '\\usepackage{tikz}');
ok(needs.some((n) => n.name === 'ex_test' && n.bundled), 'ex_test là gói đi kèm');
ok(needs.some((n) => n.name === 'tabvar' && n.from === 'cau-hoi'), 'gói khai trong câu hỏi được ghi nhận');
ok(needs.some((n) => n.name === 'tkz-tab' && n.from === 'suy-ra'), 'gói suy ra từ lệnh \\tkzTab');
const md = requirementsMd([q1, q2], '', 'bo-de');
ok(md.includes('pdflatex main.tex') && md.includes('tlmgr install'), 'có cách biên dịch và lệnh cài gói');
ok(!/tlmgr install[^\n]*(ex_test|twemojis)/.test(md), 'gói đi kèm không nằm trong lệnh tlmgr');

console.log('Tên thư mục');
ok(safeFolderName('  Đề 1: HK1/2025? ') === 'Đề 1- HK1-2025-', 'bỏ ký tự cấm');
ok(safeFolderName('..') === 'bo-de-hedu' && safeFolderName('') === 'bo-de-hedu' && safeFolderName('CON') === 'bo-de-hedu', 'tên rỗng/cấm → tên mặc định');
ok(safeFolderName('abc. ') === 'abc', 'bỏ dấu chấm/cách cuối');

if (fail) { console.log(`\n${fail} lỗi`); process.exit(1); }
console.log('\ntexproject: OK');
