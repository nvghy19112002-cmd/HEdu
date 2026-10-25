import assert from 'node:assert/strict';
import { describeScan, DEFAULT_EXAM_FILTER, filterExams, formatBytes, needsMainChoice, sortExams, type ExamScan, type ExamSummary } from './examlib';

const mk = (o: Partial<ExamSummary>): ExamSummary => ({
  id: 'x', name: 'Đề', kind: 'single', mainFile: 'de.tex', status: 'draft', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  fileCount: 1, totalBytes: 10, warningCount: 0, skippedCount: 0, metadata: { tags: [] }, ...o,
});
const A = mk({ id: 'a', name: 'Đề HKI Toán 12', metadata: { grade: 12, schoolYear: '2026-2027', tags: ['thi thử'] }, updatedAt: '2026-10-05T00:00:00Z' });
const B = mk({ id: 'b', name: 'Kiểm tra 15 phút', kind: 'multi', mainFile: 'main.tex', status: 'finalized', updatedAt: '2026-10-03T00:00:00Z', createdAt: '2026-10-09T00:00:00Z' });
const C = mk({ id: 'c', name: 'Đề 2', updatedAt: '2026-10-03T00:00:00Z' });
const L = [A, B, C];
const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };

t('lọc không phân biệt dấu và hoa thường, tìm cả lớp, năm học, nhãn', () => {
  assert.deepEqual(filterExams(L, { ...DEFAULT_EXAM_FILTER, text: 'de hki' }).map((e) => e.id), ['a']);
  assert.deepEqual(filterExams(L, { ...DEFAULT_EXAM_FILTER, text: 'LOP 12' }).map((e) => e.id), ['a']);
  assert.deepEqual(filterExams(L, { ...DEFAULT_EXAM_FILTER, text: '2026-2027' }).map((e) => e.id), ['a']);
  assert.deepEqual(filterExams(L, { ...DEFAULT_EXAM_FILTER, text: 'thi thu' }).map((e) => e.id), ['a']);
  assert.deepEqual(filterExams(L, { ...DEFAULT_EXAM_FILTER, text: 'main.tex' }).map((e) => e.id), ['b']);
});
t('lọc theo loại và trạng thái; không có kết quả thì rỗng', () => {
  assert.deepEqual(filterExams(L, { ...DEFAULT_EXAM_FILTER, kind: 'multi' }).map((e) => e.id), ['b']);
  assert.deepEqual(filterExams(L, { ...DEFAULT_EXAM_FILTER, status: 'finalized' }).map((e) => e.id), ['b']);
  assert.deepEqual(filterExams(L, { ...DEFAULT_EXAM_FILTER, text: 'khong-co' }), []);
  assert.equal(filterExams(L, DEFAULT_EXAM_FILTER).length, 3);
});
t('sắp xếp ổn định: sửa gần nhất, tên, mới nhập', () => {
  assert.deepEqual(sortExams(L, 'updated').map((e) => e.id), ['a', 'c', 'b'], 'cùng ngày sửa thì theo tên');
  assert.deepEqual(sortExams(L, 'name').map((e) => e.id), ['c', 'a', 'b']);
  assert.equal(sortExams(L, 'created')[0].id, 'b');
  assert.equal(L[0].id, 'a', 'không đổi mảng gốc');
});
t('định dạng dung lượng', () => {
  assert.equal(formatBytes(5), '5 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(3 * 1024 * 1024), '3.0 MB');
});
const scan = (o: Partial<ExamScan>): ExamScan => ({ kind: 'multi', name: 'p', files: [{ rel: 'a.tex', bytes: 3 }], totalBytes: 3, candidates: [], mainFile: null, skipped: [], warnings: [], truncated: false, ...o });
t('phải chọn tệp chính khi nhiều ứng viên hoặc không có', () => {
  assert.equal(needsMainChoice(scan({ candidates: ['a.tex', 'b.tex'] })), true);
  assert.equal(needsMainChoice(scan({})), true);
  assert.equal(needsMainChoice(scan({ mainFile: 'a.tex', candidates: ['a.tex'] })), false);
  assert.equal(needsMainChoice(scan({ kind: 'single', mainFile: 'de.tex' })), false);
});
t('mô tả quét nêu rõ tệp bị bỏ qua và cảnh báo', () => {
  const lines = describeScan(scan({ candidates: ['a.tex', 'b.tex'], skipped: [{ rel: 'x', reason: 'liên kết' }], warnings: ['Có tệp đuôi chưa hỗ trợ (xyz)'] }));
  assert.ok(lines.some((l) => l.includes('2 tệp có thể là tệp chính')));
  assert.ok(lines.some((l) => l.includes('1 mục KHÔNG được chép')));
  assert.ok(lines.some((l) => l.includes('xyz')));
});
console.log('examlib: OK');
