import assert from 'node:assert/strict';
import { slidesBase, slidesFiles, slidesTex, SLIDES_MAIN } from './slidepdf';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const items = [{ latex: '\\begin{ex}Câu một $x^2$\\choice{\\True a}{b}{c}{d}\\loigiai{Vì vậy}\\end{ex}' }, { latex: '\\begin{ex}Câu hai\\shortans{3}\\end{ex}', uid: 'u2' }];

t('mỗi câu một trang, giữ nguyên văn LaTeX, đánh số tiếp từ 1', () => {
  const s = slidesTex('Ôn tập 50% chương 1', items, false);
  assert.ok(s.includes(items[0].latex) && s.includes(items[1].latex));
  assert.equal(s.match(/\\newpage/g)?.length, 3);
  assert.ok(s.includes('\\setcounter{ex}{0}') && s.includes('\\setcounter{ex}{1}'));
  assert.ok(s.includes('Ôn tập 50\\% chương 1'), 'tên bộ được thoát ký tự %');
});

t('chỉ đề thì ẩn lời giải; kèm lời giải thì không', () => {
  assert.ok(slidesTex('a', items, false).includes('\\anloigiai'));
  assert.ok(!slidesTex('a', items, true).includes('\\anloigiai'));
});

t('đủ tệp khai báo + tệp chính, tên tệp không dấu', () => {
  const f = slidesFiles('Bộ 1', items, true).map((x) => x.path);
  assert.ok(f.includes('khaibaochung.tex') && f.includes('hedu.sty') && f.includes(SLIDES_MAIN));
  assert.equal(slidesBase('Đạo hàm – Lớp 11!', true), 'dao-ham-lop-11-loi-giai');
  assert.equal(slidesBase('***', false), 'trinh-chieu');
});
