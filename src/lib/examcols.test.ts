import assert from 'node:assert/strict';
import { clickCol, COL_ORDER, DEFAULT_COL_SORT, gridTemplate, hiddenClass, parseColVis, serializeColVis, shownCols, fileKind, fileRows, inSmart, isRecent, isStar, parseColSort, sortByCol, STAR, withStar } from './examcols';
import type { ExamSummary } from './examlib';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const mk = (id: string, o: Partial<ExamSummary> & { grade?: number; type?: string; year?: string; tags?: string[] } = {}): ExamSummary => ({
  id, name: o.name ?? id, kind: 'multi', mainFile: 'main.tex', status: o.status ?? 'draft', createdAt: '', updatedAt: o.updatedAt ?? '2026-11-01T00:00:00Z', fileCount: o.fileCount ?? 1, totalBytes: o.totalBytes ?? 1,
  warningCount: 0, skippedCount: 0, folder: null, metadata: { grade: o.grade ?? null, schoolYear: o.year ?? null, examType: o.type ?? null, tags: o.tags ?? [] },
});

console.log('Thư viện đề kiểu Finder: cột, sắp xếp, thư mục thông minh');
t('bấm cột: cột mới theo hướng mặc định, cột đang sắp xếp thì đảo chiều', () => {
  assert.deepEqual(clickCol(DEFAULT_COL_SORT, 'name'), { key: 'name', dir: 1 });
  assert.deepEqual(clickCol({ key: 'name', dir: 1 }, 'name'), { key: 'name', dir: -1 });
  assert.deepEqual(clickCol({ key: 'name', dir: -1 }, 'size'), { key: 'size', dir: -1 });
});
t('đọc cấu hình cột đã lưu: hỏng ⇒ mặc định', () => {
  assert.deepEqual(parseColSort('{"key":"size","dir":1}'), { key: 'size', dir: 1 });
  assert.deepEqual(parseColSort('{"key":"la","dir":1}'), DEFAULT_COL_SORT);
  assert.deepEqual(parseColSort('hong'), DEFAULT_COL_SORT);
  assert.deepEqual(parseColSort(null), DEFAULT_COL_SORT);
});
t('sắp xếp theo cột, cùng giá trị thì theo tên', () => {
  const L = [mk('b', { name: 'Đề B', grade: 12, totalBytes: 5 }), mk('a', { name: 'Đề A', grade: 10, totalBytes: 9 }), mk('c', { name: 'Đề C', grade: 10, totalBytes: 9 }), mk('d', { name: 'Đề D', grade: undefined, totalBytes: 1 })];
  const ids = (x: ExamSummary[]) => x.map((e) => e.id).join('');
  assert.equal(ids(sortByCol(L, { key: 'name', dir: 1 }, new Map())), 'abcd');
  assert.equal(ids(sortByCol(L, { key: 'name', dir: -1 }, new Map())), 'dcba');
  assert.equal(ids(sortByCol(L, { key: 'grade', dir: 1 }, new Map())), 'acbd', 'lớp 10, 10 (theo tên), 12, chưa xếp lớp cuối');
  assert.equal(ids(sortByCol(L, { key: 'size', dir: -1 }, new Map())), 'acbd');
  assert.equal(ids(sortByCol(L, { key: 'count', dir: -1 }, new Map([['b', 20], ['a', 5]]))), 'bacd', 'có số câu trước, chưa biết số câu cuối');
  assert.equal(ids(sortByCol([mk('x', { status: 'finalized' }), mk('y', { status: 'draft' }), mk('z', { status: 'needs_review' })], { key: 'status', dir: 1 }, new Map())), 'yzx');
  assert.equal(ids(sortByCol([mk('o', { updatedAt: '2026-10-01T00:00:00Z' }), mk('n', { updatedAt: '2026-11-02T00:00:00Z' })], { key: 'updated', dir: -1 }, new Map())), 'no');
});
t('không sửa danh sách gốc', () => {
  const L = [mk('b'), mk('a')];
  sortByCol(L, { key: 'name', dir: 1 }, new Map());
  assert.equal(L[0].id, 'b');
});
t('gắn sao dùng nhãn ★ trong tags', () => {
  assert.ok(isStar(mk('a', { tags: ['x', STAR] })) && !isStar(mk('b', { tags: ['x'] })));
  assert.deepEqual(withStar(['x'], true), ['x', STAR]);
  assert.deepEqual(withStar(['x', STAR], true), ['x', STAR], 'không thêm hai lần');
  assert.deepEqual(withStar(['x', STAR, 'y'], false), ['x', 'y']);
});
t('thư mục thông minh: Gần đây (14 ngày), Gắn sao, Cần rà soát', () => {
  const now = Date.parse('2026-11-03T00:00:00Z');
  assert.ok(isRecent(mk('a', { updatedAt: '2026-10-25T00:00:00Z' }), now));
  assert.ok(!isRecent(mk('a', { updatedAt: '2026-10-10T00:00:00Z' }), now));
  assert.ok(!isRecent(mk('a', { updatedAt: 'khong-doc-duoc' }), now));
  assert.ok(inSmart(mk('a', { tags: [STAR] }), 'star', now) && !inSmart(mk('a'), 'star', now));
  assert.ok(inSmart(mk('a', { status: 'needs_review' }), 'review', now) && !inSmart(mk('a', { status: 'finalized' }), 'review', now));
});
t('loại tệp và cây tệp của một đề: .tex trước, rồi PDF, gói, ảnh', () => {
  assert.deepEqual(['a.tex', 'b.PDF', 'c.png', 'd.sty', 'e.zip', 'f'].map(fileKind), ['tex', 'pdf', 'img', 'pkg', 'other', 'other']);
  const r = fileRows([{ rel: 'Picture/h1.png', bytes: 3 }, { rel: 'main.tex', bytes: 10 }, { rel: 'de.pdf', bytes: 5 }, { rel: 'hedu.sty', bytes: 2 }], 3);
  assert.deepEqual(r.rows.map((x) => x.rel), ['main.tex', 'de.pdf', 'hedu.sty']);
  assert.equal(r.hidden, 1);
  assert.deepEqual([r.rows[0].dir, r.rows[0].name], ['', 'main.tex']);
  const f = fileRows([{ rel: 'Picture/h1.png', bytes: 3 }]);
  assert.deepEqual([f.rows[0].dir, f.rows[0].name], ['Picture', 'h1.png']);
});
console.log('Cột hiện / ẩn');
t('mặc định hiện đủ; Tên luôn hiện; giá trị hỏng hoặc lạ thì về mặc định / bỏ qua', () => {
  assert.equal(parseColVis(null).size, COL_ORDER.length);
  assert.equal(parseColVis('{hong').size, COL_ORDER.length);
  assert.deepEqual([...parseColVis('["size","khong-co",5]')].sort(), ['name', 'size']);
  assert.ok(parseColVis('[]').has('name'));
});
t('lưu rồi đọc lại đúng, theo thứ tự chuẩn', () => {
  const v = parseColVis('["updated","type"]');
  assert.equal(serializeColVis(v), '["name","type","updated"]');
  assert.deepEqual([...parseColVis(serializeColVis(v))].sort(), [...v].sort());
});
t('cửa sổ hẹp tự ẩn cột phụ dù đang bật; lưới và lớp ẩn khớp số cột', () => {
  const all = parseColVis(null);
  const wide = shownCols(all, false), narrow = shownCols(all, true);
  assert.equal(wide.length, 9); assert.deepEqual(narrow, ['name', 'type', 'grade', 'status', 'updated']);
  assert.equal(gridTemplate(['name', 'type']), 'minmax(240px, 3.2fr) 108px');
  assert.equal(hiddenClass(narrow), 'hc-year hc-count hc-files hc-size');
  assert.equal(hiddenClass(wide), '');
});
console.log('examcols: đạt hết.');
