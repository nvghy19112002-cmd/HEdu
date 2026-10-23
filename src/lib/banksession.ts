// Trạng thái duyệt của màn Ngân hàng, GIỮ TRONG BỘ NHỚ khi chuyển sang màn khác rồi quay lại (vd Câu hỏi mới → Về Ngân hàng).
// Không ghi xuống đĩa, không nằm trong dữ liệu ngân hàng; mở lại ứng dụng thì bắt đầu mới. Lựa chọn tick (selection) KHÔNG giữ.
import type { BankFilters } from './bankfilter';
import type { SortMode } from './qsort';

export interface BankSession { f0: BankFilters; text: string; wide: boolean; sort: SortMode; page: number }
let session: BankSession | null = null;
export const loadSession = (): BankSession | null => session;
export const saveSession = (s: BankSession): void => { session = s; };
export const clearSession = (): void => { session = null; };
