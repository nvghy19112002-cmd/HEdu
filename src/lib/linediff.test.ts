import assert from 'node:assert/strict';
import { collapseDiff, diffLines, diffStat } from './linediff';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const show = (a: string, b: string) => diffLines(a, b).map((o) => (o.t === 'same' ? ' ' : o.t === 'add' ? '+' : '-') + o.text).join('|');

console.log('So sánh theo dòng');
t('giống hệt, thêm dòng, bỏ dòng, đổi dòng', () => {
  assert.equal(show('a\nb\nc', 'a\nb\nc'), ' a| b| c');
  assert.equal(show('a\nc', 'a\nb\nc'), ' a|+b| c');
  assert.equal(show('a\nb\nc', 'a\nc'), ' a|-b| c');
  assert.equal(show('a\nb\nc', 'a\nX\nc'), ' a|-b|+X| c');
});
t('chèn giữa hai khối giống nhau; thứ tự thêm/bớt ổn định', () => {
  assert.equal(show('1\n2\n3\n4\n5', '1\n3\n4\n6'), ' 1|-2| 3| 4|-5|+6');
});
t('một bên rỗng', () => {
  assert.equal(show('', 'a'), '-|+a');
  assert.equal(show('a', ''), '-a|+');
});
t('thống kê và rút gọn đoạn giống nhau dài', () => {
  const a = Array.from({ length: 30 }, (_, i) => `d${i}`).join('\n');
  const b = a.replace('d15', 'THAY');
  const ops = diffLines(a, b);
  assert.deepEqual(diffStat(ops), { add: 1, del: 1 });
  const c = collapseDiff(ops, 2);
  assert.deepEqual(c.map((x) => x.t), ['skip', 'same', 'same', 'del', 'add', 'same', 'same', 'skip']);
  assert.equal((c[0] as { n: number }).n, 13);
  assert.equal(collapseDiff(diffLines('a', 'a'), 2).length, 1, 'không có gì đổi ⇒ một dòng skip');
});
t('đoạn đổi quá lớn: thay thế toàn bộ, không treo', () => {
  const big = (p: string) => Array.from({ length: 2500 }, (_, i) => `${p}${i}`).join('\n');
  const ops = diffLines(big('a'), big('b'));
  assert.deepEqual(diffStat(ops), { add: 2500, del: 2500 });
});
