// Logic thuần của Mục lục & Bộ lọc ở màn Ngân hàng (không phụ thuộc React): trạng thái, cascade, lọc, đếm theo chiều.
// Hai nhóm: VỊ TRÍ (Lớp → Phân môn → Chương → Bài → Dạng) và THUỘC TÍNH (Mức độ, Loại câu, Hình, Kiểm duyệt).
import { figureOf, FIGURE_LABEL, type FigureFilter } from './figure';
import { comparator, DEFAULT_SORT, type SortMode } from './qsort';
import { LEVEL_LABEL, LEVELS, REVIEW_LABEL, reviewOf, TYPE_LABEL, TYPES, type Level, type QType, type Question, type ReviewFilter, type Taxonomy } from './types';

export interface BankFilters {
  /** id của Lớp trong cây mục lục (KHÔNG phải số lớp: nhiều lớp có thể trùng số, vd các mã chữ đều là 0) */
  gradeId: string | null;
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
  gradeId: null, branchId: null, chapterId: null, lessonId: null, formId: null,
  levels: new Set(), types: new Set(), figure: 'all', review: 'all',
});

/** Chọn nhiều: chọn ĐỦ mọi giá trị ≡ "Tất cả" (không phải đang lọc). Rỗng cũng là không lọc. */
export const levelsActive = (f: BankFilters) => f.levels.size > 0 && f.levels.size < LEVELS.length;
export const typesActive = (f: BankFilters) => f.types.size > 0 && f.types.size < TYPES.length;
/** Số bộ lọc THUỘC TÍNH đang bật (Mức độ và Loại câu đếm theo số giá trị chọn; chọn đủ = 0). */
export const attrCount = (f: BankFilters) => (levelsActive(f) ? f.levels.size : 0) + (typesActive(f) ? f.types.size : 0) + (f.figure !== 'all' ? 1 : 0) + (f.review !== 'all' ? 1 : 0);
/** Số nhóm thuộc tính đang bật (để hiện trên đầu nhóm "Lọc câu hỏi"). */
export const attrGroups = (f: BankFilters) => (levelsActive(f) ? 1 : 0) + (typesActive(f) ? 1 : 0) + (f.figure !== 'all' ? 1 : 0) + (f.review !== 'all' ? 1 : 0);
export const posActive = (f: BankFilters) => f.gradeId != null;

// ---- cascade ----
const clearFrom = {
  branch: { branchId: null, chapterId: null, lessonId: null, formId: null },
  chapter: { chapterId: null, lessonId: null, formId: null },
  lesson: { lessonId: null, formId: null },
} as const;

export const pickGrade = (f: BankFilters, g: string | null): BankFilters => ({ ...f, gradeId: g, ...clearFrom.branch });
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
/** Các bảng tra của cây, tính một lần cho mỗi cây. */
export interface TaxMaps {
  chapterBranch: Map<string, string>;
  chapterGrade: Map<string, string>;
  /** số lớp → id Lớp, CHỈ khi số đó duy nhất trong cây (dự phòng cho câu chưa gán chương) */
  gradeByNum: Map<number, string>;
}
const taxCache = new WeakMap<Taxonomy, TaxMaps>();
export function taxMaps(tax: Taxonomy): TaxMaps {
  let m = taxCache.get(tax);
  if (!m) {
    const chapterBranch = new Map<string, string>(), chapterGrade = new Map<string, string>(), count = new Map<number, string[]>();
    for (const g of tax.grades) {
      count.set(g.grade, [...(count.get(g.grade) ?? []), g.id]);
      for (const b of g.branches) for (const c of b.chapters) { chapterBranch.set(c.id, b.id); chapterGrade.set(c.id, g.id); }
    }
    const gradeByNum = new Map<number, string>();
    for (const [n, ids] of count) if (ids.length === 1) gradeByNum.set(n, ids[0]);
    m = { chapterBranch, chapterGrade, gradeByNum };
    taxCache.set(tax, m);
  }
  return m;
}
/** chapterId → branchId */
export function chapterBranchMap(tax: Taxonomy): Map<string, string> { return taxMaps(tax).chapterBranch; }

/** Gỡ các giá trị vị trí không còn hợp lệ (vd cây bị sửa/đổi tên trong màn Chương trình): rơi về "Tất cả" ở cấp đó. */
export function sanitize(tax: Taxonomy, f: BankFilters): BankFilters {
  if (f.gradeId == null) return f.branchId || f.chapterId || f.lessonId || f.formId ? { ...f, ...clearFrom.branch } : f;
  const g = tax.grades.find((x) => x.id === f.gradeId);
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
  chapterGrade: Map<string, string>;
  gradeByNum: Map<number, string>;
  /** true nếu câu khớp ô tìm (đã gồm trường hợp ô tìm trống) */
  textOk: (uid: string) => boolean;
  /** "Toàn kho": bỏ qua VỊ TRÍ khi tìm; chỉ nên bật khi đang có chữ tìm */
  wide: boolean;
  /** kiểu sắp xếp của danh sách (mặc định: mới cập nhật) */
  sort?: SortMode;
}

/** Dựng ngữ cảnh lọc từ cây. */
export const facetCtx = (tax: Taxonomy, textOk: (uid: string) => boolean, wide: boolean, sort?: SortMode): FilterCtx => ({ ...taxMaps(tax), textOk, wide, sort });

export interface Facets {
  /** Các câu hiện ra (đã sắp theo mới sửa trước) */
  list: Question[];
  /** Số câu trong vị trí hiện tại, chưa lọc thuộc tính (mẫu số của "N / M") */
  scoped: number;
  /** Số câu trong VỊ TRÍ hiện tại, bỏ qua chữ tìm và thuộc tính (để phân biệt "mục chưa có câu" với "bị lọc hết") */
  inScope: number;
  grade: Map<string, number>; gradeAll: number;
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
    list: [], scoped: 0, inScope: 0, grade: new Map(), gradeAll: 0, branch: new Map(), chapter: new Map(), lesson: new Map(), form: new Map(),
    level: new Map(), type: new Map(), figure: { yes: 0, no: 0, unknown: 0 }, review: { unreviewed: 0, needs_fix: 0, approved: 0 },
  };
  const lv = levelsActive(f), ty = typesActive(f);
  for (const q of questions) {
    const brOfQ = ctx.chapterBranch.get(q.chapterId);
    // Lớp của câu: theo cây (qua chương); câu chưa gán chương thì dự phòng theo số lớp nếu số đó duy nhất
    const gOfQ = ctx.chapterGrade.get(q.chapterId) ?? ctx.gradeByNum.get(q.grade);
    const pos = [
      f.gradeId == null || gOfQ === f.gradeId,
      !f.branchId || brOfQ === f.branchId,
      !f.chapterId || q.chapterId === f.chapterId,
      !f.lessonId || q.lessonId === f.lessonId,
      !f.formId || q.formId === f.formId,
    ];
    if (pos.every(Boolean)) r.inScope++;
    if (!ctx.textOk(q.uid)) continue;
    let prefix = 0;
    while (prefix < 5 && pos[prefix]) prefix++;
    const posOk = ctx.wide || prefix === 5;
    const fig = figureOf(q);
    let fails = 0;
    if (lv && !f.levels.has(q.level)) fails |= B_LEVEL;
    if (ty && !f.types.has(q.type)) fails |= B_TYPE;
    if (f.figure !== 'all' && fig !== f.figure) fails |= B_FIG;
    const rv = reviewOf(q);
    if (f.review !== 'all' && rv !== f.review) fails |= B_REV;

    if (posOk && fails === 0) r.list.push(q);
    if (posOk) r.scoped++;
    if (fails === 0) {
      if (gOfQ) inc(r.grade, gOfQ);
      r.gradeAll++;
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
  r.list.sort(comparator(ctx.sort ?? DEFAULT_SORT));
  return r;
}

// ---- trạng thái rỗng & chip điều kiện ----
export type AttrKey = 'level' | 'type' | 'figure' | 'review';
export interface AttrChip { key: AttrKey; label: string; /** số câu sẽ có nếu bỏ riêng điều kiện này */ after: number }

const sumMap = <K,>(m: Map<K, number>) => { let n = 0; for (const v of m.values()) n += v; return n; };

/** Các điều kiện thuộc tính đang bật, mỗi điều kiện kèm số câu sẽ có nếu bỏ riêng nó (lấy từ số đếm theo chiều, không tính lại). */
export function attrChips(f: BankFilters, facets: Facets): AttrChip[] {
  const out: AttrChip[] = [];
  if (levelsActive(f)) out.push({ key: 'level', label: `Mức độ: ${LEVELS.filter((l) => f.levels.has(l)).map((l) => LEVEL_LABEL[l]).join(', ')}`, after: sumMap(facets.level) });
  if (typesActive(f)) out.push({ key: 'type', label: `Loại câu: ${TYPES.filter((t) => f.types.has(t)).map((t) => TYPE_LABEL[t]).join(', ')}`, after: sumMap(facets.type) });
  if (f.figure !== 'all') out.push({ key: 'figure', label: `Hình: ${FIGURE_LABEL[f.figure]}`, after: facets.figure.yes + facets.figure.no + facets.figure.unknown });
  if (f.review !== 'all') out.push({ key: 'review', label: `Duyệt: ${REVIEW_LABEL[f.review]}`, after: facets.review.unreviewed + facets.review.needs_fix + facets.review.approved });
  return out;
}
/** Bỏ riêng một điều kiện thuộc tính. */
export function dropAttr(f: BankFilters, key: AttrKey): BankFilters {
  return key === 'level' ? { ...f, levels: new Set() } : key === 'type' ? { ...f, types: new Set() } : key === 'figure' ? { ...f, figure: 'all' } : { ...f, review: 'all' };
}

/** Vì sao danh sách rỗng: 'bank' kho trống · 'scope' mục chưa có câu · 'filters' có câu nhưng bộ lọc loại hết · 'text' do chữ tìm. null = không rỗng. */
export type EmptyKind = 'bank' | 'scope' | 'filters' | 'text' | null;
export function emptyKind(facets: Facets, f: BankFilters, o: { totalQuestions: number; hasText: boolean; wide: boolean }): EmptyKind {
  if (facets.list.length) return null;
  if (o.totalQuestions === 0) return 'bank';
  if (!o.wide && facets.inScope === 0) return 'scope';
  if (attrCount(f) > 0) return 'filters';
  return o.hasText ? 'text' : 'scope';
}
