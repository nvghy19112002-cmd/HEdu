// Tuỳ chọn giao diện của màn Ngân hàng (chỉ giao diện, lưu theo máy; KHÔNG nằm trong dữ liệu ngân hàng).
export type BankView = 'cards' | 'list';
const KEY = 'hedu.bankview';
export function loadBankView(): BankView {
  try { return localStorage.getItem(KEY) === 'list' ? 'list' : 'cards'; } catch { return 'cards'; }
}
export function saveBankView(v: BankView): void {
  try { if (v === 'cards') localStorage.removeItem(KEY); else localStorage.setItem(KEY, v); } catch { /* bỏ qua */ }
}

// Ẩn/hiện mục lục: cũng chỉ là tuỳ chọn giao diện theo máy.
const TKEY = 'hedu.banktree';
export const loadTreeOpen = (): boolean | null => { try { const v = localStorage.getItem(TKEY); return v === 'open' ? true : v === 'closed' ? false : null; } catch { return null; } };
export const saveTreeOpen = (o: boolean): void => { try { localStorage.setItem(TKEY, o ? 'open' : 'closed'); } catch { /* bỏ qua */ } };
