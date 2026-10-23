import { attrCount, chapterBranchMap, clearAttrs, computeFacets, emptyFilters, pickBranch, pickChapter, pickForm, pickGrade, pickLesson, sanitize, type BankFilters } from './bankfilter';
import { buildDefault } from './taxonomy';
import type { Level, QType, Question } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const tax = buildDefault();
const g12 = tax.grades.find((g) => g.grade === 12)!;
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
const ctx = (wide = false, textOk: (u: string) => boolean = () => true) => ({ chapterBranch: chapterBranchMap(tax), textOk, wide });
const F = (p: Partial<BankFilters> = {}): BankFilters => ({ ...emptyFilters(), ...p });

console.log('Cascade vị trí');
const base = F({ gradeNum: 12, branchId: br[0].id, chapterId: ch1.id, lessonId: ls1.id, formId: fm1?.id ?? null, levels: new Set<Level>(['TH']), review: 'approved' });
const g = pickGrade(base, 11);
ok(g.gradeNum === 11 && !g.branchId && !g.chapterId && !g.lessonId && !g.formId, 'đổi Lớp xoá Phân môn/Chương/Bài/Dạng');
ok(g.levels.has('TH') && g.review === 'approved', 'đổi Lớp giữ các thuộc tính');
const b = pickBranch(base, br[1].id);
ok(b.branchId === br[1].id && !b.chapterId && !b.lessonId && !b.formId && b.gradeNum === 12, 'đổi Phân môn xoá Chương/Bài/Dạng, giữ Lớp');
const c = pickChapter(tax, base, ch2.id);
ok(c.chapterId === ch2.id && !c.lessonId && !c.formId && c.branchId === br[0].id, 'đổi Chương xoá Bài/Dạng');
const c2 = pickChapter(tax, F({ gradeNum: 12 }), hCh.id);
ok(c2.branchId === hBranch.id, 'chọn Chương khi chưa chọn Phân môn ⇒ tự điền Phân môn đúng');
const l = pickLesson(base, ls2.id);
ok(l.lessonId === ls2.id && !l.formId && l.chapterId === ch1.id, 'đổi Bài xoá Dạng');
ok(pickForm(base, null).formId === null && pickForm(base, null).lessonId === ls1.id, 'bỏ Dạng giữ Bài');

console.log('Xoá bộ lọc / đặt lại');
const k = clearAttrs(base);
ok(attrCount(base) === 2 && attrCount(k) === 0, 'đếm bộ lọc thuộc tính (Mức độ 1 + Kiểm duyệt 1)');
ok(k.gradeNum === 12 && k.chapterId === ch1.id && k.lessonId === ls1.id && k.formId === base.formId, '"Xoá bộ lọc" không đụng vị trí (kể cả Dạng)');

console.log('Lọc');
let r = computeFacets(qs, F({ gradeNum: 12 }), ctx());
ok(r.list.length === 9, `Lớp 12 có 9 câu (được ${r.list.length})`);
r = computeFacets(qs, F({ gradeNum: 12, branchId: hBranch.id }), ctx());
ok(r.list.length === 1, 'Phân môn Hình học chỉ lấy câu thuộc chương của phân môn đó');
r = computeFacets(qs, F({ gradeNum: 12, chapterId: ch1.id, lessonId: ls1.id }), ctx());
ok(r.list.length === 6, `Bài 1 của chương 1: 6 câu (được ${r.list.length})`);
r = computeFacets(qs, F({ gradeNum: 12, figure: 'yes' }), ctx());
ok(r.list.length === 4 && r.list.every((x) => x.latex.includes('tikzpicture')), 'Có hình: 4 câu');
r = computeFacets(qs, F({ gradeNum: 12, figure: 'no' }), ctx());
ok(r.list.length === 5, 'Không hình: 5 câu');
r = computeFacets(qs, F({ gradeNum: 12, review: 'approved' }), ctx());
ok(r.list.length === 1, 'Kiểm duyệt: Đã duyệt = 1 câu');

console.log('Đếm theo chiều (bỏ chính chiều đó)');
r = computeFacets(qs, F({ gradeNum: 12, levels: new Set<Level>(['TH']) }), ctx());
ok(r.level.get('TH') === 5 && r.level.get('VD') === 3 && r.level.get('NB') === 1, `chọn Thông hiểu: Vận dụng vẫn đếm 3, không bị về 0 (TH ${r.level.get('TH')}, VD ${r.level.get('VD')}, NB ${r.level.get('NB')})`);
ok(r.list.length === 5, 'danh sách chỉ còn Thông hiểu (5)');
r = computeFacets(qs, F({ gradeNum: 12, levels: new Set<Level>(['TH']), types: new Set<QType>(['ds']) }), ctx());
ok(r.level.get('TH') === 1 && r.level.get('VD') === undefined, 'đếm Mức độ vẫn áp Loại câu đang chọn');
ok(r.type.get('ds') === 1 && r.type.get('tn') === 4, 'đếm Loại áp Mức độ đang chọn, bỏ Loại');
r = computeFacets(qs, F({ gradeNum: 12, figure: 'yes' }), ctx());
ok(r.figure.yes === 4 && r.figure.no === 5, 'đếm Hình: Có 4 / Không 5 khi đang chọn Có hình');
r = computeFacets(qs, F({ gradeNum: 12, chapterId: ch1.id, levels: new Set<Level>(['VD']) }), ctx());
ok(r.chapter.get(ch1.id) === 2 && r.chapter.get(ch2.id) === 1, 'số ở Chương theo bộ lọc thuộc tính và không bị Chương đang chọn ràng buộc');
ok(r.scoped === 7, `mẫu số "N / M" = câu trong chương 1, chưa lọc thuộc tính (được ${r.scoped})`);
r = computeFacets(qs, F({ gradeNum: 12 }), ctx());
ok(r.grade.get(11) === 1 && r.grade.get(12) === 9 && r.gradeAll === 10, 'số ở Lớp: bỏ chính Lớp (Lớp 11 vẫn đếm 1, Tất cả 10)');
r = computeFacets(qs, F({ gradeNum: 12, branchId: br[0].id }), ctx());
ok(r.branch.get(hBranch.id) === 1 && r.branch.get(br[0].id) === 8, 'số ở Phân môn: bỏ chính Phân môn');

console.log('Toàn kho khi tìm');
const only = new Set([qs[0].uid, qs[8].uid]);
r = computeFacets(qs, F({ gradeNum: 12, chapterId: ch2.id }), ctx(true, (u) => only.has(u)));
ok(r.list.length === 2, 'wide: bỏ qua vị trí, vẫn áp ô tìm');
r = computeFacets(qs, F({ gradeNum: 12, chapterId: ch2.id }), ctx(false, (u) => only.has(u)));
ok(r.list.length === 0, 'không wide: vẫn trong vị trí');

console.log('Gỡ giá trị không còn hợp lệ');
ok(sanitize(tax, F({ gradeNum: 99, chapterId: 'x' })).gradeNum === null, 'lớp không còn ⇒ về Tất cả');
const s = sanitize(tax, F({ gradeNum: 12, branchId: br[0].id, chapterId: 'khong-co', lessonId: 'a', formId: 'b' }));
ok(s.gradeNum === 12 && s.branchId === br[0].id && !s.chapterId && !s.lessonId && !s.formId, 'chương không còn ⇒ xoá từ chương trở xuống, giữ Lớp/Phân môn');
const good = F({ gradeNum: 12, branchId: br[0].id, chapterId: ch1.id, lessonId: ls1.id });
ok(sanitize(tax, good) === good, 'giá trị hợp lệ giữ nguyên (cùng đối tượng, không vẽ lại thừa)');

console.log('Hiệu năng');
const big: Question[] = Array.from({ length: 60000 }, (_, i) => mk({ level: (['NB', 'TH', 'VD', 'VDC'] as Level[])[i % 4], fig: i % 3 === 0, uid: 'b' + i, chapterId: i % 2 ? ch1.id : ch2.id }));
let t = performance.now(); computeFacets(big, F({ gradeNum: 12, figure: 'yes', levels: new Set<Level>(['TH', 'VD']) }), ctx()); const cold = performance.now() - t;
t = performance.now(); computeFacets(big, F({ gradeNum: 12, figure: 'yes', levels: new Set<Level>(['TH', 'VD']) }), ctx()); const warm = performance.now() - t;
console.log(`    60.000 câu: lần đầu ${cold.toFixed(0)} ms, lần sau ${warm.toFixed(0)} ms (máy làm việc của Claude, chỉ để tham khảo)`);
ok(warm < 600, 'lần sau dưới 600 ms trên máy làm việc');
if (fail) { console.log(`${fail} lỗi`); process.exit(1); }
