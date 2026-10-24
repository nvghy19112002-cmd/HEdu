// Phân loại ID (%[…]) của câu khi nhập .tex: mục đích là KHÔNG bao giờ gán vị trí lặng lẽ.
//   ok           ID đúng đủ Lớp/Phân môn/Chương/Mức độ/Bài-Dạng trong cây ⇒ dùng đúng ID đó.
//   thieu-dang   ID đúng tới Bài nhưng không ghi mã Dạng (vd 2D1H1) ⇒ HEdu hiểu là Dạng ĐẦU TIÊN của Bài (hành vi cũ) — phải báo rõ.
//   khong-hop-le có %[…] nhưng không khớp cây (sai mã, Dạng không tồn tại…) ⇒ cần giáo viên xử lý, không tự gán.
//   khong-co     không có %[…] ⇒ cần giáo viên xử lý (gợi ý/chọn tay), không tự gán.
import { parseExTest } from './extest';
import { parseCode } from './id';

export type IdState = 'ok' | 'thieu-dang' | 'khong-hop-le' | 'khong-co';

export function idStateOf(latex: string): IdState {
  const id = parseExTest(latex).idComment;
  if (!id) return 'khong-co';
  if (!parseCode(id)) return 'khong-hop-le';
  return /-/.test(id) ? 'ok' : 'thieu-dang';
}

export interface ImportIdSummary {
  total: number;
  ok: number;
  /** ID thiếu mã Dạng ⇒ vào Dạng đầu tiên của Bài */
  firstForm: number;
  /** không có ID / ID không hợp lệ và giáo viên chưa chọn Dạng ⇒ vào vị trí chung đang chọn */
  needTeacher: { missing: number; invalid: number };
  /** cần tick xác nhận trước khi nhập */
  mustConfirm: boolean;
}

/** `chosen(i)` = giáo viên đã chọn Dạng cho câu i (gợi ý được nhận). Chỉ tính các câu sẽ được nhập. */
export function summarizeImportIds(states: readonly IdState[], importing: (i: number) => boolean, chosen: (i: number) => boolean): ImportIdSummary {
  const s: ImportIdSummary = { total: 0, ok: 0, firstForm: 0, needTeacher: { missing: 0, invalid: 0 }, mustConfirm: false };
  states.forEach((st, i) => {
    if (!importing(i)) return;
    s.total++;
    if (st === 'ok') s.ok++;
    else if (st === 'thieu-dang') s.firstForm++;
    else if (!chosen(i)) { if (st === 'khong-co') s.needTeacher.missing++; else s.needTeacher.invalid++; }
  });
  s.mustConfirm = s.firstForm > 0 || s.needTeacher.missing + s.needTeacher.invalid > 0;
  return s;
}
