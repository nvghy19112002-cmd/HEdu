import assert from 'node:assert/strict';
import { UndoStack, UNDO_MAX, undoMessage, type UndoEntry } from './examundo';
import type { ExamMetaIn } from './examlib';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const meta = (name: string): ExamMetaIn => ({ name, folder: null, grade: 12, schoolYear: null, examType: null, tags: [], status: 'draft' });
const entry = (label: string, ids: string[] = ['a']): UndoEntry => ({ label, metas: ids.map((id) => ({ id, meta: meta(id) })) });

console.log('Hoàn tác ở Thư viện đề');
t('vào sau ra trước; peek không lấy ra', () => {
  const s = new UndoStack();
  s.push(entry('một')); s.push(entry('hai'));
  assert.equal(s.size, 2); assert.equal(s.peek()?.label, 'hai');
  assert.equal(s.pop()?.label, 'hai'); assert.equal(s.pop()?.label, 'một'); assert.equal(s.pop(), undefined);
});
t('mục rỗng không được đẩy vào; thao tác thư mục chỉ có extras vẫn được', () => {
  const s = new UndoStack();
  s.push({ label: 'x', metas: [] });
  assert.equal(s.size, 0);
  s.push({ label: 'thư mục', metas: [], extras: ['A'] });
  s.push({ label: 'xoá', metas: [], trashed: ['id1'] });
  assert.equal(s.size, 2);
});
t('chỉ nhớ UNDO_MAX mục gần nhất', () => {
  const s = new UndoStack();
  for (let i = 0; i < UNDO_MAX + 5; i++) s.push(entry(`m${i}`));
  assert.equal(s.size, UNDO_MAX);
  assert.equal(s.peek()?.label, `m${UNDO_MAX + 4}`);
  s.clear(); assert.equal(s.size, 0);
});
t('câu báo kết quả', () => {
  assert.equal(undoMessage(entry('Chuyển 2 đề', ['a', 'b']), 0), 'Đã hoàn tác: Chuyển 2 đề.');
  assert.match(undoMessage(entry('Chuyển 2 đề', ['a', 'b']), 1), /một phần: 1\/2 đề/);
});
