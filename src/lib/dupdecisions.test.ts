import { _reset, TRASH_CAP, trashRoomFor, goldList, goldOf, goldSet, restoreSidecar, sidecarForBackup, trashAdd, trashList, trashRemove, clearDecision, exportDecisions, importDecisions, isDecisionsWritable, loadDecisions, setDecision, statusOf, DUP_ALGO_VERSION, type Backend } from './dupdecisions';
import type { Question } from './types';

let failed = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) failed++; };
const Q = (uid: string, latex: string) => ({ uid, latex }) as unknown as Question;
const E = (s: string) => `\\begin{ex}\n${s}\n\\choice{$1$}{$2$}{$3$}{$4$}\n\\end{ex}`;
const mem = (init: string | null = null) => {
  const b = { data: init, saves: 0, fail: false, loadFail: false } as { data: string | null; saves: number; fail: boolean; loadFail: boolean } & Backend;
  b.load = async () => { if (b.loadFail) throw new Error('đọc lỗi'); return b.data; };
  b.save = async (j: string) => { if (b.fail) throw new Error('ghi lỗi'); b.data = j; b.saves++; };
  return b;
};

(async () => {
  const A = Q('ua', E('Cho hàm số $y=x^3-3x+2$. Tìm cực đại của hàm số trên tập số thực.'));
  const B = Q('ub', E('Cho hàm số $y=x^3-3x+5$. Tìm cực đại của hàm số trên tập số thực.'));

  console.log('Quyết định: ghi, đọc lại, khoá không thứ tự');
  {
    const be = mem(); _reset(be); await loadDecisions();
    ok(statusOf(A, B).status === 'none', 'chưa có quyết định ⇒ none');
    ok(await setDecision(A, B, 'not_duplicate', 'Khác số liệu') === true, 'ghi thành công trả true');
    ok(statusOf(B, A).status === 'valid' && statusOf(A, B).rec?.why === 'Khác số liệu', 'đảo thứ tự A/B vẫn nhận ra cùng một cặp');
    _reset(be); await loadDecisions();
    ok(statusOf(A, B).status === 'valid', 'tải lại từ tệp: quyết định còn nguyên');
  }
  console.log('Quyết định: sửa nội dung ⇒ hết hiệu lực');
  {
    const be = mem(); _reset(be); await loadDecisions();
    await setDecision(A, B, 'legit_variant');
    const B2 = Q('ub', B.latex.replace('+5', '+6'));
    ok(statusOf(A, B2).status === 'stale', 'câu B đổi nội dung ⇒ stale (không áp quyết định cũ)');
    ok(statusOf(Q('uc', A.latex), B).status === 'none', 'uid khác ⇒ không áp dụng');
  }
  console.log('Quyết định: bỏ quyết định');
  {
    const be = mem(); _reset(be); await loadDecisions();
    await setDecision(A, B, 'review_later'); await clearDecision(B, A);
    ok(statusOf(A, B).status === 'none' && JSON.parse(be.data!).recs.length === 0, 'bỏ quyết định ⇒ cặp quay về chưa xử lý và tệp được cập nhật');
  }
  console.log('Quyết định: lỗi ghi / lỗi đọc không làm mất dữ liệu');
  {
    const be = mem(); _reset(be); await loadDecisions();
    await setDecision(A, B, 'not_duplicate');
    be.fail = true;
    ok(await setDecision(A, Q('uc', 'x'), 'review_later') === false, 'ghi lỗi ⇒ trả false để giao diện báo người dùng');
    ok(JSON.parse(be.data!).recs.length === 1, 'tệp cũ không bị hỏng khi ghi lỗi');

    const bad = mem('{không phải json'); _reset(bad);
    const r = await loadDecisions();
    ok(!r.ok && !isDecisionsWritable(), 'tệp hỏng ⇒ báo lỗi và KHÔNG cho ghi đè');
    ok(await setDecision(A, B, 'not_duplicate') === false && bad.data === '{không phải json' && bad.saves === 0, 'tệp hỏng được giữ nguyên, không bị ghi đè');

    const lf = mem(); lf.loadFail = true; _reset(lf);
    ok(!(await loadDecisions()).ok && !isDecisionsWritable(), 'không đọc được ⇒ không ghi đè');

    const wrong = mem(JSON.stringify({ v: 2, recs: [] })); _reset(wrong);
    ok(!(await loadDecisions()).ok, 'phiên bản tệp lạ ⇒ không đọc bừa');
  }
  console.log('Quyết định: xuất / nhập');
  {
    const be = mem(); _reset(be); await loadDecisions();
    await setDecision(A, B, 'not_duplicate');
    const exp = exportDecisions();
    const be2 = mem(); _reset(be2); await loadDecisions();
    const r = await importDecisions(exp);
    ok(r.added === 1 && r.saved && statusOf(A, B).status === 'valid', 'nhập file xuất ⇒ thêm 1 và lưu');
    const r2 = await importDecisions(exp);
    ok(r2.added === 0 && r2.skipped === 1, 'nhập lại cùng file ⇒ không nhân đôi');
    const newer = JSON.stringify({ v: 1, recs: [{ ...JSON.parse(exp).recs[0], d: 'legit_variant', at: Date.now() + 1000 }] });
    const r3 = await importDecisions(newer);
    ok(r3.updated === 1 && statusOf(A, B).rec?.d === 'legit_variant', 'bản mới hơn thắng khi trùng khoá');
    let threw = false; try { await importDecisions('{"v":9}'); } catch { threw = true; }
    ok(threw, 'file không phải của HEdu ⇒ báo lỗi');
    const junk = await importDecisions(JSON.stringify({ v: 1, recs: [{ a: 1 }, null] }));
    ok(junk.skipped === 2, 'bản ghi sai cấu trúc bị bỏ qua, không làm hỏng');
  }
  ok(DUP_ALGO_VERSION === 1, 'phiên bản thuật toán ghi trong bản ghi');
  console.log('Thùng rác, nhãn chuẩn, sao lưu (V3)');
  {
    const be = mem(); _reset(be); await loadDecisions();
    await setDecision(A, B, 'not_duplicate');
    ok(await trashAdd(A) === true && trashList().length === 1 && trashList()[0].q.uid === 'ua', 'cất câu vào thùng rác, ghi bền vững');
    ok(await goldSet(A, B, 'true_dup', 'raw') === true && goldOf(A, B)?.label === 'true_dup', 'ghi nhãn chuẩn');
    const saved = JSON.parse(be.data!);
    ok(saved.v === 1 && Array.isArray(saved.recs) && saved.recs.length === 1 && saved.trash.length === 1 && saved.gold.length === 1, 'tệp có đủ recs + trash + gold; recs giữ nguyên định dạng cũ');
    await setDecision(B, A, 'legit_variant');
    const after = JSON.parse(be.data!);
    ok(after.trash.length === 1 && after.gold.length === 1, 'ghi lại quyết định KHÔNG làm mất thùng rác/nhãn chuẩn');
    _reset(be); await loadDecisions();
    ok(trashList().length === 1 && goldList().length === 1, 'tải lại: thùng rác và nhãn chuẩn còn nguyên');
    ok(goldOf(Q('ua', A.latex + ' khác'), B) === undefined, 'câu đã sửa ⇒ nhãn chuẩn cũ không còn dùng để đo');
    ok(await trashRemove('ua') === true && trashList().length === 0, 'xoá hẳn khỏi thùng rác');
  }
  {
    const be = mem(); be.fail = true; _reset(be); await loadDecisions();
    ok(await trashAdd(A) === false && trashList().length === 0, 'ghi lỗi ⇒ trả false và KHÔNG giữ trong thùng rác (để giao diện không xoá câu)');
  }
  {
    const old = mem(JSON.stringify({ v: 1, recs: [] })); _reset(old); const r = await loadDecisions();
    ok(r.ok && trashList().length === 0 && goldList().length === 0, 'tệp beta.18 (không có trash/gold) đọc bình thường');
  }
  {
    const src = mem(); _reset(src); await loadDecisions();
    await setDecision(A, B, 'not_duplicate'); await trashAdd(A); await goldSet(A, B, 'different', 'near');
    const file = JSON.parse(JSON.stringify(sidecarForBackup()));
    const dst = mem(); _reset(dst); await loadDecisions();
    const r = await restoreSidecar(file);
    ok(r.saved && r.added === 3 && statusOf(A, B).status === 'valid' && trashList().length === 1 && goldList().length === 1, 'khôi phục từ file sao lưu: quyết định + thùng rác + nhãn chuẩn');
    const r2 = await restoreSidecar(file);
    ok(r2.added === 0 && trashList().length === 1, 'khôi phục lần hai không nhân đôi');
    ok((await restoreSidecar(undefined)).added === 0 && (await restoreSidecar({ v: 2 })).added === 0, 'file sao lưu cũ (không có phần tệp phụ) ⇒ bỏ qua, không lỗi');
  }
  console.log('Thùng rác đầy: từ chối, không cắt âm thầm (PR-0)');
  {
    const be = mem(); _reset(be); await loadDecisions();
    // dựng sẵn thùng rác đầy bằng tệp (nhanh, không ghi 1000 lần)
    const full = Array.from({ length: TRASH_CAP }, (_, i) => ({ q: { ...Q('t' + i, E('Câu ' + i)), seq: i }, at: 1000 + i }));
    be.data = JSON.stringify({ v: 1, recs: [], trash: full, gold: [] }); _reset(be); await loadDecisions();
    ok(trashList().length === TRASH_CAP, `thùng rác đang đầy (${TRASH_CAP})`);
    const savesBefore = be.saves;
    ok(await trashAdd(A) === false, 'thùng rác đầy ⇒ trashAdd TỪ CHỐI (false)');
    ok(trashList().length === TRASH_CAP && trashList().some((t) => t.q.uid === 't0') && !trashList().some((t) => t.q.uid === 'ua'), 'không câu cũ nào bị bỏ, câu mới không lọt vào');
    ok(be.saves === savesBefore, 'từ chối thì không ghi gì xuống tệp');
    ok(trashRoomFor([A]) === false && trashRoomFor([Q('t5', 'x')]) === true && trashRoomFor([]) === true, 'câu đã có sẵn trong thùng rác không tốn thêm chỗ');
    ok(await trashAdd(Q('t5', E('Câu 5 đã sửa'))) === true && trashList().length === TRASH_CAP, 'cất lại câu đã có uid trong thùng rác: thay bản ghi, vẫn đủ 1000');
    ok(await trashRemove('t1') === true && await trashAdd(A) === true && trashList().length === TRASH_CAP && trashList()[0].q.uid === 'ua', 'giải phóng 1 chỗ thì cất được');
    // khôi phục từ sao lưu khi đầy: không cắt, đếm phần bỏ qua
    const dst = mem(); _reset(dst);
    dst.data = JSON.stringify({ v: 1, recs: [], trash: full.slice(0, TRASH_CAP - 1), gold: [] }); _reset(dst); await loadDecisions();
    const extra = [0, 1, 2].map((i) => ({ q: { ...Q('n' + i, E('Mới ' + i)), seq: 5000 + i }, at: 9000 + i }));
    const r = await restoreSidecar({ v: 1, recs: [], trash: extra, gold: [] });
    ok(r.added === 1 && r.skippedTrash === 2 && trashList().length === TRASH_CAP, 'khôi phục sao lưu khi gần đầy: thêm 1, bỏ qua 2 và BÁO số bỏ qua, không cắt câu đang có');
    ok(trashList().some((t) => t.q.uid === 't0'), 'câu cũ nhất vẫn còn');
  }

  if (failed) { console.error(`\n${failed} lỗi`); process.exit(1); }
  console.log('\nOK');
})();
