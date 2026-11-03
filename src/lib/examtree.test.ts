import assert from 'node:assert/strict';
import { CAT_NONE, catOfType, examCounts, matchesCat, examTrail, examTree, filterByNode, movePatch, nodeTrail, placementOf, CAT_LABEL } from './examtree';
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
t('cây: mặc định chỉ hiện mục có đề; bật hiện mục trống thì có đủ nhóm cố định', () => {
  const tree = examTree(tax, counts, L);
  const t12 = tree.find((x) => x.key === 'g:12')!;
  assert.deepEqual(t12.children.map((x) => x.label), ['Ôn tập theo bài học', 'Đề kiểm tra', 'Đề thi thử']);
  assert.deepEqual(t12.children[1].children.map((x) => [x.label, x.count]), [['Giữa kỳ 1', 1], ['Cuối kỳ 2', 1]]);
  assert.deepEqual(t12.children[0].children.map((x) => x.key), [`g:12/bai/c:${ch.id}`]);
  assert.equal(t12.children[0].children[0].children.length, 1);
  const t11 = tree.find((x) => x.key === 'g:11');
  assert.ok(!t11 || t11.children.every((x) => x.count > 0), 'lớp không có đề: ẩn mục trống');
  assert.deepEqual(tree.find((x) => x.key === 'f')!.children.map((x) => [x.label, x.children.map((y) => y.label)]), [['Trường A', ['2026']]]);
  assert.equal(tree.at(-1)!.key, 'none');
  const all = examTree(tax, counts, L, true).find((x) => x.key === 'g:12')!;
  assert.equal(all.children[0].children.length, g12.branches.flatMap((b) => b.chapters).length, 'hiện cả mục trống');
  assert.deepEqual(all.children[1].children.map((x) => x.label), ['Giữa kỳ 1', 'Cuối kỳ 1', 'Giữa kỳ 2', 'Cuối kỳ 2', 'Kiểm tra khác'].filter((l) => l !== 'Kiểm tra khác' || all.children[1].children.some((x) => x.label === l)), 'đủ GK1–CK2 khi hiện mục trống');
  assert.ok(all.children.some((x) => x.label === 'Đề ôn tập'), 'nhóm Đề ôn tập có khi hiện mục trống');
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
t('kéo đề vào mục của cây: chỉ ghi phần đổi, đề đã ở đó thì bỏ qua', () => {
  const gk1 = L[0], ck2 = L[1];
  assert.deepEqual(movePatch(gk1, 'g:12/kt/ck1'), { grade: 12, examType: 'Cuối kỳ 1', chapterId: null, lessonId: null });
  assert.equal(movePatch(gk1, 'g:12/kt/gk1'), null, 'đã ở đó');
  assert.deepEqual(movePatch(gk1, 'g:11/kt/gk1'), { grade: 11, examType: 'Giữa kỳ 1', chapterId: null, lessonId: null }, 'đổi lớp');
  assert.equal(movePatch(gk1, 'g:12'), null, 'nút lớp: cùng lớp thì không đổi');
  assert.deepEqual(movePatch(gk1, 'g:11'), { grade: 11, chapterId: null, lessonId: null }, 'nút lớp khác: chỉ đổi lớp, xoá chương/bài cũ');
  assert.deepEqual(movePatch(gk1, 'f:Trường A'), { folder: 'Trường A' }, 'thư mục riêng chỉ đổi thư mục');
  assert.equal(movePatch(ck2, 'f:Trường A/2026'), null, 'đã trong thư mục');
  assert.deepEqual(movePatch(gk1, `g:12/bai/c:${ch.id}/l:${ls.id}`), { grade: 12, examType: 'Ôn tập theo bài', chapterId: ch.id, lessonId: ls.id });
  assert.deepEqual(movePatch(gk1, `g:12/bai/c:${ch.id}`), { grade: 12, examType: 'Ôn tập theo chương', chapterId: ch.id, lessonId: null });
  for (const k of ['f', 'none', null]) assert.equal(movePatch(gk1, k), null, `nút không nhận đề: ${k}`);
});
console.log('Loại đề và thư mục trống');
t('lọc theo loại đề', () => {
  const ids2 = (c: Parameters<typeof matchesCat>[1]) => L.filter((e) => matchesCat(e, c)).map((e) => e.id).sort();
  assert.equal(ids2(null).length, L.length);
  assert.deepEqual(ids2('gk1'), ['gk1']);
  assert.deepEqual(ids2('thi-thu'), ['thithu']);
  assert.deepEqual(ids2(CAT_NONE), ['la', 'lechlop', 'rong']);
});
t('thư mục trống hiện trong cây (kể cả khi chưa có đề nào)', () => {
  const root = (extra: string[], list: ExamSummary[]) => examTree(tax, examCounts(list, tax), list, false, extra).find((n) => n.key === 'f');
  assert.equal(root([], [mk('x', { grade: 12 })]), undefined);
  const r = root(['Mới/Con'], [mk('x', { grade: 12 })])!;
  assert.deepEqual(r.children.map((c) => [c.key, c.count]), [['f:Mới', 0]]);
  assert.deepEqual(r.children[0].children.map((c) => c.key), ['f:Mới/Con']);
});
console.log('examtree: đạt hết.');
