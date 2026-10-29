// Gán ID nhờ AI ngoài: lô xuất (bỏ ID, trộn câu đối chứng), đọc tệp đề xuất, kế hoạch nhập (đo độ đúng, không đụng câu đã xác minh).
import { buildLot, latestPending, lotRows, parseProposal, planImport, PROPOSAL_FORMAT, type ProposalFile } from './claudeid';
import { contentKeys, type Effective } from './idreview';
import { buildDefault, indexOf } from './taxonomy';
import { taxRevision } from './taxpath';
import type { Question } from './types';

let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
const tax = buildDefault();
const ix = indexOf(tax);
const taxRev = taxRevision(tax);
const g12 = tax.grades.find((g) => g.grade === 12)!;
const forms = g12.branches.flatMap((b) => b.chapters.flatMap((c) => c.lessons.flatMap((l) => l.forms.map((f) => ({ c, l, f })))));
const [A, B, C] = [forms[0], forms[1], forms[forms.length - 1]];
let n = 0;
const q = (at: typeof A, id = ''): Question => {
  n++;
  return { uid: `u${n}`, seq: n, latex: `\\begin{ex}${id ? `%[${id}]` : ''}\n Câu số ${n} về ${at.f.name}.\n \\choice{\\True 1}{2}{3}{4}\n\\end{ex}`, type: 'tn', level: 'TH', tags: [], createdAt: 0, updatedAt: 0, grade: 12, chapterId: at.c.id, lessonId: at.l.id, formId: at.f.id, review: 'approved' };
};
const pool = [q(A, '2D1H1-1'), q(A), q(B), q(C), q(A), q(B), q(C), q(A), q(B), q(C)];
const gv = new Set(['u5', 'u6', 'u7', 'u8', 'u9', 'u10']);
const eff = (x: Question): Effective => (gv.has(x.uid) ? { form: 'gv', level: 'gv', unclassified: false } : x.uid === 'u2' ? { form: 'xem-lai', level: 'chua', unclassified: false } : { form: 'chua', level: 'chua', unclassified: false });

console.log('Lô xuất cho AI ngoài');
const { lot, need, gold } = buildLot(pool, { tax, ix, taxRev, effOf: eff, size: 3, goldShare: 0.67, lo: 'L001', seed: 3 });
ok(need === 3 && gold === 2 && lot.cau.length === 5, `3 câu cần gán + 2 câu đối chứng (ngầm): ${need}/${gold}`);
ok(lot.cau.some((x) => x.k === 'u2'), 'câu "cần xem lại" được ưu tiên vào lô');
ok(lot.cau.every((x) => !/%\[/.test(x.latex)), 'đề trong lô đã bỏ ID cũ (AI không dựa vào ID sai)');
ok(lot.cau.every((x) => !gv.has(x.k) || lot.cau.some((y) => y.k === x.k)) && !('dung' in (lot.cau[0] as object)), 'không lộ câu nào là đối chứng, không kèm đáp án Dạng');
ok(lot.dang.length === forms.length && lot.dang[0].ma.includes('·') && lot.dang[0].duong.startsWith('Lớp 12 › '), 'danh sách Dạng của lớp có trong lô, mã có chỗ mức độ (·), đường dẫn đủ');
ok(lot.dang.every((f) => f.vd.length <= 2) && lot.dang.some((f) => f.vd.length > 0), 'đề mẫu từ câu giáo viên đã xác minh (≤ 2 mỗi Dạng)');
ok(lot.huongDan.join(' ').includes(PROPOSAL_FORMAT), 'hướng dẫn ghi rõ định dạng tệp trả về');

console.log('Đọc tệp đề xuất');
ok(!parseProposal('không phải json').ok && !parseProposal('{"format":"khac"}').ok, 'sai định dạng ⇒ báo lỗi, không đoán');
const fp = (uid: string) => contentKeys(pool.find((x) => x.uid === uid)!.latex).i;
const prop: ProposalFile = { format: PROPOSAL_FORMAT, v: 1, lo: 'L001', boi: 'Claude', cau: [
  { k: 'u1', fp: fp('u1'), dang: A.f.id, muc: 'NB', chac: 'cao', lyDo: 'đúng kiến thức' },   // đồng ý
  { k: 'u2', fp: fp('u2'), dang: B.f.id, chac: 'vua', lyDo: 'đổi Dạng' },                      // khác
  { k: 'u3', fp: 'sai', dang: A.f.id, chac: 'cao', lyDo: '' },                                // câu đã sửa
  { k: 'u4', fp: fp('u4'), dang: 'khong-co', chac: 'cao', lyDo: '' },                          // Dạng lạ
  { k: 'u6', fp: fp('u6'), dang: B.f.id, muc: 'TH', chac: 'cao', lyDo: '' },                   // đối chứng đúng
  { k: 'u7', fp: fp('u7'), dang: A.f.id, chac: 'thap', lyDo: '' },                            // đối chứng sai
  { k: 'u1', fp: fp('u1'), dang: A.f.id, chac: 'cao', lyDo: '' },                             // trùng
] };
const r = parseProposal(JSON.stringify({ ...prop, cau: [...prop.cau, { k: 1 }] }));
ok(r.ok && r.p.cau.length === 7 && r.dropped === 1, 'dòng hỏng bị bỏ và đếm');

console.log('Kế hoạch nhập');
const plan = planImport(prop, pool, { ix, taxRev, effOf: eff, now: 1 });
ok(plan.recs.length === 2 && plan.dongY === 1 && plan.khac === 1, `chỉ đặt bản ghi cho câu chưa xác minh: ${plan.recs.length}`);
const [r1, r2] = [plan.recs.find(([u]) => u === 'u1')![1], plan.recs.find(([u]) => u === 'u2')![1]];
ok(r1.form === 'may' && r1.src === 'ai-ngoai' && r1.formId === A.f.id && /Claude/.test(r1.why ?? '') && /mức NB/.test(r1.why ?? ''), 'đồng ý ⇒ "Máy phân loại" nguồn AI ngoài, ghi lý do và mức đề xuất');
ok(r2.form === 'xem-lai' && r2.prop === B.f.id && r2.formId === A.f.id, 'khác ⇒ "Cần xem lại" + Dạng đề xuất; KHÔNG đổi Dạng đang lưu');
ok(plan.skip['doi-noi-dung'] === 1 && plan.skip['dang-la'] === 1 && plan.skip.trung === 1, 'bỏ qua có lý do: câu đã sửa, Dạng lạ, trùng');
ok(plan.gold.n === 2 && plan.gold.dang === 1 && plan.gold.chuong >= 1 && plan.gold.muc === 1 && plan.gold.sai[0].uid === 'u7', 'đo độ đúng trên câu đối chứng, không đổi câu đã xác minh');
ok(!plan.recs.some(([u]) => gv.has(u)), 'câu giáo viên đã xác minh không bị đặt bản ghi');

console.log('Thư mục trao đổi');
{
  const files = [
    { name: 'hedu-gan-id-L1.json', bytes: 1, mtimeMs: 100 }, { name: 'de-xuat-L1.json', bytes: 1, mtimeMs: 300 },
    { name: 'hedu-gan-id-L2.json', bytes: 1, mtimeMs: 200 },
    { name: 'hedu-gan-id-L3.json', bytes: 1, mtimeMs: 400 }, { name: 'de-xuat-L3.json', bytes: 1, mtimeMs: 500 },
    { name: 'ghi-chu.json', bytes: 1, mtimeMs: 999 },
  ];
  const rows = lotRows(files, new Set(['L3']));
  ok(rows.map((r) => `${r.lo}:${r.state}`).join() === 'L3:da-nhap,L1:co-de-xuat,L2:cho-claude', `gom theo lô, trạng thái đúng, mới nhất trước: ${rows.map((r) => r.lo + ':' + r.state).join()}`);
  ok(latestPending(rows)?.lo === 'L1' && latestPending(lotRows(files, new Set(['L1', 'L3']))) === null, 'lô mới nhất có đề xuất CHƯA nhập');
  ok(lot.huongDan.some((x) => x.includes('de-xuat-<lo>.json')), 'hướng dẫn nói rõ tên và nơi ghi tệp đề xuất');
}
if (fail) { console.log(`\n${fail} kiểm thử claudeid lỗi`); process.exit(1); }
console.log('claudeid: đạt hết.');
