import assert from 'node:assert/strict';
import { batchCandidates, BATCH_IMPORT_MAX, summarizeBatch } from './examimportbatch';
import type { ScanFile } from './importfiles';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
// rel như scanSources thật: bắt đầu bằng tên thư mục đã chọn ("De")
const F = (rel: string, name: string): ScanFile => ({ path: `D:\\De\\${rel ? rel.replace(/\//g, '\\') + '\\' : ''}${name}`, name, rel: rel ? `De/${rel}` : 'De', bytes: 10 });

console.log('Nhập nhiều đề từ thư mục');
t('tệp .tex thẳng trong thư mục = một đề một tệp; thư mục con = một đề nhiều tệp', () => {
  const r = batchCandidates('D:\\De', [F('', 'GK1 lop 12.tex'), F('', 'ghi chu.txt'), F('CK1', 'main.tex'), F('CK1', 'cauhoi.tex'), F('CK1/hinh', 'a.tex'), F('Thi thu', 'de.tex'), F('', 'GK2 lop 12.tex')]);
  assert.deepEqual(r.items.map((x) => [x.kind, x.name, x.texCount]), [['folder', 'CK1', 3], ['file', 'GK1 lop 12', 1], ['file', 'GK2 lop 12', 1], ['folder', 'Thi thu', 1]]);
  assert.equal(r.items[0].path, 'D:\\De\\CK1');
  assert.equal(r.items[1].path, 'D:\\De\\GK1 lop 12.tex');
  assert.equal(r.truncated, false);
});
t('sắp xếp tự nhiên (đề 2 trước đề 10); thư mục chọn có dấu gạch chéo cuối vẫn đúng', () => {
  const r = batchCandidates('D:/De/', [F('', 'de10.tex'), F('', 'de2.tex'), F('x', 'a.tex')]);
  assert.deepEqual(r.items.map((x) => x.name), ['de2', 'de10', 'x']);
  assert.equal(r.items[2].path, 'D:/De/x');
});
t('thư mục chỉ có tệp không phải .tex: không thành đề; quá nhiều đề: cắt và báo', () => {
  assert.equal(batchCandidates('D:\\De', [F('anh', 'a.png'), F('', 'x.txt')]).items.length, 0);
  const many = Array.from({ length: BATCH_IMPORT_MAX + 5 }, (_, i) => F('', `d${i}.tex`));
  const r = batchCandidates('D:\\De', many);
  assert.equal(r.items.length, BATCH_IMPORT_MAX); assert.equal(r.truncated, true);
});
t('tóm tắt lô', () => {
  assert.match(summarizeBatch([{ name: 'a', ok: true, message: '' }]), /Đã nhập 1 đề/);
  const s = summarizeBatch([{ name: 'a', ok: true, message: '' }, { name: 'b', ok: false, message: 'thiếu tệp chính' }]);
  assert.match(s, /1\/2 đề.*“b” \(thiếu tệp chính\)/);
});
