// Chụp ảnh giao diện trước/sau + đo vài chỉ số (UPDATE V3, PR-0). KHÔNG đổi giao diện, KHÔNG dùng dữ liệu thật.
//   npm run build                       (cần dist/)
//   npm i --no-save playwright          (một lần; không thêm vào package.json)
//   node scripts/ui-shots.mjs [--out .ui-shots/truoc] [--count 300] [--shots 1366x768,1024x700,911x512]
// Ảnh + metrics.json nằm trong thư mục --out (đã .gitignore). Dữ liệu là bộ giả lập từ scripts/ui-fixtures.mjs.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { makeBank } from './ui-fixtures.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg('out', '.ui-shots/latest'));
const COUNT = Number(arg('count', '300'));
const SIZES = arg('shots', '1366x768,1024x700,911x512').split(',').map((s) => s.split('x').map(Number));
const ROOT = resolve('.');
const DIST = join(ROOT, 'dist');
if (!existsSync(join(DIST, 'index.html'))) { console.error('Chưa có dist/ — chạy `npm run build` trước.'); process.exit(1); }

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('Thiếu playwright — chạy `npm i --no-save playwright` (không đổi package.json).'); process.exit(1); }

// vị trí lấy từ khung chương trình mặc định để cây Chương → Bài có số đếm thật
const tmp = mkdtempSync(join(tmpdir(), 'hedu-shots-'));
await build({ stdin: { contents: "export { buildDefault } from './src/lib/taxonomy.ts';", resolveDir: ROOT, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: join(tmp, 'tax.mjs'), logLevel: 'error' });
const { buildDefault } = await import(join(tmp, 'tax.mjs'));
const tax = buildDefault();
const locations = [];
for (const g of tax.grades) for (const b of g.branches) for (const c of b.chapters) for (const l of c.lessons) for (const f of l.forms) locations.push({ grade: g.grade, chapterId: c.id, lessonId: l.id, formId: f.id });
const state = makeBank({ count: COUNT, locations });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer((req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  const f = join(DIST, p === '' ? 'index.html' : p);
  if (!f.startsWith(DIST) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' }); res.end(readFileSync(f));
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}/index.html`;

// chỉ số tĩnh của CSS (để PR-A đo "từ 14 cỡ chữ → 6", "~87 màu → 23 token")
const css = readFileSync(join(DIST, 'app.css'), 'utf8');
const uniq = (re) => new Set([...css.matchAll(re)].map((m) => m[1].toLowerCase()));
const cssStats = {
  fontSizes: uniq(/font-size:\s*([0-9.]+px)/g).size,
  radii: uniq(/border-radius:\s*([0-9.]+px)/g).size,
  hexColors: uniq(/(#[0-9a-fA-F]{3,8})\b/g).size,
  mediaQueries: (css.match(/@media/g) ?? []).length,
};

mkdirSync(OUT, { recursive: true });
const metrics = { cssStats, count: state.questions.length, screens: [] };
const browser = await chromium.launch();
try {
  for (const [w, h] of SIZES) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript(`localStorage.setItem('hedu.bank.v1', ${JSON.stringify(JSON.stringify(state))})`);
    // sel = phần tử "đáng đo" của màn (thẻ câu, hàng cặp trùng…): đo vị trí y và chiều cao của phần tử đầu tiên
    const snap = async (name, sel) => {
      await page.waitForTimeout(500);
      const m = await page.evaluate((q) => {
        const de = document.documentElement;
        const el = q ? document.querySelector(q) : null;
        const r = el?.getBoundingClientRect();
        return { hscroll: de.scrollWidth > innerWidth, scrollHeight: de.scrollHeight, firstTop: r ? Math.round(r.top) : null, firstHeight: r ? Math.round(r.height) : null };
      }, sel ?? null);
      await page.screenshot({ path: join(OUT, `${w}x${h}_${name}.png`) });
      metrics.screens.push({ size: `${w}x${h}`, name, ...m });
    };
    await page.goto(base); await page.waitForTimeout(1200);
    await snap('ngan-hang-the', 'article.card:not(.card-detail)');
    await page.getByRole('button', { name: 'Danh sách', exact: true }).click().catch(() => {});
    await snap('ngan-hang-danh-sach', 'article.card-detail');
    await page.getByRole('button', { name: 'Thẻ', exact: true }).click().catch(() => {});
    for (const [label, name] of [['Nhập liệu', 'nhap-lieu'], ['Chương trình', 'khung-ct'], ['Hệ thống', 'he-thong']]) {
      await page.locator('.rail .rb', { hasText: label }).first().click(); await snap(name);
    }
    // Nhập liệu với 3 câu dán vào: kết quả rà soát phải thấy ngay, không phải cuộn
    await page.locator('.rail .rb', { hasText: 'Nhập liệu' }).first().click();
    const ex = (n) => `\\begin{ex}\n  Cho hàm số $y=x^2+${n}x$. Tìm giá trị nhỏ nhất của hàm số.\n  \\choice\n  {\\True $${n}$}{$1$}{$2$}{$3$}\n\\end{ex}\n`;
    await page.locator('textarea[aria-label="Mã LaTeX cần nhập"]').fill(ex(1) + ex(2) + ex(3)).catch(() => {});
    await page.waitForSelector('.chk-row', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await snap('nhap-lieu-3cau', '.chk-row');
    await page.locator('.rail .rb', { hasText: 'Ngân hàng' }).first().click();
    const dup = page.getByRole('button', { name: 'Kiểm tra trùng' });
    if (await dup.count()) {
      await dup.first().click();
      await page.locator('.dc-acts .btn-primary').click().catch(() => {});
      await page.waitForSelector('.dc-list li', { timeout: 60000 }).catch(() => {});
      await page.locator('.dc-row').first().click().catch(() => {});
      await snap('kiem-tra-trung', '.dc-row');
      metrics.dupPairHeight = await page.evaluate(() => { const e = document.querySelector('.dc-pair'); return e ? Math.round(e.getBoundingClientRect().height) : null; });
      await page.getByRole('button', { name: 'Đóng', exact: true }).first().click().catch(() => {});
    }
    if (errors.length) metrics.screens.push({ size: `${w}x${h}`, name: 'LỖI-JS', errors });
    await page.close();
  }
} finally { await browser.close(); server.close(); }

writeFileSync(join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 2));
console.log(`Đã ghi ${metrics.screens.length} mục vào ${OUT}`);
console.log('CSS:', JSON.stringify(cssStats));
for (const s of metrics.screens) console.log(`${s.size.padEnd(9)} ${String(s.name).padEnd(22)} ${s.errors ? s.errors.join('; ') : `cuộn ngang=${s.hscroll ? 'CÓ' : 'không'} phần tử đầu y=${s.firstTop} cao=${s.firstHeight}`}`);
