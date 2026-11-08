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

// ——— Cách chiếu (lưu theo máy) ———
export interface PlayOpts {
  /** đếm ngược mỗi câu */
  countdown: boolean;
  /** hết giờ tự hiện đáp án */
  autoAnswer: boolean;
  /** trộn thứ tự câu khi chiếu (bộ đã lưu không đổi) */
  shuffle: boolean;
  /** cho xem lời giải (phím G) */
  allowSolution: boolean;
  /** số giây mặc định theo loại câu */
  secs: { tn: number; ds: number; tln: number; tl: number };
  /** nền khi chiếu: tối (phòng tối) hoặc sáng (máy chiếu phòng sáng) */
  theme: 'dark' | 'light';
}
export const DEFAULT_PLAY: PlayOpts = { countdown: false, autoAnswer: true, shuffle: false, allowSolution: true, secs: { tn: 60, ds: 120, tln: 180, tl: 300 }, theme: 'dark' };
const PLAY_KEY = 'hedu.slides.opts';
const clampSec = (n: unknown, d: number) => { const v = Math.round(Number(n)); return Number.isFinite(v) && v >= 5 && v <= 3600 ? v : d; };
export function parsePlayOpts(raw: string | null): PlayOpts {
  try {
    const o = JSON.parse(raw ?? 'null') as Partial<PlayOpts> | null;
    if (!o || typeof o !== 'object') return DEFAULT_PLAY;
    const s = (o.secs ?? {}) as Partial<PlayOpts['secs']>;
    const b = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
    return {
      countdown: b(o.countdown, DEFAULT_PLAY.countdown), autoAnswer: b(o.autoAnswer, DEFAULT_PLAY.autoAnswer), shuffle: b(o.shuffle, DEFAULT_PLAY.shuffle), allowSolution: b(o.allowSolution, DEFAULT_PLAY.allowSolution),
      secs: { tn: clampSec(s.tn, 60), ds: clampSec(s.ds, 120), tln: clampSec(s.tln, 180), tl: clampSec(s.tl, 300) },
      theme: o.theme === 'light' ? 'light' : 'dark',
    };
  } catch { return DEFAULT_PLAY; }
}
export function loadPlayOpts(): PlayOpts { try { return parsePlayOpts(localStorage.getItem(PLAY_KEY)); } catch { return DEFAULT_PLAY; } }
export function savePlayOpts(o: PlayOpts) { try { localStorage.setItem(PLAY_KEY, JSON.stringify(o)); } catch { /* tiện lợi */ } }
/** trộn (Fisher–Yates) bằng hàm ngẫu nhiên truyền vào để kiểm thử được */
export function shuffled<T>(xs: readonly T[], rnd: () => number = Math.random): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/** ước tính tổng thời gian (giây) của một bộ theo loại từng câu */
export const estimateSecs = (types: readonly ('tn' | 'ds' | 'tln' | 'tl')[], o: PlayOpts): number => types.reduce((s, t) => s + o.secs[t], 0);
