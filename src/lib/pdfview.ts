// Hàm thuần cho trình xem PDF (E2b): phóng to/thu nhỏ, trang đang hiện, tìm chữ. Không phụ thuộc pdf.js nên kiểm thử được bằng Node.

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;
export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

export const clampZoom = (z: number): number => (Number.isFinite(z) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) : 1);

/** Mức kế tiếp trong ZOOM_STEPS (dir +1 phóng to, -1 thu nhỏ); đứng yên ở hai đầu. */
export function stepZoom(cur: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find((s) => s > cur + 1e-6) ?? ZOOM_MAX;
  const lower = [...ZOOM_STEPS].reverse().find((s) => s < cur - 1e-6);
  return lower ?? ZOOM_MIN;
}

/** Tỉ lệ để trang vừa chiều rộng khung (trừ lề). */
export const fitWidth = (boxW: number, pageW: number, pad = 32): number => clampZoom((boxW - pad) / pageW);
/** Tỉ lệ để cả trang lọt vào khung. */
export const fitPage = (boxW: number, boxH: number, pageW: number, pageH: number, pad = 32): number => clampZoom(Math.min((boxW - pad) / pageW, (boxH - pad) / pageH));

export interface Layout { tops: number[]; heights: number[]; total: number }

/** Vị trí từng trang xếp dọc, cách nhau `gap`. */
export function layoutPages(heights: readonly number[], gap = 12): Layout {
  const tops: number[] = [];
  let y = gap;
  for (const h of heights) { tops.push(y); y += h + gap; }
  return { tops, heights: [...heights], total: y };
}

/** Các trang (chỉ số từ 0) giao với vùng nhìn thấy, mở rộng `buffer` px mỗi phía. */
export function visibleRange(l: Layout, scrollTop: number, viewH: number, buffer = 600): number[] {
  const lo = scrollTop - buffer, hi = scrollTop + viewH + buffer;
  const out: number[] = [];
  for (let i = 0; i < l.tops.length; i++) if (l.tops[i] + l.heights[i] >= lo && l.tops[i] <= hi) out.push(i);
  return out;
}

/** Trang "hiện tại" = trang chiếm nhiều diện tích nhất trong khung nhìn (chỉ số từ 0). */
export function currentPage(l: Layout, scrollTop: number, viewH: number): number {
  let best = 0, bestArea = -Infinity;
  for (let i = 0; i < l.tops.length; i++) {
    const a = Math.min(l.tops[i] + l.heights[i], scrollTop + viewH) - Math.max(l.tops[i], scrollTop);
    if (a > bestArea) { bestArea = a; best = i; }
  }
  return best;
}

/** Vị trí cuộn để trang `i` nằm sát đầu khung. */
export const scrollTopFor = (l: Layout, i: number, gap = 12): number => Math.max(0, (l.tops[Math.min(Math.max(i, 0), l.tops.length - 1)] ?? gap) - gap);

/** Giữ tối đa `keep` trang đã vẽ, ưu tiên gần trang hiện tại; trả về các trang cần giải phóng. */
export function pagesToRelease(rendered: readonly number[], cur: number, keep = 6): number[] {
  if (rendered.length <= keep) return [];
  return [...rendered].sort((a, b) => Math.abs(b - cur) - Math.abs(a - cur)).slice(0, rendered.length - keep);
}

/** Giới hạn kích thước canvas (cạnh dài và số điểm ảnh) để không hết bộ nhớ khi phóng to nhiều. Trả về hệ số ≤ 1 cần nhân thêm. */
export function canvasShrink(w: number, h: number, maxSide = 8192, maxPixels = 40_000_000): number {
  return Math.min(1, maxSide / Math.max(w, h), Math.sqrt(maxPixels / (w * h)));
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ');

/** Các trang (từ 0) có chứa chữ cần tìm (không phân biệt dấu/hoa thường). Chuỗi rỗng ⇒ []. */
export function matchPages(texts: readonly string[], query: string): number[] {
  const q = fold(query.trim());
  if (!q) return [];
  const out: number[] = [];
  texts.forEach((t, i) => { if (fold(t).includes(q)) out.push(i); });
  return out;
}

/** Trang kết quả kế tiếp/trước (vòng tròn) so với trang hiện tại. */
export function nextMatch(matches: readonly number[], cur: number, dir: 1 | -1): number | null {
  if (!matches.length) return null;
  if (dir > 0) return matches.find((m) => m > cur) ?? matches[0];
  return [...matches].reverse().find((m) => m < cur) ?? matches[matches.length - 1];
}
