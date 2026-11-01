// Chuyển nội dung từ bàn nháp "Xử lí TeX" sang màn Nhập liệu (không đi đường tệp).
// Chỉ là bộ nhớ tạm trong phiên: màn Nhập liệu đọc (peek) khi mở rồi xoá (clear) — tách hai bước để chạy đúng cả khi React dựng lại hai lần.
// Màn Nhập liệu vẫn làm đủ mọi bước như mọi lần nhập: chuẩn hoá, rà trùng, kiểm ID, xem lại, rồi mới ghi.

export const HANDOFF_SOURCE = 'bàn nháp Xử lí TeX';

let pending: string | null = null;

/** đặt nội dung chờ chuyển; chuỗi trống thì bỏ */
export function setImportHandoff(text: string): void { pending = text.trim() ? text : null; }
/** xem nội dung đang chờ (không xoá) */
export function peekImportHandoff(): string | null { return pending; }
export function clearImportHandoff(): void { pending = null; }
