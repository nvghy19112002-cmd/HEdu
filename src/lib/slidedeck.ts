// Bộ trình chiếu câu hỏi: danh sách câu (chụp nguyên văn LaTeX lúc thêm, không phụ thuộc sửa đổi sau của ngân hàng) có tên, lưu bền
// trong tệp phụ SQLite (khoá "slide-decks"; bản xem trên web dùng localStorage). Hàm thuần + kho nhỏ; ghi tuần tự, chỉ báo đã lưu khi ghi xong.
import { useSyncExternalStore } from 'react';
import { invoke, isDesktop } from './platform';
import { getStorageMode } from './storage';

export interface DeckItem { latex: string; /** UID câu trong ngân hàng (nếu lấy từ ngân hàng) */ uid?: string }
export interface Deck { id: string; name: string; createdAt: number; updatedAt: number; items: DeckItem[] }

export const MAX_ITEMS = 300;
const KEY = 'slide-decks';

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Đọc tệp phụ; bỏ qua bộ hỏng thay vì làm hỏng cả danh sách. */
export function parseDecks(text: string | null): Deck[] {
  if (!text) return [];
  let j: Record<string, unknown>;
  try { j = obj(JSON.parse(text)); } catch { return []; }
  if (j.v !== 1 || !Array.isArray(j.decks)) return [];
  const out: Deck[] = [];
  for (const d of j.decks) {
    const o = obj(d);
    if (typeof o.id !== 'string' || typeof o.name !== 'string' || !Array.isArray(o.items)) continue;
    const items: DeckItem[] = [];
    for (const it of o.items) {
      const x = obj(it);
      if (typeof x.latex !== 'string' || !x.latex.trim()) continue;
      items.push(typeof x.uid === 'string' ? { latex: x.latex, uid: x.uid } : { latex: x.latex });
    }
    out.push({ id: o.id, name: o.name, createdAt: typeof o.createdAt === 'number' ? o.createdAt : 0, updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : 0, items });
  }
  return out;
}
export const dumpDecks = (ds: readonly Deck[]): string => JSON.stringify({ v: 1, decks: ds });

/** Thêm câu vào bộ, bỏ câu trùng (cùng UID, hoặc cùng nguyên văn khi không có UID), giữ thứ tự, tối đa MAX_ITEMS. */
export function mergeItems(cur: readonly DeckItem[], add: readonly DeckItem[]): { items: DeckItem[]; added: number; skipped: number } {
  const seen = new Set(cur.map((x) => x.uid ?? `\u0000${x.latex}`));
  const items = [...cur];
  let added = 0, skipped = 0;
  for (const x of add) {
    const k = x.uid ?? `\u0000${x.latex}`;
    if (seen.has(k) || items.length >= MAX_ITEMS) { skipped++; continue; }
    seen.add(k); items.push(x); added++;
  }
  return { items, added, skipped };
}

export const cleanName = (s: string): string => s.replace(/\s+/g, ' ').trim().slice(0, 120);

// ---------- kho ----------
interface Backend { load(): Promise<string | null>; save(json: string): Promise<void> }
const web: Backend = {
  async load() { try { return localStorage.getItem('hedu.slidedecks.v1'); } catch { return null; } },
  async save(json) { localStorage.setItem('hedu.slidedecks.v1', json); },
};
const sqlite: Backend = {
  load: () => invoke<string | null>('db_sidecar_get', { key: KEY }),
  save: (json) => invoke<void>('db_apply', { upserts: [], deletes: [], meta: [], sidecar: [[KEY, json]] }),
};
const none: Backend = { async load() { return null; }, async save() { throw new Error('Chế độ lưu này không có nơi lưu bộ trình chiếu (cần dữ liệu SQLite).'); } };

let backend: Backend | null = null;
let decks: Deck[] = [];
let loaded: Promise<void> | null = null;
let version = 0;
let chain: Promise<unknown> = Promise.resolve();
const subs = new Set<() => void>();
const bump = () => { version++; subs.forEach((f) => f()); };

export function _resetDecks(b: Backend | null) { backend = b; decks = []; loaded = null; version = 0; chain = Promise.resolve(); }
const be = () => (backend = backend ?? (isDesktop() ? (getStorageMode() === 'sqlite' ? sqlite : none) : web));

export function loadDecks(): Promise<void> {
  if (!loaded) loaded = be().load().then((t) => { decks = parseDecks(t); bump(); }).catch(() => { loaded = null; });
  return loaded;
}
export const listDecks = (): Deck[] => decks;
export function useDecks(): Deck[] {
  useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => version);
  return decks;
}

/** Ghi thay đổi `f` (trên bản sao); lỗi ghi thì giữ nguyên danh sách cũ và ném lỗi. */
function commit(f: (ds: Deck[]) => Deck[]): Promise<Deck[]> {
  const run = async () => {
    await loadDecks();
    const next = f(decks.map((d) => ({ ...d, items: [...d.items] })));
    await be().save(dumpDecks(next));
    decks = next; bump();
    return next;
  };
  const p = chain.then(run, run);
  chain = p.catch(() => undefined);
  return p;
}

const newId = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export async function createDeck(name: string, items: readonly DeckItem[]): Promise<Deck> {
  const n = cleanName(name);
  if (!n) throw new Error('Bộ trình chiếu cần có tên.');
  const now = Date.now();
  const d: Deck = { id: newId(), name: n, createdAt: now, updatedAt: now, items: mergeItems([], items).items };
  await commit((ds) => [d, ...ds]);
  return d;
}
export async function addToDeck(id: string, items: readonly DeckItem[]): Promise<{ added: number; skipped: number }> {
  let r = { added: 0, skipped: 0 };
  await commit((ds) => ds.map((d) => { if (d.id !== id) return d; const m = mergeItems(d.items, items); r = { added: m.added, skipped: m.skipped }; return { ...d, items: m.items, updatedAt: Date.now() }; }));
  return r;
}
export const renameDeck = (id: string, name: string) => { const n = cleanName(name); if (!n) return Promise.reject(new Error('Tên không được để trống.')); return commit((ds) => ds.map((d) => (d.id === id ? { ...d, name: n, updatedAt: Date.now() } : d))); };
export const deleteDeck = (id: string) => commit((ds) => ds.filter((d) => d.id !== id));
/** Bỏ một câu khỏi bộ (vị trí `i`). */
export const removeItem = (id: string, i: number) => commit((ds) => ds.map((d) => (d.id === id ? { ...d, items: d.items.filter((_, k) => k !== i), updatedAt: Date.now() } : d)));
