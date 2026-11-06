// Ma trận đề ra Excel (hàm thuần): đọc hedu-de.json do "Tạo đề" ghi, dựng bảng Chương × Bài/Dạng × Loại câu × Mức độ + trang liệt kê câu.
// Điểm lấy đúng từ `diemToiDaMoiCau` của đề (đơn vị 1/100 điểm); không tự đoán thang điểm.
import { POLICY_LABEL, PARTS, PART_NAME, type PartKey, type Policy } from './examgen';
import { LEVELS, TYPE_LABEL, type Level, type Question, type QType, type Taxonomy } from './types';
import { specSheet } from './examspec';
import { cellNum, cellText, S_BODY, S_BOLD, S_HEAD, S_LEFT, S_SUM, S_SUML, S_TITLE, type XBook, type XCell, type XSheet } from './xlsxbook';

export interface MatrixRow { scope: { kind: string; id: string }; type: QType; level: Level | 'any'; count: number; label?: string; flag?: string }
export interface MatrixSpec {
  title: string; policy: Policy | null; seed: number | null; scoring: Record<PartKey, number>;
  rows: MatrixRow[];
  /** mã đề đầu tiên: phần → [{uid, đáp án}] */
  firstCode: { code: string; parts: Record<PartKey, { uid: string; key: string }[]> } | null;
  codes: number;
  /** từng mã đề: số câu, uid (để kiểm trùng/thiếu) và số câu thiếu đáp án */
  perCode: { code: string; n: number; uids: string[]; noKey: number; /** đáp án theo thứ tự đề (phần I→IV) */ items: { part: PartKey; uid: string; key: string }[] }[];
}
export interface MatrixMeta { name: string; grade?: number | null; schoolYear?: string | null; examType?: string | null }

const PART_OF: Record<QType, PartKey> = { tn: 'p1', ds: 'p2', tln: 'p3', tl: 'p4' };
const TYPE_ORDER: QType[] = ['tn', 'ds', 'tln', 'tl'];
const ROMAN = ['I', 'II', 'III', 'IV'];

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Đọc hedu-de.json; sai cấu trúc ⇒ null (đề không có ma trận để xuất). */
export function parseMatrixSpec(text: string): MatrixSpec | null {
  let j: Record<string, unknown>;
  try { j = obj(JSON.parse(text)); } catch { return null; }
  if (j.v !== 1 || !Array.isArray(j.matran)) return null;
  const rows: MatrixRow[] = [];
  for (const r of j.matran) {
    const o = obj(r), sc = obj(o.scope), c = num(o.count);
    if (typeof sc.kind !== 'string' || typeof sc.id !== 'string' || typeof o.type !== 'string' || !(o.type in PART_OF) || c === null || c <= 0) continue;
    rows.push({ scope: { kind: sc.kind, id: sc.id }, type: o.type as QType, level: o.level === 'any' ? 'any' : (LEVELS as string[]).includes(o.level as string) ? (o.level as Level) : 'any', count: c, label: typeof o.label === 'string' ? o.label : undefined, flag: typeof o.flag === 'string' ? o.flag : undefined });
  }
  const sc = obj(j.diemToiDaMoiCau);
  const scoring = { p1: num(sc.p1) ?? 25, p2: num(sc.p2) ?? 100, p3: num(sc.p3) ?? 50, p4: num(sc.p4) ?? 100 };
  const md = Array.isArray(j.maDe) ? j.maDe : [];
  const f = obj(md[0]);
  const parts = { p1: [], p2: [], p3: [], p4: [] } as Record<PartKey, { uid: string; key: string }[]>;
  for (const p of PARTS) for (const s of Array.isArray(obj(f.phan)[p]) ? (obj(f.phan)[p] as unknown[]) : []) { const o = obj(s); if (typeof o.uid === 'string') parts[p].push({ uid: o.uid, key: typeof o.dapAn === 'string' ? o.dapAn : '' }); }
  const perCode = md.map((m) => {
    const o = obj(m), ph = obj(o.phan);
    const typed = PARTS.flatMap((p) => (Array.isArray(ph[p]) ? (ph[p] as unknown[]) : []).map((s) => ({ part: p, s: obj(s) })));
    const items = typed.map((x) => x.s);
    return {
      code: typeof o.ma === 'string' ? o.ma : '', n: items.length, uids: items.map((s) => (typeof s.uid === 'string' ? s.uid : '')), noKey: items.filter((s) => typeof s.dapAn !== 'string' || !s.dapAn.trim()).length,
      items: typed.map((x) => ({ part: x.part, uid: typeof x.s.uid === 'string' ? x.s.uid : '', key: typeof x.s.dapAn === 'string' ? x.s.dapAn : '' })),
    };
  });
  const pol = j.chinhSach;
  return {
    title: typeof obj(j.thongTin).title === 'string' ? (obj(j.thongTin).title as string) : '',
    policy: pol === 'duyet' || pol === 'xac-minh' || pol === 'tat-ca' ? pol : null,
    seed: num(j.hatGiong), scoring, rows,
    firstCode: md.length ? { code: typeof f.ma === 'string' ? f.ma : '', parts } : null,
    codes: md.length, perCode,
  };
}

/** Chương và nội dung của một dòng ma trận, theo khung chương trình. */
export function rowPlace(r: MatrixRow, tax: Taxonomy): { chapter: string; item: string } {
  for (const g of tax.grades) for (const b of g.branches) for (const c of b.chapters) {
    if (r.scope.kind === 'chapter' && c.id === r.scope.id) return { chapter: c.name, item: 'Cả chương' };
    for (const l of c.lessons) {
      if (r.scope.kind === 'lesson' && l.id === r.scope.id) return { chapter: c.name, item: l.name };
      for (const f of l.forms) if (r.scope.kind === 'form' && f.id === r.scope.id) return { chapter: c.name, item: `${l.name} › ${f.name}` };
    }
  }
  if (r.scope.kind === 'grade') { const g = tax.grades.find((x) => String(x.grade) === r.scope.id); return { chapter: g?.name ?? `Lớp ${r.scope.id}`, item: 'Cả lớp' }; }
  return { chapter: r.label ?? '(không còn trong khung chương trình)', item: r.label ?? r.scope.id };
}

const fmt = (n: number): string => (Math.round(n * 100) / 100).toString().replace('.', ',');
const roundTo = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/** Sổ Excel "Ma trận đề": trang 1 = ma trận, trang 2 = câu trong mã đề đầu tiên. */
export function matrixBook(spec: MatrixSpec, meta: MatrixMeta, tax: Taxonomy, question: (uid: string) => Question | undefined): XBook {
  const types = TYPE_ORDER.filter((t) => spec.rows.some((r) => r.type === t));
  const anyLevel = spec.rows.some((r) => r.level === 'any');
  const levels: (Level | 'any')[] = [...LEVELS, ...(anyLevel ? (['any'] as const) : [])];
  const lvLabel = (l: Level | 'any') => (l === 'any' ? 'Chung' : l);
  const per = levels.length;
  const nCols = 3 + types.length * per + 3;

  // gom theo (chương, nội dung), giữ thứ tự xuất hiện
  const groups = new Map<string, { chapter: string; item: string; cnt: Map<string, number>; pts: number }>();
  for (const r of spec.rows) {
    const p = rowPlace(r, tax), k = `${p.chapter}\u0000${p.item}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { ...p, cnt: new Map(), pts: 0 }));
    g.cnt.set(`${r.type}|${r.level}`, (g.cnt.get(`${r.type}|${r.level}`) ?? 0) + r.count);
    g.pts += (r.count * spec.scoring[PART_OF[r.type]]) / 100;
  }
  const list = [...groups.values()]; // giữ thứ tự xuất hiện trong ma trận
  const totalQ = spec.rows.reduce((a, r) => a + r.count, 0);
  const totalPts = list.reduce((a, g) => a + g.pts, 0);

  const rows: XCell[][] = [];
  const blank = (n: number): XCell[] => Array.from({ length: n }, () => ({}));
  const info: [string, string][] = [
    ['Tên đề', meta.name || spec.title],
    ['Lớp / Năm học', [meta.grade ? `Lớp ${meta.grade}` : null, meta.schoolYear].filter(Boolean).join(' · ') || '—'],
    ['Loại đề', meta.examType || '—'],
    ['Tổng số câu / điểm', `${totalQ} câu · ${fmt(totalPts)} điểm`],
    ['Chính sách lấy câu', spec.policy ? POLICY_LABEL[spec.policy] : '—'],
    ['Hạt giống', spec.seed === null ? '—' : String(spec.seed)],
  ];
  rows.push([{ v: 'MA TRẬN ĐỀ KIỂM TRA', s: S_TITLE }]);
  for (const [k, v] of info) rows.push([{ v: k, s: S_BOLD }, {}, { v }]);
  rows.push([]);
  const H = rows.length; // hàng đầu bảng (từ 0)
  const merges: XSheet['merges'] = [];
  const h1: XCell[] = [cellText('STT', S_HEAD), cellText('Chương', S_HEAD), cellText('Bài / Dạng', S_HEAD)];
  const h2: XCell[] = [cellText('', S_HEAD), cellText('', S_HEAD), cellText('', S_HEAD)];
  for (let c = 0; c < 3; c++) merges.push([H, c, H + 1, c]);
  types.forEach((t, ti) => {
    const c0 = 3 + ti * per;
    h1.push(cellText(TYPE_LABEL[t], S_HEAD), ...Array.from({ length: per - 1 }, () => cellText('', S_HEAD)));
    merges.push([H, c0, H, c0 + per - 1]);
    for (const l of levels) h2.push(cellText(lvLabel(l), S_HEAD));
  });
  for (const t of ['Tổng câu', 'Điểm', 'Tỉ lệ %']) { const c = h1.length; h1.push(cellText(t, S_HEAD)); h2.push(cellText('', S_HEAD)); merges.push([H, c, H + 1, c]); }
  rows.push(h1, h2);

  const colSum = new Array(types.length * per).fill(0) as number[];
  list.forEach((g, i) => {
    const row: XCell[] = [cellNum(i + 1), cellText(g.chapter, S_LEFT), cellText(g.item, S_LEFT)];
    let n = 0;
    types.forEach((t, ti) => levels.forEach((l, li) => { const v = g.cnt.get(`${t}|${l}`) ?? 0; n += v; colSum[ti * per + li] += v; row.push(v ? cellNum(v) : cellText('', S_BODY)); }));
    row.push({ n, s: S_SUM }, cellNum(roundTo(g.pts, 2)), cellNum(totalPts ? roundTo((g.pts / totalPts) * 100, 1) : 0));
    rows.push(row);
  });
  const sumRow: XCell[] = [cellText('Cộng', S_SUM), cellText('', S_SUM), cellText('', S_SUM)];
  merges.push([rows.length, 0, rows.length, 2]);
  for (const v of colSum) sumRow.push(v ? { n: v, s: S_SUM } : cellText('', S_SUM));
  sumRow.push({ n: totalQ, s: S_SUM }, { n: roundTo(totalPts, 2), s: S_SUM }, { n: totalPts ? 100 : 0, s: S_SUM });
  rows.push(sumRow);

  // tỉ lệ theo mức độ (theo số câu, cộng mọi loại)
  const pctRow: XCell[] = [cellText('Tỉ lệ theo mức độ (%)', S_SUML), cellText('', S_SUML), cellText('', S_SUML), ...blank(nCols - 3)];
  merges.push([rows.length, 0, rows.length, 2]);
  const span = types.length;
  levels.forEach((l, li) => {
    const n = types.reduce((a, _t, ti) => a + colSum[ti * per + li], 0);
    if (!n && l === 'any') return;
    const c0 = 3 + li * span;
    pctRow[c0] = cellText(`${lvLabel(l)}: ${totalQ ? roundTo((n / totalQ) * 100, 1).toString().replace('.', ',') : 0}%`, S_SUM);
    for (let k = 1; k < span; k++) pctRow[c0 + k] = cellText('', S_SUM);
    if (span > 1) merges.push([rows.length, c0, rows.length, c0 + span - 1]);
  });
  rows.push(pctRow);
  const dsNote = types.includes('ds') ? 'Đúng/Sai: điểm tối đa mỗi câu (chấm theo số ý đúng).' : '';
  rows.push([], [{ v: `Thang điểm mỗi câu: ${types.map((t) => `${TYPE_LABEL[t]} ${fmt(spec.scoring[PART_OF[t]] / 100)}`).join(' · ')}. ${dsNote}`.trim() }]);

  const m1: XSheet = {
    name: 'Ma trận đề', rows, merges,
    widths: [5, 30, 38, ...Array.from({ length: types.length * per }, () => 6.5), 9, 8, 9],
    freeze: [H + 2, 3], landscape: true,
  };

  // trang 2: câu trong mã đề đầu tiên
  const qrows: XCell[][] = [['Câu', 'Phần', 'Loại', 'Mức độ', 'Chương', 'Bài / Dạng', 'Mã câu (UID)', `Đáp án (mã ${spec.firstCode?.code ?? ''})`.replace(' )', ')')].map((h) => cellText(h, S_HEAD))];
  if (spec.firstCode) {
    PARTS.forEach((p, pi) => spec.firstCode!.parts[p].forEach((it, k) => {
      const q = question(it.uid);
      const place = q ? rowPlace({ scope: { kind: 'form', id: q.formId }, type: q.type, level: q.level, count: 1 }, tax) : null;
      qrows.push([cellText(`${ROMAN[pi]}.${k + 1}`), cellText(PART_NAME[p].split(' · ')[0].replace('Phần ', '')), cellText(q ? TYPE_LABEL[q.type] : '', S_LEFT), cellText(q?.level ?? ''), cellText(place?.chapter ?? '', S_LEFT), cellText(place?.item ?? '', S_LEFT), cellText(q ? `#${String(q.seq).padStart(4, '0')} · ${it.uid}` : it.uid), cellText(it.key)]);
    }));
  }
  const m2: XSheet = { name: 'Câu trong đề', rows: qrows, widths: [7, 7, 16, 9, 32, 40, 24, 16], freeze: [1, 0] };
  const sp = specSheet(spec, meta, tax, question);
  return { sheets: sp ? [m1, sp, m2] : [m1, m2] };
}


/** Đáp án của một mã đề thành danh sách câu có nhãn I.1, I.2, …, II.1, … (dùng cho thống kê sau thi). */
export function codeKeyItems(spec: MatrixSpec, code: string): { q: string; part: PartKey; key: string }[] {
  const c = spec.perCode.find((x) => x.code === code);
  if (!c) return [];
  const count: Record<string, number> = {};
  return c.items.map((it) => {
    count[it.part] = (count[it.part] ?? 0) + 1;
    return { q: `${ROMAN[PARTS.indexOf(it.part)]}.${count[it.part]}`, part: it.part, key: it.key };
  });
}
