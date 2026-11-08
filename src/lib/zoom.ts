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

// ——— Tự co giãn theo cửa sổ ———
// Cửa sổ hẹp (laptop 1366, kéo nhỏ) thì cả giao diện thu nhẹ để chữ không bị rớt dòng/cắt; cửa sổ rộng (Full HD trở lên) thì to ra cho dễ đọc.
// Hệ số nhân với mức zoom người dùng chọn. Mốc 1600 px (bề rộng cửa sổ khi zoom 100%); đường cong dịu (mũ 0,6), giới hạn 85–115%.
export const FIT_REF = 1600, FIT_MIN = 0.85, FIT_MAX = 1.15;
/** hệ số tự co giãn theo bề rộng cửa sổ thật (px CSS khi zoom 100%) */
export function fitFactor(baseWidth: number): number {
  if (!Number.isFinite(baseWidth) || baseWidth <= 0) return 1;
  const f = Math.pow(baseWidth / FIT_REF, 0.6);
  return Math.round(Math.min(FIT_MAX, Math.max(FIT_MIN, f)) * 100) / 100;
}
/** mức zoom thực áp vào cửa sổ = mức người dùng × hệ số co giãn (nếu bật) */
export const effectiveZoom = (user: number, fit: boolean, baseWidth: number): number =>
  Math.round(Math.min(1.75, Math.max(0.65, user * (fit ? fitFactor(baseWidth) : 1))) * 100) / 100;
const FIT_KEY = 'hedu.zoomfit';
let fitOn = (() => { try { return localStorage.getItem(FIT_KEY) !== '0'; } catch { return true; } })();
export const getFit = (): boolean => fitOn;

interface WebviewApi { getCurrentWebview(): { setZoom(f: number): Promise<void> } }

let current = ZOOM_DEFAULT;
let started = false;
let cssFallback = false;
/** mức đang thực áp vào cửa sổ (đã nhân hệ số co giãn) */
let applied = 1;
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

/** bề rộng cửa sổ quy về zoom 100%: zoom thật của WebView2 làm innerWidth nhỏ đi theo mức zoom, CSS zoom thì không */
function baseWidth(): number {
  const wv = (window.__TAURI__ as { webview?: WebviewApi } | undefined)?.webview;
  return wv && !cssFallback ? window.innerWidth * applied : window.innerWidth;
}
function applyEffective(): void {
  const e = effectiveZoom(current, fitOn, baseWidth());
  if (Math.abs(e - applied) < 0.01) return;
  applied = e;
  void applyToView(e);
  subs.forEach((f) => f()); // hình TikZ dựng lại theo mức zoom thật
}
export function setFit(on: boolean): void {
  fitOn = on;
  try { localStorage.setItem(FIT_KEY, on ? '1' : '0'); } catch { /* bỏ qua */ }
  applyEffective();
  subs.forEach((f) => f());
}

export function setZoom(z: number): void {
  const next = clampZoom(z);
  if (next === current) return;
  current = next;
  saveZoom(next);
  applyEffective();
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
  applyEffective();
  // kéo dãn/thu nhỏ cửa sổ: tính lại hệ số co giãn (chờ người dùng thả tay một chút)
  let rt: ReturnType<typeof setTimeout> | null = null;
  const onResize = () => { if (rt) clearTimeout(rt); rt = setTimeout(applyEffective, 160); };
  window.addEventListener('resize', onResize);
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
    window.removeEventListener('resize', onResize);
  };
}
