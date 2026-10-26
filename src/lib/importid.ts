// Phân loại ID (%[…]) của câu khi nhập .tex: mục đích là KHÔNG bao giờ gán vị trí lặng lẽ. Đọc ID bằng bộ đọc chung (idtex/idsync).
//   ok           đúng MỘT ID đủ Lớp/Phân môn/Chương/Mức độ/Bài-Dạng trong cây ⇒ dùng đúng ID đó, giữ nguyên LaTeX.
//   thieu-dang   ID đúng tới Bài nhưng không ghi mã Dạng (vd 2D1H1) ⇒ KHÔNG tự vào Dạng nào: giáo viên chọn Dạng (hoặc vào vị trí chung có xác nhận).
//   khong-hop-le có ID nhưng không dùng được (sai mã, Dạng không còn, mã trùng trong cây, nhiều ID mâu thuẫn) ⇒ cần giáo viên xử lý.
//   khong-co     không có ID ở đầu câu ⇒ cần giáo viên xử lý (gợi ý/chọn tay), không tự gán.
import { getTaxonomy } from './curriculum';
import { readLatexId } from './idsync';
import type { Level, Location, Taxonomy } from './types';

export type IdState = 'ok' | 'thieu-dang' | 'khong-hop-le' | 'khong-co';

export function idStateOf(latex: string, tax: Taxonomy = getTaxonomy()): IdState {
  const r = readLatexId(latex, tax);
  if (r.state === 'hop-le') return 'ok';
  if (r.state === 'khong-co' || r.state === 'khong-phai-ex') return 'khong-co';
  return r.state === 'thieu-dang' ? 'thieu-dang' : 'khong-hop-le';
}

/** Vị trí + mức độ lấy từ ID trong LaTeX — chỉ khi câu có đúng một ID hợp lệ đủ Dạng. */
export function idFromLatex(latex: string, tax: Taxonomy = getTaxonomy()): { loc: Location; level: Level } | null {
  const r = readLatexId(latex, tax);
  return r.resolved ? { loc: r.resolved.loc, level: r.resolved.level } : null;
}

export interface ImportIdSummary {
  total: number;
  ok: number;
  /** câu thiếu/sai ID mà giáo viên chưa chọn Dạng ⇒ vào vị trí chung đang chọn */
  needTeacher: { missing: number; invalid: number; noForm: number };
  /** cần tick xác nhận trước khi nhập */
  mustConfirm: boolean;
}

/** `chosen(i)` = giáo viên đã chọn Dạng cho câu i (gợi ý được nhận). Chỉ tính các câu sẽ được nhập. */
export function summarizeImportIds(states: readonly IdState[], importing: (i: number) => boolean, chosen: (i: number) => boolean): ImportIdSummary {
  const s: ImportIdSummary = { total: 0, ok: 0, needTeacher: { missing: 0, invalid: 0, noForm: 0 }, mustConfirm: false };
  states.forEach((st, i) => {
    if (!importing(i)) return;
    s.total++;
    if (st === 'ok') s.ok++;
    else if (!chosen(i)) { if (st === 'khong-co') s.needTeacher.missing++; else if (st === 'thieu-dang') s.needTeacher.noForm++; else s.needTeacher.invalid++; }
  });
  s.mustConfirm = s.needTeacher.missing + s.needTeacher.invalid + s.needTeacher.noForm > 0;
  return s;
}
