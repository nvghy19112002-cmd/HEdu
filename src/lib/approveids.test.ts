import assert from 'node:assert/strict';
import { planApprove } from './approveids';
import type { EffState } from './bankhealth';
import type { Question } from './types';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const q = (uid: string, review?: 'approved' | 'needs_fix'): Question => ({ uid, seq: 1, latex: '', type: 'tn', level: 'NB', tags: [], createdAt: 0, updatedAt: 0, grade: 12, chapterId: '', lessonId: '', formId: '', ...(review ? { review } : {}) } as unknown as Question);
const E: Record<string, EffState> = {
  a: { form: 'chua', level: 'chua', unclassified: false },
  b: { form: 'gv', level: 'gv', unclassified: false },
  c: { form: 'chua', level: 'chua', unclassified: true },
  d: { form: 'xem-lai', level: 'gv', unclassified: false },
  e: { form: 'may', level: 'may', unclassified: false },
  f: { form: 'gv', level: 'chua', unclassified: false },
};
const eff = (x: Question) => E[x.uid];

t('chỉ chọn câu đã có ID; bỏ câu chưa có ID, cần xem lại, Cần sửa', () => {
  const p = planApprove([q('a'), q('b', 'approved'), q('c'), q('d'), q('e', 'needs_fix')], eff);
  assert.deepEqual(p.eligible, ['a', 'b']);
  assert.equal(p.skippedNoId, 1); assert.equal(p.skippedXemLai, 1); assert.equal(p.skippedNeedsFix, 1);
});

t('đã đủ duyệt + xác minh thì không làm lại', () => {
  const p = planApprove([q('b', 'approved')], eff);
  assert.equal(p.already, 1); assert.deepEqual(p.review, []); assert.deepEqual(p.verify, []);
});

t('thiếu một trong hai thì chỉ làm phần thiếu', () => {
  const p = planApprove([q('b'), q('f', 'approved')], eff);
  assert.deepEqual(p.review, ['b']); assert.deepEqual(p.verify, ['f']);
});

t('tuỳ chọn gồm cả câu Cần sửa', () => {
  const p = planApprove([q('e', 'needs_fix')], eff, { includeNeedsFix: true });
  assert.deepEqual(p.eligible, ['e']); assert.deepEqual(p.review, ['e']); assert.deepEqual(p.verify, ['e']);
});
