// Cây đổi sau khi tệp đã được đọc: ID từng hợp lệ thành không hợp lệ. Kiểm bằng đúng luồng nhập:
// tách tệp (buildRows) → đọc ID theo cây hiện tại → danh sách cần kiểm chứng → kiểm chứng → dựng bản ghi (planDrafts) → ghi vào kho (addMany).
import { buildRows } from './importbatch';
import { getTaxonomy, resetTaxonomy, setTaxonomy } from './curriculum';
import { idRowsOf, planDrafts, readIds } from './importplan';
import { strictCode } from './idsync';
import { addMany, getState, initStore } from './store';
import { decide, summarizeVerify, verifierFor, verifyId, type IdVerification } from './idverify';
import { buildDefault } from './taxonomy';
import { taxRevision } from './taxpath';
import type { Level, Location, Question } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

resetTaxonomy();
const taxA = getTaxonomy();
const g = taxA.grades.find((x) => x.branches.flatMap((b) => b.chapters).flatMap((c) => c.lessons).length >= 4)!;
const lessons = g.branches.flatMap((b) => b.chapters.map((c) => ({ c, ls: c.lessons }))).flatMap(({ c, ls }) => ls.map((l) => ({ c, l })));
const at = (i: number): Location => ({ grade: g.grade, chapterId: lessons[i].c.id, lessonId: lessons[i].l.id, formId: lessons[i].l.forms[0].id });
const A = at(0), B = at(1), C = at(2);
const lvl: Level = 'VD';
const code = (loc: Location, level: Level = lvl) => { const s = strictCode(loc, level, taxA); if (!s.ok) throw new Error('mã'); return s.code; };

const ex = (body: string, id?: string) => `\\begin{ex}${id ? `%[${id}]` : ''}\n${body}\n\\choice{\\True $1$}{$2$}{$3$}{$4$}\n\\loigiai{}\n\\end{ex}`;
const TEXT_A = ['Tìm tập xác định của hàm số $y=\\sqrt{x-#}$.', 'Hàm số $y=\\dfrac{1}{x-#}$ xác định khi nào? Chọn tập xác định đúng.', 'Tập xác định $D$ của hàm số $y=\\sqrt{#-x}+\\dfrac{1}{x}$ là'];
const TEXT_B = ['Gieo một con xúc xắc cân đối, tính xác suất xuất hiện mặt # chấm.', 'Rút ngẫu nhiên một thẻ trong hộp có # thẻ đánh số, tính xác suất rút được thẻ số chẵn.', 'Chọn ngẫu nhiên hai bạn trong lớp có # học sinh, tính xác suất cả hai là nữ.'];
const TEXT_C = ['Cho hai tập hợp $A=[1;#)$ và $B=(0;5]$. Tìm giao $A\\cap B$.', 'Hợp của hai tập hợp $A=\\{1;2;#\\}$ và $B=\\{2;3\\}$ là', 'Cho $A=(-\\infty;#]$. Phần bù của $A$ trong $\\mathbb{R}$ là'];
let n = 0;
const q = (loc: Location, latex: string): Question => ({ uid: `u${++n}`, seq: n, latex, type: 'tn', level: 'TH', tags: [], createdAt: 1, updatedAt: 1, review: 'approved', ...loc });
const bank: Question[] = [];
for (const [ts, loc] of [[TEXT_A, A], [TEXT_B, B], [TEXT_C, C]] as const) for (const t of ts) for (const k of [3, 4, 7]) bank.push(q(loc, ex(t.replace('#', String(k)))));

// tệp nhập: câu 0 ID đúng (Dạng A); câu 1 nội dung A nhưng ID ghi Dạng B (bất đồng); câu 2 nội dung C, ID đúng Dạng C
const file = [
  ex('Tìm tập xác định của hàm số $y=\\sqrt{x-9}$.', code(A)),
  ex('Tìm tập xác định của hàm số $y=\\sqrt{x-8}$.', code(B)),
  ex('Cho hai tập hợp $A=[1;9)$ và $B=(0;5]$. Tìm giao $A\\cap B$.', code(C)),
].join('\n\n');

console.log('Cây hiện tại: đọc ID, kiểm chứng, dựng bản ghi (đường chuẩn)');
const rows = buildRows([{ name: 'de.tex', rel: '', text: file }]);
const latexes = rows.map((r) => r.latex);
const idsA = readIds(latexes, taxA);
ok(rows.length === 3 && idsA.every(Boolean) && idRowsOf(idsA).join() === '0,1,2', 'ba câu đều có ID dùng được theo cây hiện tại');
const sgA = verifierFor(taxA, bank);
const verA = new Map<number, IdVerification>();
for (const i of idRowsOf(idsA)) verA.set(i, verifyId(latexes[i], idsA[i]!.loc, sgA, `d${i}`));
ok(verA.get(0)!.verdict === 'khop' && verA.get(1)!.verdict === 'bat-dong' && verA.get(2)!.verdict === 'khop', 'kiểm chứng: khớp / bất đồng / khớp');
const sumA = summarizeVerify(idRowsOf(idsA), (i) => verA.get(i), () => undefined, () => true);
ok(sumA.unchecked === 0 && sumA.pending === 1, 'không treo; một câu bất đồng chờ quyết định');

console.log('Cây đổi: ID từng hợp lệ thành không hợp lệ');
// bản sao cây: Dạng của câu 1 (Dạng B) và của câu 2 (Dạng C) đổi mã ⇒ ID cũ "không còn trong cây"
const taxB = structuredClone(taxA);
const formsB = taxB.grades.flatMap((x) => x.branches).flatMap((b) => b.chapters).flatMap((c) => c.lessons).flatMap((l) => l.forms);
for (const loc of [B, C]) formsB.find((f) => f.id === loc.formId)!.code = 'Z';
ok(taxRevision(taxB) !== taxRevision(taxA), 'cây mới có dấu phiên bản khác');
setTaxonomy(taxB);

// kết quả đọc CŨ lưu trong dòng của lô (lúc tách tệp theo cây cũ) vẫn còn: chính là nguồn gây lỗi nếu dùng lại
ok(rows.every((r) => !!r.fromId), 'dòng của lô vẫn giữ kết quả đọc cũ (theo cây trước khi đổi)');
const idsB = readIds(latexes, taxB);
ok(!!idsB[0] && idsB[1] === null && idsB[2] === null, 'đọc lại theo cây hiện tại: câu 1 và 2 không còn ID dùng được');
ok(idRowsOf(idsB).join() === '0', 'danh sách cần kiểm chứng chỉ còn câu 0');

// mô phỏng lỗi cũ: danh sách lấy từ kết quả đọc cũ nhưng lượt kiểm bỏ qua ID không còn hợp lệ ⇒ "đang kiểm" treo
{
  const oldRows = rows.map((r, i) => (r.fromId ? i : -1)).filter((i) => i >= 0);
  const sgB0 = verifierFor(taxB, bank);
  const verOld = new Map<number, IdVerification>();
  for (const i of oldRows) { const id = idsB[i]; if (id) verOld.set(i, verifyId(latexes[i], id.loc, sgB0, `d${i}`)); }
  ok(summarizeVerify(oldRows, (i) => verOld.get(i), () => undefined, () => true).unchecked === 2, 'đường cũ (đọc cũ + lượt kiểm bỏ qua) ⇒ 2 câu "đang kiểm" mãi mãi (lỗi cần chặn)');
}

const idRowsB = idRowsOf(idsB);
const sgB = verifierFor(taxB, bank);
const verB = new Map<number, IdVerification>();
for (const i of idRowsB) verB.set(i, verifyId(latexes[i], idsB[i]!.loc, sgB, `d${i}`));
const sumB = summarizeVerify(idRowsB, (i) => verB.get(i), () => undefined, () => true);
ok(sumB.unchecked === 0 && sumB.pending === 0, 'đồng bộ theo cây hiện tại: không câu nào "đang kiểm" treo, không câu bất đồng nào còn chờ');

// quyết định cũ gắn với kết quả kiểm theo cây cũ: không dùng được
const oldDecision = decide(verA.get(1)!, 'goi-y');
const common: Location = at(3);
const tagsOf = () => ['Nguồn: de.tex'];
const plan = planDrafts({ latexes, importing: () => true, ids: idsB, ver: (i) => verB.get(i), decision: () => oldDecision, noIdLoc: () => common, commonLoc: common, commonLevel: 'NB', tags: tagsOf, tax: taxB });
if ('error' in plan) throw new Error(plan.error);
const d = plan.drafts;
ok(d.length === 3 && d[0].formId === A.formId && d[0].level === lvl, 'câu 0 (ID còn hợp lệ): theo đúng ID, mức độ gốc');
ok(d[1].formId === common.formId && d[1].formId !== B.formId, 'câu 1 (ID không còn hợp lệ): vào vị trí đã xác nhận, KHÔNG dùng vị trí đọc cũ');
ok(d[2].formId === common.formId && d[2].formId !== C.formId, 'câu 2 (ID không còn hợp lệ): vào vị trí đã xác nhận, KHÔNG dùng vị trí đọc cũ');
ok(d.every((x) => x.tags[0] === 'Nguồn: de.tex'), 'nhãn nguồn giữ nguyên');

// ghi vào kho (luồng thật qua addMany) và đối chiếu
{
  const disk = { json: null as string | null };
  await initStore({ async load() { return { json: disk.json, recovered: false }; }, async save(j: string) { disk.json = j; } });
  const t0 = getState().questions.length;
  const added = addMany(d);
  ok(getState().questions.length === t0 + 3 && added[1].formId === common.formId && added[2].formId === common.formId && added[0].formId === A.formId, 'kho nhận đúng vị trí theo cây hiện tại');
}

console.log('Đường cũ trước khi đổi cây vẫn đúng (không hồi quy)');
{
  setTaxonomy(taxA);
  const ids = readIds(latexes, taxA);
  const dec = decide(verA.get(1)!, 'goi-y');
  const p = planDrafts({ latexes, importing: () => true, ids, ver: (i) => verA.get(i), decision: (i) => (i === 1 ? dec : undefined), noIdLoc: () => common, commonLoc: common, commonLevel: 'NB', tags: tagsOf, tax: taxA });
  if ('error' in p) throw new Error(p.error);
  ok(p.drafts[0].formId === A.formId && p.drafts[1].formId === A.formId && p.drafts[1].level === lvl && p.drafts[2].formId === C.formId, 'cây chưa đổi: khớp theo ID; bất đồng theo gợi ý và giữ mức độ gốc; khớp theo ID');
  // quyết định cũ (cây A) áp vào kết quả kiểm theo cây B ⇒ không ghi, báo lỗi
  const verStale = { ...verA.get(1)!, taxRev: taxRevision(taxB) };
  const bad = planDrafts({ latexes, importing: (i) => i === 1, ids, ver: () => verStale, decision: () => dec, noIdLoc: () => common, commonLoc: common, commonLevel: 'NB', tags: tagsOf, tax: taxA });
  ok('error' in bad, 'quyết định gắn với phiên bản cây khác ⇒ không dựng bản ghi (không ghi gì)');
}

resetTaxonomy();
if (fail) process.exit(1);
console.log('importplan: đạt hết.');
