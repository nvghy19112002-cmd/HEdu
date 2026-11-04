import assert from 'node:assert/strict';
import { lintSummary, lintText, type Lint } from './chktex';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const L = (num: number, level: Lint['level'] = 'warning', msg = 'English msg'): Lint => ({ line: 1, col: 1, num, level, msg });

console.log('ChkTeX');
t('cảnh báo hay gặp có lời Việt; số lạ hiện nguyên văn', () => {
  assert.match(lintText(L(15)), /dấu đóng khớp/);
  assert.equal(lintText(L(99, 'warning', 'Something odd.')), 'Something odd.');
});
t('tóm tắt', () => {
  assert.equal(lintSummary([]), 'Không thấy vấn đề nào.');
  assert.equal(lintSummary([L(15), L(17, 'error')]), '2 chỗ cần xem (1 lỗi).');
  assert.equal(lintSummary([L(15)]), '1 chỗ cần xem.');
});
