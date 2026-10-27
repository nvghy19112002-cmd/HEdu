// Nhập .tex: đọc ID và dựng bản ghi THEO CÂY HIỆN TẠI (PR 1B). Phần thuần của màn Nhập liệu để kiểm thử bằng đúng luồng thực tế.
// Cây có thể đổi sau khi tệp đã được đọc: ID từng hợp lệ có thể thành không hợp lệ. Mọi chỗ cần ID (danh sách phải kiểm chứng,
// vị trí sẽ ghi, thống kê) PHẢI đọc lại qua `readIds` với cây hiện tại, không dùng kết quả đọc cũ lưu trong dòng của lô.
import { idFromLatex } from './importid';
import { placeWithId, strictCode } from './idsync';
import { placeDisputed, type IdDecision, type IdVerification, type PlacedMeta } from './idverify';
import type { Draft } from './store';
import type { Level, Location, Taxonomy } from './types';

export type IdRead = { loc: Location; level: Level };

/** ID đọc từ từng câu theo cây `tax`; null = không có ID dùng được (thiếu, sai, thiếu Dạng, mã không còn trong cây hoặc trùng). */
export function readIds(latexes: readonly string[], tax: Taxonomy): (IdRead | null)[] {
  return latexes.map((l) => idFromLatex(l, tax));
}

/** Chỉ số các câu có ID dùng được theo cây hiện tại: đúng danh sách cần kiểm chứng. */
export const idRowsOf = (ids: readonly (IdRead | null)[]): number[] => ids.flatMap((x, i) => (x ? [i] : []));

export interface PlanInput {
  /** LaTeX hiện tại của từng câu (đã gồm chỉnh sửa tại chỗ), chưa cắt khoảng trắng */
  latexes: readonly string[];
  /** câu nào sẽ được nhập */
  importing: (i: number) => boolean;
  /** ID đọc theo cây hiện tại (`readIds`) */
  ids: readonly (IdRead | null)[];
  /** kết quả kiểm chứng HIỆN TẠI của từng câu có ID */
  ver: (i: number) => IdVerification | undefined;
  /** quyết định của giáo viên cho câu ID bất đồng */
  decision: (i: number) => IdDecision | undefined;
  /** vị trí của câu KHÔNG có ID dùng được: gợi ý đã chọn (suggested = true, còn hợp lệ) hoặc vị trí chung (suggested = false ⇒ chưa phân loại) */
  noId: (i: number) => { loc: Location; suggested: boolean };
  commonLoc: Location;
  commonLevel: Level;
  tags: (i: number) => string[];
  tax: Taxonomy;
}

/**
 * Dựng bản ghi sẽ lưu. Câu có ID dùng được và không bất đồng: theo đúng ID đó. Câu ID bất đồng: chỉ theo quyết định còn hiệu lực.
 * Câu không có ID dùng được (kể cả ID từng hợp lệ nhưng cây đã đổi): vị trí đã xác nhận, KHÔNG dùng vị trí đọc cũ.
 * Không ghi được nhất quán ⇒ trả lỗi, không ghi gì.
 */
export function planDrafts(p: PlanInput): { drafts: Draft[]; meta: PlacedMeta[] } | { error: string } {
  const out: Draft[] = [];
  const meta: PlacedMeta[] = [];
  // ID nguyên bản trong tệp (dựng lại từ vị trí + mức độ đọc được; trùng với mã trong tệp, đã chuẩn hoá chữ hoa)
  const origOf = (id: IdRead): { orig?: string } => { const sc = strictCode(id.loc, id.level, p.tax); return sc.ok ? { orig: sc.code } : {}; };
  for (let i = 0; i < p.latexes.length; i++) {
    if (!p.importing(i)) continue;
    const text = p.latexes[i].trim();
    const id = p.ids[i];
    const ver = id ? p.ver(i) : undefined;
    if (id && ver?.verdict === 'bat-dong') {
      const pl = placeDisputed({ text, id, ver, decision: p.decision(i), commonLoc: p.commonLoc, commonLevel: p.commonLevel, tax: p.tax });
      if (!pl.ok) return { error: `Câu ${i + 1}: ${pl.reason}` };
      out.push({ latex: pl.latex, level: pl.level, tags: p.tags(i), ...pl.loc });
      meta.push({ form: pl.form, src: pl.src, unclassified: pl.unclassified, ...(pl.why ? { why: pl.why } : {}), ...(pl.prop ? { prop: pl.prop } : {}), ...origOf(id) });
      continue;
    }
    if (id) {
      out.push({ latex: text, level: id.level, tags: p.tags(i), ...id.loc });
      // ID từ tệp: khớp ngân hàng ⇒ máy phân loại; chưa kiểm chứng ⇒ chưa xác minh. Không bao giờ tự thành giáo viên xác minh.
      meta.push({ form: ver?.verdict === 'khop' ? 'may' : 'chua', src: 'tep', unclassified: false, ...origOf(id) });
      continue;
    }
    // Câu chưa có ID dùng được. Giáo viên đã nhận gợi ý ⇒ ghi ID theo vị trí đó vào LaTeX lưu trong ngân hàng (tệp .tex gốc không đổi), máy phân loại.
    // Vào vị trí chung ⇒ Chưa phân loại: LaTeX NGUYÊN VĂN, không ghi ID giả. Câu có ID lỗi/thiếu Dạng/nhiều ID: không tự thay mã.
    const { loc: at, suggested } = p.noId(i);
    if (suggested) {
      const w = placeWithId(text, at, p.commonLevel, p.tax, false);
      const wrote = 'latex' in w;
      out.push({ latex: wrote ? w.latex : text, level: p.commonLevel, tags: p.tags(i), ...at });
      meta.push({ form: wrote ? 'may' : 'chua', src: 'goi-y', unclassified: !wrote });
    } else {
      out.push({ latex: text, level: p.commonLevel, tags: p.tags(i), ...at });
      meta.push({ form: 'chua', src: 'tay', unclassified: true });
    }
  }
  return { drafts: out, meta };
}
