import assert from 'node:assert/strict';
import { _resetDecks, addToDeck, cleanName, createDeck, deleteDeck, dumpDecks, listDecks, loadDecks, mergeItems, parseDecks, removeItem, renameDeck } from './slidedeck';

const t = async (name: string, f: () => void | Promise<void>) => { await f(); console.log('  ✓ ' + name); };

console.log('Bộ trình chiếu');
await t('đọc tệp phụ: bỏ bộ/câu hỏng, giữ phần đúng', () => {
  assert.deepEqual(parseDecks(null), []);
  assert.deepEqual(parseDecks('rác'), []);
  assert.deepEqual(parseDecks('{"v":2,"decks":[]}'), []);
  const ds = parseDecks(JSON.stringify({ v: 1, decks: [{ id: 'a', name: 'Bộ A', items: [{ latex: 'x', uid: 'u1' }, { latex: '  ' }, { nope: 1 }] }, { name: 'thiếu id' }] }));
  assert.equal(ds.length, 1);
  assert.deepEqual(ds[0].items, [{ latex: 'x', uid: 'u1' }]);
  assert.deepEqual(parseDecks(dumpDecks(ds)), ds);
});
await t('gộp câu: bỏ trùng theo UID hoặc nguyên văn, giữ thứ tự', () => {
  const m = mergeItems([{ latex: 'a', uid: 'u1' }], [{ latex: 'a đã sửa', uid: 'u1' }, { latex: 'b' }, { latex: 'b' }, { latex: 'c', uid: 'u3' }]);
  assert.deepEqual(m.items.map((x) => x.latex), ['a', 'b', 'c']);
  assert.deepEqual([m.added, m.skipped], [2, 2]);
  assert.equal(cleanName('  Ôn   tập  '), 'Ôn tập');
});
await t('tạo, thêm, đổi tên, bỏ câu, xoá; lỗi ghi thì giữ nguyên', async () => {
  let disk: string | null = null;
  let fail = false;
  _resetDecks({ async load() { return disk; }, async save(j) { if (fail) throw new Error('đĩa đầy'); disk = j; } });
  await loadDecks();
  const d = await createDeck(' Chương 1 ', [{ latex: 'q1', uid: 'u1' }, { latex: 'q2', uid: 'u2' }]);
  assert.equal(d.name, 'Chương 1');
  assert.deepEqual(await addToDeck(d.id, [{ latex: 'q2', uid: 'u2' }, { latex: 'q3' }]), { added: 1, skipped: 1 });
  await renameDeck(d.id, 'Ôn tập');
  await removeItem(d.id, 0);
  assert.deepEqual(listDecks()[0].items.map((x) => x.latex), ['q2', 'q3']);
  assert.equal(parseDecks(disk)[0].name, 'Ôn tập', 'đã ghi xuống tệp phụ');
  fail = true;
  await assert.rejects(deleteDeck(d.id));
  assert.equal(listDecks().length, 1, 'ghi lỗi: không mất bộ');
  fail = false;
  await deleteDeck(d.id);
  assert.equal(listDecks().length, 0);
  await assert.rejects(createDeck('   ', []));
});
