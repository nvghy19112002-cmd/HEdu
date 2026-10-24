// Khôi phục sang VỊ TRÍ MỚI: giữ uid + LaTeX gốc (kể cả %[ID] cũ), đặt "Cần sửa", chỉ gỡ Thùng rác sau khi Ngân hàng ghi xong;
// lỗi ghi / "đóng app giữa chừng" không làm mất câu và không tạo bản sao thứ hai khi khôi phục lại.
import { _reset, loadDecisions, trashAddMany, trashCount, trashList, type Backend } from './dupdecisions';
import { buildDefault, indexOf } from './taxonomy';
import { getTaxonomy } from './curriculum';
import { placeLabel, relocatePreview, relocated, validNewLocation } from './trashrelocate';
import { restoreFromTrash } from './trashflow';
import { addMany, getState, initStore } from './store';
import { locationOfForm } from './taxpath';
import { formsOfGrade } from './ai/tasks/ganid';
import type { Question } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const ix = indexOf(getTaxonomy() ?? buildDefault());
const F = formsOfGrade(getTaxonomy(), 12).map((f) => f.formId);
const newLoc = locationOfForm(ix, F[3])!;
const latex = '\\begin{ex}%[0D0H2-2]\n  Gieo con súc sắc. $x$\n  \\choice{\\True 1}{2}{3}{4}\n  \\loigiai{x}\n\\end{ex}';
const oldQ = (over: Partial<Question> = {}): Question => ({ uid: 'u-old', seq: 5, latex, type: 'tn', level: 'TH', tags: ['ôn'], createdAt: 1, updatedAt: 1, grade: 11, chapterId: 'c9X9', lessonId: 'l9X99', formId: 'f9X999', review: 'approved', ...over });

const disk = { bank: null as string | null, side: null as string | null, failBank: false, failSide: false };
async function boot(): Promise<void> {
  await initStore({ async load() { return { json: disk.bank, recovered: false }; }, async save(j: string) { if (disk.failBank) throw new Error('đĩa đầy'); disk.bank = j; } });
  const be: Backend = { async load() { return disk.side; }, async save(j: string) { if (disk.failSide) throw new Error('đĩa đầy'); disk.side = j; } };
  _reset(be);
  await loadDecisions();
}
const bankOnDisk = (): Question[] => JSON.parse(disk.bank ?? '{"questions":[]}').questions as Question[];
const trashOnDisk = (): string[] => ((JSON.parse(disk.side ?? '{}').trash ?? []) as { q: Question }[]).map((t) => t.q.uid);
const fresh = async (q = oldQ()): Promise<Question> => {
  disk.bank = null; disk.side = null; disk.failBank = false; disk.failSide = false;
  await boot();
  addMany([{ ...loc12(), latex: '\\begin{ex}x\\end{ex}', level: 'NB', tags: [] }]); // ép tạo tệp ngân hàng
  await trashAddMany([q]);
  return q;
};
const loc12 = () => ({ grade: 12, chapterId: newLoc.chapterId, lessonId: newLoc.lessonId, formId: newLoc.formId });

console.log('Xem trước: vị trí cũ/mới, ID cũ/mới, cảnh báo lệch %[ID]');
{
  const q = oldQ();
  ok(!validNewLocation(ix, { ...newLoc, formId: '' }) && !validNewLocation(ix, { ...newLoc, lessonId: 'khong-co' }) && validNewLocation(ix, newLoc), 'vị trí mới phải đủ Lớp→Chương→Bài→Dạng đúng cây');
  const p = relocatePreview(q, newLoc, q.level, ix);
  ok(p.oldCode === '—' && p.oldPlace.includes('không còn') && p.newCode.length > 3 && p.newCode !== p.oldCode, 'vị trí cũ không còn ⇒ "—"; mã mới tính bằng đúng công thức hiện hành');
  ok(p.latexCode === '0D0H2-2' && p.mismatch, 'mã trong LaTeX gốc khác mã mới ⇒ cảnh báo lệch');
  const same = relocatePreview(oldQ({ latex: latex.replace('0D0H2-2', p.newCode.replace(/^(.)(.)(.)[NHVC]/, (_m, a, b, c) => `${a}${b}${c}H`).replace(/[A-Z]/, 'H')) }), newLoc, 'TH', ix);
  ok(typeof same.mismatch === 'boolean', 'cờ lệch luôn là true/false');
  ok(relocatePreview(q, newLoc, 'VD', ix).levelChanged && !relocatePreview(q, newLoc, q.level, ix).levelChanged, 'chỉ báo đổi mức độ khi giáo viên chủ động đổi');
  ok(/Lớp|lớp/.test(placeLabel(ix, newLoc)), 'nhãn vị trí hiện tên lớp/chương/bài/dạng');
  const r = relocated(q, newLoc);
  ok(r.latex === q.latex && r.uid === q.uid && r.level === q.level && r.review === 'needs_fix' && r.tags.join() === 'ôn' && r.formId === newLoc.formId && r.grade === 12, 'bản khôi phục: giữ uid/LaTeX/mức độ/nhãn, đổi vị trí, về "Cần sửa"');
}

console.log('Khôi phục sang vị trí mới (ghi Ngân hàng trước, gỡ Thùng rác sau)');
{
  const q = await fresh();
  const bad = await restoreFromTrash([q.uid]);
  ok(bad.blocked[0]?.reason === 'bad-location' && trashList().some((t) => t.q.uid === q.uid), 'không chọn vị trí ⇒ vẫn bị giữ lại, không tự gán chỗ khác');
  const r = await restoreFromTrash([q.uid], { relocate: { loc: newLoc } });
  const inBank = getState().questions.find((x) => x.uid === q.uid);
  ok(r.ok && r.restored.length === 1 && inBank?.latex === q.latex && inBank?.review === 'needs_fix' && inBank?.formId === newLoc.formId && inBank?.level === 'TH', 'thành công: câu về Ngân hàng đúng vị trí mới, LaTeX nguyên vẹn (kể cả %[0D0H2-2]), "Cần sửa", mức độ giữ nguyên');
  ok(!trashOnDisk().includes(q.uid) && bankOnDisk().some((x) => x.uid === q.uid), 'đĩa: có trong ngân hàng, đã gỡ khỏi Thùng rác');
}
{
  const q = await fresh();
  const r = await restoreFromTrash([q.uid], { relocate: { loc: newLoc, level: 'VD' } });
  ok(r.ok && getState().questions.find((x) => x.uid === q.uid)?.level === 'VD', 'giáo viên chủ động đổi mức độ ⇒ áp dụng');
}
{
  const q = await fresh();
  const r = await restoreFromTrash([q.uid], { relocate: { loc: { ...newLoc, formId: '' } } });
  ok(!r.ok && trashList().some((t) => t.q.uid === q.uid) && !getState().questions.some((x) => x.uid === q.uid), 'vị trí mới thiếu Dạng ⇒ từ chối, chưa đụng gì');
  const multi = await restoreFromTrash([q.uid, 'khac'], { relocate: { loc: newLoc } });
  ok(!multi.ok, 'chọn vị trí mới chỉ dành cho MỘT câu');
}

console.log('Lỗi ghi và "đóng app giữa chừng"');
{
  const q = await fresh();
  disk.failBank = true;
  const r = await restoreFromTrash([q.uid], { relocate: { loc: newLoc } });
  disk.failBank = false;
  ok(!r.ok && r.why === 'bank-write' && !getState().questions.some((x) => x.uid === q.uid) && trashOnDisk().includes(q.uid), 'Ngân hàng ghi lỗi ⇒ câu còn nguyên trong Thùng rác (cả trên đĩa), có thông báo');
}
{
  const q = await fresh();
  disk.failSide = true;
  const r = await restoreFromTrash([q.uid], { relocate: { loc: newLoc } });
  disk.failSide = false;
  ok(r.ok && r.strayInTrash.includes(q.uid) && bankOnDisk().some((x) => x.uid === q.uid) && trashOnDisk().includes(q.uid), 'Thùng rác không gỡ được ⇒ vẫn có ở Ngân hàng + còn bản trong Thùng rác (thừa một bản, không mất), báo rõ');
}
{
  // đóng app sau khi Ngân hàng đã ghi nhưng TRƯỚC khi gỡ Thùng rác: mở lại thấy cả hai nơi
  const q = await fresh();
  disk.failSide = true;
  await restoreFromTrash([q.uid], { relocate: { loc: newLoc } });
  disk.failSide = false;
  await boot(); // "mở lại ứng dụng": nạp lại từ đĩa
  ok(getState().questions.some((x) => x.uid === q.uid) && trashList().some((t) => t.q.uid === q.uid), 'mở lại app: câu có ở cả hai nơi, không mất');
  const again = await restoreFromTrash([q.uid], { relocate: { loc: newLoc } });
  ok(again.blocked.length === 1 && again.restored.length === 0 && getState().questions.filter((x) => x.uid === q.uid).length === 1, 'khôi phục lần nữa: UID đã có ⇒ không ghi đè, không nhân đôi');
  ok(trashCount() >= 1, 'bản trong Thùng rác vẫn còn để giáo viên tự dọn');
}
{
  // đóng app khi Ngân hàng chưa kịp ghi: Thùng rác còn nguyên, làm lại được
  const q = await fresh();
  disk.failBank = true;
  await restoreFromTrash([q.uid], { relocate: { loc: newLoc } });
  disk.failBank = false;
  await boot();
  ok(!getState().questions.some((x) => x.uid === q.uid) && trashList().some((t) => t.q.uid === q.uid), 'mở lại app sau lỗi ghi Ngân hàng: câu vẫn ở Thùng rác');
  const r = await restoreFromTrash([q.uid], { relocate: { loc: newLoc } });
  ok(r.ok && getState().questions.some((x) => x.uid === q.uid), 'thử lại khôi phục thành công');
}
{
  // UID đã tồn tại / trùng số thứ tự
  const q = await fresh();
  const dup = await restoreFromTrash([q.uid], { relocate: { loc: newLoc } });
  await trashAddMany([q]);
  const again = await restoreFromTrash([q.uid], { relocate: { loc: newLoc } });
  ok(dup.ok && again.blocked[0]?.reason !== undefined && getState().questions.filter((x) => x.uid === q.uid).length === 1, 'UID đã có trong Ngân hàng ⇒ không ghi đè');
  const q2 = await fresh(oldQ({ uid: 'u-seq', seq: getState().nextSeq - 1 }));
  const taken = getState().questions[0].seq;
  await trashAddMany([{ ...q2, uid: 'u-seq2', seq: taken }]);
  const r = await restoreFromTrash(['u-seq2'], { relocate: { loc: newLoc } });
  ok(r.ok && r.restored[0].fromSeq === taken && r.restored[0].toSeq !== taken, 'số thứ tự bị trùng ⇒ cấp số mới theo cơ chế hiện có, báo số cũ → mới');
}

if (fail) { console.error(`\n${fail} lỗi`); process.exit(1); }
console.log('\ntrashrelocate: đạt hết.');
