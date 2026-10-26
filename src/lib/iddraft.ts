// Gán ID tự động cho câu NHÁP ở màn Nhập liệu (chưa lưu vào ngân hàng).
// Chỉ đổi metadata bản nháp (vị trí) — không sửa LaTeX, không tạo uid/seq; câu có %[ID] hợp lệ giữ nguyên ID của nó.
// Mức độ vẫn theo ô "Mức độ" chung giáo viên chọn (gợi ý mức độ không áp vào bản nháp).
import type { IdSuggester, SuggestConfidence, SuggestOption, Suggestion } from './idsuggest';
import type { TaxIndex } from './taxonomy';
import { checkLocation } from './taxpath';
import type { Location } from './types';

export interface DraftIdPick {
  /** LaTeX lúc gợi ý: giáo viên sửa câu sau đó ⇒ gợi ý cũ không dùng nữa */
  latex: string;
  suggestion: Suggestion;
  /** Dạng sẽ dùng; null = dùng "vị trí chung" của ô chọn bên trên */
  formId: string | null;
}

/** Mặc định chỉ điền sẵn gợi ý NGÂN HÀNG tin cậy cao (kết quả trộn AI không bao giờ cao ⇒ giáo viên tự nhận); còn lại ⇒ vị trí chung. */
export const useByDefault = (c: SuggestConfidence): boolean => c === 'cao';

/** Gợi ý cho các câu nháp KHÔNG có %[ID] hợp lệ, trong lớp đích giáo viên đã chọn. Khoá = số thứ tự câu trong file. */
export function suggestDrafts(drafts: readonly { index: number; latex: string }[], s: IdSuggester, grade: number): Map<number, DraftIdPick> {
  const out = new Map<number, DraftIdPick>();
  for (const d of drafts) {
    const suggestion = s.suggest({ key: `d${d.index}`, latex: d.latex, grade });
    out.set(d.index, { latex: d.latex, suggestion, formId: useByDefault(suggestion.confidence) ? suggestion.best?.formId ?? null : null });
  }
  return out;
}

export const optionsOf = (p: DraftIdPick): SuggestOption[] => [p.suggestion.best, ...p.suggestion.alternatives].filter((o): o is SuggestOption => !!o);

/**
 * Vị trí sẽ ghi cho một câu nháp lúc bấm Nhập. Chỉ dùng gợi ý khi: còn đúng LaTeX lúc gợi ý, cây chưa đổi,
 * Dạng chọn nằm trong các phương án đã gợi ý và đúng đủ đường dẫn trong lớp đích. Ngược lại ⇒ vị trí chung.
 */
export function draftLocation(p: DraftIdPick | undefined, latexNow: string, ix: TaxIndex, taxRevNow: string, common: Location): { loc: Location; suggested: boolean } {
  if (!p || p.formId == null || p.latex !== latexNow || p.suggestion.taxRev !== taxRevNow) return { loc: common, suggested: false };
  const o = optionsOf(p).find((x) => x.formId === p.formId);
  if (!o || !checkLocation(ix, o.location, common.grade).ok) return { loc: common, suggested: false };
  return { loc: o.location, suggested: true };
}
