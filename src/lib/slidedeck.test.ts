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

await t('đổi chỗ câu trong bộ; cách chiếu đọc an toàn; trộn giữ đủ câu', async () => {
  const { moveIn } = await import('./slidedeck');
  const { parsePlayOpts, DEFAULT_PLAY, shuffled, estimateSecs } = await import('./slideshow');
  const it = [{ latex: 'a' }, { latex: 'b' }, { latex: 'c' }];
  assert.deepEqual(moveIn(it, 0, 2).map((x) => x.latex), ['b', 'c', 'a']);
  assert.deepEqual(moveIn(it, 2, 0).map((x) => x.latex), ['c', 'a', 'b']);
  assert.deepEqual(moveIn(it, 1, 9).map((x) => x.latex), ['a', 'c', 'b']);
  assert.deepEqual(parsePlayOpts('rác'), DEFAULT_PLAY);
  const o = parsePlayOpts(JSON.stringify({ countdown: true, secs: { tn: 2, ds: 90 } }));
  assert.equal(o.countdown, true);
  assert.equal(o.secs.tn, 60);
  assert.equal(o.secs.ds, 90);
  let k = 0;
  const sh = shuffled([1, 2, 3, 4], () => [0.1, 0.9, 0.5][k++ % 3]);
  assert.deepEqual([...sh].sort(), [1, 2, 3, 4]);
  assert.equal(estimateSecs(['tn', 'ds', 'tln'], DEFAULT_PLAY), 360);
});
