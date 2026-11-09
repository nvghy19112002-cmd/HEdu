import assert from 'node:assert/strict';
import { braceArgs, decorBody, findParts, findTitle, inkBox, stripComments, themeAccent } from './worddecor';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };

t('đọc nhóm ngoặc lồng nhau, báo null khi ngoặc lệch', () => {
  assert.deepEqual(braceArgs('{a{b}} {c\\}d}', 0, 2)?.args, ['a{b}', 'c\\}d']);
  assert.equal(braceArgs('{a', 0, 1), null);
  assert.equal(braceArgs('x', 0, 1), null);
});

t('bỏ chú thích nhưng giữ \\%', () => {
  assert.equal(stripComments('a % b\n50\\% c'), 'a \n50\\% c');
});

t('tìm tiêu đề \\TieuDeDeSo và \\TieuDeDeThi, bỏ qua dòng chú thích', () => {
  const s = '% \\TieuDeDeSo{x}{x}{x}{x}{99}\n\\TieuDeDeSo{SỞ GD}{ÔN TẬP}{Toán-Lớp 10}{90 phút}{ 04 }\n';
  const a = findTitle(s)!;
  assert.equal(a.kind, 'so'); assert.equal(a.code, '04'); assert.equal(a.exam, 'ÔN TẬP');
  assert.ok(a.raw.startsWith('\\TieuDeDeSo{SỞ GD}'));
  const b = findTitle('\\TieuDeDeThi{Sở}{Trường}{KT}{Toán}{90}{101}')!;
  assert.equal(b.kind, 'thi'); assert.equal(b.code, '101'); assert.equal(b.school, 'Sở Trường');
  assert.equal(findTitle('không có'), null);
});

t('tìm dòng PHẦN in đậm theo thứ tự, không bắt chữ đậm khác', () => {
  const s = '\\noindent\\textbf{PHẦN I. Trắc nghiệm.} \\textit{x}\n\\textbf{Câu hỏi}\n% \\textbf{PHẦN X}\n\\textbf{PHẦN II. Đúng sai {(2 điểm)}.}';
  assert.deepEqual(findParts(s), ['\\textbf{PHẦN I. Trắc nghiệm.}', '\\textbf{PHẦN II. Đúng sai {(2 điểm)}.}']);
});

t('tài liệu trang trí: mỗi phần một trang, trang cuối là đầu/chân trang', () => {
  const body = decorBody(findTitle('\\TieuDeDeSo{a}{b}{c}{d}{01}'), ['\\textbf{PHẦN I.}']);
  assert.equal(body.match(/\\newpage/g)?.length, 3);
  assert.ok(body.startsWith('\\pagestyle{empty}'));
  assert.ok(body.includes('\\thispagestyle{fancy}'));
});

t('màu nhấn lấy từ mẫu; bản in đen trắng là đen', () => {
  assert.equal(themeAccent('hymath-13-sky-panel'), '1F55A4');
  assert.equal(themeAccent('hymath-13-sky-panel', true), '000000');
});

t('khung bao nét vẽ bỏ qua nền trắng', () => {
  const w = 4, h = 3, px = new Uint8ClampedArray(w * h * 4).fill(255);
  const dot = (x: number, y: number) => { const i = (y * w + x) * 4; px[i] = px[i + 1] = px[i + 2] = 0; };
  dot(1, 1); dot(2, 2);
  assert.deepEqual(inkBox(px, w, 0, h), { x: 1, y: 1, w: 2, h: 2 });
  assert.equal(inkBox(px, w, 0, 1), null);
});
