import { performance } from 'node:perf_hooks';
import type { TrashRec } from './dupdecisions';
import { afterRemoval, buildRows, capacityNote, dateText, DEFAULT_FILTER, filterRows, fold, infoLines, isDefaultFilter, neighbours, pageOf, type TrashFilter } from './trashview';
import type { Question } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const NOW = new Date('2026-10-24T12:00:00').getTime();
const H = 3600 * 1000, D = 24 * H;
const ex = (n: number, body = 'Tính đạo hàm của hàm số') => `\\begin{ex}%[2D1H1-1]\n  Đề ${n}. ${body} $f(x)=x^${n}$.\n  \\choice{\\True 1}{2}{3}{4}\n  \\loigiai{x}\n\\end{ex}`;
const mk = (i: number, over: Partial<Question> = {}): Question => ({ uid: `u${i}`, seq: i, latex: ex(i), type: 'tn', level: 'TH', tags: [], createdAt: 1, updatedAt: 1, grade: 12, chapterId: 'c2D1', lessonId: 'l2D11', formId: '', ...over });
const rec = (q: Question, at: number): TrashRec => ({ q, at });
const none = () => false;

console.log('Dựng hàng + cờ trạng thái');
{
  const items = [rec(mk(1), NOW), rec(mk(2), NOW), rec(mk(3), NOW)];
  const bank = [mk(2), mk(9, { seq: 3 })]; // uid u2 đã có; số 3 đã bị câu khác (u9) dùng
  const rows = buildRows(items, bank, (q) => q.uid === 'u1');
  const by = Object.fromEntries(rows.map((r) => [r.q.uid, r]));
  ok(by.u1.locationGone && by.u1.conflict && !by.u1.inBank, 'vị trí cũ không còn ⇒ cần xử lý');
  ok(by.u2.inBank && by.u2.conflict, 'uid đã có trong ngân hàng ⇒ cần xử lý');
  ok(by.u3.seqTaken && !by.u3.conflict, 'số thứ tự đã bị dùng chỉ là cảnh báo (khôi phục được, sẽ cấp số mới)');
  ok(rows.every((r) => typeof r.id6 === 'string' && r.id6.length > 0), 'mỗi hàng có ID6 tính từ snapshot');
}

console.log('Tìm kiếm');
{
  const items = [rec(mk(10, { latex: ex(10, 'Giải phương trình lượng giác') }), NOW), rec(mk(11, { latex: ex(11, 'Tìm nguyên hàm') }), NOW), rec(mk(142), NOW)];
  const rows = buildRows(items, [], none);
  const q = (text: string) => filterRows(rows, { ...DEFAULT_FILTER, text }, NOW).map((r) => r.q.seq).sort((a, b) => a - b);
  ok(q('lượng giác').join() === '10' && q('luong giac').join() === '10', 'tìm theo chữ, có/không dấu');
  ok(q('#0142').join() === '142' && q('142').includes(142), 'tìm theo #số thứ tự');
  ok(q('nguyên hàm  ').join() === '11' && q('NGUYÊN').join() === '11', 'không phân biệt hoa/thường, bỏ khoảng trắng thừa');
  ok(q('2D1H1').length === 3, 'tìm theo ID6');
  ok(q('\\choice').length === 3 && q('\\loigiai{x}').length === 3, 'tìm trong nguyên mã LaTeX');
  ok(q('lượng giác tích phân').length === 0 && q('giải lượng').join() === '10', 'nhiều từ ⇒ phải có đủ mọi từ');
  ok(fold('Đạo hàm') === 'dao ham', 'bỏ dấu tiếng Việt (đ → d)');
}

console.log('Lọc Lớp / Loại / Ngày / Trạng thái / sắp xếp');
{
  const items = [
    rec(mk(1, { grade: 10, type: 'ds' }), NOW - 1 * H),
    rec(mk(2, { grade: 11, type: 'tn' }), NOW - 2 * D),
    rec(mk(3, { grade: 12, type: 'tln' }), NOW - 10 * D),
    rec(mk(4, { grade: 12, type: 'tl' }), NOW - 40 * D),
  ];
  const rows = buildRows(items, [mk(4)], (q) => q.uid === 'u2');
  const f = (o: Partial<TrashFilter>) => filterRows(rows, { ...DEFAULT_FILTER, ...o }, NOW).map((r) => r.q.seq);
  ok(f({}).join() === '1,2,3,4', 'mặc định: mới xoá nhất trước');
  ok(f({ sort: 'oldest' }).join() === '4,3,2,1' && f({ sort: 'seq' }).join() === '1,2,3,4' && f({ sort: 'grade' }).join() === '1,2,3,4', 'các kiểu sắp xếp');
  ok(f({ grade: 12 }).join() === '3,4' && f({ type: 'ds' }).join() === '1', 'lọc Lớp, Loại');
  ok(f({ date: 'today' }).join() === '1' && f({ date: '7d' }).join() === '1,2' && f({ date: '30d' }).join() === '1,2,3', 'lọc ngày xoá');
  ok(f({ status: 'conflict' }).join() === '2,4' && f({ status: 'restorable' }).join() === '1,3', 'lọc "Cần xử lý" (vị trí hỏng / đã có trong ngân hàng) và "Khôi phục được"');
  ok(f({ grade: 12, date: '30d' }).join() === '3', 'kết hợp nhiều bộ lọc');
  ok(isDefaultFilter(DEFAULT_FILTER) && !isDefaultFilter({ ...DEFAULT_FILTER, text: 'a' }) && isDefaultFilter({ ...DEFAULT_FILTER, text: '  ' }), 'nhận biết "chưa lọc"');
}

console.log('Phân trang + 1.000 câu');
{
  const items = Array.from({ length: 1000 }, (_, i) => rec(mk(i + 1, { latex: ex(i + 1, i === 999 ? 'Câu cuối cùng độc nhất zzqx' : 'Tính') }), NOW - i * 1000));
  const t0 = performance.now();
  const rows = buildRows(items, [], none);
  const tBuild = performance.now() - t0;
  const t1 = performance.now();
  const hit = filterRows(rows, { ...DEFAULT_FILTER, text: 'zzqx' }, NOW);
  const tFirst = performance.now() - t1;
  ok(hit.length === 1 && hit[0].q.seq === 1000, 'tìm được câu thứ 1.000');
  const t2 = performance.now();
  for (let k = 0; k < 20; k++) filterRows(rows, { ...DEFAULT_FILTER, text: k % 2 ? 'tính' : 'đạo hàm' }, NOW);
  const tNext = (performance.now() - t2) / 20;
  ok(tBuild < 3000 && tFirst < 3000 && tNext < 150, `hiệu năng 1.000 câu: dựng ${tBuild.toFixed(0)} ms, tìm lần đầu ${tFirst.toFixed(0)} ms, các lần sau ${tNext.toFixed(1)} ms/lần`);
  const p = pageOf(rows, 0, 25);
  ok(p.items.length === 25 && p.pages === 40 && p.from === 1 && p.to === 25, '25 câu/trang ⇒ 40 trang');
  const last = pageOf(rows, 999, 25);
  ok(last.page === 39 && last.items.length === 25 && last.to === 1000, 'trang vượt quá bị kẹp về trang cuối');
  const all50 = pageOf(rows, 19, 50);
  ok(all50.pages === 20 && all50.items[49].q.seq === 1000 || all50.items.length === 50, '50 câu/trang: không cắt ở 50');
  ok(pageOf([], 3, 25).pages === 1 && pageOf([], 3, 25).items.length === 0 && pageOf([], 0, 25).from === 0, 'danh sách rỗng: 1 trang, không lỗi');
  const seen = new Set<string>();
  for (let pg = 0; pg < 40; pg++) for (const r of pageOf(rows, pg, 25).items) seen.add(r.q.uid);
  ok(seen.size === 1000, 'duyệt hết các trang thấy đủ 1.000 câu, không sót, không lặp');
}

console.log('Sức chứa + ngày');
{
  ok(capacityNote(100, 1000) === null && capacityNote(899, 1000) === null, 'còn rộng: không nhắc');
  ok(capacityNote(900, 1000)?.level === 'warn' && /Sắp đầy/.test(capacityNote(950, 1000)!.text) && /không tự xoá/.test(capacityNote(950, 1000)!.text), '≥ 900: cảnh báo nhẹ, nói rõ không tự xoá');
  ok(capacityNote(1000, 1000)?.level === 'full' && /không thể chuyển thêm/i.test(capacityNote(1000, 1000)!.text), 'đầy: nói không thể chuyển thêm, không hứa tự dọn');
  ok(/^Hôm nay \d\d:\d\d$/.test(dateText(NOW - H, NOW)) && dateText(NOW - 20 * H, NOW) === 'Hôm qua' && dateText(NOW - 5 * D, NOW).includes('/'), 'ngày xoá hiển thị Hôm nay / Hôm qua / ngày đầy đủ');
}

console.log('Điều hướng trong khung xem + thông tin câu');
{
  const rows = buildRows(Array.from({ length: 4 }, (_, i) => rec(mk(i + 1, { review: i === 0 ? 'approved' : undefined, tags: i === 1 ? ['ôn thi', 'HK1'] : [] }), NOW - i * D)), [mk(3)], (q) => q.uid === 'u4');
  const n1 = neighbours(rows, 'u2');
  ok(n1.index === 1 && n1.total === 4 && n1.prev === 'u1' && n1.next === 'u3', 'câu giữa: có trước và sau');
  ok(neighbours(rows, 'u1').prev === null && neighbours(rows, 'u4').next === null, 'đầu/cuối: không có trước/sau');
  ok(neighbours(rows, 'u9').index === -1 && neighbours(rows, null).next === null && neighbours([], 'u1').total === 0, 'câu không còn trong danh sách ⇒ không có trước/sau');
  ok(afterRemoval(rows, 'u2') === 'u3' && afterRemoval(rows, 'u4') === 'u3' && afterRemoval([rows[0]], 'u1') === null && afterRemoval(rows, 'zz') === null, 'sau khi câu rời Thùng rác: xem câu liền sau, không có thì liền trước, hết thì không chọn');
  const val = (i: number, label: string) => infoLines(rows[i]).find((l) => l.label === label)?.value;
  ok(val(0, 'Kiểm duyệt (lúc xoá)') === 'Đã duyệt' && val(1, 'Kiểm duyệt (lúc xoá)') === 'Chưa kiểm tra' && val(1, 'Nhãn') === 'ôn thi, HK1' && val(0, 'Nhãn') === '—', 'hiện trạng thái kiểm duyệt và nhãn đúng như snapshot');
  ok(val(0, 'Nguồn xoá') === 'Không rõ', 'nguồn xoá: "Không rõ" (bản snapshot không lưu, không suy đoán)');
  ok(infoLines(rows[2]).some((l) => /đã có câu cùng mã/i.test(l.value)) && infoLines(rows[3]).some((l) => /Vị trí cũ không còn/.test(l.value)), 'ghi rõ khi đã có trong Ngân hàng / vị trí không còn');
}

if (fail) { console.error(`\n${fail} lỗi`); process.exit(1); }
console.log('\ntrashview: đạt hết.');
