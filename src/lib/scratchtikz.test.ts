import assert from 'node:assert/strict';
import { figLabel, khoLatex, scratchFigures } from './scratchtikz';
import { scanScratch } from './texscratch';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const B = '\\begin{tikzpicture}';
const E = '\\end{tikzpicture}';
const text = [
  `${B}\\draw (0,0)--(1,0);${E}`, // dòng 1: ngoài câu
  '\\begin{ex}',
  '\\def\\a{2}',
  'Cho hình',
  B,
  '\\draw (0,0) circle (\\a);',
  E,
  `% ${B}\\draw (9,9);${E}`, // bị chú thích
  `và ${B}\\fill (0,0) circle (1pt);${E}`,
  '\\end{ex}',
  '\\begin{ex}',
  `Câu không hình`,
  '\\end{ex}',
  '\\begin{ex}',
  `${B}\\draw (0,0)--(0,1);${E}`,
  '\\end{ex}',
].join('\n');
const scan = scanScratch(text);

console.log('Hình TikZ của bàn nháp');
t('bốc đủ hình, bỏ hình bị chú thích, ghi câu và dòng', () => {
  const fs = scratchFigures(text, scan);
  assert.deepEqual(fs.map((f) => [f.i, f.n, f.k, f.line]), [[1, null, 1, 1], [2, 1, 1, 5], [3, 1, 2, 9], [4, 3, 1, 15]]);
  assert.equal(fs[1].lines, 3);
  assert.ok(fs[1].code.startsWith(B) && fs[1].code.endsWith(E), 'giữ nguyên văn mã hình');
});
t('khai báo đi theo câu chứa hình', () => {
  const fs = scratchFigures(text, scan);
  assert.ok(fs[1].defs.includes('\\def\\a{2}'));
  assert.equal(fs[3].defs, '');
  assert.equal(fs[0].defs, '');
});
t('chỉ lấy hình trong các câu đã chọn', () => {
  assert.deepEqual(scratchFigures(text, scan, new Set([3])).map((f) => f.n), [3]);
  assert.equal(scratchFigures(text, scan, new Set()).length, 4, 'tập rỗng = tất cả');
});
t('nhãn và văn bản lưu Kho', () => {
  const fs = scratchFigures(text, scan);
  assert.equal(figLabel(fs[1]), 'Câu 1 · dòng 5');
  assert.equal(figLabel(fs[2]), 'Câu 1 · hình 2 · dòng 9');
  assert.equal(figLabel(fs[0]), 'Ngoài câu · hình 1 · dòng 1');
  assert.ok(khoLatex(fs[1]).startsWith('\\def\\a{2}\n' + B));
  assert.equal(khoLatex(fs[3]), fs[3].code);
});
t('vị trí bắt đầu trỏ đúng mã hình (để áp dụng bản sửa đúng chỗ)', () => {
  for (const f of scratchFigures(text, scan)) assert.equal(text.slice(f.start, f.start + f.code.length), f.code);
});
