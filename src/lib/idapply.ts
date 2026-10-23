// Gán ID tự động — phần logic thuần (không giao diện, không mạng) của luồng Ngân hàng:
// chụp trạng thái câu lúc xem trước → giáo viên chọn → kiểm lại ngay trước khi ghi → biến đổi CHỈ vị trí (và mức độ nếu tick riêng).
// ID6 không lưu ở đâu cả: nó được tính lại từ vị trí + mức độ bằng questionCode(), nên "gán ID" = gán vị trí đúng trong cây.
// uid, seq, latex, loại câu, nhãn, kiểm duyệt, ngày tạo, ngày sửa: KHÔNG đổi (giống các thao tác hàng loạt khác).
import type { IdSuggester, Suggestion } from './idsuggest';
import type { TaxIndex } from './taxonomy';
import { checkLocation, locationOfForm } from './taxpath';
import type { Level, Location, Question } from './types';

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

export interface Edit { snap: RowSnap; loc: Location | null; level: Level | null }

export interface ApplyPlan {
  edits: Map<string, Edit>;
  /** câu đã bị sửa/xoá sau lúc xem trước — không ghi */
  stale: string[];
  /** vị trí chọn không còn đúng đường dẫn cây / ra ngoài lớp — không ghi */
  invalid: string[];
}

const sameSnap = (q: Question, s: RowSnap): boolean =>
  q.grade === s.grade && q.chapterId === s.chapterId && q.lessonId === s.lessonId && q.formId === s.formId &&
  q.level === s.level && q.latex === s.latex && q.updatedAt === s.updatedAt;

/**
 * Kiểm lại NGAY TRƯỚC khi ghi: câu còn y như lúc xem trước, cây chưa đổi, vị trí chọn đúng đủ đường dẫn và cùng lớp.
 * `treeChanged` = dấu phiên bản cây hiện tại khác lúc gợi ý ⇒ mọi gợi ý đã cũ.
 */
export function planApply(rows: readonly AutoIdRow[], choices: ReadonlyMap<string, RowChoice>, current: ReadonlyMap<string, Question>, ix: TaxIndex, treeChanged: boolean): ApplyPlan {
  const plan: ApplyPlan = { edits: new Map(), stale: [], invalid: [] };
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
    if (loc || level) plan.edits.set(r.uid, { snap: r.snap, loc, level });
  }
  return plan;
}

/** Bộ biến đổi cho `updateMany`: kiểm lần cuối trên câu ĐÚNG lúc ghi; chỉ đổi vị trí và (nếu có) mức độ. */
export const withAutoId = (edits: ReadonlyMap<string, Edit>) => (q: Question): Question | null => {
  const e = edits.get(q.uid);
  if (!e || !sameSnap(q, e.snap)) return null;
  const n: Question = { ...q };
  if (e.loc) { n.grade = e.loc.grade; n.chapterId = e.loc.chapterId; n.lessonId = e.loc.lessonId; n.formId = e.loc.formId; }
  if (e.level) n.level = e.level;
  return n.grade === q.grade && n.chapterId === q.chapterId && n.lessonId === q.lessonId && n.formId === q.formId && n.level === q.level ? null : n;
};
