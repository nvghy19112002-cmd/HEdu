// Thanh tab nhiều đề ở Thư viện đề thi: tab "Thư viện" cố định + mỗi đề đang mở một tab.
// Logic thuần (mở/đóng/chuyển tab, nhớ tab khi tắt app) + hàng đợi biên dịch chung (tối đa 2 đề cùng lúc).

/** số đề mở cùng lúc tối đa */
export const MAX_TABS = 8;
/** số đề biên dịch song song tối đa (đề thứ ba chờ lượt) */
export const MAX_COMPILE = 2;
export const TABS_KEY = 'hedu.examtabs';

/** `front` = id đề đang xem; null = tab Thư viện */
export interface TabsState { ids: string[]; front: string | null }
export const EMPTY_TABS: TabsState = { ids: [], front: null };

/** Mở đề: đã mở thì chỉ chuyển sang; quá giới hạn thì trả `full` (không đóng tab nào tự động). */
export function openTab(s: TabsState, id: string): TabsState | 'full' {
  if (s.ids.includes(id)) return s.front === id ? s : { ...s, front: id };
  if (s.ids.length >= MAX_TABS) return 'full';
  return { ids: [...s.ids, id], front: id };
}

/** Đóng tab: nếu đang xem tab đó thì sang tab bên phải (hết thì bên trái, hết nữa thì về Thư viện). */
export function closeTab(s: TabsState, id: string): TabsState {
  const i = s.ids.indexOf(id);
  if (i < 0) return s;
  const ids = s.ids.filter((x) => x !== id);
  const front = s.front !== id ? s.front : ids[i] ?? ids[i - 1] ?? null;
  return { ids, front };
}

/** Ctrl+Tab / Ctrl+Shift+Tab: đi vòng qua Thư viện và các đề. */
export function cycleTab(s: TabsState, dir: 1 | -1): TabsState {
  const ring: (string | null)[] = [null, ...s.ids];
  const i = ring.indexOf(s.front);
  return { ...s, front: ring[(i + dir + ring.length) % ring.length] };
}

/** Bỏ tab của đề không còn trong thư viện (đã xoá/chuyển Thùng rác ở nơi khác). */
export function keepExisting(s: TabsState, exists: (id: string) => boolean): TabsState {
  const ids = s.ids.filter(exists);
  if (ids.length === s.ids.length) return s;
  return { ids, front: s.front && ids.includes(s.front) ? s.front : null };
}

export function parseTabs(raw: string | null): TabsState {
  try {
    const v = JSON.parse(raw || 'null');
    if (!v || !Array.isArray(v.ids)) return EMPTY_TABS;
    const ids = [...new Set((v.ids as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 200))].slice(0, MAX_TABS);
    return { ids, front: typeof v.front === 'string' && ids.includes(v.front) ? v.front : null };
  } catch { return EMPTY_TABS; }
}
export const serializeTabs = (s: TabsState) => JSON.stringify({ ids: s.ids, front: s.front });

export function loadTabs(): TabsState {
  try { return parseTabs(localStorage.getItem(TABS_KEY)); } catch { return EMPTY_TABS; }
}
export function saveTabs(s: TabsState) {
  try { if (s.ids.length) localStorage.setItem(TABS_KEY, serializeTabs(s)); else localStorage.removeItem(TABS_KEY); } catch { /* không lưu được thì thôi */ }
}

/** Trạng thái một tab đề, do không gian biên tập báo lên. */
export interface TabStatus { dirty: boolean; compile: 'idle' | 'waiting' | 'running' | 'ok' | 'failed' }

/** Hàng đợi lượt biên dịch: `acquire()` chờ tới khi còn chỗ, trả hàm trả lượt (gọi nhiều lần cũng chỉ trả một lần). */
export function makeSlots(max: number) {
  let used = 0;
  const wait: (() => void)[] = [];
  const release = () => {
    const next = wait.shift();
    if (next) next(); else used--;
  };
  return {
    acquire(): Promise<() => void> {
      const once = () => { let done = false; return () => { if (!done) { done = true; release(); } }; };
      if (used < max) { used++; return Promise.resolve(once()); }
      return new Promise((res) => wait.push(() => res(once())));
    },
    get busy() { return used; },
    get waiting() { return wait.length; },
  };
}

export const compileSlots = makeSlots(MAX_COMPILE);
