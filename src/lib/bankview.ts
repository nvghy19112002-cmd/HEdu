// Tuỳ chọn giao diện của màn Ngân hàng (chỉ giao diện, lưu theo máy; KHÔNG nằm trong dữ liệu ngân hàng).
// Sắp xếp và số câu mỗi trang: tuỳ chọn giao diện theo máy.
import { DEFAULT_SORT, SORT_MODES, type SortMode } from './qsort';
export const PER_PAGE_CHOICES = [20, 50] as const;
export type PerPage = (typeof PER_PAGE_CHOICES)[number];
export const loadSort = (): SortMode => { try { const v = localStorage.getItem('hedu.banksort') as SortMode | null; return v && SORT_MODES.includes(v) ? v : DEFAULT_SORT; } catch { return DEFAULT_SORT; } };
export const saveSort = (s: SortMode): void => { try { if (s === DEFAULT_SORT) localStorage.removeItem('hedu.banksort'); else localStorage.setItem('hedu.banksort', s); } catch { /* bỏ qua */ } };
export const loadPerPage = (): PerPage => { try { return localStorage.getItem('hedu.bankpp') === '50' ? 50 : 20; } catch { return 20; } };
export const savePerPage = (n: PerPage): void => { try { if (n === 20) localStorage.removeItem('hedu.bankpp'); else localStorage.setItem('hedu.bankpp', String(n)); } catch { /* bỏ qua */ } };
