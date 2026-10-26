import assert from 'node:assert/strict';
import { allFolders, applyFacets, EMPTY_SEL, facets, folderTree, isEmptySel } from './examfacets';
import { backupLabel, bundleFolderName, parseTags, type ExamSummary } from './examlib';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const mk = (id: string, o: Partial<ExamSummary> & { grade?: number; year?: string; type?: string; tags?: string[] }): ExamSummary => ({
  id, name: id, kind: 'multi', mainFile: 'main.tex', status: 'draft', createdAt: '', updatedAt: '', fileCount: 1, totalBytes: 1, warningCount: 0, skippedCount: 0,
  folder: o.folder ?? null, metadata: { grade: o.grade ?? null, schoolYear: o.year ?? null, examType: o.type ?? null, tags: o.tags ?? [] }, ...(o.status ? { status: o.status } : {}),
});
const L = [
  mk('a', { folder: 'Lớp 12/Học kỳ 1', grade: 12, year: '2026-2027', type: 'Giữa kỳ', tags: ['thi thử'] }),
  mk('b', { folder: 'Lớp 12/Học kỳ 2', grade: 12, year: '2026-2027', type: 'Cuối kỳ' }),
  mk('c', { folder: 'Lớp 11', grade: 11, year: '2025-2026', type: 'Giữa kỳ', status: 'finalized' }),
  mk('d', {}),
];

t('cây thư mục: đếm cả thư mục con, đề chưa xếp riêng, thứ tự tự nhiên', () => {
  const r = folderTree(L, EMPTY_SEL);
  assert.deepEqual(r.roots.map((n) => [n.name, n.count]), [['Lớp 11', 1], ['Lớp 12', 2]]);
  assert.deepEqual(r.roots[1].children.map((n) => [n.path, n.count]), [['Lớp 12/Học kỳ 1', 1], ['Lớp 12/Học kỳ 2', 1]]);
  assert.equal(r.unfiled, 1);
  assert.equal(r.total, 4);
});
t('lọc theo thư mục (gồm thư mục con), chưa xếp, và các chiều khác cùng lúc', () => {
  assert.deepEqual(applyFacets(L, { ...EMPTY_SEL, folder: 'Lớp 12' }).map((e) => e.id), ['a', 'b']);
  assert.deepEqual(applyFacets(L, { ...EMPTY_SEL, folder: 'Lớp 12/Học kỳ 1' }).map((e) => e.id), ['a']);
  assert.deepEqual(applyFacets(L, { ...EMPTY_SEL, folder: 'Lớp 1' }).map((e) => e.id), [], 'tiền tố chữ không phải thư mục cha');
  assert.deepEqual(applyFacets(L, { ...EMPTY_SEL, folder: '' }).map((e) => e.id), ['d']);
  assert.deepEqual(applyFacets(L, { ...EMPTY_SEL, grade: 12, type: 'Giữa kỳ' }).map((e) => e.id), ['a']);
  assert.deepEqual(applyFacets(L, { ...EMPTY_SEL, tag: 'thi thử' }).map((e) => e.id), ['a']);
  assert.deepEqual(applyFacets(L, { ...EMPTY_SEL, status: 'finalized' }).map((e) => e.id), ['c']);
  assert.equal(applyFacets(L, EMPTY_SEL).length, 4);
});
t('đếm theo chiều tính theo các chiều khác; giá trị đang chọn luôn hiện', () => {
  const f = facets(L, EMPTY_SEL);
  assert.deepEqual(f.grades, [{ value: 11, count: 1 }, { value: 12, count: 2 }]);
  assert.deepEqual(f.years.map((x) => x.value), ['2026-2027', '2025-2026'], 'năm mới trước');
  const g = facets(L, { ...EMPTY_SEL, type: 'Giữa kỳ' });
  assert.deepEqual(g.grades, [{ value: 11, count: 1 }, { value: 12, count: 1 }], 'đếm lớp trong các đề giữa kỳ');
  assert.deepEqual(g.types.map((x) => [x.value, x.count]), [['Cuối kỳ', 1], ['Giữa kỳ', 2]], 'chiều loại đề không bị chính nó giới hạn');
  const h = facets(L, { ...EMPTY_SEL, grade: 10 });
  assert.deepEqual(h.grades.find((x) => x.value === 10), { value: 10, count: 0 });
  assert.equal(isEmptySel(EMPTY_SEL), true);
  assert.equal(isEmptySel({ ...EMPTY_SEL, grade: 12 }), false);
});
t('gợi ý thư mục có cả thư mục cha', () => {
  assert.deepEqual(allFolders(L), ['Lớp 11', 'Lớp 12', 'Lớp 12/Học kỳ 1', 'Lớp 12/Học kỳ 2']);
});
t('tên thư mục gói an toàn, nhãn sao lưu, nhãn nhập tay', () => {
  assert.equal(bundleFolderName('Đề HKI: Toán 12 / A?'), 'Đề HKI- Toán 12 - A-');
  assert.equal(bundleFolderName('CON'), 'CON-de');
  assert.equal(bundleFolderName('   '), 'de-thi');
  assert.equal(bundleFolderName('abc. '), 'abc');
  assert.equal(backupLabel('20261026T055146123'), '26/10/2026 05:51:46');
  assert.equal(backupLabel('x'), 'x');
  assert.deepEqual(parseTags(' a, b ,a,,c '), ['a', 'b', 'c']);
  assert.equal(parseTags(Array.from({ length: 14 }, (_, i) => `t${i}`).join(',')).length, 10);
});
console.log('examfacets: OK');
