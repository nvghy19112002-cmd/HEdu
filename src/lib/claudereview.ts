// Duyệt nội dung nhờ Claude (Claude Code trong cuộc trò chuyện), cùng khuôn "Gán ID nhờ Claude" (claudeid.ts):
// HEdu xuất "lô cần duyệt" (hedu-duyet-<lô>.json) vào thư mục trao đổi → Claude đọc TỪNG câu, kiểm đề, đáp án đánh dấu, lời giải
// → ghi "ket-qua-<lô>.json" cùng thư mục → HEdu nhập kết quả: "đạt" ⇒ Đã duyệt, "cần sửa" ⇒ Cần sửa + nhãn lý do. Có Hoàn tác.
// An toàn: chỉ đổi câu CHƯA KIỂM TRA (không đè quyết định của giáo viên); câu đã bị sửa sau khi xuất (khác dấu vân tay) bị bỏ qua.
import { contentKeys } from './idreview';
import { LEVEL_LABEL, TYPE_LABEL, type Question, type ReviewStatus } from './types';

export const REVIEW_LOT_FORMAT = 'hedu-duyet';
export const REVIEW_RESULT_FORMAT = 'hedu-duyet-ket-qua';
export const REVIEW_PREFIX = 'R';

/** Loại lỗi Claude được phép báo (mỗi loại thành một nhãn ngắn trên câu). */
export const LOI = {
  'dap-an': 'đáp án',
  'loi-giai': 'lời giải',
  'thieu-loi-giai': 'thiếu lời giải',
  de: 'đề bài',
  'chinh-ta': 'chính tả/LaTeX',
  'muc-do': 'mức độ',
  khac: 'khác',
} as const;
export type LoiKey = keyof typeof LOI;
const LOI_KEYS = Object.keys(LOI) as LoiKey[];

export interface ReviewLotItem { k: string; fp: string; loai: string; muc: string; vitri: string; latex: string }
export interface ReviewLotFile { format: typeof REVIEW_LOT_FORMAT; v: 1; lo: string; taoLuc: string; huongDan: string[]; cau: ReviewLotItem[] }
export interface ReviewResultItem { k: string; fp: string; kq: 'dat' | 'can-sua'; loi: LoiKey[]; ghiChu: string; dapAnDung?: string }
export interface ReviewResultFile { format: typeof REVIEW_RESULT_FORMAT; v: 1; lo: string; boi?: string; cau: ReviewResultItem[] }

export const reviewLotFileName = (lo: string) => `hedu-duyet-${lo}.json`;
export const reviewResultFileName = (lo: string) => `ket-qua-${lo}.json`;
/** Nhãn dấu vết gắn vào mọi câu áp dụng từ một lô (lọc nhãn này để xem lại cả lô). */
export const lotTag = (lo: string) => `Duyệt nhờ Claude ${lo}`;
export const loiTag = (k: LoiKey) => `Cần sửa: ${LOI[k]}`;

export const HUONG_DAN_DUYET = [
  'Bạn là giáo viên Toán THPT (Chương trình GDPT 2018) duyệt câu hỏi cho ngân hàng đề. Mỗi câu trong "cau" là mã LaTeX gói ex_test: \\choice (trắc nghiệm, đáp án đúng đánh dấu \\True), \\choiceTF (đúng/sai 4 ý, ý đúng đánh dấu \\True), \\shortans{…} (trả lời ngắn), \\loigiai{…} (lời giải).',
  'Với TỪNG câu, TỰ GIẢI lại rồi kiểm: (1) đề rõ ràng, đủ dữ kiện, không mâu thuẫn; (2) đáp án đánh dấu đúng (trắc nghiệm đúng MỘT phương án \\True; đúng/sai từng ý đúng; trả lời ngắn đúng giá trị); (3) lời giải đúng, đủ bước chính, khớp với đáp án; (4) không có lỗi chính tả hay lỗi LaTeX làm sai nghĩa.',
  '"kq":"dat" khi cả 4 điều đều ổn. Lỗi trình bày rất nhỏ không làm sai nghĩa vẫn "dat" và ghi vào "ghiChu".',
  '"kq":"can-sua" khi có ít nhất một lỗi; "loi" là danh sách mã lỗi trong: dap-an, loi-giai, thieu-loi-giai, de, chinh-ta, muc-do, khac. "ghiChu" nói CỤ THỂ sai ở đâu và sửa thế nào (một–hai câu). Đáp án đánh dấu sai thì ghi đáp án đúng vào "dapAnDung" (vd "B", "a) Đ b) S c) S d) Đ", "-3").',
  'Không chắc (đề mơ hồ, thiếu hình, không giải được chắc chắn) thì chọn "can-sua", "loi":["khac"] và nói rõ lý do — KHÔNG đoán "dat".',
  'Trả về MỘT tệp JSON: {"format":"hedu-duyet-ket-qua","v":1,"lo":<giống "lo">,"boi":"Claude","cau":[{"k":<k>,"fp":<fp>,"kq":"dat|can-sua","loi":[…],"ghiChu":"…","dapAnDung":"…"}]}. Chép NGUYÊN "k" và "fp"; đủ một dòng cho mỗi câu.',
  'Ghi tệp tên "ket-qua-<lo>.json" (thay <lo> bằng giá trị "lo") vào CÙNG thư mục với tệp lô này.',
];

/** Lô cần duyệt: mặc định chỉ câu Chưa kiểm tra; `includeReviewed` gồm cả câu Cần sửa/Đã duyệt (để soát lại). */
export function buildReviewLot(pool: readonly Question[], o: { lo: string; size: number; includeReviewed?: boolean; whereOf?: (q: Question) => string; now?: Date }): { lot: ReviewLotFile; total: number } {
  const cand = pool.filter((q) => o.includeReviewed || !q.review);
  const pick = cand.slice(0, Math.max(1, o.size));
  const lot: ReviewLotFile = {
    format: REVIEW_LOT_FORMAT, v: 1, lo: o.lo, taoLuc: (o.now ?? new Date()).toISOString(), huongDan: HUONG_DAN_DUYET,
    cau: pick.map((q) => ({ k: q.uid, fp: contentKeys(q.latex).i, loai: TYPE_LABEL[q.type], muc: LEVEL_LABEL[q.level], vitri: o.whereOf?.(q) ?? '', latex: q.latex.trim() })),
  };
  return { lot, total: cand.length };
}

/** Đọc tệp kết quả; dòng sai định dạng bị bỏ (đếm trong `dropped`), không đoán. */
export function parseReviewResult(text: string): { ok: true; r: ReviewResultFile; dropped: number } | { ok: false; why: string } {
  let j: unknown;
  try { j = JSON.parse(text.replace(/^﻿/, '')); } catch { return { ok: false, why: 'Tệp không phải JSON hợp lệ.' }; }
  const o = j as Record<string, unknown>;
  if (!o || typeof o !== 'object' || o.format !== REVIEW_RESULT_FORMAT) return { ok: false, why: `Không phải tệp kết quả duyệt của HEdu (cần "format": "${REVIEW_RESULT_FORMAT}").` };
  if (!Array.isArray(o.cau)) return { ok: false, why: 'Thiếu danh sách "cau".' };
  let dropped = 0;
  const cau: ReviewResultItem[] = [];
  const seen = new Set<string>();
  for (const x of o.cau as unknown[]) {
    const it = x as Record<string, unknown>;
    const kq = it?.kq;
    if (!it || typeof it.k !== 'string' || typeof it.fp !== 'string' || (kq !== 'dat' && kq !== 'can-sua') || seen.has(it.k)) { dropped++; continue; }
    seen.add(it.k);
    const loi = (Array.isArray(it.loi) ? it.loi : []).filter((l): l is LoiKey => LOI_KEYS.includes(l as LoiKey));
    cau.push({ k: it.k, fp: it.fp, kq, loi: kq === 'can-sua' && !loi.length ? ['khac'] : loi, ghiChu: typeof it.ghiChu === 'string' ? it.ghiChu.slice(0, 600) : '', ...(typeof it.dapAnDung === 'string' && it.dapAnDung.trim() ? { dapAnDung: it.dapAnDung.trim().slice(0, 120) } : {}) });
  }
  return { ok: true, r: { format: REVIEW_RESULT_FORMAT, v: 1, lo: typeof o.lo === 'string' ? o.lo : '', boi: typeof o.boi === 'string' ? o.boi : undefined, cau }, dropped };
}

export type SkipWhy = 'khong-thay' | 'da-sua' | 'gv-da-danh-dau';
export const SKIP_WHY_LABEL: Record<SkipWhy, string> = {
  'khong-thay': 'không còn trong ngân hàng',
  'da-sua': 'câu đã bị sửa sau khi xuất lô',
  'gv-da-danh-dau': 'thầy/cô đã kiểm tra câu này (giữ nguyên quyết định)',
};
export interface ReviewChange { uid: string; to: ReviewStatus; addTags: string[]; item: ReviewResultItem }
export interface ReviewPlan { changes: ReviewChange[]; dat: number; canSua: number; skipped: { item: ReviewResultItem; why: SkipWhy }[]; /** câu thầy/cô đã duyệt mà Claude nghi có lỗi — chỉ báo, không đổi */ doubt: ReviewResultItem[] }

/** Kế hoạch áp dụng: chỉ đổi câu Chưa kiểm tra còn đúng nội dung lúc xuất. */
export function planReview(r: ReviewResultFile, bank: readonly Question[]): ReviewPlan {
  const by = new Map(bank.map((q) => [q.uid, q] as const));
  const plan: ReviewPlan = { changes: [], dat: 0, canSua: 0, skipped: [], doubt: [] };
  const lt = r.lo ? [lotTag(r.lo)] : [];
  for (const it of r.cau) {
    const q = by.get(it.k);
    if (!q) { plan.skipped.push({ item: it, why: 'khong-thay' }); continue; }
    if (contentKeys(q.latex).i !== it.fp) { plan.skipped.push({ item: it, why: 'da-sua' }); continue; }
    if (q.review) {
      if (q.review === 'approved' && it.kq === 'can-sua') plan.doubt.push(it);
      else plan.skipped.push({ item: it, why: 'gv-da-danh-dau' });
      continue;
    }
    if (it.kq === 'dat') { plan.dat++; plan.changes.push({ uid: q.uid, to: 'approved', addTags: lt, item: it }); }
    else { plan.canSua++; plan.changes.push({ uid: q.uid, to: 'needs_fix', addTags: [...lt, ...it.loi.map(loiTag)], item: it }); }
  }
  return plan;
}

/** Một câu sau khi áp dụng (thuần): đặt trạng thái kiểm duyệt + thêm nhãn, không đổi nội dung/updatedAt. */
export function applyChange(q: Question, c: ReviewChange): Question {
  const tags = [...q.tags];
  for (const t of c.addTags) if (!tags.includes(t)) tags.push(t);
  return { ...q, review: c.to, tags };
}
/** Hoàn tác một câu: chỉ khi câu còn đúng như lúc áp dụng (không ai sửa tiếp). */
export function undoChange(q: Question, before: Question, after: Question): Question | null {
  if (q.review !== after.review || q.latex !== after.latex || q.tags.join('\u0001') !== after.tags.join('\u0001')) return null;
  const out: Question = { ...q, tags: before.tags };
  if (before.review) out.review = before.review; else delete out.review;
  return out;
}

export interface XFile { name: string; bytes: number; mtimeMs: number }
export type ReviewLotState = 'cho-claude' | 'co-ket-qua' | 'da-nhap';
export const REVIEW_LOT_STATE_LABEL: Record<ReviewLotState, string> = { 'cho-claude': 'Chờ Claude duyệt', 'co-ket-qua': 'Claude đã duyệt — chờ nhập', 'da-nhap': 'Đã nhập' };
export interface ReviewLotRow { lo: string; lotFile: string | null; resFile: string | null; state: ReviewLotState; at: number }
/** Gom tệp trong thư mục trao đổi thành từng lô, mới nhất trước. `imported` = các lô đã nhập (lưu ở máy). */
export function reviewLotRows(files: readonly XFile[], imported: ReadonlySet<string>): ReviewLotRow[] {
  const m = new Map<string, ReviewLotRow>();
  const row = (lo: string) => { let r = m.get(lo); if (!r) m.set(lo, (r = { lo, lotFile: null, resFile: null, state: 'cho-claude', at: 0 })); return r; };
  for (const f of files) {
    const a = /^hedu-duyet-(.+)\.json$/i.exec(f.name), b = /^ket-qua-(.+)\.json$/i.exec(f.name);
    if (a) { const r = row(a[1]); r.lotFile = f.name; r.at = Math.max(r.at, f.mtimeMs); }
    else if (b) { const r = row(b[1]); r.resFile = f.name; r.at = Math.max(r.at, f.mtimeMs); }
  }
  for (const r of m.values()) r.state = imported.has(r.lo) ? 'da-nhap' : r.resFile ? 'co-ket-qua' : 'cho-claude';
  return [...m.values()].sort((x, y) => y.at - x.at);
}
