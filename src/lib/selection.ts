// Chọn nhiều câu ở màn Ngân hàng — hàm thuần, chỉ làm việc với tập uid (không đụng dữ liệu câu hỏi).
// Ba tập khác nhau, KHÔNG được nhầm:
//   - selection (các câu đã tick),  - kết quả đang lọc (toàn bộ, nhiều trang),  - trang đang hiện.
// Chọn trang / chọn kết quả luôn là THÊM vào tập đã chọn; đổi trang, lọc, sắp xếp, kiểu xem không làm đổi tập này.
export type SelSet = ReadonlySet<string>;

export const addMany = (sel: SelSet, uids: Iterable<string>): Set<string> => { const n = new Set(sel); for (const u of uids) n.add(u); return n; };
export const removeMany = (sel: SelSet, uids: Iterable<string>): Set<string> => { const n = new Set(sel); for (const u of uids) n.delete(u); return n; };
export const toggleOne = (sel: SelSet, uid: string): Set<string> => { const n = new Set(sel); if (n.has(uid)) n.delete(uid); else n.add(uid); return n; };

export type PageState = 'none' | 'some' | 'all';
/** Trạng thái ô chọn trang: none / some (dấu gạch ngang) / all. Trang rỗng luôn là none. */
export function pageState(sel: SelSet, pageUids: readonly string[]): PageState {
  if (!pageUids.length) return 'none';
  let n = 0;
  for (const u of pageUids) if (sel.has(u)) n++;
  return n === 0 ? 'none' : n === pageUids.length ? 'all' : 'some';
}

export interface SelCounts {
  total: number;
  /** đã chọn và đang nằm ở trang hiện tại */
  inPage: number;
  /** đã chọn nhưng không ở trang hiện tại */
  outPage: number;
  /** đã chọn nhưng không nằm trong kết quả đang lọc (null khi không có tập kết quả để so) */
  outScope: number;
}
export function selCounts(sel: SelSet, pageUids: readonly string[], scopeUids: SelSet | null): SelCounts {
  const page = new Set(pageUids);
  let inPage = 0, outScope = 0;
  for (const u of sel) {
    if (page.has(u)) inPage++;
    if (scopeUids && !scopeUids.has(u)) outScope++;
  }
  return { total: sel.size, inPage, outPage: sel.size - inPage, outScope };
}

/** Bỏ các uid không còn tồn tại (câu đã xoá). Trả về CHÍNH tập cũ nếu không có gì đổi để không vẽ lại thừa. */
export function prune(sel: SelSet, exists: SelSet): SelSet {
  let bad = 0;
  for (const u of sel) if (!exists.has(u)) bad++;
  if (!bad) return sel;
  const n = new Set<string>();
  for (const u of sel) if (exists.has(u)) n.add(u);
  return n;
}

/** Chọn bấy nhiêu câu trở lên một lần thì hỏi lại. */
export const SELECT_ALL_CONFIRM_OVER = 1000;
/** Xuất .tex: trên ngưỡng cảnh báo thì hỏi, trên ngưỡng tối đa thì từ chối (hộp xem/sao chép chứa cả nội dung trong bộ nhớ). */
export const EXPORT_WARN_OVER = 1000;
export const EXPORT_MAX = 5000;
export const exportVerdict = (n: number): 'ok' | 'warn' | 'refuse' => (n > EXPORT_MAX ? 'refuse' : n > EXPORT_WARN_OVER ? 'warn' : 'ok');
