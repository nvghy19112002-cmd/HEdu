// Trang "Bản đặc tả kĩ thuật" của ma trận đề (hàm thuần): mỗi bài một dòng, có Yêu cầu cần đạt theo mức độ
// và số thứ tự các câu của mã đề đầu tiên đặt vào cột Loại câu × Mức độ. Yêu cầu cần đạt lấy từ `yccd-toan.ts`;
// bài chưa có dữ liệu thì để trống cho thầy cô tự điền (có ghi chú cuối bảng).
import { PARTS, PART_NAME, type PartKey } from './examgen';
import type { MatrixMeta, MatrixSpec } from './exammatrix';
import { LEVELS, TYPE_LABEL, type Level, type Question, type QType, type Taxonomy } from './types';
import { cellNum, cellText, S_BODY, S_BOLD, S_HEAD, S_LEFT, S_SUM, S_SUML, S_TITLE, type XCell, type XSheet } from './xlsxbook';
import { YCCD_TOAN, type Yccd } from './yccd-toan';

const PART_TYPE: Record<PartKey, QType> = { p1: 'tn', p2: 'ds', p3: 'tln', p4: 'tl' };
const TYPE_PART: Record<QType, PartKey> = { tn: 'p1', ds: 'p2', tln: 'p3', tl: 'p4' };
const TYPE_ORDER: QType[] = ['tn', 'ds', 'tln', 'tl'];
const ROMAN = ['I', 'II', 'III', 'IV'];
const LEVEL_NAME: Record<Level, string> = { NB: 'Nhận biết', TH: 'Thông hiểu', VD: 'Vận dụng', VDC: 'Vận dụng cao' };
const LEVEL_KEY: Record<Level, 'N' | 'H' | 'V'> = { NB: 'N', TH: 'H', VD: 'V', VDC: 'V' };

export interface SpecLesson { key: string | null; chapter: string; lesson: string; yccd: Yccd | null }

/** Bài (và chương) chứa dạng `formId`; khoá yêu cầu cần đạt là "mã lớp/mã phân môn/mã chương/mã bài". */
export function lessonOfForm(tax: Taxonomy, formId: string): (SpecLesson & { order: number }) | null {
  let order = 0;
  for (const g of tax.grades) for (const b of g.branches) for (const c of b.chapters) for (const l of c.lessons) {
    order++;
    if (l.forms.some((f) => f.id === formId)) {
      const key = `${g.code}/${b.code}/${c.code}/${l.code}`;
      const y = YCCD_TOAN[key];
      return { key, chapter: c.name, lesson: l.name, yccd: y && y.ten.trim().toLowerCase() === l.name.trim().toLowerCase() ? y : null, order };
    }
  }
  return null;
}

const fmt = (n: number): string => (Math.round(n * 100) / 100).toString().replace('.', ',');

/** Văn bản "Yêu cầu cần đạt" của một bài, chỉ ghi các mức độ có câu trong đề. */
export function yccdText(y: Yccd | null, levels: Level[]): string {
  if (!y) return '';
  const parts: string[] = [];
  for (const lv of levels) {
    const list = y[LEVEL_KEY[lv]];
    if (!list.length) continue;
    parts.push(`${LEVEL_NAME[lv]}:\n${list.map((s) => `- ${s}`).join('\n')}`);
  }
  return parts.join('\n');
}

/** Trang Bản đặc tả; null nếu đề chưa có mã đề nào để lấy câu. */
export function specSheet(spec: MatrixSpec, meta: MatrixMeta, tax: Taxonomy, question: (uid: string) => Question | undefined): XSheet | null {
  if (!spec.firstCode) return null;
  type Item = { label: string; type: QType; level: Level | null };
  const groups = new Map<string, { info: SpecLesson; order: number; items: Item[] }>();
  const itemsAll: Item[] = [];
  PARTS.forEach((p, pi) => spec.firstCode!.parts[p].forEach((it, k) => {
    const q = question(it.uid);
    const label = `${ROMAN[pi]}.${k + 1}`;
    const item: Item = { label, type: q?.type ?? PART_TYPE[p], level: q && (LEVELS as string[]).includes(q.level) ? (q.level as Level) : null };
    itemsAll.push(item);
    const place = q ? lessonOfForm(tax, q.formId) : null;
    const gk = place?.key ?? '\u0000none';
    let g = groups.get(gk);
    if (!g) groups.set(gk, (g = { info: place ?? { key: null, chapter: '(chưa phân loại)', lesson: '(chưa phân loại)', yccd: null }, order: place?.order ?? 1e9, items: [] }));
    g.items.push(item);
  }));
  if (!itemsAll.length) return null;
  const types = TYPE_ORDER.filter((t) => itemsAll.some((i) => i.type === t));
  const per = LEVELS.length;
  const list = [...groups.values()].sort((a, b) => a.order - b.order);
  const nCols = 4 + types.length * per;
  const colOf = (t: QType, l: Level) => 4 + types.indexOf(t) * per + LEVELS.indexOf(l);

  const rows: XCell[][] = [];
  const merges: NonNullable<XSheet['merges']> = [];
  rows.push([{ v: `BẢN ĐẶC TẢ KĨ THUẬT ${(meta.name || spec.title || 'ĐỀ KIỂM TRA').toLocaleUpperCase('vi')}`, s: S_TITLE }]);
  rows.push([{ v: [meta.grade ? `Lớp ${meta.grade}` : null, meta.schoolYear, meta.examType].filter(Boolean).join(' · '), s: S_BOLD }], []);
  const H = rows.length;
  const h1: XCell[] = [cellText('STT', S_HEAD), cellText('Chương / Chủ đề', S_HEAD), cellText('Nội dung / Đơn vị kiến thức', S_HEAD), cellText('Yêu cầu cần đạt', S_HEAD)];
  const h2: XCell[] = [cellText('', S_HEAD), cellText('', S_HEAD), cellText('', S_HEAD), cellText('', S_HEAD)];
  for (let c = 0; c < 4; c++) merges.push([H, c, H + 1, c]);
  types.forEach((t, ti) => {
    const c0 = 4 + ti * per;
    h1.push(cellText(TYPE_LABEL[t], S_HEAD), ...Array.from({ length: per - 1 }, () => cellText('', S_HEAD)));
    merges.push([H, c0, H, c0 + per - 1]);
    for (const l of LEVELS) h2.push(cellText(l, S_HEAD));
  });
  rows.push(h1, h2);

  const colCount = new Array(types.length * per).fill(0) as number[];
  const missing: string[] = [];
  list.forEach((g, i) => {
    const present = LEVELS.filter((l) => g.items.some((x) => x.level === l));
    if (g.info.key && !g.info.yccd) missing.push(g.info.lesson);
    const row: XCell[] = [cellNum(i + 1), cellText(g.info.chapter, S_LEFT), cellText(g.info.lesson, S_LEFT), cellText(yccdText(g.info.yccd, present), S_LEFT)];
    for (const t of types) for (const l of LEVELS) {
      const here = g.items.filter((x) => x.type === t && x.level === l);
      colCount[types.indexOf(t) * per + LEVELS.indexOf(l)] += here.length;
      row[colOf(t, l)] = here.length ? cellText(here.map((x) => x.label).join(', ')) : cellText('', S_BODY);
    }
    rows.push(row);
  });

  const total = itemsAll.length;
  const unleveled = itemsAll.filter((x) => !x.level).length;
  const pts = (t: QType, n: number) => (n * spec.scoring[TYPE_PART[t]]) / 100;
  const sumRow = (title: string, f: (ti: number, li: number) => XCell): XCell[] => {
    const r: XCell[] = [cellText(title, S_SUM), cellText('', S_SUM), cellText('', S_SUM), cellText('', S_SUM)];
    merges.push([rows.length, 0, rows.length, 3]);
    types.forEach((_, ti) => LEVELS.forEach((__, li) => r.push(f(ti, li))));
    return r;
  };
  rows.push(sumRow('TỔNG SỐ CÂU / Ý', (ti, li) => { const v = colCount[ti * per + li]; return v ? { n: v, s: S_SUM } : cellText('', S_SUM); }));
  rows.push(sumRow('TỔNG ĐIỂM THEO MỨC ĐỘ', (ti, li) => { const v = colCount[ti * per + li]; return v ? { n: Math.round(pts(types[ti], v) * 100) / 100, s: S_SUM } : cellText('', S_SUM); }));
  const totalPts = types.reduce((a, t, ti) => a + pts(t, LEVELS.reduce((s, _l, li) => s + colCount[ti * per + li], 0)), 0);
  const partRow = (title: string, f: (ti: number) => number): XCell[] => {
    const r: XCell[] = [cellText(title, S_SUM), cellText('', S_SUM), cellText('', S_SUM), cellText('', S_SUM)];
    merges.push([rows.length, 0, rows.length, 3]);
    types.forEach((_, ti) => {
      const c0 = 4 + ti * per;
      r.push({ n: Math.round(f(ti) * 100) / 100, s: S_SUM }, ...Array.from({ length: per - 1 }, () => cellText('', S_SUM)));
      merges.push([rows.length, c0, rows.length, c0 + per - 1]);
    });
    return r;
  };
  rows.push(partRow('ĐIỂM THEO TỪNG PHẦN', (ti) => pts(types[ti], LEVELS.reduce((s, _l, li) => s + colCount[ti * per + li], 0))));
  rows.push(partRow('TỈ LỆ %', (ti) => (totalPts ? (pts(types[ti], LEVELS.reduce((s, _l, li) => s + colCount[ti * per + li], 0)) / totalPts) * 100 : 0)));

  const notes: string[] = [`Tổng ${total} câu · ${fmt(totalPts)} điểm. Số trong ô là số thứ tự câu của mã đề ${spec.firstCode.code || 'đầu tiên'} (${ROMAN.map((r, i) => `${r} = ${PART_NAME[PARTS[i]].split(' · ')[0]}`).join('; ')}).`];
  if (missing.length) notes.push(`Chưa có yêu cầu cần đạt cho ${missing.length} bài (${missing.join('; ')}): cột ấy để trống cho thầy cô tự điền.`);
  if (unleveled) notes.push(`${unleveled} câu chưa có mức độ nên không nằm trong cột mức độ nào.`);
  rows.push([]);
  for (const n of notes) rows.push([{ v: n, s: S_SUML }]);

  return { name: 'Bản đặc tả', rows, merges, widths: [5, 26, 30, 60, ...Array.from({ length: types.length * per }, () => 7)], freeze: [H + 2, 4], landscape: true };
}
