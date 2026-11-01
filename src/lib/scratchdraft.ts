// Bản nháp của màn "Xử lí TeX": bản cài Windows lưu bền trên đĩa qua Rust (texscratch.rs: ghi tạm → .bak → đổi tên);
// trình duyệt (npm run dev, dữ liệu mẫu) chỉ lưu tạm trong localStorage. Một bản nháp duy nhất, không vào ngân hàng hay Thư viện đề.
import { invoke, isDesktop } from './platform';

const LS_KEY = 'hedu.texscratch.draft';
/** giới hạn khớp texscratch.rs::MAX_BYTES (đo theo UTF-8) */
export const DRAFT_MAX_BYTES = 20 * 1024 * 1024;
/** lưu sau khi ngừng gõ (ms) */
export const AUTOSAVE_MS = 1500;

export interface LoadedDraft { text: string | null; fromBackup: boolean }

/** `slot` rỗng/không có = bàn nháp chính (như các bản trước); có tên = bàn nháp riêng (a-z, 0-9, gạch ngang). */
const lsKey = (slot?: string) => (slot ? `${LS_KEY}.${slot}` : LS_KEY);

export async function loadDraft(slot?: string): Promise<LoadedDraft> {
  if (isDesktop()) return invoke<LoadedDraft>('tex_scratch_load', { slot: slot || null });
  try { return { text: localStorage.getItem(lsKey(slot)), fromBackup: false }; } catch { return { text: null, fromBackup: false }; }
}

export const utf8Bytes = (s: string): number => new TextEncoder().encode(s).length;

export async function saveDraft(text: string, slot?: string): Promise<void> {
  if (utf8Bytes(text) > DRAFT_MAX_BYTES) throw new Error(`Bản nháp quá lớn (giới hạn ${DRAFT_MAX_BYTES / 1024 / 1024} MB).`);
  if (isDesktop()) { await invoke<void>('tex_scratch_save', { text, slot: slot || null }); return; }
  localStorage.setItem(lsKey(slot), text);
}

/** Xoá một bàn nháp riêng (không xoá được bàn nháp chính). */
export async function deleteDraft(slot: string): Promise<void> {
  if (!slot) throw new Error('Không xoá được bàn nháp chính.');
  if (isDesktop()) { await invoke<void>('tex_scratch_delete', { slot }); return; }
  localStorage.removeItem(lsKey(slot));
}

export type SaveState = 'da-luu' | 'chua-luu' | 'dang-luu' | 'loi';
export const SAVE_LABEL: Record<SaveState, string> = { 'da-luu': 'Đã lưu nháp', 'chua-luu': 'Chưa lưu nháp', 'dang-luu': 'Đang lưu…', loi: 'Chưa lưu được' };
