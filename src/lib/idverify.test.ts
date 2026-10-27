import { IdSuggester } from './idsuggest';
import { isFresh, summarizeVerify, usableChoice, verifyId, type IdChoice, type IdVerification } from './idverify';
import { buildDefault } from './taxonomy';
import type { Level, Location, Question } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const tax = buildDefault();
const g = tax.grades.find((x) => x.branches.flatMap((b) => b.chapters).flatMap((c) => c.lessons).length >= 3)!;
const lessons = g.branches.flatMap((b) => b.chapters.map((c) => ({ c, ls: c.lessons }))).flatMap(({ c, ls }) => ls.map((l) => ({ c, l })));
const at = (i: number): Location => ({ grade: g.grade, chapterId: lessons[i].c.id, lessonId: lessons[i].l.id, formId: lessons[i].l.forms[0].id });
const A = at(0), B = at(1), C = at(2);

const ex = (body: string) => `\\begin{ex}\n${body}\n\\choice{\\True $1$}{$2$}{$3$}{$4$}\n\\loigiai{}\n\\end{ex}`;
const TEXT: Record<string, string[]> = {
  A: ['Tìm tập xác định của hàm số $y=\\sqrt{x-#}$.', 'Hàm số $y=\\dfrac{1}{x-#}$ xác định khi nào? Chọn tập xác định đúng.', 'Tập xác định $D$ của hàm số $y=\\sqrt{#-x}+\\dfrac{1}{x}$ là'],
  B: ['Gieo một con xúc xắc cân đối, tính xác suất xuất hiện mặt # chấm.', 'Rút ngẫu nhiên một thẻ trong hộp có # thẻ đánh số, tính xác suất rút được thẻ số chẵn.', 'Chọn ngẫu nhiên hai bạn trong lớp có # học sinh, tính xác suất cả hai là nữ.'],
  C: ['Cho hai tập hợp $A=[1;#)$ và $B=(0;5]$. Tìm giao $A\\cap B$.', 'Hợp của hai tập hợp $A=\\{1;2;#\\}$ và $B=\\{2;3\\}$ là', 'Cho $A=(-\\infty;#]$. Phần bù của $A$ trong $\\mathbb{R}$ là'],
};
let n = 0;
const q = (loc: Location, latex: string, level: Level = 'TH'): Question => ({ uid: `u${++n}`, seq: n, latex, type: 'tn', level, tags: [], createdAt: 1, updatedAt: 1, ...loc });
const bank: Question[] = [];
for (const [key, loc] of [['A', A], ['B', B], ['C', C]] as const) for (const t of TEXT[key]) for (const k of [3, 4, 7]) bank.push(q(loc, ex(t.replace('#', String(k)))));
const before = JSON.stringify(bank);
const s = new IdSuggester(tax, bank);

const newA = ex('Tìm tập xác định của hàm số $y=\\sqrt{x-9}$.');
const vOk = verifyId(newA, A, s, 'k1');
ok(vOk.verdict === 'khop' && vOk.suggested?.formId === A.formId, 'ID đúng Dạng A, nội dung nhóm A ⇒ khớp');

const vBad = verifyId(newA, B, s, 'k2');
ok(vBad.verdict === 'bat-dong' && vBad.suggested?.formId === A.formId, 'ID ghi Dạng B nhưng nội dung nhóm A (tin cậy cao) ⇒ bất đồng, gợi ý Dạng A');

const strange = ex('Quần đảo trường sa thuộc tỉnh nào');
const vUn = verifyId(strange, A, s, 'k3');
ok(vUn.verdict === 'chua-kiem-chung', 'nội dung lạ, không đủ căn cứ ⇒ chưa kiểm chứng (không bất đồng, không khớp)');

const empty = verifyId(newA, A, new IdSuggester(tax, []), 'k4');
ok(empty.verdict === 'chua-kiem-chung' && empty.suggested === null, 'ngân hàng trống ⇒ chưa kiểm chứng, không có gợi ý');

const noGrade = tax.grades.find((x) => x.grade !== g.grade)!;
const oc = noGrade.branches[0].chapters[0], ol = oc.lessons[0];
const O: Location = { grade: noGrade.grade, chapterId: oc.id, lessonId: ol.id, formId: ol.forms[0].id };
ok(verifyId(newA, O, s, 'k5').verdict === 'chua-kiem-chung', 'lớp của ID chưa có câu mẫu ⇒ chưa kiểm chứng');

// mức độ không tham gia: kết quả kiểm chỉ theo Dạng
ok(verifyId(newA, A, s, 'k6').verdict === verifyId(newA, A, s, 'k7').verdict, 'kết quả xác định (cùng đầu vào, cùng kết quả)');

ok(isFresh(vOk, newA, vOk.taxRev) && !isFresh(vOk, newA + ' ', vOk.taxRev) && !isFresh(vOk, newA, 'khac') && !isFresh(undefined, newA, vOk.taxRev), 'kết quả cũ hết hạn khi câu sửa hoặc cây đổi');

// lựa chọn của giáo viên
ok(usableChoice(vBad, 'giu') === 'giu' && usableChoice(vBad, 'goi-y') === 'goi-y' && usableChoice(vBad, 'chung') === 'chung', 'câu bất đồng: ba lựa chọn dùng được');
ok(usableChoice(vBad, undefined) === undefined, 'câu bất đồng chưa chọn ⇒ chưa nhập được');
ok(usableChoice(vOk, 'giu') === undefined, 'lựa chọn chỉ có nghĩa với câu bất đồng');
const noSug: IdVerification = { ...vBad, suggested: null };
ok(usableChoice(noSug, 'goi-y') === undefined, 'không có Dạng gợi ý ⇒ không chọn được "theo gợi ý"');

// tổng hợp: chỉ tính câu sẽ nhập
const vers: Record<number, IdVerification | undefined> = { 0: vOk, 1: vBad, 2: vUn, 3: vBad, 4: undefined };
const ch: Record<number, IdChoice | undefined> = { 3: 'giu' };
const imp = (i: number) => i !== 2;
const sum = summarizeVerify([0, 1, 2, 3, 4], (i) => vers[i], (i) => ch[i], imp);
ok(sum.total === 4 && sum.khop === 1 && sum.chua === 0 && sum.batDong === 2 && sum.pending === 1 && sum.unchecked === 1, `tổng hợp đúng (khớp 1, bất đồng 2 trong đó chờ 1, chưa kiểm xong 1): ${JSON.stringify(sum)}`);

ok(JSON.stringify(bank) === before, 'kiểm chứng không sửa gì trong ngân hàng');

if (fail) process.exit(1);
console.log('idverify: đạt hết.');
