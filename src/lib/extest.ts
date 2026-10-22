// Đọc và ghi câu hỏi theo cú pháp gói ex_test:
//   \begin{ex}%[ID]
//     Đề bài ...
//     \choice {\True A}{B}{C}{D}          (trắc nghiệm)
//     \choiceTF {\True a}{b}{\True c}{d}  (đúng/sai)
//     \shortans{3}                        (trả lời ngắn)
//     \loigiai{ ... }
//   \end{ex}
import type { QType } from './types';

export interface Option { text: string; correct: boolean }

export interface ParsedQuestion {
  stem: string;
  type: QType;
  options: Option[]; // 4 phương án (tn) hoặc 4 ý (ds)
  shortAnswer: string | null;
  solution: string | null;
  idComment: string | null;
  issues: string[];
}

/** Bỏ chú thích LaTeX (%), giữ \% . Trả về cả ID nếu có dạng %[...] */
export function stripComments(src: string): { text: string; id: string | null } {
  let id: string | null = null;
  const lines = src.split('\n').map((line) => {
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '%' && (i === 0 || line[i - 1] !== '\\')) {
        const m = /^%\s*\[([^\]]+)\]/.exec(line.slice(i));
        if (m && !id) id = m[1].trim();
        return line.slice(0, i);
      }
    }
    return line;
  });
  return { text: lines.join('\n'), id };
}

function skipSpace(s: string, i: number): number {
  while (i < s.length && /\s/.test(s[i])) i++;
  return i;
}

/** s[i] phải là '{'. Trả về nội dung trong ngoặc và vị trí sau '}' */
export function readGroup(s: string, i: number): [string, number] | null {
  if (s[i] !== '{') return null;
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (ch === '\\') { j++; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return [s.slice(i + 1, j), j + 1];
    }
  }
  return null;
}

function readOptional(s: string, i: number): [string, number] | null {
  i = skipSpace(s, i);
  if (s[i] !== '[') return null;
  const end = s.indexOf(']', i);
  if (end < 0) return null;
  return [s.slice(i + 1, end), end + 1];
}

/** Tìm lệnh \name (không bị nối thêm chữ cái phía sau) ở cấp ngoài cùng */
function findCommand(s: string, name: string, from = 0): number {
  const re = new RegExp('\\\\' + name + '(?![A-Za-z])', 'g');
  re.lastIndex = from;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > 0 && s[m.index - 1] === '\\') continue;
    return m.index;
  }
  return -1;
}

function readGroups(s: string, i: number, max: number): [string[], number] {
  const out: string[] = [];
  let pos = i;
  while (out.length < max) {
    const p = skipSpace(s, pos);
    const g = readGroup(s, p);
    if (!g) break;
    out.push(g[0]);
    pos = g[1];
  }
  return [out, pos];
}

function markCorrect(raw: string): Option {
  const k = findCommand(raw, 'True');
  if (k < 0) return { text: raw.trim(), correct: false };
  return { text: (raw.slice(0, k) + raw.slice(k + 5)).trim(), correct: true };
}

export function parseExTest(src: string): ParsedQuestion {
  const { text: noComment, id } = stripComments(src);
  let body = noComment;
  const b = body.indexOf('\\begin{ex}');
  const e = body.lastIndexOf('\\end{ex}');
  if (b >= 0) body = body.slice(b + '\\begin{ex}'.length, e > b ? e : undefined);

  const issues: string[] = [];
  if (b < 0 && src.trim()) issues.push('Thiếu \\begin{ex} … \\end{ex}.');

  const iTF = findCommand(body, 'choiceTF');
  const iCh = findCommand(body, 'choice');
  const iSh = findCommand(body, 'shortans');
  const iSol = findCommand(body, 'loigiai');

  let type: QType = 'tl';
  let options: Option[] = [];
  let shortAnswer: string | null = null;
  let solution: string | null = null;

  const cuts = [iTF, iCh, iSh, iSol].filter((x) => x >= 0);
  const stemEnd = cuts.length ? Math.min(...cuts) : body.length;
  const stem = body.slice(0, stemEnd).trim();

  if (iTF >= 0) {
    type = 'ds';
    let p = iTF + '\\choiceTF'.length;
    const opt = readOptional(body, p);
    if (opt) p = opt[1];
    const [groups] = readGroups(body, p, 4);
    options = groups.map(markCorrect);
    if (options.length !== 4) issues.push(`Câu đúng/sai cần đủ 4 ý, đang có ${options.length}.`);
  } else if (iCh >= 0) {
    type = 'tn';
    let p = iCh + '\\choice'.length;
    const opt = readOptional(body, p);
    if (opt) p = opt[1];
    const [groups] = readGroups(body, p, 4);
    options = groups.map(markCorrect);
    const nTrue = options.filter((o) => o.correct).length;
    if (options.length !== 4) issues.push(`Câu trắc nghiệm cần 4 phương án, đang có ${options.length}.`);
    if (nTrue !== 1) issues.push(nTrue === 0 ? 'Chưa đánh dấu đáp án đúng bằng \\True.' : 'Có nhiều hơn một \\True.');
  } else if (iSh >= 0) {
    type = 'tln';
    let p = iSh + '\\shortans'.length;
    const opt = readOptional(body, p);
    if (opt) p = opt[1];
    const g = readGroup(body, skipSpace(body, p));
    shortAnswer = g ? g[0].trim() : null;
    if (!shortAnswer) issues.push('Thiếu đáp án trong \\shortans{…}.');
  }

  if (iSol >= 0) {
    const g = readGroup(body, skipSpace(body, iSol + '\\loigiai'.length));
    solution = g ? g[0].trim() : null;
    if (!g) issues.push('Ngoặc của \\loigiai{…} chưa đóng.');
  }

  if (!stem) issues.push('Đề bài đang trống.');
  if (unbalancedDollar(stem + (solution ?? '') + options.map((o) => o.text).join(''))) issues.push('Số dấu $ bị lẻ — có công thức chưa đóng.');

  return { stem, type, options, shortAnswer, solution, idComment: id, issues };
}

function unbalancedDollar(s: string): boolean {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue; }
    if (s[i] === '$') n++;
  }
  return n % 2 === 1;
}

/** Tách một chuỗi dài có nhiều \begin{ex}…\end{ex} thành từng câu */
export function splitExBlocks(src: string): string[] {
  const out: string[] = [];
  const re = /\\begin\{ex\}[\s\S]*?\\end\{ex\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[0]);
  return out;
}

export const TEMPLATES: Record<QType, string> = {
  tn: `\\begin{ex}
  Đề bài ...
  \\choice
  {\\True phương án đúng}
  {phương án B}
  {phương án C}
  {phương án D}
  \\loigiai{
    Lời giải ...
  }
\\end{ex}`,
  ds: `\\begin{ex}
  Đề bài ... Xét tính đúng sai của các mệnh đề sau:
  \\choiceTF
  {\\True Mệnh đề a)}
  {Mệnh đề b)}
  {\\True Mệnh đề c)}
  {Mệnh đề d)}
  \\loigiai{
    Lời giải ...
  }
\\end{ex}`,
  tln: `\\begin{ex}
  Đề bài ...
  \\shortans{đáp số}
  \\loigiai{
    Lời giải ...
  }
\\end{ex}`,
  tl: `\\begin{ex}
  Đề bài ...
  \\loigiai{
    Lời giải ...
  }
\\end{ex}`,
};

/** Dựng lại mã LaTeX của câu, có thể đổi thứ tự phương án (dùng khi trộn đề) */
export function buildExTest(p: ParsedQuestion, opts: { id?: string; order?: number[]; withSolution?: boolean } = {}): string {
  const order = opts.order ?? p.options.map((_, i) => i);
  const lines: string[] = [];
  lines.push(`\\begin{ex}${opts.id ? `%[${opts.id}]` : ''}`);
  lines.push('  ' + p.stem.replace(/\n/g, '\n  '));
  if (p.type === 'tn' || p.type === 'ds') {
    lines.push(p.type === 'tn' ? '  \\choice' : '  \\choiceTF');
    for (const k of order) {
      const o = p.options[k];
      if (o) lines.push(`  {${o.correct ? '\\True ' : ''}${o.text}}`);
    }
  }
  if (p.type === 'tln' && p.shortAnswer != null) lines.push(`  \\shortans{${p.shortAnswer}}`);
  if (opts.withSolution !== false && p.solution) lines.push(`  \\loigiai{\n    ${p.solution.replace(/\n/g, '\n    ')}\n  }`);
  lines.push('\\end{ex}');
  return lines.join('\n');
}
