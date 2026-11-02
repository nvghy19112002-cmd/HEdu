import { beginAtEnd, docCommands, docEnvs, envBlock, lastOpenEnv, needsEnd, TEX_COMMANDS, TEX_ENVS, toggleCommentLines, uncommentLines } from './texedit';

let fails = 0;
const t = (name: string, ok: boolean) => { if (!ok) { fails++; console.log(`  ✗ ${name}`); } else console.log(`  ✓ ${name}`); };

t('nhận \\begin{ex} ở cuối dòng', beginAtEnd('  \\begin{ex}') === 'ex');
t('nhận \\begin có tham số', beginAtEnd('\\begin{tabular}{|c|c|}') === 'tabular' && beginAtEnd('\\begin{enumerate}[label=\\alph*)]') === 'enumerate');
t('nhận môi trường có dấu *', beginAtEnd('\\begin{align*}') === 'align*');
t('chữ sau \\begin{…} ⇒ không tự đóng', beginAtEnd('\\begin{ex} Cho hàm số') === null);
t('dòng chú thích ⇒ không tự đóng', beginAtEnd('% \\begin{ex}') === null);
t('\\% không phải chú thích', beginAtEnd('50\\% \\begin{center}') === 'center');

t('thiếu \\end ⇒ cần đóng', needsEnd('\\begin{ex}\nabc\n', 'ex'));
t('đủ \\end ⇒ không thêm', !needsEnd('\\begin{ex}\nabc\n\\end{ex}\n', 'ex'));
t('\\end bị chú thích không tính', needsEnd('\\begin{ex}\n%\\end{ex}\n', 'ex'));
t('môi trường khác tên không ảnh hưởng', needsEnd('\\begin{ex}\n\\begin{center}\\end{center}', 'ex') && !needsEnd('\\begin{ex}\n\\begin{center}\\end{center}', 'center'));
t('tên có * không vỡ biểu thức', needsEnd('\\begin{align*}', 'align*') && !needsEnd('\\begin{align*}\\end{align*}', 'align*'));

const lines = ['\\begin{ex}', 'Cho', '\\begin{ex}', 'lồng', '\\end{ex}', '\\choice', '\\end{ex}', 'sau'];
t('khối thu gọn: tìm đúng \\end khớp (có lồng)', envBlock(lines, 0)?.end === 6 && envBlock(lines, 2)?.end === 4);
t('khối trên một dòng ⇒ không thu gọn', envBlock(['\\begin{center}x\\end{center}'], 0) === null);
t('dòng không có \\begin ⇒ null', envBlock(lines, 1) === null);
t('thiếu \\end ⇒ null', envBlock(['\\begin{ex}', 'a'], 0) === null);
t('\\end trong chú thích bị bỏ qua', envBlock(['\\begin{ex}', '% \\end{ex}', '\\end{ex}'], 0)?.end === 2);

t('lệnh trong tệp (kể cả lệnh tự định nghĩa)', (() => { const c = docCommands('\\newcommand{\\TieuDeDeSo}[1]{} \\TieuDeDeSo{a} $\\dfrac12$ \\\\'); return c.includes('TieuDeDeSo') && c.includes('dfrac') && c.includes('newcommand') && !c.includes(''); })());
t('môi trường trong tệp', docEnvs('\\begin{ex}\\begin{tikzpicture}\\begin{ex}').join() === 'ex,tikzpicture');
t('danh sách lệnh không trùng tên', new Set(TEX_COMMANDS.map((c) => c.name)).size === TEX_COMMANDS.length);
t('danh sách môi trường không trùng tên', new Set(TEX_ENVS.map((e) => e.name)).size === TEX_ENVS.length);
t('mẫu lệnh không chứa \\{ dễ hiểu nhầm là ô Tab', TEX_COMMANDS.every((c) => !c.tpl || !/[#$]\{[^}]*\\[{}]/.test(c.tpl)));

t('Alt+Enter: đóng môi trường trong cùng còn mở', lastOpenEnv('\\begin{ex}\n\\begin{center}\nabc') === 'center' && lastOpenEnv('\\begin{ex}\n\\begin{center}x\\end{center}\n') === 'ex');
t('Alt+Enter: không còn môi trường mở ⇒ null; bỏ qua chú thích', lastOpenEnv('\\begin{ex}\\end{ex}') === null && lastOpenEnv('% \\begin{ex}\n') === null);

t('Ctrl+T: thêm % ở đầu dòng (kể cả dòng thụt lề), giữ dòng trống', toggleCommentLines(['a', '', '  b']).join('|') === '%a||%  b');
t('Ctrl+T lần nữa: bỏ % (về như cũ)', toggleCommentLines(toggleCommentLines(['a', '', '  b'])).join('|') === 'a||  b');
t('Ctrl+T: lẫn dòng có/không % ⇒ thêm % cho tất cả', toggleCommentLines(['%a', 'b']).join('|') === '%%a|%b');
t('Ctrl+U: bỏ một % sau khoảng trắng, dòng không % giữ nguyên', uncommentLines(['  %a', '%%b', 'c']).join('|') === '  a|%b|c');

if (fails) { console.log(`\n${fails} test lỗi`); process.exit(1); }
console.log('\nOK');
