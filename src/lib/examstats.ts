// Thống kê sau thi (thuần, có kiểm thử): từ đáp án của một mã đề và bài làm của học sinh (dán từ Excel) tính điểm từng học sinh, và với từng câu:
// tỉ lệ làm đúng (độ khó), độ phân biệt (nhóm 27% cao − 27% thấp), tương quan câu–tổng điểm, phân bố lựa chọn; kèm tổng hợp cả lớp.
// Điểm theo thang lưu trong đề (diemToiDaMoiCau): TN đúng = p1; trả lời ngắn đúng = p3; Đúng/Sai: số ý đúng 0–4 → 0 / 0,1 / 0,25 / 0,5 / 1 của p2.

export type Part = 'p1' | 'p2' | 'p3' | 'p4';
export interface KeyItem { /** nhãn câu, vd "I.3" */ q: string; part: Part; key: string }
export type Scoring = Record<Part, number>; // đơn vị 1/100 điểm mỗi câu

export interface PasteRow { name: string; answers: string[] }
export interface Parsed { rows: PasteRow[]; header: string[] | null; extraCols: number }

export const DS_CENTI = [0, 10, 25, 50, 100] as const;

const TOKEN = /^(?:[A-Da-d]|[ĐSĐđsdtfTF01]{4}|-?\d+(?:[.,]\d+)?)?$/;

/** Đọc bảng dán từ Excel (tab) hoặc CSV (phẩy/chấm phẩy). Cột đầu = tên/số báo danh, các cột sau = đáp án từng câu theo thứ tự đề. */
export function parsePaste(text: string, nItems: number, hasHeader?: boolean): Parsed {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim() !== '');
  const split = (l: string) => (l.includes('\t') ? l.split('\t') : l.includes(';') ? l.split(';') : l.split(',')).map((c) => c.trim().replace(/^"|"$/g, ''));
  const cells = lines.map(split);
  if (!cells.length) return { rows: [], header: null, extraCols: 0 };
  const first = cells[0].slice(1);
  const auto = first.length > 0 && !first.every((c) => TOKEN.test(c));
  const head = hasHeader ?? auto;
  const header = head ? cells[0] : null;
  const body = head ? cells.slice(1) : cells;
  let extra = 0;
  const rows = body.map((c, i) => {
    const answers = c.slice(1, 1 + nItems);
    extra = Math.max(extra, c.length - 1 - nItems);
    while (answers.length < nItems) answers.push('');
    return { name: c[0] || `HS ${i + 1}`, answers };
  });
  return { rows, header, extraCols: Math.max(0, extra) };
}

const norm = (s: string) => s.trim().toUpperCase().replace(/Đ/g, 'D');
const num = (s: string): number | null => { const n = parseFloat(s.trim().replace(',', '.')); return Number.isFinite(n) ? n : null; };
const tf = (c: string): string => (/[DT1]/.test(c.toUpperCase().replace('Đ', 'D')) ? 'D' : 'S');

/** Điểm của một học sinh ở một câu (đơn vị điểm, đã nhân thang) và mức "đúng" 0..1 (với Đ/S là phần ý đúng). */
export function scoreItem(it: KeyItem, ans: string, sc: Scoring): { pts: number; frac: number } {
  const a = ans.trim();
  if (!a) return { pts: 0, frac: 0 };
  if (it.part === 'p1') { const ok = norm(a) === norm(it.key); return { pts: ok ? sc.p1 / 100 : 0, frac: ok ? 1 : 0 }; }
  if (it.part === 'p3') {
    const x = num(a), y = num(it.key);
    const ok = x !== null && y !== null ? Math.abs(x - y) < 1e-9 : norm(a) === norm(it.key);
    return { pts: ok ? sc.p3 / 100 : 0, frac: ok ? 1 : 0 };
  }
  if (it.part === 'p2') {
    const k = it.key.replace(/\s+/g, ''), s = a.replace(/\s+/g, '');
    if (k.length !== 4 || s.length !== 4) return { pts: 0, frac: 0 };
    let right = 0;
    for (let i = 0; i < 4; i++) if (tf(s[i]) === tf(k[i])) right++;
    return { pts: (DS_CENTI[right] / 100) * (sc.p2 / 100), frac: right / 4 };
  }
  return { pts: 0, frac: 0 };
}

export const maxPts = (it: KeyItem, sc: Scoring): number => (it.part === 'p1' ? sc.p1 : it.part === 'p2' ? sc.p2 : it.part === 'p3' ? sc.p3 : sc.p4) / 100;

export interface ItemStat {
  q: string; part: Part; key: string;
  /** tỉ lệ điểm đạt được / điểm tối đa của câu (0..1) */
  p: number;
  /** số học sinh làm đúng hoàn toàn */
  fullCorrect: number;
  /** độ phân biệt = tỉ lệ của nhóm cao − nhóm thấp (27%), null nếu lớp quá nhỏ */
  d: number | null;
  /** tương quan giữa điểm câu và tổng điểm các câu còn lại (null nếu không tính được) */
  r: number | null;
  /** phân bố lựa chọn (TN: A–D; khác: số làm đúng/sai) và số bỏ trống */
  options: Record<string, number>;
  blank: number;
  flags: ('kho' | 'de' | 'phan-biet-kem' | 'dap-an-ngo')[];
}
export interface StudentStat { name: string; score: number; max: number; correct: number }
export interface Analysis {
  students: StudentStat[];
  items: ItemStat[];
  summary: { n: number; mean: number; sd: number; min: number; max: number; median: number; maxPossible: number; kr20: number | null };
  /** số học sinh theo điểm quy về thang 10: [0-1), [1-2), … [9-10] */
  histogram: number[];
}

const mean = (a: readonly number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const sd = (a: readonly number[]) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
function corr(x: readonly number[], y: readonly number[]): number | null {
  const n = x.length;
  if (n < 3) return null;
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

export function analyze(items: readonly KeyItem[], sc: Scoring, rows: readonly PasteRow[]): Analysis {
  const n = rows.length;
  const per = rows.map((r) => items.map((it, k) => scoreItem(it, r.answers[k] ?? '', sc)));
  const totals = per.map((p) => p.reduce((s, x) => s + x.pts, 0));
  const maxPossible = items.reduce((s, it) => s + maxPts(it, sc), 0);
  const students: StudentStat[] = rows.map((r, i) => ({ name: r.name, score: Math.round(totals[i] * 100) / 100, max: maxPossible, correct: per[i].filter((x) => x.frac === 1).length }));
  // nhóm cao / thấp 27%
  const order = totals.map((t, i) => [t, i] as const).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  const g = Math.max(1, Math.round(n * 0.27));
  const upper = n >= 10 ? order.slice(0, g) : [], lower = n >= 10 ? order.slice(n - g) : [];
  const stats: ItemStat[] = items.map((it, k) => {
    const mx = maxPts(it, sc) || 1;
    const fr = per.map((p) => p[k].pts / mx);
    const p = n ? mean(fr) : 0;
    const d = upper.length ? mean(upper.map((i) => fr[i])) - mean(lower.map((i) => fr[i])) : null;
    const rest = totals.map((t, i) => t - per[i][k].pts);
    const r = corr(per.map((x) => x[k].pts), rest);
    const options: Record<string, number> = {};
    let blank = 0;
    rows.forEach((row, i) => {
      const a = (row.answers[k] ?? '').trim();
      if (!a) { blank++; return; }
      const label = it.part === 'p1' ? norm(a) : per[i][k].frac === 1 ? 'đúng' : 'sai';
      options[label] = (options[label] ?? 0) + 1;
    });
    const flags: ItemStat['flags'] = [];
    if (n >= 5) {
      if (p < 0.2) flags.push('kho'); else if (p > 0.9) flags.push('de');
      if (d !== null && d < 0.2) flags.push('phan-biet-kem');
      if (it.part === 'p1') { const keyN = options[norm(it.key)] ?? 0; const most = Math.max(0, ...Object.entries(options).filter(([o]) => o !== norm(it.key)).map(([, c]) => c)); if (most > keyN && n >= 10) flags.push('dap-an-ngo'); }
    }
    return { q: it.q, part: it.part, key: it.key, p: Math.round(p * 1000) / 1000, fullCorrect: per.filter((x) => x[k].frac === 1).length, d: d === null ? null : Math.round(d * 1000) / 1000, r: r === null ? null : Math.round(r * 1000) / 1000, options, blank, flags };
  });
  // KR-20 xấp xỉ cho đề nhiều điểm: dùng công thức Cronbach alpha trên điểm từng câu
  let kr20: number | null = null;
  if (n >= 3 && items.length >= 2 && sd(totals) > 0) {
    const k = items.length;
    const sumVar = items.reduce((s, _it, j) => s + sd(per.map((p) => p[j].pts)) ** 2, 0);
    kr20 = (k / (k - 1)) * (1 - sumVar / sd(totals) ** 2);
  }
  const sorted = [...totals].sort((a, b) => a - b);
  const median = n ? (n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2) : 0;
  const hist = new Array(10).fill(0);
  totals.forEach((t) => { const s10 = maxPossible ? (t / maxPossible) * 10 : 0; hist[Math.min(9, Math.max(0, Math.floor(s10)))]++; });
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    students, items: stats, histogram: hist,
    summary: { n, mean: r2(mean(totals)), sd: r2(sd(totals)), min: r2(n ? sorted[0] : 0), max: r2(n ? sorted[n - 1] : 0), median: r2(median), maxPossible: r2(maxPossible), kr20: kr20 === null ? null : Math.round(kr20 * 1000) / 1000 },
  };
}

export const FLAG_VI: Record<ItemStat['flags'][number], string> = {
  kho: 'Câu khó (dưới 20% làm đúng)', de: 'Câu dễ (trên 90% làm đúng)',
  'phan-biet-kem': 'Phân biệt kém (nhóm cao không hơn nhóm thấp bao nhiêu)', 'dap-an-ngo': 'Có phương án sai được chọn nhiều hơn đáp án đúng: kiểm lại đáp án hoặc đề',
};
