// Ghi kết quả của `planApprove`: điểm khôi phục → "Đã duyệt" (một lần ghi) → xác minh Dạng + mức độ (một lần ghi, có hoàn lại nếu lỗi).
import type { ApprovePlan } from './approveids';
import type { EffState } from './bankhealth';
import { ensureRestorePoint } from './dbbackup';
import { commitRecs, getRec, keepNoId, makeRec } from './idreview';
import { withReview } from './batchops';
import { getState, updateMany } from './store';
import type { Question } from './types';

export async function approveRun(plan: ApprovePlan, taxRev: string, effOf: (q: Question) => EffState): Promise<{ ok: boolean; text: string }> {
  const rp = await ensureRestorePoint('thu-cong');
  if (!rp.ok) return { ok: false, text: `Chưa tạo được điểm khôi phục nên CHƯA đổi gì: ${rp.message}` };
  const r = await updateMany(plan.review, withReview('approved'));
  if (!r.ok) return { ok: false, text: 'Chưa ghi được “Đã duyệt” xuống đĩa nên chưa đổi gì. Kiểm tra ổ đĩa rồi thử lại.' };
  const byUid = new Map(getState().questions.map((q) => [q.uid, q] as const));
  const recs: [string, ReturnType<typeof makeRec>][] = [];
  for (const uid of plan.verify) {
    const q = byUid.get(uid);
    if (!q) continue;
    const e = effOf(q);
    const prev = getRec(uid);
    recs.push([uid, makeRec(q, { form: 'gv', level: 'gv', src: prev?.src ?? 'tay', taxRev, why: 'Duyệt hàng loạt các câu đã có ID', ...keepNoId(e) })]);
  }
  const ok = await commitRecs(recs);
  if (!ok) return { ok: false, text: `Đã đặt “Đã duyệt” cho ${r.changed} câu nhưng chưa ghi được xác minh Dạng/mức độ. Bấm lại để làm nốt phần còn lại.` };
  return { ok: true, text: `Xong: “Đã duyệt” ${r.changed} câu, xác minh Dạng/mức độ ${recs.length} câu. Điểm khôi phục đã tạo trước khi ghi (Cài đặt › Sao lưu).` };
}
