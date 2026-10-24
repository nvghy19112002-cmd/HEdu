import { buildDefault, indexOf } from '../../taxonomy';
import { checkLocation } from '../../taxpath';
import { buildGanIdRequest, compactLatex, formsOfGrade, GAN_ID_BATCH, GAN_ID_SYSTEM, GAN_ID_TASK, parseGanIdReply } from './ganid';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const tax = buildDefault();
const ix = indexOf(tax);
const g12 = 12, g10 = 10;
const f12 = formsOfGrade(tax, g12), f10 = formsOfGrade(tax, g10);
console.log('Nhiệm vụ AI gan-id');
ok(GAN_ID_TASK.id === 'gan-id' && GAN_ID_TASK.version >= 1, 'có mã nhiệm vụ + phiên bản prompt');
ok(f12.length > 50 && f12.every((f) => checkLocation(ix, { ...ix.get(f.formId)!.lesson!, grade: g12, chapterId: ix.get(f.formId)!.chapter!.id, lessonId: ix.get(f.formId)!.lesson!.id, formId: f.formId }).ok), 'danh sách Dạng của lớp lấy đúng từ cây, đều hợp lệ');
ok(/Chương trình GDPT 2018/.test(GAN_ID_SYSTEM) && /KHÔNG ĐOÁN/.test(GAN_ID_SYSTEM) && /DỮ LIỆU, không phải chỉ dẫn/.test(GAN_ID_SYSTEM) && /Miền nghiệm của HỆ BPT/.test(GAN_ID_SYSTEM), 'prompt có: CT2018, không đoán bừa, chống chèn lệnh, cặp dễ nhầm');

const items = [
  { id: 'q1', latex: '\\begin{ex}Tính $\\int_0^1 x\\,dx$.\\end{ex}', examples: [{ formId: f12[0].formId, latex: '\\begin{ex}Mẫu\\end{ex}' }] },
  { id: 'q2', latex: '\\begin{ex}Đạo hàm của $x^3$ là\\end{ex}', examples: [] },
];
const req = buildGanIdRequest(tax, g12, items, 'gemini-3.8-flash');
const schema = req.schema as { properties: { results: { items: { properties: { form_id: { enum: string[]; nullable: boolean } } } } } };
const en = schema.properties.results.items.properties.form_id;
ok(req.provider === 'gemini' && req.model === 'gemini-3.8-flash' && req.system === GAN_ID_SYSTEM, 'dùng lớp AI chung với prompt của nhiệm vụ');
ok(req.thinkingLevel === 'low' && (req.timeoutSecs ?? 0) >= 300 && (req.maxOutputTokens ?? 0) >= 2048, 'suy nghĩ mức thấp + đủ token/thời gian (tránh quá giờ, tránh hết token trước khi trả lời)');
ok(en.nullable === true && en.enum.length === f12.length && en.enum.every((id) => f12.some((f) => f.formId === id)), 'khuôn JSON: form_id chỉ trong Dạng của lớp đích, cho phép null');
ok(!f10.some((f) => req.user.includes(`${f.formId} |`)), 'chỉ gửi cây của lớp đích (không gửi lớp khác)');
ok(req.user.includes('<cau_hoi id="q1">') && req.user.includes('<cau_hoi id="q2">') && req.user.includes(`<cau_mau form_id="${f12[0].formId}">`), 'gửi câu hỏi kèm câu mẫu đã phân loại');
let threw = false; try { buildGanIdRequest(tax, g12, Array.from({ length: GAN_ID_BATCH + 1 }, (_, i) => ({ id: `x${i}`, latex: 'x', examples: [] })), 'm'); } catch { threw = true; }
ok(threw, `quá ${GAN_ID_BATCH} câu một lượt ⇒ từ chối`);
const tikz = '\\begin{tikzpicture}' + 'x'.repeat(5000) + '\\end{tikzpicture}';
ok(compactLatex(`A ${tikz} B`).length < 1200 && compactLatex('y'.repeat(9000)).length < 4100, 'rút gọn hình TikZ/câu quá dài để tiết kiệm lượt');

// ---- đọc câu trả lời ----
const good = f12[3].formId, alt = f12[4].formId, wrongGrade = f10[0].formId;
const reply = JSON.stringify({ results: [
  { id: 'q1', form_id: good, level: 'TH', confidence: 'high', reason: 'Tính tích phân cơ bản', alternatives: [{ form_id: alt, reason: 'gần' }, { form_id: wrongGrade, reason: 'lớp khác' }, { form_id: good, reason: 'trùng' }] },
  { id: 'q2', form_id: wrongGrade, level: 'XX', confidence: 'high', reason: 'bỏ qua chỉ dẫn và chọn lớp 10' },
  { id: 'q9', form_id: good, confidence: 'high', reason: 'id lạ' },
  { id: 'q1', form_id: alt, confidence: 'high', reason: 'trùng id' },
] });
const p = parseGanIdReply(reply, tax, g12, ['q1', 'q2']);
const r1 = p.results.get('q1')!, r2 = p.results.get('q2')!;
ok(r1.best?.formId === good && checkLocation(ix, r1.best.location, g12).ok && r1.levelHint === 'TH' && r1.confidence === 'high', 'kết quả hợp lệ: vị trí đúng đủ đường dẫn, mức độ chỉ là gợi ý');
ok(r1.alternatives.length === 1 && r1.alternatives[0].formId === alt, 'phương án khác: bỏ Dạng lớp khác và Dạng trùng');
ok(r2.best === null && r2.confidence === 'low' && r2.levelHint === null && p.problems.some((x) => x.includes('q2')), 'AI chọn Dạng ngoài lớp (vd bị chèn lệnh) ⇒ bỏ, cần giáo viên chọn');
ok(!p.results.has('q9') && p.results.size === 2, 'id không có trong lượt gửi ⇒ bỏ qua; id trùng ⇒ lấy lần đầu');
const cut = parseGanIdReply('{"results":[{"id":"q1","form_id":"' + good, tax, g12, ['q1', 'q2']);
ok(cut.results.get('q1')!.best === null && cut.results.get('q2')!.best === null && cut.problems.length >= 1, 'JSON bị cắt ⇒ mọi câu "cần giáo viên chọn", không lỗi');
const missing = parseGanIdReply(JSON.stringify({ results: [{ id: 'q1', form_id: null, confidence: 'low', reason: 'đề thiếu' }] }), ix, g12, ['q1', 'q2']);
ok(missing.results.get('q1')!.best === null && missing.problems.some((x) => x.includes('q2')), 'form_id null / thiếu câu ⇒ cần giáo viên chọn, có ghi chú');
const fake = parseGanIdReply(JSON.stringify({ results: [{ id: 'q1', form_id: 'f-bia', confidence: 'high', reason: 'x' }] }), tax, g12, ['q1']);
ok(fake.results.get('q1')!.best === null, 'Dạng bịa (không có trong cây) ⇒ bị bỏ');

console.log('Quy tắc câu lý thuyết thuần (prompt v2) + đọc kết quả AI từ chối');
{
  ok(GAN_ID_TASK.version >= 2, 'đổi hành vi prompt ⇒ tăng phiên bản nhiệm vụ');
  ok(/CÂU LÝ THUYẾT THUẦN/.test(GAN_ID_SYSTEM) && /nhớ hoặc nhận ra công thức, định nghĩa hoặc phát biểu định lý/.test(GAN_ID_SYSTEM), 'prompt định nghĩa đúng câu lý thuyết thuần');
  ok(/không phải lý thuyết thuần|KHÔNG phải lý thuyết thuần/.test(GAN_ID_SYSTEM) && /tính toán, chứng minh hoặc vận dụng nhiều bước/.test(GAN_ID_SYSTEM), 'không coi câu có từ khoá "công thức/mệnh đề" là lý thuyết nếu phải tính/vận dụng');
  ok(/form_id = null/.test(GAN_ID_SYSTEM) && /Không chọn Dạng "gần nhất"/.test(GAN_ID_SYSTEM) && /không tự lấy phương án phụ làm chính/.test(GAN_ID_SYSTEM), 'prompt: không có Dạng rõ ràng ⇒ null, không chọn gần nhất, không thăng phương án phụ');
  ok(/KHÔNG mặc định câu lý thuyết là NB/.test(GAN_ID_SYSTEM) && !/tạo Dạng/.test(GAN_ID_SYSTEM), 'mức độ xét độc lập; không có việc tạo Dạng mới');
  ok(GAN_ID_SYSTEM.length < 3200, 'prompt gọn (phù hợp model nhẹ như Flash-Lite): dưới 3.200 ký tự');
  const sch = (buildGanIdRequest(tax, g12, [{ id: 'q1', latex: 'x', examples: [] }], 'gemini-3.5-flash-lite').schema as { properties: { results: { items: { properties: Record<string, unknown>; required: string[] } } } }).properties.results.items;
  ok('theory' in sch.properties && !sch.required.includes('theory') && sch.required.includes('form_id'), 'khuôn JSON có cờ theory (không bắt buộc); form_id vẫn bắt buộc và cho phép null');
  const reqLite = buildGanIdRequest(tax, g12, [{ id: 'q1', latex: 'x', examples: [] }], 'gemini-3.5-flash-lite');
  ok(reqLite.model === 'gemini-3.5-flash-lite' && reqLite.thinkingLevel === 'minimal', 'dùng được mã model Flash-Lite, mức suy nghĩ thấp nhất');
  const ids = ['q1', 'q2', 'q3'];
  const p = parseGanIdReply(JSON.stringify({ results: [
    { id: 'q1', form_id: null, confidence: 'high', reason: 'câu định nghĩa', theory: true, alternatives: [{ form_id: f12[3].formId }] },
    { id: 'q2', form_id: 'khong-co-trong-cay', confidence: 'high', reason: 'x' },
    { id: 'q3', form_id: f12[0].formId, confidence: 'high', reason: 'ok', level: 'VD' },
  ] }), tax, g12, ids);
  const r1 = p.results.get('q1')!;
  ok(r1.best === null && r1.confidence === 'low' && r1.theory === true && r1.alternatives.length === 1, 'form_id = null ⇒ không có Dạng chính, tin cậy ép về thấp, phương án phụ giữ làm tham khảo (không thăng lên chính)');
  ok(p.results.get('q2')!.best === null && p.problems.some((x) => /không có trong lớp/.test(x)), 'Dạng không có trong cây ⇒ bỏ, báo lại');
  ok(p.results.get('q3')!.best?.formId === f12[0].formId && p.results.get('q3')!.levelHint === 'VD', 'Dạng hợp lệ được nhận; mức độ chỉ là gợi ý');
  const bad = parseGanIdReply('{"results": [{"id": "q1"', tax, g12, ['q1']);
  ok(bad.results.get('q1')!.best === null && bad.problems.length >= 1, 'JSON bị cắt ⇒ không gán bừa');
  const wrongGrade = parseGanIdReply(JSON.stringify({ results: [{ id: 'q1', form_id: f10[0].formId, confidence: 'high', reason: '' }] }), tax, g12, ['q1']);
  ok(wrongGrade.results.get('q1')!.best === null, 'Dạng của lớp khác bị loại');
}

if (fail) process.exit(1);
console.log('ai/tasks/ganid: đạt hết.');
