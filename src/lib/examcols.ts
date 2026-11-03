// Thư viện đề kiểu Finder: cột của bảng, sắp xếp theo cột, thư mục thông minh (Gần đây, Gắn sao, Cần rà soát), gắn sao.
// Hàm thuần, không đụng dữ liệu. Gắn sao dùng nhãn "★" trong tags của đề (không đổi schema).
import { catOfType, CAT_LABEL } from './examtree';
import type { ExamSummary } from './examlib';

export type ColKey = 'name' | 'type' | 'grade' | 'year' | 'status' | 'count' | 'files' | 'size' | 'updated';
export const COL_ORDER: readonly ColKey[] = ['name', 'type', 'grade', 'year', 'status', 'count', 'files', 'size', 'updated'];
export const COL_LABEL: Readonly<Record<ColKey, string>> = { name: 'Tên', type: 'Loại', grade: 'Lớp', year: 'Năm học', status: 'Trạng thái', count: 'Câu', files: 'Tệp', size: 'Dung lượng', updated: 'Sửa' };
/** hướng sắp xếp mặc định khi bấm một cột lần đầu: ngày/số lớn trước, chữ A→Z */
export const COL_DEFAULT_DIR: Readonly<Record<ColKey, 1 | -1>> = { name: 1, type: 1, grade: 1, year: -1, status: 1, count: -1, files: -1, size: -1, updated: -1 };
export interface ColSort { key: ColKey; dir: 1 | -1 }
export const DEFAULT_COL_SORT: ColSort = { key: 'updated', dir: -1 };

export const STAR = '★';
export const RECENT_DAYS = 14;
export type SmartKey = 'recent' | 'star' | 'review';
export const SMART_LABEL: Readonly<Record<SmartKey, string>> = { recent: 'Gần đây', star: 'Gắn sao', review: 'Cần rà soát' };

export const isStar = (e: ExamSummary): boolean => e.metadata.tags.includes(STAR);
export const withStar = (tags: readonly string[], on: boolean): string[] => (on ? (tags.includes(STAR) ? [...tags] : [...tags, STAR]) : tags.filter((t) => t !== STAR));

/** Sửa trong RECENT_DAYS ngày gần nhất (updatedAt dạng ISO hoặc số giây; không đọc được ⇒ không coi là gần đây). */
export function isRecent(e: ExamSummary, now: number): boolean {
  const t = Date.parse(e.updatedAt);
  if (!Number.isFinite(t)) {
    const n = Number(e.updatedAt);
    return Number.isFinite(n) && n > 0 && now - (n > 1e11 ? n : n * 1000) <= RECENT_DAYS * 864e5;
  }
  return now - t <= RECENT_DAYS * 864e5;
}

export function inSmart(e: ExamSummary, k: SmartKey, now: number): boolean {
  return k === 'recent' ? isRecent(e, now) : k === 'star' ? isStar(e) : e.status === 'needs_review';
}

const STATUS_RANK: Record<string, number> = { draft: 0, needs_review: 1, finalized: 2 };

/** Sắp xếp theo cột; cùng giá trị thì theo tên A→Z để thứ tự ổn định. `count` = số câu theo id (đề chưa biết số câu xếp cuối khi giảm dần). */
export function sortByCol(list: readonly ExamSummary[], s: ColSort, count: ReadonlyMap<string, number>): ExamSummary[] {
  const byName = (x: ExamSummary, y: ExamSummary) => x.name.localeCompare(y.name, 'vi', { numeric: true, sensitivity: 'base' });
  const str = (a: string, b: string) => a.localeCompare(b, 'vi', { numeric: true, sensitivity: 'base' });
  const typeOf = (e: ExamSummary) => { const c = catOfType(e.metadata.examType); return c ? CAT_LABEL[c] : e.metadata.examType ?? ''; };
  const cmp = (x: ExamSummary, y: ExamSummary): number => {
    switch (s.key) {
      case 'name': return byName(x, y);
      case 'type': return str(typeOf(x), typeOf(y));
      case 'grade': return (x.metadata.grade ?? 99) - (y.metadata.grade ?? 99);
      case 'year': return str(x.metadata.schoolYear ?? '', y.metadata.schoolYear ?? '');
      case 'status': return (STATUS_RANK[x.status] ?? 9) - (STATUS_RANK[y.status] ?? 9);
      case 'count': return (count.get(x.id) ?? -1) - (count.get(y.id) ?? -1);
      case 'files': return x.fileCount - y.fileCount;
      case 'size': return x.totalBytes - y.totalBytes;
      case 'updated': return x.updatedAt < y.updatedAt ? -1 : x.updatedAt > y.updatedAt ? 1 : 0;
    }
  };
  return [...list].sort((x, y) => (cmp(x, y) * s.dir) || byName(x, y));
}

/** Bấm tiêu đề cột: cột đang sắp xếp thì đảo chiều, cột khác thì đổi sang cột đó theo hướng mặc định. */
export function clickCol(cur: ColSort, key: ColKey): ColSort {
  return cur.key === key ? { key, dir: cur.dir === 1 ? -1 : 1 } : { key, dir: COL_DEFAULT_DIR[key] };
}

export function parseColSort(raw: string | null): ColSort {
  try {
    const v = JSON.parse(raw ?? 'null') as Partial<ColSort> | null;
    if (v && (COL_ORDER as readonly string[]).includes(v.key as string) && (v.dir === 1 || v.dir === -1)) return { key: v.key as ColKey, dir: v.dir };
  } catch { /* hỏng thì dùng mặc định */ }
  return DEFAULT_COL_SORT;
}

/** Loại tệp để hiện nhãn trong cây tệp của một đề. */
export type FileKind = 'tex' | 'pdf' | 'img' | 'pkg' | 'other';
export function fileKind(rel: string): FileKind {
  const ext = (rel.split('.').pop() ?? '').toLowerCase();
  if (ext === 'tex' || ext === 'tikz') return 'tex';
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'eps'].includes(ext)) return 'img';
  if (['sty', 'cls', 'clo', 'def', 'cfg', 'fd', 'bib', 'bst'].includes(ext)) return 'pkg';
  return 'other';
}
export const FILE_KIND_LABEL: Readonly<Record<FileKind, string>> = { tex: 'TeX', pdf: 'PDF', img: 'Ảnh', pkg: 'Gói', other: 'Tệp' };

/** Danh sách tệp của một đề để hiện dạng cây phẳng: .tex trước, rồi theo đường dẫn; trả tối đa `max` dòng và số dòng bị cắt. */
export function fileRows(files: readonly { rel: string; bytes: number }[], max = 300): { rows: { rel: string; dir: string; name: string; bytes: number; kind: FileKind }[]; hidden: number } {
  const rank: Record<FileKind, number> = { tex: 0, pdf: 1, pkg: 2, img: 3, other: 4 };
  const all = files.map((f) => { const i = f.rel.lastIndexOf('/'); return { rel: f.rel, dir: i < 0 ? '' : f.rel.slice(0, i), name: i < 0 ? f.rel : f.rel.slice(i + 1), bytes: f.bytes, kind: fileKind(f.rel) }; });
  all.sort((a, b) => rank[a.kind] - rank[b.kind] || a.rel.localeCompare(b.rel, 'vi', { numeric: true, sensitivity: 'base' }));
  return { rows: all.slice(0, max), hidden: Math.max(0, all.length - max) };
}
