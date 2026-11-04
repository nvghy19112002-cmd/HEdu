// Kiểm tra một đề trước khi chốt (hàm thuần, có kiểm thử): trả danh sách kiểm tra đạt / cảnh báo / chưa đạt.
// Chỉ đọc. "Chưa đạt" không cấm chốt (giáo viên có thể cố ý) nhưng phải tự xác nhận đã hiểu; "cảnh báo" chỉ nhắc.
import { PARTS, type PartKey } from './examgen';
import type { MatrixSpec } from './exammatrix';
import type { QType } from './types';

export type CheckLevel = 'ok' | 'warn' | 'fail' | 'info';
export interface ExamCheck { key: string; level: CheckLevel; title: string; detail?: string }

const PART_OF: Record<QType, PartKey> = { tn: 'p1', ds: 'p2', tln: 'p3', tl: 'p4' };
void PARTS;

export interface QuestionInfo { review?: 'needs_fix' | 'approved'; ctrl: boolean }
export interface CheckInput {
  mainFile: string | null;
  warningCount: number;
  skippedCount: number;
  /** các bản PDF đã biên dịch được và khớp bản hiện tại */
  goods: readonly { mode: string; pages: number | null }[];
  /** null = đề soạn tay (không tạo từ ngân hàng) */
  spec: MatrixSpec | null;
  /** tra câu trong ngân hàng (undefined = không còn trong ngân hàng) */
  question(uid: string): QuestionInfo | undefined;
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toString().replace('.', ',');

export function checkExam(x: CheckInput): ExamCheck[] {
  const out: ExamCheck[] = [];
  out.push(x.mainFile
    ? { key: 'main', level: 'ok', title: `Có tệp chính (${x.mainFile})` }
    : { key: 'main', level: 'fail', title: 'Chưa chọn tệp chính', detail: 'Không biên dịch được khi chưa biết tệp nào là tệp chính.' });
  const pdf = x.goods.find((g) => g.mode === 'de' || g.mode === 'de-in') ?? x.goods[0];
  out.push(pdf
    ? { key: 'pdf', level: 'ok', title: `Đã có PDF biên dịch khớp bản hiện tại${pdf.pages ? ` (${pdf.pages} trang)` : ''}` }
    : { key: 'pdf', level: 'fail', title: 'Chưa có PDF biên dịch khớp bản hiện tại', detail: 'Mở đề, bấm "Biên dịch PDF" và xem lại bản in trước khi chốt.' });
  if (x.warningCount > 0 || x.skippedCount > 0) {
    out.push({ key: 'import', level: 'warn', title: `Có ${x.warningCount} cảnh báo và ${x.skippedCount} mục không chép khi nhập`, detail: 'Xem hộp Thông tin hoặc bước Kiểm tra tệp để chắc không thiếu hình, gói riêng.' });
  }
  const s = x.spec;
  if (!s) {
    out.push({ key: 'spec', level: 'info', title: 'Đề soạn tay (không tạo từ ngân hàng)', detail: 'Không kiểm được ma trận, thang điểm và đáp án từng mã; chỉ kiểm tệp chính và PDF.' });
    return out;
  }
  const total = s.rows.reduce((a, r) => a + r.count, 0);
  const pts = s.rows.reduce((a, r) => a + (r.count * s.scoring[PART_OF[r.type]]) / 100, 0);
  out.push(Math.abs(pts - 10) < 0.005
    ? { key: 'points', level: 'ok', title: `Tổng điểm đúng 10 (${total} câu)` }
    : { key: 'points', level: 'warn', title: `Tổng điểm theo ma trận là ${fmt(pts)}, không phải 10`, detail: 'Đúng với đề không chấm thang 10 (15 phút, 1 tiết…); nếu là đề thi chính thức thì nên chỉnh ma trận.' });
  const lv = { NB: 0, TH: 0, VD: 0, VDC: 0, any: 0 } as Record<string, number>;
  for (const r of s.rows) lv[r.level] += r.count;
  const pc = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const miss = (['NB', 'TH', 'VD'] as const).filter((k) => lv[k] === 0 && lv.any === 0);
  out.push({ key: 'levels', level: miss.length ? 'warn' : 'info', title: `Tỉ lệ mức độ: Nhận biết ${pc(lv.NB)}% · Thông hiểu ${pc(lv.TH)}% · Vận dụng ${pc(lv.VD)}% · Vận dụng cao ${pc(lv.VDC)}%${lv.any ? ` · chung ${pc(lv.any)}%` : ''}`, ...(miss.length ? { detail: `Chưa có câu mức ${miss.join(', ')}.` } : {}) });
  if (!s.perCode.length) {
    out.push({ key: 'codes', level: 'fail', title: 'Không có mã đề nào trong đề', detail: 'Tệp hedu-de.json không liệt kê mã đề.' });
    return out;
  }
  const bad: string[] = [];
  for (const c of s.perCode) {
    if (c.n !== total) bad.push(`mã ${c.code || '?'} có ${c.n} câu, ma trận cần ${total}`);
    if (c.noKey > 0) bad.push(`mã ${c.code || '?'} thiếu đáp án ở ${c.noKey} câu`);
    if (new Set(c.uids).size !== c.uids.length) bad.push(`mã ${c.code || '?'} có câu bị lặp`);
  }
  out.push(bad.length
    ? { key: 'codes', level: 'fail', title: `${s.perCode.length} mã đề nhưng có chỗ chưa khớp`, detail: bad.join('; ') + '.' }
    : { key: 'codes', level: 'ok', title: `${s.perCode.length} mã đề: đủ ${total} câu, đủ đáp án, không lặp câu` });
  // câu trong ngân hàng (xét mã đầu tiên: các mã cùng bộ câu)
  const uids = [...new Set(s.perCode[0].uids.filter(Boolean))];
  let gone = 0, fix = 0, ctrl = 0;
  for (const u of uids) { const q = x.question(u); if (!q) gone++; else { if (q.review === 'needs_fix') fix++; if (q.ctrl) ctrl++; } }
  if (ctrl) out.push({ key: 'ctrl', level: 'fail', title: `${ctrl} câu có ký tự điều khiển ẩn`, detail: 'Làm TeX báo lỗi khi biên dịch lại; sửa câu trong ngân hàng.' });
  if (gone || fix) {
    out.push({ key: 'bank', level: 'warn', title: [gone ? `${gone} câu đã bị xoá khỏi ngân hàng` : '', fix ? `${fix} câu đang bị đánh "Cần sửa"` : ''].filter(Boolean).join(' · '), detail: 'Đề giữ nguyên nội dung đã sinh; chỉ nhắc để bạn biết ngân hàng đã đổi.' });
  } else if (!ctrl) {
    out.push({ key: 'bank', level: 'ok', title: 'Mọi câu của đề vẫn còn trong ngân hàng và không bị đánh "Cần sửa"' });
  }
  return out;
}

export const failCount = (c: readonly ExamCheck[]): number => c.filter((x) => x.level === 'fail').length;
export const warnCount = (c: readonly ExamCheck[]): number => c.filter((x) => x.level === 'warn').length;
export const CHECK_ICON: Record<CheckLevel, string> = { ok: '✓', warn: '!', fail: '✗', info: 'i' };
