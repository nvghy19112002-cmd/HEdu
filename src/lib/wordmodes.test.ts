import assert from 'node:assert/strict';
import { DEFAULT_WORD_MODES, WORD_MODES, wordFileName, wordModeById } from './wordmodes';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };

t('mỗi chế độ có id, hậu tố và tên tệp khác nhau', () => {
  assert.equal(new Set(WORD_MODES.map((m) => m.id)).size, WORD_MODES.length);
  assert.equal(new Set(WORD_MODES.map((m) => m.suffix)).size, WORD_MODES.length);
  assert.equal(wordFileName('101', wordModeById('day-du-in')!), 'de-101-day-du-in.docx');
  assert.equal(wordFileName('101', wordModeById('hs')!), 'de-101.docx');
});

t('đề học sinh không lộ đáp án; bản đầy đủ có tô đáp án và lời giải', () => {
  for (const id of ['hs', 'hs-in']) { const m = wordModeById(id)!; assert.ok(!m.mark && !m.solution); }
  for (const id of ['day-du', 'day-du-in']) { const m = wordModeById(id)!; assert.ok(m.mark && m.solution); }
  assert.ok(wordModeById('hs-in')!.print && !wordModeById('hs')!.print);
});

t('chế độ mặc định tồn tại', () => {
  for (const id of DEFAULT_WORD_MODES) assert.ok(wordModeById(id));
});
