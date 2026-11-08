import assert from 'node:assert/strict';
import { DEFAULT_INTRO, EMPTY_FRAME, fillSentence, misplaced, partOf, pickSetupFile, planSetup, scanSetup, type SetupPlan } from './examsetup';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const tn = (s: string) => `\\begin{ex}%[2D1H1-1]\n${s}?\n\\choice\n{\\True a}\n{b}\n{c}\n{d}\n\\loigiai{x}\n\\end{ex}`;
const ds = (s: string) => `\\begin{ex}\n${s}\n\\choiceTF\n{\\True a}\n{b}\n{c}\n{d}\n\\end{ex}`;
const sa = (s: string) => `\\begin{ex}\n${s}\n\\shortans{3}\n\\end{ex}`;
const tl = (s: string) => `\\begin{ex}\n${s}\n\\end{ex}`;
const ok = (r: SetupPlan | { error: string }): SetupPlan => { if ('error' in r) throw new Error(r.error); return r; };
const run = (src: string, extra: Partial<Parameters<typeof planSetup>[2]> = {}) => {
  const sc = scanSetup(src);
  return ok(planSetup(src, sc, { parts: sc.blocks.map((b) => b.part), headings: 'update', intro: DEFAULT_INTRO, frame: null, ...extra }));
};
/** mọi khối câu trong văn bản mới giữ nguyên từng chữ */
const keepsBlocks = (a: string, b: string) => { for (const blk of scanSetup(a).blocks) assert.ok(b.includes(a.slice(blk.start, blk.end)), 'mất/đổi khối câu'); };

t('nhận phần theo lệnh; \\choice trong lời giải không tính', () => {
  assert.equal(partOf(tn('A')), 'p1');
  assert.equal(partOf(ds('B')), 'p2');
  assert.equal(partOf(sa('C')), 'p3');
  assert.equal(partOf(tl('D')), 'p4');
  assert.equal(partOf('\\begin{ex}\nTính\n\\loigiai{\\choice{a}{b}}\n\\end{ex}'), 'p4');
  assert.equal(partOf('\\begin{ex}\nX\n% \\choiceTF\n\\end{ex}'), 'p4');
});

t('đề chuẩn 2/1/1/0: chèn đúng 3 phần, số câu đúng, câu nguyên văn', () => {
  const src = `\\begin{document}\n${tn('1')}\n\n${tn('2')}\n\n${ds('3')}\n\n${sa('4')}\n\\end{document}\n`;
  const r = run(src);
  assert.deepEqual(r.inserted, ['PHẦN I', 'PHẦN II', 'PHẦN III']);
  assert.equal(r.reordered, false);
  assert.ok(r.text.includes('\\textbf{PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.} \\textit{Thí sinh trả lời từ câu 1 đến câu 2.'));
  assert.ok(r.text.includes('PHẦN III. Câu trắc nghiệm trả lời ngắn.} \\textit{Thí sinh trả lời câu 1.}'));
  assert.ok(r.text.indexOf('PHẦN II.') < r.text.indexOf('\\choiceTF'));
  keepsBlocks(src, r.text);
});

t('số La Mã liên tục: không có Đúng/Sai thì Trả lời ngắn là PHẦN II', () => {
  const r = run(`${tn('1')}\n${sa('2')}\n${tl('3')}\n`);
  assert.deepEqual(r.inserted, ['PHẦN I', 'PHẦN II', 'PHẦN III']);
  assert.ok(r.text.includes('PHẦN II. Câu trắc nghiệm trả lời ngắn.'));
  assert.ok(r.text.includes('PHẦN III. Tự luận.'));
});

t('câu xen kẽ: sắp lại theo phần, giữ chú thích dính trên câu', () => {
  const src = `${tn('1')}\n\n% câu tự luận lạc\n${tl('2')}\n\n${tn('3')}\n`;
  assert.deepEqual(misplaced(scanSetup(src).blocks.map((b) => b.part)), [2]);
  assert.deepEqual(misplaced(['p1', 'p1', 'p4', 'p1', 'p2', 'p3']), [3]);
  assert.deepEqual(misplaced(['p1', 'p2', 'p3', 'p4']), []);
  const r = run(src);
  assert.equal(r.reordered, true);
  assert.ok(r.text.indexOf('\n3?') < r.text.indexOf('% câu tự luận lạc'));
  assert.ok(r.text.indexOf('% câu tự luận lạc') < r.text.indexOf('\n2\n'));
  keepsBlocks(src, r.text);
});

t('xen kẽ mà giữa câu có \\newpage: báo lỗi, không tự sắp', () => {
  const src = `${tl('1')}\n\\newpage\n${tn('2')}\n`;
  const sc = scanSetup(src);
  const r = planSetup(src, sc, { parts: sc.blocks.map((b) => b.part), headings: 'update', intro: DEFAULT_INTRO, frame: null });
  assert.ok('error' in r && /newpage|nội dung khác/.test(r.error));
});

t('tiêu đề gõ tay: Cập nhật thay hẳn, Giữ thì không chèn trùng', () => {
  const src = `\\noindent\n{\\textbf{PHẦN I. Trắc nghiệm.} Thí sinh trả lời từ câu 1 đến câu 9.}\n\\setcounter{ex}{0}\n${tn('1')}\n\\cauds\n${ds('2')}\n`;
  const sc = scanSetup(src);
  assert.equal(sc.headings.length, 2);
  const up = run(src);
  assert.ok(!up.text.includes('câu 9') && !up.text.includes('\\cauds'));
  assert.equal((up.text.match(/PHẦN I\./g) ?? []).length, 1);
  const keep = run(src, { headings: 'keep' });
  assert.ok(keep.text.includes('câu 9') && keep.text.includes('\\cauds'));
  assert.deepEqual(keep.inserted, []);
});

t('chạy lần hai không chèn trùng (thay đoạn của HEdu)', () => {
  const once = run(`${tn('1')}\n${ds('2')}\n`).text;
  const twice = run(once).text;
  assert.equal(twice, once);
});

t('khung tiêu đề: điền vào \\begin{name} của khaibaochung', () => {
  const src = `\\begin{document}\n\\begin{name}{SỞ A}{TRƯỜNG B}{\\mbox{}}{\\mbox{}}{ĐỀ CŨ}{Toán}{Thời gian làm bài: 60 phút}{\\mbox{}}\n\\end{name}\n${tn('1')}\n\\end{document}`;
  const sc = scanSetup(src);
  assert.equal(sc.frame.kind, 'name');
  if (sc.frame.kind === 'name') { assert.equal(sc.frame.info.title, 'ĐỀ CŨ'); assert.equal(sc.frame.info.minutes, 60); }
  const r = run(src, { frame: { ...EMPTY_FRAME, dept: 'SỞ A', school: 'TRƯỜNG B', title: 'ĐỀ GIỮA KỲ 1 & 2', minutes: 90 } });
  assert.ok(r.text.includes('{ĐỀ GIỮA KỲ 1 \\& 2}{Toán}{Thời gian làm bài: 90 phút}'));
  assert.equal((r.text.match(/\\begin\{name\}/g) ?? []).length, 1);
});

t('khung tiêu đề đơn giản: chèn sau \\begin{document}, lần sau thay đúng chỗ', () => {
  const src = `\\documentclass{article}\n\\begin{document}\n${tn('1')}\n\\end{document}\n`;
  const f = { ...EMPTY_FRAME, school: 'THPT X', title: 'Kiểm tra', code: '101' };
  const a = run(src, { frame: f }).text;
  assert.ok(a.indexOf('% HEdu: khung-tieu-de') > a.indexOf('\\begin{document}'));
  assert.ok(a.indexOf('% HEdu: khung-tieu-de') < a.indexOf('PHẦN I'));
  assert.ok(a.includes('Mã đề thi: 101'));
  const sc = scanSetup(a);
  assert.equal(sc.frame.kind, 'marker');
  if (sc.frame.kind === 'marker') assert.equal(sc.frame.info?.school, 'THPT X');
  const b = run(a, { frame: { ...f, school: 'THPT Y' } }).text;
  assert.equal((b.match(/khung-tieu-de/g) ?? []).length, 1);
  assert.ok(b.includes('THPT Y') && !b.includes('THPT X\\'));
});

t('ca khó trong câu không bị đụng: \\immini, \\def trong tikz, \\newcommand có tham số', () => {
  const hard = `\\begin{ex}\n\\immini{Cho hình.\\newcommand{\\vv}[1]{\\overrightarrow{#1}} $\\vv{AB}$}{\\begin{tikzpicture}\\def\\a{2}\\draw (0,0)--(\\a,0);\\end{tikzpicture}}\n\\choice\n{\\True a}{b}{c}{d}\n\\end{ex}`;
  const src = `${tl('1')}\n${hard}\n`;
  const r = run(src);
  assert.equal(r.reordered, true);
  keepsBlocks(src, r.text);
});

t('khối bị chú thích hoặc thiếu \\end{ex} không đếm; CRLF đọc được', () => {
  const sc = scanSetup(`% \\begin{ex}\n% x\n% \\end{ex}\n\\begin{ex}\nA\n\\begin{ex}\r\nB\r\n\\choice\r\n{\\True a}{b}{c}{d}\r\n\\end{ex}\r\n`);
  assert.equal(sc.blocks.length, 1);
  assert.equal(sc.blocks[0].part, 'p1');
  assert.equal(sc.issues.length, 1);
});

t('văn bản OCR thô chưa có khung câu', () => {
  const sc = scanSetup('Câu 1. Tính 1+1.\nA. 1 B. 2 C. 3 D. 4\nCâu 2: ...');
  assert.equal(sc.blocks.length, 0);
  assert.equal(sc.raw, true);
});

t('một câu: "câu 1"; chọn tệp nhiều câu nhất', () => {
  assert.equal(fillSentence('Thí sinh trả lời từ câu 1 đến câu {n}.', 1), 'Thí sinh trả lời câu 1.');
  assert.equal(fillSentence('từ câu 1 đến câu {n}', 12), 'từ câu 1 đến câu 12');
  assert.equal(pickSetupFile([{ rel: 'main.tex', count: 0 }, { rel: 'noidung.tex', count: 22 }, { rel: 'a.png', count: 0 }], 'main.tex'), 'noidung.tex');
  assert.equal(pickSetupFile([{ rel: 'main.tex', count: 0 }], 'main.tex'), 'main.tex');
});
