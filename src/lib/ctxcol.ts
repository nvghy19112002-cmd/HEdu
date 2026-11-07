// Cột ngữ cảnh (vd. Mục lục của Câu hỏi): ẩn/hiện bằng Ctrl+B hoặc nút ⇤, máy nhớ lựa chọn. Hàm thuần + kho nhỏ.
import { useSyncExternalStore } from 'react';

const KEY = 'hedu.ctxcol';
let hidden = (() => { try { return localStorage.getItem(KEY) === 'an'; } catch { return false; } })();
const subs = new Set<() => void>();

export const ctxHidden = (): boolean => hidden;
export function setCtxHidden(v: boolean) {
  if (v === hidden) return;
  hidden = v;
  try { localStorage.setItem(KEY, v ? 'an' : 'hien'); } catch { /* chỉ là tiện lợi */ }
  subs.forEach((f) => f());
}
export const toggleCtx = () => setCtxHidden(!hidden);
export function useCtxHidden(): boolean {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => hidden, () => false);
}

/** Phím Ctrl+B (không kèm Shift/Alt), bỏ qua khi đang gõ trong ô nhập hoặc trình soạn (Ctrl+B ở đó có thể là in đậm). */
export function isCtxKey(e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }, target: { tagName?: string; isContentEditable?: boolean; closest?: (s: string) => unknown } | null): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'b') return false;
  const tag = (target?.tagName ?? '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return false;
  if (target?.closest && target.closest('.cm-editor')) return false;
  return true;
}
