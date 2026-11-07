import assert from 'node:assert/strict';

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } } as Storage;
const { ctxHidden, isCtxKey, setCtxHidden, toggleCtx } = await import('./ctxcol');

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const k = (key: string, o: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...o });

console.log('Cột ngữ cảnh (Ctrl+B)');
t('ẩn/hiện và máy nhớ', () => {
  assert.equal(ctxHidden(), false);
  toggleCtx(); assert.equal(ctxHidden(), true); assert.equal(store.get('hedu.ctxcol'), 'an');
  setCtxHidden(false); assert.equal(store.get('hedu.ctxcol'), 'hien');
});
t('chỉ nhận Ctrl+B ngoài ô nhập và trình soạn', () => {
  assert.equal(isCtxKey(k('b', { ctrlKey: true }), { tagName: 'DIV' }), true);
  assert.equal(isCtxKey(k('B', { ctrlKey: true }), null), true);
  assert.equal(isCtxKey(k('b'), { tagName: 'DIV' }), false);
  assert.equal(isCtxKey(k('b', { ctrlKey: true, shiftKey: true }), { tagName: 'DIV' }), false);
  assert.equal(isCtxKey(k('b', { ctrlKey: true }), { tagName: 'INPUT' }), false);
  assert.equal(isCtxKey(k('b', { ctrlKey: true }), { tagName: 'DIV', closest: (s: string) => (s === '.cm-editor' ? {} : null) }), false);
});
