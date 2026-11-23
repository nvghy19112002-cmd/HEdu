// Cài đặt AI trên MÁY NÀY (không nằm trong dữ liệu ngân hàng, không vào file sao lưu). Khoá API KHÔNG ở đây:
// khoá nằm trong Windows Credential Manager (src-tauri/src/ai.rs).
import type { ThinkingLevel } from './client';

export interface AiModelChoice { id: string; label: string; note: string }

/** Danh sách gợi ý; mã model sửa được (Google hay đổi tên model) nhưng KHÔNG sửa được địa chỉ máy chủ. */
export const AI_MODELS: readonly AiModelChoice[] = [
  // Tra trang models/deprecations của Google ngày 23/11/2026. Google hay đổi tên: cập nhật danh sách + RETIRED cùng lúc.
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', note: 'Mặc định — miễn phí tới 31/12/2026; giờ cao điểm hay báo "quá tải", thử lại sau ít phút' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', note: 'Nhanh — có gói miễn phí; dùng khi 3.8 Flash quá tải' },
  { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen', note: 'Thế hệ 4, suy luận tốt — có gói miễn phí; hợp cho câu khó, trang nhiều hình' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', note: 'Rẻ, rất nhanh — có gói miễn phí; ứng viên cho Gán ID, chưa đo trên bộ nhãn chuẩn' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (xem trước)', note: 'Pro — KHÔNG có gói miễn phí, cần tài khoản trả phí' },
  { id: 'gemini-4-carbon', label: 'Gemini 4 Carbon', note: 'Mạnh nhất — KHÔNG có gói miễn phí, cần tài khoản trả phí' },
];

/**
 * Mức "suy nghĩ" dùng cho nhiệm vụ phân loại: thấp nhất model cho phép (theo tài liệu Google 24/10/2026).
 * Để mặc định, 3.8 Flash "suy nghĩ" quá lâu (> 120 s cho câu 1+1) và hết giới hạn token trước khi trả lời.
 */
export function thinkingFor(model: string): ThinkingLevel | undefined {
  if (/^gemini-3\.8-flash/.test(model) || /pro/.test(model) || /^gemini-4-/.test(model)) return 'low';
  if (/^gemini-3(\.\d+)?-flash/.test(model)) return 'minimal';
  return undefined;
}
export const DEFAULT_MODEL = 'gemini-3.8-flash';
/** model cho câu khó: Gemini 4 Hydrogen vì có gói miễn phí (3.1 Pro chỉ dùng được khi trả phí) */
export const DEFAULT_PRO_MODEL = 'gemini-4-hydrogen';

/** Model Google đã ngừng (01/12/2026 tự chuyển sang model khác): máy nào còn lưu thì quay về mặc định. */
const RETIRED = new Set(['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3-pro-preview', 'gemini-3.1-flash-lite-preview', 'gemini-2.0-flash', 'gemini-2.0-flash-lite']);
const usable = (m: string | null): m is string => !!m && validModelId(m) && !RETIRED.has(m);

/** Giống kiểm tra phía Rust: chữ thường, số, '.', '-' — không chèn được đường dẫn. */
export const validModelId = (m: string): boolean => /^[a-z0-9][a-z0-9.-]{0,63}$/.test(m);

export interface AiPrefs {
  /** đã đồng ý về nguyên tắc cho phép gửi nội dung câu hỏi tới Google (mỗi lượt vẫn hỏi lại) */
  consent: boolean;
  model: string;
  proModel: string;
}

const K = { consent: 'hedu.ai.consent', model: 'hedu.ai.model', pro: 'hedu.ai.promodel' };
const read = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null): void => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* bỏ qua */ } };

export function loadAiPrefs(): AiPrefs {
  const m = read(K.model), p = read(K.pro);
  return {
    consent: read(K.consent) === 'yes',
    model: usable(m) ? m : DEFAULT_MODEL,
    proModel: usable(p) ? p : DEFAULT_PRO_MODEL,
  };
}

export function saveAiPrefs(p: AiPrefs): void {
  write(K.consent, p.consent ? 'yes' : null);
  write(K.model, validModelId(p.model) && p.model !== DEFAULT_MODEL ? p.model : null);
  write(K.pro, validModelId(p.proModel) && p.proModel !== DEFAULT_PRO_MODEL ? p.proModel : null);
}
