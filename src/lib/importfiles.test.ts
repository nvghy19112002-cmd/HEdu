import { chooseFiles, chooseFolder, describeScan, encodingSample, IMPORT_LIMITS, readAll, scanSources, type ScanFile } from './importfiles';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
const g = globalThis as unknown as { window?: unknown };

const calls: [string, unknown][] = [];
const texts: Record<string, string | Error> = { 'a.tex': '\\begin{ex}A\\end{ex}', 'b.tex': new Error('Tệp không phải UTF-8'), 'c.tex': '\\begin{ex}C\\end{ex}', 'w.tex': 'Tính ễ' };
const encs: Record<string, string> = { 'w.tex': 'windows-1258' };
let picked: string | string[] | null = ['x.tex', 'y.tex'];
g.window = { __TAURI__: {
  core: { async invoke(cmd: string, args: { path?: string; paths?: string[] }) {
    calls.push([cmd, args]);
    if (cmd === 'import_scan') return { files: [], skipped: [], truncated: false };
    if (cmd === 'import_read') { const t = texts[args.path!]; if (t instanceof Error) throw t.message; return { text: t, bytes: String(t).length, hadBom: false, encoding: encs[args.path!] ?? 'utf-8' }; }
    throw new Error('lệnh lạ');
  } },
  dialog: { async open() { return picked; } },
  event: { async listen() { return () => {}; } },
} };
const f = (name: string): ScanFile => ({ path: name, name, rel: '', bytes: 10 });

console.log('Chọn tệp / thư mục');
{
  ok((await chooseFiles()).join() === 'x.tex,y.tex', 'chọn nhiều tệp ⇒ danh sách đường dẫn');
  picked = 'D:\\De thi'; ok((await chooseFolder()) === 'D:\\De thi', 'chọn thư mục ⇒ một đường dẫn');
  picked = null; ok((await chooseFolder()) === null && (await chooseFiles()).length === 0, 'bấm Huỷ ⇒ không chọn gì');
  await scanSources(['D:\\De thi']);
  ok(calls[calls.length - 1][0] === 'import_scan', 'quét gọi đúng lệnh Rust');
  const save = g.window; g.window = {};
  ok((await chooseFiles()).length === 0 && (await chooseFolder()) === null, 'bản trình duyệt (không có hộp chọn): không chọn gì, giao diện dùng cách dán');
  g.window = save;
}

console.log('Đọc lần lượt');
{
  const prog: string[] = [];
  const r = await readAll([f('a.tex'), f('b.tex'), f('c.tex')], { onProgress: (d, t) => prog.push(`${d}/${t}`) });
  ok(r.read.map((x) => x.file.name).join() === 'a.tex,c.tex' && r.failed.length === 1 && /UTF-8/.test(r.failed[0].message) && !r.cancelled, 'một tệp lỗi chỉ vào danh sách lỗi (kèm lý do), các tệp khác vẫn đọc');
  ok(r.read[0].text === texts['a.tex'], 'nội dung nguyên văn');
  ok(prog.join() === '0/3,1/3,2/3,3/3', 'báo tiến độ');
  calls.length = 0;
  let stop = false;
  const r2 = await readAll([f('a.tex'), f('c.tex'), f('a.tex')], { onProgress: (d) => { if (d === 1) stop = true; }, shouldStop: () => stop });
  ok(r2.cancelled && r2.read.length === 1 && calls.length === 1, 'bấm Dừng ⇒ không đọc thêm tệp nào');
}

console.log('Bảng mã');
{
  const r = await readAll([f('w.tex'), f('a.tex')]);
  ok(r.read[0].encoding === 'windows-1258' && r.read[0].text === 'Tính ễ' && r.read[0].text.length === 6, 'Windows-1258: giữ nhãn "đoán", dấu thanh tổ hợp được chuẩn hoá NFC');
  ok(r.read[1].encoding === 'utf-8' && r.read[1].text === texts['a.tex'], 'UTF-8: nguyên văn');
  const smp = encodingSample('\\begin{ex}\n  Cho hàm số $y=x$.\n  \\choice\n  {Đúng}\n  {Sai}\n' + 'Rất dài '.repeat(40));
  ok(smp.length === 3 && smp[0] === 'Cho hàm số $y=x$.' && smp[1] === '{Đúng}' && smp[2].endsWith('…') && smp[2].length <= 141, 'chữ mẫu: tối đa 3 dòng có dấu, rút gọn dòng dài');
  ok(encodingSample('abc\nxyz').length === 0, 'không có chữ có dấu ⇒ không có mẫu');
}

console.log('Tóm tắt quét');
{
  const lines = describeScan({ files: [f('a.tex')], skipped: [{ path: 'p1', rel: '', reason: 'không phải tệp .tex / .txt' }, { path: 'p2', rel: '', reason: 'không phải tệp .tex / .txt' }, { path: 'p3', rel: '', reason: 'quá lớn (25 MB; tối đa 20 MB)' }], truncated: true });
  ok(lines[0].includes('1 tệp') && lines[1].includes('2 × không phải tệp') && lines[1].includes('quá giới hạn') && lines[2].includes(String(IMPORT_LIMITS.files)), 'đếm gộp theo lý do; cảnh báo vượt giới hạn nói rõ cách chia lô');
  ok(describeScan({ files: [], skipped: [], truncated: false }).length === 1, 'không có gì bị bỏ qua ⇒ chỉ một dòng');
}

if (fail) { console.error(`\n${fail} lỗi`); process.exit(1); }
console.log('\nimportfiles: đạt hết.');
