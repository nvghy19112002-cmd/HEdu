import { _reset, loadDecisions, TRASH_CAP, trashAddMany, trashCount, trashList, type Backend } from './dupdecisions';
import { moveManyToTrash } from './trashflow';
import { addMany, getState, initStore } from './store';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const ex = (n: number) => `\\begin{ex}%[2D1N1-1]\n  Đề ${n}. Tính $x$ \\(\\sqrt{2}\\).\n  \\choice{\\True 1}{2}{3}{4}\n  \\loigiai{x}\n\\end{ex}`;
const loc = { grade: 12, chapterId: 'c2D1', lessonId: 'l2D11', formId: '' };

interface Env { bank: { json: string | null; saves: number; fail: boolean }; side: { data: string | null; saves: number; fail: boolean; readonly: boolean } }
async function setup(n: number, preTrash = 0): Promise<Env & { uids: string[] }> {
  const bank = { json: null as string | null, saves: 0, fail: false };
  await initStore({ async load() { return { json: bank.json, recovered: false }; }, async save(j: string) { if (bank.fail) throw new Error('đĩa đầy'); bank.json = j; bank.saves++; } });
  const side = { data: null as string | null, saves: 0, fail: false, readonly: false };
  const be: Backend = { async load() { return side.data; }, async save(j: string) { if (side.fail) throw new Error('đĩa đầy'); side.data = j; side.saves++; } };
  _reset(be); await loadDecisions();
  const base = new Set(getState().questions.map((q) => q.uid));
  // dọn bộ mẫu có sẵn (nếu có) để đếm chính xác
  const added = addMany(Array.from({ length: n + preTrash }, (_, i) => ({ ...loc, latex: ex(i), level: 'NB' as const, tags: [] })));
  if (preTrash) { await trashAddMany(added.slice(0, preTrash)); }
  const uids = added.slice(preTrash).map((q) => q.uid);
  void base; side.saves = 0; bank.saves = 0;
  return { bank, side, uids };
}
const pick = (uids: string[]) => { const s = new Set(uids); return getState().questions.filter((q) => s.has(q.uid)); };

console.log('Xoá hàng loạt: biên 0 / 1 / 20 / 314 / 999 / 1000 / 1001');
for (const n of [0, 1, 20, 314, 999, 1000]) {
  const e = await setup(n);
  const before = getState().questions.length;
  const r = await moveManyToTrash(pick(e.uids));
  ok(r.ok && r.moved === n, `${n} câu: ok, moved=${n}`);
  ok(getState().questions.length === before - n, `${n} câu: ngân hàng giảm đúng ${n}`);
  ok(trashCount() === n, `${n} câu: thùng rác có đúng ${n}`);
  if (n > 0) ok(e.side.saves === 1 && e.bank.saves === 1, `${n} câu: thùng rác ghi 1 lần, ngân hàng ghi 1 lần (${e.side.saves}/${e.bank.saves})`);
}
{
  const e = await setup(1001);
  const before = getState().questions.length;
  const r = await moveManyToTrash(pick(e.uids));
  ok(!r.ok && r.why === 'full', '1001 câu: bị từ chối vì thùng rác không đủ chỗ');
  ok(getState().questions.length === before && trashCount() === 0, '1001 câu: không câu nào bị đụng, không cắt bớt 1000');
  ok(e.side.saves === 0 && e.bank.saves === 0, '1001 câu: không ghi gì xuống đĩa');
}

console.log('Xoá hàng loạt: thùng rác đã có sẵn câu');
{
  const e = await setup(20, 980);
  ok(trashCount() === 980, 'thùng rác đang có 980');
  const r = await moveManyToTrash(pick(e.uids));
  ok(r.ok && trashCount() === TRASH_CAP, '980 + 20 = 1000: được');
}
{
  const e = await setup(21, 980);
  const before = getState().questions.length;
  const r = await moveManyToTrash(pick(e.uids));
  ok(!r.ok && r.why === 'full' && trashCount() === 980, '980 + 21 = 1001: từ chối cả lô, thùng rác giữ nguyên 980');
  ok(getState().questions.length === before, '…và ngân hàng nguyên vẹn');
  ok(/còn chỗ cho 20 câu/.test(r.ok ? '' : r.message), 'thông báo nói đúng còn chỗ cho 20 câu');
}
{
  const e = await setup(5);
  const q = pick(e.uids);
  await trashAddMany(q.slice(0, 2)); // đã nằm sẵn trong thùng rác (bản cũ) — không tốn thêm chỗ
  const r = await moveManyToTrash(q);
  ok(r.ok && trashCount() === 5 && new Set(trashList().map((t) => t.q.uid)).size === 5, 'câu đã có trong thùng rác: không nhân đôi bản ghi');
}

console.log('Xoá hàng loạt: lỗi ghi');
{
  const e = await setup(30);
  const before = getState();
  e.side.fail = true;
  const r = await moveManyToTrash(pick(e.uids));
  ok(!r.ok && r.why === 'trash-write', 'thùng rác ghi lỗi: báo thất bại');
  ok(getState() === before && trashCount() === 0, 'thùng rác lỗi: ngân hàng và thùng rác y nguyên');
}
{
  const e = await setup(30);
  const before = getState().questions.length;
  e.bank.fail = true;
  const r = await moveManyToTrash(pick(e.uids));
  ok(!r.ok && r.why === 'bank-write' && !r.strayInTrash, 'ngân hàng ghi lỗi: báo thất bại');
  ok(getState().questions.length === before, 'ngân hàng ghi lỗi: đủ mọi câu trong bộ nhớ');
  ok(trashCount() === 0, 'ngân hàng ghi lỗi: bản vừa cất trong thùng rác được gỡ ra');
  ok(e.bank.saves === 0, 'đĩa ngân hàng không bị ghi dở (0 lần ghi thành công)');
}
{
  const e = await setup(30);
  const before = getState().questions.length;
  const side = e.side;
  // ngân hàng lỗi RỒI thùng rác cũng lỗi khi hoàn tác: câu nằm ở cả hai nơi, không mất
  e.bank.fail = true;
  const orig = side.fail;
  let n = 0;
  const be: Backend = { async load() { return side.data; }, async save(j: string) { n++; if (n >= 2) throw new Error('đĩa đầy'); side.data = j; } };
  _reset(be); await loadDecisions();
  const r = await moveManyToTrash(pick(e.uids));
  void orig;
  ok(!r.ok && r.why === 'bank-write' && r.strayInTrash === 30, 'hoàn tác thùng rác cũng lỗi: báo rõ 30 câu còn nằm ở thùng rác');
  ok(getState().questions.length === before, '…nhưng ngân hàng vẫn đủ câu (không mất)');
}
{
  const e = await setup(10);
  // kho thùng rác chỉ-đọc (tệp phụ hỏng)
  const be: Backend = { async load() { return '{không phải json'; }, async save() { throw new Error('x'); } };
  _reset(be); await loadDecisions();
  const before = getState().questions.length;
  const r = await moveManyToTrash(pick(e.uids));
  ok(!r.ok && getState().questions.length === before, 'tệp thùng rác chỉ-đọc/hỏng: từ chối, không xoá câu nào');
}

if (fail) { console.error(`\n${fail} lỗi`); process.exit(1); }
console.log('\nOK');
