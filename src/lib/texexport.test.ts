import { buildTexFile, exportQuestionTex, exportSizeMB } from './texexport';
import type { Question } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const immini = `\\begin{ex}%[0H2V1-1]\n  Cho hình chóp như hình vẽ. % ghi chú giữ lại\n  \\immini{Cho $\\dfrac{a}{b}$ \\\\ tính\n  \\choice{$1$}{\\True $2$}{$3$}{$4$}}{\\begin{tikzpicture}[scale=.8]\n    \\def\\a{2}\n    \\draw (0,0)--(\\a,0);\n  \\end{tikzpicture}}\n  \\loigiai{\\newcommand{\\tmp}[1]{#1}\\tmp{Đáp án B}}\n\\end{ex}`;
const tab = `\\begin{ex}\n  BBT:\n  \\begin{tikzpicture}\n  \\tkzTabInit{$x$/1,$y'$/1,$y$/2}{$-\\infty$,$0$,$+\\infty$}\n  \\tkzTabLine{,+,0,-,}\n  \\end{tikzpicture}\n  \\shortans{12}\n  \\loigiai{x}\n\\end{ex}\n\n`;
const d3 = `\\begin{ex}%[xyz]\n  \\begin{tikzpicture}[tdplot_main_coords]\\draw[->] (0,0,0)--(1,0,0);\\end{tikzpicture}\n  \\choice{\\True $a$}{$b$}{$c$}{$d$}\n\\end{ex}`;

console.log('Xuất nguyên văn');
const a = exportQuestionTex(immini, '0H2V1-1');
ok(a === immini, 'cùng ID: giống từng ký tự (\\immini, \\def, \\newcommand, ghi chú %)');
const b = exportQuestionTex(immini, '0H2H1-1');
ok(b === immini.replace('%[0H2V1-1]', '%[0H2H1-1]'), 'đổi ID: chỉ dòng %[...] khác, mọi thứ khác nguyên vẹn');
const c = exportQuestionTex(tab, '2D1V1-3');
ok(c === tab.trimEnd().replace('\\begin{ex}', '\\begin{ex}%[2D1V1-3]'), 'câu chưa có %[ID]: thêm đúng một dấu, tkz-tab nguyên vẹn, bỏ dòng trống cuối');
ok(exportQuestionTex(d3, '2H3N1-1') === d3.replace('%[xyz]', '%[2H3N1-1]'), 'tikz-3dplot nguyên vẹn');
ok(exportQuestionTex(tab, '—') === tab.trimEnd() && exportQuestionTex(tab, '') === tab.trimEnd(), 'chưa có vị trí ("—"): không ghi mã giả');
ok(exportQuestionTex('Chữ lạ không phải ex', '2D1H1-1') === 'Chữ lạ không phải ex', 'không phải khối ex: không đụng');
const two = '\\begin{ex}\n a\n\\end{ex}\n\\begin{ex}\n b\n\\end{ex}';
ok((exportQuestionTex(two, '1') .match(/%\[1\]/g) ?? []).length === 1, 'chỉ đặt ID ở \\begin{ex} đầu tiên');
const crlf = '\\begin{ex}\r\n  x\r\n\\end{ex}\r\n';
ok(exportQuestionTex(crlf, '2D1H1-1').includes('\r\n  x\r\n'), 'giữ nguyên kiểu xuống dòng của câu');

console.log('Ghép file');
const mk = (n: number, latex: string): Question => ({ uid: 'u' + n, seq: n, latex, type: 'tn', level: 'NB', tags: [], grade: 12, chapterId: '', lessonId: '', formId: '', createdAt: 1, updatedAt: 1 });
const qs = [mk(1, immini), mk(2, tab), mk(3, d3)];
const f = buildTexFile(qs, (q) => (q.seq === 2 ? '—' : `ID${q.seq}`), '% 3 câu');
ok((f.match(/\\begin\{ex\}/g) ?? []).length === 3 && f.startsWith('% 3 câu\n\n') && f.endsWith('\\end{ex}\n'), '3 câu, đủ đầu và cuối');
ok(f.includes('%[ID1]') && f.includes('%[ID3]') && !f.includes('—'), 'ID theo từng câu, không có dấu "—"');
ok(f.includes('% ghi chú giữ lại') && f.includes('\\def\\a{2}') && f.includes('tdplot_main_coords'), 'ghi chú, \\def, 3dplot còn trong file');
const big = Array.from({ length: 3075 }, (_, i) => mk(i, 'x'.repeat(800)));
const mb = exportSizeMB(big);
ok(mb > 2.5 && mb < 3.2, `ước lượng 3.075 câu × 800 ký tự ≈ ${mb.toFixed(1)} MB (không phải 15 MB)`);

if (fail) { console.error(`\n${fail} lỗi`); process.exit(1); }
console.log('\nOK');
