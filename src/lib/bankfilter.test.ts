import { attrChips, attrCount, attrGroups, clearAttrs, computeFacets, dropAttr, emptyFilters, emptyKind, facetCtx, NOID_UNKNOWN, pickBranch, pickChapter, pickForm, pickGrade, pickLesson, pickNoId, sanitize, type BankFilters } from './bankfilter';
import { pickPath } from './banktree';
import { buildDefault } from './taxonomy';
import { LEVELS, TYPES, type Grade, type Level, type QType, type Question } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const tax = buildDefault();
const g12 = tax.grades.find((g) => g.grade === 12)!;
const g11 = tax.grades.find((g) => g.grade === 11)!;
const br = g12.branches;
const ch1 = br[0].chapters[0], ch2 = br[0].chapters[1];
const ls1 = ch1.lessons[0], ls2 = ch1.lessons[1];
const fm1 = ls1.forms[0];
const hBranch = br[1];
const hCh = hBranch.chapters[0];
const TK = '\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}';
let n = 0;
const mk = (p: Partial<Question> & { fig?: boolean }): Question => ({
  uid: 'u' + n, seq: ++n, latex: `\\begin{ex}\nCâu ${n} ${p.fig ? TK : ''}\n\\end{ex}`, type: 'tn', level: 'NB', tags: [],
  createdAt: n, updatedAt: n, grade: 12, chapterId: ch1.id, lessonId: ls1.id, formId: fm1?.id ?? '', ...p,
} as Question);
const qs: Question[] = [
  mk({ level: 'TH', fig: true }), mk({ level: 'TH' }), mk({ level: 'VD', fig: true }), mk({ level: 'VD' }), mk({ level: 'NB' }),
  mk({ lessonId: ls2.id, formId: '', level: 'TH', fig: true }),
  mk({ chapterId: ch2.id, lessonId: ch2.lessons[0]?.id ?? '', formId: '', level: 'VD' }),
  mk({ chapterId: hCh.id, lessonId: hCh.lessons[0]?.id ?? '', formId: '', level: 'TH', type: 'ds', fig: true }),
  mk({ grade: 11, chapterId: '', lessonId: '', formId: '', level: 'NB' }),
  mk({ review: 'approved', level: 'TH' }),
];
const ctx = (wide = false, textOk: (u: string) => boolean = () => true) => facetCtx(tax, textOk, wide);
const F = (p: Partial<BankFilters> = {}): BankFilters => ({ ...emptyFilters(), ...p });

console.log('Cascade vị trí');
const base = F({ gradeId: g12.id, branchId: br[0].id, chapterId: ch1.id, lessonId: ls1.id, formId: fm1?.id ?? null, levels: new Set<Level>(['TH']), review: 'approved' });
const g = pickGrade(base, g11.id);
ok(g.gradeId === g11.id && !g.branchId && !g.chapterId && !g.lessonId && !g.formId, 'đổi Lớp xoá Phân môn/Chương/Bài/Dạng');
ok(g.levels.has('TH') && g.review === 'approved', 'đổi Lớp giữ các thuộc tính');
const b = pickBranch(base, br[1].id);
ok(b.branchId === br[1].id && !b.chapterId && !b.lessonId && !b.formId && b.gradeId === g12.id, 'đổi Phân môn xoá Chương/Bài/Dạng, giữ Lớp');
const c = pickChapter(tax, base, ch2.id);
ok(c.chapterId === ch2.id && !c.lessonId && !c.formId && c.branchId === br[0].id, 'đổi Chương xoá Bài/Dạng');
const c2 = pickChapter(tax, F({ gradeId: g12.id }), hCh.id);
ok(c2.branchId === hBranch.id, 'chọn Chương khi chưa chọn Phân môn ⇒ tự điền Phân môn đúng');
const l = pickLesson(base, ls2.id);
ok(l.lessonId === ls2.id && !l.formId && l.chapterId === ch1.id, 'đổi Bài xoá Dạng');
ok(pickForm(base, null).formId === null && pickForm(base, null).lessonId === ls1.id, 'bỏ Dạng giữ Bài');

console.log('Xoá bộ lọc / đặt lại');
const k = clearAttrs(base);
ok(attrCount(base) === 2 && attrCount(k) === 0, 'đếm bộ lọc thuộc tính (Mức độ 1 + Kiểm duyệt 1)');
ok(k.gradeId === g12.id && k.chapterId === ch1.id && k.lessonId === ls1.id && k.formId === base.formId, '"Xoá bộ lọc" không đụng vị trí (kể cả Dạng)');

console.log('Lọc');
let r = computeFacets(qs, F({ gradeId: g12.id }), ctx());
ok(r.list.length === 9, `Lớp 12 có 9 câu (được ${r.list.length})`);
r = computeFacets(qs, F({ gradeId: g12.id, branchId: hBranch.id }), ctx());
ok(r.list.length === 1, 'Phân môn Hình học chỉ lấy câu thuộc chương của phân môn đó');
r = computeFacets(qs, F({ gradeId: g12.id, chapterId: ch1.id, lessonId: ls1.id }), ctx());
ok(r.list.length === 6, `Bài 1 của chương 1: 6 câu (được ${r.list.length})`);
r = computeFacets(qs, F({ gradeId: g12.id, figure: 'yes' }), ctx());
ok(r.list.length === 4 && r.list.every((x) => x.latex.includes('tikzpicture')), 'Có hình: 4 câu');
r = computeFacets(qs, F({ gradeId: g12.id, figure: 'no' }), ctx());
ok(r.list.length === 5, 'Không hình: 5 câu');
r = computeFacets(qs, F({ gradeId: g12.id, review: 'approved' }), ctx());
ok(r.list.length === 1, 'Kiểm duyệt: Đã duyệt = 1 câu');

console.log('Đếm theo chiều (bỏ chính chiều đó)');
r = computeFacets(qs, F({ gradeId: g12.id, levels: new Set<Level>(['TH']) }), ctx());
ok(r.level.get('TH') === 5 && r.level.get('VD') === 3 && r.level.get('NB') === 1, `chọn Thông hiểu: Vận dụng vẫn đếm 3, không bị về 0 (TH ${r.level.get('TH')}, VD ${r.level.get('VD')}, NB ${r.level.get('NB')})`);
ok(r.list.length === 5, 'danh sách chỉ còn Thông hiểu (5)');
r = computeFacets(qs, F({ gradeId: g12.id, levels: new Set<Level>(['TH']), types: new Set<QType>(['ds']) }), ctx());
ok(r.level.get('TH') === 1 && r.level.get('VD') === undefined, 'đếm Mức độ vẫn áp Loại câu đang chọn');
ok(r.type.get('ds') === 1 && r.type.get('tn') === 4, 'đếm Loại áp Mức độ đang chọn, bỏ Loại');
r = computeFacets(qs, F({ gradeId: g12.id, figure: 'yes' }), ctx());
ok(r.figure.yes === 4 && r.figure.no === 5, 'đếm Hình: Có 4 / Không 5 khi đang chọn Có hình');
r = computeFacets(qs, F({ gradeId: g12.id, chapterId: ch1.id, levels: new Set<Level>(['VD']) }), ctx());
ok(r.chapter.get(ch1.id) === 2 && r.chapter.get(ch2.id) === 1, 'số ở Chương theo bộ lọc thuộc tính và không bị Chương đang chọn ràng buộc');
ok(r.scoped === 7, `mẫu số "N / M" = câu trong chương 1, chưa lọc thuộc tính (được ${r.scoped})`);
r = computeFacets(qs, F({ gradeId: g12.id }), ctx());
ok(r.grade.get(g11.id) === 1 && r.grade.get(g12.id) === 9 && r.gradeAll === 10, 'số ở Lớp: bỏ chính Lớp (Lớp 11 vẫn đếm 1, Tất cả 10)');
r = computeFacets(qs, F({ gradeId: g12.id, branchId: br[0].id }), ctx());
ok(r.branch.get(hBranch.id) === 1 && r.branch.get(br[0].id) === 8, 'số ở Phân môn: bỏ chính Phân môn');

console.log('Toàn kho khi tìm');
const only = new Set([qs[0].uid, qs[8].uid]);
r = computeFacets(qs, F({ gradeId: g12.id, chapterId: ch2.id }), ctx(true, (u) => only.has(u)));
ok(r.list.length === 2, 'wide: bỏ qua vị trí, vẫn áp ô tìm');
r = computeFacets(qs, F({ gradeId: g12.id, chapterId: ch2.id }), ctx(false, (u) => only.has(u)));
ok(r.list.length === 0, 'không wide: vẫn trong vị trí');

console.log('Gỡ giá trị không còn hợp lệ');
ok(sanitize(tax, F({ gradeId: 'khong-co-lop', chapterId: 'x' })).gradeId === null, 'lớp không còn ⇒ về Tất cả');
const s = sanitize(tax, F({ gradeId: g12.id, branchId: br[0].id, chapterId: 'khong-co', lessonId: 'a', formId: 'b' }));
ok(s.gradeId === g12.id && s.branchId === br[0].id && !s.chapterId && !s.lessonId && !s.formId, 'chương không còn ⇒ xoá từ chương trở xuống, giữ Lớp/Phân môn');
const good = F({ gradeId: g12.id, branchId: br[0].id, chapterId: ch1.id, lessonId: ls1.id });
ok(sanitize(tax, good) === good, 'giá trị hợp lệ giữ nguyên (cùng đối tượng, không vẽ lại thừa)');


console.log('Lọc Lớp theo id trong cây (không theo số lớp)');
const mkG = (id: string, code: string, name: string, chId: string): Grade => ({ id, code, name, grade: 0, branches: [{ id: id + 'b', code: 'D', name: 'Đại số', chapters: [{ id: chId, code: '1', name: 'Chương', lessons: [] }] }] } as unknown as Grade);
const taxL = { ...tax, grades: [...tax.grades, mkG('gA', 'A', 'Đại học 1', 'cA'), mkG('gB', 'B', 'Đại học 2', 'cB')] };
const letterQs: Question[] = [mk({ grade: 0, chapterId: 'cA', lessonId: '', formId: '' }), mk({ grade: 0, chapterId: 'cA', lessonId: '', formId: '' }), mk({ grade: 0, chapterId: 'cB', lessonId: '', formId: '' })];
const lctx = facetCtx(taxL, () => true, false);
let lr = computeFacets(letterQs, F({ gradeId: 'gB' }), lctx);
ok(lr.list.length === 1, `hai lớp mã chữ cùng số 0 không lẫn: "Đại học 2" = 1 câu (được ${lr.list.length})`);
ok(lr.grade.get('gA') === 2 && lr.grade.get('gB') === 1, 'số đếm Lớp tách đúng từng lớp');
const noCh = mk({ grade: 11, chapterId: '', lessonId: '', formId: '' });
lr = computeFacets([noCh], F({ gradeId: g11.id }), facetCtx(taxL, () => true, false));
ok(lr.list.length === 1, 'câu chưa gán chương: dự phòng theo số lớp khi số đó duy nhất');
const noChZero = mk({ grade: 0, chapterId: '', lessonId: '', formId: '' });
lr = computeFacets([noChZero], F({ gradeId: 'gA' }), lctx);
ok(lr.list.length === 0 && computeFacets([noChZero], F(), lctx).list.length === 1, 'câu chưa gán chương và số lớp trùng: không đoán bừa, vẫn thấy ở "Tất cả"');

console.log('Chọn đủ mọi giá trị = Tất cả');
const allLv = F({ gradeId: g12.id, levels: new Set<Level>(LEVELS) });
ok(attrCount(allLv) === 0 && attrGroups(allLv) === 0, 'chọn đủ 4 mức độ: không tính là bộ lọc, không có huy hiệu');
ok(computeFacets(qs, allLv, ctx()).list.length === computeFacets(qs, F({ gradeId: g12.id }), ctx()).list.length, 'chọn đủ mức độ cho cùng kết quả như không lọc');
const allTy = F({ gradeId: g12.id, types: new Set<QType>(TYPES) });
ok(attrCount(allTy) === 0 && computeFacets(qs, allTy, ctx()).list.length === 9, 'chọn đủ loại câu: không lọc');
const part = F({ gradeId: g12.id, levels: new Set<Level>(['TH', 'VD', 'NB']) });
ok(attrCount(part) === 3 && attrGroups(part) === 1, 'chọn 3/4 vẫn là bộ lọc (3 giá trị, 1 nhóm)');
ok(attrChips(allLv, computeFacets(qs, allLv, ctx())).length === 0, 'chọn đủ: không có chip điều kiện');
ok(computeFacets(qs, part, ctx()).list.length === 9 - 0 && computeFacets(qs, F({ gradeId: g12.id, levels: new Set<Level>(['TH']) }), ctx()).list.length === 5, 'lọc nhiều giá trị vẫn đúng');

console.log('Trạng thái rỗng');
const E = (f: BankFilters, text = (u: string) => true, o: { hasText?: boolean; wide?: boolean; total?: number } = {}) =>
  emptyKind(computeFacets(qs, f, ctx(!!o.wide, text)), f, { totalQuestions: o.total ?? qs.length, hasText: !!o.hasText, wide: !!o.wide });
ok(E(F({ gradeId: g12.id })) === null, 'có câu: không rỗng');
ok(E(F(), () => true, { total: 0 }) === 'bank' || emptyKind(computeFacets([], F(), ctx()), F(), { totalQuestions: 0, hasText: false, wide: false }) === 'bank', 'kho trống (D)');
const emptyCh = br[0].chapters[br[0].chapters.length - 1];
ok(qs.every((q) => q.chapterId !== emptyCh.id), 'giả định: chương cuối chưa có câu');
const fScope = F({ gradeId: g12.id, chapterId: emptyCh.id });
ok(E(fScope) === 'scope', 'mục chưa có câu (A)');
ok(E({ ...fScope, review: 'approved' }) === 'scope', 'mục chưa có câu thì vẫn là A dù có bộ lọc thuộc tính');
const fFil = F({ gradeId: g12.id, chapterId: ch1.id, levels: new Set<Level>(['VDC']) });
ok(E(fFil) === 'filters', 'có câu nhưng bộ lọc loại hết (B)');
ok(E(F({ gradeId: g12.id, chapterId: ch1.id }), () => false, { hasText: true }) === 'text', 'do chữ tìm (C)');
ok(E(F({ gradeId: g12.id, chapterId: ch2.id }), () => false, { hasText: true, wide: true }) === 'text', 'toàn kho + chữ tìm không khớp: C, không nói "mục chưa có câu"');
const rB = computeFacets(qs, fFil, ctx());
ok(rB.inScope === 7, `inScope bỏ qua bộ lọc thuộc tính (được ${rB.inScope})`);
ok(computeFacets(qs, F({ gradeId: g12.id, chapterId: ch1.id }), ctx(false, () => false)).inScope === 7, 'inScope bỏ qua cả chữ tìm');

console.log('Bộ lọc Nhãn');
{
  const T: Question[] = [
    mk({ tags: ['Lô: A', 'Nguồn: de1.tex'] }), mk({ tags: ['Lô: A', 'Nguồn: de2.tex'], level: 'TH' }), mk({ tags: ['Lô: B'], level: 'TH' }), mk({ tags: [] }),
  ];
  const f = F({ tag: 'Lô: A' });
  const r = computeFacets(T, f, ctx());
  ok(r.list.length === 2 && r.list.every((q) => q.tags.includes('Lô: A')), 'lọc theo nhãn chỉ giữ câu có nhãn đó');
  ok(r.tag.get('Lô: A') === 2 && r.tag.get('Lô: B') === 1 && r.tag.get('Nguồn: de1.tex') === 1, 'số đếm theo nhãn bỏ riêng bộ lọc Nhãn (thấy cả nhãn khác để chuyển)');
  const r2 = computeFacets(T, F({ tag: 'Lô: A', levels: new Set<Level>(['TH']) }), ctx());
  ok(r2.list.length === 1 && r2.tag.get('Lô: A') === 1 && !r2.tag.has('Lô: B') || r2.tag.get('Lô: B') === 1, 'kết hợp với bộ lọc khác; số đếm nhãn tôn trọng mức độ đang chọn');
  ok(attrCount(f) === 1 && attrGroups(f) === 1 && clearAttrs(f).tag === null, 'tính vào số bộ lọc và Xoá bộ lọc bỏ được nhãn');
  const chip = attrChips(f, r);
  ok(chip.length === 1 && chip[0].key === 'tag' && chip[0].after === computeFacets(T, dropAttr(f, 'tag'), ctx()).list.length, 'chip Nhãn: số câu khi bỏ nó khớp kết quả thật');
  ok(computeFacets(T, F({ tag: 'không có nhãn này' }), ctx()).list.length === 0, 'nhãn không tồn tại ⇒ rỗng, không lỗi');
  ok(emptyKind(computeFacets(T, F({ tag: 'không có nhãn này' }), ctx()), F({ tag: 'không có nhãn này' }), { totalQuestions: 4, hasText: false, wide: false }) === 'filters', 'rỗng vì bộ lọc nhãn ⇒ trạng thái "bộ lọc"');
}

console.log('Chip điều kiện và số câu sẽ có');
const fTwo = F({ gradeId: g12.id, chapterId: ch1.id, levels: new Set<Level>(['VDC']), review: 'approved' });
const chips = attrChips(fTwo, computeFacets(qs, fTwo, ctx()));
ok(chips.length === 2 && chips[0].key === 'level' && chips[1].key === 'review', 'mỗi nhóm thuộc tính đang bật có một chip');
for (const c of chips) {
  const after = computeFacets(qs, dropAttr(fTwo, c.key), ctx()).list.length;
  ok(c.after === after, `chip "${c.label}": → ${c.after} khớp kết quả thật khi bỏ nó (${after})`);
}

console.log('Mục "Chưa có ID"');
{
  // 3 câu chưa có ID nằm ở chỗ giữ (Lớp 12 · Dạng đầu): 2 câu lớp 10, 1 câu chưa rõ lớp
  const ni = [mk({ level: 'TH' }), mk({ level: 'VD' }), mk({ level: 'TH' })];
  const lop = new Map([[ni[0].uid, 10], [ni[1].uid, 10], [ni[2].uid, NOID_UNKNOWN]]);
  const all = [...qs, ni[0], ni[1], ni[2]];
  const cx = (wide = false) => facetCtx(tax, () => true, wide, undefined, (x) => lop.get(x.uid) ?? null);
  const before = computeFacets(qs, F(), ctx());
  const r0 = computeFacets(all, F(), cx());
  ok(r0.noId === 3 && r0.noIdBy.get(10) === 2 && r0.noIdBy.get(NOID_UNKNOWN) === 1, 'đếm Chưa có ID: tổng 3, Lớp 10: 2, chưa rõ lớp: 1');
  ok(r0.gradeAll === before.gradeAll + 3 && r0.list.length === before.list.length + 3, '"Tất cả" vẫn gồm câu Chưa có ID');
  ok(fm1 != null && r0.node.get(`f:${fm1.id}`) === before.node.get(`f:${fm1.id}`) && r0.node.get(`g:${g12.id}`) === before.node.get(`g:${g12.id}`) && r0.node.get(`c:${ch1.id}`) === before.node.get(`c:${ch1.id}`), 'không cộng vào số đếm Lớp/Chương/Dạng của chỗ giữ');
  const r12 = computeFacets(all, F({ gradeId: g12.id, chapterId: ch1.id, lessonId: ls1.id, formId: fm1?.id ?? null }), cx());
  ok(!r12.list.some((x) => lop.has(x.uid)), 'chọn Dạng của chỗ giữ: không hiện câu Chưa có ID');
  const rn = computeFacets(all, pickNoId(F(), 'all'), cx());
  ok(rn.list.length === 3 && rn.list.every((x) => lop.has(x.uid)), 'chọn "Chưa có ID": chỉ còn đúng các câu đó');
  ok(computeFacets(all, pickNoId(F(), 10), cx()).list.length === 2 && computeFacets(all, pickNoId(F(), NOID_UNKNOWN), cx()).list.length === 1, 'chọn theo lớp trong mục: Lớp 10 / chưa rõ lớp');
  ok(computeFacets(all, pickNoId(F({ levels: new Set<Level>(['TH']) }), 'all'), cx()).list.length === 2, 'thuộc tính (Mức độ) vẫn áp trong mục');
  const p = pickNoId(F({ gradeId: g12.id, chapterId: ch1.id }), 'all');
  ok(p.gradeId === null && p.chapterId === null && p.noId === 'all', 'chọn mục bỏ vị trí trong cây');
  ok(pickGrade(p, g12.id).noId === null && pickPath(p, { gradeId: g12.id, branchId: null, chapterId: null, lessonId: null, formId: null }).noId === null, 'chọn mục trong cây bỏ "Chưa có ID"');
  ok(sanitize(tax, { ...F({ gradeId: g12.id }), noId: 'all' }).gradeId === null, 'sanitize: Chưa có ID và vị trí loại trừ nhau');
  const old = { ...F() } as Partial<BankFilters>; delete old.noId;
  ok(sanitize(tax, old as BankFilters).noId === null, 'phiên lưu từ bản cũ (thiếu noId) ⇒ null');
}

console.log('Hiệu năng');
const big: Question[] = Array.from({ length: 60000 }, (_, i) => mk({ level: (['NB', 'TH', 'VD', 'VDC'] as Level[])[i % 4], fig: i % 3 === 0, uid: 'b' + i, chapterId: i % 2 ? ch1.id : ch2.id }));
let t = performance.now(); computeFacets(big, F({ gradeId: g12.id, figure: 'yes', levels: new Set<Level>(['TH', 'VD']) }), ctx()); const cold = performance.now() - t;
t = performance.now(); computeFacets(big, F({ gradeId: g12.id, figure: 'yes', levels: new Set<Level>(['TH', 'VD']) }), ctx()); const warm = performance.now() - t;
console.log(`    60.000 câu: lần đầu ${cold.toFixed(0)} ms, lần sau ${warm.toFixed(0)} ms (máy làm việc của Claude, chỉ để tham khảo)`);
ok(warm < 600, 'lần sau dưới 600 ms trên máy làm việc');
if (fail) { console.log(`${fail} lỗi`); process.exit(1); }
