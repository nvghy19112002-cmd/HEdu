// Xuất .tex NGUYÊN VĂN: chép đúng mã LaTeX gốc của từng câu, chỉ cập nhật dòng chú thích ID `%[2D1H1-1]` ngay sau \begin{ex}.
// KHÔNG phân tích rồi dựng lại (cách cũ làm mất ghi chú %, dời chữ vào \immini, kéo \newcommand ra ngoài).
import type { Question } from './types';

const BEGIN_EX = /\\begin\{ex\}(%\[[^\]\r\n]*\])?/;

/** Mã của một câu khi xuất: đổi/ thêm `%[id]` sau \begin{ex} đầu tiên. id rỗng hoặc "—" (chưa có vị trí) ⇒ giữ nguyên dòng cũ. */
export function exportQuestionTex(latex: string, id: string | null | undefined): string {
  const src = latex.replace(/\s+$/, '');
  if (!id || id === '—') return src;
  const m = BEGIN_EX.exec(src);
  if (!m) return src; // không phải khối ex hoàn chỉnh: không đụng
  return src.slice(0, m.index) + `\\begin{ex}%[${id}]` + src.slice(m.index + m[0].length);
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
