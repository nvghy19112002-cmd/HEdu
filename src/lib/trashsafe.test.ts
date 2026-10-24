// PR-1 (Thùng rác an toàn): chèn lỗi ghi ở từng bước của Xoá đơn / Khôi phục / Xoá hẳn và chứng minh KHÔNG MẤT CÂU.
// "Khởi động lại" được mô phỏng bằng cách nạp lại kho + tệp phụ từ đúng nội dung đã ghi xuống "đĩa" giả.
import { _reset, loadDecisions, TRASH_CAP, trashAddMany, trashCount, trashList, type Backend } from './dupdecisions';
import { isTrashBusy, moveManyToTrash, moveToTrash, purgeAllTrash, purgeFromTrash, restoreBlockOf, restoreFromTrash } from './trashflow';
import { addMany, getState, initStore, updateMany } from './store';
import type { Question } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const ex = (n: number) => `\\begin{ex}%[2D1N1-1]\n  Đề ${n}. Tính $x$ \\(\\sqrt{2}\\).\n  \\choice{\\True 1}{2}{3}{4}\n  \\loigiai{x}\n\\end{ex}`;
const loc = { grade: 12, chapterId: 'c2D1', lessonId: 'l2D11', formId: '' };

const disk = { bank: null as string | null, side: null as string | null, failBank: false, failSide: false, gateSide: null as Promise<void> | null, bankWrites: 0, sideWrites: 0 };
async function boot(): Promise<void> {
  await initStore({ async load() { return { json: disk.bank, recovered: false }; }, async save(j: string) { if (disk.failBank) throw new Error('đĩa đầy'); disk.bank = j; disk.bankWrites++; } });
  const be: Backend = { async load() { return disk.side; }, async save(j: string) { if (disk.gateSide) await disk.gateSide; if (disk.failSide) throw new Error('đĩa đầy'); disk.side = j; disk.sideWrites++; } };
  _reset(be);
  await loadDecisions();
}
const reset = () => { disk.bank = null; disk.side = null; disk.failBank = false; disk.failSide = false; disk.gateSide = null; disk.bankWrites = 0; disk.sideWrites = 0; };
const onDisk = () => ({
  bank: (JSON.parse(disk.bank ?? '{"questions":[]}').questions as Question[]).map((q) => q.uid),
  trash: ((JSON.parse(disk.side ?? '{}').trash ?? []) as { q: Question }[]).map((t) => t.q.uid),
});
const seed = async (n: number): Promise<Question[]> => {
  reset(); await boot();
  const base = new Set(getState().questions.map((q) => q.uid));
  const added = addMany(Array.from({ length: n }, (_, i) => ({ ...loc, latex: ex(i), level: 'NB' as const, tags: [] })));
  await updateMany(added.map((q) => q.uid), (q) => ({ ...q })); // ép ghi ngân hàng xuống đĩa giả
  void base; disk.bankWrites = 0; disk.sideWrites = 0;
  return added;
};
const lost = (uids: string[]): string[] => { const d = onDisk(); return uids.filter((u) => !d.bank.includes(u) && !d.trash.includes(u)); };

console.log('Xoá MỘT câu (moveToTrash) — trước đây chỉ đổi bộ nhớ, ghi đĩa trì hoãn');
{
  const [q] = await seed(3);
  ok(await moveToTrash(q), 'xoá thành công trả true');
  const d = onDisk();
  ok(d.trash.includes(q.uid) && !d.bank.includes(q.uid), 'khi trả true: ĐÃ ghi cả thùng rác lẫn ngân hàng xuống đĩa (không chỉ trong bộ nhớ)');
}
{
  const [q] = await seed(3);
  disk.failBank = true;
  ok(!(await moveToTrash(q)), 'ngân hàng ghi lỗi ⇒ trả false');
  disk.failBank = false;
  const d = onDisk();
  ok(getState().questions.some((x) => x.uid === q.uid) && trashCount() === 0, 'câu còn nguyên trong ngân hàng (bộ nhớ) và thùng rác đã gỡ bản vừa thêm');
  ok(lost([q.uid]).length === 0, 'đĩa: không mất câu');
  void d;
}
{
  const [q] = await seed(3);
  disk.failSide = true;
  ok(!(await moveToTrash(q)), 'thùng rác ghi lỗi ⇒ trả false, chưa đụng ngân hàng');
  disk.failSide = false;
  ok(getState().questions.some((x) => x.uid === q.uid) && lost([q.uid]).length === 0, 'câu còn nguyên');
}

console.log('Khôi phục — ghi NGÂN HÀNG trước, thùng rác sau');
{
  const qs = await seed(4);
  await moveManyToTrash(qs.slice(0, 2));
  const r = await restoreFromTrash([qs[0].uid]);
  const d = onDisk();
  ok(r.ok && r.restored.length === 1 && d.bank.includes(qs[0].uid) && !d.trash.includes(qs[0].uid), 'thành công: câu về ngân hàng (đĩa) và bản thùng rác được gỡ (đĩa)');
  ok(trashCount() === 1 && lost(qs.map((q) => q.uid)).length === 0, 'câu còn lại vẫn trong thùng rác; không mất câu nào');
}
{
  const qs = await seed(3);
  await moveManyToTrash([qs[0]]);
  disk.failBank = true;
  const r = await restoreFromTrash([qs[0].uid]);
  disk.failBank = false;
  ok(!r.ok && r.why === 'bank-write' && /chưa mất dữ liệu/.test(r.message), 'ghi ngân hàng lỗi: báo thất bại, nói rõ chưa mất dữ liệu');
  ok(trashCount() === 1 && onDisk().trash.includes(qs[0].uid), 'bản thùng rác VẪN CÒN (bộ nhớ và đĩa) — đây là lỗi P0 trước đây');
  ok(!getState().questions.some((x) => x.uid === qs[0].uid), 'ngân hàng không có câu "ảo" chỉ tồn tại trong bộ nhớ');
  ok(lost([qs[0].uid]).length === 0, 'đĩa: không mất câu');
  const again = await restoreFromTrash([qs[0].uid]);
  ok(again.ok && again.restored.length === 1 && trashCount() === 0, 'sau khi đĩa khỏe lại: thử lại thành công');
}
{
  const qs = await seed(3);
  await moveManyToTrash([qs[0]]);
  disk.failSide = true;
  const r = await restoreFromTrash([qs[0].uid]);
  disk.failSide = false;
  ok(r.ok && r.restored.length === 1 && r.strayInTrash.length === 1 && /chưa dọn được bản sao/.test(r.message), 'gỡ thùng rác lỗi: câu ĐÃ về ngân hàng, báo còn bản sao, không báo thất bại hoàn toàn');
  const d = onDisk();
  ok(d.bank.includes(qs[0].uid) && d.trash.includes(qs[0].uid), 'đĩa: câu ở CẢ HAI nơi (thừa một bản, không mất)');
  // khởi động lại: cả hai bản còn, khôi phục lần nữa nhận ra "đã có" và KHÔNG nhân đôi
  await boot();
  ok(getState().questions.filter((x) => x.uid === qs[0].uid).length === 1 && trashCount() === 1, 'khởi động lại: một bản ở ngân hàng, một bản ở thùng rác');
  const r2 = await restoreFromTrash([qs[0].uid]);
  ok(r2.restored.length === 0 && r2.blocked[0]?.reason === 'exists-same' && getState().questions.filter((x) => x.uid === qs[0].uid).length === 1, 'khôi phục lại: nhận ra đã có (giống hệt), không nhân đôi, không tự xoá bản thùng rác');
  ok(trashCount() === 1, 'bản thùng rác vẫn nằm đó cho tới khi giáo viên chủ động xoá');
}

console.log('Khôi phục — xung đột (D7)');
{
  const qs = await seed(4);
  await moveManyToTrash([qs[0], qs[1]]);
  // số cũ bị câu khác chiếm
  addMany([{ ...loc, latex: ex(99), level: 'TH', tags: [] }]);
  const taken = getState().questions[getState().questions.length - 1];
  // tạo xung đột seq: ép câu mới mang đúng số của qs[0]
  await updateMany([taken.uid], (q) => ({ ...q, seq: qs[0].seq }));
  const r = await restoreFromTrash([qs[0].uid]);
  const back = getState().questions.find((x) => x.uid === qs[0].uid)!;
  ok(r.ok && r.restored[0].fromSeq === qs[0].seq && r.restored[0].toSeq !== qs[0].seq && back.seq === r.restored[0].toSeq, 'số thứ tự đã bị dùng ⇒ cấp số mới, báo số cũ → mới');
  ok(back.latex === qs[0].latex && back.uid === qs[0].uid && new Set(getState().questions.map((x) => x.seq)).size === getState().questions.length, 'giữ nguyên uid + LaTeX; không có hai câu trùng số');
}
{
  const qs = await seed(2);
  await moveManyToTrash([qs[0]]);
  addMany([{ ...loc, latex: ex(0), level: 'NB', tags: [] }]);
  const clone = getState().questions[getState().questions.length - 1];
  await updateMany([clone.uid], (q) => ({ ...q, uid: qs[0].uid, latex: q.latex + '\n% khác' }));
  const r = await restoreFromTrash([qs[0].uid]);
  ok(r.restored.length === 0 && r.blocked[0]?.reason === 'exists-different', 'cùng uid nhưng nội dung KHÁC ⇒ không ghi đè, báo cần xử lý');
  ok(getState().questions.find((x) => x.uid === qs[0].uid)!.latex.endsWith('% khác') && trashCount() === 1, 'bản trong ngân hàng và bản thùng rác đều nguyên vẹn');
}
{
  const qs = await seed(2);
  await moveManyToTrash([qs[0]]);
  const rec = trashList()[0].q;
  rec.chapterId = 'c-khong-con'; rec.lessonId = 'l-khong-con'; // vị trí cũ không còn trong cây
  const r = await restoreFromTrash([qs[0].uid]);
  ok(r.restored.length === 0 && r.blocked[0]?.reason === 'bad-location' && trashCount() === 1, 'vị trí cũ không còn ⇒ KHÔNG tự gán chỗ khác, giữ nguyên trong thùng rác');
  ok(!getState().questions.some((x) => x.uid === qs[0].uid), 'ngân hàng không nhận câu có vị trí hỏng');
}
{
  const qs = await seed(5);
  await moveManyToTrash(qs);
  const bad = trashList()[0].q; bad.chapterId = 'c-khong-con'; bad.lessonId = 'l-khong-con';
  const r = await restoreFromTrash(qs.map((q) => q.uid));
  ok(r.restored.length === 4 && r.blocked.length === 1 && r.restored.length + r.blocked.length === 5, 'lô 5 câu (1 vị trí hỏng): khôi phục 4, báo rõ 1 câu cần xử lý — không bỏ câu nào trong im lặng');
  ok(trashCount() === 1 && lost(qs.map((q) => q.uid)).length === 0, 'chỉ câu cần xử lý còn trong thùng rác; không mất câu');
}

console.log('Xoá hẳn — KHÔNG đụng ngân hàng, lỗi ⇒ giữ nguyên');
{
  const qs = await seed(5);
  await moveManyToTrash(qs.slice(0, 3));
  const bankBefore = getState().questions.map((q) => q.uid).join();
  const r = await purgeFromTrash([qs[0].uid, qs[1].uid]);
  ok(r.ok && r.purged === 2 && trashCount() === 1, 'xoá hẳn 2 câu');
  ok(getState().questions.map((q) => q.uid).join() === bankBefore, 'ngân hàng KHÔNG đổi');
  disk.failSide = true;
  const f = await purgeFromTrash([qs[2].uid]);
  disk.failSide = false;
  ok(!f.ok && f.why === 'trash-write' && trashCount() === 1 && onDisk().trash.includes(qs[2].uid), 'ghi lỗi: báo chưa xoá, câu vẫn trong thùng rác (bộ nhớ + đĩa)');
  const all = await purgeAllTrash();
  ok(all.ok && trashCount() === 0, 'dọn sạch thùng rác chạy theo cùng đường an toàn');
}

console.log('Hoàn lại khi ghi lỗi KHÔNG cuốn theo sửa đổi khác');
{
  const qs = await seed(4);
  let release: () => void = () => undefined;
  disk.gateSide = new Promise<void>((r) => { release = r; });
  disk.failSide = true;
  const slow = moveManyToTrash([qs[0]]);               // đang chờ ghi tệp phụ (rồi sẽ lỗi)
  await new Promise((r) => setTimeout(r, 0));
  const other = trashAddMany([qs[3]]);                 // thao tác khác xen vào thùng rác lúc chờ
  release();
  const [a, b] = await Promise.all([slow, other]);
  disk.failSide = false; disk.gateSide = null;
  ok(!a.ok, 'lượt bị lỗi báo thất bại');
  ok(!b || trashList().every((t) => t.q.uid !== qs[0].uid), 'bản của lượt lỗi được gỡ khỏi thùng rác');
  ok(getState().questions.some((x) => x.uid === qs[0].uid), 'câu của lượt lỗi vẫn còn trong ngân hàng');
}

console.log('Chống đua lệnh');
{
  const qs = await seed(3);
  let release: () => void = () => undefined;
  disk.gateSide = new Promise<void>((r) => { release = r; });
  const first = moveManyToTrash([qs[0]]);
  await new Promise((r) => setTimeout(r, 0));
  ok(isTrashBusy(qs[0].uid), 'câu đang xử lý bị khoá');
  const second = await moveManyToTrash([qs[0]]);
  ok(!second.ok && second.why === 'busy', 'lệnh thứ hai cùng câu bị từ chối (busy), không chạy chồng');
  const third = await restoreFromTrash([qs[0].uid]);
  ok(!third.ok && third.why === 'busy', 'khôi phục khi đang xoá cũng bị từ chối');
  release();
  const r1 = await first;
  disk.gateSide = null;
  ok(r1.ok && !isTrashBusy(qs[0].uid) && trashCount() === 1, 'lệnh đầu xong, mở khoá, chỉ có MỘT bản trong thùng rác');
}

console.log('Sức chứa & tệp phụ hỏng');
{
  const qs = await seed(2);
  const fill = Array.from({ length: TRASH_CAP }, (_, i) => ({ ...qs[0], uid: `fill${i}`, seq: 5000 + i }));
  await trashAddMany(fill);
  const r = await moveManyToTrash([qs[1]]);
  ok(!r.ok && r.why === 'full' && getState().questions.some((x) => x.uid === qs[1].uid) && trashCount() === TRASH_CAP, 'thùng rác đầy: từ chối, không tự dọn câu cũ, câu vẫn còn nguyên');
}
{
  reset(); disk.side = '{không phải json';
  await initStore({ async load() { return { json: disk.bank, recovered: false }; }, async save(j: string) { disk.bank = j; } });
  _reset({ async load() { return disk.side; }, async save(j: string) { disk.side = j; } });
  await loadDecisions();
  const [q] = addMany([{ ...loc, latex: ex(1), level: 'NB', tags: [] }]);
  const r = await moveManyToTrash([q]);
  ok(!r.ok && r.why === 'trash-readonly' && getState().questions.some((x) => x.uid === q.uid), 'tệp Thùng rác không đọc được: từ chối xoá (không tạo bản cứu hộ hỏng), câu còn nguyên');
  ok(disk.side === '{không phải json', 'tệp hỏng KHÔNG bị ghi đè bằng dữ liệu trống');
  const g = await restoreFromTrash([q.uid]);
  ok(!g.ok && g.why === 'trash-readonly', 'khôi phục/xoá hẳn cũng từ chối khi tệp phụ không đọc được');
}

console.log('Lý do chưa khôi phục (restoreBlockOf) + lô nhiều tình huống');
{
  reset(); await boot();
  const [a, b, c, d] = addMany([0, 1, 2, 3].map((i) => ({ ...loc, latex: ex(i), level: 'NB' as const, tags: [] })));
  const edited = { ...b, latex: ex(99) };
  const bad = { ...d, uid: 'bad-uid', chapterId: 'c-khong-co' };
  ok(restoreBlockOf(a, a) === 'exists-same' && restoreBlockOf(edited, b) === 'exists-different', 'cùng uid: giống hệt ⇒ exists-same, khác nội dung ⇒ exists-different');
  ok(restoreBlockOf(bad, undefined) === 'bad-location' && restoreBlockOf(c, undefined) === null, 'vị trí hỏng ⇒ bad-location; câu ổn không có trong ngân hàng ⇒ khôi phục được');
  // lô: 1 khôi phục được + 3 cần xử lý ⇒ báo đúng từng nhóm, không bỏ câu nào
  await trashAddMany([edited, bad, { ...c, uid: 'ok-uid', seq: 777 }, a]);
  const r = await restoreFromTrash(['ok-uid', a.uid, b.uid, bad.uid]);
  const why = Object.fromEntries(r.blocked.map((x) => [x.uid, x.reason]));
  ok(r.ok && r.restored.length === 1 && r.blocked.length === 3 && why[a.uid] === 'exists-same' && why[b.uid] === 'exists-different' && why[bad.uid] === 'bad-location', 'lô hỗn hợp: 1 khôi phục, 3 bị giữ lại kèm đúng lý do');
  ok(trashList().length === 3 && trashList().every((t) => t.q.uid !== 'ok-uid'), 'chỉ câu đã khôi phục rời Thùng rác; 3 câu còn nguyên');
  const all = await purgeAllTrash();
  ok(all.ok && all.purged === 3 && trashList().length === 0 && getState().questions.some((x) => x.uid === a.uid), 'dọn sạch: bỏ đúng 3 bản trong Thùng rác, KHÔNG đụng Ngân hàng');
}

if (fail) { console.error(`\n${fail} lỗi`); process.exit(1); }
console.log('\ntrashsafe: đạt hết.');
