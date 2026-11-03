// Chọn nhiều đề trong Thư viện đề (thuần, không phụ thuộc giao diện): bấm = chọn một, Ctrl+bấm = thêm/bớt, Shift+bấm = chọn cả đoạn.
export interface Selection {
  /** đề "đang nhắm" (hiện ở ngăn thông tin khi chỉ chọn một đề) */
  primary: string | null;
  picked: ReadonlySet<string>;
  /** điểm mốc để Shift+bấm chọn đoạn */
  anchor: string | null;
}
export const NO_SELECTION: Selection = { primary: null, picked: new Set(), anchor: null };
export interface Mods { ctrl: boolean; shift: boolean }

const one = (id: string): Selection => ({ primary: id, picked: new Set([id]), anchor: id });

/** `order` = thứ tự các đề đang hiện trên màn (đã lọc, đã sắp xếp). */
export function clickSelect(s: Selection, id: string, order: readonly string[], m: Mods): Selection {
  if (m.shift && s.anchor && order.includes(s.anchor) && order.includes(id)) {
    const a = order.indexOf(s.anchor), b = order.indexOf(id);
    const range = order.slice(Math.min(a, b), Math.max(a, b) + 1);
    const picked = new Set(m.ctrl ? [...s.picked, ...range] : range);
    return { primary: id, picked, anchor: s.anchor };
  }
  if (m.ctrl || m.shift) {
    const picked = new Set(s.picked);
    if (picked.has(id) && m.ctrl) {
      picked.delete(id);
      const left = order.filter((x) => picked.has(x));
      return { primary: s.primary === id ? left[left.length - 1] ?? null : s.primary, picked, anchor: id };
    }
    picked.add(id);
    return { primary: id, picked, anchor: id };
  }
  return one(id);
}

/** ↑/↓ (có Shift: mở rộng đoạn chọn từ điểm mốc). */
export function stepSelect(s: Selection, order: readonly string[], dir: 1 | -1, extend: boolean): Selection {
  if (!order.length) return s;
  const i = s.primary ? order.indexOf(s.primary) : -1;
  const n = dir === 1 ? Math.min(order.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
  return clickSelect(s, order[n], order, { ctrl: false, shift: extend });
}

export function selectAll(order: readonly string[]): Selection {
  return order.length ? { primary: order[order.length - 1], picked: new Set(order), anchor: order[0] } : NO_SELECTION;
}

/** Bỏ khỏi vùng chọn những đề không còn tồn tại hoặc không còn hiện (đã lọc mất). */
export function pruneSelection(s: Selection, alive: ReadonlySet<string>): Selection {
  if ([...s.picked].every((x) => alive.has(x)) && (!s.primary || alive.has(s.primary))) return s;
  const picked = new Set([...s.picked].filter((x) => alive.has(x)));
  const primary = s.primary && picked.has(s.primary) ? s.primary : [...picked].pop() ?? null;
  return { primary, picked, anchor: s.anchor && picked.has(s.anchor) ? s.anchor : primary };
}

/** Các đề đã chọn theo thứ tự hiện trên màn. */
export const pickedItems = <T extends { id: string }>(items: readonly T[], s: Selection): T[] => items.filter((e) => s.picked.has(e.id));

export interface BatchResult<T> { done: T[]; failed: { item: T; error: string }[] }
/** Chạy lần lượt, một đề lỗi không làm dừng cả lô. */
export async function runBatch<T>(items: readonly T[], f: (x: T) => Promise<void>): Promise<BatchResult<T>> {
  const r: BatchResult<T> = { done: [], failed: [] };
  for (const item of items) {
    try { await f(item); r.done.push(item); } catch (e) { r.failed.push({ item, error: e instanceof Error ? e.message : String(e) }); }
  }
  return r;
}
