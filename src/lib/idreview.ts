// Trạng thái xác minh ID của từng câu (PR 1C; claude/phuong-an-gan-id-hoan-chinh.md mục 3).
// Lưu ở TỆP PHỤ (khoá `id-review` trong SQLite; không đổi schema 3). Mất tệp ⇒ mọi câu là "chưa xác minh" (hướng an toàn).
//   Dạng:    chua (chưa xác minh) · may (máy phân loại) · gv (giáo viên xác minh) · xem-lai (cần xem lại)
//   Mức độ:  chua · may · gv        — tách riêng với Dạng; nội dung duyệt (`Question.review`) cũng tách riêng.
// "máy" KHÔNG BAO GIỜ tự thành "gv": chỉ hành động xác nhận của giáo viên mới tạo "gv".
// Hết hiệu lực (xem `effectiveOf`): nội dung đổi (không tính vùng %[ID]), Dạng/mức độ đã lưu khác của câu; riêng "máy" còn hết hiệu lực khi cây đổi.
import { useSyncExternalStore } from 'react';
import { rawKeyOf } from './dup2';
import { idlessVariants } from './idtex';
import { invoke, isDesktop } from './platform';
import { getStorageMode } from './storage';
import type { TaxIndex } from './taxonomy';
import { checkLocation } from './taxpath';
import type { Level, Question } from './types';

export type FormState = 'chua' | 'may' | 'gv' | 'xem-lai';
export type LevelState = 'chua' | 'may' | 'gv';
/** Nguồn của ID: tệp (ID có sẵn trong tệp nhập), AI ngoài, gợi ý nội bộ, AI trong app, giáo viên tự chọn, soát ngân hàng. */
export type IdSource = 'tep' | 'ai-ngoai' | 'goi-y' | 'ai' | 'tay' | 'soat';

export const FORM_STATE_LABEL: Record<FormState, string> = { chua: 'Chưa xác minh', may: 'Máy phân loại', gv: 'Giáo viên xác minh', 'xem-lai': 'Cần xem lại' };
export const LEVEL_STATE_LABEL: Record<LevelState, string> = { chua: 'Chưa xác minh', may: 'Máy đề xuất', gv: 'Giáo viên xác minh' };
export const SOURCE_LABEL: Record<IdSource, string> = { tep: 'ID trong tệp', 'ai-ngoai': 'AI ngoài', 'goi-y': 'Gợi ý trong app', ai: 'AI trong app', tay: 'Giáo viên chọn', soat: 'Soát ngân hàng' };

export interface ReviewRec {
  form: FormState;
  level: LevelState;
  src: IdSource;
  /** Dạng và mức độ của câu lúc ghi bản ghi: câu bị đổi sau đó ⇒ bản ghi hết hiệu lực */
  formId: string;
  level0: Level;
  /** dấu nội dung: `f` = mã nguồn nguyên văn, `i` = đã bỏ vùng ID */
  f: string;
  i: string;
  /** phiên bản cây lúc ghi (chỉ trạng thái "máy" phụ thuộc) */
  taxRev: string;
  at: number;
  /** câu Chưa có ID: nằm ở mục "Chưa có ID" (vị trí lưu chỉ là chỗ giữ, không phải Dạng), không ghi ID giả, không làm căn cứ cho câu khác */
  unclassified?: boolean;
  /** lớp giáo viên chọn cho câu Chưa có ID lúc nhập; vắng = chưa rõ lớp (KHÔNG suy từ vị trí giữ chỗ) */
  lop?: number;
  why?: string;
  /** mã ID NGUYÊN BẢN trong tệp nguồn lúc nhập (giữ để truy ngược khi LaTeX đã đổi ID) */
  orig?: string;
  /** Dạng (formId) mà máy đề xuất lúc nhập/soát, khác Dạng đang lưu (câu bất đồng chờ xác minh) */
  prop?: string;
  /** lịch sử quyết định, mới nhất trước (tối đa HIST_MAX); không bao giờ bị xoá khi đổi trạng thái */
  hist?: HistEntry[];
}

/** Trạng thái TRƯỚC khi bản ghi bị thay: để truy ngược "ai quyết định gì, lúc nào". */
export interface HistEntry { at: number; form: FormState; level: LevelState; src: IdSource; formId: string; why?: string }
export const HIST_MAX = 30;

export interface Effective { form: FormState; level: LevelState; unclassified: boolean; src?: IdSource; why?: string; rec?: ReviewRec }
const NONE: Effective = { form: 'chua', level: 'chua', unclassified: false };

/** Dấu nội dung lưu kèm bản ghi (cùng cách với quyết định dò trùng: thêm/đổi `%[ID]` không làm câu thành "đã sửa"). */
export const contentKeys = (latex: string): { f: string; i: string } => ({ f: rawKeyOf(latex), i: rawKeyOf(idlessVariants(latex)[0] ?? latex) });
const sameContent = (latex: string, r: { f: string; i: string }): boolean => {
  const now = [rawKeyOf(latex), ...idlessVariants(latex).map(rawKeyOf)];
  return now.includes(r.f) || now.includes(r.i);
};

export interface EffCtx { ix: TaxIndex; taxRev: string }

/** Trạng thái CÓ HIỆU LỰC của một câu, đối chiếu bản ghi với câu hiện tại và cây hiện tại. Không có bản ghi / bản ghi cũ ⇒ chưa xác minh. */
export function effectiveOf(q: Question, rec: ReviewRec | undefined, ctx: EffCtx): Effective {
  if (!rec) return NONE;
  if (rec.formId !== q.formId || !sameContent(q.latex, rec)) return NONE; // câu đã bị đổi Dạng hoặc nội dung sau lần ghi
  const levelOk = rec.level0 === q.level;
  const level: LevelState = levelOk ? rec.level : 'chua';
  let form: FormState = rec.form;
  if (form === 'may' && rec.taxRev !== ctx.taxRev) form = 'chua'; // máy phân loại theo cây cũ: hết hiệu lực
  if (form === 'gv' && !checkLocation(ctx.ix, q).ok) form = 'xem-lai'; // đường dẫn không còn đúng trong cây: cần xem lại
  return { form, level, unclassified: !!rec.unclassified && form !== 'gv', src: rec.src, ...(rec.why ? { why: rec.why } : {}), rec };
}

/**
 * Câu có thể làm căn cứ kiểm chứng cho câu khác: CHỈ câu có Dạng "giáo viên xác minh" (và không chưa phân loại / cần xem lại).
 * Nội dung "Đã duyệt" là việc khác (đề, đáp án, lời giải, hình): chỉ để tham khảo, KHÔNG tự thành nhãn ID chuẩn.
 */
/** Lớp đáng tin của câu: câu Chưa có ID dùng lớp giáo viên chọn khi nhập (null = chưa rõ), không dùng lớp của vị trí giữ chỗ. */
export const gradeOfEff = (q: Question, e: Effective): number | null => (e.unclassified ? e.rec?.lop ?? null : q.grade);
/** Giữ dấu "Chưa có ID" (+ lớp đã biết) khi ghi bản ghi mới cho câu chưa được đặt vào Dạng thật. */
export const keepNoId = (e: Effective): { unclassified?: true; lop?: number } => (e.unclassified ? { unclassified: true, ...(e.rec?.lop != null ? { lop: e.rec.lop } : {}) } : {});

export const isEvidence = (_q: Question, eff: Effective): boolean => !eff.unclassified && eff.form === 'gv';

/** Bản ghi mới cho một câu (đọc `q` ở thời điểm ghi). */
export function makeRec(q: Question, o: { form: FormState; level?: LevelState; src: IdSource; taxRev: string; unclassified?: boolean; lop?: number; why?: string; at?: number; orig?: string; prop?: string }): ReviewRec {
  const k = contentKeys(q.latex);
  return { form: o.form, level: o.level ?? 'chua', src: o.src, formId: q.formId, level0: q.level, f: k.f, i: k.i, taxRev: o.taxRev, at: o.at ?? Date.now(), ...(o.unclassified ? { unclassified: true, ...(o.lop != null ? { lop: o.lop } : {}) } : {}), ...(o.why ? { why: o.why } : {}), ...(o.orig ? { orig: o.orig } : {}), ...(o.prop ? { prop: o.prop } : {}) };
}

// ---------- kho trong bộ nhớ + tệp phụ ----------
export interface Backend { load(): Promise<string | null>; save(json: string): Promise<void> }
const KEY = 'id-review';
const web: Backend = {
  async load() { try { return localStorage.getItem('hedu.idreview.v1'); } catch { return null; } },
  async save(json) { localStorage.setItem('hedu.idreview.v1', json); },
};
const sqlite: Backend = {
  load: () => invoke<string | null>('db_sidecar_get', { key: KEY }),
  save: (json) => invoke<void>('db_apply', { upserts: [], deletes: [], meta: [], sidecar: [[KEY, json]] }),
};
/** Chế độ JSON cũ không có tệp phụ: giữ trong phiên (hướng an toàn: lần mở sau mọi câu là "chưa xác minh"). */
const none: Backend = { async load() { return null; }, async save() { /* không lưu */ } };
let backend: Backend | null = null;
let recs = new Map<string, ReviewRec>();
let writable = true;
let version = 0;
const subs = new Set<() => void>();
const emit = () => { version++; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f); };

const FORMS: readonly string[] = ['chua', 'may', 'gv', 'xem-lai'];
const LEVELS_: readonly string[] = ['chua', 'may', 'gv'];
const SRC: readonly string[] = ['tep', 'ai-ngoai', 'goi-y', 'ai', 'tay', 'soat'];
const isHist = (h: unknown): h is HistEntry => { const x = h as HistEntry; return !!x && typeof x.at === 'number' && FORMS.includes(x.form) && LEVELS_.includes(x.level) && SRC.includes(x.src) && typeof x.formId === 'string'; };
const isRec = (r: unknown): r is ReviewRec => {
  const x = r as ReviewRec;
  return !!x && FORMS.includes(x.form) && LEVELS_.includes(x.level) && SRC.includes(x.src) && typeof x.formId === 'string' && typeof x.level0 === 'string'
    && typeof x.f === 'string' && typeof x.i === 'string' && typeof x.taxRev === 'string' && typeof x.at === 'number'
    && (x.orig === undefined || typeof x.orig === 'string') && (x.lop === undefined || typeof x.lop === 'number') && (x.prop === undefined || typeof x.prop === 'string') && (x.hist === undefined || (Array.isArray(x.hist) && x.hist.every(isHist)));
};
/**
 * Quy tắc khi CÙNG MỘT uid có nhiều bản ghi (xác định, không phụ thuộc thứ tự duyệt): bản có `at` MỚI hơn thắng; bằng nhau thì bản có lịch sử dài hơn;
 * vẫn bằng nhau thì bản giữ trạng thái "an toàn hơn" (không phải giáo viên xác minh). JSON dạng đối tượng không thể có khoá lặp (khoá lặp chỉ còn bản cuối),
 * nên quy tắc này áp dụng cho dạng mảng `[{ uid, ...bản ghi }]` và cho việc gộp hai nguồn (`restoreIdReview`).
 */
export function newerRec(a: ReviewRec, b: ReviewRec): ReviewRec {
  if (a.at !== b.at) return a.at > b.at ? a : b;
  const ha = a.hist?.length ?? 0, hb = b.hist?.length ?? 0;
  if (ha !== hb) return ha > hb ? a : b;
  return a.form === 'gv' && b.form !== 'gv' ? b : a.form !== 'gv' && b.form === 'gv' ? a : a;
}
export const parseReview = (json: string | null): Map<string, ReviewRec> => {
  const m = new Map<string, ReviewRec>();
  if (!json) return m;
  const f = JSON.parse(json) as { v?: number; recs?: unknown };
  if (f.v !== 1 || !f.recs || typeof f.recs !== 'object') throw new Error('Tệp trạng thái xác minh có cấu trúc không hiểu được.');
  const put = (uid: string, r: unknown) => { if (isRec(r)) { const cur = m.get(uid); m.set(uid, cur ? newerRec(cur, r) : r); } };
  if (Array.isArray(f.recs)) { for (const e of f.recs) { const x = e as { uid?: unknown }; if (x && typeof x.uid === 'string') { const { uid, ...rest } = e as { uid: string } & Record<string, unknown>; put(uid, rest); } } }
  else for (const [uid, r] of Object.entries(f.recs as Record<string, unknown>)) put(uid, r);
  return m;
};
const dump = (): string => JSON.stringify({ v: 1, recs: Object.fromEntries(recs) });

/** Chỉ dùng trong kiểm thử. */
export function _resetReview(b: Backend | null) { backend = b; recs = new Map(); writable = true; loadedOnce = false; dirty = false; version = 0; chain = Promise.resolve(); timer = null; }

export async function loadIdReview(): Promise<{ ok: boolean; error?: string }> {
  backend = backend ?? (isDesktop() ? (getStorageMode() === 'sqlite' ? sqlite : none) : web);
  try {
    recs = parseReview(await backend.load());
    writable = true; loadedOnce = true; dirty = false; emit();
    return { ok: true };
  } catch (e) {
    // không ghi đè một tệp mình không đọc được
    recs = new Map(); writable = false; loadedOnce = true; dirty = false; emit();
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

let chain: Promise<unknown> = Promise.resolve();
let timer: ReturnType<typeof setTimeout> | null = null;
/** Có thay đổi chưa ghi. Không có gì để ghi ⇒ "đã ghi" (kể cả khi tệp phụ hỏng/bị chặn ghi: không chặn việc cập nhật/khôi phục vô cớ). */
let dirty = false;
function persist(): Promise<boolean> {
  const run = async (): Promise<boolean> => {
    if (!dirty) return true;
    if (!writable || !backend) return false;
    try { dirty = false; await backend.save(dump()); return true; } catch { dirty = true; return false; }
  };
  const p = chain.then(run, run);
  chain = p;
  return p;
}
/** Ghi ngay mọi thay đổi đang chờ; true nếu đã ghi bền vững. */
export function flushIdReview(): Promise<boolean> { if (timer) { clearTimeout(timer); timer = null; } return persist(); }
const schedule = () => { if (timer) return; timer = setTimeout(() => { timer = null; void persist(); }, 400); };

export const getRec = (uid: string): ReviewRec | undefined => recs.get(uid);
export const reviewCount = (): number => recs.size;
/** Đặt (hoặc thay) bản ghi cho nhiều câu. Ghi tệp trễ ~0,4 giây (gộp nhiều thay đổi); gọi `flushIdReview` để ghi ngay. */
export function putRecs(list: readonly (readonly [string, ReviewRec])[]): void {
  if (!list.length) return;
  for (const [uid, r] of list) {
    const prev = recs.get(uid);
    // lịch sử quyết định: trạng thái cũ được đẩy vào `hist`, không bao giờ bị mất khi đổi (kể cả "Bỏ xác nhận")
    const hist = prev ? [{ at: prev.at, form: prev.form, level: prev.level, src: prev.src, formId: prev.formId, ...(prev.why ? { why: prev.why } : {}) }, ...(prev.hist ?? [])].slice(0, HIST_MAX) : r.hist;
    recs.set(uid, { ...r, ...(r.orig === undefined && prev?.orig ? { orig: prev.orig } : {}), ...(hist && hist.length ? { hist } : {}) });
  }
  dirty = true;
  emit(); schedule();
}
/**
 * Đặt và GHI BỀN VỮNG. Ghi lỗi (đĩa đầy, tệp trạng thái hỏng/bị chặn ghi) ⇒ TRẢ LẠI đúng trạng thái cũ và trả false:
 * không bao giờ để một câu hiện là "giáo viên xác minh" khi điều đó chưa được lưu (sau khi mở lại app sẽ mất, còn trong phiên thì đang làm căn cứ giả).
 */
export async function commitRecs(list: readonly (readonly [string, ReviewRec])[]): Promise<boolean> {
  const wasDirty = dirty;
  const prev = list.map(([uid]) => [uid, recs.get(uid)] as const);
  putRecs(list);
  if (await flushIdReview()) return true;
  for (const [uid, r] of prev) { if (r) recs.set(uid, r); else recs.delete(uid); }
  dirty = wasDirty;
  emit();
  return false;
}
/** Đặt lại NGUYÊN bản ghi (hoặc xoá nếu undefined) — chỉ cho "Hoàn tác" trong hàng đợi; không thêm vào lịch sử. */
export function setRecRaw(uid: string, rec: ReviewRec | undefined): void {
  if (rec) recs.set(uid, rec); else recs.delete(uid);
  dirty = true;
  emit(); schedule();
}
export function dropRec(uid: string): void { if (recs.delete(uid)) { dirty = true; emit(); schedule(); } }
export const isWritable = (): boolean => writable;
let loadedOnce = false;
export const idReviewLoaded = (): boolean => loadedOnce;
/** Chặn mọi ghi tiếp theo (dùng ngay trước khi thay cả tệp dữ liệu): bản ghi cũ trong bộ nhớ không được đè lên bản vừa khôi phục. */
export function freezeIdReview(): void { writable = false; dirty = false; if (timer) { clearTimeout(timer); timer = null; } }

// ---------- sao lưu thủ công (file JSON) ----------
/** Phần trạng thái xác minh đưa vào file sao lưu JSON. */
export const idReviewForBackup = (): { v: 1; recs: Record<string, ReviewRec> } => ({ v: 1, recs: Object.fromEntries(recs) });
/**
 * Khôi phục từ file sao lưu JSON: GỘP (không xoá thứ đang có); trùng khoá thì giữ bản MỚI hơn theo thời điểm. Bản ghi vẫn phải qua `effectiveOf`
 * (khớp nội dung/Dạng/mức độ của câu) nên bản ghi không còn khớp câu nào chỉ nằm đó, không gây hại.
 */
export async function restoreIdReview(f: unknown, known?: ReadonlySet<string>): Promise<{ added: number; saved: boolean; orphans: number }> {
  const x = f as { v?: number; recs?: unknown } | undefined;
  if (!x || x.v !== 1 || !x.recs || typeof x.recs !== 'object') return { added: 0, saved: true, orphans: 0 };
  if (!loadedOnce) await loadIdReview();
  let incoming: Map<string, ReviewRec>;
  try { incoming = parseReview(JSON.stringify({ v: 1, recs: x.recs })); } catch { return { added: 0, saved: true, orphans: 0 }; }
  let added = 0, orphans = 0;
  for (const [uid, r] of incoming) {
    // `known` = các uid của ngân hàng vừa khôi phục: bản ghi của câu không tồn tại (mồ côi) bị bỏ, không tạo xác minh nào
    if (known && !known.has(uid)) { orphans++; continue; }
    const cur = recs.get(uid);
    if (!cur) { recs.set(uid, r); dirty = true; added++; }
    else { const win = newerRec(cur, r); if (win !== cur) { recs.set(uid, win); dirty = true; } }
  }
  emit();
  return { added, saved: await flushIdReview(), orphans };
}
/** Vẽ lại khi kho trạng thái đổi. */
export const useIdReview = (): number => useSyncExternalStore(subscribe, () => version, () => version);
