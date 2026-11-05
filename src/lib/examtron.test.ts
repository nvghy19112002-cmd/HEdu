// Trộn có điều kiện: ghim vị trí câu, giữ phương án, cân bằng đáp án, đối chiếu với câu gốc.
import assert from 'node:assert/strict';
import { keyStats, makeVariants, shuffleWithPins, verifyAgainstOriginal, type Picked } from './examgen';
import type { Question } from './types';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
let n = 0;
const mk = (correct: number, extra = ''): Question => {
  n++;
  const opt = [0, 1, 2, 3].map((i) => `{${i === correct ? '\\True ' : ''}$x_${n}_${i}$}`).join('\n  ');
  return { uid: `u${n}`, seq: n, latex: `\\begin{ex}\n  Câu ${n}. ${extra}\n  \\choice\n  ${opt}\n  \\loigiai{Lời giải ${n}}\n\\end{ex}`, type: 'tn', level: 'NB', tags: [], createdAt: 0, updatedAt: 0, grade: 12, chapterId: 'c', lessonId: 'l', formId: 'f' } as unknown as Question;
};
const picked = (qs: Question[]): Picked => ({ p1: qs, p2: [], p3: [], p4: [] });
const base = { count: 4, firstCode: 101, shuffleQuestions: true, shuffleOptions: true, seed: 5, keepFirstOriginal: true };

t('ghim câu: đứng đúng vị trí cũ ở mọi mã, các câu khác vẫn được trộn', () => {
  const qs = Array.from({ length: 10 }, (_, i) => mk(i % 4));
  const pin = new Set([qs[0].uid, qs[4].uid]);
  const vs = makeVariants(picked(qs), { ...base, pinned: pin });
  for (const v of vs) { assert.equal(v.parts.p1[0].q.uid, qs[0].uid); assert.equal(v.parts.p1[4].q.uid, qs[4].uid); }
  assert.ok(vs.slice(1).some((v) => v.parts.p1.some((s, i) => s.q.uid !== qs[i].uid)), 'các câu không ghim phải được trộn');
  assert.deepEqual(verifyAgainstOriginal(vs, picked(qs), pin), []);
});

t('không ghim thì trộn y như trước (cùng hạt giống ⇒ cùng kết quả)', () => {
  const qs = Array.from({ length: 8 }, (_, i) => mk(i % 4));
  const a = makeVariants(picked(qs), base).map((v) => v.parts.p1.map((s) => s.q.uid + s.key).join());
  const b = makeVariants(picked(qs), { ...base, pinned: new Set() }).map((v) => v.parts.p1.map((s) => s.q.uid + s.key).join());
  assert.deepEqual(a, b);
});

t('giữ phương án: câu đó không đổi A–D ở mọi mã', () => {
  const qs = Array.from({ length: 6 }, (_, i) => mk(i % 4));
  const fixed = new Set([qs[2].uid]);
  const vs = makeVariants(picked(qs), { ...base, fixedOptions: fixed });
  for (const v of vs) { const s = v.parts.p1.find((x) => x.q.uid === qs[2].uid)!; assert.equal(s.latex, qs[2].latex); }
  assert.deepEqual(verifyAgainstOriginal(vs, picked(qs)), []);
});

t('cân bằng đáp án: mỗi mã gần đều A–D, ít câu trùng đáp án ở mọi mã', () => {
  const qs = Array.from({ length: 20 }, () => mk(0));
  const vs = makeVariants(picked(qs), { ...base, count: 4, balanceKeys: true });
  for (const c of keyStats(vs).perCode.slice(1)) { const [mn, mx] = [Math.min(...c.counts), Math.max(...c.counts)]; assert.ok(mx - mn <= 4, `lệch ${c.counts}`); }
  const plain = keyStats(makeVariants(picked(qs), { ...base, count: 4 })).sameEverywhere.length;
  assert.ok(keyStats(vs).sameEverywhere.length <= plain);
  assert.deepEqual(verifyAgainstOriginal(vs, picked(qs)), []);
});

t('đối chiếu bắt được đáp án bị sai và phương án bị sửa', () => {
  const qs = Array.from({ length: 5 }, (_, i) => mk(i % 4));
  const vs = makeVariants(picked(qs), base);
  const bad = vs.map((v) => ({ ...v, parts: { ...v.parts, p1: v.parts.p1.map((s, i) => (v.code === '102' && i === 1 ? { ...s, key: s.key === 'A' ? 'B' : 'A' } : s)) } }));
  assert.ok(verifyAgainstOriginal(bad, picked(qs)).some((x) => /đáp án/.test(x.msg)));
  const bad2 = vs.map((v) => ({ ...v, parts: { ...v.parts, p1: v.parts.p1.map((s, i) => (v.code === '103' && i === 0 ? { ...s, latex: s.latex.replace(/x_/, 'y_') } : s)) } }));
  assert.ok(verifyAgainstOriginal(bad2, picked(qs)).length > 0);
  const bad3 = vs.map((v) => (v.code === '101' ? { ...v, parts: { ...v.parts, p1: v.parts.p1.slice(1) } } : v));
  assert.ok(verifyAgainstOriginal(bad3, picked(qs)).some((x) => /tập câu/.test(x.msg)));
});

t('shuffleWithPins giữ chỉ số ghim và là hoán vị', () => {
  const qs = Array.from({ length: 6 }, (_, i) => mk(i % 4));
  let r = 1; const rand = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  const out = shuffleWithPins(qs, new Set([qs[1].uid]), rand);
  assert.equal(out[1].uid, qs[1].uid); assert.deepEqual(out.map((q) => q.uid).sort(), qs.map((q) => q.uid).sort());
});
