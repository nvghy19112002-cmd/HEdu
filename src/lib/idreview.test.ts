import { _resetReview, dropRec, effectiveOf, freezeIdReview, idReviewForBackup, restoreIdReview, setRecRaw, type Effective, flushIdReview, getRec, isEvidence, loadIdReview, makeRec, parseReview, putRecs, reviewCount, type Backend, type ReviewRec } from './idreview';
import { addMany, exportBackup, getState, importBackup, initStore } from './store';
import { planDrafts } from './importplan';
import { strictCode } from './idsync';
import { writeHeadId } from './idtex';
import { decide, evidenceQuestions, verifierFor, verifyId } from './idverify';
import { buildDefault, indexOf } from './taxonomy';
import { taxRevision } from './taxpath';
import type { Level, Location, Question, ReviewStatus } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const tax = buildDefault();
const ix = indexOf(tax);
const rev = taxRevision(tax);
const ctx = { ix, taxRev: rev };
const g = tax.grades.find((x) => x.branches.flatMap((b) => b.chapters).flatMap((c) => c.lessons).length >= 4)!;
const lessons = g.branches.flatMap((b) => b.chapters.map((c) => ({ c, ls: c.lessons }))).flatMap(({ c, ls }) => ls.map((l) => ({ c, l })));
const at = (i: number): Location => ({ grade: g.grade, chapterId: lessons[i].c.id, lessonId: lessons[i].l.id, formId: lessons[i].l.forms[0].id });
const A = at(0), B = at(1), C = at(2), D = at(3);
const ex = (body: string, id?: string) => `\\begin{ex}${id ? `%[${id}]` : ''}\n${body}\n\\choice{\\True $1$}{$2$}{$3$}{$4$}\n\\loigiai{}\n\\end{ex}`;
let n = 0;
const q = (loc: Location, latex: string, review?: ReviewStatus, level: Level = 'TH'): Question => ({ uid: `u${++n}`, seq: n, latex, type: 'tn', level, tags: [], createdAt: 1, updatedAt: 1, ...(review ? { review } : {}), ...loc });
const mk = (qq: Question, o: Partial<Parameters<typeof makeRec>[1]> = {}) => makeRec(qq, { form: 'may', src: 'tep', taxRev: rev, ...o });

console.log('Hiệu lực của trạng thái');
{
  const base = q(A, ex('Tìm tập xác định của hàm số $y=\\sqrt{x-9}$.'));
  ok(effectiveOf(base, undefined, ctx).form === 'chua' && effectiveOf(base, undefined, ctx).level === 'chua', 'không có bản ghi ⇒ chưa xác minh');
  const rMay = mk(base);
  ok(effectiveOf(base, rMay, ctx).form === 'may', 'có bản ghi còn hợp lệ ⇒ giữ trạng thái');
  ok(effectiveOf({ ...base, latex: base.latex.replace('x-9', 'x-8') }, rMay, ctx).form === 'chua', 'nội dung đổi ⇒ hết hiệu lực');
  ok(effectiveOf({ ...base, ...B }, rMay, ctx).form === 'chua', 'Dạng của câu bị đổi ⇒ hết hiệu lực');
  ok(effectiveOf({ ...base, level: 'VD' }, mk(base, { level: 'gv' }), ctx).level === 'chua', 'mức độ của câu bị đổi ⇒ trạng thái mức độ hết hiệu lực');
  // thêm/đổi %[ID] không làm câu thành "đã sửa"
  const withId = writeHeadId(base.latex, '2D1H1-1', 'them');
  ok(withId.action === 'them' && effectiveOf({ ...base, latex: withId.latex }, rMay, ctx).form === 'may', 'HEdu thêm %[ID] vào LaTeX ⇒ trạng thái vẫn còn hiệu lực');
  const taxB = structuredClone(tax);
  const ctxB = { ix: indexOf(taxB), taxRev: taxRevision(taxB) };
  taxB.name = taxB.name + ' (đổi)';
  ok(taxRevision(taxB) !== rev, 'cây mới có dấu khác');
  const ctxB2 = { ix: indexOf(taxB), taxRev: taxRevision(taxB) };
  ok(effectiveOf(base, rMay, ctxB2).form === 'chua', 'máy phân loại theo cây cũ ⇒ hết hiệu lực khi cây đổi');
  ok(effectiveOf(base, mk(base, { form: 'gv', src: 'tay' }), ctxB2).form === 'gv', 'giáo viên xác minh KHÔNG hết hiệu lực chỉ vì cây đổi (khi đường dẫn còn đúng)');
  const taxC = structuredClone(tax);
  const lesC = taxC.grades.flatMap((x) => x.branches).flatMap((b) => b.chapters).flatMap((c) => c.lessons);
  const les = lesC.find((l) => l.id === A.lessonId)!; les.forms = les.forms.filter((f) => f.id !== A.formId);
  ok(effectiveOf(base, mk(base, { form: 'gv', src: 'tay' }), { ix: indexOf(taxC), taxRev: taxRevision(taxC) }).form === 'xem-lai', 'Dạng đã xác minh nhưng đường dẫn không còn trong cây ⇒ cần xem lại');
  void ctxB;
  ok(effectiveOf(base, mk(base, { form: 'gv', src: 'tay', unclassified: true }), ctx).unclassified === false, 'đã giáo viên xác minh ⇒ không còn là chưa phân loại');
  ok(effectiveOf(base, mk(base, { form: 'chua', src: 'tay', unclassified: true }), ctx).unclassified === true, 'câu chưa phân loại giữ cờ');
}

console.log('Căn cứ kiểm chứng');
{
  const mkBank = (review: ReviewStatus | undefined, loc: Location, texts: string[]) => texts.flatMap((t) => [3, 4, 7].map((k) => q(loc, ex(t.replace('#', String(k))), review)));
  const TA = ['Tìm tập xác định của hàm số $y=\\sqrt{x-#}$.', 'Hàm số $y=\\dfrac{1}{x-#}$ xác định khi nào? Chọn tập xác định đúng.', 'Tập xác định $D$ của hàm số $y=\\sqrt{#-x}+\\dfrac{1}{x}$ là'];
  const TB = ['Gieo một con xúc xắc cân đối, tính xác suất xuất hiện mặt # chấm.', 'Rút ngẫu nhiên một thẻ trong hộp có # thẻ đánh số, tính xác suất rút được thẻ số chẵn.', 'Chọn ngẫu nhiên hai bạn trong lớp có # học sinh, tính xác suất cả hai là nữ.'];
  const a = mkBank(undefined, A, TA), b = mkBank(undefined, B, TB);
  const all = [...a, ...b];
  const effNone = () => effectiveOf(all[0], undefined, ctx);
  ok(evidenceQuestions(all, effNone).length === 0, 'câu chưa duyệt và chưa xác minh ⇒ không phải căn cứ');
  // "máy phân loại" KHÔNG phải căn cứ
  const recs = new Map<string, ReviewRec>(all.map((x) => [x.uid, mk(x, { form: 'may' })]));
  const eff = (x: Question) => effectiveOf(x, recs.get(x.uid), ctx);
  ok(evidenceQuestions(all, eff).length === 0, 'Dạng "máy phân loại" ⇒ không phải căn cứ');
  // giáo viên xác minh ⇒ căn cứ
  for (const x of all) recs.set(x.uid, mk(x, { form: 'gv', src: 'tay' }));
  ok(evidenceQuestions(all, eff).length === all.length, 'Dạng "giáo viên xác minh" ⇒ căn cứ (dù nội dung chưa duyệt)');
  // cần xem lại / chưa phân loại bị loại
  recs.set(a[0].uid, mk(a[0], { form: 'xem-lai', src: 'soat' }));
  recs.set(a[1].uid, mk(a[1], { form: 'chua', src: 'tay', unclassified: true }));
  ok(evidenceQuestions(all, eff).length === all.length - 2, 'câu cần xem lại và câu chưa phân loại bị loại khỏi căn cứ');
  const approvedUnclassified = { ...a[2], review: 'approved' as ReviewStatus };
  ok(!isEvidence(approvedUnclassified, { form: 'chua', level: 'chua', unclassified: true }), 'Đã duyệt nhưng chưa phân loại ⇒ không phải căn cứ');
  ok(!isEvidence({ ...a[2], review: 'approved' }, { form: 'chua', level: 'chua', unclassified: false }), 'Đã duyệt (nội dung) mà Dạng chưa xác minh ⇒ KHÔNG phải căn cứ (chỉ để tham khảo)');
  ok(!isEvidence({ ...a[2], review: 'approved' }, { form: 'may', level: 'may', unclassified: false }), 'Đã duyệt + máy phân loại ⇒ vẫn không phải căn cứ');
  ok(isEvidence({ ...a[2], review: 'needs_fix' }, { form: 'gv', level: 'chua', unclassified: false }), 'Dạng giáo viên xác minh là căn cứ dù nội dung đang cần sửa (hai việc riêng)');
  // kết luận kiểm chứng đi theo đúng căn cứ
  const sg = verifierFor(tax, all, eff);
  const nA = ex('Tìm tập xác định của hàm số $y=\\sqrt{x-9}$.');
  ok(verifyId(nA, A, sg, 'k').verdict === 'khop' && verifyId(nA, B, sg, 'k').verdict === 'bat-dong', 'căn cứ giáo viên xác minh ⇒ khớp / bất đồng');
  const sgMay = verifierFor(tax, all, () => effectiveOf(all[0], mk(all[0], { form: 'may' }), ctx));
  ok(verifyId(nA, B, sgMay, 'k').verdict === 'chua-kiem-chung', 'chỉ có "máy phân loại" ⇒ không kết luận bất đồng');
}

console.log('Trạng thái ghi lúc nhập (planDrafts)');
{
  const code = (loc: Location, lv: Level) => { const s = strictCode(loc, lv, tax); if (!s.ok) throw new Error('mã'); return s.code; };
  const mkBank = (loc: Location, texts: string[]) => texts.flatMap((t) => [3, 4, 7].map((k) => q(loc, ex(t.replace('#', String(k))), 'approved')));
  const gvE = (): Effective => ({ form: 'gv', level: 'chua', unclassified: false });
  const TA = ['Tìm tập xác định của hàm số $y=\\sqrt{x-#}$.', 'Hàm số $y=\\dfrac{1}{x-#}$ xác định khi nào? Chọn tập xác định đúng.', 'Tập xác định $D$ của hàm số $y=\\sqrt{#-x}+\\dfrac{1}{x}$ là'];
  const TB = ['Gieo một con xúc xắc cân đối, tính xác suất xuất hiện mặt # chấm.', 'Rút ngẫu nhiên một thẻ trong hộp có # thẻ đánh số, tính xác suất rút được thẻ số chẵn.', 'Chọn ngẫu nhiên hai bạn trong lớp có # học sinh, tính xác suất cả hai là nữ.'];
  const bank = [...mkBank(A, TA), ...mkBank(B, TB)];
  const sg = verifierFor(tax, bank, gvE);
  const latexes = [
    ex('Tìm tập xác định của hàm số $y=\\sqrt{x-9}$.', code(A, 'NB')),          // 0: ID khớp
    ex('Tìm tập xác định của hàm số $y=\\sqrt{x-8}$.', code(B, 'NB')),          // 1: bất đồng, giữ
    ex('Tìm tập xác định của hàm số $y=\\sqrt{x-7}$.', code(B, 'NB')),          // 2: bất đồng, theo gợi ý
    ex('Tìm tập xác định của hàm số $y=\\sqrt{x-6}$.', code(B, 'NB')),          // 3: bất đồng, chưa phân loại
    ex('Một bài toán quỹ tích rất khác với hình tròn nội tiếp tam giác.', code(C, 'NB')), // 4: chưa kiểm chứng
    ex('Gieo hai con xúc xắc, tính xác suất tổng bằng 7.'),                    // 5: không ID, nhận gợi ý
    ex('Bài toán hoàn toàn không rõ thuộc Dạng nào cả.'),                      // 6: không ID, vị trí chung
  ];
  const ids = [A, B, B, B, C].map((l) => ({ loc: l, level: 'NB' as Level }));
  const ver = (i: number) => (i < 5 ? verifyId(latexes[i], ids[i].loc, sg, `d${i}`) : undefined);
  ok(ver(0)!.verdict === 'khop' && ver(1)!.verdict === 'bat-dong' && ver(4)!.verdict === 'chua-kiem-chung', 'đầu vào đúng như dự kiến (khớp / bất đồng / chưa kiểm chứng)');
  const decs = { 1: decide(ver(1)!, 'giu'), 2: decide(ver(2)!, 'goi-y'), 3: decide(ver(3)!, 'chung') } as Record<number, ReturnType<typeof decide>>;
  const common = D;
  const r = planDrafts({
    latexes, importing: () => true, ids: [...ids, null, null], ver, decision: (i) => decs[i],
    noId: (i) => (i === 5 ? { loc: B, suggested: true } : { loc: common, suggested: false }), commonLoc: common, commonLevel: 'TH', tags: () => [], tax,
  });
  if ('error' in r) throw new Error(r.error);
  const m = r.meta, d = r.drafts;
  ok(m[0].form === 'may' && m[0].src === 'tep' && !m[0].unclassified, 'ID khớp ngân hàng ⇒ Dạng "máy phân loại" (nguồn: tệp), chưa phải giáo viên xác minh');
  ok(m[1].form === 'chua' && m[1].src === 'tep' && !m[1].unclassified && d[1].latex === latexes[1].trim(), 'bất đồng, giữ ID ⇒ chưa xác minh, LaTeX nguyên văn');
  ok(m[2].form === 'may' && m[2].src === 'goi-y' && d[2].formId === A.formId, 'bất đồng, theo gợi ý ⇒ máy phân loại, đúng Dạng gợi ý');
  ok(m[3].unclassified && m[3].form === 'chua' && d[3].latex === latexes[3].trim() && d[3].formId === common.formId, 'bất đồng, chưa phân loại ⇒ vị trí chung, LaTeX nguyên văn, đánh dấu chưa phân loại');
  ok(m[4].form === 'chua' && m[4].src === 'tep', 'ID chưa kiểm chứng ⇒ chưa xác minh');
  ok(m[5].form === 'may' && m[5].src === 'goi-y' && /%\[/.test(d[5].latex) && d[5].formId === B.formId, 'không ID, nhận gợi ý ⇒ máy phân loại và ghi ID theo gợi ý');
  ok(m[6].unclassified && d[6].latex === latexes[6].trim() && !/%\[/.test(d[6].latex), 'không ID, vị trí chung ⇒ chưa phân loại, KHÔNG ghi ID giả vào LaTeX');
  ok(m.every((x) => x.form !== 'gv' as string), 'không câu nào tự thành "giáo viên xác minh"');
  // bản ghi dựng từ meta
  const q6 = q(d[6], d[6].latex);
  const rec6 = makeRec(q6, { form: m[6].form, src: m[6].src, taxRev: rev, unclassified: m[6].unclassified });
  ok(effectiveOf(q6, rec6, ctx).unclassified, 'bản ghi chưa phân loại đọc lại đúng');
}

console.log('Tệp phụ: đọc, ghi, lỗi');
{
  const disk = { json: null as string | null, failSave: false };
  const be: Backend = { async load() { return disk.json; }, async save(j) { if (disk.failSave) throw new Error('đĩa đầy'); disk.json = j; } };
  _resetReview(be);
  ok((await loadIdReview()).ok && reviewCount() === 0, 'tệp chưa có ⇒ rỗng, đọc được');
  const x = q(A, ex('X'));
  putRecs([[x.uid, mk(x, { form: 'gv', src: 'tay' })]]);
  ok(await flushIdReview() && disk.json !== null, 'ghi tệp phụ thành công');
  _resetReview(be);
  await loadIdReview();
  ok(getRec(x.uid)?.form === 'gv', 'đọc lại đúng bản ghi sau khi mở lại');
  disk.failSave = true;
  putRecs([[x.uid, mk(x, { form: 'xem-lai', src: 'soat' })]]);
  ok(!(await flushIdReview()), 'ghi lỗi ⇒ trả false (không ném lỗi)');
  disk.failSave = false;
  dropRec(x.uid);
  ok(await flushIdReview() && getRec(x.uid) === undefined, 'xoá bản ghi');
  // tệp hỏng: không đọc được ⇒ KHÔNG ghi đè
  disk.json = '{"v":9,"recs":1}';
  _resetReview(be);
  const bad = await loadIdReview();
  putRecs([[x.uid, mk(x)]]);
  ok(!bad.ok && !(await flushIdReview()) && disk.json === '{"v":9,"recs":1}', 'tệp có cấu trúc lạ ⇒ không ghi đè tệp mình không đọc được');
  // dòng hỏng bị bỏ qua, dòng tốt giữ lại
  const m = parseReview(JSON.stringify({ v: 1, recs: { a: mk(x), b: { form: 'zzz' }, c: 5 } }));
  ok(m.size === 1 && m.has('a'), 'bản ghi hỏng bị bỏ qua, bản ghi tốt giữ lại');
  _resetReview(null);
}

console.log('Lịch sử quyết định và ID nguyên bản');
{
  const disk = { json: null as string | null };
  const be: Backend = { async load() { return disk.json; }, async save(j) { disk.json = j; } };
  _resetReview(be);
  await loadIdReview();
  const x = q(A, ex('Y'));
  putRecs([[x.uid, mk(x, { form: 'xem-lai', src: 'tep', orig: '2D1N1-1', prop: B.formId, why: 'bất đồng', at: 1 })]]);
  putRecs([[x.uid, mk(x, { form: 'gv', src: 'tay', at: 2 })]]);
  putRecs([[x.uid, mk(x, { form: 'chua', level: 'chua', src: 'tay', at: 3 })]]);
  const r = getRec(x.uid)!;
  ok(r.form === 'chua' && (r.hist?.length ?? 0) === 2 && r.hist![0].form === 'gv' && r.hist![1].form === 'xem-lai' && r.hist![1].why === 'bất đồng', 'đổi trạng thái nhiều lần (kể cả "Bỏ xác nhận") ⇒ lịch sử vẫn đủ, mới nhất trước');
  ok(r.orig === '2D1N1-1', 'ID nguyên bản trong tệp được giữ qua các lần đổi trạng thái');
  for (let i = 0; i < 40; i++) putRecs([[x.uid, mk(x, { form: i % 2 ? 'gv' : 'chua', src: 'tay', at: 10 + i })]]);
  ok(getRec(x.uid)!.hist!.length === 30, 'lịch sử có giới hạn (30 mục)');
  await flushIdReview();
  _resetReview(be); await loadIdReview();
  ok(getRec(x.uid)!.hist!.length === 30 && getRec(x.uid)!.orig === '2D1N1-1', 'lịch sử và ID nguyên bản đọc lại đúng sau khi mở lại');
  const before = getRec(x.uid)!;
  putRecs([[x.uid, mk(x, { form: 'gv', src: 'tay', at: 999 })]]);
  setRecRaw(x.uid, before);
  ok(getRec(x.uid) === before, 'hoàn tác đặt lại nguyên bản ghi (không thêm vào lịch sử)');
  setRecRaw(x.uid, undefined);
  ok(getRec(x.uid) === undefined, 'hoàn tác về "chưa có bản ghi"');
  _resetReview(null);
}

console.log('Sao lưu/khôi phục trạng thái xác nhận');
{
  const disk = { json: null as string | null };
  const be: Backend = { async load() { return disk.json; }, async save(j) { disk.json = j; } };
  _resetReview(be);
  await loadIdReview();
  const qa = q(A, ex('Bản sao lưu A')), qb = q(B, ex('Bản sao lưu B'));
  putRecs([[qa.uid, mk(qa, { form: 'gv', src: 'tay', at: 10 })], [qb.uid, mk(qb, { form: 'may', src: 'tep', at: 10 })]]);
  const file = JSON.parse(JSON.stringify(idReviewForBackup()));
  ok(file.v === 1 && Object.keys(file.recs).length === 2, 'phần trạng thái xác minh đưa được vào file sao lưu JSON');
  // máy khác (trống): khôi phục đủ
  _resetReview({ async load() { return null; }, async save() { /* trống */ } });
  await loadIdReview();
  const r1 = await restoreIdReview(file);
  ok(r1.added === 2 && r1.saved && getRec(qa.uid)?.form === 'gv', 'khôi phục vào nơi trống ⇒ đủ trạng thái');
  // GỘP: không xoá thứ đang có; trùng khoá thì giữ bản MỚI hơn
  putRecs([[qa.uid, mk(qa, { form: 'xem-lai', src: 'soat', at: 50 })]]);
  const r2 = await restoreIdReview(file);
  ok(r2.added === 0 && getRec(qa.uid)?.form === 'xem-lai', 'bản đang có mới hơn file sao lưu ⇒ giữ bản đang có');
  const qc = q(C, ex('Chỉ có ở máy hiện tại'));
  putRecs([[qc.uid, mk(qc, { form: 'gv', src: 'tay', at: 60 })]]);
  await restoreIdReview(file);
  ok(getRec(qc.uid)?.form === 'gv', 'khôi phục không xoá bản ghi chỉ có ở máy hiện tại');
  const r3 = await restoreIdReview(undefined);
  const r4 = await restoreIdReview({ v: 2, recs: {} });
  ok(r3.added === 0 && r4.added === 0, 'file sao lưu cũ (không có phần trạng thái xác minh) ⇒ bỏ qua, mọi thứ giữ nguyên');
  // đi qua exportBackup / importBackup thật của kho
  const disk2 = { json: null as string | null };
  await initStore({ async load() { return { json: disk2.json, recovered: false }; }, async save(j: string) { disk2.json = j; } });
  const added = addMany([{ latex: ex('Sao lưu thật'), level: 'TH', tags: [], ...A }]);
  _resetReview(be); await loadIdReview();
  putRecs([[added[0].uid, makeRec(added[0], { form: 'gv', src: 'tay', taxRev: rev })]]);
  const backup = exportBackup();
  const parsed = JSON.parse(backup);
  ok(parsed.idReview?.recs?.[added[0].uid]?.form === 'gv' && parsed.dupSidecar && Array.isArray(parsed.questions), 'exportBackup mang theo câu hỏi, quyết định trùng VÀ trạng thái xác minh');
  _resetReview({ async load() { return null; }, async save() { /* máy mới */ } });
  await loadIdReview();
  importBackup(backup);
  await new Promise((r) => setTimeout(r, 30));
  ok(getRec(added[0].uid)?.form === 'gv', 'importBackup khôi phục trạng thái xác minh cùng với câu hỏi');
  const old = JSON.parse(backup); delete old.idReview;
  _resetReview({ async load() { return null; }, async save() { /* máy mới */ } });
  await loadIdReview();
  importBackup(JSON.stringify(old));
  await new Promise((r) => setTimeout(r, 30));
  ok(getRec(added[0].uid) === undefined && getState().questions.length === old.questions.length, 'file sao lưu cũ (không có idReview) vẫn khôi phục được câu hỏi; trạng thái là "chưa xác minh"');
  _resetReview(null);
}

console.log('Ghi nốt và khoá khi thay dữ liệu');
{
  const disk = { json: null as string | null, saves: 0 };
  const be: Backend = { async load() { return disk.json; }, async save(j) { disk.saves++; disk.json = j; } };
  _resetReview(be); await loadIdReview();
  const x = q(A, ex('Khoá'));
  ok(await flushIdReview() && disk.saves === 0, 'không có thay đổi ⇒ coi như đã ghi, không ghi thừa');
  putRecs([[x.uid, mk(x, { form: 'gv', src: 'tay' })]]);
  ok(await flushIdReview() && disk.saves === 1, 'có thay đổi ⇒ ghi một lần');
  // thay cả tệp dữ liệu (khôi phục .db): bản trong bộ nhớ không được đè lên bản vừa khôi phục
  putRecs([[x.uid, mk(x, { form: 'xem-lai', src: 'soat' })]]);
  freezeIdReview();
  await new Promise((r) => setTimeout(r, 600));
  const restored = '{"v":1,"recs":{}}';
  disk.json = restored; // mô phỏng Rust vừa thay tệp .db bằng bản khôi phục
  const saves0 = disk.saves;
  putRecs([[x.uid, mk(x, { form: 'gv', src: 'tay' })]]);
  await new Promise((r) => setTimeout(r, 600));
  ok(disk.json === restored && disk.saves === saves0, 'sau khi khoá, không ghi đè lên tệp vừa khôi phục (kể cả khi hẹn giờ ghi trễ đã chạy)');
  // tệp phụ bị chặn ghi (đọc không được) nhưng không có thay đổi: không chặn cập nhật/khôi phục
  disk.json = '{"v":9,"recs":1}';
  _resetReview(be);
  await loadIdReview();
  ok(await flushIdReview(), 'tệp trạng thái hỏng và không có gì để ghi ⇒ không chặn việc cập nhật/khôi phục');
  _resetReview(null);
}

if (fail) process.exit(1);
console.log('idreview: đạt hết.');
