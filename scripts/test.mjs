// Đóng gói file kiểm thử rồi chạy bằng Node.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'hedu-test-'));
for (const name of ['lib.test', 'bank.test', 'packages.test', 'preview.test', 'xemchuan.test', 'zoom.test', 'figscale.test', 'snippet.test', 'review.test', 'crisp.test', 'dup.baseline.test', 'dup2.test', 'dupindex.test', 'dupscope.test', 'dupdiff.test', 'dupimport.test', 'dupdecisions.test', 'goldset.test', 'figure.test', 'bankfilter.test', 'selection.test', 'batchops.test', 'trashbatch.test', 'texexport.test', 'savefile.test', 'texproject.test', 'dupnav.test', 'taxpath.test', 'idsuggest.test', 'idapply.test', 'iddraft.test', 'ai/client.test', 'ai/prefs.test', 'ai/tasks/ganid.test', 'ai/tasks/ganidrun.test', 'trashsafe.test', 'trashview.test', 'settingsnav.test', 'ai/profiles.test', 'ai/benchmark.test', 'ai/benchrun.test', 'importid.test', 'storedelta.test', 'dbbackup.test', 'storagefail.test', 'importfiles.test', 'importbatch.test', 'importreport.test', 'trashrelocate.test', 'xemchuancache.test', 'examlib.test', 'examcompile.test', 'idtex.test']) {
  const out = join(dir, `${name}.mjs`);
  await build({ entryPoints: [`src/lib/${name}.ts`], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error' });
  execFileSync(process.execPath, [out], { stdio: 'inherit' });
}
execFileSync(process.execPath, ['scripts/release-scripts.test.mjs'], { stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/ui-fixtures.test.mjs'], { stdio: 'inherit' });
