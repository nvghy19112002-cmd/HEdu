import { scanScratch, blockInfos } from './texscratch';
import { filterCounts, filterInfos, hasTikz, mapBlocks, pickBlocks, planReplace } from './scratchsel';
import type { Taxonomy } from './types';

let fails = 0;
const t = (name: string, ok: boolean) => { if (!ok) { fails++; console.log(`  ✗ ${name}`); } else console.log(`  ✓ ${name}`); };

const text = [
  '% đầu',
  '\\begin{ex}',
  'Câu một $\\dfrac{1}{2}$',
  '\\loigiai{a}',
  '\\end{ex}',
  '',
  '\\begin{ex}%[2D1H1-1]',
  'Câu hai',
  '\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}',
  '\\end{ex}',
  '\\begin{ex}',
  'Câu ba dở',
].join('\n');
const scan = scanScratch(text);
const tax = { grades: [], chapters: [], lessons: [], forms: [] } as unknown as Taxonomy;
const infos = blockInfos(scan, tax);

t('quét được 3 khối', scan.blocks.length === 3);
t('hasTikz đúng', !hasTikz(scan.blocks[0].text) && hasTikz(scan.blocks[1].text));
const none = { buildErr: new Set<number>(), picked: new Set<number>(), dup: new Set<number>() };
t('lọc Có hình = câu 2', filterInfos(infos, 'tikz', none).map((b) => b.block.n).join() === '2');
t('lọc Có lỗi gồm khối chưa đóng', filterInfos(infos, 'problem', none).some((b) => b.block.n === 3));
const ctx = { buildErr: new Set([1]), picked: new Set([2, 3]), dup: new Set([3]) };
t('đếm theo bộ lọc', filterCounts(infos, ctx).all === 3 && filterCounts(infos, ctx)['build-err'] === 1 && filterCounts(infos, ctx).picked === 2 && filterCounts(infos, ctx).dup === 1);

const pk = pickBlocks(text, scan, [1, 2]);
t('ghép khối đã chọn, cách nhau một dòng trống', pk.text.startsWith('\\begin{ex}') && pk.text.includes('\\end{ex}\n\n\\begin{ex}') && pk.count === 2);
const lines = pk.text.split('\n');
t('bảng dòng gốc đủ số dòng', pk.orig.length === lines.length);
t('dòng đầu câu 2 trong bản ghép trỏ đúng dòng gốc', lines[pk.orig.findIndex((x, i) => lines[i].startsWith('\\begin{ex}%') && x === scan.blocks[1].line0)]?.startsWith('\\begin{ex}%') === true);
t('dòng \\loigiai trỏ về dòng 4', pk.orig[lines.findIndex((l) => l.startsWith('\\loigiai'))] === 4);

const mapped = mapBlocks(text, scan, [2], (b) => b.toUpperCase());
t('mapBlocks chỉ đổi khối được chọn', mapped.includes('CÂU HAI') && mapped.includes('Câu một') && mapped.startsWith('% đầu\n'));

const p1 = planReplace(text, scan, null, '\\dfrac', '\\frac', { matchCase: true, regex: false });
t('thay nguyên văn toàn bàn nháp', p1.ok && p1.count === 1 && p1.out.includes('$\\frac{1}{2}$') && p1.linesChanged === 1);
const p2 = planReplace(text, scan, new Set([2]), 'câu', 'CÂU', { matchCase: false, regex: false });
t('chỉ thay trong khối chọn, không phân biệt hoa thường', p2.ok && p2.count === 1 && p2.out.includes('CÂU hai') && p2.out.includes('Câu một'));
const p3 = planReplace(text, scan, null, 'Câu (\\w+)', 'Q-$1', { matchCase: true, regex: true });
t('regex hiểu $1', p3.ok && p3.out.includes('Q-một') && p3.count === 3);
t('thay thường không hiểu $1', (() => { const r = planReplace('a.b', scanScratch('a.b'), null, '.', '$1', { matchCase: true, regex: false }); return r.ok && r.out === 'a$1b'; })());
t('ô tìm trống bị từ chối', !planReplace(text, scan, null, '', 'x', { matchCase: true, regex: false }).ok);
t('regex sai bị từ chối', !planReplace(text, scan, null, '(', 'x', { matchCase: true, regex: true }).ok);
t('regex khớp rỗng bị từ chối', !planReplace(text, scan, null, 'x*', 'y', { matchCase: true, regex: true }).ok);

if (fails) { console.log(`\n${fails} test lỗi`); process.exit(1); }
console.log('\nOK');
