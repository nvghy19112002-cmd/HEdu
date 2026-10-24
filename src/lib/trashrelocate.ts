// Khôi phục câu có "Vị trí không còn" sang một vị trí MỚI do giáo viên chọn (chủ dự án duyệt 24/10/2026).
// Chỉ đổi vị trí (+ mức độ nếu giáo viên chủ động đổi) và đặt "Cần sửa"; giữ nguyên uid, LaTeX gốc (kể cả dòng %[ID] cũ), nhãn.
// ID6 KHÔNG đổi công thức: vẫn tính bằng questionCode() từ vị trí mới. Phần này thuần (không ghi dữ liệu); ghi dữ liệu nằm ở trashflow.restoreFromTrash.
import { parseExTest } from './extest';
import { questionCode } from './id';
import type { TaxIndex } from './taxonomy';
import { checkLocation } from './taxpath';
import type { Level, Location, Question } from './types';

/** Bản câu sẽ ghi vào Ngân hàng: đổi đúng vị trí (và mức độ nếu có), luôn về "Cần sửa", KHÔNG đụng LaTeX/uid/nhãn. */
export function relocated(q: Question, loc: Location, level?: Level, now = Date.now()): Question {
  return { ...q, grade: loc.grade, chapterId: loc.chapterId, lessonId: loc.lessonId, formId: loc.formId, level: level ?? q.level, review: 'needs_fix', updatedAt: now };
}

/** Vị trí mới hợp lệ khi đủ đường dẫn Lớp → Phân môn → Chương → Bài → Dạng đúng trong cây hiện hành. */
export function validNewLocation(ix: TaxIndex, loc: Location): boolean {
  return !!loc.formId && checkLocation(ix, loc, loc.grade).ok;
}

export function placeLabel(ix: TaxIndex, loc: Location): string {
  const p = ix.get(loc.formId) ?? ix.get(loc.lessonId) ?? ix.get(loc.chapterId);
  if (!p) return '(không còn trong cây chương trình)';
  const names = [p.grade?.name, p.branch?.name, p.chapter?.name, p.lesson?.name, p.form?.name].filter(Boolean);
  return names.length ? names.join(' › ') : '(không còn trong cây chương trình)';
}

export interface RelocPreview {
  oldPlace: string;
  newPlace: string;
  /** ID6 theo vị trí cũ trong snapshot ('—' nếu vị trí cũ không còn) */
  oldCode: string;
  newCode: string;
  /** mã trong dòng %[…] của LaTeX gốc (giữ nguyên, không sửa) */
  latexCode: string | null;
  /** mã trong LaTeX khác mã mới ⇒ cảnh báo (LaTeX KHÔNG bị sửa) */
  mismatch: boolean;
  levelChanged: boolean;
}

export function relocatePreview(q: Question, loc: Location, level: Level, ix: TaxIndex): RelocPreview {
  const newCode = questionCode(loc, level);
  const latexCode = parseExTest(q.latex).idComment;
  return {
    oldPlace: placeLabel(ix, q),
    newPlace: placeLabel(ix, loc),
    oldCode: questionCode(q, q.level),
    newCode,
    latexCode,
    mismatch: !!latexCode && latexCode.trim() !== newCode,
    levelChanged: level !== q.level,
  };
}
