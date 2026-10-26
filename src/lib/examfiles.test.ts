import assert from 'node:assert/strict';
import { anyDirty, buildTree, externalState, newFileProblem, saveBadge, savePlan, type FileEntry, type TabInfo } from './examfiles';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const F = (rel: string, kind: FileEntry['kind'] = 'text'): FileEntry => ({ rel, bytes: 1, kind });
const tab = (o: Partial<TabInfo>): TabInfo => ({ rel: 'main.tex', sha: 'a', eol: 'lf', bom: false, dirty: false, external: 'none', readOnly: null, kind: 'text', ...o });

t('cây tệp: thư mục trước, thứ tự tự nhiên, lồng nhiều cấp', () => {
  const tree = buildTree([F('main.tex'), F('chapters/c10.tex'), F('chapters/c2.tex'), F('images/a/h1.png', 'image'), F('Z.tex'), F('assets/local.sty')]);
  assert.deepEqual(tree.map((n) => n.name), ['assets', 'chapters', 'images', 'main.tex', 'Z.tex']);
  assert.deepEqual(tree[1].children.map((n) => n.name), ['c2.tex', 'c10.tex']);
  assert.equal(tree[2].children[0].children[0].rel, 'images/a/h1.png');
  assert.equal(tree[2].children[0].children[0].kind, 'image');
  assert.deepEqual(buildTree([]), []);
});
t('phát hiện tệp đổi/mất ngoài app bằng dấu vân', () => {
  assert.equal(externalState({ sha: 'a' }, { rel: 'x', exists: true, bytes: 1, sha256: 'a' }), 'none');
  assert.equal(externalState({ sha: 'a' }, { rel: 'x', exists: true, bytes: 1, sha256: 'b' }), 'changed');
  assert.equal(externalState({ sha: 'a' }, { rel: 'x', exists: false, bytes: 0, sha256: null }), 'missing');
  assert.equal(externalState({ sha: 'a' }, undefined), 'none');
  assert.equal(externalState({ sha: 'a' }, { rel: 'x', exists: true, bytes: 1, sha256: null }), 'none', 'tệp quá lớn không băm: không báo nhầm');
});
t('kế hoạch lưu tất cả: chỉ tab đang sửa; có xung đột thì chặn cả đợt, không lưu nửa vời', () => {
  assert.deepEqual(savePlan([tab({ rel: 'a', dirty: true }), tab({ rel: 'b' }), tab({ rel: 'c', dirty: true, readOnly: 'xem thôi' })]), { toSave: ['a'], blocked: [] });
  assert.deepEqual(savePlan([tab({ rel: 'a', dirty: true }), tab({ rel: 'b', dirty: true, external: 'changed' })]), { toSave: [], blocked: ['b'] });
  assert.deepEqual(savePlan([]), { toSave: [], blocked: [] });
});
t('trạng thái lưu: không chỉ bằng màu', () => {
  assert.deepEqual(saveBadge([tab({})], false), { text: 'Đã lưu', tone: 'ok' });
  assert.equal(saveBadge([tab({ dirty: true }), tab({ rel: 'b', dirty: true })], false).text, 'Chưa lưu (2 tệp)');
  assert.equal(saveBadge([tab({ dirty: true, external: 'missing' })], false).tone, 'bad');
  assert.equal(saveBadge([tab({})], true).text, 'Đang lưu…');
  assert.equal(anyDirty([tab({}), tab({ dirty: true })]), true);
  assert.equal(anyDirty([]), false);
});
t('kiểm tên tệp mới', () => {
  for (const bad of ['', ' ', '/a.tex', 'a\\b.tex', 'C:/a.tex', '../a.tex', 'a//b.tex', 'a/CON.tex', 'nul', 'a.tex.', 'a /b.tex', 'x|y.tex', '.hedu/m.tex', 'anh.png', 'a/b']) {
    assert.notEqual(newFileProblem(bad), null, JSON.stringify(bad));
  }
  for (const ok of ['de.tex', 'chapters/c1.tex', 'Đề 12/câu 1.tex', 'khaibao.sty', 'refs.bib']) assert.equal(newFileProblem(ok), null, ok);
});
console.log('examfiles: OK');
