// Nhập .tex có sẵn ID: phân loại ID, không gán lặng lẽ; lỗi ghi sau khi nhập không làm hỏng dữ liệu cũ khi mở lại app.
import { idStateOf, summarizeImportIds } from './importid';
import { splitExBlocks } from './extest';
import { addMany, flushSave, getState, initStore, isLastSaveOk } from './store';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const ex = (id: string | null, n = 1) => `\\begin{ex}${id ? `%[${id}]` : ''}\n  Đề ${n}. Tính $x$.\n  \\choice{\\True 1}{2}{3}{4}\n  \\loigiai{x}\n\\end{ex}`;

console.log('Phân loại ID khi nhập');
{
  ok(idStateOf(ex('2D1H1-1')) === 'ok', 'ID đủ Dạng đúng cây ⇒ ok');
  ok(idStateOf(ex('0D0H2-2')) === 'ok', 'mã lớp "0" là Lớp 10 ⇒ ok (không phải lớp 0)');
  ok(idStateOf(ex('2D1H1')) === 'thieu-dang', 'ID không ghi Dạng ⇒ báo "thiếu Dạng" (KHÔNG tự vào Dạng đầu tiên)');
  ok(idStateOf(ex('9Z9H9-9')) === 'khong-hop-le' && idStateOf(ex('2D1H1-99')) === 'khong-hop-le' && idStateOf(ex('2D1X1-1')) === 'khong-hop-le', 'sai mã lớp/phân môn, Dạng không tồn tại, chữ mức độ lạ ⇒ không hợp lệ');
  ok(idStateOf(ex('abc')) === 'khong-co', '%[abc] không có hình dạng mã ⇒ là nhãn, coi như chưa có ID');
  ok(idStateOf(ex('2D1H1-1').replace('%[2D1H1-1]', '%[2D1H1-1]%[2D1V1-2]')) === 'khong-hop-le', 'hai ID mâu thuẫn ⇒ không hợp lệ (không chọn bừa một)');
  ok(idStateOf(ex(null)) === 'khong-co', 'không có %[…] ⇒ không có ID');
  const blocks = splitExBlocks([ex('2D1H1-1', 1), ex('2D1H1', 2), ex('9Z9H9-9', 3), ex(null, 4)].join('\n\n'));
  ok(blocks.length === 4 && blocks.map((b) => idStateOf(b)).join() === 'ok,thieu-dang,khong-hop-le,khong-co', 'một file nhiều câu: phân loại đúng từng câu');
}

console.log('Tổng hợp trước khi nhập');
{
  const st = ['ok', 'ok', 'thieu-dang', 'khong-hop-le', 'khong-co', 'khong-co'] as const;
  const all = summarizeImportIds(st, () => true, () => false);
  ok(all.total === 6 && all.ok === 2 && all.needTeacher.noForm === 1 && all.needTeacher.invalid === 1 && all.needTeacher.missing === 2 && all.mustConfirm, 'đếm đúng từng loại; có câu cần xác nhận');
  const chosen = summarizeImportIds(st, () => true, (i) => i >= 3);
  ok(chosen.needTeacher.invalid === 0 && chosen.needTeacher.missing === 0 && chosen.needTeacher.noForm === 1 && chosen.mustConfirm, 'giáo viên đã chọn Dạng cho câu thiếu/sai ID ⇒ không còn phải xác nhận phần đó; "thiếu Dạng" chưa chọn vẫn phải xác nhận');
  ok(!summarizeImportIds(st, () => true, (i) => i >= 2).mustConfirm, 'chọn Dạng cho cả câu thiếu Dạng ⇒ không còn phải xác nhận');
  const skipped = summarizeImportIds(st, (i) => i < 2, () => false);
  ok(skipped.total === 2 && !skipped.mustConfirm, 'chỉ tính các câu sẽ nhập: toàn câu ID đúng ⇒ không phải xác nhận thêm');
  ok(!summarizeImportIds([], () => true, () => false).mustConfirm, 'rỗng không lỗi');
}

console.log('Lỗi ghi sau khi nhập + mở lại app');
{
  const disk = { json: null as string | null, fail: false };
  const boot = () => initStore({ async load() { return { json: disk.json, recovered: false }; }, async save(j: string) { if (disk.fail) throw new Error('đĩa đầy'); disk.json = j; } });
  await boot();
  const loc = { grade: 12, chapterId: getState().questions[0]?.chapterId ?? '', lessonId: getState().questions[0]?.lessonId ?? '', formId: getState().questions[0]?.formId ?? '' };
  addMany([{ latex: ex('2D1H1-1', 1), level: 'NB', tags: [], ...loc }]);
  await flushSave();
  const before = JSON.parse(disk.json!).questions.length;
  ok(isLastSaveOk() && before >= 1, 'nhập bình thường ghi được xuống đĩa');
  disk.fail = true;
  addMany([{ latex: ex('2D1H1-1', 2), level: 'NB', tags: [], ...loc }, { latex: ex('2D1H1-1', 3), level: 'NB', tags: [], ...loc }]);
  await flushSave();
  ok(!isLastSaveOk() && getState().questions.length === before + 2, 'ghi lỗi ⇒ báo lỗi (không nói "đã nhập xong"), bộ nhớ vẫn giữ để thử ghi lại');
  disk.fail = false;
  await boot(); // đóng rồi mở lại app khi chưa ghi được
  ok(getState().questions.length === before && JSON.parse(disk.json!).questions.length === before, 'mở lại app: dữ liệu cũ NGUYÊN VẸN, không có câu nhập dở, không hỏng tệp');
  addMany([{ latex: ex('2D1H1-1', 4), level: 'NB', tags: [], ...loc }]);
  await flushSave();
  ok(isLastSaveOk() && JSON.parse(disk.json!).questions.length === before + 1, 'nhập lại sau khi hết lỗi: ghi được');
}

if (fail) { console.error(`\n${fail} lỗi`); process.exit(1); }
console.log('\nimportid: đạt hết.');
