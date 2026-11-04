import assert from 'node:assert/strict';
import { addToReport, emptyReport, HEALTH, healthFlags, type EffState } from './bankhealth';
import type { Question } from './types';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const mk = (uid: string, latex: string, o: Partial<Question> = {}): Question => ({ uid, seq: 1, latex, type: 'tn', level: 'TH', grade: 12, chapterId: 'c', lessonId: 'l', formId: 'f', tags: [], createdAt: 0, updatedAt: 0, ...o });
const GOOD = '\\begin{ex}\n Cho $x=1$. Tính $x+1$.\n \\choice{\\True $2$}{$3$}{$4$}{$5$}\n \\loigiai{Thay vào.}\n\\end{ex}';
const NO_TRUE = '\\begin{ex}\n Cho $x=1$.\n \\choice{$2$}{$3$}{$4$}{$5$}\n\\end{ex}';
const BAD_MATH = '\\begin{ex}\n Cho $\\frac{1}{$ lệch.\n \\choice{\\True $2$}{$3$}{$4$}{$5$}\n \\loigiai{x}\n\\end{ex}';
const VERIFIED: EffState = { form: 'gv', level: 'gv', unclassified: false };
const NONE: EffState = { form: 'chua', level: 'chua', unclassified: false };

console.log('Sức khoẻ ngân hàng');
t('câu tốt, đã xác minh và đã duyệt: không có vấn đề nào', () => {
  assert.deepEqual(healthFlags(mk('a', GOOD, { review: 'approved' }), VERIFIED), []);
});
t('câu mới nhập: chưa kiểm tra, Dạng và mức độ chưa xác minh', () => {
  assert.deepEqual(healthFlags(mk('a', GOOD), NONE).sort(), ['chua-kiem', 'dang-chua-xm', 'muc-chua-xm']);
});
t('chưa phân loại tính là chua-id, không tính thêm "Dạng chưa xác minh"', () => {
  const f = healthFlags(mk('a', GOOD, { review: 'approved' }), { form: 'chua', level: 'gv', unclassified: true });
  assert.deepEqual(f, ['chua-id']);
});
t('thiếu \\True ⇒ không đọc chắc được đáp án; thiếu lời giải được ghi', () => {
  const f = healthFlags(mk('a', NO_TRUE, { review: 'approved' }), VERIFIED);
  assert.ok(f.includes('dap-an') && f.includes('thieu-loi-giai'));
});
t('công thức hỏng ⇒ lỗi xem trước; câu cần sửa ⇒ can-sua (không kèm chua-kiem)', () => {
  const f = healthFlags(mk('a', BAD_MATH, { review: 'needs_fix' }), VERIFIED);
  assert.ok(f.includes('loi-xem-truoc') && f.includes('can-sua') && !f.includes('chua-kiem'));
});
t('ký tự điều khiển ẩn được báo', () => {
  assert.ok(healthFlags(mk('a', GOOD.replace('Tính', 'Tí\u0008nh'), { review: 'approved' }), VERIFIED).includes('ky-tu-dk'));
});
t('tự luận không bị đòi đáp án', () => {
  const tl = '\\begin{ex}\n Chứng minh rằng $a>0$.\n \\loigiai{Ta có.}\n\\end{ex}';
  assert.ok(!healthFlags(mk('a', tl, { type: 'tl', review: 'approved' }), VERIFIED).includes('dap-an'));
});
t('báo cáo: đếm từng vấn đề, giữ uid, và đếm câu sạch (chỉ vấn đề loi/canh làm câu "không sạch")', () => {
  const r = emptyReport(3);
  addToReport(r, 'a', []);
  addToReport(r, 'b', ['chua-kiem', 'muc-chua-xm']);
  addToReport(r, 'c', ['dap-an', 'chua-kiem']);
  assert.equal(r.scanned, 3); assert.equal(r.clean, 2);
  assert.equal(r.counts['chua-kiem'], 2); assert.deepEqual(r.uids['chua-kiem'], ['b', 'c']);
  assert.equal(r.counts['dap-an'], 1);
  assert.equal(new Set(HEALTH.map((h) => h.key)).size, HEALTH.length, 'khoá không trùng');
});
