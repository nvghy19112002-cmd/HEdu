// Quy tắc phân biệt Dạng ("khi nào chọn / khi nào không chọn") — DỮ LIỆU tách khỏi prompt và khỏi ngân hàng.
// Khoá = id nội bộ của Dạng trong cây (vd f2D111), nên đổi tên/mã Dạng không làm mất quy tắc; Dạng bị xoá thì quy tắc tự bỏ qua.
// Nội dung quy tắc là nghiệp vụ Toán: CHỈ chủ dự án/giáo viên viết hoặc duyệt. Quy tắc E3 (câu lý thuyết thuần, chủ dự án duyệt) áp tự động cho mọi Dạng có chữ "lý/lí thuyết" trong tên; các Dạng khác chưa có quy tắc riêng ⇒ FORM_RULES để trống.
// Khi có: mỗi dòng ngắn, kiểm tra được; gửi kèm đúng Dạng đó trong cây gửi cho AI (ganid.buildGanIdRequest).

export interface FormRule {
  /** chọn Dạng này khi… */
  when?: string;
  /** KHÔNG chọn Dạng này khi… (thường là chỉ sang Dạng gần nghĩa) */
  not?: string;
}

export const FORM_RULES: Readonly<Record<string, FormRule>> = {};

const clean = (s: string | undefined, n = 160): string => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Dạng lý thuyết = tên Dạng có "lý thuyết"/"lí thuyết" (quy tắc E3 trong claude/quy-tac-gan-id-chuan.md). */
export const THEORY_FORM_RE = /l[ýí]\s+thuyết/i;
export const THEORY_RULE: FormRule = {
  when: 'câu lý thuyết thuần (chỉ nhớ/nhận ra định nghĩa, công thức, định lý, không tính)',
  not: 'câu phải tính hoặc chứng minh dù có chữ "công thức", "mệnh đề"',
};

/** Một dòng gửi kèm cho AI, hoặc '' nếu Dạng chưa có quy tắc. Quy tắc ghi tay ở `rules` ưu tiên hơn quy tắc lý thuyết tự suy từ tên Dạng. */
export function ruleLine(formId: string, rules: Readonly<Record<string, FormRule>> = FORM_RULES, formName = ''): string {
  const r = rules[formId] ?? (THEORY_FORM_RE.test(formName) ? THEORY_RULE : undefined);
  if (!r) return '';
  const parts = [r.when ? `chọn khi: ${clean(r.when)}` : '', r.not ? `không chọn khi: ${clean(r.not)}` : ''].filter(Boolean);
  return parts.join('; ');
}
