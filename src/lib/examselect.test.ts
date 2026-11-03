import assert from 'node:assert/strict';
import { NO_SELECTION, clickSelect, pickedItems, pruneSelection, runBatch, selectAll, stepSelect } from './examselect';

const t = (name: string, f: () => void | Promise<void>) => Promise.resolve(f()).then(() => console.log('  ✓ ' + name));
const order = ['a', 'b', 'c', 'd', 'e'];
const plain = { ctrl: false, shift: false };
const ids = (s: { picked: ReadonlySet<string> }) => [...s.picked].sort();

console.log('Chọn nhiều đề');
await t('bấm thường chọn một đề', () => {
  const s = clickSelect(clickSelect(NO_SELECTION, 'a', order, plain), 'c', order, plain);
  assert.deepEqual(ids(s), ['c']); assert.equal(s.primary, 'c');
});
await t('Ctrl+bấm thêm rồi bớt', () => {
  let s = clickSelect(NO_SELECTION, 'a', order, plain);
  s = clickSelect(s, 'c', order, { ctrl: true, shift: false });
  assert.deepEqual(ids(s), ['a', 'c']); assert.equal(s.primary, 'c');
  s = clickSelect(s, 'c', order, { ctrl: true, shift: false });
  assert.deepEqual(ids(s), ['a']); assert.equal(s.primary, 'a');
  s = clickSelect(s, 'a', order, { ctrl: true, shift: false });
  assert.deepEqual(ids(s), []); assert.equal(s.primary, null);
});
await t('Shift+bấm chọn đoạn từ điểm mốc, cả khi bấm ngược', () => {
  let s = clickSelect(NO_SELECTION, 'b', order, plain);
  s = clickSelect(s, 'd', order, { ctrl: false, shift: true });
  assert.deepEqual(ids(s), ['b', 'c', 'd']);
  s = clickSelect(s, 'a', order, { ctrl: false, shift: true });
  assert.deepEqual(ids(s), ['a', 'b']); // điểm mốc vẫn là b
});
await t('Ctrl+Shift cộng đoạn vào vùng đang chọn', () => {
  let s = clickSelect(NO_SELECTION, 'a', order, plain);
  s = clickSelect(s, 'd', order, { ctrl: true, shift: false });
  s = clickSelect(s, 'e', order, { ctrl: true, shift: true });
  assert.deepEqual(ids(s), ['a', 'd', 'e']);
});
await t('Shift khi chưa có điểm mốc coi như chọn thêm đề đó', () => {
  const s = clickSelect(NO_SELECTION, 'c', order, { ctrl: false, shift: true });
  assert.deepEqual(ids(s), ['c']);
});
await t('mũi tên di chuyển; Shift+mũi tên mở rộng', () => {
  let s = clickSelect(NO_SELECTION, 'b', order, plain);
  s = stepSelect(s, order, 1, false); assert.deepEqual(ids(s), ['c']);
  s = stepSelect(s, order, 1, true); assert.deepEqual(ids(s), ['c', 'd']);
  s = stepSelect(s, order, 1, true); assert.deepEqual(ids(s), ['c', 'd', 'e']);
  s = stepSelect(s, order, 1, true); assert.deepEqual(ids(s), ['c', 'd', 'e']); // hết danh sách
  assert.deepEqual(ids(stepSelect(NO_SELECTION, order, 1, false)), ['a']);
  assert.deepEqual(ids(stepSelect(NO_SELECTION, [], 1, false)), []);
});
await t('chọn tất cả; bỏ đề đã biến mất', () => {
  const all = selectAll(order);
  assert.equal(all.picked.size, 5);
  const p = pruneSelection(all, new Set(['a', 'b', 'x']));
  assert.deepEqual(ids(p), ['a', 'b']);
  assert.ok(p.primary === 'a' || p.primary === 'b');
  assert.equal(pruneSelection(p, new Set(['a', 'b'])), p); // không đổi gì thì giữ nguyên đối tượng
  assert.equal(pruneSelection(p, new Set()).primary, null);
});
await t('lấy đề đã chọn theo thứ tự trên màn', () => {
  const items = order.map((id) => ({ id }));
  const s = clickSelect(clickSelect(NO_SELECTION, 'd', order, plain), 'b', order, { ctrl: true, shift: false });
  assert.deepEqual(pickedItems(items, s).map((x) => x.id), ['b', 'd']);
});
await t('chạy lô: một đề lỗi không làm dừng các đề sau', async () => {
  const r = await runBatch([1, 2, 3, 4], async (n) => { if (n === 2) throw new Error('hỏng'); });
  assert.deepEqual(r.done, [1, 3, 4]);
  assert.equal(r.failed.length, 1); assert.equal(r.failed[0].item, 2); assert.equal(r.failed[0].error, 'hỏng');
});
