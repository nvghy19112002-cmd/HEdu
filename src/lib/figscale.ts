// Cỡ hình trong XEM NHANH. Hình TikZ có kích thước tự nhiên rất khác nhau (đồ thị nhỏ xíu, hình
// không gian rất to) nên danh sách câu trông lệch. “Cân bằng” kéo mọi hình về gần một cỡ chung
// (giữ nguyên tỉ lệ, chỉ đổi kích thước hiển thị; mã LaTeX và SVG gốc không đổi). Hình có
// \resizebox/\scalebox rõ ràng thì giữ kích thước tác giả đặt. Chỉ ảnh hưởng xem nhanh; “Xem chuẩn” luôn là kích thước thật.
export type FigMode = 'auto' | 'raw';
export interface FigPrefs { mode: FigMode; scale: number }
export const FIG_MIN = 0.7;
export const FIG_MAX = 1.4;
const KEY = 'hedu.figscale';
const DEF: FigPrefs = { mode: 'auto', scale: 1 };

export function clampScale(s: number): number {
  if (!Number.isFinite(s)) return 1;
  return Math.round(Math.min(FIG_MAX, Math.max(FIG_MIN, s)) * 100) / 100;
}

function load(): FigPrefs {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (r && typeof r === 'object') return { mode: r.mode === 'raw' ? 'raw' : 'auto', scale: clampScale(Number(r.scale)) };
  } catch { /* bỏ qua */ }
  return { ...DEF };
}

let prefs: FigPrefs | null = null;
const subs = new Set<() => void>();
export const getFigPrefs = (): FigPrefs => (prefs ??= load());
export function setFigPrefs(p: Partial<FigPrefs>): void {
  const cur = getFigPrefs();
  prefs = { mode: p.mode ?? cur.mode, scale: p.scale == null ? cur.scale : clampScale(p.scale) };
  try {
    if (prefs.mode === 'auto' && prefs.scale === 1) localStorage.removeItem(KEY); else localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch { /* bỏ qua */ }
  subs.forEach((f) => f());
}
export function subscribeFig(cb: () => void): () => void { subs.add(cb); return () => { subs.delete(cb); }; }

const PT = 96 / 72;
const unit = (v: string): number => {
  const m = /^\s*([\d.]+)\s*(pt|px|mm|cm|in)?\s*$/.exec(v);
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  switch (m[2]) { case 'mm': return n * 96 / 25.4; case 'cm': return n * 96 / 2.54; case 'in': return n * 96; case 'px': return n; default: return n * PT; }
};

/** Cỡ tự nhiên (px) của SVG từ thuộc tính width/height hoặc viewBox. */
export function naturalSize(svg: string): { w: number; h: number } | null {
  const tag = /<svg\b[^>]*>/.exec(svg)?.[0];
  if (!tag) return null;
  const attr = (n: string) => new RegExp(`\\s${n}\\s*=\\s*["']([^"']+)["']`).exec(tag)?.[1];
  let w = attr('width') ? unit(attr('width')!) : NaN;
  let h = attr('height') ? unit(attr('height')!) : NaN;
  if (!(w > 0 && h > 0)) {
    const vb = attr('viewBox')?.split(/[\s,]+/).map(Number);
    if (vb && vb.length === 4 && vb[2] > 0 && vb[3] > 0) { w = vb[2] * PT; h = vb[3] * PT; }
  }
  return w > 0 && h > 0 ? { w, h } : null;
}

const TARGET = 210;          // cỡ “mong muốn” (căn bậc hai diện tích, px)
const STRENGTH = 0.65;       // 0 = giữ nguyên, 1 = ép đúng một cỡ
const W_MIN = 120, W_MAX = 380, H_MAX = 300, K_MAX = 1.8;

/** Kích thước hiển thị (px) sau khi cân bằng; null nghĩa là giữ nguyên. */
export function fitSize(nat: { w: number; h: number }, p: FigPrefs): { w: number; h: number } | null {
  if (p.mode === 'raw' && p.scale === 1) return null;
  let k = 1;
  if (p.mode === 'auto') {
    const k0 = Math.pow(TARGET / Math.sqrt(nat.w * nat.h), STRENGTH);
    const lo = Math.min(W_MIN / nat.w, K_MAX);                 // không để hình nhỏ hơn sàn (tối đa phóng 1.8 lần)
    const hi = Math.min(W_MAX / nat.w, H_MAX / nat.h, K_MAX);  // không để hình vượt trần
    k = Math.min(Math.max(k0, lo), hi);
  }
  k *= p.scale;
  return { w: Math.round(nat.w * k), h: Math.round(nat.h * k) };
}

/** Trả SVG với width/height mới (giữ nguyên viewBox nên không méo). */
export function applyFigScale(svg: string, p: FigPrefs): string {
  const nat = naturalSize(svg);
  if (!nat) return svg;
  const s = fitSize(nat, p);
  if (!s) return svg;
  return svg.replace(/<svg\b[^>]*>/, (tag) => {
    let t = tag.replace(/\s(width|height)\s*=\s*(["'])[^"']*\2/g, '');
    if (!/\sviewBox\s*=/.test(t)) t = t.replace(/<svg\b/, `<svg viewBox="0 0 ${nat.w / PT} ${nat.h / PT}"`);
    return t.replace(/<svg\b/, `<svg width="${s.w}" height="${s.h}"`);
  });
}
