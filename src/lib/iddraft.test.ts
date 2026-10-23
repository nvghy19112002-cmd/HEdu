import { draftLocation, optionsOf, suggestDrafts, useByDefault } from './iddraft';
import { IdSuggester } from './idsuggest';
import { buildDefault, indexOf } from './taxonomy';
import { checkLocation, taxRevision } from './taxpath';
import type { Location, Question } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const tax = buildDefault();
const ix = indexOf(tax);
const rev = taxRevision(tax);
const g = tax.grades.find((x) => x.branches.flatMap((b) => b.chapters).flatMap((c) => c.lessons).length >= 3)!;
const lessons = g.branches.flatMap((b) => b.chapters.map((c) => ({ c, ls: c.lessons }))).flatMap(({ c, ls }) => ls.map((l) => ({ c, l })));
const at = (i: number): Location => ({ grade: g.grade, chapterId: lessons[i].c.id, lessonId: lessons[i].l.id, formId: lessons[i].l.forms[0].id });
const A = at(0), B = at(1), COMMON = at(2);
const ex = (body: string) => `\\begin{ex}\n${body}\n\\choice{\\True $1$}{$2$}{$3$}{$4$}\n\\loigiai{}\n\\end{ex}`;
const TA = ['Tìm tập xác định của hàm số $y=\\sqrt{x-#}$.', 'Hàm số $y=\\dfrac{1}{x-#}$ xác định khi nào? Chọn tập xác định đúng.', 'Tập xác định $D$ của hàm số $y=\\sqrt{#-x}+\\dfrac{1}{x}$ là'];
const TB = ['Gieo một con xúc xắc cân đối, tính xác suất xuất hiện mặt # chấm.', 'Rút ngẫu nhiên một thẻ trong hộp có # thẻ đánh số, tính xác suất rút được thẻ số chẵn.', 'Chọn ngẫu nhiên # học sinh trong lớp, xác suất để chọn được hai bạn nữ là'];
let n = 0;
const q = (loc: Location, latex: string): Question => ({ uid: `u${++n}`, seq: n, latex, type: 'tn', level: 'TH', tags: [], createdAt: 1, updatedAt: 1, ...loc });
const bank = [...TA.flatMap((t) => [3, 4, 7].map((k) => q(A, ex(t.replace('#', String(k)))))), ...TB.flatMap((t) => [3, 4, 7].map((k) => q(B, ex(t.replace('#', String(k))))))];
const s = new IdSuggester(tax, bank);

const d1 = ex('Tìm tập xác định của hàm số $y=\\sqrt{x-9}$.');
const d2 = ex('Quần đảo trường sa thuộc tỉnh nào');
const picks = suggestDrafts([{ index: 0, latex: d1 }, { index: 3, latex: d2 }], s, g.grade);
const p0 = picks.get(0)!, p3 = picks.get(3)!;
ok(picks.size === 2 && p0.latex === d1, 'gợi ý theo số thứ tự câu trong file, nhớ LaTeX lúc gợi ý');
ok(p0.suggestion.best?.formId === A.formId && p0.formId === A.formId, 'câu tin cậy cao/vừa ⇒ mặc định dùng gợi ý');
ok(!useByDefault(p3.suggestion.confidence) && p3.formId === null, 'câu tin cậy thấp ⇒ mặc định dùng vị trí chung');
ok(optionsOf(p0).length >= 1 && optionsOf(p0).length <= 3, 'tối đa 3 phương án (gợi ý + 2 khác)');

const r0 = draftLocation(p0, d1, ix, rev, COMMON);
ok(r0.suggested && r0.loc.formId === A.formId && checkLocation(ix, r0.loc, g.grade).ok, 'dùng gợi ý: vị trí đúng đủ đường dẫn');
ok(!draftLocation(p3, d2, ix, rev, COMMON).suggested && draftLocation(p3, d2, ix, rev, COMMON).loc === COMMON, 'chọn "vị trí chung" ⇒ dùng vị trí chung');
ok(draftLocation(undefined, d1, ix, rev, COMMON).loc === COMMON, 'chưa bấm gợi ý ⇒ như cũ: vị trí chung');
ok(draftLocation(p0, d1 + ' ', ix, rev, COMMON).loc === COMMON, 'sửa câu sau khi gợi ý ⇒ gợi ý cũ bỏ, dùng vị trí chung');
ok(draftLocation(p0, d1, ix, 'cay-khac', COMMON).loc === COMMON, 'cây đổi sau khi gợi ý ⇒ không dùng gợi ý cũ');
ok(draftLocation({ ...p0, formId: 'f-la' }, d1, ix, rev, COMMON).loc === COMMON, 'Dạng không nằm trong phương án đã gợi ý ⇒ không dùng');
const other = tax.grades.find((x) => x.grade !== g.grade)!;
const oL = other.branches[0].chapters[0].lessons[0];
ok(draftLocation(p0, d1, ix, rev, { grade: other.grade, chapterId: other.branches[0].chapters[0].id, lessonId: oL.id, formId: oL.forms[0].id }).suggested === false, 'đổi lớp đích sau khi gợi ý ⇒ không dùng gợi ý của lớp cũ');

if (fail) process.exit(1);
console.log('iddraft: đạt hết.');
