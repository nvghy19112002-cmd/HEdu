import { IdSuggester } from './idsuggest';
import { idStatus, readLatexId } from './idsync';
import { addMany, getState, initStore } from './store';
import { decide, evidenceQuestions, isFresh, placeDisputed, summarizeVerify, usableDecision, verificationSig, verifierFor, verifyId, type IdDecision, type IdVerification } from './idverify';
import { buildDefault } from './taxonomy';
import type { Level, Location, Question, ReviewStatus } from './types';
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
const q = (loc: Location, latex: string, review?: ReviewStatus, level: Level = 'TH'): Question => ({ uid: `u${++n}`, seq: n, latex, type: 'tn', level, tags: [], createdAt: 1, updatedAt: 1, ...(review ? { review } : {}), ...loc });
const mkBank = (review?: ReviewStatus): Question[] => {
  const b: Question[] = [];
  for (const [key, loc] of [['A', A], ['B', B], ['C', C]] as const) for (const t of TEXT[key]) for (const k of [3, 4, 7]) b.push(q(loc, ex(t.replace('#', String(k))), review));
  return b;
};
const approved = mkBank('approved');
const before = JSON.stringify(approved);
const s = verifierFor(tax, approved);

const newA = ex('Tìm tập xác định của hàm số $y=\\sqrt{x-9}$.');

console.log('Căn cứ kiểm chứng: chỉ câu ĐÃ DUYỆT');
{
  const vOk = verifyId(newA, A, s, 'k1');
  ok(vOk.verdict === 'khop' && vOk.suggested?.formId === A.formId, 'kho đã duyệt: ID đúng Dạng A ⇒ khớp');
  const vBad = verifyId(newA, B, s, 'k2');
  ok(vBad.verdict === 'bat-dong' && vBad.suggested?.formId === A.formId, 'kho đã duyệt: ID ghi Dạng B nhưng nội dung nhóm A ⇒ bất đồng');
  for (const [label, rv] of [['chưa kiểm tra', undefined], ['cần sửa', 'needs_fix' as ReviewStatus]] as const) {
    const sx = verifierFor(tax, mkBank(rv));
    ok(verifyId(newA, A, sx, 'k').verdict === 'chua-kiem-chung', `kho toàn câu ${label}: ID đúng KHÔNG được xác nhận (chưa kiểm chứng)`);
    const w = verifyId(newA, B, sx, 'k');
    ok(w.verdict === 'chua-kiem-chung' && w.suggested === null, `kho toàn câu ${label}: ID sai KHÔNG bị kết luận bất đồng đáng tin cậy`);
  }
  // kho trộn: câu chưa duyệt nhiều và "kêu" hơn không làm đổi kết luận
  const mixed = [...approved, ...mkBank(undefined).map((x) => ({ ...x, ...B })).slice(0, 9)];
  ok(evidenceQuestions(mixed).length === approved.length, 'evidenceQuestions chỉ giữ câu Đã duyệt');
  ok(verifyId(newA, A, verifierFor(tax, mixed), 'k').verdict === 'khop', 'câu chưa duyệt gán nhầm Dạng B không làm lệch kết luận của câu đã duyệt');
  // chỉ MỘT họ câu đã duyệt: chưa đủ để kết luận bất đồng
  const few = approved.filter((x) => x.formId === A.formId).slice(0, 3);
  ok(verifyId(newA, B, verifierFor(tax, few), 'k').verdict !== 'bat-dong', 'ít câu đã duyệt (một Dạng, vài câu) ⇒ không kết luận bất đồng');
  ok(verifyId(newA, A, verifierFor(tax, []), 'k').verdict === 'chua-kiem-chung', 'ngân hàng trống ⇒ chưa kiểm chứng');
  ok(verifyId(ex('Quần đảo trường sa thuộc tỉnh nào'), A, s, 'k').verdict === 'chua-kiem-chung', 'nội dung lạ ⇒ chưa kiểm chứng');
}

const vBad = verifyId(newA, B, s, 'k2');
const lessonOther = lessons[3];
const bogus: Location = { ...A, formId: 'khong-ton-tai' };

console.log('Mức độ gốc không tự đổi');
{
  const idLevel: Level = 'NB', commonLevel: Level = 'VD';
  const text = newA;
  const base = { text, id: { loc: B, level: idLevel }, ver: vBad, commonLoc: C, commonLevel, tax };
  const goiY = placeDisputed({ ...base, decision: decide(vBad, 'goi-y') });
  ok(goiY.ok && goiY.level === idLevel && goiY.loc.formId === A.formId, 'theo gợi ý, mặc định: ĐỔI Dạng nhưng GIỮ mức độ gốc của ID');
  ok(goiY.ok && readLatexId(goiY.latex, tax).resolved?.level === idLevel && readLatexId(goiY.latex, tax).resolved?.loc.formId === A.formId, 'ID ghi vào LaTeX mang mức độ gốc và Dạng mới');
  const chung = placeDisputed({ ...base, decision: decide(vBad, 'chung') });
  ok(chung.ok && chung.level === idLevel && chung.loc.formId === C.formId, 'vị trí chung, mặc định: giữ mức độ gốc, KHÔNG lấy ô Mức độ chung');
  const lv = placeDisputed({ ...base, decision: decide(vBad, 'goi-y', 'chung') });
  ok(lv.ok && lv.level === commonLevel && readLatexId(lv.latex, tax).resolved?.level === commonLevel, 'chỉ khi giáo viên chọn riêng "đổi theo ô Mức độ chung" thì mức độ mới đổi (cả bản ghi lẫn ID trong LaTeX)');
  const giu = placeDisputed({ ...base, decision: decide(vBad, 'giu', 'chung') });
  ok(giu.ok && giu.latex === text && giu.level === idLevel && giu.loc.formId === B.formId, 'giữ ID ⇒ LaTeX nguyên văn, mức độ và vị trí gốc (lựa chọn mức độ không có tác dụng)');
}

console.log('Quyết định gắn với gợi ý và phiên bản cây đã xem');
{
  const d = decide(vBad, 'goi-y');
  ok(usableDecision(vBad, d) === d, 'quyết định còn hiệu lực với đúng kết quả kiểm đã xem');
  const otherSug: IdVerification = { ...vBad, suggested: { formId: C.formId, location: C } };
  ok(usableDecision(otherSug, d) === undefined, 'gợi ý đổi sang Dạng khác ⇒ quyết định cũ mất hiệu lực, phải chọn lại');
  ok(usableDecision({ ...vBad, taxRev: 'cay-moi' }, d) === undefined, 'cây đổi phiên bản ⇒ phải chọn lại');
  ok(usableDecision({ ...vBad, latex: vBad.latex + ' ' }, d) === undefined, 'câu sửa sau khi chọn ⇒ phải chọn lại');
  ok(usableDecision({ ...vBad, verdict: 'chua-kiem-chung' }, d) === undefined && usableDecision({ ...vBad, verdict: 'khop' }, d) === undefined, 'kết luận không còn là bất đồng ⇒ quyết định cũ không áp dụng');
  ok(usableDecision(vBad, undefined) === undefined, 'chưa chọn ⇒ chưa nhập được');
  ok(usableDecision({ ...vBad, suggested: null }, decide(vBad, 'goi-y')) === undefined, 'không có Dạng gợi ý ⇒ "theo gợi ý" không dùng được');
  ok(verificationSig(vBad) !== verificationSig(otherSug) && verificationSig(vBad) === verificationSig({ ...vBad }), 'dấu kết quả kiểm: đổi gợi ý ⇒ đổi dấu; cùng kết quả ⇒ cùng dấu');
  // kho đổi (thêm câu đã duyệt) làm gợi ý đổi ⇒ dấu đổi ⇒ quyết định cũ bị bỏ
  const extra = TEXT.A.flatMap((t) => [11, 12, 13].map((k) => q(C, ex(t.replace('#', String(k))), 'approved')));
  const vAfter = verifyId(newA, B, verifierFor(tax, [...approved, ...extra]), 'k2');
  ok(verificationSig(vAfter) !== verificationSig(vBad) ? usableDecision(vAfter, d) === undefined : true, 'kho đổi làm kết quả kiểm đổi ⇒ quyết định cũ không còn dùng được');
  ok(isFresh(vBad, vBad.latex, vBad.taxRev) && !isFresh(vBad, vBad.latex + ' ', vBad.taxRev) && !isFresh(vBad, vBad.latex, 'khac') && !isFresh(undefined, 'x', 'y'), 'kết quả cũ hết hạn khi câu sửa hoặc cây đổi');
}

console.log('Kiểm tra hợp lệ ngay trước khi ghi');
{
  const base = { text: newA, id: { loc: B, level: 'TH' as Level }, ver: vBad, commonLoc: C, commonLevel: 'TH' as Level, tax };
  ok(!placeDisputed({ ...base, decision: undefined }).ok, 'không có quyết định ⇒ KHÔNG ghi');
  const stale = placeDisputed({ ...base, ver: { ...vBad, taxRev: 'cay-moi' }, decision: decide(vBad, 'goi-y') });
  ok(!stale.ok, 'quyết định gắn với phiên bản cây cũ ⇒ KHÔNG ghi');
  const badTarget = placeDisputed({ ...base, ver: { ...vBad, suggested: { formId: bogus.formId, location: bogus } }, decision: decide({ ...vBad, suggested: { formId: bogus.formId, location: bogus } }, 'goi-y') });
  ok(!badTarget.ok && /ghi được|đường dẫn|ID/.test(badTarget.reason), 'Dạng đích không còn hợp lệ trong cây ⇒ lỗi, KHÔNG lưu vị trí mà thiếu ID (quy tắc 10)');
  const badCommon = placeDisputed({ ...base, commonLoc: bogus, decision: decide(vBad, 'chung') });
  ok(!badCommon.ok, 'vị trí chung hỏng ⇒ lỗi, không âm thầm giữ LaTeX cũ');
  const badId = placeDisputed({ ...base, id: { loc: bogus, level: 'TH' }, decision: decide(vBad, 'giu') });
  ok(!badId.ok, 'giữ ID nhưng ID không còn đúng đường dẫn cây ⇒ lỗi');
  const twoIds = ex('X').replace('\\begin{ex}', '\\begin{ex}%[2D1H1-1]%[2D1H1-2]');
  ok(!placeDisputed({ ...base, text: twoIds, decision: decide(vBad, 'goi-y') }).ok, 'LaTeX nhiều ID mâu thuẫn ⇒ không ghi đè lặng lẽ');
}

console.log('Luồng ghi vào ngân hàng');
{
  const disk = { json: null as string | null };
  await initStore({ async load() { return { json: disk.json, recovered: false }; }, async save(j: string) { disk.json = j; } });
  const t0 = getState().questions.length;
  const idLevel: Level = 'NB';
  const text = newA;
  const common = { commonLoc: C, commonLevel: 'VD' as Level, tax };
  const pg = placeDisputed({ text, id: { loc: B, level: idLevel }, ver: vBad, decision: decide(vBad, 'goi-y'), ...common });
  const pk = placeDisputed({ text, id: { loc: B, level: idLevel }, ver: vBad, decision: decide(vBad, 'giu'), ...common });
  if (!pg.ok || !pk.ok) throw new Error('đáng lẽ ghi được');
  const added = addMany([
    { latex: pg.latex, level: pg.level, tags: [], ...pg.loc },
    { latex: pk.latex, level: pk.level, tags: [], ...pk.loc },
  ]);
  const [qg, qk] = added;
  ok(getState().questions.length === t0 + 2, 'ghi đúng hai câu');
  ok(qg.level === idLevel && qg.formId === A.formId && idStatus(qg, tax).state === 'khop', 'câu theo gợi ý: Dạng mới, mức độ gốc, ID trong LaTeX khớp vị trí đã lưu');
  ok(qk.level === idLevel && qk.formId === B.formId && qk.latex === text, 'câu giữ ID: LaTeX byte-y-nguyên, vị trí và mức độ gốc');
  // một câu trong lô không ghi được nhất quán ⇒ cả lô không được ghi (như commit: dựng hết rồi mới addMany)
  const plans = [pg, placeDisputed({ text, id: { loc: B, level: idLevel }, ver: vBad, decision: decide(vBad, 'chung'), ...common, commonLoc: bogus })];
  const t1 = getState().questions.length;
  if (plans.every((p) => p.ok)) addMany(plans.map((p) => (p.ok ? { latex: p.latex, level: p.level, tags: [], ...p.loc } : (null as never))));
  ok(getState().questions.length === t1, 'có một câu không ghi được nhất quán ⇒ không ghi câu nào của lô');
}

console.log('Tổng hợp');
{
  const vOk = verifyId(newA, A, s, 'k1');
  const dGiu = decide(vBad, 'giu');
  const vers: Record<number, IdVerification | undefined> = { 0: vOk, 1: vBad, 2: vOk, 3: vBad, 4: undefined };
  const decs: Record<number, IdDecision | undefined> = { 3: dGiu };
  const sum = summarizeVerify([0, 1, 2, 3, 4], (i) => vers[i], (i) => decs[i], (i) => i !== 2);
  ok(sum.total === 4 && sum.khop === 1 && sum.batDong === 2 && sum.pending === 1 && sum.unchecked === 1, `tổng hợp đúng: ${JSON.stringify(sum)}`);
  const stale = summarizeVerify([3], () => ({ ...vBad, taxRev: 'moi' }), () => dGiu, () => true);
  ok(stale.pending === 1, 'quyết định cũ với cây đã đổi tính là chưa chọn');
  void lessonOther; void IdSuggester;
}

ok(JSON.stringify(approved) === before, 'kiểm chứng không sửa gì trong ngân hàng');

if (fail) process.exit(1);
console.log('idverify: đạt hết.');
