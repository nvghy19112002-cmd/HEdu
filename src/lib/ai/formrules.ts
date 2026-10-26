// Quy tắc phân biệt Dạng ("khi nào chọn / khi nào không chọn") — DỮ LIỆU tách khỏi prompt và khỏi ngân hàng.
// Khoá = id nội bộ của Dạng trong cây (vd f2D111), nên đổi tên/mã Dạng không làm mất quy tắc; Dạng bị xoá thì quy tắc tự bỏ qua.
// Nội dung quy tắc là nghiệp vụ Toán: CHỈ chủ dự án/giáo viên viết hoặc duyệt. Hiện chưa có quy tắc nào được duyệt ⇒ để trống.
// Khi có: mỗi dòng ngắn, kiểm tra được; gửi kèm đúng Dạng đó trong cây gửi cho AI (ganid.buildGanIdRequest).

export interface FormRule {
  /** chọn Dạng này khi… */
  when?: string;
  /** KHÔNG chọn Dạng này khi… (thường là chỉ sang Dạng gần nghĩa) */
  not?: string;
}

export const FORM_RULES: Readonly<Record<string, FormRule>> = {};

const clean = (s: string | undefined, n = 160): string => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Một dòng gửi kèm cho AI, hoặc '' nếu Dạng chưa có quy tắc. */
export function ruleLine(formId: string, rules: Readonly<Record<string, FormRule>> = FORM_RULES): string {
  const r = rules[formId];
  if (!r) return '';
  const parts = [r.when ? `chọn khi: ${clean(r.when)}` : '', r.not ? `không chọn khi: ${clean(r.not)}` : ''].filter(Boolean);
  return parts.join('; ');
}
