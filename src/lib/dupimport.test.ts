import { analyzeDrafts, bankHitSignature, defaultDecisions, summarize, type DraftIn } from './dupimport';
import { DupIndex, type QLike } from './dupindex';

let failed = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) failed++; };
const E = (stem: string, opts = '\\choice{\\True $1$}{$2$}{$3$}{$4$}') => `\\begin{ex}\n${stem}\n${opts}\n\\end{ex}`;
const S1 = 'Cho hàm số $y=x^3-3x+2$. Tìm tọa độ điểm cực đại của đồ thị hàm số đã cho trên tập số thực.';
const S2 = 'Có bao nhiêu cách chọn $3$ bạn từ một nhóm $10$ bạn để làm trực nhật tuần này?';
const S3 = 'Tính tích phân $\\int_0^1 (2x+1)\\,dx$ bằng cách dùng nguyên hàm của hàm số bậc nhất.';
const idx = () => new DupIndex();
const D = (...l: string[]): DraftIn[] => l.map((latex, i) => ({ id: 'd' + i, latex }));
const bank = (...l: string[]): QLike[] => l.map((latex, i) => ({ uid: 'b' + i, latex }));

(async () => {
  console.log('Rà soát nhập: câu mới ↔ kho');
  {
    const bk = bank(E(S1), E(S2), E(S3));
    const dr = D(E(S1.replace('Tìm', 'Tìm   ')), E('Giải phương trình $x^2=4$ trên tập số thực và cho biết số nghiệm.'));
    const r = await analyzeDrafts(dr, bk, { index: idx() });
    ok(r.complete && r.rows[0]!.worst === 'same' && r.rows[0]!.hits[0].with === 'bank' && r.rows[0]!.hits[0].other === 'b0', 'câu trùng kho được báo là "cùng câu" kèm uid câu trong kho');
    ok(r.rows[1]!.worst === null, 'câu mới hoàn toàn: không có nghi vấn');
    const dec = defaultDecisions(dr, r.rows);
    ok(dec.d0 === 'skip' && dec.d1 === 'import', 'mặc định: trùng chắc ⇒ bỏ qua (hiện rõ lý do), câu mới ⇒ nhập');
  }
  console.log('Rà soát nhập: nhiều ứng viên không bị bỏ sót vì chỉ lấy [0]');
  {
    const bk = bank(E(S1), E(S1, '\\choice{$1$}{\\True $2$}{$3$}{$4$}'), E(S1, '\\choice{$1$}{$2$}{\\True $3$}{$4$}'), E(S2));
    const r = await analyzeDrafts(D(E(S1)), bk, { index: idx() });
    ok(r.rows[0]!.hits.filter((h) => h.with === 'bank').length === 3, 'một câu mới giống 3 câu trong kho ⇒ cả 3 được liệt kê');
    ok(r.rows[0]!.hits[0].kind === 'conflict' && r.rows[0]!.hits.some((h) => h.kind === 'raw' || h.kind === 'same'), 'thứ tự nghiêm trọng: mâu thuẫn đáp án lên đầu, sau đó giống chắc');
    ok(r.rows[0]!.hits.some((h) => h.kind === 'conflict'), 'bản khác đáp án đúng được báo mâu thuẫn');
  }
  console.log('Rà soát nhập: câu mới ↔ câu mới trong cùng lô');
  {
    const dr = D(E(S3), E(S3), E(S3), E(S3), E(S3), E(S2));
    const r = await analyzeDrafts(dr, [], { index: idx() });
    const dec = defaultDecisions(dr, r.rows);
    ok(r.complete && r.rows.slice(0, 5).every((a) => a!.hits.length === 4 && a!.hits.every((h) => h.with === 'batch')), 'cùng câu xuất hiện 5 lần trong file, kho trống: mỗi câu thấy 4 bản kia');
    ok(dec.d0 === 'import' && dec.d1 === 'skip' && dec.d2 === 'skip' && dec.d3 === 'skip' && dec.d4 === 'skip' && dec.d5 === 'import', 'mặc định: giữ bản đầu, bỏ các bản sau; không nhập cả 5 âm thầm');
    const s = summarize(dr, r.rows, dec);
    ok(s.importN === 2 && s.skipN === 4 && s.holdN === 0 && s.keptPairs === 0, 'tóm tắt đúng: nhập 2, bỏ 4');
    const both = { ...dec, d1: 'import' as const };
    ok(summarize(dr, r.rows, both).keptPairs === 1, 'giáo viên chủ động giữ cả hai bản trùng: được đếm và nêu trong xác nhận');
  }
  console.log('Mâu thuẫn, gần trùng, cùng mẫu');
  {
    const bk = bank(E(S1));
    const dr = D(E(S1, '\\choice{$1$}{\\True $2$}{$3$}{$4$}'), E(S1.replace('Tìm', 'Hãy tìm')), E(S1.replace('$y=x^3-3x+2$', '$y=x^3-3x+5$')));
    const r = await analyzeDrafts(dr, bk, { index: idx() });
    const dec = defaultDecisions(dr, r.rows);
    ok(r.rows[0]!.worst === 'conflict' && dec.d0 === 'hold', 'mâu thuẫn đáp án ⇒ chưa quyết định (bắt buộc chọn)');
    ok(r.rows[1]!.worst === 'near' && dec.d1 === 'hold', 'gần trùng ⇒ chưa quyết định');
    ok(r.rows[2]!.worst === 'template' && dec.d2 === 'import', 'cùng mẫu khác dữ kiện ⇒ nhập được, không chặn lô');
    ok(summarize(dr, r.rows, dec).holdN === 2, 'còn 2 câu chờ quyết định (nút Nhập phải bị khoá)');
  }
  console.log('Trung thực khi chưa kiểm tra xong');
  {
    const sig = { aborted: false }; let n = 0;
    const many = D(...Array.from({ length: 100 }, (_, i) => E(`Câu số ${i} về giới hạn của dãy số $u_n=${i}n+1$ khi n tiến ra vô cực.`)));
    const r = await analyzeDrafts(many, [], { index: idx(), batch: 10, signal: sig, onProgress: () => { if (++n === 3) sig.aborted = true; } });
    ok(!r.complete && r.rows.some((x) => x === undefined), 'bị dừng: complete=false và dòng chưa xử lý là "chưa biết", không phải "không trùng"');
    ok(defaultDecisions(many, r.rows)[many[99].id] === 'hold', 'dòng chưa phân tích ⇒ mặc định chưa quyết định (không tự nhập)');
  }
  console.log('Kho đổi giữa lúc rà soát và lúc nhập');
  {
    const dr = D(E(S3));
    const r1 = await analyzeDrafts(dr, bank(E(S1)), { index: idx() });
    const r2 = await analyzeDrafts(dr, [...bank(E(S1)), { uid: 'late', latex: E(S3) }], { index: idx() });
    ok(bankHitSignature(r1.rows) !== bankHitSignature(r2.rows), 'có câu trùng mới xuất hiện trong kho ⇒ dấu hiệu đổi (phải rà soát lại)');
    ok(bankHitSignature(r1.rows) === bankHitSignature((await analyzeDrafts(dr, bank(E(S1)), { index: idx() })).rows), 'kho không đổi ⇒ dấu hiệu giữ nguyên');
  }
  console.log('Sửa câu mới trong lúc rà soát; câu chưa đọc đủ');
  {
    const bk = bank(E(S1));
    const before = await analyzeDrafts(D(E(S1)), bk, { index: idx() });
    const after = await analyzeDrafts(D(E(S1.replace('cực đại', 'cực tiểu'))), bk, { index: idx() });
    ok(before.rows[0]!.worst === 'raw' && after.rows[0]!.worst !== 'raw' && after.rows[0]!.worst !== 'same', 'sửa câu mới ⇒ phân tích lại cho kết quả mới');
    const bad = await analyzeDrafts(D('\\begin{ex}\nCho $x>1. Tìm x.\\shortans{2}\n\\end{ex}'), [], { index: idx() });
    ok(bad.rows[0]!.unreadable, 'câu mã chưa đọc đủ được đánh dấu để hiện "Cần kiểm tra mã"');
  }
  console.log('Hiệu năng nhập lô lớn (dữ liệu giả lập)');
  {
    const N = 3000, M = 300;
    const mk = (i: number) => E(`Tính giá trị của biểu thức $A=${i % 97}x^{${i % 7 + 2}}+${i % 89}x+${i}$ tại điểm $x=${i % 13}$ trong bài tập số ${i}.`);
    const bk: QLike[] = Array.from({ length: N }, (_, i) => ({ uid: 'k' + i, latex: mk(i) }));
    const dr: DraftIn[] = Array.from({ length: M }, (_, i) => ({ id: 'n' + i, latex: i % 3 === 0 ? mk(i * 7) : mk(N + i) }));
    const t = Date.now();
    const r = await analyzeDrafts(dr, bk, { index: idx() });
    const ms = Date.now() - t;
    const hit = r.rows.filter((a, i) => i % 3 === 0 && a!.hits.some((h) => h.with === 'bank' && (h.kind === 'raw' || h.kind === 'same'))).length;
    console.log(`  ℹ ${M} câu mới × kho ${N}: ${ms} ms`);
    ok(hit === M / 3, `đủ ${M / 3}/${M / 3} câu cài sẵn trùng kho được tìm thấy`);
    ok(ms < 20000, 'dưới 20 giây');
  }
  if (failed) { console.log(`\n${failed} kiểm thử dupimport lỗi`); process.exit(1); }
  console.log('dupimport: đạt hết.');
})();
