// Đóng gói giao diện bằng esbuild.
//   node scripts/build.mjs          → dist/ (index.html + app.js + app.css + font KaTeX)
//   node scripts/build.mjs --single → dist/hedu-xem-thu.html (một file duy nhất, dùng để xem thử)
import { build } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const single = process.argv.includes('--single');
const dev = process.argv.includes('--dev'); // dùng bởi scripts/dev.mjs
export const outDir = 'dist';
const out = outDir;
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// KaTeX khai báo 3 định dạng font; chỉ giữ woff2 (mọi trình duyệt/WebView2 hiện đại đều đọc được).
const katexWoff2Only = {
  name: 'katex-woff2-only',
  setup(b) {
    b.onLoad({ filter: /katex(\.min)?\.css$/ }, (args) => {
      const css = readFileSync(args.path, 'utf8').replace(/,url\([^)]*\.woff\) format\("woff"\),url\([^)]*\.ttf\) format\("truetype"\)/g, '');
      return { contents: css, loader: 'css', resolveDir: args.path.replace(/[/\\][^/\\]+$/, '') };
    });
  },
};

// Font chữ cho bản cài đặt: gói sẵn từ @fontsource (chạy offline, không cần Internet).
// Nếu chưa cài gói thì bản xem thử dùng Google Fonts như trước.
const FONT_FILES = [
  ...['400', '500', '600', '700'].flatMap((w) => ['latin', 'latin-ext', 'vietnamese'].map((s) => `@fontsource/be-vietnam-pro/${s}-${w}.css`)),
  ...['500', '600', '400-italic'].flatMap((w) => ['latin', 'latin-ext', 'vietnamese'].map((s) => `@fontsource/lora/${s}-${w}.css`)),
  ...['400', '500'].flatMap((w) => ['latin', 'latin-ext', 'vietnamese'].map((s) => `@fontsource/jetbrains-mono/${s}-${w}.css`)),
].filter((f) => existsSync(`node_modules/${f}`));
const bundledFonts = !single && FONT_FILES.length > 0;
const entryPoints = { app: 'src/main.tsx' };
if (bundledFonts) {
  mkdirSync('.build', { recursive: true });
  writeFileSync('.build/fonts.css', FONT_FILES.map((f) => `@import "${f}";`).join('\n'));
  entryPoints.fonts = '.build/fonts.css';
}

const result = await build({
  entryPoints,
  bundle: true,
  minify: !dev,
  sourcemap: dev,
  format: 'esm',
  target: ['chrome110', 'edge110', 'firefox115', 'safari16'],
  jsx: 'automatic',
  outdir: out,
  write: !single,
  loader: { '.woff2': single ? 'dataurl' : 'file', '.woff': 'file', '.ttf': 'file' },
  assetNames: 'fonts/[name]-[hash]',
  plugins: [katexWoff2Only],
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});

const googleFonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Lora:ital,wght@0,500;0,600;1,400;1,500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">';

const fonts = bundledFonts ? '<link rel="stylesheet" href="./fonts.css">' : googleFonts;

function page(head, body) {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HEdu</title>
${fonts}
${head}
</head>
<body>
<div id="root"></div>
${body}
</body>
</html>
`;
}

if (single) {
  const js = result.outputFiles.find((f) => f.path.endsWith('.js')).text;
  const css = result.outputFiles.find((f) => f.path.endsWith('.css')).text;
  const html = page(`<style>${css}</style>`, `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`);
  writeFileSync(`${out}/hedu-xem-thu.html`, html);
  // Bản đăng lên claude.ai: trình xem tự thêm khung <html><head><body>, nên chỉ ghi phần thân.
  const artifact = `<title>HEdu</title>\n${fonts}\n<style>${css}</style>\n<div id="root"></div>\n<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>\n`;
  writeFileSync(`${out}/hedu-artifact.html`, artifact);
  console.log(`dist/hedu-xem-thu.html  ${(html.length / 1024).toFixed(0)} KB (+ hedu-artifact.html)`);
} else {
  writeFileSync(`${out}/index.html`, page('<link rel="stylesheet" href="./app.css">', '<script type="module" src="./app.js"></script>'));
  console.log('dist/ ready');
}
