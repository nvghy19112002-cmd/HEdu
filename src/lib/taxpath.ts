// Kiểm tra vị trí của câu theo ĐỦ đường dẫn cây: Lớp → Phân môn → Chương → Bài → Dạng.
// `locationExists()` (curriculum.ts) chỉ biết một nút có tồn tại; còn `questionCode()` tính mã theo đường của formId,
// nên một Location ghép formId của bài này với lessonId của bài khác vẫn ra mã "hợp lệ" mà sai. Gán ID tự động phải qua đây.
import { hashKey } from './dup2';
import type { Place, TaxIndex } from './taxonomy';
import type { Location, Taxonomy } from './types';

export type PathProblem = 'khong-co-dang' | 'khong-phai-dang' | 'sai-bai' | 'sai-chuong' | 'sai-lop' | 'ngoai-lop-dich';

export const PATH_PROBLEM_LABEL: Record<PathProblem, string> = {
  'khong-co-dang': 'Dạng không còn trong cây',
  'khong-phai-dang': 'Mã không phải một Dạng',
  'sai-bai': 'Dạng không thuộc Bài đã ghi',
  'sai-chuong': 'Bài không thuộc Chương đã ghi',
  'sai-lop': 'Chương không thuộc Lớp đã ghi',
  'ngoai-lop-dich': 'Ngoài lớp thầy/cô đã chọn',
};

export type PathCheck = { ok: true; place: Place } | { ok: false; problem: PathProblem };

/** Kiểm một Location có khớp đúng một đường đi trong cây không. `grade` (nếu có) là lớp đích giáo viên đã chọn. */
export function checkLocation(ix: TaxIndex, loc: Location, grade?: number): PathCheck {
  const p = ix.get(loc.formId);
  if (!p) return { ok: false, problem: 'khong-co-dang' };
  if (p.kind !== 'form' || !p.branch || !p.chapter || !p.lesson || !p.form) return { ok: false, problem: 'khong-phai-dang' };
  if (p.lesson.id !== loc.lessonId) return { ok: false, problem: 'sai-bai' };
  if (p.chapter.id !== loc.chapterId) return { ok: false, problem: 'sai-chuong' };
  if (p.grade.grade !== loc.grade) return { ok: false, problem: 'sai-lop' };
  if (grade != null && p.grade.grade !== grade) return { ok: false, problem: 'ngoai-lop-dich' };
  return { ok: true, place: p };
}

/** Location đầy đủ suy ra từ một Dạng (không tin đường dẫn do nguồn khác gửi kèm). null nếu không phải Dạng. */
export function locationOfForm(ix: TaxIndex, formId: string): Location | null {
  const p = ix.get(formId);
  if (!p || p.kind !== 'form' || !p.chapter || !p.lesson) return null;
  return { grade: p.grade.grade, chapterId: p.chapter.id, lessonId: p.lesson.id, formId };
}

/** Dấu phiên bản cây (gồm cả id nội bộ): cây đổi giữa lúc gợi ý và lúc áp dụng ⇒ gợi ý cũ phải làm lại. */
export function taxRevision(tax: Taxonomy): string {
  return hashKey(JSON.stringify(tax));
}
