// Duyệt hàng loạt các câu ĐÃ CÓ ID (thuần, có kiểm thử): "Đã duyệt" (nội dung) + giáo viên xác minh Dạng và mức độ.
// Không đụng câu chưa có ID, câu giáo viên đã đánh "Cần sửa" (mặc định), câu có Dạng "cần xem lại". Việc ghi do màn Sức khoẻ ngân hàng làm.
import type { EffState } from './bankhealth';
import type { Question } from './types';

export interface ApprovePlan {
  /** câu đủ điều kiện (đã có ID, không bị loại) */
  eligible: string[];
  /** cần đặt "Đã duyệt" */
  review: string[];
  /** cần xác minh Dạng và/hoặc mức độ */
  verify: string[];
  /** không cần làm gì (đã đủ cả hai) */
  already: number;
  skippedNoId: number;
  skippedNeedsFix: number;
  skippedXemLai: number;
}

export function planApprove(qs: readonly Question[], effOf: (q: Question) => EffState, opts: { includeNeedsFix?: boolean } = {}): ApprovePlan {
  const p: ApprovePlan = { eligible: [], review: [], verify: [], already: 0, skippedNoId: 0, skippedNeedsFix: 0, skippedXemLai: 0 };
  for (const q of qs) {
    const e = effOf(q);
    if (e.unclassified) { p.skippedNoId++; continue; }
    if (e.form === 'xem-lai') { p.skippedXemLai++; continue; }
    if (q.review === 'needs_fix' && !opts.includeNeedsFix) { p.skippedNeedsFix++; continue; }
    p.eligible.push(q.uid);
    const needReview = q.review !== 'approved';
    const needVerify = e.form !== 'gv' || e.level !== 'gv';
    if (needReview) p.review.push(q.uid);
    if (needVerify) p.verify.push(q.uid);
    if (!needReview && !needVerify) p.already++;
  }
  return p;
}
