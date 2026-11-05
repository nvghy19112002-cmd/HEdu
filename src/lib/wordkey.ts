// Đọc bảng đáp án trong tệp Word (cây Pandoc JSON) và gắn vào các câu đã nhập từ đề Word (thuần, có kiểm thử).
// Nhận ra ba kiểu bảng thường gặp: (A) trắc nghiệm: cột "Câu", "MÃ ĐỀ …"; (B) đúng/sai: mỗi mã chiếm 2+ cột, dòng "Câu n", rồi các ý Đ/S;
// (C) trả lời ngắn: dòng đầu "Câu 1, Câu 2…", mỗi dòng sau là một mã đề. Không đoán: bảng không khớp kiểu nào thì bỏ qua.
import type { WordQ } from './wordimport';

type Json = unknown;
interface Cell { text: string; span: number }

function inlineText(x: Json): string {
  if (Array.isArray(x)) return x.map(inlineText).join('');
  if (!x || typeof x !== 'object') return '';
  const o = x as { t?: string; c?: Json };
  switch (o.t) {
    case 'Str': return String(o.c ?? '');
    case 'Space': case 'SoftBreak': case 'LineBreak': return ' ';
    case 'Math': return Array.isArray(o.c) ? String(o.c[1] ?? '') : '';
    case 'Para': case 'Plain': case 'Strong': case 'Emph': case 'Underline': case 'Span': case 'Strikeout': case 'Superscript': case 'Subscript':
      return inlineText(o.t === 'Span' ? (o.c as Json[])[1] : o.c);
    case 'Div': return inlineText((o.c as Json[])[1]);
    default: return '';
  }
}

function rowsOfTable(t: Json[]): Cell[][] {
  // Table attr caption colspecs head bodies foot
  const rows: Cell[][] = [];
  const pushRows = (rs: Json) => {
    for (const r of (rs as Json[][]) ?? []) {
      const cells = (r[1] as Json[][]) ?? [];
      rows.push(cells.map((c) => ({ text: inlineText(c[4]).replace(/\s+/g, ' ').trim(), span: Number(c[3]) || 1 })));
    }
  };
  pushRows((t[3] as Json[])[1]);
  for (const b of (t[4] as Json[][]) ?? []) { pushRows(b[2]); pushRows(b[3]); }
  pushRows((t[5] as Json[])[1]);
  return rows.filter((r) => r.some((c) => c.text));
}

export interface AnswerKey { codes: string[]; tn: Record<string, string[]>; ds: Record<string, string[]>; tln: Record<string, string[]> }

const CODE_RE = /MÃ\s*ĐỀ\s*([0-9A-Za-z]+)/i;
const flat = (r: Cell[]): string[] => r.flatMap((c) => Array.from({ length: c.span }, () => c.text));

function tableBlocks(ast: Json): Json[][] {
  const out: Json[][] = [];
  const walk = (b: Json) => {
    if (!b || typeof b !== 'object') return;
    const o = b as { t?: string; c?: Json };
    if (o.t === 'Table') out.push(o.c as Json[]);
    else if (o.t === 'Div') ((o.c as Json[])[1] as Json[]).forEach(walk);
  };
  const blocks = (ast as { blocks?: Json[] }).blocks ?? [];
  blocks.forEach(walk);
  return out;
}

export function parseKey(ast: Json): AnswerKey {
  const key: AnswerKey = { codes: [], tn: {}, ds: {}, tln: {} };
  const addCode = (c: string) => { if (!key.codes.includes(c)) key.codes.push(c); };
  for (const t of tableBlocks(ast)) {
    const rows = rowsOfTable(t);
    if (rows.length < 2) continue;
    const r0 = rows[0];
    const codeCells = r0.filter((c) => CODE_RE.test(c.text));
    // (B) đúng/sai: mỗi mã chiếm nhiều cột
    if (codeCells.length >= 1 && codeCells.every((c) => c.span >= 2) && rows[1].some((c) => /^Câu\s*\d+/i.test(c.text))) {
      const head = flat(r0), sub = flat(rows[1]);
      const per: string[][] = [];
      for (let col = 0; col < sub.length; col++) {
        const code = CODE_RE.exec(head[col] ?? '')?.[1];
        const qn = /^Câu\s*(\d+)/i.exec(sub[col] ?? '')?.[1];
        if (!code || !qn) { per.push([]); continue; }
        addCode(code);
        const marks = rows.slice(2).map((r) => (flat(r)[col] ?? '').trim()).filter((x) => /^[ĐSDdsđ]$/.test(x)).map((x) => (/^[sS]$/.test(x) ? 'S' : 'Đ'));
        per.push(marks);
        (key.ds[code] ??= [])[Number(qn) - 1] = marks.join('');
      }
      continue;
    }
    // (A) trắc nghiệm
    if (codeCells.length >= 1 && /^Câu/i.test(r0[0]?.text ?? '')) {
      const head = flat(r0).map((h) => (/ĐỀ\s*GỐC/i.test(h) ? 'gốc' : CODE_RE.exec(h)?.[1] ?? ''));
      for (const r of rows.slice(1)) {
        const f = flat(r);
        const n = parseInt(f[0] ?? '', 10);
        if (!Number.isFinite(n)) continue;
        head.forEach((code, j) => {
          if (!code || j === 0) return;
          const m = /^[A-D]$/i.exec((f[j] ?? '').trim());
          if (!m) return;
          addCode(code);
          (key.tn[code] ??= [])[n - 1] = m[0].toUpperCase();
        });
      }
      continue;
    }
    // (C) trả lời ngắn
    if (rows.slice(1).some((r) => CODE_RE.test(r[0]?.text ?? '')) && r0.some((c) => /^Câu\s*\d+/i.test(c.text))) {
      const head = flat(r0);
      for (const r of rows.slice(1)) {
        const code = CODE_RE.exec(r[0]?.text ?? '')?.[1];
        if (!code) continue;
        addCode(code);
        const f = flat(r);
        head.forEach((h, j) => {
          const qn = /^Câu\s*(\d+)/i.exec(h)?.[1];
          if (qn && j > 0 && (f[j] ?? '').trim()) (key.tln[code] ??= [])[Number(qn) - 1] = f[j].trim();
        });
      }
    }
  }
  return key;
}

/** Gắn đáp án của một mã đề (hoặc 'gốc') vào các câu theo THỨ TỰ trong từng loại. Trả về số câu đã gắn. */
export function applyKey(qs: WordQ[], key: AnswerKey, code: string): number {
  let n = 0;
  const nth: Record<string, number> = { tn: 0, ds: 0, tln: 0, tl: 0 };
  for (const q of qs) {
    const i = nth[q.type]++;
    if (q.type === 'tn') {
      const a = key.tn[code]?.[i];
      if (a) { q.correct = 'ABCD'.indexOf(a); n++; q.issues = q.issues.filter((s) => !s.startsWith('Nhiều phương án')); }
    } else if (q.type === 'ds') {
      const a = key.ds[code]?.[i];
      if (a && a.length === 4) { q.tfTrue = a.split('').map((c) => c === 'Đ'); n++; }
    } else if (q.type === 'tln') {
      const a = key.tln[code]?.[i];
      if (a) { q.answer = a; n++; }
    }
  }
  return n;
}
