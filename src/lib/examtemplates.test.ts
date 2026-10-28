// Mẫu ma trận đề (PR 4A): lưu bền, lỗi ghi không tạo thành công giả, tương thích cây, áp dụng, sao lưu/khôi phục, dữ liệu hỏng và mới hơn.
import { _resetTemplates, applyTemplate, checkCompat, checkName, createTemplate, deleteTemplate, duplicateTemplate, flushTemplates, freezeTemplates, getTemplate, listTemplates, loadTemplates, newTemplateId, parseStore, renameTemplate, restoreTemplates, snapshotFrom, templatesForBackup, unsupportedCount, MAX_ROWS, MAX_TEMPLATES, type Backend, type Template } from './examtemplates';
import { newDraft, newRowId } from './examdraft';
import { exportBackup, importBackup, initStore, addMany } from './store';
import { buildDefault } from './taxonomy';
import type { Row } from './examgen';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const tax = buildDefault();
const g = tax.grades.find((x) => x.grade === 12) ?? tax.grades[tax.grades.length - 1];
const ch = g.branches.flatMap((b) => b.chapters);
const chap = ch.find((c) => c.lessons.length >= 2 && c.lessons.some((l) => l.forms.length)) ?? ch[0];
const les = chap.lessons.find((l) => l.forms.length) ?? chap.lessons[0];
const frm = les.forms[0];
const rows: Row[] = [
  { id: 'r1', scope: { kind: 'grade', id: String(g.grade) }, type: 'tn', level: 'NB', count: 5 },
  { id: 'r2', scope: { kind: 'chapter', id: chap.id }, type: 'tn', level: 'TH', count: 4 },
  { id: 'r3', scope: { kind: 'form', id: frm.id }, type: 'ds', level: 'any', count: 2 },
];
const draft = () => { const d = newDraft(1); d.rows = rows.map((r) => ({ ...r })); d.policy = 'tat-ca'; d.count = 6; d.shuffleOptions = false; return d; };

const disk = { json: null as string | null, failSave: false, saves: 0 };
const be: Backend = { async load() { return disk.json; }, async save(j) { if (disk.failSave) throw new Error('đĩa đầy'); disk.saves++; disk.json = j; } };
const fresh = async () => { disk.json = null; disk.failSave = false; disk.saves = 0; _resetTemplates(be); await loadTemplates(); };
const reopen = async () => { _resetTemplates(be); return loadTemplates(); };

console.log('Mẫu chỉ lưu những gì đã chốt (D7)');
{
  const d = draft();
  d.locked = { r1: ['uid-bi-mat-1'] }; d.exceptions = { 'uid-bi-mat-1': { at: 1, why: 'x' } }; d.rejected = ['uid-2']; d.info.school = 'THPT Bí Mật'; d.info.title = 'Kỳ thi Bí Mật';
  const s = snapshotFrom(d, tax, '  Mẫu   giữa kỳ  ', 1000);
  const json = JSON.stringify(s);
  ok(!/uid-bi-mat|uid-2|THPT Bí Mật|Kỳ thi Bí Mật|locked|exceptions|rejected|school|title/.test(json), 'không chứa câu khóa, ngoại lệ, UID, thông tin trường hay kỳ thi');
  ok(s.name === 'Mẫu giữa kỳ' && s.rows.length === 3 && s.fmt === 1 && s.codes === 6 && s.policy === 'tat-ca' && !s.shuffleOptions && s.taxRev.length > 0, 'có tên chuẩn hóa, dòng, chính sách, điểm, số mã, lựa chọn trộn, phiên bản định dạng, dấu vân cây');
  ok(s.rows[2].chain.length === 4 && s.rows[2].label.includes(frm.name) && s.rows[0].chain.join() === String(g.grade), 'mỗi dòng ghi tên và chuỗi tổ tiên lúc lưu');
}

console.log('Tạo, đổi tên, nhân bản, xóa; lưu bền qua đóng/mở');
{
  await fresh();
  const a = await createTemplate(snapshotFrom(draft(), tax, 'Giữa kỳ I', 1000));
  ok(a.ok && disk.json !== null && JSON.parse(disk.json).templates.length === 1, 'tạo mẫu: ghi xuống đĩa rồi mới báo thành công');
  ok(a.ok && /^tpl-[0-9a-f]{16}$/.test(a.value.id), 'ID riêng ổn định');
  const id = a.ok ? a.value.id : '';
  ok((await renameTemplate(id, 'Giữa kỳ I (v2)', 2000)).ok && getTemplate(id)!.name === 'Giữa kỳ I (v2)' && getTemplate(id)!.updatedAt > 1000 && getTemplate(id)!.createdAt === 1000, 'đổi tên: giữ ID và ngày tạo, cập nhật ngày sửa');
  const dup = await duplicateTemplate(id, 3000);
  ok(dup.ok && dup.value.id !== id && dup.value.name === 'Giữa kỳ I (v2) (bản sao)' && dup.value.rows.length === 3, 'nhân bản: ID mới, tên không trùng');
  const dup2 = await duplicateTemplate(id, 3001);
  ok(dup2.ok && dup2.value.name.endsWith('(bản sao 2)') && listTemplates().length === 3, 'nhân bản lần hai: tên vẫn không trùng');
  ok(dup.ok && JSON.stringify(dup.value.rows) === JSON.stringify(getTemplate(id)!.rows), 'bản sao giống bản gốc (trừ ID, tên, ngày)');
  // đóng/mở lại app
  const r = await reopen();
  ok(r.ok && listTemplates().length === 3 && getTemplate(id)?.name === 'Giữa kỳ I (v2)', 'đóng và mở lại: mẫu còn nguyên');
  ok((await deleteTemplate(id)).ok && !getTemplate(id) && listTemplates().length === 2, 'xóa mẫu');
  await reopen();
  ok(listTemplates().length === 2 && !getTemplate(id), 'xóa cũng bền qua đóng/mở');
  ok(!(await deleteTemplate('khong-co')).ok && !(await renameTemplate('khong-co', 'x')).ok && !(await duplicateTemplate('khong-co')).ok, 'thao tác trên mẫu không tồn tại bị từ chối');
}

console.log('Tên mẫu');
{
  await fresh();
  await createTemplate(snapshotFrom(draft(), tax, 'Cuối kỳ'));
  ok(checkName('') !== null && checkName('   ') !== null && checkName('x'.repeat(81)) !== null, 'rỗng hoặc quá dài bị từ chối');
  ok(checkName('cuối   KỲ') !== null, 'trùng tên (không phân biệt hoa thường, khoảng trắng thừa) bị từ chối');
  const r = await createTemplate(snapshotFrom(draft(), tax, 'CUỐI kỳ'));
  ok(!r.ok && listTemplates().length === 1, 'tạo trùng tên bị từ chối, không ghi gì');
  const b = await createTemplate(snapshotFrom(draft(), tax, 'Học kỳ II'));
  ok(b.ok && !(await renameTemplate(b.value.id, 'cuối kỳ')).ok && (await renameTemplate(b.value.id, 'Học kỳ II')).ok, 'đổi tên trùng bị từ chối; giữ nguyên tên của chính mình thì được');
}

console.log('Ghi lỗi không tạo thành công giả');
{
  await fresh();
  const a = await createTemplate(snapshotFrom(draft(), tax, 'Có sẵn', 1));
  const before = disk.json;
  disk.failSave = true;
  const c = await createTemplate(snapshotFrom(draft(), tax, 'Mới'));
  ok(!c.ok && listTemplates().length === 1 && disk.json === before, 'tạo lỗi ghi: báo lỗi, danh sách và đĩa y nguyên');
  ok(a.ok && !(await renameTemplate(a.value.id, 'Đổi')).ok && getTemplate(a.value.id)!.name === 'Có sẵn', 'đổi tên lỗi ghi: hoàn lại tên cũ');
  ok(a.ok && !(await duplicateTemplate(a.value.id)).ok && listTemplates().length === 1, 'nhân bản lỗi ghi: không có bản sao ma');
  ok(a.ok && !(await deleteTemplate(a.value.id)).ok && listTemplates().length === 1, 'xóa lỗi ghi: mẫu vẫn còn');
  disk.failSave = false;
  ok(a.ok && (await renameTemplate(a.value.id, 'Đổi sau khi đĩa ổn')).ok, 'đĩa ổn lại thì thao tác được');
  _resetTemplates(null);
  const none = await createTemplate(snapshotFrom(draft(), tax, 'Không nơi lưu'));
  ok(!none.ok, 'chưa có nơi lưu ⇒ từ chối, không giả vờ đã lưu');
}

console.log('Dữ liệu hỏng, thiếu trường, phiên bản mới hơn');
{
  await fresh();
  const good = await createTemplate(snapshotFrom(draft(), tax, 'Tốt', 5));
  const goodJson = JSON.parse(disk.json!).templates[0];
  const missing = { ...goodJson, id: 'tpl-thieu', name: 'Thiếu', rows: undefined };
  const badRow = { ...goodJson, id: 'tpl-hong-dong', name: 'Dòng hỏng', rows: [{ id: 'x', scope: { kind: 'khong-co', id: 'a' }, type: 'tn', level: 'NB', count: 1 }] };
  const noName = { ...goodJson, id: 'tpl-khong-ten', name: '  ' };
  const newer = { id: 'tpl-tuong-lai', fmt: 2, ten: 'Mẫu từ bản HEdu sau này', dongMoi: [1, 2, 3] };
  const file = JSON.stringify({ v: 1, templates: [goodJson, missing, badRow, noName, newer, 'rác', null, { id: 5 }] });
  const p = parseStore(file);
  ok(p.items.size === 2 && p.dropped === 6, 'bản ghi thiếu trường/hỏng bị bỏ và đếm; bản mới hơn được giữ');
  disk.json = file;
  const r = await reopen();
  ok(r.ok && r.dropped === 6 && listTemplates().length === 1 && unsupportedCount() === 1, 'đọc tệp lẫn bản hỏng: dùng được bản tốt, không sập');
  // ghi lại một thay đổi khác: bản ghi định dạng mới hơn phải còn NGUYÊN (không xóa, không sửa)
  ok(good.ok && (await renameTemplate(good.value.id, 'Tốt (đổi tên)')).ok, 'đổi tên mẫu tốt');
  const after = JSON.parse(disk.json!).templates as { id: string }[];
  ok(JSON.stringify(after.find((t) => t.id === 'tpl-tuong-lai')) === JSON.stringify(newer), 'bản ghi của phiên bản mới hơn được giữ nguyên từng byte khi ghi lại');
  ok(!getTemplate('tpl-tuong-lai') && !listTemplates().some((t) => t.id === 'tpl-tuong-lai'), 'bản mới hơn chưa dùng được (không hiện để áp dụng)');
  // cùng ID lặp trong tệp: bản mới hơn thắng, không phụ thuộc thứ tự
  const t1 = { ...goodJson, updatedAt: 10, name: 'Cũ' }, t2 = { ...goodJson, updatedAt: 20, name: 'Mới' };
  ok([parseStore(JSON.stringify({ v: 1, templates: [t1, t2] })), parseStore(JSON.stringify({ v: 1, templates: [t2, t1] }))].every((x) => (x.items.get(goodJson.id) as Template).name === 'Mới'), 'ID trùng trong tệp: bản updatedAt mới hơn thắng, không phụ thuộc thứ tự');
  // tệp hỏng hoàn toàn / cấu trúc không hiểu ⇒ KHÔNG ghi đè
  for (const [label, content] of [['JSON hỏng', '{khong phai json'], ['phiên bản tệp mới hơn', JSON.stringify({ v: 2, templates: [] })], ['thiếu mảng', JSON.stringify({ v: 1 })]] as const) {
    disk.json = content; disk.saves = 0;
    const l = await reopen();
    const c = await createTemplate(snapshotFrom(draft(), tax, 'Không được ghi'));
    ok(!l.ok && !c.ok && disk.json === content && disk.saves === 0, `${label}: không đọc được ⇒ không ghi đè (tệp giữ nguyên)`);
  }
}

console.log('Tương thích với cây chương trình');
{
  const s = snapshotFrom(draft(), tax, 'Cây', 1);
  const t: Template = { ...s, id: 'tpl-cay' };
  ok(checkCompat(t, tax).bad === 0 && !checkCompat(t, tax).taxChanged, 'cây không đổi ⇒ mọi dòng hợp lệ');
  const tax2 = structuredClone(tax);
  // xóa dạng của dòng 3
  for (const gg of tax2.grades) for (const b of gg.branches) for (const c of b.chapters) for (const l of c.lessons) l.forms = l.forms.filter((f) => f.id !== frm.id);
  const c2 = checkCompat(t, tax2);
  ok(c2.rows[2].state === 'mat' && c2.rows[0].state === 'ok' && c2.bad === 1 && c2.taxChanged, 'xóa Dạng ⇒ dòng đó "mat", dòng khác vẫn ổn, báo cây đã đổi');
  // chuyển bài sang chương khác (đổi cha)
  const tax3 = structuredClone(tax);
  const allCh = tax3.grades.flatMap((gg) => gg.branches.flatMap((b) => b.chapters));
  const src = allCh.find((c) => c.id === chap.id)!;
  const dst = allCh.find((c) => c.id !== chap.id && c.lessons.length)!;
  const moved = src.lessons.find((l) => l.id === les.id)!;
  src.lessons = src.lessons.filter((l) => l.id !== les.id); dst.lessons.push(moved);
  ok(checkCompat(t, tax3).rows[2].state === 'doi-vi-tri', 'đổi vị trí (bài chuyển sang chương khác) ⇒ "doi-vi-tri"');
  const tax4 = structuredClone(tax);
  tax4.grades = tax4.grades.filter((gg) => gg.grade !== g.grade);
  ok(checkCompat(t, tax4).rows[0].state === 'mat', 'xóa cả lớp ⇒ dòng phạm vi lớp "mat"');
  // đổi TÊN không làm dòng hỏng
  const tax5 = structuredClone(tax);
  tax5.grades.flatMap((gg) => gg.branches.flatMap((b) => b.chapters)).find((c) => c.id === chap.id)!.name += ' (đổi tên)';
  ok(checkCompat(t, tax5).bad === 0, 'đổi tên nút không làm dòng không hợp lệ');
}

console.log('Áp dụng mẫu');
{
  const s = snapshotFrom(draft(), tax, 'Áp dụng', 1);
  const t: Template = { ...s, id: 'tpl-ap' };
  const cur = newDraft(9);
  cur.rows = [{ id: 'r1', scope: { kind: 'grade', id: '12' }, type: 'tn', level: 'VD', count: 1 }]; // cố ý trùng mã dòng "r1" với mẫu
  cur.locked = { r1: ['u-khoa'] }; cur.exceptions = { 'u-khoa': { at: 1, why: 'x' } }; cur.rejected = ['u-bo']; cur.policy = 'xac-minh'; cur.count = 2; cur.info.school = 'Trường của tôi';
  let n = 0;
  const id = () => `moi-${++n}`;
  const add = applyTemplate(t, cur, tax, 'add', id);
  ok(add.draft.rows.length === 4 && add.draft.rows[0].id === 'r1' && new Set(add.draft.rows.map((r) => r.id)).size === 4, 'Thêm: dòng cũ giữ nguyên, dòng mẫu có mã MỚI nên không xung đột dù mẫu có mã "r1"');
  ok(add.draft.locked.r1[0] === 'u-khoa' && add.draft.policy === 'xac-minh' && add.draft.count === 2 && add.draft.info.school === 'Trường của tôi' && add.draft.rejected[0] === 'u-bo', 'Thêm: giữ câu khóa, ngoại lệ, chính sách, số mã, thông tin đề của bản nháp');
  const rep = applyTemplate(t, cur, tax, 'replace', id);
  ok(rep.draft.rows.length === 3 && rep.draft.rows.every((r) => r.id.startsWith('moi-')) && rep.draft.policy === 'tat-ca' && rep.draft.count === 6 && !rep.draft.shuffleOptions, 'Thay: ma trận, chính sách, số mã, lựa chọn trộn lấy từ mẫu');
  ok(Object.keys(rep.draft.locked).length === 0 && Object.keys(rep.draft.exceptions).length === 0 && rep.draft.rejected.length === 0, 'Thay: bỏ câu khóa/loại/ngoại lệ (gắn với dòng cũ)');
  ok(rep.draft.info.school === 'Trường của tôi' && rep.draft.seed === cur.seed, 'Thay: giữ thông tin trường/kỳ thi và hạt giống của bản nháp');
  ok(cur.rows.length === 1 && cur.locked.r1.length === 1, 'áp dụng không sửa bản nháp gốc (để hoàn tác được)');
  // cây đã đổi: giữ dòng, đánh dấu, KHÔNG ánh xạ sang Dạng khác
  const tax2 = structuredClone(tax);
  for (const gg of tax2.grades) for (const b of gg.branches) for (const c of b.chapters) for (const l of c.lessons) l.forms = l.forms.filter((f) => f.id !== frm.id);
  const bad = applyTemplate(t, cur, tax2, 'replace', id);
  const badRow = bad.draft.rows[2];
  ok(bad.bad === 1 && bad.draft.rows.length === 3 && badRow.flag === 'mat' && badRow.scope.id === frm.id && badRow.scope.kind === 'form' && badRow.label!.includes(frm.name), 'cây đã đổi: dòng không hợp lệ được giữ nguyên phạm vi gốc kèm tên cũ và cờ; không đổi sang Dạng khác');
  ok(applyTemplate({ ...t, rows: [] }, cur, tax, 'replace', id).draft.rows.length === 0, 'mẫu rỗng áp dụng được (ma trận rỗng)');
  const same: Template = { ...t, rows: [t.rows[0], { ...t.rows[0], id: 'khac' }, { ...t.rows[0], id: 'khac2' }] };
  ok(applyTemplate(same, cur, tax, 'replace', id).draft.rows.length === 3, 'phạm vi trùng lặp giữa các dòng vẫn áp dụng bình thường');
}

console.log('Sao lưu JSON thủ công: xuất, khôi phục, bản cũ, không trộn nhầm');
{
  const dk = { json: null as string | null };
  await initStore({ async load() { return { json: dk.json, recovered: false }; }, async save(j: string) { dk.json = j; } });
  addMany([{ latex: '\\begin{ex}\nx\n\\choice{\\True 1}{2}{3}{4}\n\\end{ex}', level: 'TH', tags: [], grade: g.grade, chapterId: chap.id, lessonId: les.id, formId: frm.id }]);
  await fresh();
  const a = await createTemplate(snapshotFrom(draft(), tax, 'Mẫu A', 1000));
  const idA = a.ok ? a.value.id : '';
  const backupT1 = exportBackup(); // thời điểm 1
  ok(JSON.parse(backupT1).examTemplates?.templates?.length === 1 && JSON.parse(backupT1).examTemplates.templates[0].name === 'Mẫu A', 'exportBackup mang theo mẫu ma trận');
  await renameTemplate(idA, 'Mẫu A (mới hơn)', 5000);
  await createTemplate(snapshotFrom(draft(), tax, 'Mẫu B', 6000));
  const backupT2 = exportBackup(); // thời điểm 2
  // máy mới: khôi phục thời điểm 1 rồi thời điểm 2 (cũ rồi mới): kết quả là bản MỚI nhất của từng mẫu, không trộn nửa này nửa kia
  await fresh();
  importBackup(backupT1); await new Promise((r) => setTimeout(r, 40));
  ok(listTemplates().length === 1 && getTemplate(idA)!.name === 'Mẫu A' && disk.json !== null, 'máy mới khôi phục bản sao lưu: có mẫu và đã ghi xuống đĩa');
  importBackup(backupT2); await new Promise((r) => setTimeout(r, 40));
  ok(listTemplates().length === 2 && getTemplate(idA)!.name === 'Mẫu A (mới hơn)', 'khôi phục bản sao lưu mới hơn sau bản cũ: mẫu A lên bản mới, thêm mẫu B');
  // ngược lại: khôi phục bản CŨ lên máy đang có bản mới ⇒ không bị đè
  importBackup(backupT1); await new Promise((r) => setTimeout(r, 40));
  ok(getTemplate(idA)!.name === 'Mẫu A (mới hơn)' && listTemplates().length === 2, 'khôi phục bản sao lưu cũ không ghi đè mẫu mới hơn và không xóa mẫu B');
  ok(JSON.stringify(getTemplate(idA)!.rows) === JSON.stringify(JSON.parse(backupT2).examTemplates.templates.find((t: Template) => t.id === idA).rows), 'mẫu khôi phục nguyên vẹn từng dòng (không trộn trường giữa các thời điểm)');
  // file sao lưu CŨ không có trường examTemplates
  const old = JSON.parse(backupT2); delete old.examTemplates;
  await fresh();
  const keep = await createTemplate(snapshotFrom(draft(), tax, 'Đang có', 1));
  importBackup(JSON.stringify(old)); await new Promise((r) => setTimeout(r, 40));
  ok(keep.ok && listTemplates().length === 1 && getTemplate(keep.value.id)?.name === 'Đang có', 'file sao lưu cũ (không có examTemplates) vẫn khôi phục được ngân hàng; mẫu đang có không bị đụng');
  // dữ liệu hỏng trong file sao lưu
  const r = await restoreTemplates({ v: 1, templates: [{ id: 'x' }, 'rac', { ...JSON.parse(backupT2).examTemplates.templates[0], id: 'tpl-tot-2' }] });
  ok(r.added === 1 && r.dropped === 2 && r.saved, 'bản ghi hỏng trong file sao lưu bị bỏ và đếm, bản tốt vẫn được khôi phục');
  ok((await restoreTemplates(undefined)).added === 0 && (await restoreTemplates({ v: 2, templates: [] })).added === 0 && (await restoreTemplates({ v: 1 })).added === 0, 'phần sao lưu không hiểu được (thiếu/sai phiên bản) bị bỏ qua, không đổi gì');
  // bản ghi định dạng mới hơn đi theo file sao lưu và được giữ
  const withNew = { v: 1, templates: [{ id: 'tpl-sau', fmt: 3, du: 'lieu' }] };
  await fresh(); await restoreTemplates(withNew);
  ok(unsupportedCount() === 1 && JSON.parse(disk.json!).templates[0].du === 'lieu' && JSON.stringify(templatesForBackup().templates[0]) === JSON.stringify(withNew.templates[0]), 'bản ghi định dạng mới hơn được giữ nguyên qua khôi phục và sao lưu lại');
}

console.log('Khóa ghi khi thay cả tệp dữ liệu');
{
  await fresh();
  await createTemplate(snapshotFrom(draft(), tax, 'Trước khi khôi phục', 1));
  const snap = disk.json;
  ok(await flushTemplates(), 'flush: không còn gì chờ ghi');
  freezeTemplates();
  const c = await createTemplate(snapshotFrom(draft(), tax, 'Sau khi khóa'));
  ok(!c.ok && disk.json === snap, 'đã khóa ghi (đang khôi phục): mọi thao tác bị từ chối, tệp không bị đè');
  const r = await restoreTemplates({ v: 1, templates: [] });
  ok(r.added === 0, 'khôi phục khi đã khóa không đổi gì');
}

console.log('Quy mô lớn');
{
  await fresh();
  const big = snapshotFrom({ ...draft(), rows: Array.from({ length: MAX_ROWS }, (_, i) => ({ id: `r${i}`, scope: { kind: 'form' as const, id: frm.id }, type: 'tn' as const, level: 'NB' as const, count: 1 })) }, tax, 'Lớn', 1);
  const over = await createTemplate({ ...big, name: 'Quá lớn', rows: [...big.rows, big.rows[0]] });
  ok(!over.ok, `quá ${MAX_ROWS} dòng bị từ chối`);
  const t0 = Date.now();
  const all: Template[] = Array.from({ length: MAX_TEMPLATES }, (_, i) => ({ ...big, id: `tpl-${String(i).padStart(4, '0')}`, name: `Mẫu ${i}` }));
  const file = JSON.stringify({ v: 1, templates: all });
  disk.json = file;
  const l = await reopen();
  ok(l.ok && listTemplates().length === MAX_TEMPLATES, `${MAX_TEMPLATES} mẫu × ${MAX_ROWS} dòng đọc đủ (${Math.round(file.length / 1024)} KB, ${Date.now() - t0} ms trên máy kiểm thử; không phải bảo đảm hiệu năng)`);
  ok(!(await createTemplate({ ...big, name: 'Thứ 501' })).ok, `tối đa ${MAX_TEMPLATES} mẫu`);
  const t1 = Date.now();
  ok((await renameTemplate('tpl-0007', 'Đổi trong kho lớn')).ok && JSON.parse(disk.json!).templates.length === MAX_TEMPLATES, `đổi tên trong kho lớn ghi đủ (${Date.now() - t1} ms)`);
  ok(new Set(Array.from({ length: 2000 }, () => newTemplateId())).size === 2000, 'ID sinh ra không trùng');
  ok(listTemplates().length === MAX_TEMPLATES && newRowId() !== newRowId(), 'bộ sinh mã dòng cho áp dụng mẫu cho mã khác nhau');
}

_resetTemplates(null);
if (fail) process.exit(1);
console.log('examtemplates: đạt hết.');
