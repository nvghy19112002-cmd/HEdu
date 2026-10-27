// JSON trao đổi (cấu trúc cũ) + id-review.json: kiểm chéo Rust ↔ TypeScript trên CÙNG bộ dữ liệu tổng hợp.
// Bộ dữ liệu (scripts/fixtures/json-trao-doi) do mã TypeScript sinh (dấu nội dung thật); phía Rust kiểm "nhập rồi xuất giống từng byte"
// (jsonmig::tests::json_trao_doi_tong_hop_nhap_roi_xuat_giong_tung_byte). Ở đây đọc đúng các tệp đó và kiểm hiệu lực từng bản ghi.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { _resetReview, effectiveOf, getRec, loadIdReview, parseReview, restoreIdReview, type Backend } from './idreview';
import { evidenceQuestions } from './idverify';
import { buildDefault, indexOf } from './taxonomy';
import { taxRevision } from './taxpath';
import type { Question } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const dir = join(process.cwd(), 'scripts', 'fixtures', 'json-trao-doi');
const heduText = readFileSync(join(dir, 'hedu.json'), 'utf8');
const idrText = readFileSync(join(dir, 'id-review.json'), 'utf8');
const hedu = JSON.parse(heduText) as { schema: number; questions: Question[]; nextSeq: number };
const tax = buildDefault();
const ctx = { ix: indexOf(tax), taxRev: taxRevision(tax) };
const byUid = new Map(hedu.questions.map((q) => [q.uid, q]));

console.log('Đọc bộ dữ liệu trao đổi');
ok(hedu.schema === 3 && hedu.questions.length === 8 && new Set(hedu.questions.map((q) => q.uid)).size === 8, 'hedu.json: schema 3, 8 câu, UID không lặp');
const recs = parseReview(idrText);
ok(recs.size === 7, 'id-review.json: đọc đủ 7 bản ghi (gồm 1 bản ghi mồ côi)');
const eff = (uid: string) => effectiveOf(byUid.get(uid)!, recs.get(uid), ctx);

console.log('Hiệu lực từng bản ghi sau khi nhập (theo nội dung, Dạng, cây hiện tại)');
ok(eff('fx0001').form === 'gv', 'bản ghi hợp lệ của giáo viên ⇒ còn hiệu lực');
ok(eff('fx0002').form === 'chua', '"máy phân loại" lập theo phiên bản cây khác ⇒ hết hiệu lực');
ok(eff('fx0003').form === 'chua', 'nội dung câu đã đổi sau khi xác minh ⇒ hết hiệu lực');
ok(eff('fx0004').form === 'chua', 'bản ghi lập cho Dạng khác với Dạng đang lưu của câu ⇒ hết hiệu lực');
ok(eff('fx0005').form === 'xem-lai' && recs.get('fx0005')!.orig === '2D1N1-1' && recs.get('fx0005')!.prop === 'f2D113' && recs.get('fx0005')!.hist?.length === 1, 'cần xem lại: giữ ID nguyên bản, Dạng máy đề xuất và lịch sử');
ok(eff('fx0006').unclassified && eff('fx0006').form === 'chua', 'chưa phân loại: giữ cờ');
ok(eff('fx0007').form === 'chua' && !recs.has('fx0007') && eff('fx0008').form === 'chua' && !recs.has('fx0008'), 'câu không có bản ghi ⇒ chưa xác minh (không bịa bản ghi)');
ok(evidenceQuestions(hedu.questions, (q) => effectiveOf(q, recs.get(q.uid), ctx)).map((q) => q.uid).join() === 'fx0001', 'chỉ MỘT câu làm căn cứ kiểm chứng (fx0001): máy, cần xem lại, chưa phân loại, hết hiệu lực đều không phải');

console.log('Khôi phục vào ngân hàng: mồ côi, mới/cũ');
{
  const disk = { json: null as string | null };
  const be: Backend = { async load() { return disk.json; }, async save(j) { disk.json = j; } };
  _resetReview(be); await loadIdReview();
  const known = new Set(hedu.questions.map((q) => q.uid));
  const r = await restoreIdReview(JSON.parse(idrText), known);
  ok(r.added === 6 && r.orphans === 1 && r.saved && getRec('fx-mo-coi') === undefined, 'khôi phục: 6 bản ghi vào, bản ghi mồ côi bị bỏ, đã ghi bền vững');
  const saved = parseReview(disk.json);
  ok(saved.size === 6 && !saved.has('fx-mo-coi'), 'tệp phụ sau khôi phục không chứa xác minh mồ côi');
  // khôi phục lần hai (cùng file): không đổi gì
  const r2 = await restoreIdReview(JSON.parse(idrText), known);
  ok(r2.added === 0 && r2.orphans === 1, 'khôi phục lại cùng file: không thêm gì, không đổi bản ghi');
  _resetReview(null);
}

console.log('Tệp hỏng hoặc không đúng cấu trúc');
{
  let threw = false;
  try { parseReview('{khong phai json'); } catch { threw = true; }
  ok(threw, 'JSON hỏng ⇒ báo lỗi (không đọc ra bản ghi nào)');
  threw = false;
  try { parseReview('{"v":1,"recs":5}'); } catch { threw = true; }
  ok(threw, 'cấu trúc sai ⇒ báo lỗi');
  const damaged = JSON.stringify({ v: 1, recs: { fx0001: { form: 'gv' }, fx0002: 'x', fx0003: null } });
  ok(parseReview(damaged).size === 0, 'bản ghi thiếu trường/hỏng ⇒ bị bỏ, không thành xác minh');
  const none = await restoreIdReview(undefined);
  ok(none.added === 0, 'không có id-review.json (JSON cũ) ⇒ không làm gì, mọi câu là chưa xác minh');
}

if (fail) process.exit(1);
console.log('idexchange: đạt hết.');
