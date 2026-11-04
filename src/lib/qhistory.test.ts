import assert from 'node:assert/strict';
import { addVersion, KEEP_PER_QUESTION, parse, serialize, trimTotal, type History } from './qhistory';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };

console.log('Lịch sử phiên bản của câu');
t('thêm bản cũ; bỏ bản rỗng và bản trùng bản liền trước', () => {
  const h: History = new Map();
  assert.equal(addVersion(h, 'u', 'A', 1), true);
  assert.equal(addVersion(h, 'u', 'A', 2), false);
  assert.equal(addVersion(h, 'u', '  ', 3), false);
  assert.equal(addVersion(h, 'u', 'B', 4), true);
  assert.equal(addVersion(h, 'u', 'A', 5), true, 'quay lại bản cũ hơn vẫn là một bản mới');
  assert.deepEqual(h.get('u')!.map((v) => v.latex), ['A', 'B', 'A']);
});
t('chỉ giữ KEEP_PER_QUESTION bản mới nhất mỗi câu', () => {
  const h: History = new Map();
  for (let i = 0; i < KEEP_PER_QUESTION + 7; i++) addVersion(h, 'u', `v${i}`, i);
  const l = h.get('u')!;
  assert.equal(l.length, KEEP_PER_QUESTION);
  assert.equal(l[0].latex, 'v7'); assert.equal(l[l.length - 1].latex, `v${KEEP_PER_QUESTION + 6}`);
});
t('vượt trần tổng dung lượng: bỏ bản cũ nhất của mọi câu trước, giữ bản mới', () => {
  const h: History = new Map();
  addVersion(h, 'a', 'x'.repeat(400), 1);
  addVersion(h, 'b', 'y'.repeat(400), 2);
  addVersion(h, 'a', 'z'.repeat(400), 3);
  addVersion(h, 'c', 'w'.repeat(400), 4);
  trimTotal(h, 1000);
  const total = [...h.values()].flat().reduce((s, v) => s + v.latex.length, 0);
  assert.ok(total <= 1000);
  assert.ok(!h.get('a')?.some((v) => v.at === 1), 'bản cũ nhất bị bỏ');
  assert.ok(h.get('c')?.some((v) => v.at === 4), 'bản mới nhất còn');
  trimTotal(h, 10_000_000); // dưới trần: không đụng
  assert.equal([...h.values()].flat().length >= 2, true);
});
t('lưu/đọc: hỏng, sai phiên bản hoặc phần tử lạ thì bỏ qua', () => {
  const h: History = new Map(); addVersion(h, 'u', 'A', 1); addVersion(h, 'u', 'B', 2);
  const back = parse(serialize(h));
  assert.deepEqual(back.get('u'), h.get('u'));
  assert.equal(parse('{hong').size, 0); assert.equal(parse(null).size, 0); assert.equal(parse('{"v":2,"h":{}}').size, 0);
  const odd = parse('{"v":1,"h":{"u":[{"at":1,"latex":"ok"},{"at":"x"},null,5],"w":"khong-phai-mang"}}');
  assert.deepEqual(odd.get('u'), [{ at: 1, latex: 'ok' }]); assert.ok(!odd.has('w'));
});
