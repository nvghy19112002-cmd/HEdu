// Gọi TeX Live để vẽ hình TikZ. Chỉ chạy ở bản cài Windows; bản xem thử trên web
// vẫn hiện khung giữ chỗ.
import { invoke, isDesktop } from './platform';

export interface TikzOut { svg: string; cached: boolean; ms: number }
export interface TikzErr { message: string; log: string; stage: 'latex' | 'svg' | 'thieu-texlive' | 'qua-lau' }

export interface TikzSettings {
  /** tự vẽ hình khi mở câu hỏi; tắt thì chỉ vẽ khi bấm nút */
  auto: boolean;
  engine: 'pdflatex' | 'lualatex' | 'xelatex';
  /** để trống = dùng đầu file mặc định của app */
  preamble: string;
  timeoutSecs: number;
}

const KEY = 'hedu.tikz';
export const DEFAULT_SETTINGS: TikzSettings = { auto: true, engine: 'pdflatex', preamble: '', timeoutSecs: 40 };

export function getSettings(): TikzSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function setSettings(s: TikzSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* bỏ qua */ }
  bump();
}

const subs = new Set<() => void>();
let version = 0;
function bump() { version++; cache.clear(); subs.forEach((f) => f()); }
export function onSettingsChange(f: () => void) { subs.add(f); return () => subs.delete(f); }
export function settingsVersion() { return version; }

/** Nhớ kết quả trong phiên làm việc để cuộn qua cuộn lại không gọi lại Rust. */
const cache = new Map<string, Promise<TikzOut>>();

function keyOf(code: string, defs: string) {
  return `${defs.length}|${code.length}|${defs}\u0000${code}`;
}

export function isTikzReady(): boolean {
  return isDesktop();
}

export function renderTikz(code: string, defs = ''): Promise<TikzOut> {
  const k = keyOf(code, defs);
  const hit = cache.get(k);
  if (hit) return hit;
  const s = getSettings();
  const p = invoke<TikzOut>('tikz_render', {
    code,
    defs,
    opts: { preamble: s.preamble.trim() || null, engine: s.engine, timeoutSecs: s.timeoutSecs },
  }).catch((e) => { cache.delete(k); throw e; });
  cache.set(k, p);
  return p;
}

export const probeTeX = () => invoke<string>('tikz_probe');
export const clearTikzCache = async () => { const n = await invoke<number>('tikz_clear_cache'); cache.clear(); return n; };
export const defaultPreamble = () => invoke<string>('tikz_default_preamble');

/** Lỗi từ Rust có thể là chuỗi hoặc object; đưa về một dạng. */
export function asTikzErr(e: unknown): TikzErr {
  if (e && typeof e === 'object' && 'message' in e) return e as TikzErr;
  return { message: e instanceof Error ? e.message : String(e), log: '', stage: 'latex' };
}
