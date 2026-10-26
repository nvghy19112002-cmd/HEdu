// Quyết định của giáo viên về các cặp câu nghi trùng ("không phải trùng", "biến thể hợp lệ", "để xem sau").
// Lưu ở TỆP PHỤ (không nằm trong dữ liệu ngân hàng, không đổi schema 3). Mất tệp này không làm mất câu hỏi nào.
//
// Khoá bản ghi = cặp UID không thứ tự + "dấu vân tay nội dung" của CẢ HAI câu + phiên bản thuật toán.
// Không dùng #seq hay ID6 (chúng là nhãn hiển thị, không phải danh tính bền vững).
// Câu bị sửa nội dung ⇒ quyết định cũ HẾT HIỆU LỰC (cặp quay lại "Chưa xử lý"), không áp dụng mù quáng.
import { useSyncExternalStore } from 'react';
import { rawKeyOf } from './dup2';
import { idlessVariants } from './idtex';
import { invoke, isDesktop } from './platform';
import { getStorageMode, sqliteSidecar } from './storage';
import type { Question } from './types';

/** Tăng khi ý nghĩa của nhãn/so sánh đổi hẳn; quyết định ghi bởi phiên bản khác bị coi là cũ. */
export const DUP_ALGO_VERSION = 1;
export type PairDecision = 'not_duplicate' | 'legit_variant' | 'review_later';
export const DECISION_LABEL: Record<PairDecision, string> = {
  not_duplicate: 'Giữ cả hai — không phải trùng',
  legit_variant: 'Giữ cả hai — biến thể hợp lệ',
  review_later: 'Để xem sau',
};
export const WHY_CHOICES = ['Khác điều kiện', 'Khác số liệu', 'Khác hình', 'Cố ý giữ (đề/bài khác nhau)', 'Lý do khác'];

/** `ia`/`ib` (thêm sau, bản cũ bỏ qua): dấu mã nguồn đã bỏ vùng ID — để thêm/đổi `%[ID]` không làm quyết định thành "câu đã sửa". */
export interface DecisionRec { a: string; b: string; fa: string; fb: string; ia?: string; ib?: string; algo: number; d: PairDecision; why?: string; at: number }
/** Câu đã chuyển vào thùng rác (còn nguyên để khôi phục). */
export interface TrashRec { q: Question; at: number }
export type GoldLabel = 'true_dup' | 'keep_both' | 'different' | 'unsure';
export const GOLD_LABEL: Record<GoldLabel, string> = {
  true_dup: 'Trùng thật (chỉ cần giữ một câu)',
  keep_both: 'Giống nhưng giữ cả hai',
  different: 'Khác nhau',
  unsure: 'Chưa chắc',
};
/** Nhãn chuẩn do giáo viên gắn: dùng để đo độ chính xác của bộ dò trên ngân hàng thật. `kind` = nhãn của bộ dò lúc gắn ('none' = bộ dò không báo cặp này). */
export interface GoldRec { a: string; b: string; fa: string; fb: string; ia?: string; ib?: string; label: GoldLabel; kind: string; at: number }
/** Tệp phụ: `recs` giữ nguyên như bản beta.18 (bản cũ đọc được); `trash` và `gold` là phần thêm, bản cũ bỏ qua. */
export interface DecisionFile { v: 1; recs: DecisionRec[]; trash?: TrashRec[]; gold?: GoldRec[] }
export const TRASH_CAP = 1000;
export type DecisionStatus = 'none' | 'valid' | 'stale';

export interface Backend { load(): Promise<string | null>; save(json: string): Promise<void> }
const KEY = 'hedu.dup.v1';
const web: Backend = {
  async load() { try { return localStorage.getItem(KEY); } catch { return null; } },
  async save(json) { localStorage.setItem(KEY, json); },
};
const desktop: Backend = {
  load: () => invoke<string | null>('load_dup_decisions'),
  save: (json) => invoke<void>('save_dup_decisions', { json }),
};

let backend: Backend | null = null;
let recs = new Map<string, DecisionRec>();
let trash: TrashRec[] = [];
let gold = new Map<string, GoldRec>();
let loaded = false;
let writable = true;
let version = 0;
const subs = new Set<() => void>();
const emit = () => { version++; subs.forEach((f) => f()); };

export const pairKey = (x: string, y: string): string => (x <= y ? `${x}|${y}` : `${y}|${x}`);
const isRec = (r: unknown): r is DecisionRec => {
  const x = r as DecisionRec;
  return !!x && typeof x.a === 'string' && typeof x.b === 'string' && typeof x.fa === 'string' && typeof x.fb === 'string' && typeof x.algo === 'number' && typeof x.at === 'number'
    && (x.d === 'not_duplicate' || x.d === 'legit_variant' || x.d === 'review_later');
};

const isTrash = (r: unknown): r is TrashRec => { const x = r as TrashRec; return !!x && typeof x.at === 'number' && !!x.q && typeof x.q.uid === 'string' && typeof x.q.latex === 'string'; };
const isGold = (r: unknown): r is GoldRec => { const x = r as GoldRec; return !!x && typeof x.a === 'string' && typeof x.b === 'string' && typeof x.fa === 'string' && typeof x.fb === 'string' && typeof x.kind === 'string' && typeof x.at === 'number' && (x.label === 'true_dup' || x.label === 'keep_both' || x.label === 'different' || x.label === 'unsure'); };

/** Chỉ dùng trong kiểm thử. */
export function _reset(b: Backend | null) { backend = b; recs = new Map(); trash = []; gold = new Map(); loaded = false; writable = true; version = 0; }

export async function loadDecisions(): Promise<{ ok: boolean; error?: string }> {
  const be = backend ?? (isDesktop() ? (getStorageMode() === 'sqlite' ? sqliteSidecar : desktop) : web);
  backend = be;
  try {
    const json = await be.load();
    recs = new Map(); trash = []; gold = new Map();
    if (json) {
      const f = JSON.parse(json) as Partial<DecisionFile>;
      if (f.v !== 1 || !Array.isArray(f.recs)) throw new Error('Tệp quyết định có cấu trúc không hiểu được.');
      for (const r of f.recs) if (isRec(r)) recs.set(pairKey(r.a, r.b), r);
      if (Array.isArray(f.trash)) trash = f.trash.filter(isTrash);
      if (Array.isArray(f.gold)) for (const g of f.gold) if (isGold(g)) gold.set(pairKey(g.a, g.b), g);
    }
    loaded = true; writable = true; emit();
    return { ok: true };
  } catch (e) {
    // không ghi đè một tệp mình không đọc được
    loaded = true; writable = false; emit();
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const dump = (): string => JSON.stringify({ v: 1, recs: [...recs.values()], ...(trash.length ? { trash } : {}), ...(gold.size ? { gold: [...gold.values()] } : {}) } satisfies DecisionFile);
// Ghi lần lượt, không chồng nhau: bản ghi đến sau luôn là bản cuối cùng trên đĩa.
let chain: Promise<unknown> = Promise.resolve();
function persist(): Promise<boolean> {
  const run = async (): Promise<boolean> => {
    if (!writable || !backend) return false;
    try { await backend.save(dump()); return true; } catch { return false; }
  };
  const p = chain.then(run, run);
  chain = p;
  return p;
}

/** Các dấu chấp nhận được cho nội dung HIỆN TẠI của một câu: chính nó, và các bản trước khi HEdu thêm/đổi `%[ID]`. */
function keysNow(latex: string): string[] {
  return [rawKeyOf(latex), ...idlessVariants(latex).map(rawKeyOf)];
}
/** Dấu lưu kèm quyết định: `f` = mã nguồn như cũ (bản cũ đọc được), `i` = đã bỏ vùng ID. */
const keysToStore = (latex: string): { f: string; i: string } => ({ f: rawKeyOf(latex), i: rawKeyOf(idlessVariants(latex)[0] ?? latex) });
/** Câu còn đúng nội dung lúc lưu bản ghi (chỉ khác vùng ID cũng tính là còn đúng). */
function sameContent(latex: string, f: string, i: string | undefined): boolean {
  const now = keysNow(latex);
  return now.includes(f) || (!!i && now.includes(i));
}
const recMatches = (r: { a: string; b: string; fa: string; fb: string; ia?: string; ib?: string }, a: Question, b: Question): boolean => {
  const [x, y] = a.uid === r.a ? [a, b] : [b, a];
  return sameContent(x.latex, r.fa, r.ia) && sameContent(y.latex, r.fb, r.ib);
};

/** Trạng thái của quyết định đang lưu cho một cặp, đối chiếu với nội dung HIỆN TẠI của hai câu (bỏ qua vùng ID). */
export function statusOf(a: Question, b: Question): { status: DecisionStatus; rec?: DecisionRec } {
  const rec = recs.get(pairKey(a.uid, b.uid));
  if (!rec) return { status: 'none' };
  return recMatches(rec, a, b) && rec.algo === DUP_ALGO_VERSION ? { status: 'valid', rec } : { status: 'stale', rec };
}

/** true nếu đã ghi bền vững; false nếu chỉ giữ trong bộ nhớ (ghi lỗi hoặc tệp không đọc được). */
export async function setDecision(a: Question, b: Question, d: PairDecision, why?: string): Promise<boolean> {
  const [x, y] = a.uid <= b.uid ? [a, b] : [b, a];
  const kx = keysToStore(x.latex), ky = keysToStore(y.latex);
  recs.set(pairKey(a.uid, b.uid), { a: x.uid, b: y.uid, fa: kx.f, fb: ky.f, ia: kx.i, ib: ky.i, algo: DUP_ALGO_VERSION, d, ...(why ? { why } : {}), at: Date.now() });
  emit();
  return persist();
}
export async function clearDecision(a: Question, b: Question): Promise<boolean> {
  recs.delete(pairKey(a.uid, b.uid));
  emit();
  return persist();
}

export const decisionCount = (): number => recs.size;
export const isDecisionsWritable = (): boolean => writable;
export const decisionsLoaded = (): boolean => loaded;

export function exportDecisions(): string { return JSON.stringify({ v: 1, recs: [...recs.values()].sort((p, q) => p.at - q.at) }, null, 1); }
/** Xem trước (KHÔNG ghi gì): file nhập sẽ thêm / cập nhật / bỏ qua bao nhiêu bản ghi. */
export function previewImport(json: string): { added: number; updated: number; skipped: number } {
  const f = JSON.parse(json) as Partial<DecisionFile>;
  if (f.v !== 1 || !Array.isArray(f.recs)) throw new Error('Đây không phải file quyết định của HEdu.');
  let added = 0, updated = 0, skipped = 0;
  for (const r of f.recs) {
    if (!isRec(r)) { skipped++; continue; }
    const cur = recs.get(pairKey(r.a, r.b));
    if (!cur) added++; else if (r.at > cur.at) updated++; else skipped++;
  }
  return { added, updated, skipped };
}
/** Gộp từ file xuất; trùng khoá thì giữ bản MỚI hơn. */
export async function importDecisions(json: string): Promise<{ added: number; updated: number; skipped: number; saved: boolean }> {
  const plan = previewImport(json);
  const f = JSON.parse(json) as DecisionFile;
  for (const r of f.recs) {
    if (!isRec(r)) continue;
    const k = pairKey(r.a, r.b), cur = recs.get(k);
    if (!cur || r.at > cur.at) recs.set(k, r);
  }
  emit();
  return { ...plan, saved: await persist() };
}
/** Ghi lại ngay trạng thái hiện tại (nút "Thử lưu lại"). */
export const saveNow = (): Promise<boolean> => persist();
/** Quyết định hiện đang lưu cho một cặp (để hoàn tác). */
export const recOf = (a: string, b: string): DecisionRec | undefined => recs.get(pairKey(a, b));
/** Khôi phục đúng bản ghi cũ của một cặp (hoặc xoá nếu trước đó chưa có). */
export async function restoreRec(a: string, b: string, prev: DecisionRec | undefined): Promise<boolean> {
  if (prev) recs.set(pairKey(a, b), prev); else recs.delete(pairKey(a, b));
  emit();
  return persist();
}

export function useDecisions(): number {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => version, () => version);
}

// ---------- Thùng rác ----------
export const trashList = (): TrashRec[] => [...trash].sort((x, y) => y.at - x.at);
export const trashCount = (): number => trash.length;
/** Thùng rác còn đủ chỗ cho các câu này không? Câu đã nằm sẵn trong thùng rác chỉ bị thay bản ghi nên không tốn thêm chỗ. */
export function trashRoomFor(qs: readonly { uid: string }[]): boolean {
  const have = new Set(trash.map((t) => t.q.uid));
  let add = 0;
  for (const q of qs) if (!have.has(q.uid)) { have.add(q.uid); add++; }
  return trash.length + add <= TRASH_CAP;
}
/** Cất một câu vào thùng rác. true = đã ghi bền vững (chỉ khi đó mới nên xoá câu khỏi ngân hàng). */
export async function trashAdd(q: Question): Promise<boolean> {
  if (!writable || !backend) return false;
  if (!trashRoomFor([q])) return false; // đầy: TỪ CHỐI, không bao giờ âm thầm bỏ câu cũ nhất
  const rec: TrashRec = { q: JSON.parse(JSON.stringify(q)) as Question, at: Date.now() };
  const replaced = trash.find((t) => t.q.uid === q.uid);
  trash = [rec, ...trash.filter((t) => t.q.uid !== q.uid)];
  emit();
  const ok = await persist();
  if (!ok) { undoTrashChange([rec], replaced ? [replaced] : []); emit(); }
  return ok;
}
/**
 * Cất NHIỀU câu vào thùng rác bằng MỘT lần ghi. Hoặc cất đủ tất cả, hoặc không cất câu nào:
 * thiếu chỗ (> TRASH_CAP) ⇒ từ chối cả lô, không cắt bớt, không bỏ câu cũ; ghi lỗi ⇒ trả lại như cũ.
 */
export async function trashAddMany(qs: readonly Question[]): Promise<boolean> {
  if (!writable || !backend) return false;
  if (!trashRoomFor(qs)) return false;
  if (qs.length === 0) return true;
  const at = Date.now();
  const ids = new Set(qs.map((q) => q.uid));
  const added: TrashRec[] = qs.map((q) => ({ q: JSON.parse(JSON.stringify(q)) as Question, at }));
  const replaced = trash.filter((t) => ids.has(t.q.uid));
  trash = [...added, ...trash.filter((t) => !ids.has(t.q.uid))];
  emit();
  const ok = await persist();
  if (!ok) { undoTrashChange(added, replaced); emit(); }
  return ok;
}
/** Bỏ nhiều bản ghi khỏi thùng rác bằng MỘT lần ghi (dùng để hoàn tác khi xoá khỏi ngân hàng thất bại). */
export async function trashRemoveMany(uids: readonly string[]): Promise<boolean> {
  const rm = new Set(uids);
  const removed = trash.filter((t) => rm.has(t.q.uid));
  trash = trash.filter((t) => !rm.has(t.q.uid));
  emit();
  const ok = await persist();
  if (!ok) { undoTrashChange([], removed); emit(); }
  return ok;
}
export async function trashRemove(uid: string): Promise<boolean> {
  return trashRemoveMany([uid]);
}
/**
 * Hoàn lại CHỈ phần mà một thao tác thùng rác đã đổi khi ghi lỗi: bỏ các bản nó vừa thêm (nếu còn đúng bản đó),
 * đặt lại các bản nó vừa gỡ/thay (nếu chưa có bản khác cùng uid). Thao tác khác chạy chồng không bị cuốn về trạng thái cũ.
 */
function undoTrashChange(added: readonly TrashRec[], gone: readonly TrashRec[]): void {
  const addedSet = new Set(added);
  const kept = trash.filter((t) => !addedSet.has(t));
  const have = new Set(kept.map((t) => t.q.uid));
  trash = [...kept, ...gone.filter((t) => !have.has(t.q.uid))];
}

// ---------- Nhãn chuẩn ----------
export const goldList = (): GoldRec[] => [...gold.values()].sort((x, y) => x.at - y.at);
export const goldOf = (a: Question, b: Question): GoldRec | undefined => {
  const g = gold.get(pairKey(a.uid, b.uid));
  if (!g) return undefined;
  return recMatches(g, a, b) ? g : undefined; // câu đã sửa ⇒ nhãn cũ không còn dùng để đo (chỉ đổi ID thì vẫn dùng)
};
export async function goldSet(a: Question, b: Question, label: GoldLabel, kind: string): Promise<boolean> {
  const [x, y] = a.uid <= b.uid ? [a, b] : [b, a];
  const kx = keysToStore(x.latex), ky = keysToStore(y.latex);
  gold.set(pairKey(a.uid, b.uid), { a: x.uid, b: y.uid, fa: kx.f, fb: ky.f, ia: kx.i, ib: ky.i, label, kind, at: Date.now() });
  emit();
  return persist();
}
export async function goldClear(): Promise<boolean> { gold = new Map(); emit(); return persist(); }

// ---------- Sao lưu thủ công ----------
/** Phần tệp phụ đưa vào file sao lưu ngân hàng (quyết định, thùng rác, nhãn chuẩn). */
export function sidecarForBackup(): DecisionFile { return { v: 1, recs: [...recs.values()], trash, gold: [...gold.values()] }; }
/** Khôi phục phần tệp phụ từ file sao lưu: GỘP (không xoá thứ đang có); trùng khoá thì giữ bản mới hơn. */
export async function restoreSidecar(f: unknown): Promise<{ added: number; saved: boolean; skippedTrash: number }> {
  const x = f as Partial<DecisionFile> | undefined;
  if (!x || x.v !== 1 || !Array.isArray(x.recs)) return { added: 0, saved: true, skippedTrash: 0 };
  if (!loaded) await loadDecisions();
  let added = 0, skippedTrash = 0;
  for (const r of x.recs) { if (!isRec(r)) continue; const k = pairKey(r.a, r.b), cur = recs.get(k); if (!cur || r.at > cur.at) { recs.set(k, r); if (!cur) added++; } }
  if (Array.isArray(x.trash)) {
    // Thùng rác đầy thì KHÔNG cắt thứ đang có: câu nào không còn chỗ được bỏ qua và đếm lại để báo.
    const have = new Set(trash.map((u) => u.q.uid));
    for (const t of x.trash) {
      if (!isTrash(t) || have.has(t.q.uid)) continue;
      if (trash.length >= TRASH_CAP) { skippedTrash++; continue; }
      trash = [...trash, t]; have.add(t.q.uid); added++;
    }
    if (skippedTrash) console.warn(`Thùng rác đầy (${TRASH_CAP}): bỏ qua ${skippedTrash} câu trong file sao lưu.`);
  }
  if (Array.isArray(x.gold)) for (const g of x.gold) { if (!isGold(g)) continue; const k = pairKey(g.a, g.b), cur = gold.get(k); if (!cur || g.at > cur.at) { gold.set(k, g); if (!cur) added++; } }
  emit();
  return { added, saved: await persist(), skippedTrash };
}
