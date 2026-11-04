// Lịch sử phiên bản của câu hỏi: mỗi lần LƯU câu có đổi nội dung, bản cũ được cất lại để xem, so sánh và khôi phục.
// Lưu ở tệp phụ (cùng cách với trạng thái xác minh ID); mất tệp phụ chỉ mất lịch sử, không ảnh hưởng câu hỏi. Có trần để không phình.
import { invoke } from './platform';

export interface QVersion { /** lúc bản này được thay thế (ms) */ at: number; latex: string }
export const KEEP_PER_QUESTION = 20;
export const MAX_TOTAL_CHARS = 6_000_000;

export type History = Map<string, QVersion[]>;

/** Thêm bản cũ `old` của câu `uid` (mới nhất ở cuối). Bản trùng bản liền trước thì bỏ. Trả true nếu có thêm. */
export function addVersion(h: History, uid: string, old: string, at: number): boolean {
  if (!old.trim()) return false;
  const list = h.get(uid) ?? [];
  if (list.length && list[list.length - 1].latex === old) return false;
  list.push({ at, latex: old });
  while (list.length > KEEP_PER_QUESTION) list.shift();
  h.set(uid, list);
  return true;
}

/** Giữ tổng dung lượng dưới trần: bỏ các bản CŨ NHẤT (theo thời gian) của mọi câu trước. */
export function trimTotal(h: History, max = MAX_TOTAL_CHARS): void {
  let total = 0;
  for (const l of h.values()) for (const v of l) total += v.latex.length;
  if (total <= max) return;
  const all: { uid: string; at: number; n: number }[] = [];
  for (const [uid, l] of h) for (const v of l) all.push({ uid, at: v.at, n: v.latex.length });
  all.sort((a, b) => a.at - b.at);
  for (const o of all) {
    if (total <= max * 0.9) break;
    const l = h.get(o.uid);
    if (!l) continue;
    const k = l.findIndex((v) => v.at === o.at);
    if (k >= 0) { l.splice(k, 1); total -= o.n; }
    if (!l.length) h.delete(o.uid);
  }
}

export const serialize = (h: History): string => JSON.stringify({ v: 1, h: Object.fromEntries([...h].filter(([, l]) => l.length)) });

export function parse(json: string | null): History {
  const h: History = new Map();
  try {
    const o = JSON.parse(json ?? 'null') as { v?: number; h?: Record<string, unknown> } | null;
    if (!o || o.v !== 1 || !o.h || typeof o.h !== 'object') return h;
    for (const [uid, l] of Object.entries(o.h)) {
      if (!Array.isArray(l)) continue;
      const ok = l.filter((x): x is QVersion => !!x && typeof (x as QVersion).at === 'number' && typeof (x as QVersion).latex === 'string').slice(-KEEP_PER_QUESTION);
      if (ok.length) h.set(uid, ok);
    }
  } catch { /* hỏng thì coi như chưa có lịch sử */ }
  return h;
}

// ---------- kho trong bộ nhớ + tệp phụ ----------
interface Backend { load(): Promise<string | null>; save(json: string): Promise<void> }
const KEY = 'q-history';
const web: Backend = {
  async load() { try { return localStorage.getItem('hedu.qhistory.v1'); } catch { return null; } },
  async save(json) { try { localStorage.setItem('hedu.qhistory.v1', json); } catch { /* đầy bộ nhớ trình duyệt thì thôi */ } },
};
const sqlite: Backend = {
  load: () => invoke<string | null>('db_sidecar_get', { key: KEY }),
  save: (json) => invoke<void>('db_apply', { upserts: [], deletes: [], meta: [], sidecar: [[KEY, json]] }),
};
let hist: History = new Map();
let backend: Backend | null = null;
let timer: number | null = null;
const subs = new Set<() => void>();

const none: Backend = { async load() { return null; }, async save() { /* chế độ JSON cũ không có tệp phụ: không lưu lịch sử */ } };

/** `sqlite` = bản cài Windows chế độ SQLite; `web` = bản trình duyệt; `none` = chế độ JSON cũ (không có chỗ lưu). */
export async function loadQHistory(mode: 'sqlite' | 'web' | 'none'): Promise<void> {
  backend = mode === 'sqlite' ? sqlite : mode === 'web' ? web : none;
  try { hist = parse(await backend.load()); } catch { hist = new Map(); }
  subs.forEach((f) => f());
}

function schedule() {
  if (!backend) return;
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    trimTotal(hist);
    void backend?.save(serialize(hist)).catch(() => undefined);
  }, 3000);
}

/** Gọi khi một câu được lưu và nội dung đổi: `old` là LaTeX trước khi đổi. */
export function recordVersion(uid: string, old: string, at = Date.now()): void {
  if (addVersion(hist, uid, old, at)) { schedule(); subs.forEach((f) => f()); }
}
export const versionsOf = (uid: string): QVersion[] => [...(hist.get(uid) ?? [])].reverse();
export const onQHistory = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
