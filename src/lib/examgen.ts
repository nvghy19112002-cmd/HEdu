// Sinh đề từ Ngân hàng câu hỏi (hàm thuần, có kiểm thử):
//  1) chọn câu theo ma trận bằng luồng cực đại — các dòng ma trận chồng lấn không bị báo thiếu giả như khi chọn tham lam;
//  2) trộn phương án KHÔNG viết lại câu: chỉ hoán vị nguyên văn các nhóm {…} của \choice, mọi chữ khác giữ nguyên byte;
//  3) bảng đáp án suy ra từ chính phép hoán vị; câu không nhận diện chắc thì không trộn và nói rõ lý do;
//  4) dựng .tex bằng khai báo của giáo viên (môi trường name, \caulc/\cauds/\caukq/\cautl trong khaibaochung).
import { readGroup, parseExTest } from './extest';
import type { Level, QType, Question } from './types';

// ---------- Phạm vi, dòng ma trận, điều kiện đủ dùng ----------
export type ScopeKind = 'grade' | 'chapter' | 'lesson' | 'form';
export interface Scope { kind: ScopeKind; id: string }
export interface Row { id: string; scope: Scope; type: QType; level: Level | 'any'; count: number }

export const inScope = (q: Question, s: Scope): boolean =>
  s.kind === 'grade' ? String(q.grade) === s.id : s.kind === 'chapter' ? q.chapterId === s.id : s.kind === 'lesson' ? q.lessonId === s.id : q.formId === s.id;
export const rowMatches = (r: Row, q: Question): boolean => q.type === r.type && (r.level === 'any' || q.level === r.level) && inScope(q, r.scope);

/** duyet = nội dung “Đã duyệt”; xac-minh = thêm Dạng và mức độ do giáo viên xác minh; tat-ca = mọi câu trừ “Cần sửa” (có cảnh báo). */
export type Policy = 'duyet' | 'xac-minh' | 'tat-ca';
export const POLICY_LABEL: Record<Policy, string> = { duyet: 'Đã duyệt nội dung', 'xac-minh': 'Đã duyệt + xác minh Dạng và mức độ', 'tat-ca': 'Mọi câu (trừ “Cần sửa”)' };
export interface EffLike { form: string; level: string; unclassified: boolean }

export function eligible(q: Question, eff: (q: Question) => EffLike, policy: Policy): boolean {
  if (q.review === 'needs_fix') return false;
  if (policy === 'tat-ca') return true;
  if (q.review !== 'approved') return false;
  if (policy === 'duyet') return true;
  return verified(eff(q)); // chỉ tính khi cần: kho lớn không phải dựng trạng thái xác minh cho mọi câu
}
/** Câu đã được giáo viên xác minh cả Dạng lẫn mức độ. */
export const verified = (eff: EffLike): boolean => !eff.unclassified && eff.form === 'gv' && eff.level === 'gv';

// ---------- Ngẫu nhiên có hạt giống ----------
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle<T>(arr: readonly T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Phân bổ toàn cục (luồng cực đại) ----------
export interface AllocOpts {
  policy: Policy;
  eff(q: Question): EffLike;
  seed: number;
  /** câu giáo viên đã khóa theo dòng; còn đủ điều kiện và khớp dòng thì giữ nguyên */
  locked?: Readonly<Record<string, readonly string[]>>;
  /** câu không được chọn (đã dùng ở nơi khác) */
  exclude?: ReadonlySet<string>;
}
export interface Alloc {
  /** uid được chọn cho từng dòng, khóa trước rồi tới phần máy chọn */
  picks: Record<string, string[]>;
  /** số câu còn thiếu của từng dòng (0 = đủ) */
  deficit: Record<string, number>;
  /** số câu đủ điều kiện khớp từng dòng (không trừ câu dùng cho dòng khác) */
  pool: Record<string, number>;
}

class Flow {
  to: number[] = []; cap: number[] = []; next: number[] = []; head: number[];
  level: number[] = []; it: number[] = [];
  constructor(public n: number) { this.head = new Array(n).fill(-1); }
  add(u: number, v: number, c: number): number {
    const id = this.to.length;
    this.to.push(v); this.cap.push(c); this.next.push(this.head[u]); this.head[u] = id;
    this.to.push(u); this.cap.push(0); this.next.push(this.head[v]); this.head[v] = id + 1;
    return id;
  }
  private bfs(s: number, t: number): boolean {
    this.level = new Array(this.n).fill(-1);
    this.level[s] = 0;
    const q = [s];
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      for (let e = this.head[u]; e !== -1; e = this.next[e]) {
        if (this.cap[e] > 0 && this.level[this.to[e]] < 0) { this.level[this.to[e]] = this.level[u] + 1; q.push(this.to[e]); }
      }
    }
    return this.level[t] >= 0;
  }
  private dfs(u: number, t: number, f: number): number {
    if (u === t) return f;
    for (; this.it[u] !== -1; this.it[u] = this.next[this.it[u]]) {
      const e = this.it[u];
      const v = this.to[e];
      if (this.cap[e] > 0 && this.level[v] === this.level[u] + 1) {
        const d = this.dfs(v, t, Math.min(f, this.cap[e]));
        if (d > 0) { this.cap[e] -= d; this.cap[e ^ 1] += d; return d; }
      }
    }
    return 0;
  }
  run(s: number, t: number): number {
    let total = 0;
    while (this.bfs(s, t)) {
      this.it = [...this.head];
      for (let f = this.dfs(s, t, Infinity); f > 0; f = this.dfs(s, t, Infinity)) total += f;
    }
    return total;
  }
}

export function allocate(bank: readonly Question[], rows: readonly Row[], o: AllocOpts): Alloc {
  const rand = rng(o.seed);
  const pool: Record<string, number> = {};
  rows.forEach((r) => { pool[r.id] = 0; });
  const byUid = new Map<string, Question>();
  const groups = new Map<string, string[]>(); // khóa = chỉ số các dòng mà câu khớp
  const matchOf = new Map<string, number[]>();
  for (const q of bank) {
    if (o.exclude?.has(q.uid) || !eligible(q, o.eff, o.policy)) continue;
    const m: number[] = [];
    rows.forEach((r, i) => { if (rowMatches(r, q)) { m.push(i); pool[r.id]++; } });
    if (!m.length) continue;
    byUid.set(q.uid, q);
    matchOf.set(q.uid, m);
    const key = m.join(',');
    const g = groups.get(key);
    if (g) g.push(q.uid); else groups.set(key, [q.uid]);
  }

  // Câu khóa đi trước và không bị chọn lại cho dòng khác.
  const picks: Record<string, string[]> = {};
  const used = new Set<string>();
  rows.forEach((r, i) => {
    picks[r.id] = [];
    for (const uid of o.locked?.[r.id] ?? []) {
      if (picks[r.id].length >= r.count || used.has(uid) || !matchOf.get(uid)?.includes(i)) continue;
      picks[r.id].push(uid);
      used.add(uid);
    }
  });
  const left = new Map<string, string[]>();
  for (const key of [...groups.keys()].sort()) left.set(key, shuffle(groups.get(key)!.filter((u) => !used.has(u)), rand));

  const keys = [...left.keys()].filter((k) => left.get(k)!.length);
  const R = rows.length, G = keys.length, S = 0, T = R + G + 1;
  const net = new Flow(T + 1);
  rows.forEach((r, i) => { const need = r.count - picks[r.id].length; if (need > 0) net.add(S, 1 + i, need); });
  const edges: { row: number; g: number; id: number }[] = [];
  const order = shuffle(keys.map((_, g) => g), rand);
  for (const g of order) {
    net.add(1 + R + g, T, left.get(keys[g])!.length);
    for (const i of keys[g].split(',').map(Number)) edges.push({ row: i, g, id: net.add(1 + i, 1 + R + g, Infinity) });
  }
  net.run(S, T);
  for (const e of edges) {
    const f = net.cap[e.id ^ 1];
    if (f > 0) picks[rows[e.row].id].push(...left.get(keys[e.g])!.splice(0, f));
  }
  const deficit: Record<string, number> = {};
  rows.forEach((r) => { deficit[r.id] = Math.max(0, r.count - picks[r.id].length); });
  return { picks, deficit, pool };
}

/** Câu có thể thay cho một dòng: đủ điều kiện, khớp dòng, chưa nằm trong đề. */
export function candidatesFor(bank: readonly Question[], row: Row, o: Pick<AllocOpts, 'policy' | 'eff'>, taken: ReadonlySet<string>): Question[] {
  return bank.filter((q) => !taken.has(q.uid) && rowMatches(row, q) && eligible(q, o.eff, o.policy));
}

// ---------- Các phần của đề ----------
export type PartKey = 'p1' | 'p2' | 'p3' | 'p4';
export const PARTS: PartKey[] = ['p1', 'p2', 'p3', 'p4'];
export const PART_NAME: Record<PartKey, string> = { p1: 'Phần I · Trắc nghiệm', p2: 'Phần II · Đúng / Sai', p3: 'Phần III · Trả lời ngắn', p4: 'Phần IV · Tự luận' };
export const partOf = (t: QType): PartKey => (t === 'tn' ? 'p1' : t === 'ds' ? 'p2' : t === 'tln' ? 'p3' : 'p4');
export type Picked = Record<PartKey, Question[]>;

/** Gom câu theo phần, giữ thứ tự dòng ma trận rồi thứ tự chọn trong dòng. */
export function collect(rows: readonly Row[], picks: Readonly<Record<string, readonly string[]>>, byUid: ReadonlyMap<string, Question>): Picked {
  const out: Picked = { p1: [], p2: [], p3: [], p4: [] };
  const seen = new Set<string>();
  for (const r of rows) for (const uid of picks[r.id] ?? []) {
    const q = byUid.get(uid);
    if (!q || seen.has(uid)) continue;
    seen.add(uid);
    out[partOf(q.type)].push(q);
  }
  return out;
}

// ---------- Điểm: số nguyên theo phần trăm điểm, tránh sai số số thực ----------
export type Scoring = Record<PartKey, number>;
/** Cấu trúc đề 2025: 0,25 / 1,0 / 0,5 điểm mỗi câu. Tự luận do giáo viên đặt. */
export const SCORING_2025: Scoring = { p1: 25, p2: 100, p3: 50, p4: 100 };
export const totalCenti = (n: Record<PartKey, number>, s: Scoring): number => PARTS.reduce((a, p) => a + n[p] * s[p], 0);
export const fmtScore = (centi: number): string => (centi / 100).toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// ---------- Trộn phương án nguyên văn ----------
export interface ChoiceLoc { spans: [number, number][]; correct: number }
export type ChoiceResult = { ok: true; loc: ChoiceLoc } | { ok: false; why: string };

/** Che chú thích % nhưng giữ nguyên độ dài để vị trí vẫn khớp với bản gốc. */
const blankComments = (s: string): string => s.replace(/(^|[^\\])%[^\n]*/gm, (m, p: string) => p + ' '.repeat(m.length - p.length));
const skipWs = (s: string, i: number): number => { while (i < s.length && /\s/.test(s[i])) i++; return i; };

function excludedRanges(mask: string): [number, number][] {
  const out: [number, number][] = [];
  const re = /\\loigiai(?![A-Za-z])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(mask))) {
    const g = readGroup(mask, skipWs(mask, m.index + m[0].length));
    if (g) { out.push([m.index, g[1]]); re.lastIndex = g[1]; }
  }
  const tz = /\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g;
  while ((m = tz.exec(mask))) out.push([m.index, m.index + m[0].length]);
  return out;
}

/** Từ khóa cho thấy phương án nhắc tới phương án khác (vd “Cả A và B đúng”): đảo vị trí sẽ làm sai nghĩa. */
const REFS: RegExp[] = [
  /(cả|tất cả|đều)\s+(các\s+)?(phương án|đáp án|ý|\b[abcd]\b)/i,
  /(phương án|đáp án)\s*\(?[abcd]\)?(?![\p{L}])/iu,
  /không\s+có\s+(phương án|đáp án)/i,
  /cả\s+(bốn|4)/i,
  /\b[A-D]\s*(và|,|hoặc)\s*[A-D]\b/,
];
export function refersToOthers(texts: readonly string[]): string | null {
  for (const t of texts) {
    const plain = t.replace(/\$[^$]*\$/g, ' ').replace(/\\[A-Za-z]+/g, ' ');
    if (REFS.some((re) => re.test(plain))) return 'phương án nhắc tới phương án khác (vd “cả A và B”)';
  }
  return null;
}

/** Tìm đúng một \choice{…}{…}{…}{…} ở ngoài lời giải và hình, có đúng 4 nhóm và đúng một \True. */
export function locateChoice(latex: string): ChoiceResult {
  const mask = blankComments(latex);
  const ex = excludedRanges(mask);
  const hits: number[] = [];
  const re = /\\choice(?![A-Za-z])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(mask))) if (!ex.some(([a, b]) => m!.index >= a && m!.index < b) && (m.index === 0 || mask[m.index - 1] !== '\\')) hits.push(m.index);
  if (hits.length === 0) return { ok: false, why: 'không có \\choice' };
  if (hits.length > 1) return { ok: false, why: 'có nhiều hơn một \\choice' };
  let p = hits[0] + '\\choice'.length;
  const q = skipWs(mask, p);
  if (mask[q] === '[') { const end = mask.indexOf(']', q); if (end < 0) return { ok: false, why: 'tham số [ ] của \\choice chưa đóng' }; p = end + 1; }
  const spans: [number, number][] = [];
  const texts: string[] = [];
  for (let k = 0; k < 4; k++) {
    const s = skipWs(mask, p);
    const g = readGroup(mask, s);
    if (!g) return { ok: false, why: `chỉ đọc được ${k} phương án` };
    spans.push([s, g[1]]);
    texts.push(mask.slice(s + 1, g[1] - 1));
    p = g[1];
  }
  const trues = texts.map((t) => (t.match(/\\True(?![A-Za-z])/g) ?? []).length);
  const total = trues.reduce((a, b) => a + b, 0);
  if (total !== 1) return { ok: false, why: total === 0 ? 'chưa đánh dấu \\True' : 'có nhiều hơn một \\True' };
  const ref = refersToOthers(texts);
  if (ref) return { ok: false, why: ref };
  return { ok: true, loc: { spans, correct: trues.findIndex((x) => x === 1) } };
}

/** Hoán vị nguyên văn các nhóm phương án. order[i] = chỉ số phương án gốc đặt ở vị trí i. Chỉ khoảng giữa các nhóm và mọi chữ ngoài \choice giữ nguyên. */
export function permuteChoice(latex: string, loc: ChoiceLoc, order: readonly number[]): string {
  const raw = loc.spans.map(([a, b]) => latex.slice(a, b));
  let out = '', at = 0;
  loc.spans.forEach(([a, b], i) => { out += latex.slice(at, a) + raw[order[i]]; at = b; });
  return out + latex.slice(at);
}

export const LETTERS = ['A', 'B', 'C', 'D'];

export interface Slot {
  q: Question;
  /** mã LaTeX dùng trong đề: nguyên văn, hoặc đã hoán vị phương án */
  latex: string;
  /** đáp án: chữ A–D, “ĐSĐS”, đáp số, hoặc — (tự luận) */
  key: string;
  shuffled: boolean;
  /** vì sao không trộn / không đọc được đáp án */
  note?: string;
}
export interface Variant { code: string; parts: Record<PartKey, Slot[]> }
export interface VariantOpts { count: number; firstCode: number; shuffleQuestions: boolean; shuffleOptions: boolean; seed: number; /** mã đầu giữ nguyên thứ tự và phương án gốc */ keepFirstOriginal: boolean }

function slotOf(q: Question, part: PartKey, rand: (() => number) | null): Slot {
  const parsed = parseExTest(q.latex);
  if (part === 'p1') {
    const loc = locateChoice(q.latex);
    if (!loc.ok) {
      const k = parsed.options.findIndex((x) => x.correct);
      return { q, latex: q.latex, key: k >= 0 && parsed.options.length === 4 ? LETTERS[k] : '?', shuffled: false, note: rand ? `không trộn phương án: ${loc.why}` : undefined };
    }
    const order = rand ? shuffle([0, 1, 2, 3], rand) : [0, 1, 2, 3];
    const moved = order.some((x, i) => x !== i);
    return { q, latex: moved ? permuteChoice(q.latex, loc.loc, order) : q.latex, key: LETTERS[order.indexOf(loc.loc.correct)], shuffled: moved };
  }
  if (part === 'p2') return { q, latex: q.latex, key: parsed.options.length === 4 ? parsed.options.map((o) => (o.correct ? 'Đ' : 'S')).join('') : '?', shuffled: false };
  if (part === 'p3') return { q, latex: q.latex, key: parsed.shortAnswer ?? '?', shuffled: false };
  return { q, latex: q.latex, key: '—', shuffled: false };
}

export function makeVariants(picked: Picked, o: VariantOpts): Variant[] {
  const out: Variant[] = [];
  for (let v = 0; v < o.count; v++) {
    const original = v === 0 && o.keepFirstOriginal;
    const rand = rng(o.seed + 7919 * (v + 1));
    const parts = { p1: [], p2: [], p3: [], p4: [] } as Record<PartKey, Slot[]>;
    for (const p of PARTS) {
      const list = !original && o.shuffleQuestions ? shuffle(picked[p], rand) : picked[p];
      parts[p] = list.map((q) => slotOf(q, p, !original && o.shuffleOptions ? rand : null));
    }
    out.push({ code: String(o.firstCode + v), parts });
  }
  return out;
}

export const countsOf = (p: Picked): Record<PartKey, number> => ({ p1: p.p1.length, p2: p.p2.length, p3: p.p3.length, p4: p.p4.length });

// ---------- Dựng tệp .tex ----------
export interface ExamInfo { dept: string; school: string; /** tổ/ghi chú dưới tên trường; có thể để trống */ group: string; title: string; subject: string; minutes: number; /** dòng dưới thời gian, vd “(Đề thi có 4 trang)”; có thể để trống */ note: string }
export interface ExamFile { path: string; text: string }

const esc = (s: string): string => s.replace(/([#$%&_{}])/g, '\\$1').replace(/\\(?![#$%&_{}])/g, '');
/** Tham số rỗng làm môi trường `name` báo “There's no line here to end”, nên chỗ trống phải là hộp rỗng. */
const arg = (s: string): string => (s.trim() ? esc(s.trim()) : '\\mbox{}');
const cmd = (name: string, n: number): string => `\\def\\${name}{${n}}`;

function chunk<T>(a: readonly T[], n: number): T[][] { const out: T[][] = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; }

/** Bảng đáp án của một mã đề: mỗi phần một bảng, tối đa 12 câu mỗi hàng (phần II tối đa 6). */
export function keyTex(v: Variant): string {
  const L: string[] = [`\\begin{center}\\fbox{\\large\\textbf{BẢNG ĐÁP ÁN · MÃ ĐỀ ${v.code}}}\\end{center}`];
  const names: Record<PartKey, string> = { p1: 'Phần I', p2: 'Phần II', p3: 'Phần III', p4: 'Phần IV' };
  for (const p of PARTS) {
    const keys = v.parts[p].map((s) => s.key);
    if (!keys.length || p === 'p4') continue;
    L.push(`\\noindent\\textbf{${names[p]}}\\par\\smallskip`);
    const per = p === 'p2' ? 6 : 12;
    chunk(keys.map((k, i) => [i + 1, k] as const), per).forEach((row) => {
      L.push(`\\noindent\\begin{tabular}{|c|${'c|'.repeat(row.length)}}\\hline`);
      L.push(`Câu & ${row.map((r) => r[0]).join(' & ')} \\\\ \\hline`);
      L.push(`Đáp án & ${row.map((r) => esc(r[1])).join(' & ')} \\\\ \\hline\\end{tabular}\\par\\smallskip`);
    });
  }
  return L.join('\n') + '\n';
}

/** Một mã đề: tiêu đề bằng môi trường `name` của khaibaochung, từng phần bằng \caulc/\cauds/\caukq/\cautl, câu chép nguyên văn. */
export function variantTex(info: ExamInfo, v: Variant): string {
  const n = (p: PartKey) => v.parts[p].length;
  const L: string[] = [
    `% Mã đề ${v.code} — do HEdu dựng từ Ngân hàng câu hỏi. Câu hỏi chép nguyên văn.`,
    `\\def\\made{${v.code}}`,
    cmd('socaulc', n('p1')), cmd('socauds', n('p2')), cmd('socaukq', n('p3')),
    `\\begin{name}{${arg(info.dept)}}{${arg(info.school)}}{${arg(info.group)}}{\\mbox{}}{${arg(info.title)}}{${arg(info.subject)}}{Thời gian làm bài: ${info.minutes} phút}{${arg(info.note)}}`,
    '\\end{name}',
  ];
  const head: Record<PartKey, string> = { p1: '\\caulc', p2: '\\cauds', p3: '\\caukq', p4: '\\cautl' };
  for (const p of PARTS) {
    if (!n(p)) continue;
    L.push('', head[p], '');
    L.push(v.parts[p].map((s) => s.latex.replace(/\s+$/, '')).join('\n\n'));
  }
  // Chân trang của khaibaochung in “Trang x/y” theo nhãn này.
  L.push('', '\\zlabel{\\made-lastpage}');
  return L.join('\n') + '\n';
}

export const variantFile = (code: string): string => `de-${code}.tex`;

/** Tệp thêm vào dự án (ngoài khaibaochung.tex và gói đi kèm do phía gọi cung cấp). */
export function examFiles(info: ExamInfo, variants: readonly Variant[], o: { withKeys: boolean }): ExamFile[] {
  const main: string[] = ['\\documentclass[12pt,a4paper,twoside]{book}', '\\input{khaibaochung}', '%\\anloigiai', '\\begin{document}'];
  variants.forEach((v, i) => { main.push(`\\input{${variantFile(v.code).replace(/\.tex$/, '')}}`, i < variants.length - 1 || o.withKeys ? '\\newpage' : ''); });
  if (o.withKeys) { main.push('\\input{dapan}'); }
  main.push('\\end{document}');
  const files: ExamFile[] = [{ path: 'main.tex', text: main.filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n') + '\n' }];
  for (const v of variants) files.push({ path: variantFile(v.code), text: variantTex(info, v) });
  if (o.withKeys) files.push({ path: 'dapan.tex', text: variants.map(keyTex).join('\\newpage\n') });
  return files;
}

/** Bản ghi để tái hiện đề: ma trận, hạt giống, câu được chọn và đáp án từng mã. */
export function specJson(o: { info: ExamInfo; rows: readonly Row[]; policy: Policy; seed: number; scoring: Scoring; variants: readonly Variant[]; at: string }): string {
  return JSON.stringify({
    v: 1, tao: o.at, thongTin: o.info, chinhSach: o.policy, hatGiong: o.seed, diem: o.scoring, matran: o.rows,
    maDe: o.variants.map((v) => ({ ma: v.code, phan: Object.fromEntries(PARTS.map((p) => [p, v.parts[p].map((s) => ({ uid: s.q.uid, dapAn: s.key, tron: s.shuffled }))])) })),
  }, null, 2) + '\n';
}
