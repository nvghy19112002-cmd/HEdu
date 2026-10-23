// Điều hướng danh sách cặp nghi trùng và gợi ý (chỉ là chữ gợi ý, KHÔNG tự xoá/duyệt gì).
import { reviewOf } from './types';
import type { DupKind } from './dup2';

/** Cặp nên hiện sau khi cặp `cur` rời khỏi danh sách: cặp liền sau, không có thì cặp liền trước. */
export function nextKeyAfter(keys: readonly string[], cur: string | null): string | null {
  const i = cur ? keys.indexOf(cur) : -1;
  if (i < 0) return keys[0] ?? null;
  return keys[i + 1] ?? keys[i - 1] ?? null;
}

export interface NavInfo { index: number; total: number; prev: string | null; next: string | null }
export function navInfo(keys: readonly string[], cur: string | null): NavInfo {
  const i = cur ? keys.indexOf(cur) : -1;
  return { index: i, total: keys.length, prev: i > 0 ? keys[i - 1] : null, next: i >= 0 && i < keys.length - 1 ? keys[i + 1] : null };
}

/** Gợi ý khi hai câu giống nguyên mã / chỉ khác trình bày: nếu đúng một câu đã duyệt thì nhắc cân nhắc giữ câu đó. */
export function keepHint(kind: DupKind, a: { review?: 'approved' | 'needs_fix' }, b: { review?: 'approved' | 'needs_fix' }): string | null {
  if (kind !== 'raw' && kind !== 'same') return null;
  const ra = reviewOf(a) === 'approved', rb = reviewOf(b) === 'approved';
  if (ra === rb) return null;
  return `Gợi ý: câu ${ra ? 'A' : 'B'} đã duyệt, câu ${ra ? 'B' : 'A'} chưa. Có thể cân nhắc giữ câu ${ra ? 'A' : 'B'}. HEdu không tự xoá hay đổi gì — thầy/cô quyết định.`;
}
