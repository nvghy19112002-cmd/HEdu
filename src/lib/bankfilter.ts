// Logic thuần của Mục lục & Bộ lọc ở màn Ngân hàng (không phụ thuộc React): trạng thái, cascade, lọc, đếm theo chiều.
// Hai nhóm: VỊ TRÍ (Lớp → Phân môn → Chương → Bài → Dạng) và THUỘC TÍNH (Mức độ, Loại câu, Hình, Kiểm duyệt).
import { figureOf, type FigureFilter } from './figure';
import { reviewOf, type Level, type QType, type Question, type ReviewFilter, type Taxonomy } from './types';

export interface BankFilters {
  gradeNum: number | null;
  branchId: string | null;
  chapterId: string | null;
  lessonId: string | null;
  formId: string | null;
  levels: Set<Level>;
  types: Set<QType>;
  figure: FigureFilter;
  review: ReviewFilter;
}

export const emptyFilters = (): BankFilters => ({
  gradeNum: null, branchId: null, chapterId: null, lessonId: null, formId: null,
  levels: new Set(), types: new Set(), figure: 'all', review: 'all',
});

/** Số bộ lọc THUỘC TÍNH đang bật (Mức độ và Loại câu đếm theo số giá trị chọn). */
export const attrCount = (f: BankFilters) => f.levels.size + f.types.size + (f.figure !== 'all' ? 1 : 0) + (f.review !== 'all' ? 1 : 0);
/** Số nhóm thuộc tính đang bật (để hiện trên đầu nhóm "Lọc câu hỏi"). */
export const attrGroups = (f: BankFilters) => (f.levels.size ? 1 : 0) + (f.types.size ? 1 : 0) + (f.figure !== 'all' ? 1 : 0) + (f.review !== 'all' ? 1 : 0);
export const posActive = (f: BankFilters) => f.gradeNum != null;

// ---- cascade ----
const clearFrom = {
  branch: { branchId: null, chapterId: null, lessonId: null, formId: null },
  chapter: { chapterId: null, lessonId: null, formId: null },
  lesson: { lessonId: null, formId: null },
} as const;

export const pickGrade = (f: BankFilters, g: number | null): BankFilters => ({ ...f, gradeNum: g, ...clearFrom.branch });
export const pickBranch = (f: BankFilters, id: string | null): BankFilters => ({ ...f, ...clearFrom.branch, branchId: id });
export const pickChapter = (tax: Taxonomy, f: BankFilters, id: string | null): BankFilters => ({
  ...f, ...clearFrom.chapter, chapterId: id,
  branchId: id ? chapterBranchMap(tax).get(id) ?? f.branchId : f.branchId, // chọn chương mà chưa chọn phân môn → tự điền phân môn
});
export const pickLesson = (f: BankFilters, id: string | null): BankFilters => ({ ...f, ...clearFrom.lesson, lessonId: id });
export const pickForm = (f: BankFilters, id: string | null): BankFilters => ({ ...f, formId: id });
/** "Xoá bộ lọc": chỉ 4 thuộc tính; KHÔNG đụng vị trí. */
export const clearAttrs = (f: BankFilters): BankFilters => ({ ...f, levels: new Set(), types: new Set(), figure: 'all', review: 'all' });
/** "Đặt lại toàn bộ" (phần bộ lọc): vị trí + thuộc tính. Ô tìm và phạm vi do màn Ngân hàng đặt lại. */
export const resetAll = (): BankFilters => emptyFilters();

// ---- tra cứu cây (nhớ đệm theo đối tượng cây) ----
const mapCache = new WeakMap<Taxonomy, Map<string, string>>();
/** chapterId → branchId */
export function chapterBranchMap(tax: Taxonomy): Map<string, string> {
  let m = mapCache.get(tax);
  if (!m) {
    m = new Map();
    for (const g of tax.grades) for (const b of g.branches) for (const c of b.chapters) m.set(c.id, b.id);
    mapCache.set(tax, m);
  }
  return m;
}

/** Gỡ các giá trị vị trí không còn hợp lệ (vd cây bị sửa/đổi tên trong màn Chương trình): rơi về "Tất cả" ở cấp đó. */
export function sanitize(tax: Taxonomy, f: BankFilters): BankFilters {
  if (f.gradeNum == null) return f.branchId || f.chapterId || f.lessonId || f.formId ? { ...f, ...clearFrom.branch } : f;
  const g = tax.grades.find((x) => x.grade === f.gradeNum);
  if (!g) return pickGrade(f, null);
  let out = f;
  const br = f.branchId ? g.branches.find((b) => b.id === f.branchId) : undefined;
  if (f.branchId && !br) out = pickBranch(out, null);
  const chapters = (out.branchId ? g.branches.filter((b) => b.id === out.branchId) : g.branches).flatMap((b) => b.chapters);
  const ch = out.chapterId ? chapters.find((c) => c.id === out.chapterId) : undefined;
  if (out.chapterId && !ch) out = { ...out, ...clearFrom.chapter };
  const ls = ch && out.lessonId ? ch.lessons.find((l) => l.id === out.lessonId) : undefined;
  if (out.lessonId && !ls) out = { ...out, ...clearFrom.lesson };
  if (out.formId && !(ls && ls.forms.some((x) => x.id === out.formId))) out = { ...out, formId: null };
  return out;
}

// ---- lọc + đếm theo chiều ----
export interface FilterCtx {
  chapterBranch: Map<string, string>;
  /** true nếu câu khớp ô tìm (đã gồm trường hợp ô tìm trống) */
  textOk: (uid: string) => boolean;
  /** "Toàn kho": bỏ qua VỊ TRÍ khi tìm; chỉ nên bật khi đang có chữ tìm */
  wide: boolean;
}

export interface Facets {
  /** Các câu hiện ra (đã sắp theo mới sửa trước) */
  list: Question[];
  /** Số câu trong vị trí hiện tại, chưa lọc thuộc tính (mẫu số của "N / M") */
  scoped: number;
  grade: Map<number, number>; gradeAll: number;
  branch: Map<string, number>;
  chapter: Map<string, number>;
  lesson: Map<string, number>;
  form: Map<string, number>;
  level: Map<Level, number>;
  type: Map<QType, number>;
  figure: Record<'yes' | 'no' | 'unknown', number>;
  review: Record<'unreviewed' | 'needs_fix' | 'approved', number>;
}

const inc = <K,>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) ?? 0) + 1);
const B_LEVEL = 1, B_TYPE = 2, B_FIG = 4, B_REV = 8;

/**
 * Một lượt O(N). Số đếm "theo chiều":
 *  - lựa chọn thuộc tính: áp VỊ TRÍ + mọi thuộc tính KHÁC + ô tìm, bỏ chính thuộc tính đó;
 *  - lựa chọn vị trí cấp d: áp các cấp phía trên + mọi thuộc tính + ô tìm, bỏ chính cấp d và các cấp dưới (vì chọn cấp khác sẽ đặt lại cấp dưới).
 */
export function computeFacets(questions: readonly Question[], f: BankFilters, ctx: FilterCtx): Facets {
  const r: Facets = {
    list: [], scoped: 0, grade: new Map(), gradeAll: 0, branch: new Map(), chapter: new Map(), lesson: new Map(), form: new Map(),
    level: new Map(), type: new Map(), figure: { yes: 0, no: 0, unknown: 0 }, review: { unreviewed: 0, needs_fix: 0, approved: 0 },
  };
  for (const q of questions) {
    if (!ctx.textOk(q.uid)) continue;
    const brOfQ = ctx.chapterBranch.get(q.chapterId);
    const pos = [
      f.gradeNum == null || q.grade === f.gradeNum,
      !f.branchId || brOfQ === f.branchId,
      !f.chapterId || q.chapterId === f.chapterId,
      !f.lessonId || q.lessonId === f.lessonId,
      !f.formId || q.formId === f.formId,
    ];
    let prefix = 0;
    while (prefix < 5 && pos[prefix]) prefix++;
    const posOk = ctx.wide || prefix === 5;
    const fig = figureOf(q);
    let fails = 0;
    if (f.levels.size && !f.levels.has(q.level)) fails |= B_LEVEL;
    if (f.types.size && !f.types.has(q.type)) fails |= B_TYPE;
    if (f.figure !== 'all' && fig !== f.figure) fails |= B_FIG;
    const rv = reviewOf(q);
    if (f.review !== 'all' && rv !== f.review) fails |= B_REV;

    if (posOk && fails === 0) r.list.push(q);
    if (posOk) r.scoped++;
    if (fails === 0) {
      if (prefix >= 0) { inc(r.grade, q.grade); r.gradeAll++; }
      if (prefix >= 1 && brOfQ) inc(r.branch, brOfQ);
      if (prefix >= 2 && q.chapterId) inc(r.chapter, q.chapterId);
      if (prefix >= 3 && q.lessonId) inc(r.lesson, q.lessonId);
      if (prefix >= 4 && q.formId) inc(r.form, q.formId);
    }
    if (posOk) {
      if ((fails & ~B_LEVEL) === 0) inc(r.level, q.level);
      if ((fails & ~B_TYPE) === 0) inc(r.type, q.type);
      if ((fails & ~B_FIG) === 0) r.figure[fig]++;
      if ((fails & ~B_REV) === 0) r.review[rv]++;
    }
  }
  r.list.sort((a, b) => b.updatedAt - a.updatedAt);
  return r;
}
