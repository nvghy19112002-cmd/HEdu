import { chiaLo, chiaLoNoi, demTheoPhan, gop, loiNhanLo, newProject, nudge, parseProject, tach, type Khung, type Trang } from './project';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
console.log('Dự án Đọc đề');

const p = newProject('  ', 'gemini-3.6-flash', Date.UTC(2026, 10, 23));
ok(/^p20261123-[a-z0-9]{1,6}$/.test(p.id) && p.name === 'Dự án đọc đề' && p.step === 0, 'tạo dự án: mã hợp lệ cho Rust, tên mặc định');
ok(parseProject(JSON.stringify(p))?.id === p.id && parseProject('{}') === null && parseProject('hỏng') === null, 'đọc state.json; hỏng ⇒ null');

ok(JSON.stringify(nudge([100, 100, 200, 300], 10, -5)) === '[95,110,195,310]', 'mũi tên dịch khung');
ok(JSON.stringify(nudge([950, 0, 1000, 100], 0, 20)) === '[950,0,1000,100]', 'không dịch ra ngoài trang');
ok(JSON.stringify(nudge([100, 100, 200, 300], -500, -500, true)) === '[100,100,110,110]', 'Shift+mũi tên đổi cỡ, tối thiểu 10');

const k = (id: string, page: number, loai: Khung['loai'], phan: Khung['phan'], cau: string, box: Khung['box'] = [0, 0, 100, 100]): Khung => ({ id, page, loai, phan, cau, box });
const g = gop([k('a', 1, 'cau', 'I', '1', [0, 0, 50, 50]), k('b', 1, 'cau', 'I', '1', [40, 10, 90, 80])]);
ok(g?.id === 'a' && JSON.stringify(g.box) === '[0,0,90,80]' && gop([k('a', 1, 'cau', 'I', '1'), k('b', 2, 'cau', 'I', '1')]) === null, 'gộp khung cùng trang; khác trang ⇒ không gộp');
const [t1, t2] = tach(k('a', 1, 'cau', 'I', '3', [0, 0, 200, 100]), 'z');
ok(t1.box[2] === 100 && t2.box[0] === 100 && t2.id === 'z' && t2.cau === '', 'tách khung làm hai, nửa dưới chưa có số câu');

const d = demTheoPhan([k('1', 1, 'cau', 'I', '1'), k('2', 1, 'cau', 'I', '2'), k('3', 2, 'cau', 'I', '4'), k('4', 3, 'cau', 'I', '4'), k('5', 2, 'hinh', 'I', '4'), k('6', 3, 'cau', 'III', '1')]);
ok(d.length === 2 && d[0].phan === 'I' && d[0].so === 3 && JSON.stringify(d[0].thieu) === '[3]' && d[1].so === 1, 'đếm theo phần: câu vắt trang đếm một, báo thiếu Câu 3');

const pg = (n: number, kieu: Trang['kieu']): Trang => ({ n, file: 'a.pdf', no: n, kieu, trangThai: 'xong' });
ok(JSON.stringify(chiaLo([pg(1, 'bo'), pg(2, 'de'), pg(3, 'de'), pg(4, 'de'), pg(5, 'loigiai'), pg(6, 'dapan')], 3)) === '[[2,3,4],[6]]', 'chia lô: bỏ bìa/lời giải, giữ trang đáp án');

p.boCuc.khung = [k('h', 2, 'hinh', 'I', '3', [10, 600, 300, 900]), k('c', 2, 'cau', 'I', '3', [0, 0, 400, 1000])];
const m = loiNhanLo(p, [2], 'dong 1\ndong 2');
ok(m.includes('cau phan I cau 3') && m.includes('%%%HINH-1%%%') && m.indexOf('cau phan I cau 3') < m.indexOf('HINH-1') && m.includes('dong 2'), 'lời nhắn lô: bố cục theo thứ tự đọc, mốc hình, đuôi lô trước');

const pages4 = [pg(1, 'de'), pg(2, 'de'), pg(3, 'de'), pg(4, 'de'), pg(5, 'de')];
ok(JSON.stringify(chiaLoNoi(pages4, [{ ...k('v', 3, 'cau', 'I', '6'), vatTrang: true }], 3)) === '[[1,2,3,4],[5]]', 'câu vắt ở cuối lô ⇒ kéo trang sau vào lô');
ok(JSON.stringify(chiaLoNoi(pages4, [], 3)) === '[[1,2,3],[4,5]]', 'không vắt trang ⇒ chia đều');

if (fail) process.exit(1);
console.log('docde/project: đạt hết.');
