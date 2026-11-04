// "Sức khoẻ ngân hàng": quét mọi câu và đếm những chỗ cần giáo viên xem lại (thuần, không ghi gì).
// Mỗi câu có thể mắc nhiều vấn đề; số đếm của từng vấn đề độc lập nhau. Nghi trùng không tính ở đây (có màn Kiểm tra trùng riêng).
import { checkQuestion, worstLevel } from './check';
import { parseExTest } from './extest';
import { answerReadable } from './importtrust';
import { hasControlChars } from './examgen';
import { reviewOf, type Question } from './types';

export type HealthKey = 'chua-kiem' | 'can-sua' | 'chua-id' | 'dang-chua-xm' | 'muc-chua-xm' | 'dap-an' | 'loi-xem-truoc' | 'canh-bao' | 'ky-tu-dk' | 'thieu-loi-giai';
export type HealthTone = 'loi' | 'canh' | 'tin';
export interface HealthInfo { key: HealthKey; label: string; hint: string; tone: HealthTone }

/** Thứ tự hiện trên màn: vấn đề nặng trước. */
export const HEALTH: readonly HealthInfo[] = [
  { key: 'can-sua', tone: 'loi', label: 'Đánh dấu "Cần sửa"', hint: 'Bạn đã đánh dấu những câu này cần sửa; chưa vào đề được.' },
  { key: 'loi-xem-truoc', tone: 'loi', label: 'Xem trước bị lỗi', hint: 'Công thức không dựng được hoặc ngoặc/môi trường lệch: nên sửa mã.' },
  { key: 'ky-tu-dk', tone: 'loi', label: 'Có ký tự điều khiển ẩn', hint: 'Làm TeX báo lỗi "Unicode character ^^H"; câu như vậy không vào được đề.' },
  { key: 'dap-an', tone: 'canh', label: 'Không đọc chắc được đáp án', hint: 'Thiếu hoặc nhiều hơn một \\True, thiếu \\shortans… Tạo đề và Duyệt theo lô cần đáp án.' },
  { key: 'canh-bao', tone: 'canh', label: 'Có cảnh báo khi kiểm câu', hint: 'Đáng ngờ nhưng vẫn dùng được: nên xem lại.' },
  { key: 'chua-id', tone: 'canh', label: 'Chưa có vị trí (chưa phân loại)', hint: 'Câu nằm ở mục "Chưa có ID": chưa vào được Dạng nào.' },
  { key: 'dang-chua-xm', tone: 'tin', label: 'Dạng chưa xác minh', hint: 'Vị trí Dạng do máy hoặc tệp nhập quyết định, chưa được giáo viên xác nhận.' },
  { key: 'muc-chua-xm', tone: 'tin', label: 'Mức độ chưa xác minh', hint: 'Mức độ (NB/TH/VD/VDC) chưa được giáo viên xác nhận.' },
  { key: 'chua-kiem', tone: 'tin', label: 'Chưa kiểm tra (nội dung)', hint: 'Chưa được đánh dấu "Đã duyệt" hay "Cần sửa".' },
  { key: 'thieu-loi-giai', tone: 'tin', label: 'Chưa có lời giải', hint: 'Chỉ để biết: đề có đáp án + lời giải cần đủ lời giải.' },
];
export const HEALTH_BY_KEY: Readonly<Record<HealthKey, HealthInfo>> = Object.fromEntries(HEALTH.map((h) => [h.key, h])) as Record<HealthKey, HealthInfo>;

/** Trạng thái xác minh có hiệu lực của câu (lấy từ idreview.effectiveOf; truyền vào để hàm này thuần). */
export interface EffState { form: 'chua' | 'may' | 'gv' | 'xem-lai'; level: 'chua' | 'may' | 'gv'; unclassified: boolean }

/** Các vấn đề của MỘT câu. Việc phân tích mã (parse + kiểm) là phần nặng nhất nên gom ở đây để quét theo từng đợt nhỏ. */
export function healthFlags(q: Question, eff: EffState): HealthKey[] {
  const out: HealthKey[] = [];
  const rv = reviewOf(q);
  if (rv === 'needs_fix') out.push('can-sua');
  else if (rv === 'unreviewed') out.push('chua-kiem');
  if (eff.unclassified) out.push('chua-id');
  else if (eff.form !== 'gv') out.push('dang-chua-xm');
  if (eff.level !== 'gv') out.push('muc-chua-xm');
  if (hasControlChars(q)) out.push('ky-tu-dk');
  const p = parseExTest(q.latex);
  if (q.type !== 'tl' && !answerReadable(p)) out.push('dap-an');
  if (!p.solution?.trim()) out.push('thieu-loi-giai');
  const w = worstLevel(checkQuestion(p, q.latex, 0));
  if (w === 'loi') out.push('loi-xem-truoc');
  else if (w === 'canh') out.push('canh-bao');
  return out;
}

export interface HealthReport {
  total: number;
  scanned: number;
  counts: Record<HealthKey, number>;
  /** uid từng vấn đề (giữ thứ tự quét) */
  uids: Record<HealthKey, string[]>;
  /** câu hoàn toàn không có vấn đề "nặng" (loi/canh) */
  clean: number;
}
export const emptyReport = (total: number): HealthReport => ({
  total, scanned: 0, clean: 0,
  counts: Object.fromEntries(HEALTH.map((h) => [h.key, 0])) as Record<HealthKey, number>,
  uids: Object.fromEntries(HEALTH.map((h) => [h.key, [] as string[]])) as Record<HealthKey, string[]>,
});
/** Cộng kết quả của một câu vào báo cáo (thay đổi `r` tại chỗ). */
export function addToReport(r: HealthReport, uid: string, flags: readonly HealthKey[]): void {
  r.scanned++;
  for (const k of flags) { r.counts[k]++; r.uids[k].push(uid); }
  if (!flags.some((k) => HEALTH_BY_KEY[k].tone !== 'tin')) r.clean++;
}
