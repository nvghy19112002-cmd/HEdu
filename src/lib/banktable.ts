// Dữ liệu một dòng của bảng gọn (màn Câu hỏi): chỉ chữ thuần, không dựng KaTeX/TikZ nên nhẹ khi có hàng nghìn câu.
import { parseExTest } from './extest';
import { stemSnippet } from './snippet';
import type { Question } from './types';

const LETTERS = ['A', 'B', 'C', 'D'];

/** Đáp án rút gọn: trắc nghiệm → A–D; đúng/sai → Đ/S theo từng ý; trả lời ngắn → đáp số; tự luận → rỗng. */
export function answerText(q: Question): string {
  const p = parseExTest(q.latex);
  if (q.type === 'tn') { const i = p.options.findIndex((o) => o.correct); return i >= 0 ? LETTERS[i] ?? '' : ''; }
  if (q.type === 'ds') return p.options.length ? p.options.map((o) => (o.correct ? 'Đ' : 'S')).join(' ') : '';
  if (q.type === 'tln') return (p.shortAnswer ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return '';
}

export interface TableRow { uid: string; no: number; answer: string; snippet: string }
export const tableRow = (q: Question): TableRow => ({ uid: q.uid, no: q.seq, answer: answerText(q), snippet: stemSnippet(q.latex, 140) });
