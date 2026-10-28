// Cây mục lục kiểu thư mục của màn Ngân hàng: số đếm theo mục, ẩn mục 0 câu, tìm thư mục không dấu, chọn mục.
import { computeFacets, emptyFilters, facetCtx, type BankFilters } from './bankfilter';
import { fullTree, nodeKey, pathKeys, pickPath, selectedKey, visibleTree, type TreeNode } from './banktree';
import { buildDefault } from './taxonomy';
import type { Question } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const tax = buildDefault();
const g = tax.grades.find((x) => x.grade === 12) ?? tax.grades[0];
const br = g.branches.find((b) => b.chapters.length)!;
const ch = br.chapters[0], ls = ch.lessons[0], fm = ls.forms[0];
const ch2 = br.chapters[1] ?? ch;
let n = 0;
const q = (o: Partial<Question>): Question => { n++; return { uid: `u${n}`, seq: n, latex: `\\begin{ex} Câu ${n}. \\end{ex}`, type: 'tn', level: 'NB', tags: [], createdAt: n, updatedAt: n, grade: g.grade, chapterId: ch.id, lessonId: ls.id, formId: fm.id, review: 'approved', ...o }; };
const qs = [q({}), q({}), q({ level: 'TH' }), q({ chapterId: ch2.id, lessonId: ch2.lessons[0]?.id ?? '', formId: '' })];
const F = (p: Partial<BankFilters> = {}): BankFilters => ({ ...emptyFilters(), ...p });
const ctx = () => facetCtx(tax, () => true, false);

console.log('Số đếm mọi mục, không phụ thuộc mục đang chọn');
{
  const r = computeFacets(qs, F({ gradeId: g.id, chapterId: ch.id, lessonId: ls.id, formId: fm.id }), ctx());
  ok(r.node.get(nodeKey('grade', g.id)) === 4 && r.node.get(nodeKey('form', fm.id)) === 3, 'đếm lớp và dạng');
  if (ch2 !== ch) ok(r.node.get(nodeKey('chapter', ch2.id)) === 1, 'chương KHÁC mục đang chọn vẫn có số đếm (cây cần)');
  const r2 = computeFacets(qs, F({ levels: new Set(['TH']) }), ctx());
  ok(r2.node.get(nodeKey('form', fm.id)) === 1, 'số đếm theo bộ lọc thuộc tính (mức độ)');
}

console.log('Cây hiển thị: ẩn mục 0 câu, tìm không dấu');
{
  const r = computeFacets(qs, F(), ctx());
  const tree = fullTree(tax, r.node);
  const flat = (ns: readonly TreeNode[]): TreeNode[] => ns.flatMap((x) => [x, ...flat(x.children)]);
  const all = flat(tree);
  ok(all.some((x) => x.kind === 'form' && x.key === nodeKey('form', fm.id) && x.count === 3), 'cây đủ tới cấp Dạng, có số câu');
  const shown = flat(visibleTree(tree, { query: '', showEmpty: false, selected: null, selectedPath: new Set() }));
  ok(shown.every((x) => x.count > 0), 'mặc định ẩn mục chưa có câu');
  ok(flat(visibleTree(tree, { query: '', showEmpty: true, selected: null, selectedPath: new Set() })).length === all.length, 'bật "hiện cả mục chưa có câu" thì hiện đủ');
  const emptyForm = all.find((x) => x.kind === 'form' && x.count === 0);
  if (emptyForm) {
    const keep = flat(visibleTree(tree, { query: '', showEmpty: false, selected: emptyForm.key, selectedPath: pathKeys(emptyForm.path) }));
    ok(keep.some((x) => x.key === emptyForm.key), 'mục đang chọn không bị ẩn dù 0 câu');
  }
  const word = fm.name.split(/\s+/).filter((w) => w.length > 3).pop() ?? fm.name;
  const noAccent = word.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
  const hit = flat(visibleTree(tree, { query: noAccent, showEmpty: false, selected: null, selectedPath: new Set() }));
  ok(hit.some((x) => x.key === nodeKey('form', fm.id)) && hit.some((x) => x.key === nodeKey('chapter', ch.id)), 'tìm không dấu ra Dạng kèm các mục cha');
  ok(visibleTree(tree, { query: 'khongcomucnaonhuthe', showEmpty: true, selected: null, selectedPath: new Set() }).length === 0, 'không khớp thì rỗng');
}

console.log('Chọn mục');
{
  const node = fullTree(tax, new Map()).flatMap(function f(x: TreeNode): TreeNode[] { return [x, ...x.children.flatMap(f)]; }).find((x) => x.key === nodeKey('form', fm.id))!;
  const f = pickPath(F({ levels: new Set(['VD']), tag: 'x' }), node.path);
  ok(f.formId === fm.id && f.lessonId === ls.id && f.chapterId === ch.id && f.gradeId === g.id, 'chọn Dạng điền đủ đường dẫn');
  ok(f.levels.has('VD') && f.tag === 'x', 'giữ nguyên bộ lọc thuộc tính');
  ok(selectedKey(f) === nodeKey('form', fm.id) && selectedKey(F()) === null, 'mục đang chọn = mục sâu nhất; trống = Tất cả');
  const r = computeFacets(qs, pickPath(F(), node.path), ctx());
  ok(r.list.length === 3, 'danh sách đúng theo mục đã chọn');
}

if (fail) process.exit(1);
console.log('banktree: đạt hết.');
