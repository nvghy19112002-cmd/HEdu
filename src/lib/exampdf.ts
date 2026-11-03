// Xuất PDF của một đề đã biên dịch thành công (chỉ các bản đã dịch được và khớp tệp nguồn; lõi Rust exam_pdf_export kiểm lại).
// Dùng chung: thanh công cụ Thư viện đề, menu chuột phải, ngăn thông tin, và ngay sau khi biên dịch thành công ở màn Biên tập đề.
import { modeLabel, pdfFileName, type ExamMode } from './examcompile';
import { invoke } from './platform';

type Dlg = {
  save?(o: { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] }): Promise<string | null>;
  open?(o: { title?: string; directory?: boolean; multiple?: boolean }): Promise<string | string[] | null>;
};
const dlg = (): Dlg | undefined => (typeof window !== 'undefined' ? (window.__TAURI__?.dialog as Dlg | undefined) : undefined);

/** Hộp "Lưu thành" của Windows rồi chép PDF ra tệp. Trả về đường dẫn đã lưu, hoặc null nếu bạn huỷ. */
export async function exportPdf(id: string, title: string, mode: ExamMode): Promise<string | null> {
  const d = dlg();
  if (!d?.save) throw new Error('Hộp Lưu thành chỉ có trong bản cài trên Windows.');
  const dest = await d.save({ title: `Xuất PDF: ${modeLabel(mode)}`, defaultPath: pdfFileName(mode, title), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (!dest) return null;
  await invoke<void>('exam_pdf_export', { id, dest, mode });
  return dest;
}

/** Chọn một thư mục rồi xuất mọi bản đã dịch được vào đó, mỗi bản một tệp (tên theo bản). Trả về thư mục và số tệp đã lưu; null nếu bạn huỷ. */
export async function exportAllPdf(id: string, title: string, modes: readonly ExamMode[]): Promise<{ dir: string; n: number } | null> {
  const d = dlg();
  if (!d?.open) throw new Error('Hộp chọn thư mục chỉ có trong bản cài trên Windows.');
  const r = await d.open({ title: 'Chọn thư mục để lưu các bản PDF', directory: true, multiple: false });
  const dir = r == null ? null : Array.isArray(r) ? r[0] ?? null : r;
  if (!dir) return null;
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/';
  let n = 0;
  for (const mode of modes) {
    await invoke<void>('exam_pdf_export', { id, dest: `${dir.replace(/[\\/]+$/, '')}${sep}${pdfFileName(mode, title)}`, mode });
    n++;
  }
  return { dir, n };
}

/** Chép PDF của một bản ra đúng đường dẫn `dest` (không hỏi); dùng cho xuất trọn gói. */
export const exportPdfTo = (id: string, dest: string, mode: ExamMode): Promise<void> => invoke<void>('exam_pdf_export', { id, dest, mode });

/** Hộp "Chọn thư mục" của Windows; null nếu huỷ. */
export async function chooseFolder(title: string): Promise<string | null> {
  const d = dlg();
  if (!d?.open) throw new Error('Hộp chọn thư mục chỉ có trong bản cài trên Windows.');
  const r = await d.open({ title, directory: true, multiple: false });
  return r == null ? null : Array.isArray(r) ? r[0] ?? null : r;
}
/** Hộp "Lưu thành" cho tệp .xlsx; null nếu huỷ. */
export async function chooseXlsxPath(title: string, defaultPath: string): Promise<string | null> {
  const d = dlg();
  if (!d?.save) throw new Error('Hộp Lưu thành chỉ có trong bản cài trên Windows.');
  return (await d.save({ title, defaultPath, filters: [{ name: 'Excel', extensions: ['xlsx'] }] })) ?? null;
}
