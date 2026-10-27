// Cập nhật app: kiểm tra, cài đặt, quay lại bản trước, khôi phục dữ liệu.
// Mọi việc nặng (tải, kiểm tra chữ ký, thay file) do Rust xử lý; ở đây chỉ gọi lệnh và hiển thị.
import { invoke, listen } from './platform';
import { flushIdReview, freezeIdReview } from './idreview';
import { flushSave, isLastSaveOk } from './store';

export type Channel = 'stable' | 'beta';

export interface AppInfo { version: string; repo: string; dataDir: string; supportedSchema: number }
export interface UpdateInfo { version: string; currentVersion: string; notes: string; date: string | null }
export interface BackupMeta { fromVersion: string; toVersion: string; schema: number; bytes: number; kind: 'pre-update' | 'swapped'; at: number }
export interface Progress { downloaded: number; total: number | null }

export const CHANNEL_LABEL: Record<Channel, string> = { stable: 'Chính thức', beta: 'Thử nghiệm (beta)' };

const CHANNEL_KEY = 'hedu.channel';
const LAST_CHECK_KEY = 'hedu.lastUpdateCheck';
const AUTO_CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

export function getChannel(): Channel {
  try { return localStorage.getItem(CHANNEL_KEY) === 'beta' ? 'beta' : 'stable'; } catch { return 'stable'; }
}
export function setChannel(c: Channel) {
  try { localStorage.setItem(CHANNEL_KEY, c); } catch { /* bỏ qua */ }
}

/** Tự kiểm tra khi mở app, nhưng không quá 6 giờ một lần. */
export function shouldAutoCheck(): boolean {
  try {
    const last = Number(localStorage.getItem(LAST_CHECK_KEY) || 0);
    return Date.now() - last > AUTO_CHECK_EVERY_MS;
  } catch { return true; }
}
export function markChecked() {
  try { localStorage.setItem(LAST_CHECK_KEY, String(Date.now())); } catch { /* bỏ qua */ }
}

export const appInfo = () => invoke<AppInfo>('app_info');
export const checkUpdate = (channel: Channel | 'previous') => invoke<UpdateInfo | null>('check_update', { channel });
export const backupInfo = () => invoke<BackupMeta | null>('backup_info');

/** Cài bản mới. Ghi nốt dữ liệu trước, Rust sẽ sao lưu rồi tải, cài và khởi động lại app. */
/** Ghi nốt dữ liệu rồi KIỂM TRA đã ghi thành công; chưa ghi được thì dừng (cập nhật/khôi phục sẽ khởi động lại app và làm mất thay đổi còn trong bộ nhớ). */
export async function ensureSaved(): Promise<void> {
  if (!(await flushIdReview())) throw new Error('Còn trạng thái xác minh ID CHƯA ghi được xuống đĩa nên chưa tiếp tục (chưa mất gì). Hãy kiểm tra ổ đĩa còn chỗ rồi thử lại.');
  await flushSave();
  if (!isLastSaveOk()) throw new Error('Còn thay đổi CHƯA ghi được xuống đĩa nên chưa tiếp tục (chưa mất gì). Hãy kiểm tra ổ đĩa còn chỗ, tạo file sao lưu, rồi thử lại.');
}

export async function installUpdate(channel: Channel | 'previous', onProgress: (p: Progress) => void): Promise<void> {
  await ensureSaved();
  const off = await listen<Progress>('hedu-update-progress', onProgress);
  try {
    await invoke<void>('install_update', { channel });
  } finally {
    off();
  }
}

/** Đổi dữ liệu hiện tại với bản sao lưu trước cập nhật, rồi tải lại app. */
export async function restoreBackup(): Promise<void> {
  await ensureSaved();
  freezeIdReview(); // dữ liệu sắp được thay: bản trạng thái xác minh trong bộ nhớ không được ghi đè lên bản vừa khôi phục
  await invoke<string>('restore_backup');
  window.location.reload();
}

/** Biến lỗi kỹ thuật thành câu giáo viên đọc hiểu. */
export function friendlyError(e: unknown, what: 'check' | 'install' | 'previous' | 'restore' = 'check'): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (what === 'previous' && /valid release|404|not found|status/i.test(msg)) return 'Chưa có bản trước để quay lại (chỉ có sau lần phát hành chính thức thứ hai).';
  if (/error sending request|dns|connect|timed out|network|offline|tcp/i.test(msg)) return 'Không kết nối được mạng. Kiểm tra Internet rồi thử lại.';
  if (/valid release|404|not found/i.test(msg)) return 'Chưa có thông tin phát hành. Thử lại sau, hoặc báo người phát triển.';
  if (/signature|verify/i.test(msg)) return 'Bản tải về không qua được kiểm tra chữ ký nên chưa cài. Dữ liệu của bạn không bị ảnh hưởng.';
  if (what === 'restore' && /chưa có bản sao lưu/i.test(msg)) return 'Chưa có bản sao lưu nào để khôi phục.';
  return msg;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
