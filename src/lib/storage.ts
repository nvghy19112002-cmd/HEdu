// Chế độ lưu trữ của bản cài Windows: SQLite (mặc định mới) hoặc tệp JSON cũ (chỉ khi người dùng chọn "để sau" lúc nâng cấp).
// Rust: src-tauri/src/dbcmd.rs (lệnh) + db.rs (lớp SQLite) + jsonmig.rs (chuyển dữ liệu). Giao diện không chạy SQL tuỳ ý.
import type { Backend } from './dupdecisions';
import { invoke, isDesktop } from './platform';
import type { Delta, LoadedRaw, Persistence } from './store';
import type { Question } from './types';

export type StorageMode = 'web' | 'json' | 'sqlite';
let mode: StorageMode = isDesktop() ? 'json' : 'web';
let bootError: string | null = null;

export const getStorageMode = (): StorageMode => mode;
/** Lỗi mở nguồn dữ liệu lúc khởi động (bị khoá, hỏng, của bản mới hơn…): giao diện hiện màn lỗi, KHÔNG ghi gì. */
export const storageBootError = (): string | null => bootError;
/** Chỉ dùng trong kiểm thử. */
export function _setStorage(m: StorageMode, err: string | null = null): void { mode = m; bootError = err; }

export type Detect = { kind: 'web' } | { kind: 'sqlite' } | { kind: 'legacy' } | { kind: 'error'; message: string };

/** Gọi MỘT lần lúc khởi động, trước khi nạp ngân hàng. */
export async function detectStorage(): Promise<Detect> {
  if (!isDesktop()) { mode = 'web'; return { kind: 'web' }; }
  try {
    const r = await invoke<{ mode: string; message: string | null; fresh: boolean }>('storage_status');
    if (r.mode === 'sqlite') { mode = 'sqlite'; return { kind: 'sqlite' }; }
    if (r.mode === 'legacy') { mode = 'json'; return { kind: 'legacy' }; }
    bootError = r.message ?? 'Không mở được nguồn dữ liệu.';
    return { kind: 'error', message: bootError };
  } catch (e) {
    bootError = e instanceof Error ? e.message : String(e);
    return { kind: 'error', message: bootError };
  }
}

export interface UpgradePreflight { questions: number; schema: number; trash: number; decisions: number; gold: number; warnings: string[] }
export interface UpgradeResult { questions: number; backupDir: string; millis: number; warnings: string[] }

export const storagePreflight = (): Promise<UpgradePreflight> => invoke<UpgradePreflight>('storage_preflight');

/** Chuyển dữ liệu JSON cũ sang SQLite (Rust: chụp nguyên trạng → tệp tạm → đối chiếu → đổi tên). Chỉ gọi sau khi người dùng bấm xác nhận. */
export async function storageMigrate(): Promise<UpgradeResult> {
  const r = await invoke<UpgradeResult>('storage_migrate');
  mode = 'sqlite';
  return r;
}

/** "Để sau": lần mở này vẫn dùng tệp JSON cũ; lần sau hỏi lại. */
export function keepLegacyJson(): void { mode = 'json'; }

const SIDECAR_KEY = 'dup-decisions';
/** Tệp phụ (quyết định trùng, Thùng rác, nhãn chuẩn) nằm trong CHÍNH tệp SQLite của nguồn. */
export const sqliteSidecar: Backend = {
  load: () => invoke<string | null>('db_sidecar_get', { key: SIDECAR_KEY }),
  save: (json) => invoke<void>('db_apply', { upserts: [], deletes: [], meta: [], sidecar: [[SIDECAR_KEY, json]] }),
};

const PAGE = 2000;
/**
 * Một lô thay đổi đi trong MỘT lệnh = MỘT giao dịch SQLite (hoặc ghi hết, hoặc không ghi gì). Đã đo thật trong app Tauri:
 * 60.000 câu (77 MB) trong một lệnh mất ~4 giây. Chỉ khi vượt mức này (không có trong thực tế) mới chia nhiều giao dịch.
 */
export const ATOMIC_MAX = 150_000;

export const sqlitePersistence: Persistence = {
  async load() { throw new Error('Chế độ SQLite nạp theo trang (loadParsed).'); },
  async save() { throw new Error('Chế độ SQLite ghi theo thay đổi (saveDelta).'); },

  async loadParsed(): Promise<LoadedRaw | null> {
    const m = await invoke<{ schema: string | null; nextSeq: string | null; taxonomy: string | null; count: number }>('db_load_meta');
    if (m.count === 0 && m.schema == null) return null; // nguồn mới tinh
    const questions: Question[] = [];
    let after: { seq: number; uid: string } | null = null;
    for (;;) {
      const rows: { seq: number; uid: string; json: string }[] = await invoke('db_load_page', { afterSeq: after?.seq ?? null, afterUid: after?.uid ?? null, limit: PAGE });
      if (rows.length === 0) break;
      for (const r of rows) questions.push(JSON.parse(r.json) as Question);
      const l = rows[rows.length - 1];
      after = { seq: l.seq, uid: l.uid };
    }
    if (questions.length !== m.count) throw new Error(`Nạp thiếu câu hỏi (${questions.length}/${m.count}) — không mở để tránh ghi đè.`);
    return { schema: m.schema, nextSeq: m.nextSeq, taxonomy: m.taxonomy, questions };
  },

  /**
   * Gửi các thay đổi trong MỘT giao dịch (xem ATOMIC_MAX). Lỗi ⇒ không câu nào của lô được ghi; lần lưu sau gửi lại cả lô (ghi chồng an toàn).
   * Lô khổng lồ (> ATOMIC_MAX) chia nhiều giao dịch, mỗi giao dịch trọn vẹn; lỗi giữa chừng ⇒ báo lỗi, giữ thay đổi trong bộ nhớ, gửi lại đúng như trên.
   */
  saveDelta(d: Delta): Promise<void> { return saveDeltaWith(d, ATOMIC_MAX); },
};

/** Tách riêng để kiểm thử đường chia lô mà không cần lô thật lớn. */
export async function saveDeltaWith(d: Delta, atomicMax: number): Promise<void> {
  if (d.upserts.length <= atomicMax && d.deletes.length <= atomicMax) {
    await invoke<void>('db_apply', { upserts: d.upserts, deletes: d.deletes, meta: d.meta, sidecar: [] });
    return;
  }
  // chia lô: xoá trước (cùng lô đầu), rồi thêm/sửa theo khúc, thông tin chung ghi CUỐI CÙNG (nextSeq chỉ tăng khi mọi câu đã nằm trong đĩa)
  const step = Math.max(1, Math.min(atomicMax, PAGE * 5));
  for (let i = 0; i < Math.max(d.upserts.length, 1); i += step) {
    await invoke<void>('db_apply', { upserts: d.upserts.slice(i, i + step), deletes: i === 0 ? d.deletes : [], meta: [], sidecar: [] });
  }
  if (d.meta.length) await invoke<void>('db_apply', { upserts: [], deletes: [], meta: d.meta, sidecar: [] });
}

export interface StorageSummary { label: string; detail: string; path: string | null }

/** Mô tả đúng chế độ lưu trữ đang dùng (không mô tả cố định). `dataDir` = thư mục dữ liệu của app (Rust app_info). */
export function storageSummary(m: StorageMode, dataDir: string | null | undefined): StorageSummary {
  const join = (rel: string) => (dataDir ? `${dataDir.replace(/[\\/]+$/, '')}\\${rel}` : null);
  if (m === 'sqlite') return { label: 'SQLite', detail: 'Cơ sở dữ liệu SQLite (hedu.db): câu hỏi, cây chương trình, Thùng rác, quyết định trùng và nhãn chuẩn nằm trong cùng một tệp; mỗi lần lưu chỉ ghi phần thay đổi.', path: join('profiles\\default\\sources\\main\\hedu.db') };
  if (m === 'json') return { label: 'JSON (cách cũ)', detail: 'Tệp JSON cũ (hedu.json) + tệp phụ (dup-decisions.json). Bản này đang dùng cách cũ vì thầy/cô chọn "Để sau" lúc nâng cấp; lần mở sau HEdu sẽ hỏi lại.', path: join('data\\hedu.json') };
  return { label: 'Trình duyệt', detail: 'Bản xem thử trên trình duyệt: dữ liệu mẫu lưu trong trình duyệt này, không phải ngân hàng thật.', path: null };
}
