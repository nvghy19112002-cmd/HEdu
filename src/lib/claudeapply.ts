// Gán ID nhờ Claude — ÁP DỤNG LUÔN (chủ dự án chọn 31/10/2026): ghi thẳng Dạng + mức độ + ID6 Claude chọn vào câu chưa được giáo viên
// xác minh, trạng thái "Máy phân loại" (nguồn AI ngoài). Câu và trạng thái ghi cả hai hoặc không gì; có điểm khôi phục trước lô lớn và
// Hoàn tác trong phiên. Kế hoạch (pure) ở claudeid.planImport({ direct }).
import { BIG_OP, ensureRestorePoint } from './dbbackup';
import { commitRecs, getRec, makeRec, type ReviewRec } from './idreview';
import { samePlacement, type ImportPlan, type Placement } from './claudeid';
import { getState, updateMany } from './store';

export interface DirectUndo { at: number; lo: string; items: { uid: string; before: Placement; after: Placement; prevRec?: ReviewRec }[] }
export type DirectResult = { ok: true; applied: number; stale: number; queued: number; undo: DirectUndo | null } | { ok: false; message: string };

let last: DirectUndo | null = null;
/** Lần áp dụng gần nhất còn hoàn tác được trong phiên (đóng app là mất; dữ liệu cũ vẫn còn trong điểm khôi phục). */
export const getDirectUndo = (): DirectUndo | null => last;

/**
 * Ghi kế hoạch: đổi câu (vị trí, mức, LaTeX) trong MỘT lần ghi, rồi ghi trạng thái xác minh (cả câu áp dụng lẫn đề xuất vào hàng đợi).
 * Câu đã bị sửa sau lúc lập kế hoạch thì bỏ qua (`stale`). Ghi trạng thái lỗi ⇒ trả mọi câu vừa đổi về như cũ.
 */
export async function applyDirect(plan: ImportPlan, lo: string, taxRev: string, now = Date.now()): Promise<DirectResult> {
  const rp = await ensureRestorePoint('nhap-hang-loat', plan.edits.length >= BIG_OP);
  if (!rp.ok) return { ok: false, message: rp.message };
  const byUid = new Map(plan.edits.map((e) => [e.uid, e] as const));
  const prev = new Map(plan.edits.map((e) => [e.uid, getRec(e.uid)] as const));
  const hit = new Set<string>();
  if (byUid.size) {
    const r = await updateMany(byUid.keys(), (q) => {
      const e = byUid.get(q.uid);
      if (!e || !samePlacement(q, e.before)) return null; // câu đã bị sửa sau khi lập kế hoạch
      hit.add(q.uid);
      return samePlacement(q, e.after) ? null : { ...q, ...e.after };
    });
    if (!r.ok) return { ok: false, message: 'Chưa ghi được dữ liệu (ổ đĩa đầy hoặc tệp bị chặn ghi) nên chưa đổi câu nào.' };
  }
  const cur = new Map(getState().questions.map((q) => [q.uid, q] as const));
  const recs: [string, ReviewRec][] = [];
  for (const uid of hit) {
    const q = cur.get(uid), e = byUid.get(uid)!;
    if (q) recs.push([uid, makeRec(q, { form: 'may', level: e.level, src: 'ai-ngoai', taxRev, why: e.why, at: now, ...(prev.get(uid)?.orig ? { orig: prev.get(uid)!.orig } : {}) })]);
  }
  if (!(await commitRecs([...recs, ...plan.recs]))) {
    await updateMany(hit, (q) => { const e = byUid.get(q.uid); return e && samePlacement(q, e.after) ? { ...q, ...e.before } : null; });
    return { ok: false, message: 'Chưa ghi được trạng thái xác minh (ổ đĩa đầy hoặc tệp bị chặn ghi) nên đã trả các câu về như cũ.' };
  }
  const items = [...hit].map((uid) => { const e = byUid.get(uid)!; return { uid, before: e.before, after: e.after, ...(prev.get(uid) ? { prevRec: prev.get(uid) } : {}) }; });
  last = items.length ? { at: now, lo, items } : last;
  return { ok: true, applied: hit.size, stale: byUid.size - hit.size, queued: plan.recs.length, undo: items.length ? last : null };
}

/** Hoàn tác: câu còn y như lúc áp dụng thì trả vị trí/mức/LaTeX và trạng thái cũ; câu đã sửa tiếp thì giữ (không xoá chỉnh sửa mới). */
export async function undoDirect(u: DirectUndo): Promise<{ ok: boolean; restored: number; kept: number }> {
  const byUid = new Map(u.items.map((it) => [it.uid, it] as const));
  const back = new Set<string>();
  const r = await updateMany(byUid.keys(), (q) => {
    const it = byUid.get(q.uid);
    if (!it || !samePlacement(q, it.after)) return null;
    back.add(q.uid);
    return { ...q, ...it.before };
  });
  if (!r.ok) return { ok: false, restored: 0, kept: u.items.length };
  const at = Date.now();
  const recs: [string, ReviewRec][] = [];
  for (const uid of back) {
    const it = byUid.get(uid)!, now = getRec(uid);
    if (it.prevRec) recs.push([uid, { ...it.prevRec, at }]);
    else if (now) recs.push([uid, { ...now, form: 'chua', level: 'chua', why: 'Hoàn tác áp dụng đề xuất Claude', at }]);
  }
  const saved = recs.length ? await commitRecs(recs) : true;
  if (saved && last === u) last = null;
  return { ok: saved, restored: back.size, kept: u.items.length - back.size };
}
