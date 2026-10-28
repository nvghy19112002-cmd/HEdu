// Kiểm THẬT (cần TeX Live): PDF chế độ Đề trong gói giáo viên không được lộ lời giải hay đáp án.
//   node scripts/kiem-ro-ri-pdf.mjs <gói-giáo-viên.zip> [mã]
// Gói phải có PDF đề và PDF lời giải của cùng mã (xuất với "Kèm PDF lời giải").
// 1) LỜI GIẢI: các từ chỉ có trong \loigiai{…} (không có trong phần đề) phải KHÔNG xuất hiện trong PDF đề và PHẢI xuất hiện trong PDF lời giải (đối chứng: phép thử có khả năng bắt).
// 2) ĐÁP ÁN (\True): dịch lại nguồn của gói ở chế độ dethi hai lần, có và không có \True; hai PDF phải giống hệt về nội dung và lệnh vẽ,
//    và khớp với PDF đề do HEdu dịch. Đối chứng: PDF lời giải phải KHÁC bản không \True.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [zipArg, codeArg] = process.argv.slice(2);
const TAR = process.platform === 'win32' ? 'C:\\Windows\\System32\\tar.exe' : 'tar'; // bsdtar của Windows đọc được ZIP và tên tiếng Việt (tar của Git Bash thì không)
const zip = zipArg ? resolve(zipArg) : zipArg;
if (!zipArg) { console.error('Cách dùng: node scripts/kiem-ro-ri-pdf.mjs <goi-giao-vien.zip> [ma]'); process.exit(2); }
let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const dir = mkdtempSync(join(tmpdir(), 'hedu-roi-'));
execFileSync(TAR, ['-xf', zip, '-C', dir], { stdio: 'inherit' });
const walk = (d, base = '') => readdirSync(d).flatMap((n) => { const p = join(d, n); const r = base ? `${base}/${n}` : n; return statSync(p).isDirectory() ? walk(p, r) : [r]; });
const files = walk(dir);
const code = codeArg ?? files.find((f) => /^de\/.*-(\w+)-de\.pdf$/.test(f))?.match(/-(\w+)-de\.pdf$/)?.[1];
const deZip = files.find((f) => f.startsWith('de/') && f.endsWith(`-${code}-de.pdf`));
const lgZip = files.find((f) => f.startsWith('loigiai/') && f.endsWith(`-${code}-loigiai.pdf`));
if (!deZip || !lgZip) { console.error(`Gói thiếu PDF đề hoặc lời giải của mã ${code}.`); process.exit(2); }
const src = join(dir, 'nguon');

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
async function read(path) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), useSystemFonts: true, isEvalSupported: false, verbosity: 0 }).promise;
  const text = [], ops = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    text.push((await p.getTextContent()).items.map((x) => x.str).join(' '));
    const l = await p.getOperatorList();
    // tên đối tượng của pdf.js có số thứ tự tài liệu (g_d0_…, g_d1_…) khác nhau giữa các lần nạp: chuẩn hoá để chỉ so nội dung lệnh vẽ
    ops.push(JSON.stringify([l.fnArray, l.argsArray.map((a) => (Array.isArray(a) ? a.map((v) => (typeof v === 'object' && v !== null ? Object.keys(v).length : v)) : a))]).replace(/g_d\d+_/g, 'g_dX_'));
  }
  return { pages: doc.numPages, text: text.join('\n'), ops: ops.join('\n') };
}
const words = (s) => new Set((s.toLowerCase().match(/\p{L}{4,}/gu) ?? []));

// ----- 1) lời giải -----
const deTex = readFileSync(join(src, `de-${code}.tex`), 'utf8');
function groupAfter(s, at) { let d = 0; for (let i = at; i < s.length; i++) { if (s[i] === '\\') { i++; continue; } if (s[i] === '{') d++; else if (s[i] === '}') { d--; if (d === 0) return [s.slice(at + 1, i), i + 1]; } } return null; }
let sol = '', rest = '', pos = 0;
for (const m of deTex.matchAll(/\\loigiai\s*\{/g)) { const g = groupAfter(deTex, m.index + m[0].length - 1); if (!g) continue; rest += deTex.slice(pos, m.index); sol += ' ' + g[0]; pos = g[1]; }
rest += deTex.slice(pos);
// chữ do khung đề tự in ra (tiêu đề phần, "thí sinh chọn…") không phải lời giải: loại khỏi tập từ cần bắt
const chrome = ['khaibaochung.tex', `main-${code}.tex`].map((f) => { try { return readFileSync(join(src, f), 'utf8'); } catch { return ''; } }).join(' ');
const solOnly = [...words(sol.replace(/\\[A-Za-z]+/g, ' '))].filter((w) => !words((rest + ' ' + chrome).replace(/\\[A-Za-z]+/g, ' ')).has(w));
console.log(`Mã ${code}: ${solOnly.length} từ chỉ có trong lời giải`);
const de = await read(join(dir, deZip));
const lg = await read(join(dir, lgZip));
ok(solOnly.length >= 3, 'đề có đủ lời giải để phép thử có ý nghĩa');
const leaked = solOnly.filter((w) => de.text.toLowerCase().includes(w));
ok(leaked.length === 0, `PDF đề KHÔNG chứa từ nào của lời giải${leaked.length ? ` (lộ: ${leaked.slice(0, 8).join(', ')})` : ''}`);
const inLg = solOnly.filter((w) => lg.text.toLowerCase().includes(w));
ok(inLg.length >= Math.ceil(solOnly.length / 2), `đối chứng: PDF lời giải CÓ lời giải (${inLg.length}/${solOnly.length} từ)`);
ok(lg.pages >= de.pages, 'PDF lời giải không ngắn hơn PDF đề');

// ----- 2) đáp án \True -----
const build = (name, tweak) => {
  const w = mkdtempSync(join(tmpdir(), 'hedu-roi-b-'));
  execFileSync(TAR, ['-xf', zip, '-C', w, 'nguon'], { stdio: 'ignore' });
  const root = join(w, 'nguon');
  const kb = join(root, 'khaibaochung.tex');
  tweak(root, kb);
  const bin = process.env.HEDU_TEX_BIN ?? '';
  const exe = bin ? join(bin, 'pdflatex.exe') : 'pdflatex';
  for (let i = 0; i < 2; i++) execFileSync(exe, ['-interaction=nonstopmode', '-no-shell-escape', `-jobname=${name}`, `main-${code}.tex`], { cwd: root, stdio: 'ignore', env: { ...process.env, TEXINPUTS: `${root};` } });
  const out = join(root, `${name}.pdf`);
  if (!existsSync(out)) throw new Error('không dịch được ' + name);
  return out;
};
const dethi = (root, kb) => writeFileSync(kb, readFileSync(kb, 'utf8').replace(/\\usepackage\[loigiai\]\{ex_test\}/, '\\usepackage[dethi]{ex_test}'));
const withTrue = await read(build('a', dethi));
const again = await read(build('c', dethi));
ok(again.ops === withTrue.ops, 'đối chứng độ ổn định: dịch hai lần cùng nguồn cho cùng lệnh vẽ (nếu không, phép so lệnh vẽ vô nghĩa)');
if (again.ops !== withTrue.ops) { const a = withTrue.ops.split('\n'), b = again.ops.split('\n'); const i = a.findIndex((x, k) => x !== b[k]); console.log('    trang khác đầu tiên:', i + 1, 'dài', a[i]?.length, b[i]?.length); }
const noTrue = await read(build('b', (root, kb) => { dethi(root, kb); const f = join(root, `de-${code}.tex`); writeFileSync(f, readFileSync(f, 'utf8').replace(/\\True\s*/g, '')); }));
ok(withTrue.text === noTrue.text, 'chế độ Đề: nội dung chữ giống hệt khi có và không có \\True');
ok(withTrue.ops === noTrue.ops, 'chế độ Đề: lệnh vẽ (khoanh, tô màu) giống hệt khi có và không có \\True ⇒ không đánh dấu đáp án đúng');
ok(de.text === withTrue.text, 'PDF đề do HEdu dịch có chữ giống bản dịch thủ công ở chế độ dethi');
ok(lg.ops !== noTrue.ops, 'đối chứng: PDF lời giải KHÁC bản không \\True (phép thử có khả năng bắt khác biệt)');

if (fail) { console.log(`\nLộ hoặc sai: ${fail} phép thử không đạt.`); process.exit(1); }
console.log('\nkiem-ro-ri-pdf: đạt hết.');
