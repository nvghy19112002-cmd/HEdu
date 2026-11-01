// Màn "Xử lí TeX": Gán ID nhờ Claude ngay trên bàn nháp (câu CHƯA có ID). Dùng đúng định dạng lô/đề xuất của Gán ID nhờ Claude ở Ngân hàng
// (claudeid.ts) nên Claude làm giống hệt; khác ở chỗ đích đến là VĂN BẢN bàn nháp (chèn %[ID] sau \begin{ex}), không phải ngân hàng.
// Phần THUẦN. Không bao giờ đổi câu đã có ID; câu đã sửa sau khi xuất lô thì bỏ qua (so dấu vết nội dung), không ghi nửa vời.
import { CONF_LABEL, formRows, HUONG_DAN, LOT_FORMAT, type Conf, type LotFile, type LotItem, type ProposalFile } from './claudeid';
import { parseExTest } from './extest';
import { contentKeys } from './idreview';
import { placeWithId } from './idsync';
import { idlessVariants, readHead } from './idtex';
import { stemSnippet } from './snippet';
import { locationOfForm } from './taxpath';
import type { TaxIndex } from './taxonomy';
import { TYPE_LABEL, type Level, type Taxonomy } from './types';
import type { ScratchScan } from './texscratch';

/** Mã lô của bàn nháp bắt đầu bằng B (lô của Ngân hàng bắt đầu L hoặc K). */
export const SCRATCH_LOT_PREFIX = 'B';
export const kOf = (n: number): string => `n${n}`;
const nOf = (k: string): number | null => (/^n[0-9]+$/.test(k) ? Number(k.slice(1)) : null);

export interface ExampleQ { formId: string; latex: string }

/** Câu của bàn nháp có thể gán: khối hoàn chỉnh CHƯA có ID (trong phạm vi `only` nếu có). */
export function blocksNeedingId(scan: ScratchScan, only: ReadonlySet<number> | null): { n: number; text: string }[] {
  return scan.blocks.filter((b) => b.closed && (!only || only.has(b.n)) && readHead(b.text).ids.length === 0).map((b) => ({ n: b.n, text: b.text }));
}

export function buildScratchLot(blocks: readonly { n: number; text: string }[], o: { tax: Taxonomy; taxRev: string; grade: number | null; lo: string; now?: Date; examples?: readonly ExampleQ[] }): { lot: LotFile; count: number } {
  const grades = new Set(o.grade != null ? [o.grade] : o.tax.grades.map((g) => g.grade));
  const forms = formRows(o.tax, grades);
  const byForm = new Map(forms.map((f) => [f.id, f] as const));
  for (const q of o.examples ?? []) {
    const f = byForm.get(q.formId);
    if (f && f.vd.length < 2) f.vd.push(stemSnippet(q.latex, 220));
  }
  const cau = blocks.map((b): LotItem => ({ k: kOf(b.n), fp: contentKeys(b.text).i, lop: o.grade, loai: TYPE_LABEL[parseExTest(b.text).type], latex: (idlessVariants(b.text)[0] ?? b.text).trim() }));
  return {
    count: cau.length,
    lot: { format: LOT_FORMAT, v: 1, lo: o.lo, taoLuc: (o.now ?? new Date()).toISOString(), taxRev: o.taxRev, huongDan: HUONG_DAN, dang: forms.map(({ id, ma, duong, vd }) => ({ id, ma, duong, vd })), cau },
  };
}

export type SkipWhy = 'khong-con' | 'doi-noi-dung' | 'dang-la' | 'sai-lop' | 'trung' | 'thieu-muc' | 'da-co-id' | 'khong-ghi-duoc';
export const SKIP_LABEL: Record<SkipWhy, string> = {
  'khong-con': 'câu không còn trong bàn nháp (đã xoá hoặc đổi số thứ tự)',
  'doi-noi-dung': 'câu đã sửa sau khi xuất lô',
  'dang-la': 'Dạng không có trong cây chương trình',
  'sai-lop': 'Dạng thuộc lớp khác lớp đã chọn',
  trung: 'Claude ghi trùng một câu',
  'thieu-muc': 'Claude không ghi mức độ (cần để ra ID)',
  'da-co-id': 'câu đã có ID nên không đụng vào',
  'khong-ghi-duoc': 'không ghi được ID vào câu này',
};

export interface IdEdit { n: number; before: string; after: string; code: string; dang: string; chac: Conf; lyDo: string; level: Level }
export interface IdPlan { edits: IdEdit[]; skip: Partial<Record<SkipWhy, number>>; total: number }

/** Kế hoạch ghi: mỗi đề xuất hợp lệ → văn bản khối mới (chỉ chèn `%[ID]`). Chưa ghi gì. */
export function planScratchIds(p: ProposalFile, blocks: ReadonlyMap<number, string>, o: { tax: Taxonomy; ix: TaxIndex; grade: number | null }): IdPlan {
  const plan: IdPlan = { edits: [], skip: {}, total: p.cau.length };
  const skip = (w: SkipWhy) => { plan.skip[w] = (plan.skip[w] ?? 0) + 1; };
  const seen = new Set<string>();
  for (const it of p.cau) {
    if (seen.has(it.k)) { skip('trung'); continue; }
    seen.add(it.k);
    const n = nOf(it.k);
    const text = n == null ? undefined : blocks.get(n);
    if (n == null || text === undefined) { skip('khong-con'); continue; }
    if (contentKeys(text).i !== it.fp) { skip('doi-noi-dung'); continue; }
    if (readHead(text).ids.length > 0) { skip('da-co-id'); continue; }
    const loc = locationOfForm(o.ix, it.dang);
    if (!loc) { skip('dang-la'); continue; }
    if (o.grade != null && loc.grade !== o.grade) { skip('sai-lop'); continue; }
    if (!it.muc) { skip('thieu-muc'); continue; }
    const w = placeWithId(text, loc, it.muc, o.tax, false);
    if ('problem' in w) { skip('khong-ghi-duoc'); continue; }
    plan.edits.push({ n, before: text, after: w.latex, code: w.code, dang: it.dang, chac: it.chac, lyDo: it.lyDo, level: it.muc });
  }
  return plan;
}

/** Thay các khối theo kế hoạch (từ cuối lên đầu để vị trí không lệch); phần ngoài khối giữ nguyên. */
export function applyScratchIds(text: string, scan: ScratchScan, edits: readonly IdEdit[]): string {
  const by = new Map(edits.map((e) => [e.n, e] as const));
  let out = text;
  for (const b of [...scan.blocks].reverse()) {
    const e = by.get(b.n);
    if (e && text.slice(b.start, b.end) === e.before) out = out.slice(0, b.start) + e.after + out.slice(b.end);
  }
  return out;
}

export const confLabel = (c: Conf): string => CONF_LABEL[c];
