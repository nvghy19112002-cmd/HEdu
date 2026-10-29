// Duyệt theo lô nguồn tin cậy: chỉ câu đạt đủ điều kiện mới được đánh dấu "Đã duyệt".
import { answerReadable, trustBlock, trustTag, type TrustInput } from './importtrust';
import type { Issue } from './check';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const opt = (correct: boolean) => ({ text: 'x', correct });
const tn = { type: 'tn' as const, options: [opt(false), opt(true), opt(false), opt(false)], shortAnswer: null };
const base: TrustInput = { status: 'new', issues: [], p: tn, idOk: true };
const warn = (message: string): Issue => ({ level: 'canh', message });

console.log('Đọc được đáp án');
ok(answerReadable(tn), 'trắc nghiệm 4 phương án, đúng một đáp án');
ok(!answerReadable({ ...tn, options: [opt(true), opt(true), opt(false), opt(false)] }), 'trắc nghiệm hai đáp án đúng ⇒ không chắc');
ok(!answerReadable({ ...tn, options: [opt(false), opt(false), opt(false), opt(false)] }), 'trắc nghiệm không có đáp án ⇒ không chắc');
ok(!answerReadable({ ...tn, options: [opt(true), opt(false), opt(false)] }), 'trắc nghiệm 3 phương án ⇒ không chắc');
ok(answerReadable({ type: 'ds', options: [opt(false), opt(false), opt(false), opt(false)], shortAnswer: null }), 'đúng/sai đủ 4 ý (kể cả cả 4 ý sai)');
ok(!answerReadable({ type: 'ds', options: [opt(true), opt(false)], shortAnswer: null }), 'đúng/sai thiếu ý ⇒ không chắc');
ok(answerReadable({ type: 'tln', options: [], shortAnswer: '0,5' }) && !answerReadable({ type: 'tln', options: [], shortAnswer: ' ' }), 'trả lời ngắn phải có đáp án');
ok(answerReadable({ type: 'tl', options: [], shortAnswer: null }), 'tự luận: không cần đáp án');

console.log('Điều kiện duyệt theo lô');
ok(trustBlock(base) === null, 'câu mới, không lỗi, đáp án chắc, ID khớp ⇒ được duyệt');
ok(trustBlock({ ...base, status: 'template' }) === null, 'cùng mẫu khác dữ kiện vẫn là câu khác ⇒ được duyệt');
for (const s of ['sure', 'near', 'conflict', 'unread', 'hold']) ok(trustBlock({ ...base, status: s }) === 'trung', `rà trùng "${s}" ⇒ không duyệt`);
ok(trustBlock({ ...base, issues: undefined }) === 'xem-truoc', 'chưa kiểm xong ⇒ không duyệt');
ok(trustBlock({ ...base, issues: [{ level: 'loi', message: 'ngoặc lệch' }] }) === 'loi-ma', 'mã có lỗi ⇒ không duyệt');
ok(trustBlock({ ...base, issues: [warn('Xem trước chưa dựng chuẩn. Chưa hiểu: \\foo.')] }) === 'xem-truoc', 'xem trước chưa chuẩn ⇒ không duyệt');
ok(trustBlock({ ...base, issues: [warn('Câu chưa có \\loigiai{…}.')] }) === null, 'chỉ thiếu lời giải: vẫn duyệt được (không ảnh hưởng đáp án)');
ok(trustBlock({ ...base, p: { ...tn, options: [opt(false), opt(false), opt(false), opt(false)] } }) === 'dap-an', 'không có đáp án ⇒ không duyệt');
ok(trustBlock({ ...base, idOk: false }) === 'id', 'ID thiếu/bất đồng ⇒ không duyệt');

console.log('Dấu vết');
ok(trustTag('Đề Sở 2025', new Date(2026, 9, 29)) === 'Duyệt theo lô: Đề Sở 2025', 'nhãn theo tên lô');
ok(trustTag('  ', new Date(2026, 9, 29)).startsWith('Duyệt theo lô: ') && trustTag('', new Date(2026, 9, 29)).includes('2026'), 'lô không tên ⇒ nhãn theo ngày');

if (fail) process.exit(1);
console.log('importtrust: đạt hết.');
