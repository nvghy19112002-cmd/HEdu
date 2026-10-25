// Xuất .tex NGUYÊN VĂN: chép đúng mã LaTeX gốc của từng câu, chỉ cập nhật vùng ID `%[2D1H1-1]` đầu câu bằng bộ ghi chung (idtex).
// KHÔNG phân tích rồi dựng lại (cách cũ làm mất ghi chú %, dời chữ vào \immini, kéo \newcommand ra ngoài).
import { writeHeadId } from './idtex';
import type { Question } from './types';

/**
 * Mã của một câu khi xuất: thêm/thay ID chính bằng `id` (nhãn nguồn như `%[Đề Sở HN]` giữ nguyên).
 * id rỗng hoặc "—" (chưa có vị trí) ⇒ giữ nguyên. Câu có nhiều ID mâu thuẫn ⇒ giữ nguyên (không tự chọn bên nào).
 */
export function exportQuestionTex(latex: string, id: string | null | undefined): string {
  const src = latex.replace(/\s+$/, '');
  if (!id || id === '—') return src;
  return writeHeadId(src, id, 'thay').latex;
}

/** Ghép nhiều câu thành một file .tex nguyên văn. Mỗi câu cách nhau một dòng trống. */
export function buildTexFile(qs: readonly Question[], idOf: (q: Question) => string, header: string): string {
  return `${header}\n\n${qs.map((q) => exportQuestionTex(q.latex, idOf(q))).join('\n\n')}\n`;
}

/** Dung lượng ước lượng (MB, UTF-8) của các câu sẽ xuất — tính theo độ dài mã thật, không đoán. */
export function exportSizeMB(qs: readonly Question[]): number {
  let n = 0;
  for (const q of qs) n += q.latex.length;
  return (n * 1.15) / 1e6; // tiếng Việt có dấu ~1,15 byte/ký tự
}
