// Khôi phục câu có "Vị trí không còn" sang một vị trí MỚI do giáo viên chọn (chủ dự án duyệt 24/10/2026).
// Đổi vị trí (+ mức độ nếu giáo viên chủ động đổi), đặt "Cần sửa", và ghi ID6 mới vào vùng `%[ID]` của LaTeX (đặc tả Gán ID: đổi vị trí
// thì ID trong LaTeX đổi theo). Ngoài vùng ID, LaTeX/uid/nhãn giữ nguyên. Câu có nhiều ID mâu thuẫn: LaTeX giữ nguyên và báo trước.
// Phần này thuần (không ghi dữ liệu); ghi dữ liệu nằm ở trashflow.restoreFromTrash.
import { getTaxonomy } from './curriculum';
import { questionCode } from './id';
import { placeWithId, readLatexId } from './idsync';
import type { TaxIndex } from './taxonomy';
import { checkLocation } from './taxpath';
import type { Level, Location, Question, Taxonomy } from './types';

/** Bản câu sẽ ghi vào Ngân hàng: đổi đúng vị trí (và mức độ nếu có) cùng ID trong LaTeX, luôn về "Cần sửa", KHÔNG đụng uid/nhãn. */
export function relocated(q: Question, loc: Location, level?: Level, now = Date.now(), tax: Taxonomy = getTaxonomy()): Question {
  const lv = level ?? q.level;
  const w = placeWithId(q.latex, loc, lv, tax, true);
  return { ...q, latex: 'latex' in w ? w.latex : q.latex, grade: loc.grade, chapterId: loc.chapterId, lessonId: loc.lessonId, formId: loc.formId, level: lv, review: 'needs_fix', updatedAt: now };
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
  /** mã đang ghi trong vùng %[…] của LaTeX (null nếu chưa có) */
  latexCode: string | null;
  /** mã trong LaTeX khác mã mới ⇒ sẽ được THAY bằng mã mới khi khôi phục */
  mismatch: boolean;
  /** không ghi được ID mới vào LaTeX (nhiều ID mâu thuẫn…) ⇒ LaTeX giữ nguyên, cần sửa tay sau */
  idBlocked: boolean;
  levelChanged: boolean;
}

export function relocatePreview(q: Question, loc: Location, level: Level, ix: TaxIndex, tax: Taxonomy = getTaxonomy()): RelocPreview {
  const newCode = questionCode(loc, level);
  const latexCode = readLatexId(q.latex, tax).raw;
  return {
    oldPlace: placeLabel(ix, q),
    newPlace: placeLabel(ix, loc),
    oldCode: questionCode(q, q.level),
    newCode,
    latexCode,
    mismatch: !!latexCode && latexCode.trim().toUpperCase() !== newCode.toUpperCase(),
    idBlocked: !('latex' in placeWithId(q.latex, loc, level, tax, true)),
    levelChanged: level !== q.level,
  };
}
