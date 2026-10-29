import assert from 'node:assert/strict';
import { catOfType, examCounts, examTrail, examTree, filterByNode, nodeTrail, placementOf, CAT_LABEL } from './examtree';
import { buildDefault } from './taxonomy';
import type { ExamSummary } from './examlib';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const tax = buildDefault();
const g12 = tax.grades.find((g) => g.grade === 12)!;
const ch = g12.branches[0].chapters[0];
const ls = ch.lessons[1];
const mk = (id: string, o: { grade?: number; type?: string; ch?: string; ls?: string; folder?: string } = {}): ExamSummary => ({
  id, name: id, kind: 'multi', mainFile: 'main.tex', status: 'draft', createdAt: '', updatedAt: '', fileCount: 1, totalBytes: 1, warningCount: 0, skippedCount: 0,
  folder: o.folder ?? null, metadata: { grade: o.grade ?? null, schoolYear: null, examType: o.type ?? null, tags: [], chapterId: o.ch ?? null, lessonId: o.ls ?? null },
});

console.log('Cây Thư viện đề thi');
t('đọc loại đề gõ tay', () => {
  const cases: [string, string | null][] = [['Giữa kỳ 1', 'gk1'], ['giữa kì I', 'gk1'], ['GK2', 'gk2'], ['Giữa HK 2', 'gk2'], ['Cuối kỳ 1', 'ck1'], ['Học kỳ II', 'ck2'], ['HK1', 'ck1'], ['Thi thử TN THPT', 'thi-thu'], ['Kiểm tra 15 phút', 'kt-khac'], ['Luyện tập', 'on-tap'], ['Ôn tập theo chương', 'on-chuong'], ['Ôn tập theo bài', 'on-bai'], ['Giữa kỳ', null], ['', null], ['abc', null]];
  for (const [s, want] of cases) assert.equal(catOfType(s), want, s);
  for (const [k, v] of Object.entries(CAT_LABEL)) assert.equal(catOfType(v), k, `nhãn chuẩn ${v}`);
});
const L = [
  mk('gk1', { grade: 12, type: 'Giữa kỳ 1' }),
  mk('ck2', { grade: 12, type: 'Cuối kỳ 2', folder: 'Trường A/2026' }),
  mk('chuong', { grade: 12, type: 'Ôn tập theo chương', ch: ch.id }),
  mk('bai', { type: 'Ôn tập theo bài', ch: ch.id, ls: ls.id }), // không ghi lớp: suy từ chương
  mk('thithu', { grade: 12, type: 'Thi thử' }),
  mk('ontap', { grade: 11, type: 'Luyện tập' }),
  mk('la', { grade: 10, type: 'đề gì đó' }),
  mk('rong', {}),
  mk('lechlop', { grade: 11, ch: ch.id }), // chương lớp 12 mà ghi lớp 11 ⇒ không đặt vào bài học
];
const counts = examCounts(L, tax);
const ids = (k: string | null) => filterByNode(L, k, tax).map((e) => e.id).sort();
t('đề về đúng nút; nút cha đếm cả nút con', () => {
  assert.deepEqual(ids('g:12/kt/gk1'), ['gk1']);
  assert.deepEqual(ids('g:12/kt'), ['ck2', 'gk1']);
  assert.deepEqual(ids(`g:12/bai/c:${ch.id}`), ['bai', 'chuong']);
  assert.deepEqual(ids(`g:12/bai/c:${ch.id}/l:${ls.id}`), ['bai']);
  assert.deepEqual(ids('g:12/thithu'), ['thithu']);
  assert.deepEqual(ids('g:11/ontap'), ['ontap']);
  assert.deepEqual(ids('g:10/khac'), ['la']);
  assert.deepEqual(ids('g:11/khac'), ['lechlop']);
  assert.deepEqual(ids('none'), ['rong']);
  assert.deepEqual(ids('f:Trường A'), ['ck2']);
  assert.equal(counts.get('g:12'), 5);
  assert.equal(ids(null).length, L.length);
});
t('cây: nhóm cố định luôn có, chương/bài chỉ hiện khi có đề', () => {
  const tree = examTree(tax, counts, L);
  const t12 = tree.find((x) => x.key === 'g:12')!;
  assert.deepEqual(t12.children.map((x) => x.label), ['Ôn tập theo bài học', 'Đề kiểm tra', 'Đề ôn tập', 'Đề thi thử']);
  assert.deepEqual(t12.children[1].children.map((x) => [x.label, x.count]), [['Giữa kỳ 1', 1], ['Cuối kỳ 1', 0], ['Giữa kỳ 2', 0], ['Cuối kỳ 2', 1]]);
  assert.deepEqual(t12.children[0].children.map((x) => x.key), [`g:12/bai/c:${ch.id}`]);
  assert.equal(t12.children[0].children[0].children.length, 1);
  const t11 = tree.find((x) => x.key === 'g:11')!;
  assert.ok(!t11.children.some((x) => x.label === 'Đề thi thử'), 'thi thử chỉ cố định ở lớp 12');
  assert.ok(t11.children.some((x) => x.label === 'Chưa phân loại'));
  assert.deepEqual(tree.find((x) => x.key === 'f')!.children.map((x) => [x.label, x.children.map((y) => y.label)]), [['Trường A', ['2026']]]);
  assert.equal(tree.at(-1)!.key, 'none');
  const all = examTree(tax, counts, L, true).find((x) => x.key === 'g:12')!;
  assert.equal(all.children[0].children.length, g12.branches.flatMap((b) => b.chapters).length, 'hiện cả mục trống');
  assert.deepEqual(nodeTrail(tree, 'g:12/kt/gk1'), [g12.name, 'Đề kiểm tra', 'Giữa kỳ 1']);
});
t('tạo đề trong một nút: điền sẵn lớp, loại, chương, bài, thư mục', () => {
  assert.deepEqual(placementOf('g:12/kt/ck1'), { grade: 12, examType: 'Cuối kỳ 1', chapterId: null, lessonId: null, folder: null });
  assert.deepEqual(placementOf(`g:12/bai/c:${ch.id}/l:${ls.id}`), { grade: 12, examType: 'Ôn tập theo bài', chapterId: ch.id, lessonId: ls.id, folder: null });
  assert.deepEqual(placementOf(`g:12/bai/c:${ch.id}`)?.examType, 'Ôn tập theo chương');
  assert.deepEqual(placementOf('g:12/thithu')?.examType, 'Thi thử');
  assert.deepEqual(placementOf('f:Trường A/2026')?.folder, 'Trường A/2026');
  assert.equal(placementOf(null), null);
  assert.equal(placementOf('none'), null);
  // điền sẵn rồi đọc lại ⇒ về đúng nút
  for (const k of ['g:12/kt/ck1', 'g:12/kt/gk2', `g:12/bai/c:${ch.id}/l:${ls.id}`, `g:12/bai/c:${ch.id}`, 'g:12/thithu', 'g:12/ontap', 'g:11/kt/khac']) {
    const p = placementOf(k)!;
    const e = mk('x', { grade: p.grade ?? undefined, type: p.examType ?? undefined, ch: p.chapterId ?? undefined, ls: p.lessonId ?? undefined });
    assert.deepEqual(filterByNode([e], k, tax).length, 1, k);
  }
});
t('vị trí chữ của một đề', () => {
  assert.deepEqual(examTrail(L[0], tax), [g12.name, 'Đề kiểm tra', 'Giữa kỳ 1']);
  assert.deepEqual(examTrail(L[3], tax), [g12.name, 'Ôn tập theo bài học', ch.name, ls.name]);
  assert.deepEqual(examTrail(L[7], tax), []);
});
console.log('examtree: đạt hết.');
