// Phóng to / thu nhỏ giao diện (Issue #7). Chỉ MỘT cơ chế cho mỗi môi trường:
// - App Windows: zoom thật của WebView2 qua Tauri (`setZoom`) — bố cục tự dàn lại, không dùng transform.
// - Bản xem thử trên trình duyệt (hoặc nếu Tauri từ chối): thuộc tính CSS `zoom` của thẻ gốc.
// Phím tắt/lăn chuột do HEdu tự xử lý (hotkey zoom gốc của WebView2 tắt), nên không bao giờ zoom đôi.
// Mức zoom là cấu hình giao diện của từng máy (localStorage), KHÔNG nằm trong dữ liệu ngân hàng.

export const ZOOM_MIN = 0.8;
export const ZOOM_MAX = 1.5;
export const ZOOM_STEP = 0.1;
export const ZOOM_DEFAULT = 1;
const KEY = 'hedu.zoom';

export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return ZOOM_DEFAULT;
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 100) / 100;
}

/** Tăng/giảm theo số bước (mỗi bước 10%), luôn nằm trong 80–150%. */
export function stepZoom(z: number, steps: number): number {
  return clampZoom(Math.round((z + steps * ZOOM_STEP) * 100) / 100);
}

export function loadZoom(): number {
  try {
    const raw = localStorage.getItem(KEY);
    return raw == null ? ZOOM_DEFAULT : clampZoom(Number(raw));
  } catch { return ZOOM_DEFAULT; }
}

function saveZoom(z: number): void {
  try { if (z === ZOOM_DEFAULT) localStorage.removeItem(KEY); else localStorage.setItem(KEY, String(z)); } catch { /* bỏ qua */ }
}

interface WebviewApi { getCurrentWebview(): { setZoom(f: number): Promise<void> } }

let current = ZOOM_DEFAULT;
let started = false;
let cssFallback = false;
const subs = new Set<() => void>();

export const getZoom = (): number => current;
export function subscribeZoom(cb: () => void): () => void { subs.add(cb); return () => { subs.delete(cb); }; }

async function applyToView(z: number): Promise<void> {
  const wv = (window.__TAURI__ as { webview?: WebviewApi } | undefined)?.webview;
  if (wv && !cssFallback) {
    try {
      await wv.getCurrentWebview().setZoom(z);
      document.documentElement.style.removeProperty('zoom');
      return;
    } catch {
      cssFallback = true; // thiếu quyền hoặc phiên bản không hỗ trợ: dùng CSS zoom thay thế (không dùng cả hai)
    }
  }
  if (z === 1) document.documentElement.style.removeProperty('zoom');
  else document.documentElement.style.setProperty('zoom', String(z));
}

export function setZoom(z: number): void {
  const next = clampZoom(z);
  if (next === current) return;
  current = next;
  saveZoom(next);
  void applyToView(next);
  subs.forEach((f) => f());
}

export const resetZoom = (): void => setZoom(ZOOM_DEFAULT);

/** Tích lũy độ lăn để cảm ứng (pinch) gửi nhiều sự kiện nhỏ vẫn ra từng bước 10%. */
export function createWheelStepper(unit = 100) {
  let acc = 0;
  return (deltaY: number, deltaMode: number): number => {
    acc += -(deltaMode === 1 ? deltaY * 33 : deltaY);
    const steps = Math.trunc(acc / unit);
    acc -= steps * unit;
    return steps;
  };
}

/** Nhận phím tắt: trả về số bước (+1/−1), 0 nghĩa là đặt lại, null là không phải phím zoom. */
export function zoomKey(e: { ctrlKey: boolean; metaKey: boolean; altKey: boolean; key: string; code?: string }): number | 'reset' | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') return 1;
  if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') return -1;
  if (e.key === '0' || e.code === 'Numpad0') return 'reset';
  return null;
}

/** Gọi một lần khi app khởi động: áp mức đã lưu và gắn phím tắt / Ctrl+lăn / pinch. */
export function startZoom(): () => void {
  if (started || typeof window === 'undefined') return () => {};
  started = true;
  const saved = loadZoom();
  current = saved;
  if (saved !== ZOOM_DEFAULT) void applyToView(saved);
  const stepper = createWheelStepper();
  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey) return; // pinch trên touchpad cũng đến dưới dạng wheel + ctrlKey
    e.preventDefault();
    const n = stepper(e.deltaY, e.deltaMode);
    if (n) setZoom(stepZoom(current, n));
  };
  const onKey = (e: KeyboardEvent) => {
    const k = zoomKey(e);
    if (k == null) return;
    e.preventDefault();
    setZoom(k === 'reset' ? ZOOM_DEFAULT : stepZoom(current, k));
  };
  window.addEventListener('wheel', onWheel, { passive: false, capture: true });
  window.addEventListener('keydown', onKey, true);
  return () => {
    started = false;
    window.removeEventListener('wheel', onWheel, true);
    window.removeEventListener('keydown', onKey, true);
  };
}
