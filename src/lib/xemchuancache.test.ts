// "Xem chuẩn": bộ nhớ trong phiên phải tính cả CẤU HÌNH TeX vào khoá — đổi bộ dịch / đầu file / đường dẫn TeX Live
// thì không được hiện lại kết quả cũ (đặc tả mục D5).
import { DEFAULT_SETTINGS, getSettings, setSettings } from './tikz';
import { compileQuestion, forgetCompiled, settingsSignature } from './xemchuan';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const g = globalThis as unknown as { window?: unknown; localStorage?: unknown };
const store = new Map<string, string>();
g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
let calls = 0;
const seen: string[] = [];
g.window = { __TAURI__: { core: { async invoke(cmd: string, args: { opts: { engine: string } }) { if (cmd === 'tikz_default_preamble') return '\\usepackage{ex_test}\n'; if (cmd !== 'tikz_render') throw new Error('lệnh lạ'); calls++; seen.push(args.opts.engine); return { svg: '<svg/>', cached: false, ms: 1 }; } }, event: { async listen() { return () => {}; } } } };

console.log('Bộ nhớ "Xem chuẩn" theo cấu hình TeX');
forgetCompiled();
setSettings({ ...DEFAULT_SETTINGS });
const A = '\\begin{ex}A\\end{ex}';
await compileQuestion(A, false);
await compileQuestion(A, false);
ok(calls === 1, 'cùng câu, cùng cấu hình: chỉ biên dịch một lần (lần hai lấy từ bộ nhớ)');
await compileQuestion(A, true);
ok(calls === 2, 'bật lời giải là kết quả khác: biên dịch lại');
const sig0 = settingsSignature();
setSettings({ ...getSettings(), engine: 'xelatex' });
ok(settingsSignature() !== sig0, 'đổi bộ dịch ⇒ dấu cấu hình đổi');
await compileQuestion(A, false);
ok(calls === 3 && seen[2] === 'xelatex', 'đổi bộ dịch ⇒ biên dịch lại bằng bộ dịch MỚI, không dùng kết quả cũ');
setSettings({ ...getSettings(), preamble: '\\usepackage{ex_test}' });
await compileQuestion(A, false);
ok(calls === 4, 'đổi đầu file ⇒ biên dịch lại');
setSettings({ ...getSettings(), texBin: 'D:\\texlive\\bin' });
await compileQuestion(A, false);
ok(calls === 5, 'đổi đường dẫn TeX Live ⇒ biên dịch lại');
await compileQuestion(A, false);
ok(calls === 5, 'giữ nguyên cấu hình mới ⇒ lại dùng bộ nhớ');

if (fail) { console.error(`\n${fail} lỗi`); process.exit(1); }
console.log('\nxemchuancache: đạt hết.');
