// Điều hướng màn Cài đặt: danh sách mục (pane) và tìm cài đặt. Thuần, không đụng dữ liệu hay giá trị cài đặt.
import { fold } from './trashview';

export type PaneId = 'overview' | 'source' | 'display' | 'latex' | 'ai' | 'backup' | 'updates' | 'help';

export const PANES: { id: PaneId; label: string; hint: string }[] = [
  { id: 'overview', label: 'Tổng quan', hint: 'Tình trạng chung của HEdu' },
  { id: 'source', label: 'Nguồn dữ liệu', hint: 'Ngân hàng đang dùng và nơi lưu' },
  { id: 'display', label: 'Giao diện & hiển thị', hint: 'Phóng to chữ, cỡ hình' },
  { id: 'latex', label: 'LaTeX & TikZ', hint: 'TeX Live, bộ dịch, đầu file' },
  { id: 'ai', label: 'AI Gemini', hint: 'Khoá, mô hình, đồng ý gửi' },
  { id: 'backup', label: 'Dữ liệu & sao lưu', hint: 'Sao lưu, khôi phục, Thùng rác' },
  { id: 'updates', label: 'Cập nhật ứng dụng', hint: 'Kênh, bản mới, quay lại bản trước' },
  { id: 'help', label: 'Giới thiệu & trợ giúp', hint: 'Phiên bản, hướng dẫn ngắn' },
];

/** Một mục tìm được: mở đúng pane rồi cuộn tới khung có `aria-label` = `target`. */
export interface SettingEntry { pane: PaneId; label: string; target: string; words: string }

export const ENTRIES: SettingEntry[] = [
  { pane: 'overview', label: 'Tổng quan', target: '', words: 'tình trạng phiên bản thùng rác tex gemini sao lưu' },
  { pane: 'source', label: 'Nguồn dữ liệu đang dùng', target: 'Nguồn dữ liệu', words: 'ngân hàng đường dẫn thư mục json lưu ở đâu nguồn' },
  { pane: 'source', label: 'Dữ liệu mẫu', target: 'Dữ liệu', words: 'nạp câu mẫu đặt lại mẫu' },
  { pane: 'display', label: 'Phóng to / thu nhỏ giao diện', target: 'Cỡ hiển thị', words: 'zoom cỡ chữ phóng to thu nhỏ 80 150' },
  { pane: 'display', label: 'Cỡ hình trong xem trước', target: 'Cỡ hình trong xem trước', words: 'hình tỉ lệ cân bằng giữ nguyên figscale' },
  { pane: 'latex', label: 'Vẽ hình TikZ bằng TeX Live', target: 'Vẽ hình TikZ', words: 'tex live texlive pdflatex xelatex lualatex engine bộ dịch đường dẫn kiểm tra tikz hình cache đầu file preamble gói' },
  { pane: 'ai', label: 'AI Gemini', target: 'AI (Gemini)', words: 'ai gemini khoá khóa api key mô hình model đồng ý gửi google' },
  { pane: 'backup', label: 'Lưu trữ SQLite: bản chụp, điểm khôi phục, xuất JSON, kiểm tra toàn vẹn', target: 'Lưu trữ SQLite', words: 'sqlite chụp điểm khôi phục toàn vẹn xuất json khôi phục .db' },
  { pane: 'backup', label: 'Sao lưu trước cập nhật', target: 'Sao lưu trước cập nhật', words: 'sao lưu backup trước cập nhật khôi phục bản trước' },
  { pane: 'backup', label: 'Sao lưu thủ công / khôi phục từ file', target: 'Sao lưu thủ công', words: 'sao lưu file tải về khôi phục từ file json nhập xuất' },
  { pane: 'backup', label: 'Thùng rác', target: 'Thùng rác', words: 'thùng rác câu đã xoá khôi phục xoá hẳn' },
  { pane: 'updates', label: 'Phiên bản và cập nhật', target: 'Phiên bản và cập nhật', words: 'cập nhật update beta stable kênh phiên bản bản mới' },
  { pane: 'updates', label: 'Quay lại phiên bản trước', target: 'Quay lại phiên bản trước', words: 'quay lại rollback bản trước previous' },
  { pane: 'help', label: 'Giới thiệu & trợ giúp', target: '', words: 'giới thiệu trợ giúp hướng dẫn chẩn đoán github phiên bản' },
];

/** Tìm theo nhãn + từ khoá (bỏ dấu, không phân biệt hoa/thường, đủ mọi từ gõ vào). Chuỗi rỗng ⇒ không có kết quả. */
export function searchSettings(query: string): SettingEntry[] {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return ENTRIES.filter((e) => { const h = fold(`${e.label} ${e.words}`); return terms.every((t) => h.includes(t)); });
}

export const paneLabel = (id: PaneId): string => PANES.find((p) => p.id === id)?.label ?? id;
