// Đóng gói file kiểm thử rồi chạy bằng Node.
// Tự dò mọi tệp src/lib/**/*.test.ts (xếp theo tên): thêm test mới chỉ cần tạo tệp, không phải đăng ký ở đây.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const names = readdirSync('src/lib', { recursive: true })
  .map((f) => String(f).replace(/\\/g, '/'))
  .filter((f) => f.endsWith('.test.ts'))
  .map((f) => f.slice(0, -3))
  .sort();
if (!names.length) throw new Error('Không tìm thấy tệp kiểm thử nào trong src/lib.');

const dir = mkdtempSync(join(tmpdir(), 'hedu-test-'));
for (const name of names) {
  const out = join(dir, `${name}.mjs`);
  mkdirSync(dirname(out), { recursive: true });
  await build({ entryPoints: [`src/lib/${name}.ts`], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error' });
  execFileSync(process.execPath, [out], { stdio: 'inherit' });
}
execFileSync(process.execPath, ['scripts/release-scripts.test.mjs'], { stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/ui-fixtures.test.mjs'], { stdio: 'inherit' });
console.log(`Đã chạy ${names.length} tệp kiểm thử trong src/lib.`);
