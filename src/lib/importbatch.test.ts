import { BATCH_MAX, buildRows, defaultBatchName, parseExtraTags, PASTE_SOURCE_NAME, perFile, planLots, tagsFor, type BatchInfo, type ImportSource } from './importbatch';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const ex = (id: string | null, n: number, pre = '') => `${pre}\\begin{ex}${id ? `%[${id}]` : ''}\n  Câu ${n}: tính $x$.\n  \\choice{\\True 1}{2}{3}{4}\n\\end{ex}`;
const A: ImportSource = { name: 'de1.tex', rel: 'Lop12', text: [ex('2D1H1-1', 1), ex('2D1H1', 2, '\n\n% ghi chú\n'), ex('9Z9H9-9', 3)].join('\n') };
const B: ImportSource = { name: 'de2.tex', rel: 'Lop12/Hàm số', text: ['% chỉ có ghi chú', ex(null, 4, '\n\n\n'), ex('2D1H1-1', 5)].join('\n') };
const E: ImportSource = { name: 'trong.tex', rel: '', text: 'không có câu nào ở đây' };

console.log('Gộp câu từ nhiều nguồn');
{
  const rows = buildRows([A, B, E]);
  ok(rows.length === 5 && rows.map((r) => r.file).join() === 'de1.tex,de1.tex,de1.tex,de2.tex,de2.tex', 'đúng số câu và thứ tự: tệp trước tệp sau, trong tệp theo thứ tự');
  ok(rows[0].line === 1 && rows[1].line > 1 && rows[3].line > 1 && rows[4].line > rows[3].line, 'số dòng tính TRONG tệp của câu đó (không cộng dồn qua tệp)');
  ok(rows.every((r, i) => r.latex.includes(`Câu ${i + 1}:`)), 'nội dung câu nguyên văn, thứ tự toàn lô');
  ok(rows.map((r) => r.srcIdx).join() === '0,0,0,1,1', 'mỗi câu nhớ nguồn của nó');
  ok(buildRows([]).length === 0 && buildRows([E]).length === 0, 'không có nguồn / nguồn không có câu ⇒ rỗng');
  const st = perFile(rows, [A, B, E]);
  ok(st.length === 3 && st[0].blocks === 3 && st[0].idOk === 1 && st[0].idNoForm === 1 && st[0].idInvalid === 1 && st[0].idMissing === 0, 'thống kê tệp 1: ID đúng 1, thiếu Dạng 1, sai 1');
  ok(st[1].blocks === 2 && st[1].idMissing === 1 && st[1].idOk === 1 && st[2].blocks === 0, 'thống kê tệp 2; tệp 0 câu vẫn có dòng (để báo "0 câu")');
}

console.log('Nhãn nguồn');
{
  const info: BatchInfo = { name: '2026-10-25 14:30', tagFile: true, tagBatch: true, tagFolder: false, extra: '' };
  const r = { file: 'de1.tex', rel: 'Lop12/Hàm số' };
  ok(tagsFor(r, info).join('|') === 'Nguồn: de1.tex|Lô: 2026-10-25 14:30', 'mặc định: nhãn tệp + nhãn lô');
  ok(tagsFor(r, { ...info, tagFolder: true, extra: 'Sách KNTT 12, Đề 2024;sách kntt 12\nlớp 12' }).join('|') === 'Nguồn: de1.tex|Lô: 2026-10-25 14:30|Thư mục: Lop12/Hàm số|Sách KNTT 12|Đề 2024|lớp 12', 'thêm thư mục + nhãn tuỳ ý; bỏ trùng không phân biệt hoa/thường');
  ok(tagsFor({ file: '', rel: '' }, info)[0] === `Nguồn: ${PASTE_SOURCE_NAME}`, 'dán trực tiếp ⇒ "Nguồn: dán trực tiếp"');
  ok(tagsFor(r, { name: '', tagFile: false, tagBatch: true, tagFolder: false, extra: '' }).length === 0, 'tắt hết / tên lô trống ⇒ không nhãn');
  ok(tagsFor({ file: 'x'.repeat(200) + '.tex', rel: '' }, info)[0].length <= 80, 'nhãn quá dài bị rút gọn');
  ok(parseExtraTags(Array.from({ length: 30 }, (_, i) => `n${i}`).join(',')).length === 20 && parseExtraTags(' , ;\n ').length === 0, 'tối đa 20 nhãn thêm; chuỗi rỗng ⇒ không nhãn');
  ok(defaultBatchName(new Date(2026, 9, 5, 7, 3)) === '2026-10-05 07:03', 'tên lô mặc định theo giờ máy');
  ok(BATCH_MAX === 5000, 'giới hạn lô tạm thời 5.000 câu');
}

console.log('Chia lô tự động');
{
  const fs = (a: number[]) => a.map((blocks, srcIdx) => ({ srcIdx, blocks }));
  const r = planLots(fs([3000, 1500, 600, 4000, 100]), 5000);
  ok(JSON.stringify(r.lots) === '[[0,1],[2,3,4]]' && r.tooBig.length === 0, 'gom tệp liền nhau tới sát giới hạn, không tách tệp, giữ thứ tự');
  ok(r.lots.every((l) => l.reduce((n, k) => n + [3000, 1500, 600, 4000, 100][k], 0) <= 5000), 'mỗi lô ≤ giới hạn');
  const big = planLots(fs([200, 6000, 300]), 5000);
  ok(JSON.stringify(big.lots) === '[[0,2]]' && JSON.stringify(big.tooBig) === '[1]', 'tệp một mình vượt giới hạn: báo riêng, không nhét vào lô');
  ok(planLots([], 5000).lots.length === 0, 'không có tệp ⇒ không có lô');
  ok(JSON.stringify(planLots(fs([0, 5000, 0]), 5000).lots) === '[[0,1,2]]', 'tệp 0 câu không làm tách lô');
}

if (fail) { console.error(`\n${fail} lỗi`); process.exit(1); }
console.log('\nimportbatch: đạt hết.');
