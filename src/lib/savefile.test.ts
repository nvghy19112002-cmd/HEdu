import { extOf, saveTextFile } from './savefile';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
const g = globalThis as unknown as { window?: unknown };

console.log('Lưu file');
ok(extOf('cau-hoi-da-chon.tex') === 'tex' && extOf('a.JSON') === 'json' && extOf('khongduoi') === 'txt', 'đoán đuôi file');

g.window = {};
let fb = 0;
ok((await saveTextFile('a.tex', 'x', () => fb++)).kind === 'downloaded' && fb === 1, 'bản web (không có Tauri): tải về theo trình duyệt');

const calls: unknown[] = [];
let pick: string | null = 'D:\\De\\ca.tex';
let writeFail = false;
g.window = { __TAURI__: {
  core: { async invoke(cmd: string, args: unknown) { calls.push([cmd, args]); if (writeFail) throw new Error('đĩa đầy'); } },
  dialog: { async save(o: unknown) { calls.push(['dialog', o]); return pick; } },
  event: { async listen() { return () => {}; } },
} };
fb = 0;
const r1 = await saveTextFile('cau-hoi-da-chon.tex', '\\begin{ex}\\end{ex}', () => fb++);
ok(r1.kind === 'saved' && (r1 as { path: string }).path === 'D:\\De\\ca.tex' && fb === 0, 'app Windows: hỏi nơi lưu, rồi ghi đúng đường dẫn đã chọn (không tải kiểu trình duyệt)');
const dcall = calls[0] as [string, { defaultPath: string; filters: { extensions: string[] }[] }];
ok(dcall[1].defaultPath === 'cau-hoi-da-chon.tex' && dcall[1].filters[0].extensions[0] === 'tex', 'tên gợi ý và đuôi .tex');
const wcall = calls[1] as [string, { path: string; text: string }];
ok(wcall[0] === 'save_text_file' && wcall[1].text === '\\begin{ex}\\end{ex}', 'nội dung gửi nguyên văn');
pick = null; calls.length = 0;
ok((await saveTextFile('a.tex', 'x', () => fb++)).kind === 'cancelled' && calls.length === 1, 'bấm Huỷ trong hộp lưu: không ghi gì');
pick = 'D:\\a.tex'; writeFail = true;
const r3 = await saveTextFile('a.tex', 'x', () => fb++);
ok(r3.kind === 'error' && /đĩa đầy/.test((r3 as { message: string }).message), 'ghi lỗi: báo lỗi, không nói đã lưu');

if (fail) { console.error(`\n${fail} lỗi`); process.exit(1); }
console.log('\nOK');
