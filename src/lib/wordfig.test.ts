import assert from 'node:assert/strict';
import { fillWidths, prepareBody, strangeCommands } from './wordfig';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };

console.log('Chuẩn bị mã đề cho Word');
t('bỏ dòng \\def\\made, \\def\\socau…, giữ phần còn lại', () => {
  const { body, figs } = prepareBody('\\def\\made{101}\n\\def\\socaulc{4}\n\\begin{ex}\nA\n\\end{ex}\n');
  assert.ok(!body.includes('\\def\\made') && !body.includes('socaulc'));
  assert.ok(body.includes('\\begin{ex}')); assert.equal(figs.length, 0);
});
t('mỗi hình TikZ thành một lệnh chèn ảnh, mã hình được giữ nguyên', () => {
  const tex = 'Cho hình\n\\begin{tikzpicture}[scale=1]\n\\draw (0,0)--(1,1);\n\\end{tikzpicture}\nvà\n\\begin{tikzpicture}\\draw (0,0) circle (1);\\end{tikzpicture}\n';
  const { body, figs } = prepareBody(tex);
  assert.equal(figs.length, 2);
  assert.equal(figs[0].name, 'wfig1.png'); assert.ok(figs[0].code.startsWith('\\begin{tikzpicture}[scale=1]') && figs[0].code.endsWith('\\end{tikzpicture}'));
  assert.ok(body.includes('{wfig1.png}') && body.includes('{wfig2.png}') && !body.includes('tikzpicture'));
  assert.ok(body.includes('Cho hình') && body.includes('và'));
});
t('hình nằm trong chú thích (%) không bị lấy', () => {
  const { body, figs } = prepareBody('% \\begin{tikzpicture}\\end{tikzpicture}\nchữ\n');
  assert.equal(figs.length, 0); assert.ok(body.includes('% \\begin{tikzpicture}'));
});
t('điền chiều rộng cm', () => {
  const { body } = prepareBody('\\begin{tikzpicture}\\end{tikzpicture}');
  assert.equal(fillWidths(body, [4.256]), '\\includegraphics[width=4.26cm]{wfig1.png}');
});
t('báo lệnh lạ ngoài công thức, bỏ qua lệnh đã biết, công thức và chú thích', () => {
  const body = '\\begin{ex}\nThử \\dongcham{3} $\\frac{1}{2}\\mathscr{A}$ \\textbf{đậm} % \\anloigiai\n\\choice{$1$}{$2$}{$3$}{$4$}\n\\vspace{2cm}\n\\end{ex}';
  assert.deepEqual(strangeCommands(body), ['dongcham']);
});
