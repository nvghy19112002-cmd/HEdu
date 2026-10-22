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

/**
 * Trong tikzpicture, một câu lệnh bắt đầu thẳng bằng toạ độ, vd `(\xmin,0)--(\xmax,0);`, KHÔNG có
 * \draw/\path nên TeX không vẽ gì (xem bằng TeXstudio cũng không thấy nét). Chỉ BÁO, không sửa.
 */
export function barePathProblems(raw: string, lineOffset = 0): SrcProblem[] {
  const src = maskNonCode(raw);
  const out: SrcProblem[] = [];
  const re = /\\begin\s*\{tikzpicture\}([\s\S]*?)\\end\s*\{tikzpicture\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const base = m.index + m[0].indexOf(m[1]);
    const body = m[1];
    let depth = 0, brk = 0, start = 0;
    const check = (end: number) => {
      const seg = body.slice(start, end);
      const t = seg.replace(/^\s+/, '');
      if (/^\(/.test(t) && /--|\bto\b|\bcircle\b|\brectangle\b/.test(t)) {
        const pos = base + start + (seg.length - t.length);
        const w = locate(raw, pos);
        out.push({ message: 'Câu lệnh này bắt đầu bằng toạ độ nên thiếu \\draw (hoặc \\path): TeX không vẽ nét nào. Thêm \\draw ở đầu nếu muốn vẽ.', line: w.line + lineOffset, col: w.col, snippet: w.snippet });
      }
    };
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (c === '\\') { i++; continue; }
      if (c === '{') depth++;
      else if (c === '}') depth = Math.max(0, depth - 1);
      else if (c === '[') brk++;
      else if (c === ']') brk = Math.max(0, brk - 1);
      else if (c === ';' && depth === 0 && brk === 0) { check(i); start = i + 1; }
    }
  }
  return out;
}
