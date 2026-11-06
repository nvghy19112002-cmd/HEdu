import assert from 'node:assert/strict';
import { collectImages, dirOf, imageNames, needsImages } from './qimages';

const t = async (name: string, f: () => Promise<void> | void) => { await f(); console.log('  ✓ ' + name); };

await t('tìm tên ảnh trong câu, bỏ chú thích và trùng', () => {
  const s = String.raw`Xem \includegraphics[width=5cm]{h1.png} và \includegraphics{images/h2}
% \includegraphics{an.png}
lại \includegraphics[scale=.5]{h1.png}`;
  assert.deepEqual(imageNames(s), ['h1.png', 'images/h2']);
  assert.deepEqual(imageNames('không có ảnh'), []);
});

await t('thư mục của đường dẫn tệp (cả \\ và /)', () => {
  assert.equal(dirOf('D:\\de\\a.tex'), 'D:\\de');
  assert.equal(dirOf('/home/x/a.tex'), '/home/x');
  assert.equal(dirOf('a.tex'), null);
  assert.equal(dirOf(undefined), null);
});

await t('thu thập: gom theo thư mục, gắn ảnh cho từng câu, báo ảnh thiếu', async () => {
  const calls: [string, string[]][] = [];
  const find = async (folder: string, names: string[]) => { calls.push([folder, names]); return names.map((n) => (n === 'mat.png' ? { name: n, file: null, bytes: 0, why: 'không thấy tệp' } : { name: n, file: `${'a'.repeat(32)}.png`, bytes: 9, why: '' })); };
  const r = await collectImages([
    { latex: String.raw`\includegraphics{h1.png}`, dir: 'D:\\a' },
    { latex: String.raw`\includegraphics{h1.png} \includegraphics{mat.png}`, dir: 'D:\\a' },
    { latex: 'không ảnh', dir: 'D:\\a' },
    { latex: String.raw`\includegraphics{x.png}`, dir: null },
  ], find);
  assert.equal(calls.length, 1, 'một lần gọi cho mỗi thư mục');
  assert.deepEqual(calls[0][1], ['h1.png', 'mat.png']);
  assert.deepEqual(r.images[0], [{ name: 'h1.png', file: `${'a'.repeat(32)}.png` }]);
  assert.equal(r.images[1]?.length, 1);
  assert.equal(r.images[2], undefined); assert.equal(r.images[3], undefined);
  assert.deepEqual(r.missing, [{ name: 'mat.png', why: 'không thấy tệp' }]);
});

await t('câu dùng ảnh nhưng kho chưa có ⇒ liệt kê tên', () => {
  assert.deepEqual(needsImages(String.raw`\includegraphics{a.png}\includegraphics{b.png}`, [{ name: 'a.png', file: 'x.png' }]), ['b.png']);
  assert.deepEqual(needsImages('x', undefined), []);
});
