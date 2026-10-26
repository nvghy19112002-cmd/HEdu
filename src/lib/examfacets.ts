// Cây thư mục ảo và bộ lọc theo thuộc tính cho Thư viện đề thi (E4). Thuần, không phụ thuộc giao diện.
// Thư mục là NHÃN trong sổ của từng đề (không phải thư mục trên đĩa): đổi thư mục không đụng tới tệp.
import type { ExamStatus, ExamSummary } from './examlib';

export interface FacetSel {
  /** null = tất cả; '' = chưa xếp thư mục; còn lại = đường dẫn thư mục (gồm cả thư mục con) */
  folder: string | null;
  grade: number | null;
  year: string | null;
  type: string | null;
  tag: string | null;
  status: ExamStatus | null;
}
export const EMPTY_SEL: FacetSel = { folder: null, grade: null, year: null, type: null, tag: null, status: null };
export const isEmptySel = (s: FacetSel): boolean => Object.values(s).every((v) => v === null);

export interface FolderNode { name: string; path: string; count: number; children: FolderNode[] }

const inFolder = (f: string | null | undefined, sel: string): boolean => (sel === '' ? !f : !!f && (f === sel || f.startsWith(sel + '/')));

function matches(e: ExamSummary, s: FacetSel, skip?: keyof FacetSel): boolean {
  if (skip !== 'folder' && s.folder !== null && !inFolder(e.folder, s.folder)) return false;
  if (skip !== 'grade' && s.grade !== null && e.metadata.grade !== s.grade) return false;
  if (skip !== 'year' && s.year !== null && e.metadata.schoolYear !== s.year) return false;
  if (skip !== 'type' && s.type !== null && e.metadata.examType !== s.type) return false;
  if (skip !== 'tag' && s.tag !== null && !e.metadata.tags.includes(s.tag)) return false;
  if (skip !== 'status' && s.status !== null && e.status !== s.status) return false;
  return true;
}

export const applyFacets = (list: readonly ExamSummary[], s: FacetSel): ExamSummary[] => list.filter((e) => matches(e, s));

/** Cây thư mục; đếm cả đề trong thư mục con. Đếm theo các bộ lọc KHÁC (không tính chính ô thư mục). */
export function folderTree(list: readonly ExamSummary[], s: FacetSel): { roots: FolderNode[]; unfiled: number; total: number } {
  const base = list.filter((e) => matches(e, s, 'folder'));
  const root: FolderNode = { name: '', path: '', count: 0, children: [] };
  let unfiled = 0;
  for (const e of base) {
    if (!e.folder) { unfiled++; continue; }
    let cur = root;
    e.folder.split('/').forEach((p, i, a) => {
      const path = a.slice(0, i + 1).join('/');
      let n = cur.children.find((c) => c.name === p);
      if (!n) { n = { name: p, path, count: 0, children: [] }; cur.children.push(n); }
      n.count++;
      cur = n;
    });
  }
  const sort = (n: FolderNode) => { n.children.sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true, sensitivity: 'base' })); n.children.forEach(sort); };
  sort(root);
  return { roots: root.children, unfiled, total: base.length };
}

export interface FacetValue<T> { value: T; count: number }

function count<T>(list: readonly ExamSummary[], s: FacetSel, dim: keyof FacetSel, get: (e: ExamSummary) => T[]): FacetValue<T>[] {
  const m = new Map<T, number>();
  for (const e of list) if (matches(e, s, dim)) for (const v of new Set(get(e))) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].map(([value, count]) => ({ value, count }));
}

export interface Facets {
  grades: FacetValue<number>[]; years: FacetValue<string>[]; types: FacetValue<string>[]; tags: FacetValue<string>[]; statuses: FacetValue<ExamStatus>[];
}

/** Giá trị có thể chọn ở từng chiều, kèm số đề (tính theo các chiều khác đang chọn). Giá trị đang chọn luôn hiện, kể cả khi đếm = 0. */
export function facets(list: readonly ExamSummary[], s: FacetSel): Facets {
  const keep = <T>(v: FacetValue<T>[], cur: T | null): FacetValue<T>[] => (cur !== null && !v.some((x) => x.value === cur) ? [...v, { value: cur, count: 0 }] : v);
  const num = (a: FacetValue<number>, b: FacetValue<number>) => a.value - b.value;
  const str = (a: FacetValue<string>, b: FacetValue<string>) => a.value.localeCompare(b.value, 'vi', { numeric: true });
  return {
    grades: keep(count(list, s, 'grade', (e) => (e.metadata.grade ? [e.metadata.grade] : [])), s.grade).sort(num),
    years: keep(count(list, s, 'year', (e) => (e.metadata.schoolYear ? [e.metadata.schoolYear] : [])), s.year).sort((a, b) => str(b, a)),
    types: keep(count(list, s, 'type', (e) => (e.metadata.examType ? [e.metadata.examType] : [])), s.type).sort(str),
    tags: keep(count(list, s, 'tag', (e) => e.metadata.tags), s.tag).sort(str),
    statuses: keep(count(list, s, 'status', (e) => [e.status]), s.status),
  };
}

/** Mọi đường dẫn thư mục đang có (kể cả thư mục cha), dùng gợi ý khi nhập. */
export function allFolders(list: readonly ExamSummary[]): string[] {
  const set = new Set<string>();
  for (const e of list) if (e.folder) e.folder.split('/').forEach((_, i, a) => set.add(a.slice(0, i + 1).join('/')));
  return [...set].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
}
