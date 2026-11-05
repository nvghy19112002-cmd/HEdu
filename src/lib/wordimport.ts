// Từ LaTeX thô do Pandoc dựng từ tệp Word (xem src-tauri/src/wordimport.rs) sang các khối \begin{ex} của ex_test (thuần, có kiểm thử).
// Nhận ra: "PHẦN …" (loại câu), "Câu N.", phương án A. B. C. D. (gạch chân = đáp án đúng), ý a) b) c) d) của câu đúng/sai,
// "Lời giải". Điều không chắc chắn thì KHÔNG đoán: để trống và ghi vào báo cáo cho thầy/cô xem.

export type WType = 'tn' | 'ds' | 'tln' | 'tl';
export interface WordQ {
  n: number;
  type: WType;
  stem: string;
  options: string[];
  /** chỉ số phương án đúng (0–3) nếu có gạch chân; -1 nếu không biết */
  correct: number;
  tf: string[];
  /** ý đúng của câu đúng/sai (theo gạch chân); rỗng nếu không có dấu nào */
  tfTrue: boolean[];
  solution: string;
  /** đáp án câu trả lời ngắn (nếu có) */
  answer?: string;
  issues: string[];
}
export interface WordConv {
  questions: WordQ[];
  tex: string;
  preface: string;
  stats: { total: number; byType: Record<WType, number>; noAnswer: number; images: number; withSolution: number; unknownType: number };
}

const HINT_RE: [RegExp, WType][] = [
  [/nhiều\s+phương\s+án/i, 'tn'], [/đúng\s*(?:hoặc\s*)?sai/i, 'ds'], [/trả\s+lời\s+ngắn/i, 'tln'], [/tự\s+luận/i, 'tl'],
];

function clean(src: string): string {
  return src.replace(/\r\n?/g, '\n')
    .replace(/\\begin\{quote\}\s*/g, '').replace(/\s*\\end\{quote\}/g, '')
    .replace(/\\def\\labelenum[iv]+\{[^}]*\}/g, '')
    .replace(/\\tightlist\s*/g, '')
    .replace(/\\begin\{figure\}\s*|\s*\\end\{figure\}|\\centering\s*|\\caption\{\}\s*/g, '')
    .replace(/\n{3,}/g, '\n\n');
}

interface Marker { letter: string; start: number; contentStart: number; under: boolean }

/** Tìm dấu A. B. C. D. (hoặc a) b) c) d)) liên tiếp đúng thứ tự gần cuối đoạn nhất. */
function findChain(text: string, letters: string[], re: RegExp): Marker[] | null {
  const all: Marker[] = [];
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    const pre = m[1] ?? '';
    const lead = text.slice(Math.max(0, idx - 0), idx);
    void lead;
    const prefix = m[2] ?? '';
    const start = idx + pre.length;
    all.push({ letter: m[3], start, contentStart: idx + m[0].length, under: /underline/.test(prefix) });
  }
  // chuỗi dài nhất kết thúc ở D/d, bắt đầu muộn nhất có thể
  for (let a = all.length - 1; a >= 0; a--) {
    if (all[a].letter !== letters[0]) continue;
    const chain: Marker[] = [all[a]];
    for (let k = 1; k < letters.length; k++) {
      const nx = all.slice(a + 1).find((x) => x.letter === letters[k] && x.start > chain[chain.length - 1].start);
      if (!nx) break;
      chain.push(nx);
    }
    if (chain.length === letters.length) return chain;
  }
  return null;
}

const OPT_RE = /(^|[\s{])((?:\\(?:textbf|underline|emph|textit)\{)*)([ABCD])\s*\.(?:\}*)(?=[\s$\\]|$)/gm;
const TF_RE = /(^|[\s{])((?:\\(?:textbf|underline|emph|textit)\{)*)([abcd])\s*\)(?:\}*)(?=[\s$\\]|$)/gm;

function trimOpt(s: string): string {
  return s.replace(/\\\\\s*$/g, '').replace(/[\t ]+/g, ' ').trim().replace(/\$\.$/, '$').replace(/^\s*\\\\\s*/, '').trim();
}

function splitSolution(paras: string[]): { body: string[]; sol: string[] } {
  const i = paras.findIndex((p) => /^(?:\\textbf\{|\\emph\{|\\underline\{)*\s*(?:Lời\s*giải|Hướng\s*dẫn(?:\s*giải)?|HDG|Giải)\b/i.test(p.trim()));
  return i < 0 ? { body: paras, sol: [] } : { body: paras.slice(0, i), sol: paras.slice(i) };
}

function stripLabel(p: string): string {
  return p.replace(/^(?:\\textbf\{|\\emph\{|\\underline\{)*\s*(?:Lời\s*giải|Hướng\s*dẫn(?:\s*giải)?|HDG|Giải)\s*[.:]?\s*\}*[.:]?\s*/i, '');
}

function parseOne(n: number, label: string, paras: string[], hint: WType | null): WordQ {
  const q: WordQ = { n, type: 'tl', stem: '', options: [], correct: -1, tf: [], tfTrue: [], solution: '', issues: [] };
  const { body, sol } = splitSolution(paras);
  q.solution = sol.length ? [stripLabel(sol[0]), ...sol.slice(1)].filter((x) => x.trim()).join('\n\n') : '';
  let text = body.join('\n\n').trim();
  void label;
  // câu đúng/sai viết bằng danh sách enumerate: \item a), b), …
  const en = /\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/.exec(text);
  const enItems = en ? en[1].split(/\\item/).slice(1).map((x) => x.trim()).filter(Boolean) : [];
  const opt = findChain(text, ['A', 'B', 'C', 'D'], OPT_RE);
  if (opt) {
    q.type = 'tn';
    q.stem = text.slice(0, opt[0].start).trim();
    q.options = opt.map((m, i) => trimOpt(text.slice(m.contentStart, i + 1 < opt.length ? opt[i + 1].start : undefined)));
    const u = opt.map((m) => m.under);
    q.correct = u.filter(Boolean).length === 1 ? u.indexOf(true) : -1;
    if (u.filter(Boolean).length > 1) q.issues.push('Nhiều phương án bị gạch chân: chưa biết đáp án.');
    return q;
  }
  if (enItems.length === 4 && (hint === 'ds' || !hint)) {
    q.type = 'ds';
    q.stem = text.slice(0, en!.index).trim();
    q.tf = enItems.map(trimOpt);
    q.tfTrue = enItems.map(() => false);
    return q;
  }
  const tf = findChain(text, ['a', 'b', 'c', 'd'], TF_RE);
  if (tf) {
    q.type = 'ds';
    q.stem = text.slice(0, tf[0].start).trim();
    q.tf = tf.map((m, i) => trimOpt(text.slice(m.contentStart, i + 1 < tf.length ? tf[i + 1].start : undefined)));
    q.tfTrue = tf.map((m) => m.under);
    return q;
  }
  q.stem = text;
  q.type = hint === 'tln' ? 'tln' : 'tl';
  if (!hint) q.issues.push('Không rõ loại câu (không có phương án A–D hay ý a–d): để dạng tự luận.');
  return q;
}

/** Nhãn đầu câu: "\textbf{Câu 3.}", "\textbf{Câu 21 (1,0 điểm)}", "Câu 5:" … Trả về số câu và phần còn lại sau nhãn. */
function parseLabel(t: string): { n: number; rest: string } | null {
  let s = t.trim();
  let wrap = false;
  const w = /^\\(?:textbf|emph|underline)\{/.exec(s);
  if (w) {
    // tìm dấu } đóng tương ứng
    let depth = 0, end = -1;
    for (let i = w[0].length - 1; i < s.length; i++) {
      const c = s[i];
      if (c === '\\') { i++; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end > 0) {
      const inner = s.slice(w[0].length, end);
      const m = /^\s*Câu\s*(\d+)\b/i.exec(inner);
      if (m) { wrap = true; s = s.slice(end + 1); return finishLabel(Number(m[1]), s); }
    }
  }
  void wrap;
  const m = /^Câu\s*(\d+)\s*[.:)]?\s*/i.exec(s);
  return m ? { n: Number(m[1]), rest: s.slice(m[0].length) } : null;
}

function finishLabel(n: number, after: string): { n: number; rest: string } {
  // dấu "." hay ":" có thể nằm trong khối in đậm riêng: \textbf{.}
  const rest = after.replace(/^\s*(?:\\textbf\{[.:)]\}|[.:)])\s*/, '');
  return { n, rest: rest.replace(/^\s+/, '') };
}

export function parseWord(latex: string): { questions: WordQ[]; preface: string } {
  const text = clean(latex);
  const paras = text.split(/\n\s*\n/);
  const out: WordQ[] = [];
  let hint: WType | null = null;
  let cur: { n: number; label: string; paras: string[]; hint: WType | null } | null = null;
  const preface: string[] = [];
  const flush = () => { if (cur) out.push(parseOne(cur.n, cur.label, cur.paras, cur.hint)); cur = null; };
  for (const p of paras) {
    const t = p.trim();
    if (!t) continue;
    const lm = parseLabel(t);
    if (lm) {
      flush();
      cur = { n: lm.n, label: '', paras: [lm.rest], hint };
      continue;
    }
    if (/^(?:\\textbf\{)?\s*PHẦN\b/i.test(t)) {
      flush();
      const h = HINT_RE.find(([re]) => re.test(t));
      if (h) hint = h[1]; else if (/PHẦN\s+[A-Z]\b/i.test(t) && /tự\s+luận/i.test(t)) hint = 'tl';
      continue;
    }
    if (t.length < 80 && /HẾT/.test(t) && !/[$a-z]/.test(t.replace(/\\textbf|HẾT/g, ''))) { flush(); continue; }
    if (cur) cur.paras.push(t); else preface.push(t);
  }
  flush();
  return { questions: out, preface: preface.join('\n\n') };
}

const tfKey = (q: WordQ) => q.tfTrue.some(Boolean) ? q.tfTrue : null;

export function toExTest(q: WordQ): string {
  const ind = (s: string) => s.split('\n').map((l) => (l.trim() ? '  ' + l : l)).join('\n');
  let b = '\\begin{ex}\n' + ind(q.stem || '(chưa có đề)') + '\n';
  if (q.type === 'tn') {
    b += '  \\choice\n' + q.options.map((o, i) => `  {${i === q.correct ? '\\True ' : ''}${o}}`).join('\n') + '\n';
  } else if (q.type === 'ds') {
    const k = tfKey(q);
    b += '  \\choiceTF\n' + q.tf.map((o, i) => `  {${k && k[i] ? '\\True ' : ''}${o}}`).join('\n') + '\n';
  } else if (q.type === 'tln') {
    b += `  \\shortans{${q.answer ?? ''}}\n`;
  }
  if (q.solution.trim()) b += '  \\loigiai{\n' + ind(q.solution.trim()) + '\n  }\n';
  return b + '\\end{ex}\n';
}

export function convertWord(latex: string): WordConv {
  const { questions, preface } = parseWord(latex);
  const byType: Record<WType, number> = { tn: 0, ds: 0, tln: 0, tl: 0 };
  let noAnswer = 0, images = 0, withSolution = 0, unknownType = 0;
  for (const q of questions) {
    byType[q.type]++;
    if (q.type === 'tn' && q.correct < 0) noAnswer++;
    if (q.type === 'ds' && !q.tfTrue.some(Boolean)) noAnswer++;
    if (q.type === 'tln' && !q.answer) noAnswer++;
    if (q.solution.trim()) withSolution++;
    if (q.issues.some((s) => s.startsWith('Không rõ loại'))) unknownType++;
    images += (q.stem + q.options.join('') + q.tf.join('') + q.solution).split('\\includegraphics').length - 1;
  }
  return { questions, preface, tex: questions.map(toExTest).join('\n'), stats: { total: questions.length, byType, noAnswer, images, withSolution, unknownType } };
}
