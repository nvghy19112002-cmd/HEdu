// Bộ đọc/ghi ID chuẩn (idtex + idsync): đọc đúng ID chính, không đoán; ghi chỉ đổi vùng ID; giữ nguyên từng byte khi ID đã đúng.
import { comparePair, fingerprint } from './dup2';
import { normalizeForDup } from './dup';
import { parseExTest } from './extest';
import { idlessVariants, readHead, sameExceptId, withoutHeadId, writeHeadId } from './idtex';
import { affectedByTaxChange, codeClashes, idStatus, placeWithId, readLatexId, resolveCode, strictCode } from './idsync';
import { buildDefault, indexOf, setNodeCode } from './taxonomy';
import { locationOfForm } from './taxpath';
import { buildRows } from './importbatch';
import { applyIdSync, getAutoIdUndo, syncCounts, undoAutoId } from './idapply';
import { getTaxonomy } from './curriculum';
import { addMany, applyTaxonomyKeepIds, flushSave, getState, initStore, saveQuestion, setReview } from './store';
import { verbatimTex } from './texproject';
import type { Location } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const tax = buildDefault();
const ix = indexOf(tax);
const R = resolveCode('2D1H1-1', tax);
if (!R.ok) throw new Error('cây mặc định phải có 2D1H1-1');
const loc: Location = R.loc;

console.log('Đọc ID chính');
{
  ok(readHead('\\begin{ex}%[2D1H1-1]\n Đề\n\\end{ex}').ids.map((c) => c.code).join() === '2D1H1-1', 'ID cùng dòng \\begin{ex}');
  ok(readHead('\\begin{ex}\n  %[2D1H1-1]\n Đề\n\\end{ex}').ids[0]?.code === '2D1H1-1', 'ID ở dòng ngay sau \\begin{ex}');
  ok(readHead('\\begin{ex}\n Đề\n %[2D1H1-1]\n\\end{ex}').ids.length === 0, 'ID nằm sau dòng đề ⇒ không phải ID chính');
  const h = readHead('\\begin{ex}%[Đề thi thử Sở HN 2025]%[ 2D1H1-1 ]\n Đề\n\\end{ex}');
  ok(h.ids.length === 1 && h.ids[0].code === '2D1H1-1' && h.labels[0] === 'Đề thi thử Sở HN 2025', 'nhãn nguồn + ID: nhận ID, nhãn giữ riêng; khoảng trắng trong ngoặc bỏ qua');
  ok(readHead('\uFEFF\\begin{ex}%[2D1H1-1]\r\n Đề\r\n\\end{ex}\r\n').ids[0]?.code === '2D1H1-1', 'BOM + CRLF');
  const stray = '\\begin{ex}\n Đề %[2D1H1-1] chú thích trong đề\n \\loigiai{ %[2D1V1-2]\n }\n \\begin{tikzpicture}%[0H1N1-1]\n\\end{tikzpicture}\n\\end{ex}';
  const hs = readHead(stray);
  ok(hs.ids.length === 0 && hs.stray === 3, '%[…] trong đề, lời giải, TikZ: KHÔNG phải ID chính (chỉ đếm để báo)');
  ok(parseExTest(stray).idComment === null, 'parseExTest không còn lấy %[…] đầu tiên ở bất kỳ đâu');
  ok(readHead('% \\begin{ex}%[2D1H1-1]\n\\begin{ex}\n Đề\n\\end{ex}').ids.length === 0, '\\begin{ex} nằm trong chú thích bị bỏ qua');
  ok(readHead('\\begin{ex}\\%[2D1H1-1] phần trăm\n\\end{ex}').ids.length === 0, '\\% là ký tự phần trăm, không phải chú thích');
  ok(readHead('Chữ thường').beginEnd === -1, 'không phải khối ex');
}

console.log('Kiểm mã theo cây (không đoán)');
{
  ok(R.ok && R.level === 'TH' && locationOfForm(ix, R.loc.formId)?.lessonId === R.loc.lessonId, 'mã đủ ⇒ đúng vị trí + mức độ');
  const lower = resolveCode('2d1h1-1', tax);
  ok(lower.ok && lower.code === '2D1H1-1', 'chữ thường vẫn đọc được, mã chuẩn viết hoa');
  const nf = resolveCode('2D1H1', tax);
  ok(!nf.ok && nf.problem === 'thieu-dang' && nf.level === 'TH', 'thiếu Dạng ⇒ "thieu-dang", KHÔNG tự vào Dạng đầu tiên');
  const gone = resolveCode('2D1H1-Z', tax);
  ok(!gone.ok && gone.problem === 'khong-con', 'đúng cú pháp nhưng Dạng không có trong cây ⇒ "khong-con"');
  for (const bad of ['2D1X1-1', '2D1H1-12', 'abc', '2D1H11', '']) { const r = resolveCode(bad, tax); ok(!r.ok && r.problem === 'sai-cu-phap', `"${bad}" ⇒ sai cấu trúc`); }
  // mã anh em trùng: đặt Dạng thứ hai cùng mã với Dạng thứ nhất
  const ls = tax.grades.flatMap((g) => g.branches.flatMap((b) => b.chapters.flatMap((c) => c.lessons))).find((l) => l.id === R.loc.lessonId)!;
  const dup = setNodeCode(tax, ls.forms[1].id, ls.forms[0].code);
  const amb = resolveCode('2D1H1-1', dup);
  ok(!amb.ok && amb.problem === 'ma-trung', 'hai Dạng anh em trùng mã ⇒ "ma-trung", không đọc mơ hồ');
  const sc = strictCode(loc, 'TH', dup);
  ok(!sc.ok && sc.problem === 'ma-trung', '… và không tạo ID6 mơ hồ');
  ok(codeClashes(dup).some((c) => c.kind === 'form' && c.names.length === 2) && codeClashes(tax).length === 0, 'liệt kê được nhóm mã trùng; cây mặc định không có');
}

console.log('Tạo ID6 chặt');
{
  const s = strictCode(loc, 'VD', tax);
  ok(s.ok && s.code === '2D1V1-1', 'đổi mức độ ⇒ đổi đúng chữ N/H/V/C');
  const wrong = strictCode({ ...loc, formId: loc.lessonId }, 'NB', tax);
  ok(!wrong.ok, 'vị trí thiếu Dạng ⇒ không tạo mã (không lấy mặc định "1")');
  const other = tax.grades.flatMap((g) => g.branches.flatMap((b) => b.chapters.flatMap((c) => c.lessons))).find((l) => l.id !== loc.lessonId && l.forms.length)!;
  ok(!strictCode({ ...loc, lessonId: other.id }, 'NB', tax).ok, 'đường dẫn ghép sai Bài ⇒ không tạo mã');
}

const body = '  Tính giá trị biểu thức $A$. % ghi chú giữ lại\n  \\immini{\\choice{\\True $1$}{$2$}{$3$}{$4$}}{\\begin{tikzpicture}\\def\\a{2}\\draw (0,0)--(\\a,0);\\end{tikzpicture}}\n  \\loigiai{\\newcommand{\\tmp}[1]{#1}\\tmp{x}}\n\\end{ex}';

console.log('Ghi ID — chỉ đổi vùng ID');
{
  const none = `\\begin{ex}\n${body}`;
  const a = writeHeadId(none, '2D1H1-1', 'them');
  ok(a.action === 'them' && a.latex === none.replace('\\begin{ex}', '\\begin{ex}%[2D1H1-1]'), 'chưa có ID ⇒ thêm đúng một ID, mọi ký tự khác giữ nguyên');
  const again = writeHeadId(a.latex, '2D1H1-1', 'thay');
  ok(again.action === 'giu' && again.latex === a.latex, 'gán lại cùng ID lần hai ⇒ giữ nguyên, không sinh ID trùng');
  const same = '\\begin{ex}%[ 2d1h1-1 ]   \r\n' + body.replace(/\n/g, '\r\n');
  ok(writeHeadId(same, '2D1H1-1', 'thay').latex === same, 'ID đã đúng (khác hoa/thường, có khoảng trắng, CRLF) ⇒ giống hệt từng byte');
  const inline = '\\begin{ex}Tính giá trị biểu thức $A$.\n\\end{ex}';
  const b = writeHeadId(inline, '2D1H1-1', 'them');
  ok(b.latex === '\\begin{ex}%[2D1H1-1]\nTính giá trị biểu thức $A$.\n\\end{ex}', 'đề viết cùng dòng \\begin{ex} ⇒ xuống dòng sau ID, đề không bị biến thành chú thích');
  ok(parseExTest(b.latex).stem === parseExTest(inline).stem, '… đọc lại đề y như cũ');
  const crlf = '\\begin{ex}Đề tiếng Việt có dấu: ước số, đạo hàm\r\n\\end{ex}\r\n';
  ok(writeHeadId(crlf, '2D1H1-1', 'them').latex === '\\begin{ex}%[2D1H1-1]\r\nĐề tiếng Việt có dấu: ước số, đạo hàm\r\n\\end{ex}\r\n', 'câu CRLF: thêm xuống dòng kiểu CRLF; Unicode nguyên vẹn');
  const labeled = '\\begin{ex}%[Đề Sở HN]\n Đề\n\\end{ex}';
  ok(writeHeadId(labeled, '2D1H1-1', 'them').latex === '\\begin{ex}%[2D1H1-1]%[Đề Sở HN]\n Đề\n\\end{ex}', 'có nhãn nguồn, chưa có ID ⇒ thêm ID, nhãn giữ nguyên');
  const nextLine = '\\begin{ex}\n%[Đề Sở HN]\n Đề\n\\end{ex}';
  const nl = writeHeadId(nextLine, '2D1H1-1', 'them');
  ok(nl.latex === '\\begin{ex}%[2D1H1-1]\n%[Đề Sở HN]\n Đề\n\\end{ex}' && readHead(nl.latex).ids[0]?.code === '2D1H1-1', 'nhãn ở dòng sau ⇒ ID chèn cùng dòng \\begin{ex}, đọc lại đúng');
  const other = `\\begin{ex}%[Nguồn]%[2D1N1-1]\n${body}`;
  const c1 = writeHeadId(other, '2D1H1-2', 'them');
  ok(c1.action === 'bo-qua' && c1.reason === 'can-xac-nhan' && c1.latex === other, 'ID khác, chưa xác nhận ⇒ không đụng');
  const c2 = writeHeadId(other, '2D1H1-2', 'thay');
  ok(c2.action === 'thay' && c2.old === '2D1N1-1' && c2.latex === other.replace('2D1N1-1', '2D1H1-2'), 'đã xác nhận ⇒ chỉ thay chữ mã, nhãn nguồn và nội dung nguyên vẹn');
  const two = `\\begin{ex}%[2D1H1-1]%[2D1V1-2]\n${body}`;
  const t = writeHeadId(two, '2D1H1-1', 'thay');
  ok(t.action === 'bo-qua' && t.reason === 'nhieu-id' && t.latex === two, 'nhiều ID mâu thuẫn ⇒ không tự xoá/thay');
  ok(writeHeadId('không phải ex', '2D1H1-1', 'thay').action === 'bo-qua', 'không phải khối ex ⇒ không đụng');
  const many = '\\begin{ex}\n a\n\\end{ex}\n\\begin{ex}\n b\n\\end{ex}';
  ok((writeHeadId(many, '2D1H1-1', 'them').latex.match(/%\[/g) ?? []).length === 1, 'chỉ ghi ở \\begin{ex} đầu tiên');
  const tkz = '\\begin{ex}\n BBT:\n \\begin{tikzpicture}\\tkzTabInit{$x$/1,$y$/2}{$-\\infty$,$+\\infty$}\\end{tikzpicture}\n \\begin{tikzpicture}[tdplot_main_coords]\\draw (0,0,0)--(1,0,0);\\end{tikzpicture}\n \\choiceTF{\\True a}{b}{c}{d}\n\\end{ex}';
  const tk = writeHeadId(tkz, '2H3N1-1', 'them');
  ok(tk.latex.slice('\\begin{ex}%[2H3N1-1]'.length) === tkz.slice('\\begin{ex}'.length), 'tkz-tab, tikz-3dplot, \\choiceTF: phần sau ID nguyên vẹn');
  const sa = '\\begin{ex}\n Tính.\n \\shortans{12}\n\\end{ex}';
  ok(parseExTest(writeHeadId(sa, '2D1H1-1', 'them').latex).shortAnswer === '12', '\\shortans đọc lại đúng');
}

console.log('So sánh bỏ vùng ID (giữ kiểm duyệt khi chỉ đổi ID)');
{
  const a = '\\begin{ex}\n  Đề\n\\end{ex}';
  ok(sameExceptId(a, '\\begin{ex}%[2D1H1-1]\n  Đề\n\\end{ex}'), 'thêm ID ⇒ cùng nội dung');
  ok(sameExceptId('\\begin{ex}%[2D1N1-1]\n  Đề\n\\end{ex}', '\\begin{ex}%[2D1V1-3]\n  Đề\n\\end{ex}'), 'đổi ID ⇒ cùng nội dung');
  ok(sameExceptId('\\begin{ex}Đề\n\\end{ex}', '\\begin{ex}%[2D1H1-1]\nĐề\n\\end{ex}'), 'thêm ID kèm xuống dòng ⇒ cùng nội dung');
  ok(withoutHeadId('\\begin{ex}%[Nguồn]%[2D1H1-1]\n Đề\n\\end{ex}') === '\\begin{ex}%[Nguồn]\n Đề\n\\end{ex}', 'nhãn nguồn giữ lại khi so');
  ok(!sameExceptId(a, '\\begin{ex}%[2D1H1-1]\n  Đề khác\n\\end{ex}'), 'đổi đề ⇒ khác nội dung');
  ok(!sameExceptId(a, '\\begin{ex}%[ghi chú mới]\n  Đề\n\\end{ex}'), 'thêm nhãn (không phải ID) ⇒ tính là sửa');
}

console.log('Thêm ID không làm đổi kết quả dò trùng');
{
  const keys = (l: string) => { const f = fingerprint(l); return JSON.stringify([f.type, f.complete, f.stemKey, f.optSet, f.optItemsSet, f.ansKey, f.figKey, f.solKey, f.contentKey, f.factsKey, f.nums, f.ops, f.keys, [...f.words], [...f.mathGrams]]); };
  const q = `\\begin{ex}\n${body}`;
  const w = writeHeadId(q, '2D1H1-1', 'them').latex;
  ok(keys(q) === keys(w), 'dấu vân dò trùng (dup2): mọi khoá nội dung như nhau');
  ok(comparePair(fingerprint(q), fingerprint(w)).kind === 'same', 'so cặp: "cùng đề" như trước');
  ok(normalizeForDup(q) === normalizeForDup(w), 'chuẩn hoá của bộ dò trùng nhanh như nhau');
  const inline = '\\begin{ex}Tính $x+1$.\n\\choice{\\True 1}{2}{3}{4}\n\\end{ex}';
  ok(keys(inline) === keys(writeHeadId(inline, '2D1H1-1', 'them').latex), '… kể cả khi phải xuống dòng sau ID');
  ok(idlessVariants(writeHeadId(inline, '2D1H1-1', 'them').latex).includes(inline) && idlessVariants(w).includes(q), 'bỏ được ID để đối chiếu quyết định trùng đã lưu');
}

console.log('Trạng thái đồng bộ LaTeX ↔ vị trí');
{
  const at = (latex: string, lv: 'NB' | 'TH' = 'TH') => idStatus({ latex, level: lv, ...loc }, tax).state;
  ok(at('\\begin{ex}%[2D1H1-1]\n Đề\n\\end{ex}') === 'khop', 'ID khớp vị trí + mức độ');
  ok(at('\\begin{ex}%[2D1H1-1]\n Đề\n\\end{ex}', 'NB') === 'lech', 'chỉ đổi mức độ ⇒ lệch (chữ N/H/V/C khác)');
  ok(at('\\begin{ex}\n Đề\n\\end{ex}') === 'chua-co-id', 'dữ liệu cũ chưa có ID');
  ok(at('\\begin{ex}%[2D1H1]\n Đề\n\\end{ex}') === 'id-loi' && at('\\begin{ex}%[2D1H1-1]%[2D1H1-2]\n Đề\n\\end{ex}') === 'id-loi', 'ID thiếu Dạng / nhiều ID ⇒ cần xử lý');
  ok(idStatus({ latex: '\\begin{ex}\n Đề\n\\end{ex}', level: 'TH', ...loc, formId: 'khong-co' }, tax).state === 'vi-tri-loi', 'vị trí sai ⇒ không ra mã');
  ok(readLatexId('\\begin{ex}%[2D1H1-1]%[2D1H1-1]\n Đề\n\\end{ex}', tax).state === 'nhieu-id', 'ID lặp hai lần ⇒ báo, không tự xoá');
  const p = placeWithId('\\begin{ex}%[2D1H1-1]\n Đề\n\\end{ex}', loc, 'VD', tax, true);
  ok('latex' in p && p.code === '2D1V1-1' && p.latex.includes('%[2D1V1-1]'), 'đổi mức độ có xác nhận ⇒ ID trong LaTeX đổi theo');
  ok('problem' in placeWithId('\\begin{ex}%[2D1H1-1]\n Đề\n\\end{ex}', loc, 'VD', tax, false), 'chưa xác nhận thay ⇒ không ghi nửa vời');
  const moved = setNodeCode(tax, R.loc.formId, 'Z');
  ok(affectedByTaxChange([{ latex: '', level: 'TH', ...loc }, { latex: '', level: 'TH', ...loc, formId: 'x' }], tax, moved) === 1, 'đổi mã Dạng ⇒ đếm đúng câu bị đổi ID');
}

console.log('Lưu, đóng/mở app, nhập → xuất → nhập lại');
{
  const disk = { json: null as string | null };
  const boot = () => initStore({ async load() { return { json: disk.json, recovered: false }; }, async save(j: string) { disk.json = j; } });
  await boot();
  // câu đã duyệt, chưa có ID trong LaTeX (dữ liệu cũ) ⇒ HEdu thêm ID khi lưu ⇒ vẫn "Đã duyệt"
  const raw = '\\begin{ex}\n  Tính $1+1$.\n  \\choice{\\True 2}{3}{4}{5}\n\\end{ex}';
  const [q0] = addMany([{ latex: raw, level: 'TH', tags: [], ...loc }]);
  await setReview(q0.uid, 'approved');
  const st0 = idStatus(getState().questions.find((x) => x.uid === q0.uid)!, tax);
  ok(st0.state === 'chua-co-id' && st0.meta.ok, 'dữ liệu cũ: nhận ra "LaTeX chưa có ID"');
  const withId = writeHeadId(raw, (st0.meta as { code: string }).code, 'them').latex;
  const q1 = saveQuestion({ latex: withId, level: 'TH', tags: [], ...loc }, q0.uid);
  ok(q1.review === 'approved', 'chỉ thêm ID ⇒ giữ "Đã duyệt"');
  const q2 = saveQuestion({ latex: writeHeadId(withId, '2D1V1-1', 'thay').latex, level: 'VD', tags: [], ...loc }, q0.uid);
  ok(q2.review === 'approved', 'đổi mức độ + ID theo ⇒ vẫn giữ "Đã duyệt"');
  const q3 = saveQuestion({ latex: q2.latex.replace('1+1', '1+2'), level: 'VD', tags: [], ...loc }, q0.uid);
  ok(q3.review === undefined, 'sửa nội dung Toán thật ⇒ về "Chưa kiểm tra" như cũ');
  await flushSave();
  await boot();
  const back = getState().questions.find((x) => x.uid === q0.uid)!;
  ok(back.latex === q3.latex && idStatus(back, tax).state === 'khop', 'đóng/mở lại app: LaTeX còn đúng ID, khớp vị trí');
  const file = verbatimTex([back]);
  const again = buildRows([{ name: 'xuat.tex', rel: '', text: file }]);
  ok(again.length === 1 && !!again[0].fromId && strictCode(again[0].fromId.loc, again[0].fromId.level, tax).ok && (strictCode(again[0].fromId.loc, again[0].fromId.level, tax) as { code: string }).code === '2D1V1-1', 'xuất .tex rồi nhập lại ⇒ cùng ID6, cùng vị trí');
  const legacy = { ...back, latex: raw };
  ok(readHead(verbatimTex([legacy])).ids[0]?.code === (strictCode(legacy, legacy.level, tax) as { code: string }).code && legacy.latex === raw, 'xuất câu cũ chưa có ID ⇒ bản xuất có ID theo vị trí, ngân hàng không đổi');
}

console.log('Đồng bộ ID cho dữ liệu cũ + Hoàn tác');
{
  const disk = { json: null as string | null, fail: false };
  await initStore({ async load() { return { json: disk.json, recovered: false }; }, async save(j: string) { if (disk.fail) throw new Error('đĩa đầy'); disk.json = j; } });
  const mk = (s: string, extra = '') => `\\begin{ex}${extra}\n  ${s}\n  \\choice{\\True 1}{2}{3}{4}\n\\end{ex}`;
  const added = addMany([
    { latex: mk('Câu cũ A.'), level: 'NB', tags: [], ...loc },
    { latex: mk('Câu khớp.', '%[2D1H1-1]'), level: 'TH', tags: [], ...loc },
    { latex: mk('Câu lệch.', '%[2D1V1-1]'), level: 'TH', tags: [], ...loc },
    { latex: mk('Câu lỗi.', '%[2D1H1]'), level: 'TH', tags: [], ...loc },
  ]);
  await flushSave();
  const uids = added.map((q) => q.uid);
  const n = syncCounts(added, tax);
  ok(n['chua-co-id'] === 1 && n.khop === 1 && n.lech === 1 && n['id-loi'] === 1, 'đếm đúng: 1 cần thêm, 1 khớp, 1 lệch, 1 lỗi');
  const snapshot = JSON.stringify(getState().questions);
  disk.fail = true;
  const bad = await applyIdSync(uids, tax);
  disk.fail = false;
  ok(!bad.ok && JSON.stringify(getState().questions) === snapshot, 'ghi lỗi ⇒ dữ liệu cũ nguyên vẹn');
  const r = await applyIdSync(uids, tax);
  const now = new Map(getState().questions.map((q) => [q.uid, q]));
  ok(r.ok && r.changed === 1 && now.get(uids[0])!.latex === mk('Câu cũ A.', '%[2D1N1-1]'), 'chỉ THÊM ID cho câu chưa có, đúng mức độ N');
  ok(uids.slice(1).every((u, i) => now.get(u)!.latex === added[i + 1].latex), 'câu khớp / lệch / lỗi: không đụng một ký tự');
  ok((await applyIdSync(uids, tax)).changed === 0, 'chạy lại lần hai ⇒ không đổi gì, không sinh ID trùng');
  const u = getAutoIdUndo()!;
  const uz = await undoAutoId(u);
  ok(uz.ok && uz.restored === 1 && getState().questions.find((q) => q.uid === uids[0])!.latex === added[0].latex, 'Hoàn tác ⇒ LaTeX về đúng như cũ');

  console.log('Đổi mã trong cây: ID trong LaTeX đổi theo trong cùng một lần cập nhật');
  await applyIdSync(uids, tax);
  const moved = setNodeCode(getTaxonomy(), loc.formId, 'Z');
  ok(affectedByTaxChange(getState().questions.filter((q) => uids.includes(q.uid)), getTaxonomy(), moved) === 4, 'báo trước: 4 câu bị đổi ID6');
  const k = applyTaxonomyKeepIds(moved);
  const after = new Map(getState().questions.map((q) => [q.uid, q]));
  ok(k === 2 && readHead(after.get(uids[0])!.latex).ids[0].code === '2D1N1-Z' && readHead(after.get(uids[1])!.latex).ids[0].code === '2D1H1-Z', 'câu đang khớp ⇒ ID trong LaTeX đổi theo mã mới');
  ok(after.get(uids[2])!.latex === added[2].latex && after.get(uids[3])!.latex === added[3].latex, 'câu đang lệch / lỗi ⇒ giữ nguyên LaTeX (vẫn báo cần xử lý)');
  ok(idStatus(after.get(uids[1])!, getTaxonomy()).state === 'khop', 'sau khi đổi: vẫn khớp theo cây mới');
  applyTaxonomyKeepIds(tax);
}

if (fail) process.exit(1);
console.log('idtex: đạt hết.');
