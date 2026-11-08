// Thiết lập đề (hàm thuần, có kiểm thử) — xem claude/thiet-ke-thiet-lap-de.md.
// Đọc một tệp .tex của đề: tìm các khối \begin{ex}…\end{ex}, xếp phần theo lệnh trong câu
// (\choiceTF → II, \choice → I, \shortans → III, không lệnh → IV), tìm tiêu đề phần và khung tiêu đề có sẵn,
// rồi dựng lại văn bản: chèn đoạn mở đầu mỗi phần, (tuỳ chọn) sắp câu theo phần, điền khung tiêu đề.
// KHÔNG sửa chữ nào bên trong khối câu: sắp lại chỉ chuyển nguyên khối (kể cả dòng chú thích ngay trên nó).
import { readGroup, stripComments } from './extest';
import type { PartKey } from './examgen';
import { plainSnippet } from './snippet';

export const SETUP_PARTS: PartKey[] = ['p1', 'p2', 'p3', 'p4'];
export const PART_KIND: Record<PartKey, string> = { p1: 'Trắc nghiệm', p2: 'Đúng/Sai', p3: 'Trả lời ngắn', p4: 'Tự luận' };
const ROMAN = ['I', 'II', 'III', 'IV'];

export interface SetupBlock {
  /** vị trí đầu dòng chú thích dính ngay trên câu (hoặc đầu dòng \begin{ex}) */
  lead: number;
  /** vị trí `\begin{ex}` */
  start: number;
  /** sau `\end{ex}` (gồm phần còn lại của dòng nếu chỉ là khoảng trắng/chú thích) */
  end: number;
  /** dòng của \begin{ex} (đếm từ 1) */
  line: number;
  /** phần máy đoán theo lệnh */
  part: PartKey;
  snippet: string;
}
export interface Span { start: number; end: number; line: number; /** đoạn do HEdu chèn (có dòng đánh dấu) */ marker: boolean }
export interface FrameInfo { dept: string; school: string; group: string; title: string; subject: string; minutes: number; note: string; code: string }
export type FrameAt =
  | { kind: 'name'; start: number; end: number; info: FrameInfo }
  | { kind: 'marker'; start: number; end: number; info: FrameInfo | null }
  | { kind: 'none' };
export interface SetupScan {
  blocks: SetupBlock[];
  headings: Span[];
  frame: FrameAt;
  /** vị trí ngay sau dòng \begin{document} (0 nếu tệp không có) */
  docStart: number;
  hasDocument: boolean;
  /** không có khối ex nào nhưng có "Câu 1." … (văn bản OCR thô) */
  raw: boolean;
  /** khối mở mà không đóng, … */
  issues: { line: number; message: string }[];
}

const MARK_PART = '% HEdu: phan';
const MARK_PART_END = '% HEdu: het-phan';
const MARK_FRAME = '% HEdu: khung-tieu-de';
const MARK_FRAME_END = '% HEdu: het-khung';

/** vị trí `%` đầu tiên không bị thoát trong dòng (−1 nếu không có) */
function commentAt(line: string): number {
  for (let i = 0; i < line.length; i++) if (line[i] === '%' && (i === 0 || line[i - 1] !== '\\')) return i;
  return -1;
}
const lineStartOf = (t: string, i: number) => t.lastIndexOf('\n', i - 1) + 1;
const lineEndOf = (t: string, i: number) => { const j = t.indexOf('\n', i); return j < 0 ? t.length : j; };
const lineNo = (t: string, i: number) => { let n = 1; for (let k = 0; k < i; k++) if (t.charCodeAt(k) === 10) n++; return n; };
/** `i` nằm sau dấu % (bị chú thích) trên dòng của nó? */
const commented = (t: string, i: number) => { const s = lineStartOf(t, i); const c = commentAt(t.slice(s, i)); return c >= 0; };

/** Đoán phần của một câu theo lệnh ex_test (bỏ chú thích và phần lời giải). */
export function partOf(block: string): PartKey {
  let body = stripComments(block).text;
  const sol = body.search(/\\loigiai(?![A-Za-z])/);
  if (sol >= 0) body = body.slice(0, sol);
  if (/\\choiceTF(?![A-Za-z])/.test(body)) return 'p2';
  if (/\\choice(?![A-Za-z])/.test(body)) return 'p1';
  if (/\\shortans(?![A-Za-z])/.test(body)) return 'p3';
  return 'p4';
}

const FILLER = /^\s*(\\noindent|\\par|\\medskip|\\bigskip|\\smallskip|\\vspace\*?\{[^}]*\}|\\setcounter\{(?:ex|bt)\}\{0\}|\s)*\s*$/;
const HEAD = [/\\(?:caulc|cauds|caukq|cautl)(?![A-Za-z])/, /PH[ẦẦA]N\s+(?:IV|I{1,3})(?![A-Za-z])/i, /\\(?:sub)*section\*?\{[^}]*Ph[ầầa]n/i];
const isHeadLine = (line: string) => {
  const code = commentAt(line) >= 0 ? line.slice(0, commentAt(line)) : line;
  if (/\\(?:newcommand|renewcommand|def|providecommand)(?![A-Za-z])/.test(code)) return false;
  return HEAD.some((r) => r.test(code));
};

export function scanSetup(src: string): SetupScan {
  const t = src.replace(/\r\n?/g, '\n');
  const issues: SetupScan['issues'] = [];
  const dm = /\\begin\{document\}[^\n]*\n?/.exec(t);
  const docStart = dm && !commented(t, dm.index) ? dm.index + dm[0].length : 0;
  const hasDocument = docStart > 0;
  const docEnd = (() => { const m = /\\end\{document\}/.exec(t); return m && !commented(t, m.index) ? m.index : t.length; })();

  // khối câu
  const blocks: SetupBlock[] = [];
  const re = /\\begin\{ex\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const s = m.index;
    if (s < docStart || s >= docEnd || commented(t, s)) continue;
    // tìm \end{ex} không bị chú thích; gặp \begin{ex} trước thì khối này chưa đóng
    const er = /\\(begin|end)\{ex\}/g;
    er.lastIndex = s + 10;
    let e = -1, x: RegExpExecArray | null;
    while ((x = er.exec(t))) {
      if (commented(t, x.index)) continue;
      if (x[1] === 'begin') break;
      e = x.index + x[0].length; break;
    }
    if (e < 0) { issues.push({ line: lineNo(t, s), message: 'Câu mở \\begin{ex} mà không có \\end{ex}: không đếm câu này.' }); continue; }
    const le = lineEndOf(t, e);
    const rest = t.slice(e, le);
    if (/^\s*$/.test(rest) || /^\s*%/.test(rest)) e = le;
    // dòng chú thích dính ngay trên (không phải dấu của HEdu)
    let lead = lineStartOf(t, s);
    if (!/^\s*$/.test(t.slice(lead, s))) lead = s; // \begin{ex} giữa dòng: không kéo phần đầu dòng theo
    else for (;;) {
      if (lead === 0) break;
      const ps = lineStartOf(t, lead - 1);
      const pl = t.slice(ps, lead - 1);
      if (/^\s*%/.test(pl) && !pl.trim().startsWith('% HEdu:') && ps >= docStart) lead = ps; else break;
    }
    const text = t.slice(s, e);
    blocks.push({ lead, start: s, end: e, line: lineNo(t, s), part: partOf(text), snippet: plainSnippet(text.replace(/^\\begin\{ex\}(%[^\n]*)?/, ''), 90) });
    re.lastIndex = e;
  }
  const inBlock = (i: number) => blocks.some((b) => i >= b.lead && i < b.end);

  // tiêu đề phần: đoạn có dấu HEdu, hoặc dòng tiêu đề gõ tay (+ các dòng đệm quanh nó)
  const headings: Span[] = [];
  const mr = new RegExp(`^${MARK_PART}[^\\n]*\\n[\\s\\S]*?^${MARK_PART_END}[^\\n]*\\n?`, 'gm');
  while ((m = mr.exec(t))) {
    if (m.index < docStart || inBlock(m.index)) continue;
    // nuốt luôn các dòng trống ngay sau (do HEdu chèn) để chạy lại không dồn thêm dòng trống
    let e = m.index + m[0].length;
    while (e < t.length && t[e] === '\n') e++;
    headings.push({ start: m.index, end: e, line: lineNo(t, m.index), marker: true });
  }
  const inHead = (i: number) => headings.some((h) => i >= h.start && i < h.end);
  let p = docStart;
  while (p < docEnd) {
    const le = lineEndOf(t, p);
    const line = t.slice(p, le);
    if (!inBlock(p) && !inHead(p) && isHeadLine(line)) {
      let a = p, b = le < t.length ? le + 1 : le;
      // dòng đệm phía trên (\noindent, \par…) và phía dưới (\setcounter{ex}{0}, \vspace…, dòng "Thí sinh …")
      while (a > docStart) { const ps = lineStartOf(t, a - 1); const pl = t.slice(ps, a - 1); if (pl.trim() && FILLER.test(pl) && !inBlock(ps)) a = ps; else break; }
      while (b < docEnd) {
        const ne = lineEndOf(t, b); const nl = t.slice(b, ne);
        if (!inBlock(b) && nl.trim() && (FILLER.test(nl) || /^\s*\{?\s*(\\textit\{)?\s*Thí sinh/.test(nl))) b = ne < t.length ? ne + 1 : ne; else break;
      }
      headings.push({ start: a, end: b, line: lineNo(t, p), marker: false });
      p = b;
      continue;
    }
    p = le + 1;
  }
  headings.sort((x, y) => x.start - y.start);

  // khung tiêu đề
  let frame: FrameAt = { kind: 'none' };
  const fm = new RegExp(`^${MARK_FRAME}([^\\n]*)\\n[\\s\\S]*?^${MARK_FRAME_END}[^\\n]*\\n?`, 'm').exec(t);
  if (fm) {
    let info: FrameInfo | null = null;
    try { const o = JSON.parse(fm[1].trim()) as Partial<FrameInfo>; info = { ...EMPTY_FRAME, ...o, minutes: Number(o.minutes) || EMPTY_FRAME.minutes }; } catch { info = null; }
    frame = { kind: 'marker', start: fm.index, end: fm.index + fm[0].length, info };
  } else {
    const nm = /\\begin\{name\}/.exec(t);
    if (nm && nm.index >= docStart && !commented(t, nm.index)) {
      const args: string[] = [];
      let q = nm.index + nm[0].length;
      for (let k = 0; k < 8; k++) {
        while (t[q] === ' ' || t[q] === '\n' || t[q] === '\t') q++;
        const g = readGroup(t, q);
        if (!g) break;
        args.push(g[0]); q = g[1];
      }
      if (args.length === 8) {
        const un = (s: string) => (s.trim() === '\\mbox{}' ? '' : s.replace(/\\([#$%&_{}])/g, '$1').trim());
        const mins = /(\d+)/.exec(args[6]);
        frame = { kind: 'name', start: nm.index + nm[0].length, end: q, info: { dept: un(args[0]), school: un(args[1]), group: un(args[2]), title: un(args[4]), subject: un(args[5]), minutes: mins ? +mins[1] : 90, note: un(args[7]), code: '' } };
      }
    }
  }

  const raw = blocks.length === 0 && /(^|\n)\s*(\\textbf\{)?\s*Câu\s*\d+/i.test(t.slice(docStart, docEnd));
  return { blocks, headings, frame, docStart, hasDocument, raw, issues };
}

export const EMPTY_FRAME: FrameInfo = { dept: '', school: '', group: '', title: '', subject: 'Toán', minutes: 90, note: '', code: '' };

// ——— đoạn mở đầu mỗi phần ———
export interface PartIntro { title: string; sentence: string }
export type IntroSet = Record<PartKey, PartIntro>;
export const DEFAULT_INTRO: IntroSet = {
  p1: { title: 'Câu trắc nghiệm nhiều phương án lựa chọn.', sentence: 'Thí sinh trả lời từ câu 1 đến câu {n}. Mỗi câu hỏi thí sinh chỉ chọn một phương án.' },
  p2: { title: 'Câu trắc nghiệm đúng sai.', sentence: 'Thí sinh trả lời từ câu 1 đến câu {n}. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.' },
  p3: { title: 'Câu trắc nghiệm trả lời ngắn.', sentence: 'Thí sinh trả lời từ câu 1 đến câu {n}.' },
  p4: { title: 'Tự luận.', sentence: 'Thí sinh trình bày lời giải chi tiết từ câu 1 đến câu {n}.' },
};
const INTRO_KEY = 'hedu.partintro';
export function loadIntro(): IntroSet {
  try {
    const o = JSON.parse(localStorage.getItem(INTRO_KEY) ?? 'null') as Partial<Record<PartKey, Partial<PartIntro>>> | null;
    if (!o || typeof o !== 'object') return DEFAULT_INTRO;
    const r = { ...DEFAULT_INTRO };
    for (const k of SETUP_PARTS) { const v = o[k]; if (v && typeof v.title === 'string' && typeof v.sentence === 'string') r[k] = { title: v.title, sentence: v.sentence }; }
    return r;
  } catch { return DEFAULT_INTRO; }
}
export function saveIntro(s: IntroSet) { try { localStorage.setItem(INTRO_KEY, JSON.stringify(s)); } catch { /* chỉ là tiện lợi */ } }

/** câu chữ sau khi điền số câu; đúng 1 câu thì "từ câu 1 đến câu 1" thành "câu 1" */
export function fillSentence(sentence: string, n: number): string {
  const s = n === 1 ? sentence.replace(/từ câu 1 đến câu \{n\}/g, 'câu 1') : sentence;
  return s.replace(/\{n\}/g, String(n));
}

/** Đoạn mã chèn trước câu đầu tiên của một phần (số La Mã đánh liên tục theo các phần có mặt). */
export function introCode(roman: string, intro: PartIntro, n: number): string {
  const sentence = fillSentence(intro.sentence, n).trim();
  return [
    `${MARK_PART} ${roman}`,
    `\\noindent\\textbf{PHẦN ${roman}. ${intro.title.trim()}}${sentence ? ` \\textit{${sentence}}` : ''}\\par`,
    '\\vspace{6pt}',
    '\\setcounter{ex}{0}',
    MARK_PART_END,
    '',
  ].join('\n');
}

const esc = (s: string): string => s.replace(/([#$%&_{}])/g, '\\$1').replace(/\\(?![#$%&_{}])/g, '');
const nameArg = (s: string) => (s.trim() ? `{${esc(s.trim())}}` : '{\\mbox{}}');

/** Khung tiêu đề đơn giản (khi tệp không dùng môi trường name của khaibaochung). */
export function frameCode(f: FrameInfo): string {
  const left = [f.dept.trim() && `\\MakeUppercase{${esc(f.dept.trim())}}`, f.school.trim() && `\\textbf{\\MakeUppercase{${esc(f.school.trim())}}}`, f.group.trim() && esc(f.group.trim())].filter(Boolean);
  const right = [
    f.title.trim() && `\\textbf{\\MakeUppercase{${esc(f.title.trim())}}}`,
    f.subject.trim() && `\\textbf{Môn: ${esc(f.subject.trim())}}`,
    f.minutes > 0 && `\\textit{Thời gian làm bài: ${f.minutes} phút, không kể thời gian phát đề}`,
    f.note.trim() && esc(f.note.trim()),
  ].filter(Boolean);
  const save: Partial<FrameInfo> = { ...f };
  return [
    `${MARK_FRAME} ${JSON.stringify(save)}`,
    '\\noindent',
    `\\begin{minipage}[t]{0.42\\textwidth}\\centering`,
    (left.length ? left : ['\\mbox{}']).join('\\\\\n'),
    '\\end{minipage}\\hfill',
    `\\begin{minipage}[t]{0.56\\textwidth}\\centering`,
    (right.length ? right : ['\\mbox{}']).join('\\\\\n'),
    '\\end{minipage}',
    '\\par\\vspace{6pt}',
    ...(f.code.trim() ? [`\\hfill\\fbox{Mã đề thi: ${esc(f.code.trim())}}\\par\\vspace{6pt}`] : []),
    MARK_FRAME_END,
    '',
  ].join('\n');
}
const nameArgs = (f: FrameInfo) => [f.dept, f.school, f.group].map(nameArg).join('') + '{\\mbox{}}' + [f.title, f.subject].map(nameArg).join('') + `{Thời gian làm bài: ${f.minutes} phút}` + nameArg(f.note);

// ——— dựng lại văn bản ———
export interface SetupOptions {
  /** phần của từng câu (theo thứ tự scan.blocks) */
  parts: PartKey[];
  /** đề có tiêu đề phần gõ tay: thay bằng đoạn mới hay giữ */
  headings: 'update' | 'keep';
  intro: IntroSet;
  /** null = không đụng khung tiêu đề */
  frame: FrameInfo | null;
}
export interface SetupPlan { text: string; reordered: boolean; counts: Record<PartKey, number>; /** các phần được chèn đoạn mở đầu, theo thứ tự */ inserted: string[] }

export const countParts = (parts: readonly PartKey[]): Record<PartKey, number> => {
  const c: Record<PartKey, number> = { p1: 0, p2: 0, p3: 0, p4: 0 };
  for (const p of parts) c[p]++;
  return c;
};
/** các câu có nằm thành từng nhóm liền nhau, đúng thứ tự I → IV không */
export const inOrder = (parts: readonly PartKey[]): boolean => parts.every((p, i) => i === 0 || SETUP_PARTS.indexOf(parts[i - 1]) <= SETUP_PARTS.indexOf(p));
/** câu nằm sai chỗ (ngắt nhóm) — số thứ tự câu trong tệp, đếm từ 1 */
export function misplaced(parts: readonly PartKey[]): number[] {
  // giữ dãy con dài nhất đã đúng thứ tự phần; các câu còn lại là câu "lạc" (ít câu phải chuyển nhất)
  const k = parts.map((p) => SETUP_PARTS.indexOf(p));
  const n = k.length;
  const len = new Array<number>(n).fill(1), prev = new Array<number>(n).fill(-1);
  let best = -1;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) if (k[j] <= k[i] && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j; }
    if (best < 0 || len[i] >= len[best]) best = i;
  }
  const keep = new Set<number>();
  for (let i = best; i >= 0; i = prev[i]) keep.add(i);
  return k.map((_, i) => i).filter((i) => !keep.has(i)).map((i) => i + 1);
}

const GAP_OK = /^\s*$/;
/** Dựng văn bản mới. Lỗi (không làm được an toàn) thì trả `{ error }`. Văn bản trả về dùng LF. */
export function planSetup(src: string, scan: SetupScan, o: SetupOptions): SetupPlan | { error: string } {
  const t = src.replace(/\r\n?/g, '\n');
  const { blocks } = scan;
  if (!blocks.length) return { error: 'Tệp chưa có câu nào dạng \\begin{ex}…\\end{ex}.' };
  if (o.parts.length !== blocks.length) return { error: 'Số câu đã đổi, hãy mở lại hộp thoại.' };
  const counts = countParts(o.parts);
  const present = SETUP_PARTS.filter((p) => counts[p] > 0);
  const roman = (p: PartKey) => ROMAN[present.indexOf(p)];
  const reorder = !inOrder(o.parts);
  const regionStart = blocks[0].lead, regionEnd = blocks[blocks.length - 1].end;

  // tiêu đề sẽ bỏ: luôn bỏ đoạn của HEdu (để chèn lại, không trùng); tiêu đề gõ tay chỉ bỏ khi "Cập nhật"
  const drop = scan.headings.filter((h) => h.marker || o.headings === 'update');
  const kept = scan.headings.filter((h) => !drop.includes(h));
  if (reorder && kept.some((h) => h.start >= regionStart && h.start < regionEnd)) return { error: 'Đề có tiêu đề phần gõ tay nằm giữa các câu: chọn “Cập nhật tiêu đề” để sắp lại câu theo phần.' };

  type Edit = { start: number; end: number; text: string; ord: number };
  const edits: Edit[] = [];
  const inserted: string[] = [];

  if (reorder) {
    // khoảng giữa các câu chỉ được có khoảng trắng hoặc tiêu đề sẽ bỏ; còn gì khác thì không dám chuyển
    for (let i = 0; i + 1 < blocks.length; i++) {
      let gap = t.slice(blocks[i].end, blocks[i + 1].lead);
      const base = blocks[i].end;
      for (const h of [...drop].reverse()) if (h.start >= base && h.end <= blocks[i + 1].lead) gap = gap.slice(0, h.start - base) + gap.slice(h.end - base);
      if (!GAP_OK.test(gap)) return { error: `Giữa câu ${i + 1} và câu ${i + 2} (dòng ${lineNo(t, blocks[i].end)}) có nội dung khác (vd \\newpage, môi trường): không tự sắp lại được. Sửa tay hoặc giữ thứ tự câu đúng phần.` };
    }
    const parts: string[] = [];
    for (const p of present) {
      parts.push(introCode(roman(p), o.intro[p], counts[p]).replace(/\n$/, ''));
      inserted.push(`PHẦN ${roman(p)}`);
      blocks.forEach((b, i) => { if (o.parts[i] === p) parts.push(t.slice(b.lead, b.end).replace(/\s+$/, '')); });
    }
    edits.push({ start: regionStart, end: regionEnd, text: parts.join('\n\n'), ord: 1 });
    for (const h of drop) if (h.end <= regionStart || h.start >= regionEnd) edits.push({ start: h.start, end: h.end, text: '', ord: 0 });
  } else {
    for (const h of drop) edits.push({ start: h.start, end: h.end, text: '', ord: 0 });
    for (const p of present) {
      const i = o.parts.indexOf(p);
      const b = blocks[i];
      const prevEnd = i > 0 ? blocks[i - 1].end : scan.docStart;
      // "Giữ": phần đã có tiêu đề gõ tay ngay trước câu đầu thì không chèn thêm
      if (kept.some((h) => h.start >= prevEnd && h.end <= b.lead)) continue;
      edits.push({ start: b.lead, end: b.lead, text: introCode(roman(p), o.intro[p], counts[p]) + '\n', ord: 2 });
      inserted.push(`PHẦN ${roman(p)}`);
    }
  }

  if (o.frame) {
    const f = scan.frame;
    if (f.kind === 'name') edits.push({ start: f.start, end: f.end, text: nameArgs(o.frame), ord: 0 });
    else if (f.kind === 'marker') edits.push({ start: f.start, end: f.end, text: frameCode(o.frame), ord: 0 });
    else {
      const firstHead = scan.headings.length ? scan.headings[0].start : Infinity;
      const at = scan.hasDocument ? scan.docStart : Math.min(regionStart, firstHead);
      edits.push({ start: at, end: at, text: frameCode(o.frame) + '\n', ord: 0 });
    }
  }

  // áp từ cuối lên; cùng vị trí thì đoạn có ord nhỏ đứng trước
  edits.sort((a, b) => b.start - a.start || b.ord - a.ord);
  let out = t;
  let guard = Infinity;
  for (const e of edits) {
    if (e.end > guard) return { error: 'Các chỗ cần sửa chồng lên nhau; hãy sửa tay.' };
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
    guard = e.start;
  }
  out = out.replace(/\n{4,}/g, '\n\n\n');
  return { text: out, reordered: reorder, counts, inserted };
}

// ——— hỏi khi nhập đề ———
const ASK_KEY = 'hedu.examsetup.ask';
export const setupAskOn = (): boolean => { try { return localStorage.getItem(ASK_KEY) !== 'off'; } catch { return true; } };
export const setSetupAsk = (on: boolean) => { try { localStorage.setItem(ASK_KEY, on ? 'on' : 'off'); } catch { /* tiện lợi */ } };

/** chọn tệp nên thiết lập: tệp .tex có nhiều câu nhất (bằng nhau thì ưu tiên tệp chính) */
export function pickSetupFile(files: readonly { rel: string; count: number }[], main: string | null): string | null {
  const tex = files.filter((f) => /\.tex$/i.test(f.rel));
  if (!tex.length) return null;
  const best = [...tex].sort((a, b) => b.count - a.count || (a.rel === main ? -1 : b.rel === main ? 1 : 0))[0];
  return best.count > 0 ? best.rel : (main && tex.some((f) => f.rel === main) ? main : best.rel);
}
