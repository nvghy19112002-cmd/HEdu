// Duyệt nhờ Claude: xuất lô, đọc kết quả, kế hoạch áp dụng an toàn, hoàn tác.
import { applyChange, buildReviewLot, reviewLotRows, lotTag, loiTag, parseReviewResult, planReview, undoChange, REVIEW_RESULT_FORMAT } from './claudereview';
import { contentKeys } from './idreview';
import type { Question } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

let n = 0;
const q = (o: Partial<Question> = {}): Question => { n++; return { uid: `u${n}`, seq: n, latex: String.raw`\begin{ex} Câu ${n}: $1+1=?$ \choice{\True 2}{3}{4}{5} \loigiai{Ta có $1+1=2$.} \end{ex}`.replace('Câu ' + n, `Câu ${n}`) + n, type: 'tn', level: 'NB', tags: [], createdAt: n, updatedAt: n, grade: 10, chapterId: 'c', lessonId: 'l', formId: 'f', ...o }; };
const a = q(), b = q(), c = q({ review: 'approved' }), d = q({ review: 'needs_fix' }), e = q();
const bank = [a, b, c, d, e];
const fp = (x: Question) => contentKeys(x.latex).i;

console.log('Xuất lô');
{
  const { lot, total } = buildReviewLot(bank, { lo: 'R1', size: 2 });
  ok(total === 3 && lot.cau.length === 2, 'mặc định chỉ lấy câu Chưa kiểm tra, cắt theo cỡ lô');
  ok(lot.cau[0].k === a.uid && lot.cau[0].fp === fp(a) && lot.cau[0].latex.includes('\\loigiai'), 'gửi đủ LaTeX (cả lời giải) và dấu vân tay');
  ok(buildReviewLot(bank, { lo: 'R1', size: 99, includeReviewed: true }).total === 5, 'tuỳ chọn gồm cả câu đã kiểm tra');
}

console.log('Đọc tệp kết quả');
{
  ok(!parseReviewResult('{x').ok, 'JSON hỏng bị từ chối');
  ok(!parseReviewResult(JSON.stringify({ format: 'khac', cau: [] })).ok, 'sai format bị từ chối');
  const r = parseReviewResult(JSON.stringify({ format: REVIEW_RESULT_FORMAT, v: 1, lo: 'R1', cau: [
    { k: a.uid, fp: fp(a), kq: 'dat', loi: [], ghiChu: '' },
    { k: b.uid, fp: fp(b), kq: 'can-sua', loi: ['dap-an', 'xyz'], ghiChu: 'Đáp án đúng là B', dapAnDung: 'B' },
    { k: e.uid, fp: fp(e), kq: 'can-sua', ghiChu: 'mơ hồ' },
    { k: a.uid, fp: fp(a), kq: 'dat' }, { k: 'x', kq: 'dat' }, { k: 'y', fp: 'z', kq: 'tot' },
  ] }));
  ok(r.ok && r.r.cau.length === 3 && r.dropped === 3, 'bỏ dòng trùng k / thiếu fp / kq lạ');
  ok(r.ok && r.r.cau[1].loi.join() === 'dap-an' && r.r.cau[1].dapAnDung === 'B', 'chỉ giữ mã lỗi hợp lệ, giữ đáp án đúng');
  ok(r.ok && r.r.cau[2].loi.join() === 'khac', '"cần sửa" không ghi lỗi ⇒ mã "khac"');
}

console.log('Kế hoạch áp dụng');
{
  const e2 = { ...e, latex: e.latex + ' sửa' }; // e bị sửa sau khi xuất
  const bank2 = [a, b, c, d, e2];
  const res = { format: REVIEW_RESULT_FORMAT as typeof REVIEW_RESULT_FORMAT, v: 1 as const, lo: 'R1', cau: [
    { k: a.uid, fp: fp(a), kq: 'dat' as const, loi: [], ghiChu: '' },
    { k: b.uid, fp: fp(b), kq: 'can-sua' as const, loi: ['dap-an' as const], ghiChu: 'x' },
    { k: c.uid, fp: fp(c), kq: 'can-sua' as const, loi: ['de' as const], ghiChu: 'nghi' },
    { k: d.uid, fp: fp(d), kq: 'dat' as const, loi: [], ghiChu: '' },
    { k: e.uid, fp: fp(e), kq: 'dat' as const, loi: [], ghiChu: '' },
    { k: 'mat', fp: 'z', kq: 'dat' as const, loi: [], ghiChu: '' },
  ] };
  const p = planReview(res, bank2);
  ok(p.dat === 1 && p.canSua === 1 && p.changes.length === 2, 'chỉ đổi câu Chưa kiểm tra còn đúng nội dung');
  ok(p.changes[1].to === 'needs_fix' && p.changes[1].addTags.includes(loiTag('dap-an')) && p.changes[1].addTags.includes(lotTag('R1')), 'Cần sửa kèm nhãn lý do + nhãn lô');
  ok(p.doubt.length === 1 && p.doubt[0].k === c.uid, 'câu thầy/cô đã duyệt mà Claude nghi lỗi: chỉ báo, không đổi');
  const why = Object.fromEntries(p.skipped.map((s) => [s.item.k, s.why]));
  ok(why[d.uid] === 'gv-da-danh-dau' && why[e.uid] === 'da-sua' && why.mat === 'khong-thay', 'lý do bỏ qua đúng');

  const after = applyChange(a, p.changes[0]);
  ok(after.review === 'approved' && after.updatedAt === a.updatedAt && after.latex === a.latex, 'áp dụng không đổi nội dung/updatedAt');
  ok(undoChange(after, a, after)?.review === undefined, 'hoàn tác trả về Chưa kiểm tra');
  ok(undoChange({ ...after, latex: after.latex + '!' }, a, after) === null, 'câu đã sửa tiếp thì không hoàn tác');
}

console.log('Gom tệp trong thư mục trao đổi');
{
  const rows = reviewLotRows([{ name: 'hedu-duyet-R2.json', bytes: 1, mtimeMs: 5 }, { name: 'ket-qua-R1.json', bytes: 1, mtimeMs: 4 }, { name: 'hedu-duyet-R1.json', bytes: 1, mtimeMs: 3 }, { name: 'hedu-gan-id-L1.json', bytes: 1, mtimeMs: 9 }], new Set());
  ok(rows.length === 2 && rows[0].lo === 'R2' && rows[0].state === 'cho-claude' && rows[1].state === 'co-ket-qua', 'nhận lô và kết quả, bỏ tệp của Gán ID');
  ok(reviewLotRows([{ name: 'ket-qua-R1.json', bytes: 1, mtimeMs: 4 }], new Set(['R1']))[0].state === 'da-nhap', 'lô đã nhập');
}

if (fail) process.exit(1);
console.log('claudereview: đạt hết.');
