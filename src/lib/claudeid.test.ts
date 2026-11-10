// Gán ID nhờ AI ngoài: lô xuất (bỏ ID, trộn câu đối chứng), đọc tệp đề xuất, kế hoạch nhập (đo độ đúng, không đụng câu đã xác minh).
import { buildLot, latestPending, lotRows, parseProposal, planImport, PROPOSAL_FORMAT, type ProposalFile } from './claudeid';
import { contentKeys, makeRec, type Effective } from './idreview';
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
ok(r1.propLevel === 'NB' && r1.level0 === 'TH' && r2.propLevel === undefined, 'mức đề xuất khác mức đang lưu ⇒ giữ ở propLevel để giáo viên bấm dùng, KHÔNG đổi mức của câu');
ok(lot.huongDan.some((x) => x.includes('YÊU CẦU TƯ DUY')) && lot.huongDan.some((x) => x.includes('nhiều ý')), 'hướng dẫn có quy tắc mức độ và cách làm câu nhiều ý');
ok(lot.huongDan.some((x) => x.includes('SAU CÙNG') && x.includes('KHÔNG theo số đông')), 'câu nhiều ý khác Dạng: lấy Dạng của ý học sau cùng, không theo số đông (E4, 31/10/2026)');
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
console.log('Câu Chưa có ID (vị trí giữ chỗ Lớp 12, thật ra là câu lớp 10)');
{
  const g10 = tax.grades.find((g) => g.grade === 10)!;
  const f10 = g10.branches.flatMap((b) => b.chapters.flatMap((c) => c.lessons.flatMap((l) => l.forms.map((f) => ({ c, l, f })))));
  const [X, Y] = [q(A), q(A)]; // nằm ở Dạng đầu Lớp 12 (chỗ giữ)
  const recX = makeRec(X, { form: 'chua', src: 'tay', taxRev, unclassified: true, lop: 10 });
  const recY = makeRec(Y, { form: 'chua', src: 'tay', taxRev, unclassified: true });
  ok(recX.lop === 10 && recY.lop === undefined && makeRec(X, { form: 'chua', src: 'tay', taxRev, lop: 10 }).lop === undefined, 'lớp chỉ được ghi kèm dấu Chưa có ID');
  const effN = (x: Question): Effective => (x.uid === X.uid ? { form: 'chua', level: 'chua', unclassified: true, rec: recX } : x.uid === Y.uid ? { form: 'chua', level: 'chua', unclassified: true, rec: recY } : eff(x));
  const p2 = [...pool, X, Y];
  const L = buildLot(p2, { tax, ix, taxRev, effOf: effN, size: 100, goldShare: 0, lo: 'L2', seed: 1 }).lot;
  ok(L.cau.find((c) => c.k === X.uid)?.lop === 10, 'câu Chưa có ID xuất lớp chọn khi nhập (10), không lấy 12 của chỗ giữ');
  ok(L.cau.find((c) => c.k === Y.uid)?.lop === null, 'chưa rõ lớp ⇒ "lop": null');
  ok(L.dang.some((d) => d.duong.startsWith('Lớp 10 › ')) && L.dang.some((d) => d.duong.startsWith('Lớp 11 › ')), 'có câu chưa rõ lớp ⇒ gửi Dạng của mọi lớp');
  const P: ProposalFile = { format: PROPOSAL_FORMAT, v: 1, lo: 'L2', boi: 'Claude', cau: [
    { k: X.uid, fp: contentKeys(X.latex).i, dang: f10[0].f.id, chac: 'cao', lyDo: 'lớp 10' },
    { k: Y.uid, fp: contentKeys(Y.latex).i, dang: f10[1].f.id, chac: 'vua', lyDo: 'lớp 10' },
  ] };
  const pl = planImport(P, p2, { ix, taxRev, effOf: effN, now: 1 });
  ok(!pl.skip['sai-lop'] && pl.recs.length === 2, `đề xuất Dạng lớp 10 được nhận (không loại "sai-lop" theo chỗ giữ Lớp 12): ${JSON.stringify(pl.skip)}`);
  const rx = pl.recs.find(([u]) => u === X.uid)![1];
  ok(rx.form === 'xem-lai' && rx.prop === f10[0].f.id && rx.unclassified === true && rx.lop === 10, 'vào hàng đợi với Dạng đề xuất, vẫn ở mục Chưa có ID (giữ lớp) cho tới khi giáo viên chọn');
  const f11 = tax.grades.find((g) => g.grade === 11)!.branches[0].chapters[0].lessons[0].forms[0];
  const pl2 = planImport({ ...P, cau: [{ ...P.cau[0], dang: f11.id }] }, p2, { ix, taxRev, effOf: effN, now: 1 });
  ok(pl2.skip['sai-lop'] === 1, 'đã biết lớp 10 ⇒ Dạng lớp 11 vẫn bị loại "sai-lop"');
}
console.log('Kiểm tra lại (lô K…): soát cả câu đã xác minh, không đổi câu');
{
  const rq = [q(A), q(A), q(B), q(C)]; // v1: đã xác minh Dạng + mức; v2: đã xác minh Dạng; v3: máy phân loại, mức đã xác minh; v4: chưa xác minh
  const [v1, v2, v3, v4] = rq;
  const recs = new Map([
    [v1.uid, makeRec(v1, { form: 'gv', level: 'gv', src: 'tay', taxRev, why: 'Giáo viên xác nhận Dạng' })],
    [v2.uid, makeRec(v2, { form: 'gv', src: 'tay', taxRev })],
    [v3.uid, makeRec(v3, { form: 'may', level: 'gv', src: 'ai-ngoai', taxRev })],
  ]);
  const effR = (x: Question): Effective => { const r = recs.get(x.uid); return r ? { form: r.form, level: r.level, unclassified: false, src: r.src, ...(r.why ? { why: r.why } : {}), rec: r } : { form: 'chua', level: 'chua', unclassified: false }; };
  const { lot: kl, need: kn, gold: kg } = buildLot(rq, { tax, ix, taxRev, effOf: effR, size: 300, goldShare: 0.1, lo: 'K001', seed: 1, recheck: true });
  ok(kn === 4 && kg === 0 && kl.cau.length === 4 && kl.kieu === 'kiem-tra-lai', 'lô kiểm tra lại gồm MỌI câu đang lọc (kể cả đã xác minh), không trộn đối chứng');
  ok(kl.huongDan.some((x) => x.includes('KIỂM TRA LẠI')) && kl.cau.every((x) => !/%\[/.test(x.latex)), 'hướng dẫn nói rõ kiểu lô; đề vẫn bỏ ID cũ');
  const fpR = (x: Question) => contentKeys(x.latex).i;
  const kp: ProposalFile = { format: PROPOSAL_FORMAT, v: 1, lo: 'K001', boi: 'Claude', cau: [
    { k: v1.uid, fp: fpR(v1), dang: A.f.id, muc: 'VD', chac: 'cao', lyDo: 'đúng Dạng, mức cao hơn' }, // đồng ý Dạng, khác mức
    { k: v2.uid, fp: fpR(v2), dang: B.f.id, muc: 'TH', chac: 'vua', lyDo: 'Dạng khác' },              // khác Dạng
    { k: v3.uid, fp: fpR(v3), dang: B.f.id, muc: 'TH', chac: 'cao', lyDo: '' },                       // đồng ý hết
    { k: v4.uid, fp: fpR(v4), dang: C.f.id, muc: 'NB', chac: 'cao', lyDo: '' },                       // chưa xác minh, đồng ý Dạng
  ] };
  const kpl = planImport(kp, rq, { ix, taxRev, effOf: effR, now: 2 });
  const get = (x: Question) => kpl.recs.find(([u]) => u === x.uid)?.[1];
  ok(kpl.recheck && kpl.gold.n === 2 && kpl.gold.dang === 1 && kpl.gold.muc === 1, 'vẫn đo độ đúng trên câu đã xác minh');
  const r1 = get(v1)!, r2 = get(v2)!;
  ok(r1.form === 'gv' && r1.level === 'gv' && r1.src === 'tay' && r1.propLevel === 'VD' && r1.level0 === 'TH', 'đồng ý Dạng, khác mức ⇒ GIỮ xác minh, chỉ thêm mức đề xuất');
  ok(r2.form === 'xem-lai' && r2.prop === B.f.id && r2.formId === A.f.id && /Kiểm tra lại/.test(r2.why ?? ''), 'khác Dạng ⇒ Cần xem lại kèm Dạng đề xuất, Dạng đang lưu giữ nguyên');
  ok(get(v3)?.form === 'may' && get(v3)?.level === 'gv' && get(v3)?.propLevel === undefined, 'máy phân loại, đồng ý cả Dạng lẫn mức ⇒ vẫn máy phân loại, giữ mức đã xác minh');
  ok(get(v4)?.form === 'may' && get(v4)?.propLevel === 'NB', 'câu chưa xác minh xử lý như lô thường');
  ok(kpl.mucKhac === 2 && kpl.dongY === 3 && kpl.khac === 1, 'đếm: 2 câu khác mức, 3 đồng ý Dạng, 1 khác Dạng');
  // lô thường: câu máy phân loại đã xác minh mức độ giữ trạng thái mức khi nhập đề xuất
  const np = planImport({ ...kp, lo: 'L002', cau: [{ ...kp.cau[2], dang: C.f.id }] }, rq, { ix, taxRev, effOf: effR, now: 3 });
  ok(!np.recheck && np.recs[0][1].level === 'gv' && np.recs[0][1].form === 'xem-lai', 'nhập đề xuất không xoá mức độ giáo viên đã xác minh');
  const np2 = planImport({ ...kp, lo: 'L003' }, rq, { ix, taxRev, effOf: effR, now: 3 });
  ok(np2.recs.every(([u]) => u !== v1.uid && u !== v2.uid), 'lô thường: câu đã xác minh Dạng chỉ là đối chứng, không bị đặt bản ghi');
}
if (fail) { console.log(`\n${fail} kiểm thử claudeid lỗi`); process.exit(1); }
console.log('claudeid: đạt hết.');
