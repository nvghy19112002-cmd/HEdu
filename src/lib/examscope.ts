// Tạo đề: số câu phù hợp theo từng mục (Lớp/Phân môn/Chương/Bài/Dạng) để ghi cạnh lựa chọn Dạng bài, và lớp mặc định cho ô mới.
// Hàm thuần, có kiểm thử.
import { nodeKey } from './banktree';
import type { Question, Taxonomy } from './types';

/** Số câu theo từng mục của cây (khóa `nodeKey`), cùng cách đếm với cây Ngân hàng; câu có chương không thuộc lớp của nó không được đếm. */
export function scopeCounts(tax: Taxonomy, qs: Iterable<Question>): { counts: Map<string, number>; total: number } {
  const chap = new Map<string, { grade: number; gradeId: string; branchId: string }>();
  for (const g of tax.grades) for (const b of g.branches) for (const c of b.chapters) chap.set(c.id, { grade: g.grade, gradeId: g.id, branchId: b.id });
  const counts = new Map<string, number>();
  const inc = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);
  let total = 0;
  for (const q of qs) {
    const c = chap.get(q.chapterId);
    if (!c || c.grade !== q.grade) continue;
    total++;
    inc(nodeKey('grade', c.gradeId)); inc(nodeKey('branch', c.branchId)); inc(nodeKey('chapter', q.chapterId));
    if (q.lessonId) inc(nodeKey('lesson', q.lessonId));
    if (q.formId) inc(nodeKey('form', q.formId));
  }
  return { counts, total };
}

/** Lớp mặc định cho ô mới: lớp có nhiều câu nhất trong kho (thay vì luôn lớp cao nhất); kho trống ⇒ lớp cao nhất trong cây. */
export function busiestGrade(tax: Taxonomy, qs: Iterable<Question>): number {
  const n = new Map<number, number>();
  for (const q of qs) n.set(q.grade, (n.get(q.grade) ?? 0) + 1);
  let best: number | null = null;
  for (const g of tax.grades) if ((n.get(g.grade) ?? 0) > 0 && (best === null || (n.get(g.grade) ?? 0) > (n.get(best) ?? 0))) best = g.grade;
  return best ?? (tax.grades.length ? Math.max(...tax.grades.map((g) => g.grade)) : 12);
}
