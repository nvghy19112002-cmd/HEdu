// Sao lưu tự động theo lịch: khi mở app, nếu đã đến hạn VÀ dữ liệu có thay đổi từ lần sao lưu trước thì tự tạo
// điểm khôi phục ngân hàng (chế độ SQLite) và bản sao lưu thư viện đề. Phần thuần (đến hạn? đổi chưa?) có kiểm thử.
// Mỗi loại bản sao lưu giữ tối đa 5 bản (do Rust quản lý), nên không đầy ổ đĩa.
import { examBackupCreate } from './examlib';
import { ensureRestorePoint } from './dbbackup';

export type BackupFreq = 'off' | 'daily' | 'weekly';
export interface BackupPrefs { freq: BackupFreq; /** thời điểm sao lưu tự động gần nhất (ms), 0 = chưa */ last: number; /** dấu dữ liệu lúc đó */ sig: string }
export const DEFAULT_PREFS: BackupPrefs = { freq: 'daily', last: 0, sig: '' };
export const FREQ_LABEL: Record<BackupFreq, string> = { off: 'Tắt', daily: 'Mỗi ngày', weekly: 'Mỗi tuần' };
const KEY = 'hedu.autobackup';
const HOURS: Record<BackupFreq, number> = { off: Infinity, daily: 20, weekly: 24 * 6.5 };

export function parsePrefs(raw: string | null): BackupPrefs {
  try {
    const v = JSON.parse(raw ?? 'null') as Partial<BackupPrefs> | null;
    if (v && (v.freq === 'off' || v.freq === 'daily' || v.freq === 'weekly')) return { freq: v.freq, last: Number.isFinite(v.last) ? Math.max(0, v.last as number) : 0, sig: typeof v.sig === 'string' ? v.sig : '' };
  } catch { /* hỏng thì dùng mặc định */ }
  return { ...DEFAULT_PREFS };
}
export const loadPrefs = (): BackupPrefs => { try { return parsePrefs(localStorage.getItem(KEY)); } catch { return { ...DEFAULT_PREFS }; } };
export const savePrefs = (p: BackupPrefs): void => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* chỉ là tiện lợi */ } };

/** Đến hạn sao lưu chưa (theo lịch), tính cả khi đồng hồ máy bị lùi (coi như đến hạn). */
export const isDue = (p: BackupPrefs, now: number): boolean => p.freq !== 'off' && (p.last === 0 || now < p.last || now - p.last >= HOURS[p.freq] * 3600_000);

/** Dấu thay đổi của dữ liệu: số câu + lần sửa gần nhất của ngân hàng, số đề + lần sửa gần nhất của thư viện đề. */
export function dataSig(bank: { count: number; maxUpdated: number }, exams: readonly { updatedAt: string }[]): string {
  let m = '';
  for (const e of exams) if (e.updatedAt > m) m = e.updatedAt;
  return `${bank.count}|${bank.maxUpdated}|${exams.length}|${m}`;
}

export interface AutoResult { ran: boolean; message: string }

/** Chạy nếu đến hạn và dữ liệu đã đổi. `force` = bấm "Sao lưu ngay" (bỏ qua hạn và kiểm tra thay đổi). Không bao giờ ném lỗi. */
export async function runAutoBackup(sig: string, now: number, force = false): Promise<AutoResult> {
  const p = loadPrefs();
  if (!force && !isDue(p, now)) return { ran: false, message: '' };
  if (!force && p.sig === sig) { savePrefs({ ...p, last: now }); return { ran: false, message: '' }; } // không có gì mới: dời hạn
  const parts: string[] = [];
  try {
    const rp = await ensureRestorePoint('tu-dong');
    if (!rp.ok) parts.push(`điểm khôi phục ngân hàng: ${rp.message}`); else if (rp.taken) parts.push('điểm khôi phục ngân hàng');
  } catch (e) { parts.push(`điểm khôi phục ngân hàng: ${e instanceof Error ? e.message : String(e)}`); }
  let okExam = true;
  try { await examBackupCreate(); parts.push('bản sao lưu thư viện đề'); } catch (e) { okExam = false; parts.push(`thư viện đề: ${e instanceof Error ? e.message : String(e)}`); }
  const failed = parts.some((x) => /:/.test(x));
  if (!failed || okExam) savePrefs({ ...p, last: now, sig });
  return { ran: true, message: failed ? `Sao lưu tự động chưa trọn vẹn (${parts.join('; ')}).` : `Đã sao lưu tự động: ${parts.join(', ')}.` };
}
