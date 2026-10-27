// Hàng đợi xác minh từng câu — kiểm bằng đúng luồng ghi: kho (addMany/updateMany) + tệp phụ id-review + hoàn tác + tác động tới kiểm chứng ID.
import { _resetReview, effectiveOf, getRec, loadIdReview, putRecs, makeRec, type Backend } from './idreview';
import { strictCode } from './idsync';
import { readHead } from './idtex';
import { addMany, flushSave, getState, initStore } from './store';
import { applyQueueAction, queueUids, scopeCounts, scopeOf, undoQueueAction, type QueueCtx } from './verifyqueue';
import { evidenceQuestions, verifierFor, verifyId } from './idverify';
import { buildDefault, indexOf } from './taxonomy';
import { taxRevision } from './taxpath';
import type { Level, Location, Question } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const tax = buildDefault();
const ix = indexOf(tax);
const rev = taxRevision(tax);
const ctx: QueueCtx = { tax, ix, taxRev: rev };
const g = tax.grades.find((x) => x.branches.flatMap((b) => b.chapters).flatMap((c) => c.lessons).length >= 4)!;
const lessons = g.branches.flatMap((b) => b.chapters.map((c) => ({ c, ls: c.lessons }))).flatMap(({ c, ls }) => ls.map((l) => ({ c, l })));
const at = (i: number): Location => ({ grade: g.grade, chapterId: lessons[i].c.id, lessonId: lessons[i].l.id, formId: lessons[i].l.forms[0].id });
const A = at(0), B = at(1), C = at(2);
const code = (loc: Location, lv: Level) => { const s = strictCode(loc, lv, tax); if (!s.ok) throw new Error('mã'); return s.code; };
const ex = (body: string, id?: string) => `\\begin{ex}${id ? `%[${id}]` : ''}\n${body}\n\\choice{\\True $1$}{$2$}{$3$}{$4$}\n\\loigiai{}\n\\end{ex}`;

const disk = { json: null as string | null, failSave: false };
const be: Backend = { async load() { return disk.json; }, async save(j) { if (disk.failSave) throw new Error('đĩa đầy'); disk.json = j; } };
const dstore = { json: null as string | null, fail: false };
await initStore({ async load() { return { json: dstore.json, recovered: false }; }, async save(j: string) { if (dstore.fail) throw new Error('đĩa đầy'); dstore.json = j; } });
_resetReview(be);
await loadIdReview();
const eff = (q: Question) => effectiveOf(q, getRec(q.uid), { ix, taxRev: rev });
const cur = (uid: string) => getState().questions.find((x) => x.uid === uid)!;

const TA = ['Tìm tập xác định của hàm số $y=\\sqrt{x-#}$.', 'Hàm số $y=\\dfrac{1}{x-#}$ xác định khi nào? Chọn tập xác định đúng.', 'Tập xác định $D$ của hàm số $y=\\sqrt{#-x}+\\dfrac{1}{x}$ là'];
// 9 câu nhóm A đặt ở Dạng B (gán nhầm) + câu cần xử lý
const wrong = TA.flatMap((t) => [3, 4, 7].map((k) => ({ ...B, latex: ex(t.replace('#', String(k)), code(B, 'TH')), level: 'TH' as Level, tags: [] })));
const added = addMany(wrong);
const one = added[5]; // câu chưa từng có bản ghi nào

console.log('Phân nhóm và thứ tự hàng đợi');
{
  const qs = added.slice(0, 5);
  putRecs([
    [qs[0].uid, makeRec(qs[0], { form: 'xem-lai', src: 'tep', taxRev: rev })],
    [qs[1].uid, makeRec(qs[1], { form: 'chua', src: 'tay', taxRev: rev, unclassified: true })],
    [qs[2].uid, makeRec(qs[2], { form: 'may', src: 'tep', taxRev: rev })],
    [qs[3].uid, makeRec(qs[3], { form: 'gv', src: 'tay', taxRev: rev })],
  ]);
  ok(scopeOf(eff(qs[0])) === 'can-xem' && scopeOf(eff(qs[1])) === 'chua-phan-loai' && scopeOf(eff(qs[2])) === 'may' && scopeOf(eff(qs[3])) === null && scopeOf(eff(qs[4])) === 'chua', 'mỗi câu thuộc đúng một nhóm; câu giáo viên đã xác minh không vào hàng đợi');
  const order = queueUids(qs, eff, 'tat-ca');
  ok(order.join() === [qs[0], qs[1], qs[2], qs[4]].map((x) => x.uid).join(), 'thứ tự: cần xem lại → chưa phân loại → máy → chưa xác minh');
  ok(queueUids(qs, eff, 'may').join() === qs[2].uid, 'lọc theo nhóm');
  const c = scopeCounts(qs, eff);
  ok(c['can-xem'] === 1 && c['chua-phan-loai'] === 1 && c.may === 1 && c.chua === 1 && c['tat-ca'] === 4, 'đếm theo nhóm');
  // dọn để các phần sau bắt đầu từ trạng thái sạch
  for (const x of qs) putRecs([[x.uid, makeRec(x, { form: 'chua', src: 'tay', taxRev: rev })]]);
}

console.log('Xác nhận Dạng / mức độ / cần xem lại');
{
  const v0 = disk.json;
  const r = await applyQueueAction(one.uid, { kind: 'xac-nhan-dang' }, ctx);
  ok(r.ok && eff(cur(one.uid)).form === 'gv' && disk.json !== v0, 'xác nhận Dạng ⇒ giáo viên xác minh, ghi xuống tệp phụ');
  ok(cur(one.uid).latex === one.latex && cur(one.uid).formId === B.formId, 'xác nhận Dạng không đổi câu (LaTeX, vị trí nguyên văn)');
  const m = await applyQueueAction(one.uid, { kind: 'xac-nhan-muc-do' }, ctx);
  ok(m.ok && eff(cur(one.uid)).level === 'gv' && eff(cur(one.uid)).form === 'gv', 'xác nhận mức độ riêng, Dạng giữ nguyên trạng thái');
  ok(cur(one.uid).review === undefined, 'hàng đợi không đổi trạng thái duyệt nội dung');
  const n = await applyQueueAction(one.uid, { kind: 'can-xem-lai' }, ctx);
  ok(n.ok && eff(cur(one.uid)).form === 'xem-lai', 'đánh dấu cần xem lại');
  const hist = getRec(one.uid)!.hist!;
  ok(hist.length === 2 && hist[0].form === 'gv' && hist[1].form === 'gv', 'ba bản ghi liên tiếp ⇒ lịch sử giữ hai bản trước, mới nhất trước');
  // hoàn tác từng bước
  const u1 = await undoQueueAction(n.ok ? n.undo : (null as never));
  ok(u1.ok && eff(cur(one.uid)).form === 'gv', 'hoàn tác "cần xem lại" ⇒ trở lại giáo viên xác minh');
  ok(getRec(one.uid)!.hist!.length === 3 && getRec(one.uid)!.hist![0].form === 'xem-lai', 'hoàn tác cũng là một bước trong lịch sử (bản "cần xem lại" vừa hoàn tác vẫn còn dấu vết)');
  const u2 = await undoQueueAction(m.ok ? m.undo : (null as never));
  ok(u2.ok && eff(cur(one.uid)).level === 'chua', 'hoàn tác xác nhận mức độ');
  const u3 = await undoQueueAction(r.ok ? r.undo : (null as never));
  ok(u3.ok && eff(cur(one.uid)).form === 'chua', 'hoàn tác xác nhận Dạng ⇒ về chưa xác minh');
}

console.log('Đổi Dạng: vị trí + ID cùng lúc, mức độ giữ nguyên, hoàn tác');
{
  const q0 = cur(added[1].uid);
  const level0 = q0.level;
  const r = await applyQueueAction(q0.uid, { kind: 'doi-dang', formId: A.formId }, ctx);
  if (!r.ok) throw new Error(r.message);
  const q1 = cur(q0.uid);
  ok(q1.formId === A.formId && q1.level === level0, 'đổi sang Dạng đúng, mức độ gốc giữ nguyên');
  const h = readHead(q1.latex);
  ok(h.ids.length === 1 && h.ids[0].code === code(A, level0), 'ID trong LaTeX đổi cùng lúc, đúng Dạng mới và mức độ gốc');
  ok(q1.latex.replace(/%\[[^\]]+\]/, '') === q0.latex.replace(/%\[[^\]]+\]/, ''), 'chỉ vùng ID đổi, phần còn lại của LaTeX nguyên văn');
  ok(eff(q1).form === 'gv', 'sau khi đổi Dạng: giáo viên xác minh');
  const h2 = getRec(q0.uid)!.hist!;
  ok(h2.length >= 1, 'lịch sử giữ trạng thái trước khi đổi');
  const u = await undoQueueAction(r.undo);
  const q2 = cur(q0.uid);
  ok(u.ok && q2.formId === B.formId && q2.latex === q0.latex && q2.level === level0, 'hoàn tác trả lại ĐÚNG vị trí và LaTeX cũ (byte-y-nguyên)');
  // câu bị sửa sau đó ⇒ không hoàn tác đè lên chỉnh sửa mới
  const r2 = await applyQueueAction(q0.uid, { kind: 'doi-dang', formId: C.formId }, ctx);
  if (!r2.ok) throw new Error(r2.message);
  await (await import('./store')).updateMany([q0.uid], (x) => ({ ...x, latex: x.latex + '\n% sửa tay' }));
  const u2 = await undoQueueAction(r2.undo);
  ok(!u2.ok && cur(q0.uid).formId === C.formId && cur(q0.uid).latex.endsWith('% sửa tay'), 'câu đã bị sửa tiếp ⇒ không hoàn tác, giữ nguyên chỉnh sửa mới');
}

console.log('Lỗi ghi và dữ liệu không hợp lệ');
{
  const q3 = cur(added[2].uid);
  const bad = await applyQueueAction(q3.uid, { kind: 'doi-dang', formId: 'khong-ton-tai' }, ctx);
  ok(!bad.ok && cur(q3.uid).formId === q3.formId && cur(q3.uid).latex === q3.latex, 'Dạng không còn trong cây ⇒ không đổi gì');
  const two = await (await import('./store')).updateMany([q3.uid], (x) => ({ ...x, latex: x.latex.replace('\\begin{ex}', '\\begin{ex}%[2D1H1-1]') }));
  void two;
  const q3b = cur(q3.uid);
  const multi = await applyQueueAction(q3.uid, { kind: 'doi-dang', formId: A.formId }, ctx);
  ok(!multi.ok && cur(q3.uid).formId === q3b.formId && cur(q3.uid).latex === q3b.latex && /nhieu-id|ID/.test(multi.message), 'LaTeX có nhiều ID ⇒ không ghi đè lặng lẽ, không đổi gì');
  const gone = await applyQueueAction('khong-co-uid', { kind: 'xac-nhan-dang' }, ctx);
  ok(!gone.ok, 'câu không còn trong ngân hàng ⇒ báo lỗi');
  // vị trí không còn đúng cây ⇒ không cho "xác nhận Dạng"
  const taxBroken = structuredClone(tax);
  const les = taxBroken.grades.flatMap((x) => x.branches).flatMap((b) => b.chapters).flatMap((c) => c.lessons).find((l) => l.id === cur(added[3].uid).lessonId)!;
  les.forms = les.forms.filter((f) => f.id !== cur(added[3].uid).formId);
  const r = await applyQueueAction(added[3].uid, { kind: 'xac-nhan-dang' }, { tax: taxBroken, ix: indexOf(taxBroken), taxRev: taxRevision(taxBroken) });
  ok(!r.ok && eff(cur(added[3].uid)).form !== 'gv', 'vị trí không còn đúng đường dẫn cây ⇒ không xác nhận Dạng');
}

console.log('Xác nhận trong hàng đợi trở thành căn cứ kiểm chứng ID');
{
  const probe = ex('Tìm tập xác định của hàm số $y=\\sqrt{x-9}$.');
  const before = verifyId(probe, A, verifierFor(tax, getState().questions, eff), 'k');
  ok(before.verdict === 'chua-kiem-chung', 'trước khi xác nhận: chưa có câu nào làm căn cứ ⇒ chưa kiểm chứng');
  // giáo viên đổi 9 câu nhóm A về đúng Dạng A rồi xác nhận
  const pool = added.filter((x) => x.uid !== added[2].uid && x.uid !== added[3].uid);
  for (const x of pool) { const r = await applyQueueAction(x.uid, { kind: 'doi-dang', formId: A.formId }, ctx); if (!r.ok && !/nhieu/.test(r.message)) throw new Error(r.message); }
  const sg = verifierFor(tax, getState().questions, eff);
  const afterOk = verifyId(probe, A, sg, 'k');
  const afterBad = verifyId(probe, B, sg, 'k');
  ok(afterOk.verdict === 'khop' && afterBad.verdict === 'bat-dong', 'sau khi giáo viên xác nhận: câu mới có ID đúng ⇒ khớp, ID sai ⇒ bất đồng');
}
const fresh1 = (tag: string, loc: Location = B) => addMany([{ ...loc, latex: ex(`Câu mới ${tag} tính $${tag.length}+1$`, code(loc, 'TH')), level: 'TH' as Level, tags: [] }])[0];
const mustUndo = (r: Awaited<ReturnType<typeof applyQueueAction>>) => { if (!r.ok) throw new Error(r.message); return r.undo; };

console.log('Lỗi ghi tệp phụ / kho: không hiện xác minh giả, không đổi nửa vời');
{
  const z = fresh1('loi-ghi');
  const snapQ = () => { const x = cur(z.uid); return JSON.stringify([x.grade, x.chapterId, x.lessonId, x.formId, x.latex, x.level]); };
  const q0 = snapQ();
  ok(getRec(z.uid) === undefined, 'câu thử chưa có bản ghi');
  disk.failSave = true;
  for (const [label, act] of [['xác nhận Dạng', { kind: 'xac-nhan-dang' }], ['xác nhận mức độ', { kind: 'xac-nhan-muc-do' }], ['cần xem lại', { kind: 'can-xem-lai' }], ['đổi Dạng', { kind: 'doi-dang', formId: A.formId }]] as const) {
    const r = await applyQueueAction(z.uid, act, ctx);
    ok(!r.ok && getRec(z.uid) === undefined && eff(cur(z.uid)).form === 'chua' && snapQ() === q0, `ghi tệp phụ lỗi: ${label} ⇒ báo lỗi, KHÔNG hiện xác minh, câu y nguyên`);
  }
  disk.failSave = false;
  dstore.fail = true;
  const rk = await applyQueueAction(z.uid, { kind: 'doi-dang', formId: A.formId }, ctx);
  ok(!rk.ok && snapQ() === q0 && getRec(z.uid) === undefined, 'ghi kho câu hỏi lỗi: đổi Dạng ⇒ không đổi gì, không có xác minh');
  dstore.fail = false;
  // ghi được: xác nhận; sau đó hoàn tác gặp lỗi ghi tệp phụ ⇒ trạng thái không bị sai lệch giữa bộ nhớ và đĩa
  const okr = await applyQueueAction(z.uid, { kind: 'xac-nhan-dang' }, ctx);
  const undoOk = mustUndo(okr);
  const onDisk = disk.json;
  disk.failSave = true;
  const ru = await undoQueueAction(undoOk);
  ok(!ru.ok && eff(cur(z.uid)).form === 'gv' && disk.json === onDisk, 'hoàn tác gặp lỗi ghi ⇒ báo lỗi, bộ nhớ và đĩa vẫn khớp nhau (không lệch)');
  disk.failSave = false;
  const ru2 = await undoQueueAction(undoOk);
  ok(ru2.ok && eff(cur(z.uid)).form === 'chua', 'ghi được lại ⇒ hoàn tác thành công');
}

console.log('Câu đã đổi / bị xoá / cây đổi khi đang xử lý');
{
  const z = fresh1('cau-doi');
  const q0 = cur(z.uid);
  const stale = await applyQueueAction(z.uid, { kind: 'xac-nhan-dang' }, ctx, q0.latex + ' (đã khác)');
  ok(!stale.ok && getRec(z.uid) === undefined, 'câu đã được sửa sau khi xem (nội dung khác lúc hiển thị) ⇒ từ chối, không ghi');
  const fresh = await applyQueueAction(z.uid, { kind: 'xac-nhan-dang' }, ctx, q0.latex);
  ok(fresh.ok, 'nội dung đúng như lúc xem ⇒ áp dụng');
  if (fresh.ok) await undoQueueAction(mustUndo(fresh));
  // cây đổi: Dạng đề xuất không còn trong cây hiện tại ⇒ không áp đề xuất cũ
  const taxNew = structuredClone(tax);
  const lesNew = taxNew.grades.flatMap((x) => x.branches).flatMap((b) => b.chapters).flatMap((c) => c.lessons).find((l) => l.id === C.lessonId)!;
  lesNew.forms = lesNew.forms.filter((f) => f.id !== C.formId);
  const ctxNew: QueueCtx = { tax: taxNew, ix: indexOf(taxNew), taxRev: taxRevision(taxNew) };
  const before = JSON.stringify(cur(z.uid));
  const old = await applyQueueAction(z.uid, { kind: 'doi-dang', formId: C.formId }, ctxNew);
  ok(!old.ok && JSON.stringify(cur(z.uid)) === before, 'cây đổi khi hàng đợi đang mở: Dạng gợi ý cũ không còn ⇒ không áp dụng, câu y nguyên');
  // câu bị xoá từ nơi khác
  const gone = fresh1('bi-xoa');
  (await import('./store')).deleteQuestion(gone.uid);
  const rg = await applyQueueAction(gone.uid, { kind: 'xac-nhan-dang' }, ctx);
  ok(!rg.ok && getRec(gone.uid) === undefined, 'câu đã bị xoá ⇒ báo lỗi, không tạo bản ghi cho uid khác');
}

console.log('Hai câu cùng nội dung, UID khác nhau');
{
  const twin = addMany([
    { ...B, latex: ex('Hai câu giống hệt nhau về nội dung', code(B, 'TH')), level: 'TH' as Level, tags: [] },
    { ...B, latex: ex('Hai câu giống hệt nhau về nội dung', code(B, 'TH')), level: 'TH' as Level, tags: [] },
  ]);
  const [t1, t2] = twin;
  ok(t1.uid !== t2.uid && t1.latex === t2.latex, 'hai câu cùng nội dung, hai UID');
  const r = await applyQueueAction(t1.uid, { kind: 'xac-nhan-dang' }, ctx);
  ok(r.ok && eff(cur(t1.uid)).form === 'gv' && eff(cur(t2.uid)).form === 'chua' && getRec(t2.uid) === undefined, 'xác nhận câu thứ nhất KHÔNG ảnh hưởng câu thứ hai (theo UID, không theo nội dung)');
  const d = await applyQueueAction(t2.uid, { kind: 'doi-dang', formId: A.formId }, ctx);
  ok(d.ok && cur(t2.uid).formId === A.formId && cur(t1.uid).formId === B.formId && cur(t1.uid).latex === t1.latex, 'đổi Dạng câu thứ hai không đụng câu thứ nhất');
  // số đếm theo nhóm giảm đúng sau khi câu rời hàng đợi
  const pool = [cur(t1.uid), cur(t2.uid)];
  const c1 = scopeCounts(pool, eff);
  ok(c1['tat-ca'] === 0, 'cả hai đã được giáo viên xác minh ⇒ không còn câu nào trong hàng đợi');
  await undoQueueAction(mustUndo(r));
  const c2 = scopeCounts([cur(t1.uid), cur(t2.uid)], eff);
  ok(c2['tat-ca'] === 1 && c2.chua === 1, 'hoàn tác một câu ⇒ số đếm tăng lại đúng một');
}

console.log('Đóng/mở lại và khởi động lại; căn cứ hết hiệu lực khi bỏ xác minh hoặc nội dung đổi');
{
  const w = fresh1('bat-dau');
  const r = await applyQueueAction(w.uid, { kind: 'xac-nhan-dang' }, ctx);
  const wUndo = mustUndo(r);
  // đóng/mở lại hàng đợi = đọc lại trạng thái từ tệp phụ; khởi động lại = nạp lại kho từ đĩa (kho đã ghi xuống đĩa như khi nhập thật)
  await flushSave();
  _resetReview(be);
  await loadIdReview();
  await initStore({ async load() { return { json: dstore.json, recovered: false }; }, async save(j: string) { dstore.json = j; } });
  ok(eff(cur(w.uid)).form === 'gv' && getState().questions.some((x) => x.uid === w.uid), 'sau khi khởi động lại: câu vẫn ở trạng thái giáo viên xác minh');
  const probe = ex('Tìm tập xác định của hàm số $y=\\sqrt{x-9}$.');
  const ev = () => evidenceQuestions(getState().questions, eff).map((x) => x.uid);
  ok(ev().includes(w.uid), 'câu đã xác minh là căn cứ cho câu khác');
  void probe;
  // nội dung đổi ⇒ căn cứ hết hiệu lực
  await (await import('./store')).updateMany([w.uid], (x) => ({ ...x, latex: x.latex.replace('Câu mới', 'Bài mới') }));
  ok(!ev().includes(w.uid) || cur(w.uid).latex === w.latex, 'nội dung đổi (ngoài vùng ID) ⇒ không còn là căn cứ');
  // đổi lại về nội dung cũ + bỏ xác minh ⇒ không phải căn cứ
  await (await import('./store')).updateMany([w.uid], (x) => ({ ...x, latex: w.latex }));
  ok(ev().includes(w.uid), 'trả nội dung về như lúc xác minh ⇒ bản ghi lại khớp');
  await undoQueueAction(wUndo);
  ok(!ev().includes(w.uid), 'bỏ xác minh (hoàn tác) ⇒ không còn là căn cứ');
}

if (fail) process.exit(1);
console.log('verifyqueue: đạt hết.');
