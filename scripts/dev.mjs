// Chạy thử khi phát triển: node scripts/dev.mjs  (Tauri gọi qua `npm run tauri dev`)
// Build một lần, rồi theo dõi src/ và phục vụ dist/ tại http://localhost:1420
import { execFileSync } from 'node:child_process';
import { context } from 'esbuild';

execFileSync(process.execPath, ['scripts/build.mjs', '--dev'], { stdio: 'inherit' });

const ctx = await context({
  entryPoints: { app: 'src/main.tsx' },
  bundle: true,
  format: 'esm',
  target: ['chrome110'],
  jsx: 'automatic',
  outdir: 'dist',
  sourcemap: true,
  loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file' },
  assetNames: 'fonts/[name]-[hash]',
  define: { 'process.env.NODE_ENV': '"development"' },
  logLevel: 'info',
});
await ctx.watch();
const { port } = await ctx.serve({ servedir: 'dist', port: 1420 });
console.log(`HEdu dev: http://localhost:${port}`);
