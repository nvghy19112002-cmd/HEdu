// Sao lưu / khôi phục cho nguồn SQLite (Rust: src-tauri/src/dbbackup.rs + dbcmd.rs). Chỉ có tác dụng ở chế độ SQLite của bản cài Windows.
import { invoke } from './platform';
import { getStorageMode } from './storage';
import { flushSave, isLastSaveOk } from './store';

export type PointReason = 'nhap-hang-loat' | 'xoa-hang-loat' | 'don-sach-thung-rac' | 'khoi-phuc-tu-tep' | 'truoc-khoi-phuc' | 'thu-cong';
export const REASON_LABEL: Record<string, string> = {
  'nhap-hang-loat': 'Trước khi nhập hàng loạt',
  'xoa-hang-loat': 'Trước khi xoá hàng loạt',
  'don-sach-thung-rac': 'Trước khi xoá hẳn khỏi Thùng rác',
  'khoi-phuc-tu-tep': 'Trước khi khôi phục từ file',
  'truoc-khoi-phuc': 'Trước khi khôi phục điểm/bản chụp',
  'thu-cong': 'Tạo thủ công',
};
/** Thao tác từ chừng này câu trở lên được coi là "hàng loạt" và tự chụp điểm khôi phục. */
export const BIG_OP = 20;

export interface RestorePoint { file: string; reason: string; at: number; questions: number; bytes: number; appVersion: string }
export interface InspectResult { questions: number; damaged: boolean; messages: string[] }
export interface Integrity { ok: boolean; damaged: boolean; messages: string[]; questions: number; duplicateSeq: number }
export type Source = { path: string; point?: undefined } | { point: string; path?: undefined };

export const isSqlite = (): boolean => getStorageMode() === 'sqlite';

/**
 * Chụp điểm khôi phục TRƯỚC thao tác dễ mất dữ liệu (chỉ chế độ SQLite; chế độ khác luôn ok).
 * Ghi nốt dữ liệu chờ ghi trước; không chụp được ⇒ trả ok=false và thao tác KHÔNG được làm (thà không làm còn hơn làm mà không có lưới an toàn).
 */
export async function ensureRestorePoint(reason: PointReason, when = true): Promise<{ ok: true; taken: boolean } | { ok: false; message: string }> {
  if (!when || !isSqlite()) return { ok: true, taken: false };
  try {
    await flushSave();
    if (!isLastSaveOk()) return { ok: false, message: 'Chưa ghi được dữ liệu hiện tại xuống đĩa nên chưa làm thao tác này (chưa mất gì). Hãy kiểm tra ổ đĩa rồi thử lại.' };
    await invoke('backup_point', { reason });
    return { ok: true, taken: true };
  } catch (e) {
    return { ok: false, message: `Chưa làm vì không tạo được điểm khôi phục để phòng khi cần quay lại: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export const listRestorePoints = (): Promise<RestorePoint[]> => invoke<RestorePoint[]>('backup_points');
export const inspectSource = (s: Source): Promise<InspectResult> => invoke<InspectResult>('backup_inspect', { path: s.path ?? null, point: s.point ?? null });
export const snapshotTo = (path: string): Promise<{ questions: number; bytes: number; sha256: string }> => invoke('backup_snapshot', { path });
export const checkIntegrity = (): Promise<Integrity> => invoke<Integrity>('db_integrity');
export const exportJsonTo = (dir: string): Promise<{ questions: number; jsonPath: string; sidecarPath: string | null }> => invoke('db_export_json', { dir });

/** Khôi phục từ tệp .db hoặc điểm khôi phục. Rust tự chụp "điểm trước khi khôi phục"; xong thì tải lại giao diện. */
export async function restoreFrom(s: Source): Promise<void> {
  await flushSave();
  if (!isLastSaveOk()) throw new Error('Chưa ghi được dữ liệu hiện tại nên chưa khôi phục.');
  await invoke('backup_restore', { path: s.path ?? null, point: s.point ?? null });
  window.location.reload();
}
