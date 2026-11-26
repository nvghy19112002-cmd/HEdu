// Cây mục lục của màn Ngân hàng (kiểu thư mục): Lớp → (Phân môn nếu lớp có nhiều phân môn) → Chương → Bài → Dạng, kèm số câu.
// Hàm thuần, có kiểm thử: dựng cây hiển thị theo số đếm, ô tìm thư mục (không dấu), ẩn mục chưa có câu, đường dẫn để chọn.
import type { BankFilters } from './bankfilter';
import { gradeLabel } from './taxonomy';
import type { Taxonomy } from './types';

export type NodeKind = 'grade' | 'branch' | 'chapter' | 'lesson' | 'form';
export interface NodePath { gradeId: string | null; branchId: string | null; chapterId: string | null; lessonId: string | null; formId: string | null }
export interface TreeNode { key: string; kind: NodeKind; label: string; code: string; count: number; path: NodePath; children: TreeNode[] }

/** Khóa đếm của một nút (tiền tố theo cấp để không lẫn id giữa các cấp). */
export const nodeKey = (kind: NodeKind, id: string): string => `${kind[0]}:${id}`;

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

/** Khóa của mục đang chọn (mục sâu nhất trong bộ lọc), null = "Tất cả". */
export function selectedKey(f: Pick<BankFilters, 'gradeId' | 'branchId' | 'chapterId' | 'lessonId' | 'formId'>): string | null {
  if (f.formId) return nodeKey('form', f.formId);
  if (f.lessonId) return nodeKey('lesson', f.lessonId);
  if (f.chapterId) return nodeKey('chapter', f.chapterId);
  if (f.branchId) return nodeKey('branch', f.branchId);
  if (f.gradeId) return nodeKey('grade', f.gradeId);
  return null;
}

/** Cây đầy đủ theo chương trình. Lớp chỉ có một phân môn thì bỏ cấp phân môn (chương nằm thẳng dưới lớp). */
export function fullTree(tax: Taxonomy, counts: ReadonlyMap<string, number>): TreeNode[] {
  const n = (k: string) => counts.get(k) ?? 0;
  return tax.grades.map((g) => {
    const gp: NodePath = { gradeId: g.id, branchId: null, chapterId: null, lessonId: null, formId: null };
    const chaptersOf = (b: (typeof g.branches)[number]): TreeNode[] => b.chapters.map((c) => {
      const cp: NodePath = { ...gp, branchId: b.id, chapterId: c.id };
      return {
        key: nodeKey('chapter', c.id), kind: 'chapter', label: c.name, code: `${g.code}${b.code}${c.code}`, count: n(nodeKey('chapter', c.id)), path: cp,
        children: c.lessons.map((l) => {
          const lp: NodePath = { ...cp, lessonId: l.id };
          return {
            key: nodeKey('lesson', l.id), kind: 'lesson', label: l.name, code: `${g.code}${b.code}${c.code}${l.code}`, count: n(nodeKey('lesson', l.id)), path: lp,
            children: l.forms.map((f) => ({ key: nodeKey('form', f.id), kind: 'form' as const, label: f.name, code: `${g.code}${b.code}${c.code}${l.code}-${f.code}`, count: n(nodeKey('form', f.id)), path: { ...lp, formId: f.id }, children: [] })),
          };
        }),
      };
    });
    const multi = g.branches.filter((b) => b.chapters.length).length > 1;
    const children = multi
      ? g.branches.map((b) => ({ key: nodeKey('branch', b.id), kind: 'branch' as const, label: b.name, code: `${g.code}${b.code}`, count: n(nodeKey('branch', b.id)), path: { ...gp, branchId: b.id }, children: chaptersOf(b) }))
      : g.branches.flatMap(chaptersOf);
    return { key: nodeKey('grade', g.id), kind: 'grade', label: gradeLabel(g), code: g.code, count: n(nodeKey('grade', g.id)), path: gp, children };
  });
}

/**
 * Cây để hiện: lọc theo chữ tìm (tên hoặc mã, không dấu) — giữ mục khớp và các mục cha của nó; ẩn mục 0 câu (trừ khi `showEmpty`
 * hoặc mục nằm trên đường tới mục đang chọn, để giáo viên không "mất" chỗ đang đứng).
 */
export function visibleTree(nodes: readonly TreeNode[], o: { query: string; showEmpty: boolean; selected: string | null; selectedPath: ReadonlySet<string> }): TreeNode[] {
  const q = fold(o.query.trim());
  const walk = (ns: readonly TreeNode[]): TreeNode[] => ns.flatMap((x) => {
    const kids = walk(x.children);
    const hit = !q || fold(`${x.code} ${x.label}`).includes(q);
    const keepEmpty = o.showEmpty || x.count > 0 || o.selectedPath.has(x.key);
    if (q ? hit || kids.length : keepEmpty) return [{ ...x, children: q && hit && !kids.length ? x.children.filter((c) => o.showEmpty || c.count > 0) : kids }];
    return [];
  });
  return walk(nodes);
}

/** Các khóa trên đường từ gốc tới mục đang chọn (để mở sẵn và không bị ẩn). */
export function pathKeys(f: NodePath): Set<string> {
  const s = new Set<string>();
  if (f.gradeId) s.add(nodeKey('grade', f.gradeId));
  if (f.branchId) s.add(nodeKey('branch', f.branchId));
  if (f.chapterId) s.add(nodeKey('chapter', f.chapterId));
  if (f.lessonId) s.add(nodeKey('lesson', f.lessonId));
  if (f.formId) s.add(nodeKey('form', f.formId));
  return s;
}

/** Áp đường dẫn của một mục vào bộ lọc (giữ nguyên các bộ lọc thuộc tính). */
export const pickPath = (f: BankFilters, p: NodePath): BankFilters => ({ ...f, ...p, noId: null });

// ---- Thống kê từng mục cho mục lục mới (phân bố mức độ, thiếu lời giải, đã duyệt) ----
export interface NodeStat { lv: [number, number, number, number]; noSol: number; approved: number }
const LV_IX: Record<string, number> = { NB: 0, TH: 1, VD: 2, VDC: 3 };
/** Câu có lời giải chưa: có \loigiai{…} mà bên trong còn chữ (bỏ khoảng trắng, ngoặc, chú thích). */
export function hasSolution(latex: string): boolean {
  const i = latex.search(/\loigiai\s*\{/);
  if (i < 0) return false;
  const body = latex.slice(latex.indexOf('{', i) + 1).split(/\end\{ex\}/)[0].replace(/%[^\n]*/g, '');
  return body.replace(/[\s{}]/g, '').length >= 2;
}
/**
 * Một lượt O(N) trên TOÀN kho (không theo bộ lọc): mỗi câu cộng vào Lớp, Phân môn, Chương, Bài, Dạng của nó.
 * Câu "Chưa có ID" (noIdOf ≠ null) không thuộc mục nào nên không cộng, giống `computeFacets`.
 */
export function nodeStats(
  questions: readonly { uid: string; level: string; latex: string; review?: string; grade: number; chapterId: string; lessonId: string; formId: string }[],
  maps: { chapterBranch: ReadonlyMap<string, string>; chapterGrade: ReadonlyMap<string, string>; gradeByNum: ReadonlyMap<number, string> },
  noIdOf?: (q: never) => number | null,
): Map<string, NodeStat> {
  const out = new Map<string, NodeStat>();
  const add = (k: string, lv: number, noSol: boolean, ok: boolean) => {
    let s = out.get(k);
    if (!s) { s = { lv: [0, 0, 0, 0], noSol: 0, approved: 0 }; out.set(k, s); }
    if (lv >= 0) s.lv[lv]++;
    if (noSol) s.noSol++;
    if (ok) s.approved++;
  };
  for (const q of questions) {
    if (noIdOf && (noIdOf as (x: typeof q) => number | null)(q) !== null) continue;
    const g = maps.chapterGrade.get(q.chapterId) ?? maps.gradeByNum.get(q.grade);
    const b = maps.chapterBranch.get(q.chapterId);
    const lv = LV_IX[q.level] ?? -1, noSol = !hasSolution(q.latex), ok = q.review === 'approved';
    if (g) add(`g:${g}`, lv, noSol, ok);
    if (b) add(`b:${b}`, lv, noSol, ok);
    if (q.chapterId) add(`c:${q.chapterId}`, lv, noSol, ok);
    if (q.lessonId) add(`l:${q.lessonId}`, lv, noSol, ok);
    if (q.formId) add(`f:${q.formId}`, lv, noSol, ok);
  }
  return out;
}
