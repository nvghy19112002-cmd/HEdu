import { ALL_SCOPE, inScope, isAll, scopeLabel, scopeOptions, scopeUids, setLevel, type Scope } from './dupscope';
import { buildDefault, indexOf } from './taxonomy';
import { DupIndex } from './dupindex';
import type { Question } from './types';

let failed = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) failed++; };

const tax = buildDefault();
const ix = indexOf(tax);
// lấy vài vị trí thật từ cây mặc định
const g10 = tax.grades.find((g) => g.grade === 10)!, g11 = tax.grades.find((g) => g.grade === 11)!;
const ch10 = g10.branches[0].chapters[0], ch10b = g10.branches[0].chapters[1] ?? ch10, ch11 = g11.branches[0].chapters[0];
const les10 = ch10.lessons[0], form10 = les10.forms[0];
const mk = (uid: string, grade: number, chapterId: string, lessonId: string, formId: string, latex = `\\begin{ex}\nCâu ${uid}\n\\shortans{1}\n\\end{ex}`): Question =>
  ({ uid, seq: 1, latex, type: 'tln', level: 'NB', tags: [], createdAt: 1, updatedAt: 1, grade, chapterId, lessonId, formId } as Question);
const qs: Question[] = [
  mk('a', 10, ch10.id, les10.id, form10.id), mk('b', 10, ch10.id, les10.id, form10.id), mk('c', 10, ch10b.id, ch10b.lessons[0]?.id ?? '', ''),
  mk('d', 11, ch11.id, ch11.lessons[0]?.id ?? '', ''), mk('e', 12, g11.branches[0].chapters[0].id, '', ''),
];

console.log('Phạm vi: lọc theo khối / chương / bài / dạng');
ok(isAll(ALL_SCOPE) && scopeUids(qs, ALL_SCOPE, tax).size === 5, 'toàn ngân hàng = mọi câu');
ok([...scopeUids(qs, { ...ALL_SCOPE, grades: [10] }, tax)].sort().join() === 'a,b,c', 'khối 10');
ok([...scopeUids(qs, { ...ALL_SCOPE, grades: [10, 11] }, tax)].sort().join() === 'a,b,c,d', 'nhiều khối (10 và 11)');
ok([...scopeUids(qs, { ...ALL_SCOPE, chapterId: ch10.id }, tax)].sort().join() === 'a,b', 'một chương');
ok([...scopeUids(qs, { ...ALL_SCOPE, lessonId: les10.id }, tax)].sort().join() === 'a,b', 'một bài');
ok([...scopeUids(qs, { ...ALL_SCOPE, formId: form10.id }, tax)].sort().join() === 'a,b', 'một dạng');
ok([...scopeUids(qs, { ...ALL_SCOPE, branch: g10.branches[0].code, grades: [10] }, tax)].sort().join() === 'a,b,c', 'phân môn (theo mã) trong khối 10');
ok([...scopeUids(qs, { ...ALL_SCOPE, selection: true }, tax, new Set(['b', 'd']))].sort().join() === 'b,d', 'các câu đang chọn trong Ngân hàng');
ok(inScope(qs[0], ALL_SCOPE, ix), 'inScope khớp scopeUids');

console.log('Thác: đổi cấp cha đặt lại cấp con, đếm số câu');
{
  let s: Scope = setLevel(ALL_SCOPE, 'grade', [10]);
  s = setLevel(s, 'chapter', ch10.id); s = setLevel(s, 'lesson', les10.id);
  ok(s.chapterId === ch10.id && s.lessonId === les10.id, 'chọn chương rồi bài');
  const s2 = setLevel(s, 'grade', [11]);
  ok(!s2.chapterId && !s2.lessonId && !s2.formId && !s2.branch, 'đổi khối ⇒ chương/bài/dạng bị đặt lại');
  const o = scopeOptions(tax, qs, setLevel(ALL_SCOPE, 'grade', [10]));
  ok(o.grades.find((x) => x.value === '10')?.count === 3 && o.grades.find((x) => x.value === '11')?.count === 1, 'đếm số câu theo khối');
  ok(o.chapters.every((c) => !c.label.startsWith('K')) && o.chapters.length === g10.branches.flatMap((b) => b.chapters).length, 'chỉ hiện chương của khối đã chọn');
  const o2 = scopeOptions(tax, qs, { ...ALL_SCOPE, chapterId: ch10.id });
  ok(o2.lessons.length === ch10.lessons.length && o2.forms.length === 0, 'bài của chương; chưa chọn bài thì chưa có dạng');
  ok(scopeLabel(tax, { ...ALL_SCOPE, grades: [10], chapterId: ch10.id }).startsWith('Khối 10 › '), 'nhãn phạm vi dễ đọc');
}

console.log('Quét theo phạm vi: trong phạm vi / đối chiếu toàn kho');
(async () => {
  const E = (s: string, ans = '1') => `\\begin{ex}\n${s}\n\\shortans{${ans}}\n\\end{ex}`;
  const same = 'Cho hàm số $y=x^2+3x+5$. Tính $y(2)$ trong trường hợp đặc biệt này.';
  const list = [
    { uid: 'in1', latex: E(same) }, { uid: 'in2', latex: E(same) },      // cả hai trong phạm vi
    { uid: 'in3', latex: E('Tìm giá trị lớn nhất của $y=-x^2+4x$ trên $[0;3]$ sau khi lập bảng.') },
    { uid: 'out3', latex: E('Tìm giá trị lớn nhất của $y=-x^2+4x$ trên $[0;3]$ sau khi lập bảng.') }, // trùng với in3, nhưng nằm ngoài
    { uid: 'out1', latex: E('Giải phương trình $\\sqrt{x+1}=x-1$ và kết luận số nghiệm thực.') },
  ];
  const scope = new Set(['in1', 'in2', 'in3']);
  const pairKeys = (r: { pairs: { a: string; b: string }[] }) => r.pairs.map((p) => [p.a, p.b].sort().join('+')).sort();
  const inside = await new DupIndex().scan(list, { scope, vsAll: false });
  ok(pairKeys(inside).join() === 'in1+in2', 'trong phạm vi: chỉ cặp cả hai thuộc phạm vi (in1+in2), không lấy in3+out3');
  const vs = await new DupIndex().scan(list, { scope, vsAll: true });
  ok(pairKeys(vs).join() === 'in1+in2,in3+out3', 'đối chiếu toàn kho: thêm cặp phạm vi↔ngoài (in3+out3), cặp trong phạm vi chỉ đếm 1 lần');
  ok(vs.stats.sideA === 3 && vs.stats.sideB === 5 && inside.stats.sideA === 3 && inside.stats.sideB === 3, 'số câu mỗi phía: toàn kho 3/5, trong phạm vi 3/3');
  const all = await new DupIndex().scan(list, {});
  ok(pairKeys(all).join() === 'in1+in2,in3+out3', 'không giới hạn phạm vi = toàn kho');
  // cặp có phía ngoài phạm vi nằm TRƯỚC trong danh sách vẫn được tìm một lần
  const rev = [...list].reverse();
  ok(pairKeys(await new DupIndex().scan(rev, { scope, vsAll: true })).join() === 'in1+in2,in3+out3', 'thứ tự danh sách đảo ngược cho cùng kết quả');
  if (failed) { console.log(`\n${failed} kiểm thử dupscope lỗi`); process.exit(1); }
  console.log('dupscope: đạt hết.');
})();
