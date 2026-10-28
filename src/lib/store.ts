// Kho dữ liệu của app.
// - Bản xem thử trên web: lưu trong localStorage của trình duyệt.
// - Bản cài Windows: lưu thành file trong thư mục dữ liệu của app (Rust, src-tauri/src/storage.rs),
//   ghi an toàn, có bản dự phòng, và nằm ngoài thư mục cài nên cập nhật app không đụng tới.
// Phần giao diện chỉ làm việc với useBank() và các hàm bên dưới, không biết dữ liệu nằm ở đâu.
import { useSyncExternalStore } from 'react';
import { parseExTest } from './extest';
import { sameExceptId, writeHeadId } from './idtex';
import { CURRENT_SCHEMA, migrate, SchemaNewerError } from './migrate';
import { invoke, isDesktop } from './platform';
import { seedQuestions } from './seed';
import type { Level, ReviewStatus, Location, Question, Taxonomy } from './types';
import { getTaxonomy, resetTaxonomy, setTaxonomy } from './curriculum';
import { idStatus, strictCode } from './idsync';
import { restoreSidecar, sidecarForBackup } from './dupdecisions';
import { idReviewForBackup, restoreIdReview } from './idreview';
import { restoreTemplates, templatesForBackup } from './examtemplates';
import { getStorageMode, sqlitePersistence, storageBootError } from './storage';

export interface AppState {
  schema: number;
  questions: Question[];
  nextSeq: number;
  /** Cây mục lục đang dùng; null = dùng cây mặc định đi kèm bản cài. */
  taxonomy: Taxonomy | null;
}

/** Các thay đổi cần ghi (chế độ SQLite ghi gia tăng: chỉ câu đã đổi/xoá + thông tin chung đã đổi). */
export interface Delta { upserts: string[]; deletes: string[]; meta: [string, string][] }
/** Dữ liệu đọc từ SQLite: thông tin chung ở dạng chữ như đã lưu + danh sách câu đã phân tích. */
export interface LoadedRaw { schema: string | null; nextSeq: string | null; taxonomy: string | null; questions: Question[] }

export interface Persistence {
  load(): Promise<{ json: string | null; recovered?: boolean }>;
  save(json: string): Promise<void>;
  /** chỉ chế độ SQLite: nạp theo trang; null = nguồn mới tinh */
  loadParsed?(): Promise<LoadedRaw | null>;
  /** chỉ chế độ SQLite: ghi các thay đổi (idempotent, gửi lại được) */
  saveDelta?(d: Delta): Promise<void>;
}

const KEY = 'hedu.bank.v1';

const webPersistence: Persistence = {
  async load() {
    try { return { json: localStorage.getItem(KEY) }; } catch { return { json: null }; }
  },
  async save(json) {
    try { localStorage.setItem(KEY, json); } catch { /* bộ nhớ trình duyệt bị chặn: chỉ giữ trong phiên */ }
  },
};

const desktopPersistence: Persistence = {
  async load() {
    const r = await invoke<{ json: string | null; recovered: boolean }>('load_data');
    return { json: r.json, recovered: r.recovered };
  },
  async save(json) {
    await invoke<void>('save_data', { json });
  },
};

export type BootResult =
  | { ok: true; recovered: boolean; firstRun: boolean }
  | { ok: false; kind: 'schema-newer'; found: number }
  | { ok: false; kind: 'unreadable'; message: string };

let persistence: Persistence = webPersistence;
let state: AppState = { schema: CURRENT_SCHEMA, questions: [], nextSeq: 1, taxonomy: null };
let writable = true;
const listeners = new Set<() => void>();

/** Chạy một lần trước khi vẽ giao diện: đọc dữ liệu đã lưu. */
export async function initStore(p?: Persistence): Promise<BootResult> {
  persistence = p ?? (isDesktop() ? (getStorageMode() === 'sqlite' ? sqlitePersistence : desktopPersistence) : webPersistence);
  savedRefs = new Map();
  savedMeta = null;
  const openErr = p ? null : storageBootError();
  if (openErr) {
    writable = false; // không ghi gì vào nguồn không mở được
    return { ok: false, kind: 'unreadable', message: openErr };
  }
  try {
    let raw: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
    let recovered = false;
    if (persistence.loadParsed) {
      const r = await persistence.loadParsed();
      if (r) {
        raw = { schema: r.schema != null ? Number(r.schema) : undefined, questions: r.questions, nextSeq: r.nextSeq != null ? Number(r.nextSeq) : undefined, taxonomy: r.taxonomy != null ? JSON.parse(r.taxonomy) : null };
        savedRefs = new Map(r.questions.map((q) => [q.uid, q] as const));
        savedMeta = { schema: r.schema, nextSeq: r.nextSeq, taxonomy: r.taxonomy };
      }
    } else {
      const l = await persistence.load();
      recovered = !!l.recovered;
      if (l.json != null) raw = JSON.parse(l.json);
    }
    if (raw == null) {
      // Lần chạy đầu: bản web nạp câu mẫu để xem thử; bản cài bắt đầu với ngân hàng trống.
      if (!isDesktop()) {
        const qs = seedQuestions();
        state = { schema: CURRENT_SCHEMA, questions: qs, nextSeq: qs.length + 1, taxonomy: null };
      }
      return { ok: true, recovered: false, firstRun: true };
    }
    const m = migrate(raw);
    const migrated = m.schema !== (raw.schema ?? 1);
    state = {
      schema: m.schema,
      questions: m.questions,
      nextSeq: Math.max(Number(m.nextSeq) || 0, ...m.questions.map((q: Question) => q.seq + 1), 1),
      taxonomy: m.taxonomy ?? null,
    };
    if (state.taxonomy) setTaxonomy(state.taxonomy);
    if (migrated) schedule();
    return { ok: true, recovered: !!recovered, firstRun: false };
  } catch (e) {
    writable = false; // không ghi đè dữ liệu mà mình không hiểu
    if (e instanceof SchemaNewerError) return { ok: false, kind: 'schema-newer', found: e.found };
    return { ok: false, kind: 'unreadable', message: e instanceof Error ? e.message : String(e) };
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
let pending: Promise<void> = Promise.resolve();

function schedule() {
  if (!writable) return;
  clearTimeout(timer);
  timer = setTimeout(() => { void flushSave(); }, 300);
}

/** Ghi ngay mọi thay đổi còn chờ (gọi trước khi cập nhật app, đóng app). */
export function flushSave(): Promise<void> {
  clearTimeout(timer);
  if (!writable) return pending;
  const p = persistence;
  if (p.saveDelta) {
    const snap = state;
    pending = pending.then(async () => {
      const d = diffSince(snap);
      if (d) await p.saveDelta!(d);
      commitSaved(snap);
      lastSaveOk = true;
    }).catch((e) => {
      lastSaveOk = false; // savedRefs giữ nguyên ⇒ lần lưu sau gửi lại đúng phần chưa xong
      console.error('Không ghi được dữ liệu', e);
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('hedu-save-error', { detail: String(e) }));
    });
    return pending;
  }
  const json = JSON.stringify(state);
  pending = pending.then(() => persistence.save(json).then(() => { lastSaveOk = true; })).catch((e) => {
    lastSaveOk = false;
    console.error('Không ghi được dữ liệu', e);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('hedu-save-error', { detail: String(e) }));
  });
  return pending;
}
let lastSaveOk = true;

// ---- Ghi gia tăng (SQLite): so với lần ghi thành công gần nhất theo THAM CHIẾU từng câu (mọi thao tác sửa đều tạo đối tượng mới) ----
let savedRefs = new Map<string, Question>();
let savedMeta: { schema: string | null; nextSeq: string | null; taxonomy: string | null } | null = null;
const metaOf = (s: AppState) => ({ schema: String(s.schema), nextSeq: String(s.nextSeq), taxonomy: JSON.stringify(s.taxonomy) });

function diffSince(s: AppState): Delta | null {
  const upserts: string[] = [];
  const seen = new Set<string>();
  for (const q of s.questions) {
    seen.add(q.uid);
    if (savedRefs.get(q.uid) !== q) upserts.push(JSON.stringify(q));
  }
  const deletes: string[] = [];
  for (const u of savedRefs.keys()) if (!seen.has(u)) deletes.push(u);
  const cur = metaOf(s);
  const meta: [string, string][] = [];
  for (const k of ['schema', 'nextSeq', 'taxonomy'] as const) if (savedMeta?.[k] !== cur[k]) meta.push([k, cur[k]]);
  return upserts.length || deletes.length || meta.length ? { upserts, deletes, meta } : null;
}

function commitSaved(s: AppState): void {
  savedRefs = new Map(s.questions.map((q) => [q.uid, q] as const));
  savedMeta = metaOf(s);
}
/** Lần ghi gần nhất xuống đĩa có thành công không (dùng để báo trung thực sau khi nhập hàng loạt). */
export const isLastSaveOk = (): boolean => lastSaveOk;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => { void flushSave(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flushSave(); });
}

function set(next: AppState) {
  state = next;
  schedule();
  listeners.forEach((l) => l());
}

export function useBank(): AppState {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => state,
  );
}

export function getState(): AppState { return state; }

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export interface Draft extends Location { latex: string; level: Level; tags: string[] }

/** Lưu câu mới (uid rỗng) hoặc cập nhật câu cũ. Trả về câu đã lưu. */
export function saveQuestion(draft: Draft, existingUid?: string): Question {
  const type = parseExTest(draft.latex).type;
  const now = Date.now();
  if (existingUid) {
    const old = state.questions.find((q) => q.uid === existingUid);
    if (old) {
      const q: Question = { ...old, ...draft, type, updatedAt: now };
      // Nội dung đã được duyệt/đánh dấu nhưng LaTeX hoặc loại câu đổi → phải kiểm tra lại.
      // Chỉ thêm/đổi ID trong vùng `%[ID]` (đổi vị trí, mức độ) KHÔNG phải sửa nội dung ⇒ giữ trạng thái kiểm duyệt.
      if (old.review && (!sameExceptId(draft.latex, old.latex) || type !== old.type)) delete q.review;
      set({ ...state, questions: state.questions.map((x) => (x.uid === q.uid ? q : x)) });
      return q;
    }
  }
  const q: Question = { ...draft, type, uid: uid(), seq: state.nextSeq, createdAt: now, updatedAt: now };
  set({ ...state, questions: [...state.questions, q], nextSeq: state.nextSeq + 1 });
  return q;
}

/**
 * Đổi trạng thái kiểm duyệt của một câu và ĐỢI ghi xuống đĩa xong mới báo kết quả.
 * Trả về true nếu đã lưu bền vững; false nếu không lưu được (trạng thái cũ được khôi phục).
 */
export async function setReview(id: string, status: ReviewStatus | undefined): Promise<boolean> {
  if (!writable) return false;
  const old = state.questions.find((q) => q.uid === id);
  if (!old) return false;
  if (old.review === status) return true;
  const q: Question = { ...old };
  if (status) q.review = status; else delete q.review; // giữ updatedAt: kiểm duyệt không phải sửa nội dung
  set({ ...state, questions: state.questions.map((x) => (x.uid === id ? q : x)) });
  await flushSave();
  if (lastSaveOk) return true;
  // ghi lỗi: chỉ trả lại ĐÚNG câu này (nếu chưa bị sửa tiếp); sửa đổi khác xảy ra lúc chờ ghi được giữ
  set({ ...state, questions: state.questions.map((x) => (x === q ? old : x)) });
  return false;
}

export interface BatchResult { ok: boolean; /** số câu thật sự đổi và đã ghi bền vững */ changed: number; /** số câu được yêu cầu */ total: number }

/**
 * Sửa nhiều câu trong MỘT lần: một lần cập nhật bộ nhớ, một lần ghi đĩa, rồi kiểm tra lần ghi có thành công không.
 * `fn` trả null = không đổi câu đó. Ghi lỗi (hoặc kho chỉ-đọc) ⇒ hoàn lại các câu thao tác này đã đổi, changed = 0, ok = false.
 * Chỉ hoàn lại câu còn ĐÚNG như thao tác này đã ghi: sửa đổi khác xảy ra trong lúc chờ ghi (câu khác, hoặc chính câu đó sửa tiếp)
 * được giữ nguyên, không bị cuốn theo về trạng thái cũ.
 * Độ phức tạp O(N) cho kho N câu (tra bằng Set), không gọi saveQuestion từng câu.
 */
export async function updateMany(uids: Iterable<string>, fn: (q: Question) => Question | null): Promise<BatchResult> {
  const want = new Set(uids);
  const total = want.size;
  if (!writable) return { ok: false, changed: 0, total };
  const mine = new Map<string, { old: Question; now: Question }>();
  const questions = state.questions.map((q) => {
    if (!want.has(q.uid)) return q;
    const n = fn(q);
    if (!n) return q;
    mine.set(q.uid, { old: q, now: n });
    return n;
  });
  if (mine.size === 0) return { ok: true, changed: 0, total };
  set({ ...state, questions });
  await flushSave();
  if (lastSaveOk) return { ok: true, changed: mine.size, total };
  set({ ...state, questions: state.questions.map((q) => (mine.get(q.uid)?.now === q ? mine.get(q.uid)!.old : q)) });
  return { ok: false, changed: 0, total };
}

/**
 * Xoá nhiều câu khỏi ngân hàng bằng MỘT lần cập nhật + MỘT lần ghi đĩa, rồi kiểm tra ghi có thành công không.
 * Ghi lỗi (hoặc kho chỉ-đọc) ⇒ hoàn lại đủ mọi câu, ok = false. CHỈ gọi sau khi các câu đã nằm bền vững trong thùng rác.
 */
export async function deleteMany(uids: Iterable<string>): Promise<BatchResult> {
  const want = new Set(uids);
  const total = want.size;
  if (!writable) return { ok: false, changed: 0, total };
  const removed = state.questions.filter((q) => want.has(q.uid));
  const questions = state.questions.filter((q) => !want.has(q.uid));
  const changed = removed.length;
  if (changed === 0) return { ok: true, changed: 0, total };
  set({ ...state, questions });
  await flushSave();
  if (lastSaveOk) return { ok: true, changed, total };
  // ghi lỗi: đặt lại ĐÚNG các câu lô này đã gỡ (nếu chưa có câu cùng uid), giữ nguyên sửa đổi khác xảy ra lúc chờ ghi
  const have = new Set(state.questions.map((q) => q.uid));
  set({ ...state, questions: [...state.questions, ...removed.filter((q) => !have.has(q.uid))] });
  return { ok: false, changed: 0, total };
}

/**
 * Đưa NHIỀU câu từ thùng rác trở lại ngân hàng bằng MỘT lần cập nhật + MỘT lần ghi (giữ uid, nội dung; số thứ tự cũ nếu còn trống,
 * nếu đã có câu khác dùng thì cấp số mới như restoreQuestion). Câu đã có uid trong ngân hàng thì bỏ qua (không ghi đè).
 * Ghi lỗi ⇒ hoàn lại, ok = false.
 */
export async function restoreMany(qs: readonly Question[]): Promise<BatchResult> {
  const r = await restoreManyEx(qs);
  return { ok: r.ok, changed: r.restored.length, total: r.total };
}

export interface RestoreManyResult {
  /** ghi ngân hàng xuống đĩa có thành công không (false ⇒ KHÔNG câu nào được đưa về) */
  ok: boolean;
  total: number;
  /** các câu đã đưa về, kèm số thứ tự cũ → mới (khác nhau khi số cũ đã có câu khác dùng) */
  restored: { uid: string; fromSeq: number; toSeq: number }[];
  /** uid đã có sẵn trong ngân hàng: KHÔNG ghi đè, KHÔNG tính là đã khôi phục */
  existing: string[];
}

/**
 * Như restoreMany nhưng trả chi tiết từng câu (để báo "#0142 → #0291" và biết câu nào bỏ qua vì đã có).
 * Ghi lỗi ⇒ chỉ gỡ ĐÚNG các câu lô này vừa thêm, ok = false, restored = [].
 */
export async function restoreManyEx(qs: readonly Question[]): Promise<RestoreManyResult> {
  const total = qs.length;
  if (!writable) return { ok: false, total, restored: [], existing: [] };
  const have = new Set(state.questions.map((x) => x.uid));
  const seqs = new Set(state.questions.map((x) => x.seq));
  let next = state.nextSeq;
  const add: Question[] = [];
  const restored: RestoreManyResult['restored'] = [];
  const existing: string[] = [];
  for (const q of qs) {
    if (have.has(q.uid)) { existing.push(q.uid); continue; }
    have.add(q.uid);
    const b: Question = seqs.has(q.seq) ? { ...q, seq: next } : q;
    seqs.add(b.seq);
    next = Math.max(next, b.seq + 1);
    add.push(b);
    restored.push({ uid: q.uid, fromSeq: q.seq, toSeq: b.seq });
  }
  if (add.length === 0) return { ok: true, total, restored: [], existing };
  set({ ...state, questions: [...state.questions, ...add], nextSeq: Math.max(state.nextSeq, next) });
  await flushSave();
  if (lastSaveOk) return { ok: true, total, restored, existing };
  const mine = new Set(add);
  set({ ...state, questions: state.questions.filter((q) => !mine.has(q)) }); // nextSeq chỉ lớn hơn một chút: vô hại
  return { ok: false, total, restored: [], existing };
}

export function addMany(drafts: Draft[]): Question[] {
  const now = Date.now();
  let seq = state.nextSeq;
  const added = drafts.map((d) => ({ ...d, type: parseExTest(d.latex).type, uid: uid(), seq: seq++, createdAt: now, updatedAt: now }));
  set({ ...state, questions: [...state.questions, ...added], nextSeq: seq });
  return added;
}

export function deleteQuestion(id: string) {
  set({ ...state, questions: state.questions.filter((q) => q.uid !== id) });
}

/** Đưa lại một câu lấy từ thùng rác, giữ nguyên uid và số thứ tự cũ. Trả false nếu uid đã có (không ghi đè). */
export function restoreQuestion(q: Question): boolean {
  if (state.questions.some((x) => x.uid === q.uid)) return false;
  const seqTaken = state.questions.some((x) => x.seq === q.seq);
  const back: Question = seqTaken ? { ...q, seq: state.nextSeq } : q; // số cũ đã có câu khác dùng ⇒ cấp số mới, không đụng câu kia
  set({ ...state, questions: [...state.questions, back], nextSeq: Math.max(state.nextSeq, back.seq + 1) });
  return true;
}

export function duplicateQuestion(id: string): Question | undefined {
  const q = state.questions.find((x) => x.uid === id);
  if (!q) return undefined;
  return saveQuestion({ latex: q.latex, level: q.level, tags: [...q.tags], grade: q.grade, chapterId: q.chapterId, lessonId: q.lessonId, formId: q.formId });
}

export function exportBackup(): string {
  return JSON.stringify({ app: 'HEdu', exportedAt: new Date().toISOString(), ...state, dupSidecar: sidecarForBackup(), idReview: idReviewForBackup(), examTemplates: templatesForBackup() }, null, 2);
}

/** Khôi phục từ file sao lưu (thay toàn bộ). Trả về số câu. */
export function importBackup(json: string): number {
  const m = migrate(JSON.parse(json));
  const questions = m.questions as Question[];
  const nextSeq = Math.max(Number(m.nextSeq) || 0, ...questions.map((q) => q.seq + 1), 1);
  writable = true;
  const taxonomy = (m.taxonomy ?? null) as Taxonomy | null;
  if (taxonomy) setTaxonomy(taxonomy); else resetTaxonomy();
  set({ schema: m.schema, questions, nextSeq, taxonomy });
  // quyết định trùng / thùng rác / nhãn chuẩn đi kèm file sao lưu: GỘP vào tệp phụ hiện có (không xoá gì)
  if (m.dupSidecar) void restoreSidecar(m.dupSidecar).catch(() => undefined);
  // trạng thái xác minh ID (Dạng/mức độ): cũng GỘP; file sao lưu cũ không có phần này ⇒ các câu là "chưa xác minh"
  if (m.idReview) void restoreIdReview(m.idReview, new Set(questions.map((q) => q.uid))).catch(() => undefined);
  // mẫu ma trận đề: cũng GỘP (cùng ID giữ bản mới hơn); file sao lưu cũ không có phần này ⇒ không đổi mẫu nào
  if (m.examTemplates) void restoreTemplates(m.examTemplates).catch(() => undefined);
  return questions.length;
}

/** Đổi cây mục lục đang dùng và ghi vào dữ liệu (null = quay về cây mặc định). */
export function applyTaxonomy(tax: Taxonomy | null) {
  if (tax) setTaxonomy(tax); else resetTaxonomy();
  set({ ...state, taxonomy: tax });
}

/**
 * Đổi cây (đổi mã một nút…) và giữ ID trong LaTeX nhất quán, trong CÙNG một lần cập nhật: câu đang KHỚP ID theo cây cũ mà ID6 đổi theo
 * cây mới ⇒ thay đúng chữ mã trong vùng `%[ID]`. Câu đang lệch/lỗi giữ nguyên LaTeX (vẫn hiện là cần xử lý). Trả số câu đã cập nhật.
 */
export function applyTaxonomyKeepIds(next: Taxonomy): number {
  const before = getTaxonomy();
  let n = 0;
  const questions = state.questions.map((q) => {
    const st = idStatus(q, before);
    if (st.state !== 'khop' || !st.meta.ok) return q;
    const sc = strictCode(q, q.level, next);
    if (!sc.ok || sc.code === st.meta.code) return q;
    const w = writeHeadId(q.latex, sc.code, 'thay');
    if (w.action !== 'thay') return q;
    n++;
    return { ...q, latex: w.latex };
  });
  setTaxonomy(next);
  set({ ...state, taxonomy: next, questions: n ? questions : state.questions });
  return n;
}

export function resetToSample() {
  const qs = seedQuestions();
  set({ ...state, questions: qs, nextSeq: qs.length + 1 });
}

/** Thêm bộ câu mẫu vào ngân hàng hiện có (dùng cho bản cài, khi mới bắt đầu). */
export function addSamples(): number {
  const drafts: Draft[] = seedQuestions().map((q) => ({ latex: q.latex, level: q.level, tags: ['Mẫu'], grade: q.grade, chapterId: q.chapterId, lessonId: q.lessonId, formId: q.formId }));
  return addMany(drafts).length;
}
