// Hàng đợi xác minh từng câu (PR 1E): giáo viên xem một câu, xác nhận Dạng/mức độ hoặc đổi sang Dạng đúng, bằng phím tắt, có Hoàn tác.
// Phần thuần + ghi dữ liệu nằm ở đây để kiểm thử bằng đúng luồng thực tế (store + tệp phụ); màn hình chỉ vẽ và nối phím.
//   - Duyệt NỘI DUNG (`Question.review`) là việc khác: hàng đợi này không đổi nó.
//   - Chỉ hành động xác nhận của giáo viên tạo trạng thái "giáo viên xác minh"; mọi lần đổi đều lưu lịch sử (idreview.putRecs).
//   - Đổi Dạng = đổi vị trí VÀ ghi ID6 mới vào `%[ID]` cùng lúc (quy tắc 10), mức độ giữ nguyên (quy tắc 12); không ghi được thì không đổi gì.
import { effectiveOf, flushIdReview, getRec, makeRec, putRecs, type Effective, type FormState, type ReviewRec } from './idreview';
import { placeWithId } from './idsync';
import { getState, updateMany } from './store';
import type { TaxIndex } from './taxonomy';
import { checkLocation, locationOfForm } from './taxpath';
import type { Level, Location, Question, Taxonomy } from './types';

/** Nhóm cần xử lý trong hàng đợi, theo thứ tự ưu tiên: cần xem lại → chưa phân loại → máy phân loại → chưa xác minh. */
export type QueueScope = 'can-xem' | 'chua-phan-loai' | 'may' | 'chua' | 'tat-ca';
export const SCOPE_LABEL: Record<QueueScope, string> = {
  'can-xem': 'Cần xem lại',
  'chua-phan-loai': 'Chưa phân loại',
  may: 'Máy phân loại',
  chua: 'Chưa xác minh',
  'tat-ca': 'Tất cả chưa được giáo viên xác minh',
};
const RANK = (e: Effective): number => (e.form === 'xem-lai' ? 0 : e.unclassified ? 1 : e.form === 'may' ? 2 : e.form === 'chua' ? 3 : 9);

/** Câu thuộc nhóm nào (một câu chỉ thuộc một nhóm). Câu đã giáo viên xác minh Dạng không vào hàng đợi. */
export function scopeOf(e: Effective): Exclude<QueueScope, 'tat-ca'> | null {
  if (e.form === 'gv' && !e.unclassified) return null;
  if (e.form === 'xem-lai') return 'can-xem';
  if (e.unclassified) return 'chua-phan-loai';
  return e.form === 'may' ? 'may' : 'chua';
}

/** Danh sách uid cần xử lý (giữ thứ tự `questions` trong cùng nhóm ưu tiên). `pool` = tập câu đang xét (vd danh sách đang lọc trong Ngân hàng). */
export function queueUids(pool: readonly Question[], effOf: (q: Question) => Effective, scope: QueueScope): string[] {
  const items = pool.map((q, i) => ({ q, i, e: effOf(q) })).filter((x) => { const s = scopeOf(x.e); return s !== null && (scope === 'tat-ca' || s === scope); });
  return items.sort((a, b) => RANK(a.e) - RANK(b.e) || a.i - b.i).map((x) => x.q.uid);
}

export interface QueueCtx { tax: Taxonomy; ix: TaxIndex; taxRev: string }

/** Đếm theo nhóm (để hiện số trên bộ chọn nhóm). */
export function scopeCounts(pool: readonly Question[], effOf: (q: Question) => Effective): Record<QueueScope, number> {
  const c: Record<QueueScope, number> = { 'can-xem': 0, 'chua-phan-loai': 0, may: 0, chua: 0, 'tat-ca': 0 };
  for (const q of pool) { const s = scopeOf(effOf(q)); if (s) { c[s]++; c['tat-ca']++; } }
  return c;
}

export type QueueAction =
  | { kind: 'xac-nhan-dang' }
  | { kind: 'xac-nhan-muc-do' }
  | { kind: 'can-xem-lai' }
  | { kind: 'doi-dang'; formId: string };

/** Một lần hoàn tác: trả lại câu (nếu action đã đổi câu) và bản ghi trạng thái. */
export interface QueueUndo {
  uid: string;
  /** vị trí + LaTeX trước khi đổi Dạng; chỉ có khi action là doi-dang */
  before?: Pick<Question, 'grade' | 'chapterId' | 'lessonId' | 'formId' | 'latex' | 'level'>;
  /** câu ngay sau khi đổi (để biết câu có bị sửa tiếp sau đó không) */
  after?: Pick<Question, 'grade' | 'chapterId' | 'lessonId' | 'formId' | 'latex' | 'level'>;
  prevRec: ReviewRec | undefined;
}
const snap = (q: Question) => ({ grade: q.grade, chapterId: q.chapterId, lessonId: q.lessonId, formId: q.formId, latex: q.latex, level: q.level });
const sameSnap = (q: Question, s: NonNullable<QueueUndo['after']>) => q.grade === s.grade && q.chapterId === s.chapterId && q.lessonId === s.lessonId && q.formId === s.formId && q.latex === s.latex && q.level === s.level;

export type QueueResult = { ok: true; undo: QueueUndo; message: string } | { ok: false; message: string };

/** Áp dụng một hành động cho một câu và ghi (câu + tệp phụ). Lỗi ⇒ không đổi gì. */
export async function applyQueueAction(uid: string, action: QueueAction, ctx: QueueCtx): Promise<QueueResult> {
  const q = getState().questions.find((x) => x.uid === uid);
  if (!q) return { ok: false, message: 'Câu không còn trong ngân hàng.' };
  const prevRec = getRec(uid);
  const eff = effectiveOf(q, prevRec, { ix: ctx.ix, taxRev: ctx.taxRev });
  const mk = (qq: Question, o: { form: FormState; level: Effective['level']; src: 'tay'; unclassified?: boolean; why?: string }) =>
    makeRec(qq, { form: o.form, level: o.level, src: o.src, taxRev: ctx.taxRev, ...(o.unclassified ? { unclassified: true } : {}), ...(o.why ? { why: o.why } : {}), ...(prevRec?.orig ? { orig: prevRec.orig } : {}) });

  if (action.kind === 'xac-nhan-dang') {
    if (!checkLocation(ctx.ix, q).ok) return { ok: false, message: 'Vị trí của câu không còn đúng đường dẫn cây: hãy đổi sang Dạng đúng thay vì xác nhận.' };
    putRecs([[uid, mk(q, { form: 'gv', level: eff.level, src: 'tay', why: 'Giáo viên xác nhận Dạng' })]]);
    const saved = await flushIdReview();
    return saved ? { ok: true, undo: { uid, prevRec }, message: 'Đã xác minh Dạng' } : { ok: true, undo: { uid, prevRec }, message: 'Đã xác minh Dạng (chưa ghi được xuống đĩa — chỉ giữ trong phiên này)' };
  }
  if (action.kind === 'xac-nhan-muc-do') {
    putRecs([[uid, mk(q, { form: eff.form, level: 'gv', src: 'tay', unclassified: eff.unclassified, ...(eff.why ? { why: eff.why } : {}) })]]);
    const saved = await flushIdReview();
    return { ok: true, undo: { uid, prevRec }, message: saved ? 'Đã xác minh mức độ' : 'Đã xác minh mức độ (chưa ghi được xuống đĩa)' };
  }
  if (action.kind === 'can-xem-lai') {
    putRecs([[uid, mk(q, { form: 'xem-lai', level: eff.level, src: 'tay', why: 'Giáo viên đánh dấu cần xem lại' })]]);
    const saved = await flushIdReview();
    return { ok: true, undo: { uid, prevRec }, message: saved ? 'Đã đánh dấu cần xem lại' : 'Đã đánh dấu cần xem lại (chưa ghi được xuống đĩa)' };
  }
  // đổi Dạng: vị trí + ID6 cùng lúc, mức độ giữ nguyên
  const to: Location | null = locationOfForm(ctx.ix, action.formId);
  if (!to) return { ok: false, message: 'Dạng chọn không còn trong cây.' };
  const w = placeWithId(q.latex, to, q.level as Level, ctx.tax, true);
  if ('problem' in w) return { ok: false, message: `Không ghi được ID mới vào LaTeX (${w.problem}) nên chưa đổi gì.` };
  const before = snap(q);
  let after: ReturnType<typeof snap> | undefined;
  const r = await updateMany([uid], (x) => {
    if (!sameSnap(x, before)) return null; // câu đã bị sửa giữa chừng
    const n = { ...x, grade: to.grade, chapterId: to.chapterId, lessonId: to.lessonId, formId: to.formId, latex: w.latex };
    after = snap(n);
    return n;
  });
  if (!r.ok) return { ok: false, message: 'Chưa ghi được dữ liệu nên chưa đổi gì.' };
  if (!r.changed || !after) return { ok: false, message: 'Câu vừa được sửa ở nơi khác nên chưa đổi gì. Hãy xem lại câu.' };
  const nq = getState().questions.find((x) => x.uid === uid)!;
  putRecs([[uid, mk(nq, { form: 'gv', level: eff.level, src: 'tay', why: 'Giáo viên đổi Dạng trong hàng đợi xác minh' })]]);
  const saved = await flushIdReview();
  return { ok: true, undo: { uid, before, after, prevRec }, message: saved ? `Đã đổi Dạng và xác minh (${w.code})` : `Đã đổi Dạng (${w.code}); chưa ghi được trạng thái xuống đĩa` };
}

/** Hoàn tác một hành động: trả lại câu nếu còn y như lúc đổi, và trả lại đúng bản ghi trạng thái trước đó. */
export async function undoQueueAction(u: QueueUndo): Promise<{ ok: boolean; message: string }> {
  if (u.before && u.after) {
    const after = u.after, before = u.before;
    const r = await updateMany([u.uid], (x) => (sameSnap(x, after) ? { ...x, ...before } : null));
    if (!r.ok) return { ok: false, message: 'Chưa ghi được dữ liệu nên chưa hoàn tác.' };
    if (!r.changed) return { ok: false, message: 'Câu đã được sửa tiếp sau đó nên không hoàn tác được (không xoá chỉnh sửa mới).' };
  }
  // Hoàn tác cũng là một bước trong lịch sử (A → B → A), không xoá dấu vết của hành động vừa hoàn tác.
  const cur = getRec(u.uid);
  if (u.prevRec) putRecs([[u.uid, { ...u.prevRec, at: Date.now() }]]);
  else if (cur) putRecs([[u.uid, { ...cur, form: 'chua', level: 'chua', unclassified: false, why: 'Hoàn tác', at: Date.now() }]]);
  const saved = await flushIdReview();
  return { ok: true, message: saved ? 'Đã hoàn tác' : 'Đã hoàn tác (chưa ghi được trạng thái xuống đĩa)' };
}
