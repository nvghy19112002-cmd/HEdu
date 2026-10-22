// Nối giao diện với app Windows (Tauri). Khi chạy trên trình duyệt (bản xem thử) thì
// không có Tauri, mọi hàm ở đây trả về "không phải app cài đặt".
// Tauri bật withGlobalTauri nên dùng được window.__TAURI__ mà không cần thêm thư viện.

interface TauriGlobal {
  core: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> };
  webview?: { getCurrentWebview(): { setZoom(f: number): Promise<void> } };
  event: { listen<T>(name: string, cb: (e: { payload: T }) => void): Promise<() => void> };
}

declare global {
  interface Window { __TAURI__?: TauriGlobal }
}

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && !!window.__TAURI__?.core;
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const t = window.__TAURI__;
  if (!t?.core) throw new Error('Chỉ có trong bản cài trên Windows.');
  try {
    return await t.core.invoke<T>(cmd, args);
  } catch (e) {
    // Rust trả lỗi là chuỗi hoặc object {message, log, stage}. Giữ nguyên các trường thay vì
    // String(e), vì String(object) cho ra "[object Object]" và mất log.
    if (e instanceof Error) throw e;
    if (e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string') {
      throw Object.assign(new Error((e as { message: string }).message), e);
    }
    throw new Error(typeof e === 'string' ? e : JSON.stringify(e));
  }
}

export async function listen<T>(name: string, cb: (payload: T) => void): Promise<() => void> {
  const t = window.__TAURI__;
  if (!t?.event) return () => {};
  return t.event.listen<T>(name, (e) => cb(e.payload));
}
