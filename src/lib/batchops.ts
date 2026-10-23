// Thao tác hàng loạt KHÔNG nguy hiểm: gắn/bỏ nhãn (chưa gắn vào giao diện), đánh dấu Cần sửa / Chưa kiểm tra.
// Logic thuần (không đụng kho dữ liệu) để xem trước "bao nhiêu câu sẽ đổi" và để test.
// KHÔNG có: duyệt hàng loạt, đổi loại câu, sửa LaTeX, xoá hàng loạt (xoá nằm ở PR-D, có cổng an toàn riêng).
import type { Question, ReviewStatus } from './types';

export const TAG_MAX_LEN = 40;

/** Chuẩn hoá một nhãn: bỏ khoảng trắng thừa; rỗng ⇒ ''. */
export function cleanTag(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, TAG_MAX_LEN);
}

/** Tách ô nhập "a, b; c" thành danh sách nhãn sạch, không trùng (không phân biệt hoa/thường), giữ thứ tự. */
export function parseTagInput(s: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of s.split(/[,;\n]/)) {
    const t = cleanTag(part);
    const k = t.toLowerCase();
    if (t && !seen.has(k)) { seen.add(k); out.push(t); }
  }
  return out;
}

export interface TagOps { add: readonly string[]; remove: readonly string[] }

/** Áp thao tác nhãn lên một câu. Giữ nguyên nhãn khác và thứ tự cũ. Trả về cùng mảng nếu không đổi gì. */
export function applyTagOps(tags: readonly string[], ops: TagOps): string[] {
  const rm = new Set(ops.remove.map((t) => t.toLowerCase()));
  let out = tags.filter((t) => !rm.has(t.toLowerCase()));
  const have = new Set(out.map((t) => t.toLowerCase()));
  for (const t of ops.add) { const k = t.toLowerCase(); if (!have.has(k)) { have.add(k); out = [...out, t]; } }
  return out.length === tags.length && out.every((t, i) => t === tags[i]) ? (tags as string[]) : out;
}

/** Các nhãn đang có trong tập câu, kèm số câu dùng nhãn đó (nhiều nhất trước). */
export function tagCounts(qs: readonly Question[]): { tag: string; n: number }[] {
  const m = new Map<string, { tag: string; n: number }>();
  for (const q of qs) {
    const seen = new Set<string>();
    for (const t of q.tags) {
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      const e = m.get(k);
      if (e) e.n++; else m.set(k, { tag: t, n: 1 });
    }
  }
  return [...m.values()].sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag, 'vi'));
}

/** Xem trước: bao nhiêu câu SẼ đổi nhãn (câu đã đúng sẵn thì không tính). */
export function tagChangeCount(qs: readonly Question[], ops: TagOps): number {
  let n = 0;
  for (const q of qs) if (applyTagOps(q.tags, ops) !== q.tags) n++;
  return n;
}

export const reviewChangeCount = (qs: readonly Question[], status: ReviewStatus | undefined): number => qs.reduce((n, q) => n + (q.review === status ? 0 : 1), 0);

/** Bộ biến đổi từng câu cho `updateMany`: mỗi hàm CHỈ đổi đúng một trường (uid, seq, latex, loại câu, ngày sửa giữ nguyên). */
export const withTags = (ops: TagOps) => (q: Question): Question | null => { const t = applyTagOps(q.tags, ops); return t === q.tags ? null : { ...q, tags: t }; };
export const withReview = (status: ReviewStatus | undefined) => (q: Question): Question | null => {
  if (q.review === status) return null;
  const n: Question = { ...q };
  if (status) n.review = status; else delete n.review;
  return n;
};
