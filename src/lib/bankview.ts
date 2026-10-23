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

// Sắp xếp và số câu mỗi trang: tuỳ chọn giao diện theo máy.
import { DEFAULT_SORT, SORT_MODES, type SortMode } from './qsort';
export const PER_PAGE_CHOICES = [20, 50] as const;
export type PerPage = (typeof PER_PAGE_CHOICES)[number];
export const loadSort = (): SortMode => { try { const v = localStorage.getItem('hedu.banksort') as SortMode | null; return v && SORT_MODES.includes(v) ? v : DEFAULT_SORT; } catch { return DEFAULT_SORT; } };
export const saveSort = (s: SortMode): void => { try { if (s === DEFAULT_SORT) localStorage.removeItem('hedu.banksort'); else localStorage.setItem('hedu.banksort', s); } catch { /* bỏ qua */ } };
export const loadPerPage = (): PerPage => { try { return localStorage.getItem('hedu.bankpp') === '50' ? 50 : 20; } catch { return 20; } };
export const savePerPage = (n: PerPage): void => { try { if (n === 20) localStorage.removeItem('hedu.bankpp'); else localStorage.setItem('hedu.bankpp', String(n)); } catch { /* bỏ qua */ } };
