// SyncTeX: bấm trên PDF (Ctrl+bấm hoặc bấm đúp) ⇒ nhảy tới đúng dòng mã nguồn; từ dòng mã ⇒ tô vị trí tương ứng trên PDF.
// Việc tra do công cụ `synctex` của TeX Live làm (Rust: examcompile.rs); ở đây chỉ gọi lệnh và đối chiếu đường dẫn tệp.
import { invoke } from './platform';
import type { ExamMode } from './examcompile';

export interface SyncSrc { file: string; line: number; col: number }
/** Hộp trên PDF, đơn vị điểm (1/72 inch) từ góc trên trái trang; (x, y) là đáy-trái của dòng chữ. */
export interface SyncPos { page: number; x: number; y: number; w: number; h: number }

export const synctexEdit = (id: string, mode: ExamMode, page: number, x: number, y: number, texBin?: string) =>
  invoke<SyncSrc | null>('exam_synctex_edit', { id, mode, page, x, y, texBin: texBin || null });
export const synctexView = (id: string, mode: ExamMode, file: string, line: number, col: number, texBin?: string) =>
  invoke<SyncPos | null>('exam_synctex_view', { id, mode, file, line, col, texBin: texBin || null });

const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\.\//, '').replace(/\/\.\//g, '/');

/**
 * Đường dẫn tệp do TeX ghi (tuyệt đối trong thư mục build hoặc tương đối) → tệp của đề (`rel` trong danh sách tệp).
 * Chọn tệp có đường dẫn khớp ĐUÔI dài nhất; không khớp (vd phần đầu do HEdu ghép khi dịch) ⇒ null.
 */
export function mapSyncFile(texPath: string, rels: readonly string[]): string | null {
  const p = norm(texPath).toLowerCase();
  let best: string | null = null;
  for (const r of rels) {
    const q = norm(r).toLowerCase();
    if ((p === q || p.endsWith('/' + q)) && (!best || q.length > norm(best).length)) best = r;
  }
  return best;
}
