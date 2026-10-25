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

/** Mặc định: chỉ TỰ TICK câu tin cậy "cao" mà vị trí gợi ý khác hiện tại; mức độ không bao giờ tự tick. */
export function defaultChoice(row: AutoIdRow): RowChoice {
  const best = row.suggestion.best?.formId ?? null;
  return { apply: row.suggestion.confidence === 'cao' && movesLocation(row, best), formId: best, changeLevel: false };
}

/** Mức độ sẽ dùng nếu tick "Đổi mức độ": chỉ khi có gợi ý và khác mức hiện tại. */
export const levelTarget = (row: AutoIdRow): Level | null => {
  const h = row.suggestion.levelHint;
  return h && h !== row.snap.level ? h : null;
};

export interface ApplySummary { chosen: number; moveLoc: number; moveLevel: number; needTeacher: number }

/** Dòng tóm tắt trước khi Áp dụng: "N câu chọn; X đổi vị trí; Y đổi mức độ; Z cần xử lý". */
export function summarize(rows: readonly AutoIdRow[], choices: ReadonlyMap<string, RowChoice>): ApplySummary {
  let chosen = 0, moveLoc = 0, moveLevel = 0, needTeacher = 0;
  for (const r of rows) {
    const c = choices.get(r.uid);
    if (r.suggestion.confidence === 'khong' || (!r.currentOk && !c?.formId)) needTeacher++;
    if (!c?.apply) continue;
    chosen++;
    if (movesLocation(r, c.formId)) moveLoc++;
    if (c.changeLevel && levelTarget(r)) moveLevel++;
  }
  return { chosen, moveLoc, moveLevel, needTeacher };
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
    let loc: Location | null = null;
    if (movesLocation(r, c.formId)) {
      loc = locationOfForm(ix, c.formId!);
      if (!loc || !checkLocation(ix, loc, r.snap.grade).ok) { plan.invalid.push(r.uid); continue; }
    }
    const level = c.changeLevel ? levelTarget(r) : null;
    if (!loc && !level) continue;
    const w = placeWithId(r.snap.latex, loc ?? r.snap, level ?? r.snap.level, tax, true);
    if (!('latex' in w)) { plan.idBlocked.push(r.uid); continue; }
    plan.edits.set(r.uid, { snap: r.snap, loc, level, latex: w.latex });
  }
  return plan;
}

/** Bộ biến đổi cho `updateMany`: kiểm lần cuối trên câu ĐÚNG lúc ghi; đổi vị trí và (nếu có) mức độ cùng với vùng ID của LaTeX. */
export const withAutoId = (edits: ReadonlyMap<string, Edit>) => (q: Question): Question | null => {
  const e = edits.get(q.uid);
  if (!e || !sameSnap(q, e.snap)) return null;
  const n: Question = { ...q };
  if (e.loc) { n.grade = e.loc.grade; n.chapterId = e.loc.chapterId; n.lessonId = e.loc.lessonId; n.formId = e.loc.formId; }
  if (e.level) n.level = e.level;
  n.latex = e.latex;
  return n.grade === q.grade && n.chapterId === q.chapterId && n.lessonId === q.lessonId && n.formId === q.formId && n.level === q.level ? null : n;
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
