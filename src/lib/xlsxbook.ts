// Mô hình bảng Excel do giao diện dựng, lõi Rust (exampack.rs) ghi ra .xlsx. Không ghi đè tệp có sẵn.
import { invoke } from './platform';

/** Kiểu ô: 0 thường · 1 tiêu đề lớn · 2 chữ đậm · 3 đầu bảng · 4 thân bảng giữa · 5 thân bảng trái · 6 dòng cộng · 7 dòng cộng trái */
export type CellStyle = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export interface XCell { v?: string; n?: number; s?: CellStyle }
export interface XSheet {
  name: string; rows: XCell[][];
  /** [hàng đầu, cột đầu, hàng cuối, cột cuối], tính từ 0 */
  merges?: [number, number, number, number][];
  widths?: number[]; freeze?: [number, number]; landscape?: boolean;
}
export interface XBook { sheets: XSheet[] }

export const S_TITLE: CellStyle = 1, S_BOLD: CellStyle = 2, S_HEAD: CellStyle = 3, S_BODY: CellStyle = 4, S_LEFT: CellStyle = 5, S_SUM: CellStyle = 6, S_SUML: CellStyle = 7;

export const cellText = (v: string | undefined | null, s: CellStyle = S_BODY): XCell => ({ v: v ?? '', s });
export const cellNum = (n: number | null | undefined, s: CellStyle = S_BODY): XCell => (n == null ? { s } : { n, s });

/** Ghi sổ Excel; trả về đường dẫn thật (thêm -2, -3… nếu trùng tên). */
export const saveXlsx = (dest: string, book: XBook) => invoke<string>('xlsx_save', { dest, book });
