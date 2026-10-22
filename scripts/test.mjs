// Đóng gói file kiểm thử rồi chạy bằng Node.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'hedu-test-'));
for (const name of ['lib.test', 'bank.test', 'packages.test', 'preview.test', 'xemchuan.test', 'zoom.test', 'figscale.test', 'snippet.test', 'review.test', 'crisp.test', 'dup.baseline.test', 'dup2.test', 'dupindex.test']) {
  const out = join(dir, `${name}.mjs`);
  await build({ entryPoints: [`src/lib/${name}.ts`], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error' });
  execFileSync(process.execPath, [out], { stdio: 'inherit' });
}
execFileSync(process.execPath, ['scripts/release-scripts.test.mjs'], { stdio: 'inherit' });
