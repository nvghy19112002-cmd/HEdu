// Cây mục lục của Thư viện đề thi (thuần, không phụ thuộc giao diện):
//   Lớp → Ôn tập theo bài học (Chương → Bài, lấy từ cây câu hỏi) · Đề kiểm tra (GK1, CK1, GK2, CK2, khác) · Đề ôn tập · Đề thi thử · Chưa phân loại
//   Thư mục riêng (thư mục ảo tự đặt) · Chưa xếp lớp
// Vị trí của đề suy từ thông tin đề (lớp, loại đề, chương, bài): đổi thông tin là đề tự về đúng nút, không phải kéo thả.
import type { ExamSummary } from './examlib';
import type { Taxonomy } from './types';

export type ExamCat = 'on-bai' | 'on-chuong' | 'gk1' | 'ck1' | 'gk2' | 'ck2' | 'kt-khac' | 'on-tap' | 'thi-thu';

/** Loại đề chuẩn: nhãn này được ghi vào ô "Loại đề" của đề. */
export const CAT_LABEL: Record<ExamCat, string> = {
  'on-bai': 'Ôn tập theo bài', 'on-chuong': 'Ôn tập theo chương',
  gk1: 'Giữa kỳ 1', ck1: 'Cuối kỳ 1', gk2: 'Giữa kỳ 2', ck2: 'Cuối kỳ 2', 'kt-khac': 'Kiểm tra khác',
  'on-tap': 'Đề ôn tập', 'thi-thu': 'Thi thử',
};
export const CATS: ExamCat[] = ['on-bai', 'on-chuong', 'gk1', 'ck1', 'gk2', 'ck2', 'kt-khac', 'on-tap', 'thi-thu'];
const KT: ExamCat[] = ['gk1', 'ck1', 'gk2', 'ck2'];

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim();

/** Đọc ô "Loại đề" (gõ tay kiểu gì cũng được: "Giữa kì 1", "GK1", "giữa HK2", "Thi thử THPT"…). null = không nhận ra. */
export function catOfType(t: string | null | undefined): ExamCat | null {
  if (!t) return null;
  const s = fold(t).replace(/[–—-]/g, ' ');
  const n = /(?:^|\D)([12])(?:\D|$)/.exec(s)?.[1] ?? (/\bii\b/.test(s) ? '2' : /\bi\b/.test(s) ? '1' : null);
  if (/on tap .*\bbai\b|on bai/.test(s)) return 'on-bai';
  if (/on tap .*\bchuong\b|on chuong/.test(s)) return 'on-chuong';
  if (/thi thu|thpt|tot nghiep|tn ?thpt/.test(s)) return 'thi-thu';
  if (/giua|^gk|\bgk ?[12]\b/.test(s)) return n === '2' ? 'gk2' : n === '1' ? 'gk1' : null;
  if (/cuoi|^ck|\bck ?[12]\b|hoc ky|hoc ki|\bhk ?[12]\b/.test(s)) return n === '2' ? 'ck2' : n === '1' ? 'ck1' : null;
  if (/15 phut|1 tiet|45 phut|kiem tra/.test(s)) return 'kt-khac';
  if (/on tap|luyen tap|luyen thi|de cuong/.test(s)) return 'on-tap';
  return null;
}

interface TaxIndex { chapterGrade: Map<string, number>; lessonChapter: Map<string, string> }
function index(tax: Taxonomy): TaxIndex {
  const chapterGrade = new Map<string, number>(), lessonChapter = new Map<string, string>();
  for (const g of tax.grades) for (const b of g.branches) for (const c of b.chapters) { chapterGrade.set(c.id, g.grade); for (const l of c.lessons) lessonChapter.set(l.id, c.id); }
  return { chapterGrade, lessonChapter };
}

/** Các khoá nút (kể cả nút cha) mà đề thuộc về. Một đề có thể vừa ở nhánh lớp vừa ở "Thư mục riêng". */
export function examKeys(e: ExamSummary, ix: TaxIndex): string[] {
  const out: string[] = [];
  const m = e.metadata;
  const ch = m.chapterId && ix.chapterGrade.has(m.chapterId) ? m.chapterId : null;
  const ls = ch && m.lessonId && ix.lessonChapter.get(m.lessonId) === ch ? m.lessonId : null;
  const grade = m.grade ?? (ch ? ix.chapterGrade.get(ch)! : null);
  const cat = catOfType(m.examType);
  if (grade) {
    const g = `g:${grade}`;
    out.push(g);
    // đề có chương (và không phải đề kiểm tra/thi thử) ⇒ Ôn tập theo bài học
    if (ch && (cat === null || cat === 'on-bai' || cat === 'on-chuong' || cat === 'on-tap') && (!m.grade || ix.chapterGrade.get(ch) === m.grade)) {
      out.push(`${g}/bai`, `${g}/bai/c:${ch}`);
      if (ls) out.push(`${g}/bai/c:${ch}/l:${ls}`);
    } else if (cat && KT.includes(cat)) out.push(`${g}/kt`, `${g}/kt/${cat}`);
    else if (cat === 'kt-khac') out.push(`${g}/kt`, `${g}/kt/khac`);
    else if (cat === 'on-tap' || cat === 'on-bai' || cat === 'on-chuong') out.push(`${g}/ontap`);
    else if (cat === 'thi-thu') out.push(`${g}/thithu`);
    else out.push(`${g}/khac`);
  }
  if (e.folder) {
    out.push('f');
    e.folder.split('/').forEach((_, i, a) => out.push(`f:${a.slice(0, i + 1).join('/')}`));
  }
  if (!grade && !e.folder) out.push('none');
  return out;
}

export type ExamNodeKind = 'grade' | 'group' | 'chapter' | 'lesson' | 'slot' | 'folder' | 'none';
export interface ExamNode { key: string; label: string; kind: ExamNodeKind; count: number; children: ExamNode[]; /** luôn hiện kể cả khi chưa có đề */ fixed?: boolean }

/** Đếm số đề theo từng nút. */
export function examCounts(list: readonly ExamSummary[], tax: Taxonomy): Map<string, number> {
  const ix = index(tax);
  const m = new Map<string, number>();
  for (const e of list) for (const k of examKeys(e, ix)) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}

export const examInNode = (e: ExamSummary, key: string | null, tax: Taxonomy): boolean => key === null || examKeys(e, index(tax)).includes(key);
export function filterByNode(list: readonly ExamSummary[], key: string | null, tax: Taxonomy): ExamSummary[] {
  if (key === null) return [...list];
  const ix = index(tax);
  return list.filter((e) => examKeys(e, ix).includes(key));
}

/** Dựng cây đầy đủ. Nhóm cố định (Đề kiểm tra GK1…CK2, Đề ôn tập, Thi thử lớp 12) luôn có; chương/bài chỉ hiện khi có đề, trừ khi showEmpty. */
export function examTree(tax: Taxonomy, counts: ReadonlyMap<string, number>, list: readonly ExamSummary[], showEmpty = false): ExamNode[] {
  const n = (k: string) => counts.get(k) ?? 0;
  const keep = (x: ExamNode) => x.fixed || x.count > 0 || showEmpty;
  const grades = new Set<number>(tax.grades.map((g) => g.grade));
  for (const k of counts.keys()) { const m = /^g:(\d+)$/.exec(k); if (m) grades.add(+m[1]); }
  const out: ExamNode[] = [];
  for (const gr of [...grades].sort((a, b) => b - a)) {
    const g = `g:${gr}`;
    const tg = tax.grades.find((x) => x.grade === gr);
    const chapters: ExamNode[] = (tg?.branches ?? []).flatMap((b) => b.chapters).map((c) => ({
      key: `${g}/bai/c:${c.id}`, label: c.name, kind: 'chapter' as const, count: n(`${g}/bai/c:${c.id}`),
      children: c.lessons.map((l) => ({ key: `${g}/bai/c:${c.id}/l:${l.id}`, label: l.name, kind: 'lesson' as const, count: n(`${g}/bai/c:${c.id}/l:${l.id}`), children: [] })).filter(keep),
    })).filter(keep);
    const ktKids: ExamNode[] = [
      ...KT.map((c): ExamNode => ({ key: `${g}/kt/${c}`, label: CAT_LABEL[c], kind: 'slot', count: n(`${g}/kt/${c}`), children: [], fixed: true })),
      { key: `${g}/kt/khac`, label: 'Kiểm tra khác', kind: 'slot', count: n(`${g}/kt/khac`), children: [] },
    ];
    const kids: ExamNode[] = ([
      { key: `${g}/bai`, label: 'Ôn tập theo bài học', kind: 'group', count: n(`${g}/bai`), children: chapters, fixed: true },
      { key: `${g}/kt`, label: 'Đề kiểm tra', kind: 'group', count: n(`${g}/kt`), fixed: true, children: ktKids.filter(keep) },
      { key: `${g}/ontap`, label: 'Đề ôn tập', kind: 'slot', count: n(`${g}/ontap`), children: [], fixed: true },
      { key: `${g}/thithu`, label: 'Đề thi thử', kind: 'slot', count: n(`${g}/thithu`), children: [], fixed: gr === 12 },
      { key: `${g}/khac`, label: 'Chưa phân loại', kind: 'slot', count: n(`${g}/khac`), children: [] },
    ] as ExamNode[]).filter(keep);
    out.push({ key: g, label: tg?.name ?? `Lớp ${gr}`, kind: 'grade', count: n(g), children: kids, fixed: !!tg });
  }
  // thư mục riêng
  const root: ExamNode = { key: 'f', label: 'Thư mục riêng', kind: 'group', count: n('f'), children: [], fixed: true };
  const paths = new Set<string>();
  for (const e of list) if (e.folder) e.folder.split('/').forEach((_, i, a) => paths.add(a.slice(0, i + 1).join('/')));
  const byPath = new Map<string, ExamNode>();
  for (const p of [...paths].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true, sensitivity: 'base' }))) {
    const node: ExamNode = { key: `f:${p}`, label: p.split('/').pop()!, kind: 'folder', count: n(`f:${p}`), children: [] };
    byPath.set(p, node);
    const parent = p.includes('/') ? byPath.get(p.slice(0, p.lastIndexOf('/'))) : root;
    (parent ?? root).children.push(node);
  }
  out.push(root);
  if (n('none') > 0) out.push({ key: 'none', label: 'Chưa xếp lớp', kind: 'none', count: n('none'), children: [] });
  return out.filter(keep);
}

/** Thông tin điền sẵn khi tạo đề trong một nút (null = nút không gợi ý gì). */
export interface Placement { grade: number | null; examType: string | null; chapterId: string | null; lessonId: string | null; folder: string | null }
export function placementOf(key: string | null): Placement | null {
  if (!key) return null;
  if (key.startsWith('f:')) return { grade: null, examType: null, chapterId: null, lessonId: null, folder: key.slice(2) };
  const m = /^g:(\d+)(?:\/(bai|kt|ontap|thithu|khac)(?:\/(.*))?)?$/.exec(key);
  if (!m) return null;
  const p: Placement = { grade: +m[1], examType: null, chapterId: null, lessonId: null, folder: null };
  const rest = m[3] ?? '';
  if (m[2] === 'bai') {
    const c = /^c:([^/]+)(?:\/l:(.+))?$/.exec(rest);
    if (c) { p.chapterId = c[1]; p.lessonId = c[2] ?? null; p.examType = CAT_LABEL[c[2] ? 'on-bai' : 'on-chuong']; }
  } else if (m[2] === 'kt') p.examType = rest === 'khac' ? CAT_LABEL['kt-khac'] : (KT as string[]).includes(rest) ? CAT_LABEL[rest as ExamCat] : null;
  else if (m[2] === 'ontap') p.examType = CAT_LABEL['on-tap'];
  else if (m[2] === 'thithu') p.examType = CAT_LABEL['thi-thu'];
  return p;
}

/** Đường dẫn chữ của một nút (dùng cho tiêu đề danh sách): "Lớp 12 › Đề kiểm tra › Giữa kỳ 1". */
export function nodeTrail(tree: readonly ExamNode[], key: string | null): string[] {
  if (!key) return [];
  const walk = (ns: readonly ExamNode[], acc: string[]): string[] | null => {
    for (const x of ns) { const a = [...acc, x.label]; if (x.key === key) return a; const r = walk(x.children, a); if (r) return r; }
    return null;
  };
  return walk(tree, []) ?? [];
}

/** Vị trí chữ của một đề trong nhánh lớp: "Lớp 12 › Đề kiểm tra › Giữa kỳ 1" (rỗng nếu chưa xếp lớp). */
export function examTrail(e: ExamSummary, tax: Taxonomy): string[] {
  const keys = examKeys(e, index(tax)).filter((k) => k.startsWith('g:'));
  if (!keys.length) return [];
  const deepest = keys.reduce((a, b) => (b.split('/').length > a.split('/').length ? b : a));
  return nodeTrail(examTree(tax, examCounts([e], tax), [e], true), deepest);
}
