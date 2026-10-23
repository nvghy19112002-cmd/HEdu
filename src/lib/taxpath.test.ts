import { buildDefault, indexOf } from './taxonomy';
import { checkLocation, locationOfForm, taxRevision } from './taxpath';
import type { Location } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const tax = buildDefault();
const ix = indexOf(tax);
// hai Bài khác nhau (có thể khác Chương) cùng lớp, và một Dạng ở lớp khác
const g = tax.grades.find((x) => x.branches.some((b) => b.chapters.length > 1))!;
const ch1 = g.branches.flatMap((b) => b.chapters)[0], ch2 = g.branches.flatMap((b) => b.chapters)[1];
const ls1 = ch1.lessons[0], ls2 = ch1.lessons[1] ?? ch2.lessons[0];
const f1 = ls1.forms[0], f2 = ls2.forms[0];
const other = tax.grades.find((x) => x.grade !== g.grade)!;
const oCh = other.branches[0].chapters[0], oLs = oCh.lessons[0], oF = oLs.forms[0];

const good: Location = { grade: g.grade, chapterId: ch1.id, lessonId: ls1.id, formId: f1.id };
ok(checkLocation(ix, good).ok, 'đường đầy đủ khớp ⇒ hợp lệ');
const r1 = checkLocation(ix, { ...good, formId: f2.id });
ok(!r1.ok && r1.problem === 'sai-bai', 'Dạng của Bài khác ghép với Bài cũ ⇒ sai-bai');
const r2 = checkLocation(ix, { ...good, chapterId: ch2.id });
ok(!r2.ok && r2.problem === 'sai-chuong', 'Chương không chứa Bài ⇒ sai-chuong');
const r3 = checkLocation(ix, { ...good, grade: other.grade });
ok(!r3.ok && r3.problem === 'sai-lop', 'Lớp ghi sai ⇒ sai-lop');
const r4 = checkLocation(ix, { ...good, formId: 'f-khong-co' });
ok(!r4.ok && r4.problem === 'khong-co-dang', 'Dạng không có trong cây ⇒ khong-co-dang');
const r5 = checkLocation(ix, { ...good, formId: ls1.id });
ok(!r5.ok && r5.problem === 'khong-phai-dang', 'đưa id Bài vào chỗ Dạng ⇒ khong-phai-dang');
const r6 = checkLocation(ix, { grade: other.grade, chapterId: oCh.id, lessonId: oLs.id, formId: oF.id }, g.grade);
ok(!r6.ok && r6.problem === 'ngoai-lop-dich', 'đúng đường nhưng khác lớp đích ⇒ ngoai-lop-dich');

const loc = locationOfForm(ix, f2.id);
ok(!!loc && loc.lessonId === ls2.id && loc.grade === g.grade && checkLocation(ix, loc).ok, 'locationOfForm suy đủ đường từ Dạng');
ok(locationOfForm(ix, ls1.id) === null && locationOfForm(ix, 'zz') === null, 'không phải Dạng ⇒ null');

const rev = taxRevision(tax);
ok(rev === taxRevision(buildDefault()), 'cùng cây ⇒ cùng dấu phiên bản');
const renamed = structuredClone(tax); renamed.grades[0].branches[0].chapters[0].name += ' (sửa)';
ok(taxRevision(renamed) !== rev, 'đổi tên một nút ⇒ đổi dấu phiên bản');

if (fail) process.exit(1);
console.log('taxpath: đạt hết.');
