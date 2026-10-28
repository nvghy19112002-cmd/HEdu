// Bản nháp đề đang soạn ở màn Tạo đề (ma trận, chính sách, hạt giống, câu khóa/loại, thông tin đề).
// Chỉ lưu tạm trong trình duyệt/WebView để mở lại màn không mất việc; nơi lưu bền là dự án trong Thư viện đề (hedu-de.json).
import { SCORING_2025, type ExamInfo, type Policy, type Row, type Scoring } from './examgen';
import type { Level, QType, Question, Taxonomy } from './types';
import { defaultScope, type ReuseOk, type UsageScope } from './examusage';

export interface Draft {
  v: 1;
  rows: Row[];
  policy: Policy;
  seed: number;
  /** câu giáo viên đã khóa theo mã dòng */
  locked: Record<string, string[]>;
  /** câu giáo viên loại khỏi đề (không chọn lại) */
  rejected: string[];
  /** ngoại lệ so với chính sách lấy câu, do giáo viên xác nhận rõ (vd chọn tay câu chưa duyệt): uid → lúc xác nhận */
  exceptions: Record<string, { at: number; why: string }>;
  info: ExamInfo;
  count: number;
  firstCode: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  withKeys: boolean;
  scoring: Scoring;
  /** phạm vi tránh câu đã dùng (PR 4B); mặc định tắt */
  usage: UsageScope;
  /** câu đã dùng mà giáo viên chủ động cho dùng lại */
  reuse: ReuseOk;
  /** chữ ký lần đưa câu từ Ngân hàng sang gần nhất, để không thêm lặp khi mở lại màn */
  pickSig: string;
}

export const KEY = 'hedu.examdraft.v1';

export const DEFAULT_INFO: ExamInfo = { dept: '', school: '', group: '', title: 'Kiểm tra cuối học kì I', subject: 'Môn: Toán 12', minutes: 90, note: '' };

export function newDraft(seed = Math.floor(Math.random() * 1e9)): Draft {
  return { v: 1, rows: [], policy: 'duyet', seed, locked: {}, rejected: [], exceptions: {}, info: { ...DEFAULT_INFO }, count: 4, firstCode: 101, shuffleQuestions: true, shuffleOptions: true, withKeys: true, scoring: { ...SCORING_2025 }, usage: defaultScope(), reuse: {}, pickSig: '' };
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const TYPES: QType[] = ['tn', 'ds', 'tln', 'tl'];
const LEVELS: (Level | 'any')[] = ['NB', 'TH', 'VD', 'VDC', 'any'];
const num = (x: unknown, d: number, lo: number, hi: number): number => (typeof x === 'number' && Number.isFinite(x) ? Math.max(lo, Math.min(hi, Math.round(x))) : d);

/** Đọc bản nháp đã lưu; dữ liệu hỏng hoặc khác phiên bản thì bỏ phần hỏng, không báo lỗi giữa chừng. */
export function parseDraft(raw: string | null): Draft {
  const d = newDraft();
  if (!raw) return d;
  let j: unknown;
  try { j = JSON.parse(raw); } catch { return d; }
  if (!isObj(j) || j.v !== 1) return d;
  if (Array.isArray(j.rows)) {
    d.rows = j.rows.filter((r): r is Record<string, unknown> => isObj(r) && typeof r.id === 'string' && isObj(r.scope)).flatMap((r) => {
      const sc = r.scope as Record<string, unknown>;
      if (!['grade', 'chapter', 'lesson', 'form'].includes(String(sc.kind)) || typeof sc.id !== 'string') return [];
      if (!TYPES.includes(r.type as QType) || !LEVELS.includes(r.level as Level)) return [];
      return [{ id: r.id as string, scope: { kind: sc.kind as Row['scope']['kind'], id: sc.id }, type: r.type as QType, level: r.level as Level | 'any', count: num(r.count, 1, 0, 200),
        ...(typeof r.label === 'string' ? { label: r.label.slice(0, 200) } : {}), ...(r.flag === 'mat' || r.flag === 'doi-vi-tri' ? { flag: r.flag } : {}) }];
    });
  }
  if (j.policy === 'duyet' || j.policy === 'xac-minh' || j.policy === 'tat-ca') d.policy = j.policy;
  d.seed = num(j.seed, d.seed, 0, 2 ** 31);
  if (isObj(j.locked)) for (const [k, v] of Object.entries(j.locked)) if (Array.isArray(v)) d.locked[k] = v.filter((x): x is string => typeof x === 'string');
  if (isObj(j.exceptions)) for (const [k, v] of Object.entries(j.exceptions)) if (isObj(v) && typeof v.at === 'number') d.exceptions[k] = { at: v.at, why: typeof v.why === 'string' ? v.why.slice(0, 200) : 'chon-tay' };
  if (Array.isArray(j.rejected)) d.rejected = j.rejected.filter((x): x is string => typeof x === 'string');
  if (isObj(j.info)) {
    const i = j.info;
    const s = (k: string, f: string) => (typeof i[k] === 'string' ? (i[k] as string).slice(0, 200) : f);
    d.info = { dept: s('dept', ''), school: s('school', ''), group: s('group', ''), title: s('title', d.info.title), subject: s('subject', d.info.subject), minutes: num(i.minutes, 90, 1, 600), note: s('note', '') };
  }
  d.count = num(j.count, 4, 1, 24);
  d.firstCode = num(j.firstCode, 101, 1, 9999);
  d.shuffleQuestions = j.shuffleQuestions !== false;
  d.shuffleOptions = j.shuffleOptions !== false;
  d.withKeys = j.withKeys !== false;
  if (isObj(j.scoring)) for (const p of ['p1', 'p2', 'p3', 'p4'] as const) d.scoring[p] = num((j.scoring as Record<string, unknown>)[p], d.scoring[p], 0, 1000);
  if (isObj(j.usage)) {
    const u = j.usage;
    const strs = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string').slice(0, 500) : []);
    d.usage = { on: u.on === true, folders: strs(u.folders), years: strs(u.years), types: strs(u.types), ids: strs(u.ids) };
  }
  if (isObj(j.reuse)) for (const [k, v] of Object.entries(j.reuse)) if (isObj(v) && typeof v.at === 'number') d.reuse[k] = { at: v.at, from: Array.isArray(v.from) ? v.from.filter((x): x is string => typeof x === 'string').slice(0, 500) : [] };
  d.pickSig = typeof j.pickSig === 'string' ? j.pickSig : '';
  return d;
}

export function loadDraft(): Draft {
  try { return parseDraft(localStorage.getItem(KEY)); } catch { return newDraft(); }
}
export function saveDraft(d: Draft): void {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* chỉ là tiện lợi; không lưu được thì thôi */ }
}

let seq = 0;
export const newRowId = (): string => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Mẫu cấu trúc đề 2025: 12 câu trắc nghiệm (5 NB, 4 TH, 3 VD), 4 câu đúng/sai, 6 câu trả lời ngắn, lấy trong cả lớp. */
export function template2025(grade: number): Row[] {
  const g = { kind: 'grade' as const, id: String(grade) };
  return [
    { id: newRowId(), scope: g, type: 'tn', level: 'NB', count: 5 },
    { id: newRowId(), scope: g, type: 'tn', level: 'TH', count: 4 },
    { id: newRowId(), scope: g, type: 'tn', level: 'VD', count: 3 },
    { id: newRowId(), scope: g, type: 'ds', level: 'any', count: 4 },
    { id: newRowId(), scope: g, type: 'tln', level: 'any', count: 6 },
  ];
}

/** Câu chọn tay từ Ngân hàng thành dòng ma trận (gộp theo Dạng, loại, mức độ) kèm danh sách khóa. */
export function rowsFromPick(qs: readonly Question[]): { rows: Row[]; locked: Record<string, string[]> } {
  const rows: Row[] = [];
  const locked: Record<string, string[]> = {};
  const by = new Map<string, Row>();
  for (const q of qs) {
    const k = `${q.formId}|${q.type}|${q.level}`;
    let r = by.get(k);
    if (!r) { r = { id: newRowId(), scope: { kind: 'form', id: q.formId }, type: q.type, level: q.level, count: 0 }; by.set(k, r); rows.push(r); locked[r.id] = []; }
    r.count++;
    locked[r.id].push(q.uid);
  }
  return { rows, locked };
}

/**
 * Chuỗi tổ tiên của một nút phạm vi: [lớp], [lớp, chương], [lớp, chương, bài], [lớp, chương, bài, dạng]. null = nút không còn trong cây.
 * Dùng để biết một dòng của mẫu có bị xóa hoặc đổi vị trí (đổi cha) hay không.
 */
export function findChain(scope: Row['scope'], tax: Taxonomy): string[] | null {
  if (scope.kind === 'grade') return tax.grades.some((g) => String(g.grade) === scope.id) ? [scope.id] : null;
  for (const g of tax.grades) for (const b of g.branches) for (const c of b.chapters) {
    if (scope.kind === 'chapter' && c.id === scope.id) return [String(g.grade), c.id];
    for (const l of c.lessons) {
      if (scope.kind === 'lesson' && l.id === scope.id) return [String(g.grade), c.id, l.id];
      for (const f of l.forms) if (scope.kind === 'form' && f.id === scope.id) return [String(g.grade), c.id, l.id, f.id];
    }
  }
  return null;
}

/**
 * Dòng ma trận dùng thật: dòng đã có cờ giữ nguyên cờ; dòng KHÔNG cờ nhưng nút phạm vi không còn trong cây (vd cây đổi sau khi lưu bản nháp)
 * tự coi là `mat`. Nhờ đó ngân hàng vẫn còn câu mang ID cũ cũng không bao giờ được lấy cho một phạm vi không còn tồn tại.
 */
export function effectiveRows(rows: readonly Row[], tax: Taxonomy): Row[] {
  return rows.map((r) => (r.flag || findChain(r.scope, tax) ? r : { ...r, flag: 'mat' as const }));
}

export type RowFix = { ok: true; row: Row } | { ok: false; why: string };
const strip = (r: Row): Row => { const { flag: _f, label: _l, ...rest } = r; return rest; };

/**
 * Giáo viên xác nhận dòng "đã đổi vị trí" (giữ nguyên ID hiện tại). Kiểm lại nút còn thật trong cây rồi mới bỏ cờ.
 * Dòng "không còn trong cây" KHÔNG xác nhận được: phải chọn lại phạm vi hoặc xóa dòng.
 */
export function confirmRow(r: Row, tax: Taxonomy): RowFix {
  if (r.flag === 'mat') return { ok: false, why: 'Phạm vi này không còn trong cây chương trình: hãy chọn lại phạm vi hợp lệ hoặc xóa dòng.' };
  if (!findChain(r.scope, tax)) return { ok: false, why: 'Phạm vi không còn trong cây chương trình nên chưa xác nhận được.' };
  return { ok: true, row: strip(r) };
}

/** Chọn lại phạm vi cho một dòng. Chỉ bỏ cờ sau khi xác minh phạm vi mới CÓ THẬT trong cây; không bao giờ tự đoán một Dạng khác. */
export function rescopeRow(r: Row, scope: Row['scope'], tax: Taxonomy): RowFix {
  if (!findChain(scope, tax)) return { ok: false, why: 'Phạm vi mới không có trong cây chương trình.' };
  return { ok: true, row: { ...strip(r), scope: { kind: scope.kind, id: scope.id } } };
}

/** Tên phạm vi hai tầng để hiển thị gọn: `main` là mục sâu nhất, `path` là các cấp cha (Lớp › Chương › Bài). null = không còn trong cây. */
export function scopeParts(scope: Row['scope'], tax: Taxonomy): { main: string; path: string[]; grade: number } | null {
  if (scope.kind === 'grade') return tax.grades.some((g) => String(g.grade) === scope.id) ? { main: `Cả lớp ${scope.id}`, path: [], grade: Number(scope.id) } : null;
  for (const g of tax.grades) for (const b of g.branches) for (const c of b.chapters) {
    const lop = `Lớp ${g.grade}`;
    if (scope.kind === 'chapter' && c.id === scope.id) return { main: c.name, path: [lop], grade: g.grade };
    for (const l of c.lessons) {
      if (scope.kind === 'lesson' && l.id === scope.id) return { main: l.name, path: [lop, c.name], grade: g.grade };
      for (const f of l.forms) if (scope.kind === 'form' && f.id === scope.id) return { main: f.name, path: [lop, c.name, l.name], grade: g.grade };
    }
  }
  return null;
}

/** Lớp nên mặc định khi thêm dòng mới: lớp của dòng cuối còn trong cây; không có thì `fallback`. */
export function lastGrade(rows: readonly Row[], tax: Taxonomy, fallback: number): number {
  for (let i = rows.length - 1; i >= 0; i--) { const p = scopeParts(rows[i].scope, tax); if (p) return p.grade; }
  return fallback;
}

/** Tên phạm vi dạng đường dẫn: “Lớp 12 › Chương 1 › Bài 2 › Dạng”. Nút không còn trong cây thì trả null. */
export function scopeLabel(scope: Row['scope'], tax: Taxonomy): string | null {
  if (scope.kind === 'grade') return `Cả lớp ${scope.id}`;
  for (const g of tax.grades) for (const b of g.branches) for (const c of b.chapters) {
    if (scope.kind === 'chapter' && c.id === scope.id) return `Lớp ${g.grade} › ${c.name}`;
    for (const l of c.lessons) {
      if (scope.kind === 'lesson' && l.id === scope.id) return `Lớp ${g.grade} › ${c.name} › ${l.name}`;
      for (const f of l.forms) if (scope.kind === 'form' && f.id === scope.id) return `${l.name} › ${f.name}`;
    }
  }
  return null;
}
