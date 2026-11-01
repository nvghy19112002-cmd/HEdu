// Màn "Xử lí TeX" — phân tích CHỈ ĐỌC nội dung bàn nháp (claude/de-xuat-man-xu-li-tex.md mục 10).
// Không bao giờ sửa, cắt hay chuẩn hoá văn bản: chỉ tìm các khối \begin{ex}…\end{ex} (bỏ qua phần trong chú thích %), số dòng,
// nội dung nằm ngoài khối, khối chưa đóng, dấu hiệu dán cả tài liệu, lệnh đọc/ghi tệp, và trạng thái ID của từng khối.
// KHÔNG dùng extest.normalizeEx ở đây: hàm đó dành cho nhập kho (bỏ khối dở), dùng ở bàn nháp sẽ làm mất mã đang gõ.
import { resolveCode } from './idsync';
import { readHead } from './idtex';
import { sourceProblems } from './srcdiag';
import type { Taxonomy } from './types';

export interface ScratchBlock {
  /** số thứ tự khối, từ 1 */
  n: number;
  /** vị trí ký tự (nửa mở) trong văn bản */
  start: number;
  end: number;
  /** dòng đầu/cuối (từ 1) trong văn bản */
  line0: number;
  line1: number;
  text: string;
  /** có \end{ex} của chính nó (false: hết văn bản hoặc gặp \begin{ex} kế tiếp trước) */
  closed: boolean;
}

/** Dải dòng có nội dung (không phải dòng trống, không phải chú thích) nằm ngoài mọi khối ex. */
export interface OutsideRange { line0: number; line1: number; preview: string }
export interface ScratchNote { line: number; text: string }

export interface ScratchScan {
  blocks: ScratchBlock[];
  outside: OutsideRange[];
  /** \end{ex} không có \begin{ex} tương ứng */
  strayEnds: number[];
  /** dòng có \documentclass / \begin{document} (dán cả tài liệu) */
  fullDoc: number[];
  /** lệnh đọc/ghi tệp ngoài nội dung (\input, \include, \openin, \openout, \write…) */
  io: ScratchNote[];
}

const TOKEN = /\\(begin|end)\s*\{ex\}|\\(documentclass|input|include|InputIfFileExists|openin|openout|write)(?![A-Za-z])|\\begin\s*\{document\}/g;

/** Vị trí đầu mỗi dòng (để đổi vị trí ký tự → số dòng). */
export function lineStarts(text: string): number[] {
  const out = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) out.push(i + 1);
  return out;
}

export function lineAt(starts: readonly number[], pos: number): number {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid - 1; }
  return lo + 1;
}

/** Vị trí bắt đầu chú thích % (không bị thoát bằng \) trên đoạn [from, to), -1 nếu không có. */
function commentAt(s: string, from: number, to: number): number {
  for (let i = from; i < to; i++) {
    if (s[i] !== '%') continue;
    let k = 0;
    for (let j = i - 1; j >= from && s[j] === '\\'; j--) k++;
    if (k % 2 === 0) return i;
  }
  return -1;
}

/** Chỉ phần KHÔNG nằm trong chú thích của mỗi dòng: trả các đoạn [đầu, cuối) để tìm lệnh. */
function codeSpans(s: string, starts: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k < starts.length; k++) {
    const a = starts[k];
    const b = k + 1 < starts.length ? starts[k + 1] - 1 : s.length;
    const c = commentAt(s, a, b);
    out.push([a, c < 0 ? b : c]);
  }
  return out;
}

export function scanScratch(text: string): ScratchScan {
  const starts = lineStarts(text);
  const scan: ScratchScan = { blocks: [], outside: [], strayEnds: [], fullDoc: [], io: [] };
  type Tok = { kind: 'begin' | 'end' | 'doc' | 'io'; pos: number; len: number; name: string };
  const toks: Tok[] = [];
  for (const [a, b] of codeSpans(text, starts)) {
    const seg = text.slice(a, b);
    TOKEN.lastIndex = 0;
    for (let m = TOKEN.exec(seg); m; m = TOKEN.exec(seg)) {
      const pos = a + m.index;
      if (m[1] === 'begin') toks.push({ kind: 'begin', pos, len: m[0].length, name: '' });
      else if (m[1] === 'end') toks.push({ kind: 'end', pos, len: m[0].length, name: '' });
      else if (m[2] === 'documentclass' || !m[2]) toks.push({ kind: 'doc', pos, len: m[0].length, name: m[2] ?? 'begin{document}' });
      else toks.push({ kind: 'io', pos, len: m[0].length, name: m[2] });
    }
  }
  let open: number | null = null;
  const push = (from: number, to: number, closed: boolean) => {
    scan.blocks.push({ n: scan.blocks.length + 1, start: from, end: to, line0: lineAt(starts, from), line1: lineAt(starts, Math.max(from, to - 1)), text: text.slice(from, to), closed });
  };
  for (const t of toks) {
    if (t.kind === 'begin') {
      if (open !== null) push(open, t.pos, false);
      open = t.pos;
    } else if (t.kind === 'end') {
      if (open === null) scan.strayEnds.push(lineAt(starts, t.pos));
      else { push(open, t.pos + t.len, true); open = null; }
    } else if (t.kind === 'doc') {
      if (open === null) scan.fullDoc.push(lineAt(starts, t.pos));
    } else {
      scan.io.push({ line: lineAt(starts, t.pos), text: `\\${t.name}` });
    }
  }
  if (open !== null) push(open, text.length, false);

  // nội dung ngoài khối: dòng có chữ (không trống, không chỉ là chú thích) mà không nằm trong khối nào
  const inBlock = (line: number) => scan.blocks.some((b) => line >= b.line0 && line <= b.line1);
  let cur: OutsideRange | null = null;
  for (let k = 0; k < starts.length; k++) {
    const line = k + 1;
    const a = starts[k], b = k + 1 < starts.length ? starts[k + 1] - 1 : text.length;
    const c = commentAt(text, a, b);
    const code = text.slice(a, c < 0 ? b : c).trim();
    if (code && !inBlock(line)) {
      if (cur && cur.line1 === line - 1) cur.line1 = line;
      else { cur = { line0: line, line1: line, preview: code.slice(0, 80) }; scan.outside.push(cur); }
    }
  }
  return scan;
}

/** Trạng thái ID của một khối — KHÔNG có mức "hợp lệ/đã xác minh": bàn nháp không biết giáo viên đã xác minh Dạng hay chưa. */
export type IdState = 'khong-co' | 'nhieu' | 'sai-cu-phap' | 'khong-co-trong-cay' | 'co-trong-cay';
export const ID_STATE_LABEL: Record<IdState, string> = {
  'khong-co': 'Chưa có ID',
  nhieu: 'Nhiều ID',
  'sai-cu-phap': 'ID sai cú pháp',
  'khong-co-trong-cay': 'ID không có trong cây',
  'co-trong-cay': 'ID có trong cây',
};

export function idState(block: string, tax: Taxonomy): { state: IdState; code: string | null } {
  const h = readHead(block);
  if (!h.ids.length) return { state: 'khong-co', code: null };
  if (h.ids.length > 1) return { state: 'nhieu', code: h.ids.map((x) => x.code).join(', ') };
  const code = h.ids[0].code;
  const r = resolveCode(code, tax);
  if (r.ok) return { state: 'co-trong-cay', code };
  return { state: r.problem === 'sai-cu-phap' ? 'sai-cu-phap' : 'khong-co-trong-cay', code };
}

export interface BlockInfo { block: ScratchBlock; id: { state: IdState; code: string | null }; problems: number; firstProblem: string | null }

/** Thông tin từng khối cho danh sách câu: ID và số lỗi cú pháp nhanh (srcdiag, theo dòng trong văn bản). */
export function blockInfos(scan: ScratchScan, tax: Taxonomy): BlockInfo[] {
  return scan.blocks.map((b) => {
    const ps = b.closed ? sourceProblems(b.text, b.line0 - 1) : [];
    return { block: b, id: idState(b.text, tax), problems: ps.length + (b.closed ? 0 : 1), firstProblem: b.closed ? (ps[0] ? `dòng ${ps[0].line}: ${ps[0].message}` : null) : 'Khối chưa có \\end{ex}' };
  });
}

/** Khối chứa dòng `line` (để biết con trỏ đang ở câu nào). */
export const blockAtLine = (scan: ScratchScan, line: number): ScratchBlock | null => scan.blocks.find((b) => line >= b.line0 && line <= b.line1) ?? null;
