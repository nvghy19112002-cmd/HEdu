// Tìm lỗi CẤU TRÚC trong mã nguồn một câu, kèm vị trí (dòng, cột) để người dùng sửa đúng chỗ.
// Chỉ BÁO, không bao giờ sửa mã gốc (AGENTS.md mục 4.6).
import { maskNonCode } from './packages';

export interface SrcProblem {
  message: string;
  /** dòng (từ 1) và cột (từ 1) trong đoạn mã đưa vào */
  line: number;
  col: number;
  /** đoạn mã quanh chỗ lỗi, đã cắt ngắn */
  snippet: string;
}

function locate(src: string, pos: number): { line: number; col: number; snippet: string } {
  const before = src.slice(0, pos);
  const line = before.split('\n').length;
  const lineStart = before.lastIndexOf('\n') + 1;
  const end = src.indexOf('\n', pos);
  const text = src.slice(lineStart, end < 0 ? src.length : end).replace(/\r$/, '');
  const from = Math.max(0, pos - lineStart - 20);
  return { line, col: pos - lineStart + 1, snippet: (from > 0 ? '…' : '') + text.slice(from, from + 60).trim() };
}

/**
 * Ngoặc nhọn và \begin…\end lệch nhau. `lineOffset` là số dòng đứng trước đoạn này trong file lớn
 * (để báo số dòng của cả file thay vì của riêng câu).
 */
export function sourceProblems(raw: string, lineOffset = 0): SrcProblem[] {
  const src = maskNonCode(raw);
  const out: SrcProblem[] = [];
  const add = (pos: number, message: string) => {
    const w = locate(raw, pos);
    out.push({ message, line: w.line + lineOffset, col: w.col, snippet: w.snippet });
  };

  const open: number[] = [];
  const extra: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { i++; continue; }
    if (c === '{') open.push(i);
    else if (c === '}') { if (open.length) open.pop(); else extra.push(i); }
  }
  for (const pos of open.slice(0, 3)) add(pos, 'Ngoặc { mở ở đây nhưng không có } đóng tương ứng.');
  for (const pos of extra.slice(0, 3)) add(pos, 'Có ngoặc } thừa, không có { mở tương ứng.');

  const stack: { name: string; pos: number }[] = [];
  const re = /\\(begin|end)\s*\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[1] === 'begin') stack.push({ name: m[2], pos: m.index });
    else {
      const top = stack.pop();
      if (!top) add(m.index, `Có \\end{${m[2]}} mà không có \\begin{${m[2]}}.`);
      else if (top.name !== m[2]) add(m.index, `\\begin{${top.name}} (dòng ${locate(raw, top.pos).line + lineOffset}) lại đóng bằng \\end{${m[2]}}.`);
    }
  }
  for (const s of stack.slice(0, 3)) add(s.pos, `\\begin{${s.name}} chưa có \\end{${s.name}}.`);
  return out;
}
