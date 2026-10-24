// Phía giao diện của lớp AI DÙNG CHUNG (Rust: src-tauri/src/ai.rs). Không chứa prompt của tính năng nào:
// mỗi tính năng là một "nhiệm vụ AI" riêng (src/lib/ai/tasks/…) tự dựng system/user/khuôn JSON rồi gọi aiRun().
// Khoá API không bao giờ đi qua giao diện sau khi lưu: chỉ hỏi được "đã có khoá chưa".
import { invoke, isDesktop } from '../platform';

export type AiErrorKind =
  | 'no_key' | 'bad_key' | 'forbidden' | 'quota_day' | 'rate' | 'overloaded' | 'timeout'
  | 'too_large' | 'network' | 'bad_request' | 'blocked' | 'bad_response' | 'unsupported' | 'not_desktop';

export interface AiRequest {
  provider: 'gemini';
  model: string;
  system: string;
  user: string;
  /** khuôn JSON của nhiệm vụ; bỏ trống ⇒ trả chữ thường */
  schema?: unknown;
  maxOutputTokens?: number;
  timeoutSecs?: number;
  /** mức "suy nghĩ" của model; bỏ trống ⇒ mặc định của model (thường chậm) */
  thinkingLevel?: ThinkingLevel;
}

export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

export interface AiReply { text: string; finish: string; promptTokens: number; outputTokens: number; model: string }

export class AiError extends Error {
  constructor(readonly kind: AiErrorKind, message: string, readonly retryAfterSecs: number | null = null) { super(message); }
}

/** Lỗi có nên cho người dùng bấm "Thử lại" ngay không (khác: sửa khoá, chờ ngày mai, giảm số câu…). */
export const retryable = (k: AiErrorKind): boolean => k === 'rate' || k === 'overloaded' || k === 'timeout' || k === 'network';

function toAiError(e: unknown): AiError {
  const o = e as { kind?: unknown; message?: unknown; retryAfterSecs?: unknown };
  if (o && typeof o.kind === 'string') return new AiError(o.kind as AiErrorKind, typeof o.message === 'string' ? o.message : 'Lỗi AI.', typeof o.retryAfterSecs === 'number' ? o.retryAfterSecs : null);
  return new AiError('network', e instanceof Error ? e.message : String(e));
}

const desktopOnly = () => new AiError('not_desktop', 'AI chỉ dùng được trong bản cài trên Windows.');

export async function aiKeyStatus(): Promise<{ hasKey: boolean }> {
  if (!isDesktop()) return { hasKey: false };
  try { return await invoke<{ hasKey: boolean }>('ai_key_status'); } catch (e) { throw toAiError(e); }
}

export async function aiKeySet(key: string): Promise<void> {
  if (!isDesktop()) throw desktopOnly();
  try { await invoke<void>('ai_key_set', { key }); } catch (e) { throw toAiError(e); }
}

export async function aiKeyClear(): Promise<void> {
  if (!isDesktop()) throw desktopOnly();
  try { await invoke<void>('ai_key_clear'); } catch (e) { throw toAiError(e); }
}

/** Chạy MỘT lượt nhiệm vụ AI. Người gọi PHẢI đã hỏi và được người dùng đồng ý cho lượt này. */
export async function aiRun(req: AiRequest): Promise<AiReply> {
  if (!isDesktop()) throw desktopOnly();
  try { return await invoke<AiReply>('ai_run', { req }); } catch (e) { throw toAiError(e); }
}
