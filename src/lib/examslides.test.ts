import assert from 'node:assert/strict';
import { itemsFromSpec, itemsFromTex } from './examslides';
import type { Question } from './types';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const Q = (uid: string, latex: string): Question => ({ uid, seq: 1, type: 'tn', level: 'NB', formId: '', chapterId: '', lessonId: '', grade: 12, latex, tags: [], createdAt: 0, updatedAt: 0 });
const bank = [Q('a', 'câu A'), Q('b', 'câu B'), Q('c', 'câu C')];
const spec = (p1: string[], p2: string[] = []) => JSON.stringify({ v: 1, matran: [], maDe: [{ ma: '101', phan: { p1: p1.map((uid) => ({ uid, dapAn: 'A' })), p2: p2.map((uid) => ({ uid, dapAn: 'ĐĐSS' })), p3: [], p4: [] } }] });

console.log('Trình chiếu từ Thư viện đề');
t('đề tạo từ ngân hàng: câu mã đầu theo thứ tự phần', () => {
  assert.deepEqual(itemsFromSpec(spec(['c', 'a'], ['b']), bank)?.map((x) => x.uid), ['c', 'a', 'b']);
  assert.equal(itemsFromSpec(spec(['a', 'mat']), bank), null, 'thiếu câu ⇒ không đoán');
  assert.equal(itemsFromSpec(null, bank), null);
  assert.equal(itemsFromSpec('rác', bank), null);
});
t('đề soạn tay: khối ex hoàn chỉnh trong các tệp, bỏ trùng', () => {
  const a = '\\begin{ex}Một\\end{ex}';
  const files = [{ rel: 'main.tex', text: `\\documentclass{article}\n${a}\n\\begin{ex}Hai\\end{ex}` }, { rel: 'phan2.tex', text: `${a}\n\\begin{ex}Ba thiếu kết` }];
  assert.deepEqual(itemsFromTex(files).map((x) => x.latex), [a, '\\begin{ex}Hai\\end{ex}']);
});
