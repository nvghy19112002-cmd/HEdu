// Cài đặt AI trên MÁY NÀY (không nằm trong dữ liệu ngân hàng, không vào file sao lưu). Khoá API KHÔNG ở đây:
// khoá nằm trong Windows Credential Manager (src-tauri/src/ai.rs).
import type { ThinkingLevel } from './client';

export interface AiModelChoice { id: string; label: string; note: string }

/** Danh sách gợi ý; mã model sửa được (Google hay đổi tên model) nhưng KHÔNG sửa được địa chỉ máy chủ. */
export const AI_MODELS: readonly AiModelChoice[] = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', note: 'Mặc định — có gói miễn phí (chậm: ~1–2 phút/10 câu)' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', note: 'Nhanh — có gói miễn phí (chưa đo độ chính xác)' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', note: 'Cho câu khó — chỉ khi gói miễn phí của tài khoản cho phép' },
];

/**
 * Mức "suy nghĩ" dùng cho nhiệm vụ phân loại: thấp nhất model cho phép (theo tài liệu Google 24/10/2026).
 * Để mặc định, 3.8 Flash "suy nghĩ" quá lâu (> 120 s cho câu 1+1) và hết giới hạn token trước khi trả lời.
 */
export function thinkingFor(model: string): ThinkingLevel | undefined {
  if (/^gemini-3\.8-flash/.test(model) || /pro/.test(model)) return 'low';
  if (/^gemini-3(\.\d+)?-flash/.test(model)) return 'minimal';
  return undefined;
}
export const DEFAULT_MODEL = 'gemini-3.8-flash';
export const DEFAULT_PRO_MODEL = 'gemini-2.5-pro';

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
    model: m && validModelId(m) ? m : DEFAULT_MODEL,
    proModel: p && validModelId(p) ? p : DEFAULT_PRO_MODEL,
  };
}

export function saveAiPrefs(p: AiPrefs): void {
  write(K.consent, p.consent ? 'yes' : null);
  write(K.model, validModelId(p.model) && p.model !== DEFAULT_MODEL ? p.model : null);
  write(K.pro, validModelId(p.proModel) && p.proModel !== DEFAULT_PRO_MODEL ? p.proModel : null);
}
