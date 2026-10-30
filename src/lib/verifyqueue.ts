// Hàng đợi xác minh từng câu (PR 1E): giáo viên xem một câu, xác nhận Dạng/mức độ hoặc đổi sang Dạng đúng, bằng phím tắt, có Hoàn tác.
// Phần thuần + ghi dữ liệu nằm ở đây để kiểm thử bằng đúng luồng thực tế (store + tệp phụ); màn hình chỉ vẽ và nối phím.
//   - Duyệt NỘI DUNG (`Question.review`) là việc khác: hàng đợi này không đổi nó.
//   - Chỉ hành động xác nhận của giáo viên tạo trạng thái "giáo viên xác minh"; mọi lần đổi đều lưu lịch sử (idreview.putRecs).
//   - Đổi Dạng = đổi vị trí VÀ ghi ID6 mới vào `%[ID]` cùng lúc (quy tắc 10), mức độ giữ nguyên (quy tắc 12); không ghi được thì không đổi gì.
import { commitRecs, effectiveOf, getRec, keepNoId, makeRec, type Effective, type FormState, type ReviewRec } from './idreview';
import { placeWithId } from './idsync';
import { getState, updateMany } from './store';
import type { TaxIndex } from './taxonomy';
import { checkLocation, locationOfForm } from './taxpath';
import type { Level, Location, Question, Taxonomy } from './types';

/** Nhóm cần xử lý trong hàng đợi, theo thứ tự ưu tiên: cần xem lại → chưa phân loại → máy phân loại → chưa xác minh. */
export type QueueScope = 'can-xem' | 'chua-phan-loai' | 'may' | 'chua' | 'tat-ca';
export const SCOPE_LABEL: Record<QueueScope, string> = {
  'can-xem': 'Cần xem lại',
  'chua-phan-loai': 'Chưa có ID',
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

/**
 * Áp dụng một hành động cho một câu và ghi BỀN VỮNG (câu + tệp phụ). Lỗi ghi ⇒ không đổi gì (không để câu hiện là "giáo viên xác minh" khi chưa lưu được).
 * `seenLatex` = nội dung câu lúc giáo viên xem: câu đã bị sửa từ nơi khác sau đó ⇒ từ chối (không áp đề xuất đã cũ).
 */
export async function applyQueueAction(uid: string, action: QueueAction, ctx: QueueCtx, seenLatex?: string): Promise<QueueResult> {
  const q = getState().questions.find((x) => x.uid === uid);
  if (!q) return { ok: false, message: 'Câu không còn trong ngân hàng.' };
  if (seenLatex !== undefined && q.latex !== seenLatex) return { ok: false, message: 'Câu vừa được sửa ở nơi khác nên chưa đổi gì. Hãy xem lại câu rồi thử lại.' };
  const prevRec = getRec(uid);
  const eff = effectiveOf(q, prevRec, { ix: ctx.ix, taxRev: ctx.taxRev });
  const mk = (qq: Question, o: { form: FormState; level: Effective['level']; src: 'tay'; noId?: boolean; why?: string }) =>
    makeRec(qq, { form: o.form, level: o.level, src: o.src, taxRev: ctx.taxRev, ...(o.noId ? keepNoId(eff) : {}), ...(o.why ? { why: o.why } : {}), ...(prevRec?.orig ? { orig: prevRec.orig } : {}) });

  if (action.kind === 'xac-nhan-dang') {
    // câu Chưa có ID: vị trí lưu chỉ là chỗ giữ ⇒ không có Dạng nào để xác nhận
    if (eff.unclassified) return { ok: false, message: 'Câu chưa có ID: hãy chọn Dạng (đề xuất, gợi ý hoặc Dạng khác) thay vì xác nhận.' };
    if (!checkLocation(ctx.ix, q).ok) return { ok: false, message: 'Vị trí của câu không còn đúng đường dẫn cây: hãy đổi sang Dạng đúng thay vì xác nhận.' };
    const saved = await commitRecs([[uid, mk(q, { form: 'gv', level: eff.level, src: 'tay', why: 'Giáo viên xác nhận Dạng' })]]);
    return saved ? { ok: true, undo: { uid, prevRec }, message: 'Đã xác minh Dạng' } : { ok: false, message: 'Chưa ghi được xuống đĩa nên CHƯA đổi gì. Hãy kiểm tra ổ đĩa rồi thử lại.' };
  }
  if (action.kind === 'xac-nhan-muc-do') {
    const saved = await commitRecs([[uid, mk(q, { form: eff.form, level: 'gv', src: 'tay', noId: true, ...(eff.why ? { why: eff.why } : {}) })]]);
    return saved ? { ok: true, undo: { uid, prevRec }, message: 'Đã xác minh mức độ' } : { ok: false, message: 'Chưa ghi được xuống đĩa nên CHƯA đổi gì. Hãy kiểm tra ổ đĩa rồi thử lại.' };
  }
  if (action.kind === 'can-xem-lai') {
    const saved = await commitRecs([[uid, mk(q, { form: 'xem-lai', level: eff.level, src: 'tay', noId: true, why: 'Giáo viên đánh dấu cần xem lại' })]]);
    return saved ? { ok: true, undo: { uid, prevRec }, message: 'Đã đánh dấu cần xem lại' } : { ok: false, message: 'Chưa ghi được xuống đĩa nên CHƯA đổi gì. Hãy kiểm tra ổ đĩa rồi thử lại.' };
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
  const saved = await commitRecs([[uid, mk(nq, { form: 'gv', level: eff.level, src: 'tay', why: 'Giáo viên đổi Dạng trong hàng đợi xác minh' })]]);
  if (!saved) {
    // câu đã đổi nhưng trạng thái chưa lưu được ⇒ trả câu về đúng như cũ (không để câu mang vị trí mới mà thiếu xác minh)
    const back = await updateMany([uid], (x) => (after && sameSnap(x, after) ? { ...x, ...before } : null));
    return { ok: false, message: back.ok && back.changed ? 'Chưa ghi được xuống đĩa nên CHƯA đổi gì. Hãy kiểm tra ổ đĩa rồi thử lại.' : 'Chưa ghi được trạng thái xác minh và chưa trả được câu về như cũ: hãy kiểm tra câu này.' };
  }
  return { ok: true, undo: { uid, before, after, prevRec }, message: `Đã đổi Dạng và xác minh (${w.code})` };
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
  const next: ReviewRec | undefined = u.prevRec ? { ...u.prevRec, at: Date.now() } : cur ? { ...cur, form: 'chua', level: 'chua', unclassified: false, why: 'Hoàn tác', at: Date.now() } : undefined;
  const saved = next ? await commitRecs([[u.uid, next]]) : true;
  // Nếu câu đã được trả về mà trạng thái chưa lưu được: bản ghi cũ tự hết hiệu lực vì không còn khớp Dạng/nội dung ⇒ an toàn (không hiện xác minh giả)
  return saved ? { ok: true, message: 'Đã hoàn tác' } : { ok: false, message: 'Chưa ghi được trạng thái xuống đĩa nên chưa hoàn tác xong. Hãy kiểm tra ổ đĩa rồi thử lại.' };
}
