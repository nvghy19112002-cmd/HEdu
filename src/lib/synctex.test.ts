import assert from 'node:assert/strict';
import { mapSyncFile } from './synctex';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const rels = ['main.tex', 'chapters/c1.tex', 'c1.tex', 'sub/de/main.tex'];

console.log('SyncTeX: đối chiếu tệp');
t('đường dẫn tuyệt đối trong thư mục build → tệp của đề (khớp đuôi dài nhất)', () => {
  assert.equal(mapSyncFile('C:/Users/a/cache/exam-build/ID/work/main.tex', rels), 'main.tex');
  assert.equal(mapSyncFile('C:\\Users\\a\\cache\\exam-build\\ID\\work\\chapters\\c1.tex', rels), 'chapters/c1.tex', 'c1.tex ở thư mục con không nhầm với c1.tex ở gốc');
  assert.equal(mapSyncFile('D:/x/work/sub/de/main.tex', rels), 'sub/de/main.tex');
});
t('đường dẫn tương đối ./ và không phân biệt hoa thường (Windows)', () => {
  assert.equal(mapSyncFile('./main.tex', rels), 'main.tex');
  assert.equal(mapSyncFile('./Chapters/C1.TEX', rels), 'chapters/c1.tex');
});
t('tệp không thuộc đề (phần đầu do HEdu ghép, gói hệ thống) ⇒ null; không khớp nửa tên', () => {
  assert.equal(mapSyncFile('C:/texlive/texmf-dist/tex/latex/base/article.cls', rels), null);
  assert.equal(mapSyncFile('C:/x/work/xmain.tex', rels), null);
});
