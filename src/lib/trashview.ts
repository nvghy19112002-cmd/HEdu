// Logic thuần của màn Thùng rác: tìm / lọc / sắp xếp / phân trang / cờ trạng thái. Không đụng dữ liệu.
// Thùng rác lưu SNAPSHOT của câu lúc bị xoá; màn hình chỉ ĐỌC. Tìm kiếm dùng chữ nhỏ đã bỏ dấu, nhớ theo (uid, thời điểm xoá)
// để gõ chữ trong 1.000 câu không phải dựng lại toàn bộ.
import { questionCode, seqLabel } from './id';
import { plainSnippet } from './snippet';
import { parseExTest } from './extest';
import type { TrashRec } from './dupdecisions';
import type { QType, Question } from './types';

export type DateFilter = 'all' | 'today' | '7d' | '30d';
export type StatusFilter = 'all' | 'restorable' | 'conflict';
export type SortMode = 'newest' | 'oldest' | 'seq' | 'grade';

export interface TrashFilter {
  text: string;
  grade: number | 'all';
  type: QType | 'all';
  date: DateFilter;
  status: StatusFilter;
  sort: SortMode;
}

export const DEFAULT_FILTER: TrashFilter = { text: '', grade: 'all', type: 'all', date: 'all', status: 'all', sort: 'newest' };
export const isDefaultFilter = (f: TrashFilter): boolean => f.text.trim() === '' && f.grade === 'all' && f.type === 'all' && f.date === 'all' && f.status === 'all' && f.sort === 'newest';

export const SORT_LABEL: Record<SortMode, string> = { newest: 'Mới xoá nhất', oldest: 'Xoá lâu nhất', seq: 'Số thứ tự', grade: 'Lớp' };
export const DATE_LABEL: Record<DateFilter, string> = { all: 'Mọi lúc', today: 'Hôm nay', '7d': '7 ngày qua', '30d': '30 ngày qua' };
export const STATUS_LABEL: Record<StatusFilter, string> = { all: 'Tất cả', restorable: 'Khôi phục được', conflict: 'Cần xử lý' };

/** Cờ trạng thái của một câu trong Thùng rác so với Ngân hàng hiện tại. */
export interface TrashFlags {
  /** uid này đang có trong Ngân hàng */
  inBank: boolean;
  /** số thứ tự cũ đã có câu KHÁC dùng (khôi phục sẽ được cấp số mới) */
  seqTaken: boolean;
  /** vị trí cũ (lớp/chương/bài/dạng) không còn đúng trong cây */
  locationGone: boolean;
}

export interface TrashRow extends TrashFlags {
  q: Question;
  at: number;
  id6: string;
  /** cần xử lý trước khi khôi phục: đã có trong Ngân hàng hoặc vị trí không còn */
  conflict: boolean;
}

export const fold = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

const hay = new Map<string, string>();
/** Chuỗi để tìm: số #, ID6, đề bài (không markup) và nguyên mã LaTeX; nhớ theo uid + thời điểm xoá. */
export function haystack(r: Pick<TrashRec, 'q' | 'at'>, id6: string): string {
  const k = `${r.q.uid}|${r.at}|${r.q.latex.length}`;
  let h = hay.get(k);
  if (h === undefined) {
    h = fold([seqLabel(r.q.seq), String(r.q.seq), id6, plainSnippet(parseExTest(r.q.latex).stem, 4000), r.q.latex].join('\n'));
    if (hay.size > 4000) hay.clear();
    hay.set(k, h);
  }
  return h;
}

/** Dựng các hàng từ Thùng rác; `locationBad` là hàm kiểm vị trí (locationProblem). */
export function buildRows(items: readonly TrashRec[], bank: readonly Question[], locationBad: (q: Question) => boolean): TrashRow[] {
  const uids = new Set(bank.map((q) => q.uid));
  const seqs = new Set(bank.map((q) => q.seq));
  return items.map(({ q, at }) => {
    const inBank = uids.has(q.uid);
    const seqTaken = !inBank && seqs.has(q.seq);
    const locationGone = locationBad(q);
    return { q, at, id6: questionCode(q, q.level), inBank, seqTaken, locationGone, conflict: inBank || locationGone };
  });
}

const DAY = 24 * 3600 * 1000;
const startOfToday = (now: number): number => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function filterRows(rows: readonly TrashRow[], f: TrashFilter, now = Date.now()): TrashRow[] {
  const terms = fold(f.text).split(/\s+/).filter(Boolean);
  const since = f.date === 'today' ? startOfToday(now) : f.date === '7d' ? now - 7 * DAY : f.date === '30d' ? now - 30 * DAY : -Infinity;
  const out = rows.filter((r) => {
    if (f.grade !== 'all' && r.q.grade !== f.grade) return false;
    if (f.type !== 'all' && r.q.type !== f.type) return false;
    if (r.at < since) return false;
    if (f.status === 'restorable' && r.conflict) return false;
    if (f.status === 'conflict' && !r.conflict) return false;
    if (terms.length) { const h = haystack(r, r.id6); for (const t of terms) if (!h.includes(t)) return false; }
    return true;
  });
  const by: Record<SortMode, (a: TrashRow, b: TrashRow) => number> = {
    newest: (a, b) => b.at - a.at || a.q.seq - b.q.seq,
    oldest: (a, b) => a.at - b.at || a.q.seq - b.q.seq,
    seq: (a, b) => a.q.seq - b.q.seq,
    grade: (a, b) => a.q.grade - b.q.grade || a.q.seq - b.q.seq,
  };
  return out.sort(by[f.sort]);
}

export const PAGE_SIZES = [25, 50] as const;
export function pageOf<T>(list: readonly T[], page: number, size: number): { items: T[]; page: number; pages: number; from: number; to: number } {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const p = Math.min(Math.max(0, page), pages - 1);
  const from = p * size;
  return { items: list.slice(from, from + size), page: p, pages, from: list.length ? from + 1 : 0, to: Math.min(list.length, from + size) };
}

/** Dòng nhắc sức chứa (không bao giờ tự dọn): null nếu còn rộng. */
export function capacityNote(count: number, cap: number): { level: 'warn' | 'full'; text: string } | null {
  if (count >= cap) return { level: 'full', text: `Thùng rác đã đầy (${cap}/${cap}). Không thể chuyển thêm câu vào Thùng rác — hãy khôi phục hoặc xoá hẳn bớt (nên sao lưu hoặc xuất trước).` };
  if (count >= Math.floor(cap * 0.9)) return { level: 'warn', text: 'Sắp đầy — hãy xem lại các câu hoặc tạo bản sao lưu trước khi dọn. HEdu không tự xoá câu nào.' };
  return null;
}

/** Ngày xoá hiển thị: "Hôm nay 09:14", "Hôm qua", hoặc dd/mm/yyyy. */
export function dateText(at: number, now = Date.now()): string {
  const d = new Date(at), t0 = startOfToday(now);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (at >= t0) return `Hôm nay ${hm}`;
  if (at >= t0 - DAY) return 'Hôm qua';
  return d.toLocaleDateString('vi-VN');
}
