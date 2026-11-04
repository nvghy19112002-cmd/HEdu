// Hoàn tác (Ctrl+Z) cho các thao tác đổi thông tin ở Thư viện đề: chuyển đề, đổi tên, gắn sao, đổi trạng thái,
// thao tác thư mục, chuyển vào Thùng rác. Mỗi mục nhớ trạng thái TRƯỚC khi đổi; hoàn tác = ghi lại đúng trạng thái đó.
// Chỉ nhớ trong phiên làm việc (không lưu đĩa). Chốt đề không hoàn tác được (đề đã chốt không bỏ chốt được).
import type { ExamMetaIn } from './examlib';

export interface UndoEntry {
  /** mô tả ngắn hiện trên nút: "Chuyển 3 đề", "Đổi tên đề"… */
  label: string;
  /** thông tin cũ của từng đề bị đổi */
  metas: { id: string; meta: ExamMetaIn }[];
  /** danh sách thư mục trống trước khi đổi (chỉ thao tác thư mục) */
  extras?: string[];
  /** đề đã chuyển vào Thùng rác: hoàn tác = khôi phục */
  trashed?: string[];
}

export const UNDO_MAX = 30;

export class UndoStack {
  private list: UndoEntry[] = [];
  push(e: UndoEntry): void {
    if (!e.metas.length && !e.trashed?.length && !e.extras) return; // không có gì để hoàn tác
    this.list.push(e);
    if (this.list.length > UNDO_MAX) this.list.shift();
  }
  pop(): UndoEntry | undefined { return this.list.pop(); }
  peek(): UndoEntry | undefined { return this.list[this.list.length - 1]; }
  get size(): number { return this.list.length; }
  clear(): void { this.list = []; }
}

/** Câu báo kết quả sau khi hoàn tác. */
export function undoMessage(e: UndoEntry, failed: number): string {
  const n = e.metas.length + (e.trashed?.length ?? 0);
  return failed ? `Đã hoàn tác “${e.label}” một phần: ${failed}/${n} đề không khôi phục được (có thể đã bị đổi hoặc đã chốt).` : `Đã hoàn tác: ${e.label}.`;
}
