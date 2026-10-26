// Gán ID tự động theo vị trí trong cây mục lục.
//   [Lớp][Phân môn][Chương][Mức độ][Bài]-[Dạng]   ví dụ 2D1H1-1
//   Lớp: 10→0, 11→1, 12→2 · Phân môn: D, H, C… · Mức độ: N nhận biết, H thông hiểu,
//   V vận dụng, C vận dụng cao.
// Mã của từng cấp lấy từ cây mục lục, nên đổi cây là đổi mã — không phải sửa code.
import { getTaxonomy, place } from './curriculum';
import { LEVEL_LETTER, resolveCode } from './idsync';
import { gradeCode } from './taxonomy';
import type { Level, Location } from './types';

export { LEVEL_LETTER };

export function gradeDigit(grade: number): string {
  return gradeCode(grade);
}

export function questionCode(loc: Location, level: Level): string {
  const p = place(loc.formId) ?? place(loc.lessonId) ?? place(loc.chapterId);
  if (!p || !p.branch || !p.chapter) return '—';
  const lesson = p.lesson?.code ?? '1';
  const form = p.form?.code ?? '1';
  return `${p.grade.code}${p.branch.code}${p.chapter.code}${LEVEL_LETTER[level]}${lesson}-${form}`;
}

/**
 * Đọc ngược ID (vd. 2D1H1-1) ra vị trí và mức độ theo cây hiện hành — CHẶT: mã thiếu Dạng, Dạng không còn,
 * mã trùng trong cây ⇒ null (trước đây mã thiếu Dạng bị hiểu lặng lẽ là Dạng đầu tiên của Bài). Lý do cụ thể: idsync.resolveCode.
 */
export function parseCode(code: string): { loc: Location; level: Level } | null {
  const r = resolveCode(code, getTaxonomy());
  return r.ok ? { loc: r.loc, level: r.level } : null;
}

export function seqLabel(seq: number): string {
  return '#' + String(seq).padStart(4, '0');
}
