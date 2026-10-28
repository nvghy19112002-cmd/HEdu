// Xuất đề từng mã: điều kiện bấm Xuất, tóm tắt kết quả (không bao giờ nói "đã xuất đủ" khi có lỗi/dừng).
import { exportGate, phaseText, readyCodes, summarize, type CodesInfo, type ExportOut } from './examexport';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const code = (c: string, o: Partial<CodesInfo['codes'][0]> = {}) => ({ code: c, hasMain: true, hasDe: true, counts: [2, 1, 1, 0] as [number, number, number, number], problem: null, ...o });
const info = (codes: CodesInfo['codes'], o: Partial<CodesInfo> = {}): CodesInfo => ({ hasSpec: true, title: 'T', seed: 1, codes, problems: [], canBackfill: false, maxCodes: 24, ...o });

console.log('Điều kiện bấm Xuất');
{
  const i = info([code('101'), code('102', { hasMain: false }), code('103', { problem: 'de-103.tex có [1,1,1,0] câu' })]);
  ok(readyCodes(i).join() === '101', 'chỉ mã có tệp chính riêng và đã đối chiếu khớp mới sẵn sàng');
  ok(exportGate(i, ['101'], 'D:/x').ok, 'đủ điều kiện');
  ok(!exportGate(i, ['101', '102'], 'D:/x').ok && /main/.test(exportGate(i, ['101', '102'], 'D:/x').why ?? ''), 'mã chưa có tệp chính ⇒ chặn');
  ok(exportGate(i, ['103'], 'D:/x').why?.includes('de-103'), 'mã không khớp dữ liệu đã lưu ⇒ chặn kèm lý do');
  ok(!exportGate(i, [], 'D:/x').ok && !exportGate(i, ['101'], null).ok, 'chưa chọn mã hoặc thư mục ⇒ chặn');
  ok(!exportGate(null, ['101'], 'D:/x').ok && !exportGate(info([], { hasSpec: false, problems: ['Đề này không được tạo bằng Tạo đề'] }), ['101'], 'D:/x').ok, 'đề không có dữ liệu mã đề ⇒ chặn');
  const many = info(Array.from({ length: 30 }, (_, k) => code(String(100 + k))));
  ok(!exportGate(many, many.codes.map((c) => c.code), 'D:/x').ok && exportGate(many, many.codes.slice(0, 24).map((c) => c.code), 'D:/x').ok, 'tối đa 24 mã mỗi lượt');
  ok(!exportGate(info([code('101')], { problems: ['Đề có 30 mã, vượt giới hạn'] }), ['101'], 'D:/x').ok, 'đề có vấn đề chung ⇒ chặn');
}

console.log('Tóm tắt kết quả');
{
  const base: ExportOut = { ok: false, cancelled: false, zipPath: null, zipBytes: null, exportId: 'e1', message: '', results: [] };
  const r = (c: string, status: ExportOut['results'][0]['status']) => ({ code: c, status, message: '', pages: 1, cached: false, sha256: null });
  ok(summarize({ ...base, ok: true, zipPath: 'D:/a.zip', message: 'Đã tạo gói' }).includes('D:/a.zip'), 'thành công nêu đường dẫn ZIP');
  const bad = summarize({ ...base, results: [r('101', 'ok'), r('102', 'failed')] });
  ok(bad.includes('KHÔNG tạo ZIP') && bad.includes('102') && !/đã xuất đủ|thành công/i.test(bad), 'có mã lỗi: nói rõ không tạo ZIP, nêu mã lỗi');
  ok(summarize({ ...base, cancelled: true }).includes('Không tạo ZIP'), 'đã dừng: không tạo ZIP');
  ok(phaseText({ id: 'x', phase: 'dich-de', index: 2, total: 4, code: '102' }).includes('mã 102 (2/4)'), 'tiến độ hiện mã và thứ tự');
}

if (fail) process.exit(1);
console.log('examexport: đạt hết.');
