// Kiểm lỗi mã LaTeX bằng ChkTeX (đi kèm TeX Live; Rust: chktex.rs). Chỉ đọc, không sửa mã.
import { invoke } from './platform';

export interface Lint { line: number; col: number; num: number; level: 'error' | 'warning' | 'info'; msg: string }
export const chktexCheck = (text: string, texBin?: string) => invoke<Lint[]>('chktex_check', { text, texBin: texBin || null });

/** Lời giải thích tiếng Việt cho những cảnh báo thường gặp nhất (còn lại hiện nguyên văn tiếng Anh của ChkTeX). */
const VI: Record<number, string> = {
  9: 'Thiếu hoặc lệch dấu đóng/mở (xem chi tiết)',
  10: 'Ký hiệu đứng riêng lẻ, có thể thừa',
  14: 'Có thể thiếu dấu đóng nhóm',
  15: 'Không có dấu đóng khớp với dấu mở { hoặc [',
  16: 'Chế độ toán ($…$) vẫn mở ở cuối',
  17: 'Số dấu mở và dấu đóng không bằng nhau',
  19: 'Dấu nháy kiểu Unicode: nên dùng \' hoặc ` của TeX',
  21: 'Lệnh này có thể không đúng ý bạn',
  23: 'Nên dùng \\ldots (hoặc \\dots) cho dấu ba chấm',
  25: 'Nên đặt trong cặp {} để tránh dính chữ',
  27: 'Lệnh mới nên đặt trong phần khai báo',
};
export const lintText = (l: Lint): string => VI[l.num] ?? l.msg;
export const LEVEL_VI: Record<Lint['level'], string> = { error: 'Lỗi', warning: 'Cảnh báo', info: 'Gợi ý' };

/** Tóm tắt một dòng cho thanh trạng thái. */
export function lintSummary(v: readonly Lint[]): string {
  if (!v.length) return 'Không thấy vấn đề nào.';
  const e = v.filter((x) => x.level === 'error').length;
  return `${v.length} chỗ cần xem${e ? ` (${e} lỗi)` : ''}.`;
}
