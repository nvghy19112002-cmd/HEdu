// Nhập .tex: đọc ID và dựng bản ghi THEO CÂY HIỆN TẠI (PR 1B). Phần thuần của màn Nhập liệu để kiểm thử bằng đúng luồng thực tế.
// Cây có thể đổi sau khi tệp đã được đọc: ID từng hợp lệ có thể thành không hợp lệ. Mọi chỗ cần ID (danh sách phải kiểm chứng,
// vị trí sẽ ghi, thống kê) PHẢI đọc lại qua `readIds` với cây hiện tại, không dùng kết quả đọc cũ lưu trong dòng của lô.
import { idFromLatex } from './importid';
import { placeWithId } from './idsync';
import { placeDisputed, type IdDecision, type IdVerification } from './idverify';
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
  /** vị trí của câu KHÔNG có ID dùng được (gợi ý đã chọn nếu còn hợp lệ, không thì vị trí chung) */
  noIdLoc: (i: number) => Location;
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
export function planDrafts(p: PlanInput): { drafts: Draft[] } | { error: string } {
  const out: Draft[] = [];
  for (let i = 0; i < p.latexes.length; i++) {
    if (!p.importing(i)) continue;
    const text = p.latexes[i].trim();
    const id = p.ids[i];
    const ver = id ? p.ver(i) : undefined;
    if (id && ver?.verdict === 'bat-dong') {
      const pl = placeDisputed({ text, id, ver, decision: p.decision(i), commonLoc: p.commonLoc, commonLevel: p.commonLevel, tax: p.tax });
      if (!pl.ok) return { error: `Câu ${i + 1}: ${pl.reason}` };
      out.push({ latex: pl.latex, level: pl.level, tags: p.tags(i), ...pl.loc });
      continue;
    }
    if (id) { out.push({ latex: text, level: id.level, tags: p.tags(i), ...id.loc }); continue; }
    // Câu chưa có ID dùng được: ghi ID theo vị trí đã xác nhận vào mã LaTeX lưu trong ngân hàng (tệp .tex gốc không bị sửa).
    // Câu có ID lỗi/thiếu Dạng/nhiều ID: giữ nguyên LaTeX (không tự thay), vị trí vẫn theo lựa chọn của giáo viên.
    const at = p.noIdLoc(i);
    const w = placeWithId(text, at, p.commonLevel, p.tax, false);
    out.push({ latex: 'latex' in w ? w.latex : text, level: p.commonLevel, tags: p.tags(i), ...at });
  }
  return { drafts: out };
}
