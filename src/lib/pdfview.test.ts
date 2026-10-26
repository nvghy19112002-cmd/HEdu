import assert from 'node:assert/strict';
import { canvasShrink, clampZoom, currentPage, fitPage, fitWidth, layoutPages, matchPages, nextMatch, pagesToRelease, scrollTopFor, stepZoom, visibleRange, ZOOM_MAX, ZOOM_MIN } from './pdfview';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };

t('phóng to/thu nhỏ theo bậc, chặn ở hai đầu, không nhận giá trị hỏng', () => {
  assert.equal(stepZoom(1, 1), 1.25);
  assert.equal(stepZoom(1, -1), 0.75);
  assert.equal(stepZoom(1.1, 1), 1.25);
  assert.equal(stepZoom(3, 1), ZOOM_MAX);
  assert.equal(stepZoom(0.5, -1), ZOOM_MIN);
  assert.equal(clampZoom(NaN), 1);
  assert.equal(clampZoom(99), ZOOM_MAX);
  assert.equal(clampZoom(0.01), ZOOM_MIN);
});
t('vừa chiều rộng / vừa trang', () => {
  assert.equal(fitWidth(632, 600), 1);
  assert.ok(Math.abs(fitPage(1000, 600, 600, 800) - 568 / 800) < 1e-9);
  assert.equal(fitWidth(100, 10000), ZOOM_MIN);
});
const L = layoutPages([100, 100, 100, 100, 100]); // tops 12,124,236,348,460 ; tổng 572
t('bố cục và trang nhìn thấy (có đệm)', () => {
  assert.deepEqual(L.tops, [12, 124, 236, 348, 460]);
  assert.equal(L.total, 572);
  assert.deepEqual(visibleRange(L, 0, 150, 0), [0, 1]);
  assert.deepEqual(visibleRange(L, 0, 150, 100), [0, 1, 2]);
  assert.deepEqual(visibleRange(L, 460, 100, 0), [4]);
});
t('trang hiện tại là trang chiếm nhiều nhất; cuộn tới trang', () => {
  assert.equal(currentPage(L, 0, 120), 0);
  assert.equal(currentPage(L, 100, 120), 1);
  assert.equal(currentPage(L, 400, 200), 4);
  assert.equal(scrollTopFor(L, 2), 224);
  assert.equal(scrollTopFor(L, 99), 448);
  assert.equal(scrollTopFor(L, 0), 0);
});
t('giữ tối đa N trang đã vẽ, bỏ trang xa nhất', () => {
  assert.deepEqual(pagesToRelease([1, 2, 3], 2, 6), []);
  assert.deepEqual(pagesToRelease([0, 1, 2, 3, 4, 5, 6, 7], 7, 6).sort(), [0, 1]);
});
t('giới hạn canvas khi phóng to rất lớn', () => {
  assert.equal(canvasShrink(1000, 1400), 1);
  assert.ok(canvasShrink(20000, 20000) < 1);
  assert.ok(canvasShrink(20000, 20000) * 20000 <= 8192 + 1e-6);
});
t('tìm chữ không phân biệt dấu/hoa thường; chuỗi rỗng không khớp; đi vòng tròn', () => {
  const pages = ['Đề kiểm tra Toán', 'Bài 1: Hàm số', 'Lời giải câu 1', 'hàm số bậc hai'];
  assert.deepEqual(matchPages(pages, 'HAM SO'), [1, 3]);
  assert.deepEqual(matchPages(pages, '  '), []);
  assert.deepEqual(matchPages(pages, 'không có'), []);
  assert.equal(nextMatch([1, 3], 0, 1), 1);
  assert.equal(nextMatch([1, 3], 1, 1), 3);
  assert.equal(nextMatch([1, 3], 3, 1), 1);
  assert.equal(nextMatch([1, 3], 1, -1), 3);
  assert.equal(nextMatch([], 0, 1), null);
});
console.log('pdfview: OK');
