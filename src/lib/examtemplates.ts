// Mẫu ma trận đề (PR 4A, D7): lưu BỀN trong tệp phụ SQLite khoá `exam-templates` (cùng cơ chế `id-review`, không đổi schema ngân hàng),
// có trong sao lưu `.db` và sao lưu JSON; bản web dùng localStorage. Một mẫu KHÔNG lưu câu khóa, ngoại lệ, UID hay thông tin trường/kỳ thi.
import { useSyncExternalStore } from 'react';
import { findChain, type Draft } from './examdraft';
import { SCORING_2025, type Policy, type Row, type Scoring } from './examgen';
import { invoke, isDesktop } from './platform';
import { getStorageMode } from './storage';
import { taxRevision } from './taxpath';
import type { Level, QType, Taxonomy } from './types';

/** Phiên bản định dạng một mẫu. Bản ghi có `fmt` lớn hơn được GIỮ NGUYÊN (không xóa, không sửa) nhưng chưa dùng được. */
export const TEMPLATE_FORMAT = 1;
export const MAX_TEMPLATES = 500;
export const MAX_ROWS = 200;
export const NAME_MAX = 80;

export interface TplRow {
  id: string;
  scope: Row['scope'];
  type: QType;
  level: Level | 'any';
  count: number;
  /** tên phạm vi lúc lưu mẫu (để hiện khi nút đã bị xóa khỏi cây) */
  label: string;
  /** chuỗi tổ tiên lúc lưu: lớp, chương, bài, dạng (để biết nút có bị đổi vị trí) */
  chain: string[];
}
export interface Template {
  id: string;
  name: string;
  fmt: number;
  createdAt: number;
  updatedAt: number;
  rows: TplRow[];
  policy: Policy;
  scoring: Scoring;
  /** số mã đề và lựa chọn trộn */
  codes: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  /** dấu vân cây chương trình lúc lưu: chỉ để báo "cây đã đổi", không dùng để tự sửa mẫu */
  taxRev: string;
}
/** Bản ghi có định dạng mới hơn: giữ nguyên để không phá dữ liệu của bản app sau này. */
export interface Opaque { id: string; fmt: number; raw: unknown }

// ---------- kiểm tra bản ghi ----------
const POLICIES: readonly string[] = ['duyet', 'xac-minh', 'tat-ca'];
const TYPES_: readonly string[] = ['tn', 'ds', 'tln', 'tl'];
const LEVELS_: readonly string[] = ['NB', 'TH', 'VD', 'VDC', 'any'];
const KINDS: readonly string[] = ['grade', 'chapter', 'lesson', 'form'];
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const str = (x: unknown): x is string => typeof x === 'string';

function toRow(r: unknown): TplRow | null {
  if (!isObj(r) || !str(r.id) || !isObj(r.scope) || !KINDS.includes(String(r.scope.kind)) || !str(r.scope.id)) return null;
  if (!TYPES_.includes(String(r.type)) || !LEVELS_.includes(String(r.level)) || !num(r.count)) return null;
  return {
    id: r.id.slice(0, 40), scope: { kind: r.scope.kind as Row['scope']['kind'], id: r.scope.id }, type: r.type as QType, level: r.level as Level | 'any',
    count: Math.max(0, Math.min(200, Math.round(r.count))), label: str(r.label) ? r.label.slice(0, 200) : '', chain: Array.isArray(r.chain) ? r.chain.filter(str).slice(0, 6) : [],
  };
}

/** Bản ghi hợp lệ định dạng 1 ⇒ Template; định dạng mới hơn ⇒ Opaque (giữ nguyên); hỏng ⇒ null (bị bỏ và đếm). */
export function parseTemplate(x: unknown): Template | Opaque | null {
  if (!isObj(x) || !str(x.id) || !x.id || x.id.length > 64) return null;
  if (num(x.fmt) && x.fmt > TEMPLATE_FORMAT) return { id: x.id, fmt: x.fmt, raw: x };
  if (x.fmt !== TEMPLATE_FORMAT || !str(x.name) || !x.name.trim() || !num(x.createdAt) || !num(x.updatedAt) || !Array.isArray(x.rows) || x.rows.length > MAX_ROWS) return null;
  if (!POLICIES.includes(String(x.policy)) || !isObj(x.scoring)) return null;
  const rows = x.rows.map(toRow);
  if (rows.some((r) => !r)) return null;
  const sc: Scoring = { ...SCORING_2025 };
  for (const p of ['p1', 'p2', 'p3', 'p4'] as const) { const v = (x.scoring as Record<string, unknown>)[p]; if (num(v)) sc[p] = Math.max(0, Math.min(1000, Math.round(v))); }
  return {
    id: x.id, name: x.name.trim().slice(0, NAME_MAX), fmt: TEMPLATE_FORMAT, createdAt: x.createdAt, updatedAt: x.updatedAt, rows: rows as TplRow[], policy: x.policy as Policy, scoring: sc,
    codes: num(x.codes) ? Math.max(1, Math.min(24, Math.round(x.codes))) : 4, shuffleQuestions: x.shuffleQuestions !== false, shuffleOptions: x.shuffleOptions !== false, taxRev: str(x.taxRev) ? x.taxRev : '',
  };
}
export const isOpaque = (t: Template | Opaque): t is Opaque => t.fmt > TEMPLATE_FORMAT;

export interface Parsed { items: Map<string, Template | Opaque>; dropped: number }
/** Đọc tệp phụ. Cấu trúc tệp không hiểu được (hỏng, hoặc `v` mới hơn) ⇒ ném lỗi: KHÔNG ghi đè thứ mình không đọc được. */
export function parseStore(json: string | null): Parsed {
  const items = new Map<string, Template | Opaque>();
  if (!json) return { items, dropped: 0 };
  const f = JSON.parse(json) as { v?: unknown; templates?: unknown };
  if (f.v !== 1 || !Array.isArray(f.templates)) throw new Error('Tệp mẫu ma trận có cấu trúc không hiểu được (có thể do bản HEdu mới hơn).');
  let dropped = 0;
  for (const e of f.templates) {
    const t = parseTemplate(e);
    if (!t) { dropped++; continue; }
    const cur = items.get(t.id);
    items.set(t.id, cur ? newer(cur, t) : t);
  }
  return { items, dropped };
}

/** Cùng ID: bản `updatedAt` mới hơn thắng; bằng nhau thì giữ bản đang có (xác định, không phụ thuộc thứ tự). Bản ghi định dạng mới hơn không bị bản cũ đè. */
export function newer(cur: Template | Opaque, inc: Template | Opaque): Template | Opaque {
  if (isOpaque(cur) !== isOpaque(inc)) return isOpaque(cur) ? cur : inc;
  if (isOpaque(cur) || isOpaque(inc)) return cur;
  return inc.updatedAt > cur.updatedAt ? inc : cur;
}

// ---------- kho trong bộ nhớ + tệp phụ ----------
export interface Backend { load(): Promise<string | null>; save(json: string): Promise<void> }
const KEY = 'exam-templates';
const web: Backend = {
  async load() { try { return localStorage.getItem('hedu.examtemplates.v1'); } catch { return null; } },
  async save(json) { localStorage.setItem('hedu.examtemplates.v1', json); },
};
const sqlite: Backend = {
  load: () => invoke<string | null>('db_sidecar_get', { key: KEY }),
  save: (json) => invoke<void>('db_apply', { upserts: [], deletes: [], meta: [], sidecar: [[KEY, json]] }),
};
/** Chế độ JSON cũ không có tệp phụ: không lưu được ⇒ báo rõ, không giả vờ đã lưu. */
const none: Backend = { async load() { return null; }, async save() { throw new Error('Chế độ lưu này không có nơi lưu mẫu (cần dữ liệu SQLite).'); } };
let backend: Backend | null = null;
let items = new Map<string, Template | Opaque>();
let writable = true;
let loadedOnce = false;
let version = 0;
let chain: Promise<unknown> = Promise.resolve();
const subs = new Set<() => void>();
const emit = () => { version++; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f); };
const dump = (): string => JSON.stringify({ v: 1, templates: [...items.values()].map((t) => (isOpaque(t) ? t.raw : t)) });

/** Chỉ dùng trong kiểm thử. */
export function _resetTemplates(b: Backend | null) { backend = b; items = new Map(); writable = true; loadedOnce = false; version = 0; chain = Promise.resolve(); }

export async function loadTemplates(): Promise<{ ok: boolean; error?: string; dropped: number }> {
  backend = backend ?? (isDesktop() ? (getStorageMode() === 'sqlite' ? sqlite : none) : web);
  try {
    const p = parseStore(await backend.load());
    items = p.items; writable = true; loadedOnce = true; emit();
    return { ok: true, dropped: p.dropped };
  } catch (e) {
    items = new Map(); writable = false; loadedOnce = true; emit(); // không ghi đè tệp mình không đọc được
    return { ok: false, error: e instanceof Error ? e.message : String(e), dropped: 0 };
  }
}
export const templatesLoaded = (): boolean => loadedOnce;
export const templatesWritable = (): boolean => writable;
export const useTemplates = (): number => useSyncExternalStore(subscribe, () => version, () => version);
export const listTemplates = (): Template[] => [...items.values()].filter((t): t is Template => !isOpaque(t)).sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name, 'vi'));
export const unsupportedCount = (): number => [...items.values()].filter(isOpaque).length;
export const getTemplate = (id: string): Template | undefined => { const t = items.get(id); return t && !isOpaque(t) ? t : undefined; };

/** Ghi bền vững toàn bộ kho; lỗi ⇒ false (nơi gọi hoàn lại). Tuần tự hóa các lần ghi. */
function persist(): Promise<boolean> {
  const run = async (): Promise<boolean> => {
    if (!writable || !backend) return false;
    try { await backend.save(dump()); return true; } catch { return false; }
  };
  const p = chain.then(run, run);
  chain = p;
  return p;
}
/** Mọi thay đổi được ghi NGAY khi thao tác (và hoàn lại nếu lỗi), nên không có gì chờ ghi: chỉ đợi lần ghi đang chạy. Tệp mẫu hỏng/bị chặn ghi không chặn việc cập nhật hay khôi phục. */
export const flushTemplates = async (): Promise<boolean> => { try { await chain; } catch { /* lần ghi lỗi đã được hoàn lại */ } return true; };

/** Đặt kho mới rồi GHI; lỗi ⇒ trả đúng trạng thái cũ và false: không bao giờ báo "đã lưu" khi chưa xuống đĩa. */
async function commit(next: Map<string, Template | Opaque>): Promise<boolean> {
  if (!writable || !backend) return false;
  const prev = items;
  items = next; emit();
  if (await persist()) return true;
  items = prev; emit();
  return false;
}

export function newTemplateId(): string {
  const b = new Uint8Array(8);
  try { crypto.getRandomValues(b); } catch { for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256); }
  for (let t = 0; t < 20; t++) {
    const id = 'tpl-' + [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    if (!items.has(id)) return id;
    b[0] = (b[0] + 1) & 255;
  }
  return `tpl-${Date.now().toString(16)}`;
}

export type Result<T = void> = { ok: true; value: T } | { ok: false; why: string };
const clean = (s: string): string => s.replace(/\s+/g, ' ').trim();
const same = (a: string, b: string): boolean => clean(a).toLocaleLowerCase('vi') === clean(b).toLocaleLowerCase('vi');
export function checkName(name: string, except?: string): string | null {
  const n = clean(name);
  if (!n) return 'Tên mẫu không được để trống.';
  if (n.length > NAME_MAX) return `Tên mẫu tối đa ${NAME_MAX} ký tự.`;
  if (listTemplates().some((t) => t.id !== except && same(t.name, n))) return 'Đã có mẫu trùng tên này.';
  return null;
}
const FAIL = 'Chưa ghi được mẫu xuống đĩa (đĩa đầy, hoặc tệp mẫu đang bị chặn ghi). Chưa lưu gì.';

/** Chụp ma trận hiện tại thành mẫu: CHỈ dòng, chính sách, điểm, số mã, lựa chọn trộn. Không lấy câu khóa, ngoại lệ, UID, thông tin trường. */
export function snapshotFrom(d: Pick<Draft, 'rows' | 'policy' | 'scoring' | 'count' | 'shuffleQuestions' | 'shuffleOptions'>, tax: Taxonomy, name: string, now = Date.now()): Template {
  return {
    id: '', name: clean(name), fmt: TEMPLATE_FORMAT, createdAt: now, updatedAt: now, policy: d.policy, scoring: { ...d.scoring }, codes: d.count,
    shuffleQuestions: d.shuffleQuestions, shuffleOptions: d.shuffleOptions, taxRev: taxRevision(tax),
    rows: d.rows.map((r) => ({ id: r.id, scope: { ...r.scope }, type: r.type, level: r.level, count: r.count, label: r.label ?? labelOf(r.scope, tax), chain: findChain(r.scope, tax) ?? [] })),
  };
}
function labelOf(scope: Row['scope'], tax: Taxonomy): string {
  if (scope.kind === 'grade') return `Cả lớp ${scope.id}`;
  for (const g of tax.grades) for (const b of g.branches) for (const c of b.chapters) {
    if (scope.kind === 'chapter' && c.id === scope.id) return `Lớp ${g.grade} › ${c.name}`;
    for (const l of c.lessons) {
      if (scope.kind === 'lesson' && l.id === scope.id) return `Lớp ${g.grade} › ${c.name} › ${l.name}`;
      for (const f of l.forms) if (scope.kind === 'form' && f.id === scope.id) return `Lớp ${g.grade} › ${c.name} › ${l.name} › ${f.name}`;
    }
  }
  return '';
}

export async function createTemplate(snap: Template): Promise<Result<Template>> {
  if (!loadedOnce) await loadTemplates();
  const bad = checkName(snap.name);
  if (bad) return { ok: false, why: bad };
  if (snap.rows.length > MAX_ROWS) return { ok: false, why: `Một mẫu tối đa ${MAX_ROWS} dòng.` };
  if (items.size >= MAX_TEMPLATES) return { ok: false, why: `Tối đa ${MAX_TEMPLATES} mẫu.` };
  const t: Template = { ...snap, id: newTemplateId(), name: clean(snap.name) };
  const next = new Map(items); next.set(t.id, t);
  return (await commit(next)) ? { ok: true, value: t } : { ok: false, why: FAIL };
}
export async function renameTemplate(id: string, name: string, now = Date.now()): Promise<Result> {
  const t = getTemplate(id);
  if (!t) return { ok: false, why: 'Không tìm thấy mẫu.' };
  const bad = checkName(name, id);
  if (bad) return { ok: false, why: bad };
  const next = new Map(items); next.set(id, { ...t, name: clean(name), updatedAt: Math.max(now, t.updatedAt + 1) });
  return (await commit(next)) ? { ok: true, value: undefined } : { ok: false, why: FAIL };
}
export async function duplicateTemplate(id: string, now = Date.now()): Promise<Result<Template>> {
  const t = getTemplate(id);
  if (!t) return { ok: false, why: 'Không tìm thấy mẫu.' };
  if (items.size >= MAX_TEMPLATES) return { ok: false, why: `Tối đa ${MAX_TEMPLATES} mẫu.` };
  let name = `${t.name} (bản sao)`.slice(0, NAME_MAX);
  for (let k = 2; checkName(name); k++) name = `${t.name.slice(0, NAME_MAX - 14)} (bản sao ${k})`;
  const c: Template = { ...t, id: newTemplateId(), name, createdAt: now, updatedAt: now, rows: t.rows.map((r) => ({ ...r, scope: { ...r.scope }, chain: [...r.chain] })), scoring: { ...t.scoring } };
  const next = new Map(items); next.set(c.id, c);
  return (await commit(next)) ? { ok: true, value: c } : { ok: false, why: FAIL };
}
export async function deleteTemplate(id: string): Promise<Result> {
  if (!getTemplate(id)) return { ok: false, why: 'Không tìm thấy mẫu.' };
  const next = new Map(items); next.delete(id);
  return (await commit(next)) ? { ok: true, value: undefined } : { ok: false, why: FAIL };
}

// ---------- tương thích với cây hiện tại ----------
export type RowState = 'ok' | 'mat' | 'doi-vi-tri';
export interface RowCheck { row: TplRow; state: RowState }
export interface Compat { rows: RowCheck[]; bad: number; taxChanged: boolean }
/** Mỗi dòng: còn nguyên / nút đã bị xóa / nút còn nhưng đổi vị trí (đổi cha). Không bao giờ tự ánh xạ sang nút khác. */
export function checkCompat(t: Template, tax: Taxonomy): Compat {
  const rows = t.rows.map((row): RowCheck => {
    const now = findChain(row.scope, tax);
    if (!now) return { row, state: 'mat' };
    if (row.chain.length && row.chain.join('/') !== now.join('/')) return { row, state: 'doi-vi-tri' };
    return { row, state: 'ok' };
  });
  return { rows, bad: rows.filter((r) => r.state !== 'ok').length, taxChanged: !!t.taxRev && t.taxRev !== taxRevision(tax) };
}

export type ApplyMode = 'replace' | 'add';
export interface Applied { draft: Draft; added: number; bad: number }
/**
 * Áp dụng mẫu vào bản nháp. Mã dòng luôn được cấp MỚI (không xung đột với dòng đang có).
 * - replace: thay ma trận, chính sách, điểm, số mã, lựa chọn trộn; bỏ câu khóa/loại/ngoại lệ (gắn với dòng cũ).
 * - add: chỉ thêm dòng vào cuối; chính sách, điểm, số mã và câu khóa của bản nháp giữ nguyên.
 * Dòng không còn hợp lệ được GIỮ (kèm `flag` và tên gốc) để giáo viên xem lại; chúng không khớp câu nào cho tới khi được sửa.
 */
export function applyTemplate(t: Template, d: Draft, tax: Taxonomy, mode: ApplyMode, newId: () => string): Applied {
  const cp = checkCompat(t, tax);
  const rows: Row[] = cp.rows.map(({ row, state }) => ({
    id: newId(), scope: { ...row.scope }, type: row.type, level: row.level, count: row.count, label: row.label || undefined,
    ...(state === 'ok' ? {} : { flag: state }),
  }));
  const bad = cp.bad;
  if (mode === 'add') return { draft: { ...d, rows: [...d.rows, ...rows] }, added: rows.length, bad };
  return {
    draft: { ...d, rows, locked: {}, rejected: [], exceptions: {}, policy: t.policy, scoring: { ...t.scoring }, count: t.codes, shuffleQuestions: t.shuffleQuestions, shuffleOptions: t.shuffleOptions },
    added: rows.length, bad,
  };
}

// ---------- sao lưu thủ công (file JSON) ----------
export const templatesForBackup = (): { v: 1; templates: unknown[] } => ({ v: 1, templates: [...items.values()].map((t) => (isOpaque(t) ? t.raw : t)) });
/**
 * Khôi phục từ file sao lưu JSON: GỘP (không xóa mẫu đang có), cùng ID giữ bản `updatedAt` mới hơn; mẫu khác thời điểm không bị trộn lẫn.
 * File cũ không có phần này (hoặc `v` không hỗ trợ) ⇒ không đổi gì. Bản ghi hỏng bị bỏ và đếm.
 */
export async function restoreTemplates(f: unknown): Promise<{ added: number; updated: number; dropped: number; saved: boolean }> {
  const x = f as { v?: number; templates?: unknown } | undefined;
  if (!x || x.v !== 1 || !Array.isArray(x.templates)) return { added: 0, updated: 0, dropped: 0, saved: true };
  if (!loadedOnce) await loadTemplates();
  if (!writable) return { added: 0, updated: 0, dropped: 0, saved: false };
  let incoming: Parsed;
  try { incoming = parseStore(JSON.stringify({ v: 1, templates: x.templates })); } catch { return { added: 0, updated: 0, dropped: 0, saved: true }; }
  const next = new Map(items);
  let added = 0, updated = 0;
  for (const [id, t] of incoming.items) {
    const cur = next.get(id);
    if (!cur) { if (next.size < MAX_TEMPLATES) { next.set(id, t); added++; } continue; }
    const w = newer(cur, t);
    if (w !== cur) { next.set(id, w); updated++; }
  }
  if (!added && !updated) return { added, updated, dropped: incoming.dropped, saved: true };
  return { added, updated, dropped: incoming.dropped, saved: await commit(next) };
}
/** Chặn mọi ghi tiếp theo (ngay trước khi thay cả tệp dữ liệu): kho trong bộ nhớ không được đè lên bản vừa khôi phục. */
export function freezeTemplates(): void { writable = false; }
