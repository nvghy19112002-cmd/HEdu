import assert from 'node:assert/strict';
import { canJump, groupDiagnostics, summarize, type CompileOut, type Diag } from './examcompile';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const d = (o: Partial<Diag>): Diag => ({ severity: 'error', file: 'main.tex', line: 1, inProject: true, message: 'x', context: [], ...o });
const out = (o: Partial<CompileOut>): CompileOut => ({
  status: 'ok', message: 'ok', published: true, cached: false, invalidPdf: false, keptPrevious: false, pages: 1, runs: 1, ms: 1, engine: 'pdflatex', texVersion: '', fingerprint: '', mode: 'nguyen-van',
  diagnostics: [], errorCount: 0, warningCount: 0, warnings: [], rawLog: '', lastGood: null, treeGuard: true, ...o,
});

t('nhóm theo tệp, lỗi trước cảnh báo, theo dòng; mục không rõ tệp ở cuối', () => {
  const g = groupDiagnostics([
    d({ file: 'b.tex', line: 9 }), d({ file: 'a.tex', severity: 'warning', line: 1 }), d({ file: 'a.tex', line: 5 }), d({ file: 'a.tex', line: 2 }),
    d({ file: null, line: null, inProject: false, message: 'Emergency stop' }),
  ]);
  assert.deepEqual(g.map((x) => x.file), ['a.tex', 'b.tex', null]);
  assert.deepEqual(g[0].items.map((x) => `${x.severity}${x.line}`), ['error2', 'error5', 'warning1']);
});
t('chỉ nhảy tới dòng khi tệp thuộc dự án và có số dòng', () => {
  assert.equal(canJump(d({})), true);
  assert.equal(canJump(d({ inProject: false })), false);
  assert.equal(canJump(d({ file: null })), false);
  assert.equal(canJump(d({ line: null })), false);
});
t('lỗi/hết giờ/không có TeX không bao giờ hiện như thành công', () => {
  assert.equal(summarize(out({})).tone, 'ok');
  assert.equal(summarize(out({ warnings: ['trùng gói'] })).tone, 'warn');
  for (const s of ['failed', 'timeout', 'no-tex'] as const) assert.equal(summarize(out({ status: s, published: false })).tone, 'bad');
  assert.equal(summarize(out({ status: 'cancelled' })).tone, 'warn');
});
console.log('examcompile: OK');
