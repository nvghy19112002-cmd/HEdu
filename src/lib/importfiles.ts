// Chọn và đọc tệp nguồn cho màn Nhập liệu (Rust: src-tauri/src/importfs.rs). Chỉ ĐỌC; không đoán bảng mã (UTF-8 bắt buộc).
// PR N1 chỉ có lớp này; màn Nhập liệu dùng nó ở PR N2 (phương án: claude/thiet-ke-nhap-nhieu-tep.md).
import { invoke } from './platform';

export interface ScanFile { path: string; name: string; /** thư mục con tính từ thư mục đã chọn ('/' ngăn cách; rỗng nếu chọn lẻ) */ rel: string; bytes: number }
export interface ScanSkipped { path: string; rel: string; reason: string }
export interface ScanResult { files: ScanFile[]; skipped: ScanSkipped[]; /** còn tệp chưa liệt kê vì vượt giới hạn số tệp */ truncated: boolean }
export interface ReadResult { text: string; bytes: number; hadBom: boolean }

/** Giới hạn khớp với Rust (importfs.rs) và phương án đã duyệt. */
export const IMPORT_LIMITS = { files: 2000, fileMB: 20, depth: 6, questionsPerBatch: 5000 } as const;

type Dlg = { open?(o: { title?: string; directory?: boolean; multiple?: boolean }): Promise<string | string[] | null> };
const dlg = (): Dlg | undefined => (typeof window !== 'undefined' ? (window.__TAURI__?.dialog as Dlg | undefined) : undefined);
const asList = (r: string | string[] | null | undefined): string[] => (r == null ? [] : Array.isArray(r) ? r : [r]);

/** Hộp chọn NHIỀU tệp của Windows. Bản trình duyệt/không có hộp: trả [] (giao diện dùng cách dán). */
export async function chooseFiles(): Promise<string[]> {
  const d = dlg();
  if (!d?.open) return [];
  return asList(await d.open({ title: 'Chọn các tệp .tex hoặc .txt', multiple: true, directory: false }));
}

/** Hộp chọn MỘT thư mục (HEdu quét cả thư mục con). */
export async function chooseFolder(): Promise<string | null> {
  const d = dlg();
  if (!d?.open) return null;
  return asList(await d.open({ title: 'Chọn thư mục chứa các tệp .tex', directory: true, multiple: false }))[0] ?? null;
}

export const scanSources = (paths: string[]): Promise<ScanResult> => invoke<ScanResult>('import_scan', { paths });
export const readSource = (path: string): Promise<ReadResult> => invoke<ReadResult>('import_read', { path });

/** Tóm tắt kết quả quét bằng tiếng Việt: số tệp nhận, số tệp bỏ qua theo từng lý do, cảnh báo vượt giới hạn. */
export function describeScan(s: ScanResult): string[] {
  const out: string[] = [`Tìm thấy ${s.files.length} tệp .tex/.txt để đọc.`];
  if (s.skipped.length) {
    const by = new Map<string, number>();
    for (const k of s.skipped) { const r = k.reason.replace(/\(\d+ MB.*$/, '(quá giới hạn)'); by.set(r, (by.get(r) ?? 0) + 1); }
    out.push(`Bỏ qua ${s.skipped.length} mục: ${[...by].map(([r, n]) => `${n} × ${r}`).join('; ')}.`);
  }
  if (s.truncated) out.push(`Có nhiều hơn ${IMPORT_LIMITS.files} tệp: chỉ liệt kê ${IMPORT_LIMITS.files} tệp đầu. Hãy chia thành nhiều lần nhập (mỗi lần một nhóm thư mục).`);
  return out;
}

export interface ReadAll {
  read: { file: ScanFile; text: string }[];
  failed: { file: ScanFile; message: string }[];
  cancelled: boolean;
}

/** Đọc lần lượt từng tệp (có tiến độ và nút Dừng). Tệp lỗi (không phải UTF-8, quá lớn…) vào `failed` kèm lý do, KHÔNG làm hỏng cả lô. */
export async function readAll(files: ScanFile[], opt: { onProgress?(done: number, total: number): void; shouldStop?(): boolean } = {}): Promise<ReadAll> {
  const res: ReadAll = { read: [], failed: [], cancelled: false };
  opt.onProgress?.(0, files.length);
  for (let i = 0; i < files.length; i++) {
    if (opt.shouldStop?.()) { res.cancelled = true; break; }
    const f = files[i];
    try { res.read.push({ file: f, text: (await readSource(f.path)).text }); }
    catch (e) { res.failed.push({ file: f, message: e instanceof Error ? e.message : String(e) }); }
    opt.onProgress?.(i + 1, files.length);
  }
  return res;
}
