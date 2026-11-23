// Chuyển nội dung từ bàn nháp "Xử lí TeX" sang màn Nhập liệu (không đi đường tệp).
// Chỉ là bộ nhớ tạm trong phiên: màn Nhập liệu đọc (peek) khi mở rồi xoá (clear) — tách hai bước để chạy đúng cả khi React dựng lại hai lần.
// Màn Nhập liệu vẫn làm đủ mọi bước như mọi lần nhập: chuẩn hoá, rà trùng, kiểm ID, xem lại, rồi mới ghi.

export const HANDOFF_SOURCE = 'bàn nháp Xử lí TeX';

/** nơi gửi sang: bàn nháp Xử lí TeX (mặc định) hoặc màn Đọc đề PDF/ảnh */
export type HandoffFrom = 'tex' | 'ocr';
let pending: string | null = null;
let pendingFrom: HandoffFrom = 'tex';

/** đặt nội dung chờ chuyển; chuỗi trống thì bỏ */
export function setImportHandoff(text: string, from: HandoffFrom = 'tex'): void { pending = text.trim() ? text : null; pendingFrom = from; }
/** xem nội dung đang chờ (không xoá) */
export function peekImportHandoff(): string | null { return pending; }
export function peekImportHandoffFrom(): HandoffFrom { return pendingFrom; }
export function clearImportHandoff(): void { pending = null; pendingFrom = 'tex'; }

// Chuyển một văn bản sang màn Xử lí TeX thành một bàn nháp MỚI (vd tệp đề OCR thô từ hộp thoại Thiết lập đề).
let scratchPending: { name: string; text: string } | null = null;
export function setScratchHandoff(name: string, text: string): void { scratchPending = text.trim() ? { name, text } : null; }
/** lấy rồi xoá (màn Xử lí TeX gọi một lần sau khi nạp xong) */
export function takeScratchHandoff(): { name: string; text: string } | null { const p = scratchPending; scratchPending = null; return p; }
