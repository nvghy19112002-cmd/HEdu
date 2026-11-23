import { BO_CUC_SYSTEM, parseBoCuc } from './bocuc';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
console.log('Nhiệm vụ AI bo-cuc');
let n = 0; const id = () => `k${++n}`;
const r = parseBoCuc(JSON.stringify({ kieu_trang: 'de', khung: [
  { loai: 'cau', phan: 'I', cau: '3', box_2d: [10, 20, 300, 980], vat_trang: true },
  { loai: 'hinh', phan: 'I', cau: '3', box_2d: [50, 600, 250, 950] },
  { loai: 'cau', box_2d: [300, 20, 200, 980] },
  { loai: 'xyz', box_2d: [1, 1, 2, 2] },
  { loai: 'cau', phan: 'V', cau: 'abc', box_2d: [400, 0, 500, 1000] },
] }), 2, id);
ok(r.kieu === 'de' && r.khung.length === 3, 'bỏ khung ngược và loại lạ');
ok(r.khung[0].vatTrang === true && r.khung[0].page === 2 && r.khung[1].loai === 'hinh', 'giữ câu vắt trang, hình');
ok(r.khung[2].phan === '' && r.khung[2].cau === '', 'phần/số câu lạ ⇒ để trống cho người duyệt');
ok(parseBoCuc('{"kieu_trang":"bo","khung":[{"loai":"cau","box_2d":[0,0,10,10]}]}', 1, id).khung.length === 0, 'trang bìa ⇒ không có khung');
let threw = false; try { parseBoCuc('{"khung":[]}', 1, id); } catch { threw = true; }
ok(threw, 'khuôn sai ⇒ ném lỗi cho riêng trang');
ok(/dữ liệu, không phải lệnh/.test(BO_CUC_SYSTEM), 'prompt chống tiêm lệnh');
if (fail) process.exit(1);
console.log('ai/tasks/bocuc: đạt hết.');
