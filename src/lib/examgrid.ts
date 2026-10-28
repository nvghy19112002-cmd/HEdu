// Lưới chọn câu theo Dạng × mức độ (màn Tạo đề): hàm thuần, có kiểm thử.
// Mỗi ô khác 0 là MỘT dòng ma trận phạm vi Dạng với id cố định theo ô, nên vẫn đi qua đúng bộ phân bổ, khóa câu, mẫu ma trận.
import type { Row } from './examgen';
import type { Level, QType, Question } from './types';

/** Mã ô lưới: một (Dạng, loại, mức độ) ⇒ một dòng ma trận. */
export const cellId = (formId: string, type: QType, level: Level): string => `g|${formId}|${type}|${level}`;

/** Đặt số câu cho một ô: 0 thì bỏ dòng; dòng mới nối vào cuối, dòng cũ giữ vị trí. */
export function setCell(rows: readonly Row[], formId: string, type: QType, level: Level, count: number): Row[] {
  const id = cellId(formId, type, level);
  const n = Math.max(0, Math.min(200, Math.round(count) || 0));
  if (!n) return rows.filter((r) => r.id !== id);
  const row: Row = { id, scope: { kind: 'form', id: formId }, type, level, count: n };
  return rows.some((r) => r.id === id) ? rows.map((r) => (r.id === id ? row : r)) : [...rows, row];
}

/** Số câu trong kho theo Dạng → "loại|mức" (chỉ tính câu `ok`). */
export function stockIndex(questions: readonly Question[], ok: (q: Question) => boolean): Map<string, Map<string, number>> {
  const m = new Map<string, Map<string, number>>();
  for (const q of questions) {
    if (!q.formId || !ok(q)) continue;
    let f = m.get(q.formId);
    if (!f) m.set(q.formId, (f = new Map()));
    const k = `${q.type}|${q.level}`;
    f.set(k, (f.get(k) ?? 0) + 1);
  }
  return m;
}
