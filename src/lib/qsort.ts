// Sắp xếp câu hỏi cho màn Ngân hàng. Thứ tự phụ luôn ổn định (seq rồi uid) để danh sách không "nhảy" khi ngày cập nhật bằng nhau.
// Cố ý KHÔNG có "sắp theo mã ID6": mã phụ thuộc cây mục lục và mức độ, đổi theo chúng nên thứ tự sẽ khó đoán.
import type { Question } from './types';

export type SortMode = 'level-asc' | 'level-desc' | 'updated-desc' | 'updated-asc' | 'seq-desc' | 'seq-asc';
export const SORT_MODES: SortMode[] = ['level-asc', 'level-desc', 'updated-desc', 'updated-asc', 'seq-desc', 'seq-asc'];
export const SORT_LABEL: Record<SortMode, string> = {
  'level-asc': 'Mức độ tăng dần',
  'level-desc': 'Mức độ giảm dần',
  'updated-desc': 'Mới cập nhật',
  'updated-asc': 'Cập nhật lâu nhất',
  'seq-desc': 'Số câu giảm dần',
  'seq-asc': 'Số câu tăng dần',
};
export const DEFAULT_SORT: SortMode = 'level-asc';
const LV: Record<string, number> = { NB: 0, TH: 1, VD: 2, VDC: 3 };
const lv = (q: Question) => LV[q.level] ?? 9;

const byUid = (a: Question, b: Question) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0);

export function comparator(mode: SortMode): (a: Question, b: Question) => number {
  switch (mode) {
    case 'updated-asc': return (a, b) => a.updatedAt - b.updatedAt || a.seq - b.seq || byUid(a, b);
    case 'seq-desc': return (a, b) => b.seq - a.seq || byUid(a, b);
    case 'seq-asc': return (a, b) => a.seq - b.seq || byUid(a, b);
    case 'level-asc': return (a, b) => lv(a) - lv(b) || a.seq - b.seq || byUid(a, b);
    case 'level-desc': return (a, b) => lv(b) - lv(a) || a.seq - b.seq || byUid(a, b);
    default: return (a, b) => b.updatedAt - a.updatedAt || b.seq - a.seq || byUid(a, b);
  }
}
export const sortedCopy = (list: readonly Question[], mode: SortMode): Question[] => [...list].sort(comparator(mode));
