import { IdSuggester, SUGGEST_THRESHOLDS } from './idsuggest';
import { buildDefault, indexOf } from './taxonomy';
import { checkLocation, taxRevision } from './taxpath';
import type { Level, Location, Question } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const tax = buildDefault();
const ix = indexOf(tax);
// ba Dạng ở ba Bài khác nhau của cùng một lớp, và một lớp khác
const g = tax.grades.find((x) => x.branches.flatMap((b) => b.chapters).flatMap((c) => c.lessons).length >= 3)!;
const lessons = g.branches.flatMap((b) => b.chapters.map((c) => ({ c, ls: c.lessons }))).flatMap(({ c, ls }) => ls.map((l) => ({ c, l })));
const at = (i: number): Location => ({ grade: g.grade, chapterId: lessons[i].c.id, lessonId: lessons[i].l.id, formId: lessons[i].l.forms[0].id });
const A = at(0), B = at(1), C = at(2);
const other = tax.grades.find((x) => x.grade !== g.grade)!;
const oc = other.branches[0].chapters[0], ol = oc.lessons[0];
const O: Location = { grade: other.grade, chapterId: oc.id, lessonId: ol.id, formId: ol.forms[0].id };

const ex = (body: string) => `\\begin{ex}\n${body}\n\\choice{\\True $1$}{$2$}{$3$}{$4$}\n\\loigiai{}\n\\end{ex}`;
// mỗi Dạng: nhiều cách diễn đạt khác nhau (khác họ), mỗi cách vài con số (cùng họ)
const TEXT: Record<string, string[]> = {
  A: ['Tìm tập xác định của hàm số $y=\\sqrt{x-#}$.', 'Hàm số $y=\\dfrac{1}{x-#}$ xác định khi nào? Chọn tập xác định đúng.', 'Tập xác định $D$ của hàm số $y=\\sqrt{#-x}+\\dfrac{1}{x}$ là'],
  B: ['Gieo một con xúc xắc cân đối, tính xác suất xuất hiện mặt # chấm.', 'Rút ngẫu nhiên một thẻ trong hộp có # thẻ đánh số, tính xác suất rút được thẻ số chẵn.', 'Chọn ngẫu nhiên # học sinh trong lớp, xác suất để chọn được hai bạn nữ là'],
  C: ['Cho hai tập hợp $A=[1;#)$ và $B=(0;5]$. Tìm giao $A\\cap B$.', 'Hợp của hai tập hợp $A=\\{1;2;#\\}$ và $B=\\{2;3\\}$ là', 'Cho $A=(-\\infty;#]$. Phần bù của $A$ trong $\\mathbb{R}$ là'],
};
let n = 0;
const q = (loc: Location, latex: string, level: Level = 'TH', extra: Partial<Question> = {}): Question =>
  ({ uid: `u${++n}`, seq: n, latex, type: 'tn', level, tags: [], createdAt: 1, updatedAt: 1, ...loc, ...extra });
const bank: Question[] = [];
for (const [key, loc] of [['A', A], ['B', B], ['C', C]] as const) for (const t of TEXT[key]) for (const k of [3, 4, 7]) bank.push(q(loc, ex(t.replace('#', String(k)))));

const before = JSON.stringify(bank);
const s = new IdSuggester(tax, bank);
ok(s.size === bank.length && s.taxRev === taxRevision(tax), 'dùng đủ câu mẫu hợp lệ, dấu phiên bản cây đúng');

const r1 = s.suggest({ key: 'k1', latex: ex('Tìm tập xác định của hàm số $y=\\sqrt{x-9}$.'), grade: g.grade });
ok(r1.best?.formId === A.formId, 'câu mới giống nhóm A ⇒ gợi ý Dạng A');
ok(!!r1.best && checkLocation(ix, r1.best.location, g.grade).ok, 'vị trí gợi ý đúng đủ đường dẫn cây');
ok(r1.confidence === 'cao' || r1.confidence === 'vua', `nhiều mẫu thống nhất ⇒ tin cậy cao/vừa (được: ${r1.confidence})`);
ok(r1.evidence.length > 0 && r1.evidence.length <= 5 && r1.evidence.every((e) => bank.some((b) => b.uid === e.uid)), 'có câu mẫu dẫn chứng (≤5) lấy từ ngân hàng');
ok(r1.alternatives.length <= 2 && r1.alternatives.every((a) => a.formId !== r1.best?.formId && checkLocation(ix, a.location, g.grade).ok), 'tối đa 2 phương án khác, không trùng, đều hợp lệ');
ok(r1.levelHint === null || ['NB', 'TH', 'VD', 'VDC'].includes(r1.levelHint), 'mức độ chỉ là gợi ý thuộc NB/TH/VD/VDC');

const r2 = s.suggest({ key: 'k2', latex: ex('Gieo con xúc xắc hai lần, xác suất tổng số chấm bằng 7 là'), grade: g.grade });
ok(r2.best?.formId === B.formId, 'câu xác suất ⇒ Dạng B');

const r3 = s.suggest({ key: 'k3', latex: ex('Tìm tập xác định của hàm số $y=\\sqrt{x-9}$.'), grade: other.grade });
ok(r3.best === null && r3.confidence === 'khong' && r3.notes.length > 0, 'lớp chưa có câu mẫu ⇒ không gán, ghi chú lý do');

const r4 = s.suggest({ key: 'k4', latex: ex('Quần đảo trường sa thuộc tỉnh nào'), grade: g.grade });
ok(r4.confidence === 'thap' || r4.confidence === 'khong', 'nội dung lạ ⇒ tin cậy thấp hoặc không đủ căn cứ');

// câu trong ngân hàng bị gán NHẦM vị trí (nội dung nhóm A nhưng ghi ở C): không được tự bỏ phiếu cho chỗ sai của mình
const wrong = q(C, ex('Tìm tập xác định của hàm số $y=\\sqrt{x-11}$.'));
const s2 = new IdSuggester(tax, [...bank, wrong]);
const r5 = s2.suggest({ key: wrong.uid, latex: wrong.latex, grade: g.grade, excludeUid: wrong.uid });
ok(r5.best?.formId === A.formId && !r5.evidence.some((e) => e.uid === wrong.uid), 'câu gán nhầm ⇒ gợi ý về Dạng đúng, không tự làm dẫn chứng');

// Dạng chỉ có đúng một câu là chính nó: không được gợi ý Dạng đó từ chính câu ấy
const lone = q(at(3), ex('Một bài toán quỹ tích hoàn toàn khác biệt với hình tròn nội tiếp tam giác.'));
const s3 = new IdSuggester(tax, [...bank, lone]);
const r6 = s3.suggest({ key: lone.uid, latex: lone.latex, grade: g.grade, excludeUid: lone.uid });
ok(r6.best?.formId !== lone.formId && !r6.alternatives.some((a) => a.formId === lone.formId), 'Dạng chỉ có chính câu đó ⇒ không tự gợi ý lại');

// câu mẫu sai đường dẫn cây không được dùng
const broken = q({ ...B, lessonId: A.lessonId }, ex('Gieo một con xúc xắc cân đối, tính xác suất xuất hiện mặt 9 chấm.'));
const s4 = new IdSuggester(tax, [...bank, broken]);
ok(s4.size === bank.length, 'câu mẫu sai đường dẫn bị loại khỏi tập mẫu');

// câu cùng nội dung ở lớp khác không kéo gợi ý sang lớp khác
const s5 = new IdSuggester(tax, [...bank, ...TEXT.A.map((t) => q(O, ex(t.replace('#', '5'))))]);
const r7 = s5.suggest({ key: 'k7', latex: ex('Tìm tập xác định của hàm số $y=\\sqrt{x-9}$.'), grade: g.grade });
ok(!!r7.best && [r7.best, ...r7.alternatives].every((o) => o.location.grade === g.grade), 'không bao giờ gợi ý ra ngoài lớp đích');

const again = s.suggest({ key: 'k1', latex: ex('Tìm tập xác định của hàm số $y=\\sqrt{x-9}$.'), grade: g.grade });
ok(JSON.stringify(again) === JSON.stringify(r1), 'cùng đầu vào ⇒ cùng kết quả');
ok(JSON.stringify(bank) === before, 'gợi ý không sửa gì trong dữ liệu ngân hàng');
ok(SUGGEST_THRESHOLDS.highMinShare === 0.8 && SUGGEST_THRESHOLDS.highMinFamilies === 2 && SUGGEST_THRESHOLDS.highMinScore === 0.3, 'ngưỡng "cao" đúng như đo ở GĐ0');

if (fail) process.exit(1);
console.log('idsuggest: đạt hết.');
