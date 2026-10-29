// Bộ so sánh câu hỏi trùng / gần giống (v2). CHỈ ĐỌC: không sửa Question.latex, không ghi dữ liệu.
//
// Nguyên tắc (xem tài liệu thiết kế):
//  - Điểm giống nhau KHÔNG phải bằng chứng trùng. Chỉ nhãn “giống nguyên mã” và “cùng câu” là khẳng định chắc;
//    hai nhãn đó chỉ được gán khi đề, phương án, hình VÀ đáp án đều khớp theo luật.
//  - Khác số liệu, dấu/phép toán, điều kiện, hình, loại câu hoặc đáp án → KHÔNG bao giờ là “trùng hẳn”.
//  - Câu đọc chưa đủ (lỗi cú pháp, thiếu phương án…) → “chưa đủ bằng chứng”.
//  - Siêu dữ liệu (lớp, chương, ID6, kiểm duyệt) không tham gia so sánh.
import { parseExTest } from './extest';
import type { QType } from './types';

export type DupKind = 'raw' | 'same' | 'conflict' | 'near' | 'template' | 'unrelated' | 'insufficient';
export const DUP_KIND_LABEL: Record<DupKind, string> = {
  raw: 'Giống nguyên mã',
  same: 'Cùng câu (trình bày khác)',
  conflict: 'Mâu thuẫn đáp án',
  near: 'Có khả năng gần trùng (cần xem)',
  template: 'Cùng mẫu, khác dữ kiện',
  insufficient: 'Cần kiểm tra mã (chưa đủ bằng chứng)',
  unrelated: 'Không liên quan',
};
/** Thứ tự ưu tiên khi hiện danh sách (nhỏ = lên trước). */
export const DUP_KIND_RANK: Record<DupKind, number> = { raw: 0, conflict: 1, same: 2, near: 3, template: 4, insufficient: 5, unrelated: 6 };

export const FP_VERSION = 1;

// ---- bảng mã token dùng chung (mỗi chuỗi token chỉ lưu MỘT lần cho cả ngân hàng) ----
const vocabW = new Map<string, number>(); // token 'w'+từ
const vocabM = new Map<string, number>(); // token 'm'+bộ ba
const vocabText: string[] = [];           // chữ đầy đủ (kèm tiền tố) của mỗi mã
/** Chữ của một token (để sắp xếp ổn định như khi còn lưu chuỗi). */
export const tokenText = (id: number): string => vocabText[id];
function toIds(prefix: 'w' | 'm', items: Iterable<string>): Int32Array {
  const map = prefix === 'w' ? vocabW : vocabM;
  const raw: number[] = [];
  for (const x of items) {
    let id = map.get(x);
    if (id === undefined) { id = vocabText.length; map.set(x, id); vocabText.push(prefix + x); }
    raw.push(id);
  }
  raw.sort((p, q) => p - q);
  let n = 0;
  for (let i = 0; i < raw.length; i++) if (i === 0 || raw[i] !== raw[i - 1]) raw[n++] = raw[i];
  return Int32Array.from(raw.slice(0, n));
}

export interface Fingerprint {
  v: number;
  rawKey: string;
  /** mã đã chuẩn hoá xuống dòng/khoảng trắng đầu cuối: nhãn “giống nguyên mã” so chuỗi thật, không tin riêng bản băm */
  raw: string;
  type: QType;
  complete: boolean;
  issues: string[];
  stemKey: string;
  optKeys: string[];     // từng phương án/ý, theo thứ tự trong câu
  optSet: string;        // tập phương án đã sắp (trắc nghiệm) hoặc theo thứ tự (đúng/sai)
  optItemsSet: string;   // đúng/sai: tập các cặp (nội dung, cờ) đã sắp — để nhận ra “chỉ đổi thứ tự ý”
  ansKey: string;
  figKey: string;
  solKey: string | null;
  nums: string[];        // mọi số trong đề + phương án + đáp án ngắn (đã sắp)
  ops: string[];         // mọi dấu/phép toán/lệnh toán (đã sắp)
  keys: string[];        // từ khoá đổi nghĩa trong tiếng Việt (đã sắp)
  // Ba tập dưới đây lưu dạng mã số đã sắp, không trùng (Int32Array) thay vì Set<string> để chỉ mục dò trùng nhẹ hơn nhiều; kết quả so sánh không đổi.
  words: Int32Array;     // từ + cặp từ (đề, phương án); mã token 'w'+từ
  mathGrams: Int32Array; // bộ ba token công thức; mã token 'm'+bộ ba
  loose: Int32Array;     // mọi từ/số của nguồn thô — dùng khi câu đọc chưa đủ; mã token 'w'+từ
  /** Khoá gom nhóm “cùng nội dung” (loại câu + đề + phương án + hình), không gồm đáp án đúng */
  contentKey: string;
  /** Khoá “dữ kiện” (loại câu + phương án + số + dấu + hình), KHÔNG gồm lời dẫn: cặp gần trùng cùng dữ kiện nên tra chính xác được. Rỗng nếu quá ít dữ kiện để làm khoá. */
  factsKey: string;
}

// ---------- tiện ích ----------
function hash53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
export const hashKey = (s: string): string => hash53(s).toString(36);

// ---------- cắt đề thành đoạn chữ / đoạn công thức ----------
interface Seg { math: boolean; s: string }
const MATH_ENV = /^(align|aligned|equation|gather|gathered|eqnarray|array|cases|split|multline|math|displaymath)\*?$/;

function segments(src: string): Seg[] {
  const out: Seg[] = [];
  let buf = '';
  const flush = () => { if (buf) out.push({ math: false, s: buf }); buf = ''; };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') {
      const n = src[i + 1];
      if (n === '(' || n === '[') {
        const close = src.indexOf(n === '(' ? '\\)' : '\\]', i + 2);
        if (close > 0) { flush(); out.push({ math: true, s: src.slice(i + 2, close) }); i = close + 1; continue; }
      }
      const mb = /^\\begin\{([A-Za-z]+\*?)\}/.exec(src.slice(i, i + 40));
      if (mb && MATH_ENV.test(mb[1])) {
        const endTag = `\\end{${mb[1]}}`;
        const e = src.indexOf(endTag, i + mb[0].length);
        if (e > 0) { flush(); out.push({ math: true, s: src.slice(i + mb[0].length, e) }); i = e + endTag.length - 1; continue; }
      }
      buf += c + (n ?? ''); i++;
      continue;
    }
    if (c === '$') {
      const dbl = src[i + 1] === '$';
      const open = dbl ? 2 : 1;
      let j = i + open;
      let close = -1;
      for (; j < src.length; j++) {
        if (src[j] === '\\') { j++; continue; }
        if (src[j] === '$') { close = j; break; }
      }
      if (close < 0) { buf += c; continue; } // dấu $ lẻ: coi như chữ (câu sẽ bị báo “chưa đủ bằng chứng”)
      flush();
      out.push({ math: true, s: src.slice(i + open, close) });
      i = close + (dbl && src[close + 1] === '$' ? 1 : 0);
      continue;
    }
    buf += c;
  }
  flush();
  return out;
}

// ---------- chuẩn hoá công thức: giữ cấu trúc, chỉ bỏ định dạng thuần tuý ----------
const DROP = new Set(['\\left', '\\right', '\\displaystyle', '\\textstyle', '\\scriptstyle', '\\limits', '\\nolimits', '\\,', '\;', '\\:', '\\!', '\\ ', '\\quad', '\\qquad',
  '\\big', '\\Big', '\\bigg', '\\Bigg', '\\bigl', '\\bigr', '\\Bigl', '\\Bigr', '\\biggl', '\\biggr', '\\Biggl', '\\Biggr', '\\mathbf']);
const MAP: Record<string, string> = {
  '\\dfrac': '\\frac', '\\tfrac': '\\frac', '\\cfrac': '\\frac', '\\leq': '\\le', '\\geq': '\\ge', '\\leqslant': '\\le', '\\geqslant': '\\ge',
  '\\neq': '\\ne', '\\ldots': '\\dots', '\\cdots': '\\dots', '\\vdots': '\\dots', '\\lnot': '\\neg', '\\rightarrow': '\\to', '\\textrm': '\\mathrm', '\\text': '\\mathrm',
};
const TOK = /\\[A-Za-z]+|\\.|\d+(?:\.\d+)?|\p{L}|\s+|[\s\S]/gu;

function mathTokens(src: string): string[] {
  let s = src.replace(/(\d)\s*\{,\}\s*(?=\d)/g, '$1.').replace(/(\d)\\[,;: ](?=\d)/g, '$1');
  const raw: string[] = [];
  for (const m of s.matchAll(TOK)) { const t = m[0]; if (!/^\s+$/.test(t)) raw.push(t); }
  // bỏ lệnh chỉ định dạng (và dấu chấm đi kèm \left. \right.)
  const t1: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    if (DROP.has(t)) { if ((t === '\\left' || t === '\\right') && raw[i + 1] === '.') i++; continue; }
    t1.push(MAP[t] ?? t);
  }
  // ^x, _x, \frac ab, \sqrt x  →  luôn có {}: x^2 và x^{2} là một
  const out: string[] = [];
  const atomEnd = (a: string[], i: number): number => {
    if (a[i] === '{') { let d = 0; for (let j = i; j < a.length; j++) { if (a[j] === '{') d++; else if (a[j] === '}' && --d === 0) return j + 1; } return a.length; }
    return i + 1;
  };
  for (let i = 0; i < t1.length; i++) {
    const t = t1[i];
    out.push(t);
    const need = t === '^' || t === '_' || t === '\\sqrt' ? 1 : t === '\\frac' ? 2 : 0;
    let j = i + 1;
    for (let k = 0; k < need; k++) {
      if (t === '\\sqrt' && t1[j] === '[') { // căn bậc n: \sqrt[3]{x}
        const close = t1.indexOf(']', j);
        if (close > 0) { out.push(...t1.slice(j, close + 1)); j = close + 1; }
      }
      if (j >= t1.length) break;
      const e = atomEnd(t1, j);
      if (t1[j] === '{') out.push(...t1.slice(j, e));
      else out.push('{', ...t1.slice(j, e), '}');
      j = e;
    }
    i = j - 1;
  }
  return out;
}

// ---------- đoạn chữ ----------
const LAYOUT_ARG = /\\(?:hspace|vspace|hskip|vskip)\*?\s*\{[^}]*\}/g;
const LAYOUT_CMD = /\\(?:par|noindent|centering|newline|hfill|vfill|medskip|bigskip|smallskip|item|quad|qquad)(?![A-Za-z])/g;
// Tên môi trường, khai báo cột bảng, màu, nhãn… chỉ là trình bày/cấu trúc, KHÔNG được thành "chữ" của đề
// (lỗi cũ: \\begin{center} để lại từ "center", làm câu cùng nội dung bị xếp "gần trùng").
const BRACED = '(?:[^{}]|\\{[^{}]*\\})*';
const ENV_TABLE = new RegExp('\\\\begin\\s*\\{(?:tabular\\*?|tabularx|longtable|array)\\}(?:\\s*\\{' + BRACED + '\\})?', 'g');
const ENV_LIST = /\\begin\s*\{(?:enumerate|itemize|description)\}(?:\s*\[[^\]]*\])?/g;
const ENV_ANY = /\\(?:begin|end)\s*\{[^}]*\}/g;
// Chỉ bỏ ĐỐI SỐ định dạng; chữ nằm trong \\textcolor{màu}{CHỮ} vẫn phải giữ lại.
const FORMAT_ARG = /\\(?:textcolor|colorbox|color|label|ref|eqref|thispagestyle|pagestyle)\s*\{[^}]*\}|\\(?:setlength|fontsize)\s*\{[^}]*\}\s*\{[^}]*\}/g;
function textWords(s: string): string[] {
  const t = s.replace(ENV_TABLE, ' ').replace(ENV_LIST, ' ').replace(ENV_ANY, ' ').replace(FORMAT_ARG, ' ').replace(LAYOUT_ARG, ' ').replace(LAYOUT_CMD, ' ').replace(/\\\\(\[[^\]]*\])?/g, ' ').replace(/\\[A-Za-z]+\*?/g, ' ').replace(/[{}~]/g, ' ').normalize('NFC').toLowerCase();
  return t.match(/[\p{L}\p{N}]+/gu) ?? [];
}

// từ khoá làm ĐỔI nghĩa đề (so theo tập đếm): thiếu một từ là có thể thành câu khác
const KEYWORDS = new Set(['không', 'sai', 'đúng', 'ít', 'nhiều', 'lớn', 'nhỏ', 'đại', 'tiểu', 'đồng', 'nghịch', 'tăng', 'giảm', 'chẵn', 'lẻ', 'âm', 'dương',
  'tối', 'hơn', 'chia', 'hết', 'nguyên', 'tố', 'hợp', 'giao', 'phủ', 'định', 'ngược', 'trái', 'phải', 'trên', 'dưới', 'cắt', 'song', 'vuông', 'góc', 'nhất']);

// ---------- hình ----------
const FIG_RE = /\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}|\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}/g;
function splitFigures(s: string): { rest: string; figs: string[] } {
  const figs: string[] = [];
  const rest = s.replace(FIG_RE, (m) => { figs.push(m); return ' '; });
  return { rest, figs };
}
const canonFig = (s: string): string => s.replace(/\s+/g, ' ').replace(/ ?([;,()=\[\]{}]) ?/g, '$1').trim();

// ---------- dòng chảy: chữ + công thức theo thứ tự ----------
interface Flow { key: string; words: string[]; maths: string[][] }
function flowOf(src: string): Flow {
  const items: string[] = [];
  const words: string[] = [];
  const maths: string[][] = [];
  for (const g of segments(src)) {
    if (g.math) { const t = mathTokens(g.s); if (t.length) { items.push(`m[${t.join(' ')}]`); maths.push(t); } }
    else for (const w of textWords(g.s)) { items.push(`w:${w}`); words.push(w); }
  }
  return { key: items.join('\u0001'), words, maths };
}
const isNum = (t: string) => /^\d+(?:\.\d+)?$/.test(t);
const isOp = (t: string) => !isNum(t) && !/^\p{L}$/u.test(t) && t !== '{' && t !== '}' && t !== '(' && t !== ')' && t !== ',';

function norm(s: string | null | undefined): string { return (s ?? '').replace(/\r\n?/g, '\n').trim(); }
/** Dấu của mã nguồn (giống `rawKey` trong dấu vân), không phải dựng cả dấu vân. */
export const rawKeyOf = (latex: string): string => { const raw = norm(latex); return hashKey(raw) + ':' + raw.length; };

// ---------- dấu vân tay ----------
const fpCache = new Map<string, Fingerprint>();
export function fingerprint(latex: string): Fingerprint {
  const hit = fpCache.get(latex);
  if (hit) return hit;
  const f = build(latex);
  if (fpCache.size > 100000) fpCache.clear();
  fpCache.set(latex, f);
  return f;
}

function build(latex: string): Fingerprint {
  const p = parseExTest(latex);
  const figs: string[] = [];
  const take = (s: string): string => { const r = splitFigures(s); figs.push(...r.figs); return r.rest; };

  const stemFlow = flowOf(take(p.stem) + '\n' + take(p.tail));
  if (p.figure) figs.push(p.figure);
  if (p.defs) figs.push(p.defs);
  const optFlows = p.options.map((o) => flowOf(take(o.text)));
  const ansFlow = p.shortAnswer != null ? flowOf(take(p.shortAnswer)) : null;
  const sol = p.solution != null ? flowOf(splitFigures(p.solution).rest) : null; // hình trong lời giải không tính vào hình của đề

  const optKeys = optFlows.map((f) => f.key);
  const flags = p.options.map((o) => (o.correct ? 1 : 0));
  const optSet = p.type === 'ds' ? optKeys.join('\u0002') : [...optKeys].sort().join('\u0002');
  const optItemsSet = p.options.map((_, i) => `${optKeys[i]}\u0003${flags[i]}`).sort().join('\u0002');
  const ansKey = p.type === 'tn' ? optKeys.filter((_, i) => flags[i]).sort().join('\u0002')
    : p.type === 'ds' ? flags.join('')
    : p.type === 'tln' ? (ansFlow ? ansFlow.key.replace(/\.(?=\d)/g, '.') : '')
    : '';

  const allFlows = [stemFlow, ...optFlows, ...(ansFlow ? [ansFlow] : [])];
  const nums: string[] = [];
  const ops: string[] = [];
  const keys: string[] = [];
  const words = new Set<string>();
  const mathGrams = new Set<string>();
  for (const f of allFlows) {
    for (const w of f.words) { if (isNum(w)) nums.push(w); if (KEYWORDS.has(w)) keys.push(w); }
    for (let i = 0; i < f.words.length; i++) { words.add(f.words[i]); if (i + 1 < f.words.length) words.add(`${f.words[i]} ${f.words[i + 1]}`); }
    for (const m of f.maths) {
      for (const t of m) { if (isNum(t)) nums.push(t); else if (isOp(t)) ops.push(t); }
      if (m.length < 3) mathGrams.add(m.join(' '));
      else for (let i = 0; i + 3 <= m.length; i++) mathGrams.add(m.slice(i, i + 3).join(' '));
    }
  }
  nums.sort(); ops.sort(); keys.sort();

  const loose = new Set<string>(textWords(latex.replace(/\$/g, ' ').replace(/[\\^_{}]/g, ' ')));
  const figKey = figs.map(canonFig).sort().join('\u0002');
  const raw = norm(latex);

  return {
    v: FP_VERSION,
    rawKey: rawKeyOf(latex),
    raw,
    type: p.type,
    complete: p.issues.length === 0,
    issues: p.issues,
    stemKey: stemFlow.key,
    optKeys, optSet, optItemsSet, ansKey, figKey,
    solKey: sol ? sol.key : null,
    nums, ops, keys, words: toIds('w', words), mathGrams: toIds('m', mathGrams), loose: toIds('w', loose),
    contentKey: hashKey([p.type, stemFlow.key, optSet, figKey].join('\u0004')),
    factsKey: optKeys.length > 0 || nums.length >= 2 ? hashKey([p.type, optSet, nums.join(','), ops.join(','), figKey].join('\u0004')) : '',
  };
}

// ---------- so sánh một cặp ----------
export interface PairResult {
  kind: DupKind;
  /** “Mức tương đồng” 0–1. KHÔNG phải xác suất trùng. */
  score: number;
  text: number;
  math: number;
  flags: string[];
  reasons: string[];
}

/** Jaccard của hai tập mã số đã sắp, không trùng (đếm phần chung bằng một lượt duyệt song song). */
function jaccard(a: Int32Array, b: Int32Array): number {
  if (!a.length && !b.length) return 0;
  let inter = 0, i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const x = a[i], y = b[j];
    if (x === y) { inter++; i++; j++; } else if (x < y) i++; else j++;
  }
  return inter / (a.length + b.length - inter);
}
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
export const NEAR_MIN = 0.5;

function lexical(a: Fingerprint, b: Fingerprint): { text: number; math: number; lex: number } {
  const text = jaccard(a.words, b.words);
  const math = jaccard(a.mathGrams, b.mathGrams);
  const hasMath = a.mathGrams.length > 0 && b.mathGrams.length > 0;
  const hasText = a.words.length > 0 && b.words.length > 0;
  const lex = hasMath && hasText ? 0.55 * text + 0.45 * math : hasMath ? math : hasText ? text : 0;
  return { text, math, lex };
}

export function comparePair(a: Fingerprint, b: Fingerprint): PairResult {
  const { text, math, lex } = lexical(a, b);
  const res = (kind: DupKind, score: number, flags: string[], reasons: string[]): PairResult => ({ kind, score, text, math, flags, reasons });

  if (a.rawKey === b.rawKey && a.raw === b.raw) return res('raw', 1, [], ['Mã nguồn LaTeX giống nhau.']);

  if (!a.complete || !b.complete) {
    const loose = jaccard(a.loose, b.loose);
    if (loose >= NEAR_MIN) {
      const bad = !a.complete ? a.issues[0] : b.issues[0];
      return res('insufficient', loose, [], [`Có câu chưa đọc được đầy đủ (${bad}) nên chưa thể kết luận.`]);
    }
    return res('unrelated', loose, [], []);
  }

  const typeEq = a.type === b.type;
  const stemEq = a.stemKey === b.stemKey;
  const optEq = a.type === 'ds' ? a.optSet === b.optSet : a.optSet === b.optSet;
  const figEq = a.figKey === b.figKey;
  const ansEq = a.ansKey === b.ansKey;

  if (typeEq && stemEq && optEq && figEq) {
    if (!ansEq) return res('conflict', 1, ['khác đáp án'], ['Cùng đề, cùng phương án và cùng hình nhưng đáp án đúng KHÁC NHAU — cần xem lại câu nào đúng.']);
    const notes: string[] = ['Cùng đề, phương án, hình và đáp án; chỉ khác cách trình bày.'];
    if (a.type === 'tn' && !same(a.optKeys, b.optKeys)) notes.push('Thứ tự phương án khác nhau (đáp án đúng đi theo nội dung).');
    if (a.solKey !== null && b.solKey !== null && a.solKey !== b.solKey) notes.push('Lời giải viết khác nhau.');
    return res('same', 1, [], notes);
  }

  const flags: string[] = [];
  if (!typeEq) flags.push('khác loại câu');
  if (!figEq) flags.push('khác hình');
  if (!same(a.nums, b.nums)) flags.push('khác số liệu');
  if (!same(a.ops, b.ops)) flags.push('khác dấu/phép toán');
  if (!same(a.keys, b.keys)) flags.push('khác từ khoá điều kiện');
  if (typeEq && !ansEq && a.optItemsSet !== b.optItemsSet) flags.push('khác đáp án');
  if (typeEq && stemEq && !optEq && !flags.length && !(a.type === 'ds' && a.optItemsSet === b.optItemsSet)) flags.push('khác phương án');

  if (lex < NEAR_MIN && !stemEq) return res('unrelated', lex, flags, []);

  // Đề, phương án, đáp án giống hệt; CHỈ khác mã hình: thường là cùng một câu được vẽ lại hình (đổi tỉ lệ, kiểu nét, gói vẽ).
  // Không được coi là "biến thể" (sẽ nhập thẳng) mà phải để giáo viên xem — nhưng cũng không khẳng định trùng.
  if (typeEq && stemEq && optEq && ansEq && flags.length === 1 && flags[0] === 'khác hình') {
    return res('near', lex, flags, ['Đề, phương án và đáp án giống hệt; chỉ khác mã hình — có thể là cùng một câu được vẽ lại hình, cần xem.']);
  }

  if (flags.length) return res('template', lex, flags, [`Giống khoảng ${Math.round(lex * 100)}% về chữ/công thức nhưng ${flags.join(', ')} — có thể là câu khác (biến thể), cần xem.`]);

  const notes = [`Cùng số liệu, dấu và hình; khác cách diễn đạt (mức tương đồng ${Math.round(lex * 100)}%).`];
  if (a.type === 'ds' && a.optSet !== b.optSet && a.optItemsSet === b.optItemsSet) notes.push('Các ý đúng/sai được đổi thứ tự.');
  return res('near', lex, [], notes);
}

export const compareLatex = (x: string, y: string): PairResult => comparePair(fingerprint(x), fingerprint(y));
