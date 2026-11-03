import assert from 'node:assert/strict';
import { catalogBook, filesSummary, packFolderName, type PackExam } from './exampack';
import type { ExamSummary } from './examlib';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const ex = (name: string, o: Partial<ExamSummary['metadata']> = {}): ExamSummary => ({
  id: name, name, kind: 'multi', mainFile: 'main.tex', status: 'finalized', createdAt: '', updatedAt: '', fileCount: 1, totalBytes: 1, warningCount: 0, skippedCount: 0,
  folder: null, metadata: { grade: 12, schoolYear: '2026–2027', examType: 'Giữa kỳ 1', tags: [], ...o },
});
const text = (c: { v?: string; n?: number } | undefined) => c?.v ?? (c?.n === undefined ? '' : String(c.n));

console.log('Xuất trọn gói');
t('tên thư mục con: số thứ tự + tên không dấu', () => {
  assert.equal(packFolderName(0, 'Đề giữa kỳ 1 Toán 12 — Mã 101'), '01-De-giua-ky-1-Toan-12-Ma-101');
  assert.equal(packFolderName(11, '???'), '12-de');
  assert.ok(packFolderName(0, 'x'.repeat(200)).length <= 51);
});
t('danh mục: mỗi đề một dòng, ô trống cho đề không có số liệu, ghi chú lý do', () => {
  const a: PackExam = { exam: ex('Đề A'), questions: 22, codes: 4, pages: 4, folder: '01-De-A', notes: [], files: [{ rel: 'de_de-a.pdf', kind: 'PDF đề', bytes: 412000, sha: '9f3a1c07' }, { rel: 'Ma-tran.xlsx', kind: 'Ma trận (xlsx)', bytes: 12000, sha: 'c4d9e8a2' }] };
  const b: PackExam = { exam: ex('Đề B', { grade: null }), questions: null, codes: null, pages: null, folder: '02-De-B', notes: ['Chưa có PDF biên dịch', 'Soạn tay: không có ma trận'], files: [] };
  const book = catalogBook([a, b], { at: '04/11/2026 21:30', dir: 'D:\\Xuat' });
  assert.deepEqual(book.sheets.map((s) => s.name), ['Danh mục', 'Tệp đã xuất']);
  const rows = book.sheets[0].rows;
  assert.match(text(rows[1][0]), /2 đề · Thư mục: D:\\Xuat/);
  assert.deepEqual(rows[3].map(text).slice(0, 3), ['STT', 'Tên đề', 'Lớp']);
  assert.deepEqual(rows[4].map(text), ['1', 'Đề A', '12', 'Giữa kỳ 1', '2026–2027', 'Đã chốt', '22', '4', '4', '01-De-A', 'PDF đề, Ma trận (xlsx)', '']);
  assert.equal(text(rows[5][2]), '', 'đề không ghi lớp: ô trống, không phải số 0');
  assert.equal(text(rows[5][6]), '');
  assert.equal(text(rows[5][11]), 'Chưa có PDF biên dịch; Soạn tay: không có ma trận');
  assert.equal(filesSummary(b), 'không có tệp nào');
  const f = book.sheets[1].rows;
  assert.equal(f.length, 3, 'tiêu đề + 2 tệp của đề A');
  assert.deepEqual(f[1].map(text), ['01', '01-De-A/de_de-a.pdf', 'PDF đề', '402 KB', '9f3a1c07']);
});
