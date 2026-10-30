// Gán ID tự động — phần logic thuần (không giao diện, không mạng) của luồng Ngân hàng:
// chụp trạng thái câu lúc xem trước → giáo viên chọn → kiểm lại ngay trước khi ghi → biến đổi CHỈ vị trí (và mức độ nếu tick riêng).
// "Gán ID" = gán vị trí đúng trong cây VÀ ghi ID6 tương ứng vào vùng `%[ID]` của LaTeX (idsync.placeWithId) — cả hai, hoặc không gì.
// Ngoài vùng ID: uid, seq, nội dung LaTeX, loại câu, nhãn, kiểm duyệt, ngày tạo, ngày sửa KHÔNG đổi.
import { getTaxonomy } from './curriculum';
import type { IdSuggester, Suggestion } from './idsuggest';
import { idStatus, placeWithId, type SyncState } from './idsync';
import { writeHeadId } from './idtex';
import { getState, updateMany, type BatchResult } from './store';
import type { TaxIndex } from './taxonomy';
import { checkLocation, locationOfForm } from './taxpath';
import type { Level, Location, Question, Taxonomy } from './types';

/** Số câu tối đa mỗi lượt (chủ dự án duyệt 24/10/2026) — để bảng xem trước đủ ngắn mà xem kỹ. */
export const AUTO_ID_MAX = 200;

/** Ảnh chụp các trường liên quan lúc xem trước; khác lúc áp dụng ⇒ câu đã đổi, không ghi đè. */
export interface RowSnap extends Location { level: Level; latex: string; updatedAt: number }

export interface AutoIdRow {
  uid: string;
  seq: number;
  snap: RowSnap;
  /** vị trí hiện tại có khớp đủ đường dẫn cây không */
  currentOk: boolean;
  suggestion: Suggestion;
}

export interface RowChoice {
  apply: boolean;
  /** Dạng sẽ gán; null = giữ nguyên vị trí */
  formId: string | null;
  /** chỉ đổi mức độ khi giáo viên tick riêng (mặc định KHÔNG) */
  changeLevel: boolean;
}

const snapOf = (q: Question): RowSnap => ({ grade: q.grade, chapterId: q.chapterId, lessonId: q.lessonId, formId: q.formId, level: q.level, latex: q.latex, updatedAt: q.updatedAt });

/** Gợi ý cho các câu đã chọn. Mỗi câu chỉ được gợi ý trong lớp hiện tại của nó. */
export function buildRows(qs: readonly Question[], s: IdSuggester, ix: TaxIndex): AutoIdRow[] {
  return qs.map((q) => ({
    uid: q.uid, seq: q.seq, snap: snapOf(q),
    currentOk: checkLocation(ix, q).ok,
    suggestion: s.suggest({ key: q.uid, latex: q.latex, grade: q.grade, excludeUid: q.uid }),
  }));
}

/** Câu có gì để đổi không (vị trí khác hiện tại, hoặc hiện tại đang sai đường dẫn). */
export const movesLocation = (row: AutoIdRow, formId: string | null): boolean => !!formId && (formId !== row.snap.formId || !row.currentOk);

/**
 * Mặc định KHÔNG tự tick câu nào (đặc tả Gán ID XII). Vị trí hiện tại đúng đường dẫn ⇒ giữ (formId = null): câu có ID hợp lệ là "giữ nguyên",
 * câu chưa có ID là "thêm ID tại chỗ" — gợi ý ngân hàng chỉ là chứng cứ, nằm trong ô chọn. Vị trí hiện tại sai ⇒ điền sẵn Dạng gợi ý.
 * Mức độ không bao giờ tự tick.
 */
export function defaultChoice(row: AutoIdRow): RowChoice {
  return { apply: false, formId: row.currentOk ? null : row.suggestion.best?.formId ?? null, changeLevel: false };
}

/** Mức độ sẽ dùng nếu tick "Đổi mức độ": chỉ khi có gợi ý và khác mức hiện tại. */
export const levelTarget = (row: AutoIdRow): Level | null => {
  const h = row.suggestion.levelHint;
  return h && h !== row.snap.level ? h : null;
};

/**
 * Việc HEdu sẽ làm với một câu nếu được áp dụng (đặc tả XII):
 *   them   câu chưa có ID ⇒ thêm ID (kèm đổi vị trí/mức độ nếu có chọn)
 *   thay   câu đã có ID ⇒ đổi ID cũ → mới (vị trí/mức độ đổi theo lựa chọn)
 *   giu    ID trong LaTeX đã hợp lệ và khớp, không chọn đổi gì ⇒ giữ nguyên
 *   khong-du  chưa có Dạng đề xuất (AI/ngân hàng không đủ căn cứ) và chưa chọn ⇒ không làm gì
 *   loi    ID lỗi/lệch/nhiều ID, hoặc vị trí chọn không ra mã ⇒ cần thầy/cô xử lý (mở câu để sửa)
 */
export type RowAction =
  | { kind: 'them' | 'thay'; code: string; old: string | null; loc: Location | null; level: Level | null; latex: string }
  | { kind: 'giu'; code: string }
  | { kind: 'khong-du' }
  | { kind: 'loi'; why: string };

export const ROW_ACTION_LABEL: Record<RowAction['kind'], string> = { them: 'Thêm ID', thay: 'Đổi ID', giu: 'Có ID hợp lệ — giữ nguyên', 'khong-du': 'Không đủ căn cứ', loi: 'Cần xử lý' };

const WHY: Record<string, string> = {
  'nhieu-id': 'LaTeX có nhiều ID mâu thuẫn',
  'khong-phai-ex': 'Không phải khối \\begin{ex}',
  'ma-trung': 'Cây có mã trùng — không tạo được ID',
  'can-xac-nhan': 'Cần xác nhận thay ID',
};

export function rowAction(r: AutoIdRow, c: RowChoice | undefined, ix: TaxIndex, tax: Taxonomy = getTaxonomy()): RowAction {
  const formId = c?.formId ?? null;
  let loc: Location | null = null;
  if (movesLocation(r, formId)) {
    loc = locationOfForm(ix, formId!);
    if (!loc || !checkLocation(ix, loc, r.snap.grade).ok) return { kind: 'loi', why: 'Vị trí chọn không còn đúng trong cây / ngoài lớp của câu' };
  }
  const level = c?.changeLevel ? levelTarget(r) : null;
  const st = idStatus(r.snap, tax);
  if (!loc && !level) {
    if (st.state === 'khop') return { kind: 'giu', code: st.latex.resolved!.code };
    if (st.state === 'chua-co-id' && st.meta.ok) {
      const w = writeHeadId(r.snap.latex, st.meta.code, 'them');
      return w.action === 'them' ? { kind: 'them', code: st.meta.code, old: null, loc: null, level: null, latex: w.latex } : { kind: 'loi', why: WHY[w.action === 'bo-qua' ? w.reason : ''] ?? 'Không ghi được ID' };
    }
    // Giáo viên CHỦ ĐỘNG chọn lại chính Dạng đang lưu (không đổi sang Dạng khác) để sửa ID lệch/lỗi theo vị trí này: thay ID cũ (một mã)
    // sau khi tick xác nhận. Mặc định (formId = null) không bao giờ đi vào nhánh này ⇒ không tự ghi đè ID hợp lệ.
    if (formId === r.snap.formId && r.currentOk && (st.state === 'lech' || st.state === 'id-loi')) {
      const w = placeWithId(r.snap.latex, r.snap, r.snap.level, tax, true);
      if (!('latex' in w)) return { kind: 'loi', why: WHY[w.problem] ?? 'Không ghi được ID' };
      return { kind: 'thay', code: w.code, old: w.write.old, loc: null, level: null, latex: w.latex };
    }
    if (!r.suggestion.best && !formId && (st.state === 'vi-tri-loi' || st.state === 'chua-co-id')) return { kind: 'khong-du' };
    return { kind: 'loi', why: st.state === 'lech' ? 'ID trong LaTeX khác vị trí — chọn Dạng đúng (hoặc "Vị trí hiện tại — sửa ID theo vị trí này")' : st.state === 'id-loi' ? 'ID trong LaTeX bị lỗi — chọn Dạng để thay (hoặc "Vị trí hiện tại — sửa ID theo vị trí này")' : 'Vị trí hiện tại không ra được ID — hãy chọn Dạng' };
  }
  const w = placeWithId(r.snap.latex, loc ?? r.snap, level ?? r.snap.level, tax, true);
  if (!('latex' in w)) return { kind: 'loi', why: WHY[w.problem] ?? 'Vị trí chọn không ra được ID hợp lệ' };
  return { kind: w.write.action === 'them' ? 'them' : 'thay', code: w.code, old: w.write.old, loc, level, latex: w.latex };
}

/** Câu tick được khi có việc để ghi (thêm hoặc đổi ID). */
export const canApply = (a: RowAction): boolean => a.kind === 'them' || a.kind === 'thay';

export interface ApplySummary {
  chosen: number;
  /** trong các câu đã tick */
  add: number; change: number; moveLoc: number; moveLevel: number;
  /** trên toàn bảng (câu không tick) */
  keep: number; noBasis: number; errors: number;
}

/** Tóm tắt trên nút Áp dụng: số câu thêm ID, đổi ID, giữ nguyên, không đủ căn cứ, lỗi. */
export function summarize(rows: readonly AutoIdRow[], choices: ReadonlyMap<string, RowChoice>, ix: TaxIndex, tax: Taxonomy = getTaxonomy()): ApplySummary {
  const s: ApplySummary = { chosen: 0, add: 0, change: 0, moveLoc: 0, moveLevel: 0, keep: 0, noBasis: 0, errors: 0 };
  for (const r of rows) {
    const c = choices.get(r.uid);
    const a = rowAction(r, c, ix, tax);
    if (a.kind === 'giu') s.keep++;
    else if (a.kind === 'khong-du') s.noBasis++;
    else if (a.kind === 'loi') s.errors++;
    else if (c?.apply) {
      s.chosen++;
      if (a.kind === 'them') s.add++; else s.change++;
      if (a.loc) s.moveLoc++;
      if (a.level) s.moveLevel++;
    } else if (!r.suggestion.best && !c?.formId) s.noBasis++;
  }
  return s;
}

/** `latex`: mã LaTeX sau khi ghi ID mới (chỉ khác vùng ID); vị trí/mức độ và LaTeX luôn đi cùng nhau. */
export interface Edit { snap: RowSnap; loc: Location | null; level: Level | null; latex: string }

export interface ApplyPlan {
  edits: Map<string, Edit>;
  /** câu đã bị sửa/xoá sau lúc xem trước — không ghi */
  stale: string[];
  /** vị trí chọn không còn đúng đường dẫn cây / ra ngoài lớp — không ghi */
  invalid: string[];
  /** không ghi được ID vào LaTeX (câu có nhiều ID, cây có mã trùng…) — không ghi gì để vị trí và ID không lệch nhau */
  idBlocked: string[];
}

const sameSnap = (q: Question, s: RowSnap): boolean =>
  q.grade === s.grade && q.chapterId === s.chapterId && q.lessonId === s.lessonId && q.formId === s.formId &&
  q.level === s.level && q.latex === s.latex && q.updatedAt === s.updatedAt;

/**
 * Kiểm lại NGAY TRƯỚC khi ghi: câu còn y như lúc xem trước, cây chưa đổi, vị trí chọn đúng đủ đường dẫn và cùng lớp.
 * `treeChanged` = dấu phiên bản cây hiện tại khác lúc gợi ý ⇒ mọi gợi ý đã cũ.
 * ID cũ trong LaTeX (một mã) được THAY bằng mã mới: giáo viên đã xem "ID hiện tại → đề xuất" và tick áp dụng.
 */
export function planApply(rows: readonly AutoIdRow[], choices: ReadonlyMap<string, RowChoice>, current: ReadonlyMap<string, Question>, ix: TaxIndex, treeChanged: boolean, tax: Taxonomy = getTaxonomy()): ApplyPlan {
  const plan: ApplyPlan = { edits: new Map(), stale: [], invalid: [], idBlocked: [] };
  for (const r of rows) {
    const c = choices.get(r.uid);
    if (!c?.apply) continue;
    const q = current.get(r.uid);
    if (!q || treeChanged || !sameSnap(q, r.snap)) { plan.stale.push(r.uid); continue; }
    const a = rowAction(r, c, ix, tax);
    if (a.kind === 'giu' || a.kind === 'khong-du') continue;
    if (a.kind === 'loi') { (movesLocation(r, c.formId) && !locOk(ix, c.formId!, r.snap.grade) ? plan.invalid : plan.idBlocked).push(r.uid); continue; }
    plan.edits.set(r.uid, { snap: r.snap, loc: a.loc, level: a.level, latex: a.latex });
  }
  return plan;
}

const locOk = (ix: TaxIndex, formId: string, grade: number): boolean => { const l = locationOfForm(ix, formId); return !!l && checkLocation(ix, l, grade).ok; };

/** Bộ biến đổi cho `updateMany`: kiểm lần cuối trên câu ĐÚNG lúc ghi; đổi vị trí và (nếu có) mức độ cùng với vùng ID của LaTeX. */
export const withAutoId = (edits: ReadonlyMap<string, Edit>) => (q: Question): Question | null => {
  const e = edits.get(q.uid);
  if (!e || !sameSnap(q, e.snap)) return null;
  const n: Question = { ...q };
  if (e.loc) { n.grade = e.loc.grade; n.chapterId = e.loc.chapterId; n.lessonId = e.loc.lessonId; n.formId = e.loc.formId; }
  if (e.level) n.level = e.level;
  n.latex = e.latex;
  return n.grade === q.grade && n.chapterId === q.chapterId && n.lessonId === q.lessonId && n.formId === q.formId && n.level === q.level && n.latex === q.latex ? null : n;
};

// ---------- Hoàn tác TRONG PHIÊN (đóng app là mất; không lưu lịch sử vào dữ liệu) ----------

type Placement = Pick<Question, 'grade' | 'chapterId' | 'lessonId' | 'formId' | 'level' | 'latex'>;
export interface UndoItem { uid: string; before: Placement; after: RowSnap }
export interface AutoIdUndo { at: number; items: UndoItem[] }

const placementOf = (q: Question): Placement => ({ grade: q.grade, chapterId: q.chapterId, lessonId: q.lessonId, formId: q.formId, level: q.level, latex: q.latex });

let lastUndo: AutoIdUndo | null = null;
/** Lần Gán ID gần nhất còn hoàn tác được trong phiên này (mỗi lần áp dụng mới thay lần trước). */
export const getAutoIdUndo = (): AutoIdUndo | null => lastUndo;
export const clearAutoIdUndo = (): void => { lastUndo = null; };

/** Áp dụng kế hoạch (ghi MỘT lần) và ghi nhớ đúng những câu thật sự đã đổi để Hoàn tác. */
export async function applyAutoId(edits: ReadonlyMap<string, Edit>): Promise<BatchResult> {
  const items: UndoItem[] = [];
  const f = withAutoId(edits);
  const r = await updateMany(edits.keys(), (q) => {
    const n = f(q);
    if (n) items.push({ uid: q.uid, before: placementOf(q), after: snapOf(n) });
    return n;
  });
  if (r.ok && items.length) lastUndo = { at: Date.now(), items };
  return r;
}

/** Câu KHÔNG hoàn tác được vì đã bị xoá hoặc sửa tiếp (vị trí, mức độ, nội dung) sau lần gán. */
export function undoConflicts(u: AutoIdUndo, current: ReadonlyMap<string, Question>): string[] {
  return u.items.filter((it) => { const q = current.get(it.uid); return !q || !sameSnap(q, it.after); }).map((it) => it.uid);
}

export interface UndoResult { ok: boolean; restored: number; conflicts: number }

/** Trả vị trí + mức độ + LaTeX (vùng ID) cũ cho các câu còn y như lúc gán; câu đã sửa tiếp thì giữ nguyên (không xoá chỉnh sửa mới). */
export async function undoAutoId(u: AutoIdUndo): Promise<UndoResult> {
  const byUid = new Map(u.items.map((it) => [it.uid, it]));
  const conflicts = undoConflicts(u, new Map(getState().questions.map((q) => [q.uid, q]))).length;
  const r = await updateMany(byUid.keys(), (q) => {
    const it = byUid.get(q.uid);
    return it && sameSnap(q, it.after) ? { ...q, ...it.before } : null;
  });
  if (r.ok && lastUndo === u) lastUndo = null;
  return { ok: r.ok, restored: r.changed, conflicts };
}

// ---------- Đồng bộ ID cho dữ liệu cũ (LaTeX chưa có `%[ID]`) ----------

/** Đếm các câu theo trạng thái ID (để hộp xác nhận nói rõ: bao nhiêu câu thêm ID, bao nhiêu giữ nguyên, bao nhiêu cần xử lý). */
export function syncCounts(qs: readonly Question[], tax: Taxonomy = getTaxonomy()): Record<SyncState, number> {
  const n: Record<SyncState, number> = { khop: 0, 'chua-co-id': 0, lech: 0, 'id-loi': 0, 'vi-tri-loi': 0 };
  for (const q of qs) n[idStatus(q, tax).state]++;
  return n;
}

/**
 * Thêm ID theo vị trí vào LaTeX của các câu "LaTeX chưa có ID" (vị trí đúng đủ đường dẫn). KHÔNG đụng câu đã có ID — kể cả ID lệch hay lỗi:
 * các câu đó giáo viên xử lý từng câu (trình sửa câu / Gán ID). Ghi một lần; ghi lỗi ⇒ không câu nào đổi. Hoàn tác được trong phiên.
 */
export async function applyIdSync(uids: Iterable<string>, tax: Taxonomy = getTaxonomy()): Promise<BatchResult> {
  const items: UndoItem[] = [];
  const r = await updateMany(uids, (q) => {
    const st = idStatus(q, tax);
    if (st.state !== 'chua-co-id' || !st.meta.ok) return null;
    const w = writeHeadId(q.latex, st.meta.code, 'them');
    if (w.action !== 'them') return null;
    const n: Question = { ...q, latex: w.latex };
    items.push({ uid: q.uid, before: placementOf(q), after: snapOf(n) });
    return n;
  });
  if (r.ok && items.length) lastUndo = { at: Date.now(), items };
  return r;
}

// ---------- Câu có ID hợp lệ trong LaTeX nhưng nằm sai vị trí: đưa về vị trí THEO ID ----------

/**
 * Câu "ID lệch" (ID trong LaTeX hợp lệ, khác vị trí/mức đang lưu) — thường do lúc nhập HEdu chưa đọc được ID nên xếp câu vào
 * vị trí mặc định. Đưa vị trí + mức độ về đúng theo ID trong LaTeX; LaTeX không đổi. Câu trạng thái khác: không đụng.
 * Ghi một lần (lỗi ⇒ không câu nào đổi); Hoàn tác được trong phiên như Gán ID.
 */
export async function applyFollowId(uids: Iterable<string>, tax: Taxonomy = getTaxonomy()): Promise<BatchResult> {
  const items: UndoItem[] = [];
  const r = await updateMany(uids, (q) => {
    const st = idStatus(q, tax);
    const res = st.latex.resolved;
    if (st.state !== 'lech' || !res) return null;
    const n: Question = { ...q, grade: res.loc.grade, chapterId: res.loc.chapterId, lessonId: res.loc.lessonId, formId: res.loc.formId, level: res.level };
    items.push({ uid: q.uid, before: placementOf(q), after: snapOf(n) });
    return n;
  });
  if (r.ok && items.length) lastUndo = { at: Date.now(), items };
  return r;
}
