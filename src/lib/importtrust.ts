// Duyệt theo lô nguồn tin cậy (màn Nhập liệu): giáo viên xác nhận MỘT lần "lô này từ nguồn đã kiểm", HEdu chỉ đánh dấu "Đã duyệt"
// cho câu đạt ĐỦ điều kiện dưới đây; câu khác giữ "Chưa kiểm tra". Có dấu vết bằng nhãn để tìm lại và hoàn tác cả lô.
import type { Issue } from './check';
import type { ParsedQuestion } from './extest';

/** Lý do một câu KHÔNG được duyệt theo lô (null = đủ điều kiện). */
export type TrustBlock = 'trung' | 'loi-ma' | 'xem-truoc' | 'dap-an' | 'id';
export const TRUST_BLOCK_LABEL: Record<TrustBlock, string> = {
  trung: 'trùng hoặc nghi trùng câu khác',
  'loi-ma': 'mã LaTeX có lỗi',
  'xem-truoc': 'xem trước chưa dựng chuẩn',
  'dap-an': 'không đọc chắc được đáp án',
  id: 'chưa có ID hợp lệ hoặc ID bất đồng',
};

/** Đáp án đọc được chắc chắn theo loại câu. Tự luận không có đáp án để đọc. */
export function answerReadable(p: Pick<ParsedQuestion, 'type' | 'options' | 'shortAnswer'>): boolean {
  if (p.type === 'tn') return p.options.length === 4 && p.options.filter((o) => o.correct).length === 1;
  if (p.type === 'ds') return p.options.length === 4;
  if (p.type === 'tln') return !!p.shortAnswer?.trim();
  return true;
}

export interface TrustInput {
  /** kết quả rà trùng của câu: chỉ 'new' (mới) và 'template' (cùng mẫu, khác dữ kiện) được duyệt */
  status: string;
  /** kết quả kiểm tra câu (check.ts); undefined = chưa kiểm xong ⇒ không duyệt */
  issues: readonly Issue[] | undefined;
  p: Pick<ParsedQuestion, 'type' | 'options' | 'shortAnswer'>;
  /** câu có ID hợp lệ đủ Dạng và kiểm chứng KHÔNG bất đồng */
  idOk: boolean;
}

export function trustBlock(x: TrustInput): TrustBlock | null {
  if (x.status !== 'new' && x.status !== 'template') return 'trung';
  if (!x.issues) return 'xem-truoc';
  if (x.issues.some((i) => i.level === 'loi')) return 'loi-ma';
  if (x.issues.some((i) => i.message.startsWith('Xem trước chưa dựng chuẩn'))) return 'xem-truoc';
  if (!answerReadable(x.p)) return 'dap-an';
  if (!x.idOk) return 'id';
  return null;
}

/** Nhãn dấu vết gắn vào mọi câu được duyệt theo lô (lọc theo nhãn này để xem lại hoặc đưa cả lô về "Chưa kiểm tra"). */
export const trustTag = (batchName: string, at: Date): string =>
  `Duyệt theo lô: ${batchName.trim() || at.toLocaleDateString('vi-VN')}`;
