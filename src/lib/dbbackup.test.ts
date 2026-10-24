// Điểm khôi phục trước thao tác lớn: chỉ chụp khi cần (SQLite, đủ lớn); không chụp được thì thao tác bị chặn.
import { BIG_OP, ensureRestorePoint } from './dbbackup';
import { _setStorage } from './storage';
import { addMany, initStore, type Delta, type LoadedRaw, type Persistence } from './store';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
const g = globalThis as unknown as { window?: unknown };

const calls: [string, unknown][] = [];
let failPoint = false;
g.window = { __TAURI__: { core: { async invoke(cmd: string, args: unknown) { calls.push([cmd, args]); if (cmd === 'backup_point' && failPoint) throw new Error('ổ đĩa đầy'); return {}; } }, event: { async listen() { return () => {}; } } } };
let saved = 0, failSave = false;
const persistence: Persistence = {
  async load() { throw new Error('x'); },
  async save() { throw new Error('x'); },
  async loadParsed(): Promise<LoadedRaw | null> { return null; },
  async saveDelta(_d: Delta) { if (failSave) throw new Error('đĩa đầy'); saved++; },
};
await initStore(persistence);

console.log('Điểm khôi phục trước thao tác lớn');
{
  _setStorage('json');
  ok((await ensureRestorePoint('nhap-hang-loat')).ok && calls.length === 0, 'chế độ JSON cũ: không chụp gì, cho làm');
  _setStorage('sqlite');
  ok((await ensureRestorePoint('xoa-hang-loat', 5 >= BIG_OP)).ok && calls.length === 0, 'thao tác nhỏ (dưới 20 câu): không chụp, cho làm');
  addMany([{ grade: 12, chapterId: 'c2D1', lessonId: 'l2D11', formId: 'f2D111', latex: '\\begin{ex}x\\end{ex}', level: 'NB', tags: [] }]);
  const before = saved;
  const r = await ensureRestorePoint('nhap-hang-loat', 30 >= BIG_OP);
  ok(r.ok && calls.length === 1 && calls[0][0] === 'backup_point' && (calls[0][1] as { reason: string }).reason === 'nhap-hang-loat', 'thao tác lớn: gọi Rust chụp điểm khôi phục với đúng lý do');
  ok(saved > before, 'ghi nốt dữ liệu đang chờ TRƯỚC khi chụp (điểm khôi phục phản ánh đúng hiện trạng)');
  failPoint = true;
  const bad = await ensureRestorePoint('don-sach-thung-rac');
  ok(!bad.ok && /điểm khôi phục/.test(bad.message) && /ổ đĩa đầy/.test(bad.message), 'không chụp được ⇒ trả lỗi rõ ràng để chặn thao tác');
  failPoint = false;
  addMany([{ grade: 12, chapterId: 'c2D1', lessonId: 'l2D11', formId: 'f2D111', latex: '\\begin{ex}y\\end{ex}', level: 'NB', tags: [] }]);
  failSave = true;
  calls.length = 0;
  const noSave = await ensureRestorePoint('xoa-hang-loat');
  ok(!noSave.ok && calls.length === 0, 'dữ liệu hiện tại chưa ghi được ⇒ chặn thao tác, không chụp điểm giả');
}

if (fail) { console.error(`\n${fail} lỗi`); process.exit(1); }
console.log('\ndbbackup: đạt hết.');
