// Lưu một file văn bản. Trong app Windows: mở hộp "Lưu thành…" của Windows để thầy/cô đặt tên và chọn thư mục.
// Trên bản xem thử web (hoặc nếu hộp lưu không có): tải về theo kiểu trình duyệt.
import { invoke, isDesktop } from './platform';

export type SaveResult =
  | { kind: 'saved'; path: string }
  | { kind: 'cancelled' }
  | { kind: 'downloaded' }
  | { kind: 'error'; message: string };

export function extOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name);
  return m ? m[1].toLowerCase() : 'txt';
}

const KIND: Record<string, string> = { tex: 'File LaTeX (.tex)', json: 'File sao lưu (.json)', txt: 'Văn bản (.txt)' };

/** `fallback` là hàm tải về kiểu trình duyệt (truyền vào để file này không phụ thuộc giao diện). */
export async function saveTextFile(name: string, text: string, fallback: () => void): Promise<SaveResult> {
  const dlg = typeof window !== 'undefined' ? window.__TAURI__?.dialog : undefined;
  if (!isDesktop() || !dlg) { fallback(); return { kind: 'downloaded' }; }
  const ext = extOf(name);
  try {
    const path = await dlg.save({ title: 'Lưu file', defaultPath: name, filters: [{ name: KIND[ext] ?? `File .${ext}`, extensions: [ext] }] });
    if (!path) return { kind: 'cancelled' };
    await invoke<void>('save_text_file', { path, text });
    return { kind: 'saved', path };
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}
