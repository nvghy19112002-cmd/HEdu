import { scanScratch } from './texscratch';
import { applyScratchIds, blocksNeedingId, buildScratchLot, planScratchIds } from './scratchid';
import { PROPOSAL_FORMAT, type ProposalFile } from './claudeid';
import { contentKeys } from './idreview';
import { indexOf } from './taxonomy';
import { taxRevision } from './taxpath';
import { getTaxonomy } from './curriculum';

let fails = 0;
const t = (name: string, ok: boolean) => { if (!ok) { fails++; console.log(`  ✗ ${name}`); } else console.log(`  ✓ ${name}`); };

const tax = getTaxonomy();
const ix = indexOf(tax);
const g = tax.grades[0];
const form = g.branches[0].chapters[0].lessons[0].forms[0];

const text = [
  '\\begin{ex}',
  'Câu một cần ID $x^2$',
  '\\loigiai{a}',
  '\\end{ex}',
  '\\begin{ex}%[0D1H1-1]',
  'Câu hai đã có ID',
  '\\end{ex}',
  '\\begin{ex}',
  'Câu ba dở',
].join('\n');
const scan = scanScratch(text);

const need = blocksNeedingId(scan, null);
t('chỉ lấy khối hoàn chỉnh chưa có ID', need.length === 1 && need[0].n === 1);
t('phạm vi đã chọn thu hẹp danh sách', blocksNeedingId(scan, new Set([2])).length === 0);

const { lot, count } = buildScratchLot(need, { tax, taxRev: taxRevision(tax), grade: g.grade, lo: 'B1', now: new Date(0) });
t('lô có đúng 1 câu, khoá n1, lớp đã chọn', count === 1 && lot.cau[0].k === 'n1' && lot.cau[0].lop === g.grade && lot.format === 'hedu-gan-id');
t('lô chỉ gửi Dạng của lớp đã chọn', lot.dang.length > 0 && lot.dang.every((f) => f.duong.startsWith(`Lớp ${g.grade} `)));

const blocks = new Map(scan.blocks.map((b) => [b.n, b.text] as const));
const prop = (over: Partial<ProposalFile['cau'][number]> = {}): ProposalFile => ({ format: PROPOSAL_FORMAT, v: 1, lo: 'B1', cau: [{ k: 'n1', fp: lot.cau[0].fp, dang: form.id, muc: 'TH', chac: 'cao', lyDo: 'ok', ...over }] });
const o = { tax, ix, grade: g.grade as number | null };

const p1 = planScratchIds(prop(), blocks, o);
t('đề xuất hợp lệ → 1 chỉnh sửa, ID chèn sau \\begin{ex}', p1.edits.length === 1 && /^\\begin\{ex\}%\[[0-9A-Za-z-]+\]/.test(p1.edits[0].after));
const out = applyScratchIds(text, scan, p1.edits);
t('chỉ khối 1 đổi, phần còn lại nguyên văn', out.endsWith(text.slice(text.indexOf('\\begin{ex}%[0D1H1-1]'))) && out.includes('Câu một cần ID $x^2$\n\\loigiai{a}\n\\end{ex}') && out.length === text.length + (p1.edits[0].after.length - p1.edits[0].before.length));
t('ghi xong thì dấu vết nội dung (bỏ ID) không đổi', contentKeys(p1.edits[0].after).i === lot.cau[0].fp);

t('câu đã sửa sau khi xuất lô bị bỏ qua', planScratchIds(prop({ fp: 'sai' }), blocks, o).skip['doi-noi-dung'] === 1);
t('Dạng lạ bị bỏ qua', planScratchIds(prop({ dang: 'khong-co' }), blocks, o).skip['dang-la'] === 1);
t('thiếu mức độ thì không đoán', planScratchIds(prop({ muc: undefined }), blocks, o).skip['thieu-muc'] === 1);
t('khoá không còn trong bàn nháp', planScratchIds(prop({ k: 'n9' }), blocks, o).skip['khong-con'] === 1);
t('câu đã có ID không bị đụng', planScratchIds(prop({ k: 'n2', fp: contentKeys(blocks.get(2)!).i }), blocks, o).skip['da-co-id'] === 1);
t('khoá lặp bị đếm là trùng', planScratchIds({ ...prop(), cau: [...prop().cau, ...prop().cau] }, blocks, o).skip.trung === 1);
const other = tax.grades.find((x) => x.grade !== g.grade);
if (other) t('Dạng khác lớp đã chọn bị bỏ qua', planScratchIds(prop(), blocks, { ...o, grade: other.grade }).skip['sai-lop'] === 1);
t('sau khi bàn nháp đổi, không ghi đè khối khác', applyScratchIds(text.replace('Câu một', 'Câu 1'), scanScratch(text.replace('Câu một', 'Câu 1')), p1.edits) === text.replace('Câu một', 'Câu 1'));

if (fails) { console.log(`\n${fails} test lỗi`); process.exit(1); }
console.log('\nOK');
