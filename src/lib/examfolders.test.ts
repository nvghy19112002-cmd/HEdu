import assert from 'node:assert/strict';
import { checkFolderName, createFolder, deleteFolder, folderExamCount, knownFolders, MAX_DEPTH, moveFolder, renameFolder } from './examfolders';
import type { ExamSummary } from './examlib';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const mk = (id: string, folder: string | null): ExamSummary => ({
  id, name: id, kind: 'multi', mainFile: 'main.tex', status: 'draft', createdAt: '', updatedAt: '', fileCount: 1, totalBytes: 1, warningCount: 0, skippedCount: 0,
  folder, metadata: { grade: null, schoolYear: null, examType: null, tags: [] },
});
const L = [mk('1', 'Trường A'), mk('2', 'Trường A/2026'), mk('3', 'Trường A/2026/GK1'), mk('4', 'Trường B'), mk('5', null)];
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { assert.equal(r.ok, true, JSON.stringify(r)); return r as Extract<T, { ok: true }>; };
const bad = (r: { ok: boolean; error?: string }) => { assert.equal(r.ok, false); return (r as { error: string }).error; };

console.log('Thư mục riêng của Thư viện đề');
t('kiểm tên thư mục', () => {
  assert.deepEqual(checkFolderName('  Lớp   12  '), { ok: true, name: 'Lớp 12' });
  for (const s of ['', '   ', 'a/b', 'a\\b', 'a:b', 'a*', '..', '.', 'x'.repeat(61)]) assert.equal(checkFolderName(s).ok, false, s);
});
t('liệt kê thư mục, kể cả cha và thư mục trống', () => {
  assert.deepEqual(knownFolders(L, ['Mới/Con']), ['Mới', 'Mới/Con', 'Trường A', 'Trường A/2026', 'Trường A/2026/GK1', 'Trường B']);
});
t('đếm đề trong thư mục gồm cả thư mục con', () => {
  assert.equal(folderExamCount(L, 'Trường A'), 3);
  assert.equal(folderExamCount(L, 'Trường A/2026'), 2);
  assert.equal(folderExamCount(L, 'Trường'), 0); // không khớp nửa tên
});
t('tạo thư mục trống; từ chối trùng (không phân biệt hoa/thường) và quá sâu', () => {
  assert.deepEqual(ok(createFolder(L, [], '', 'Mới')).extras, ['Mới']);
  assert.equal(ok(createFolder(L, ['Mới'], 'Mới', 'Con')).path, 'Mới/Con');
  assert.match(bad(createFolder(L, [], '', 'trường a')), /Đã có/);
  assert.match(bad(createFolder(L, ['Mới'], 'Mới', 'Con/x')), /không được chứa/);
  assert.match(bad(createFolder(L, [], 'a/b/c/d/e', 'f')), /tối đa/);
  assert.equal(MAX_DEPTH, 5);
});
t('đổi tên: ghi lại nhãn mọi đề bên trong, kể cả thư mục con', () => {
  const r = ok(renameFolder(L, [], 'Trường A', 'Sở'));
  assert.deepEqual(r.patches, [{ id: '1', folder: 'Sở' }, { id: '2', folder: 'Sở/2026' }, { id: '3', folder: 'Sở/2026/GK1' }]);
  assert.equal(r.path, 'Sở');
  const sub = ok(renameFolder(L, [], 'Trường A/2026', '2027'));
  assert.deepEqual(sub.patches.map((p) => p.folder), ['Trường A/2027', 'Trường A/2027/GK1']);
});
t('đổi tên: từ chối trùng anh em; cho đổi hoa/thường của chính nó; tên y nguyên thì không làm gì', () => {
  assert.match(bad(renameFolder(L, [], 'Trường A', 'Trường B')), /Đã có/);
  assert.equal(ok(renameFolder(L, [], 'Trường A', 'TRƯỜNG A')).patches.length, 3);
  assert.equal(ok(renameFolder(L, [], 'Trường A', 'Trường A')).patches.length, 0);
});
t('đổi tên thư mục trống cập nhật cả thư mục con trống', () => {
  const r = ok(renameFolder(L, ['Mới', 'Mới/Con', 'Khác'], 'Mới', 'Cũ'));
  assert.deepEqual(r.extras.sort(), ['Cũ', 'Cũ/Con', 'Khác']);
  assert.equal(r.patches.length, 0);
});
t('di chuyển thư mục; cấm vào chính nó / thư mục con; cấm trùng; cấm quá sâu', () => {
  assert.deepEqual(ok(moveFolder(L, [], 'Trường A/2026', 'Trường B')).patches, [{ id: '2', folder: 'Trường B/2026' }, { id: '3', folder: 'Trường B/2026/GK1' }]);
  assert.deepEqual(ok(moveFolder(L, [], 'Trường A/2026', '')).patches.map((p) => p.folder), ['2026', '2026/GK1']);
  assert.match(bad(moveFolder(L, [], 'Trường A', 'Trường A/2026')), /chính nó/);
  assert.match(bad(moveFolder(L, [], 'Trường A', 'Trường A')), /chính nó/);
  assert.match(bad(moveFolder(L, ['Trường B/2026'], 'Trường A/2026', 'Trường B')), /Đã có/);
  assert.match(bad(moveFolder(L, ['a/b/c/d'], 'Trường A', 'a/b/c/d')), /tối đa/);
});
t('xoá thư mục: đề không bị xoá, được đưa lên thư mục cha', () => {
  const r = ok(deleteFolder(L, ['Trường A/2026/Trống', 'Khác'], 'Trường A/2026'));
  assert.deepEqual(r.patches, [{ id: '2', folder: 'Trường A' }, { id: '3', folder: 'Trường A' }]);
  assert.deepEqual(r.extras, ['Khác']);
  assert.equal(r.path, null);
  assert.deepEqual(ok(deleteFolder(L, [], 'Trường A')).patches.map((p) => p.folder), [null, null, null]);
});
