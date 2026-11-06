// Mở hộp "Trình chiếu" từ bất kỳ màn nào (Ngân hàng, Thư viện đề, Xử lí TeX). SlideHost (gắn ở App) vẽ hộp và màn chiếu.
import { useSyncExternalStore } from 'react';
import type { DeckItem } from './slidedeck';

export interface SlideRequest { source: string; items: DeckItem[] }

let req: SlideRequest | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** Mở hộp Trình chiếu với các câu `items` (có thể rỗng: chỉ xem các bộ đã lưu). */
export function openSlides(source: string, items: DeckItem[]) { req = { source, items }; emit(); }
export function closeSlides() { req = null; emit(); }
export function useSlideRequest(): SlideRequest | null {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => req, () => null);
}

/** Đồng hồ mm:ss (giờ nếu quá 60 phút). */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(r)}` : `${two(m)}:${two(r)}`;
}

export const ZOOM_MIN = 1, ZOOM_MAX = 3, ZOOM_STEP = 0.15, ZOOM_DEFAULT = 1.7;
export const clampZoom = (z: number): number => Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 100) / 100;
