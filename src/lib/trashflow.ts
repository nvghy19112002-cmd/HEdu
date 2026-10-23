// Xoá câu = chuyển vào thùng rác (tệp phụ). Chỉ xoá khỏi ngân hàng KHI thùng rác đã ghi bền vững,
// nên không bao giờ có trạng thái "đã xoá mà không còn bản nào".
import { decisionsLoaded, loadDecisions, TRASH_CAP, trashAdd, trashAddMany, trashCount, trashRemoveMany, trashRoomFor } from './dupdecisions';
import { deleteMany, deleteQuestion, restoreMany } from './store';
import type { Question } from './types';

export async function moveToTrash(q: Question): Promise<boolean> {
  if (!decisionsLoaded()) await loadDecisions();
  if (!(await trashAdd(q))) return false;
  deleteQuestion(q.uid);
  return true;
}

/** Lý do KHÔNG thể chuyển các câu này vào thùng rác (null = được). Chỉ nói về sức chứa; lỗi ghi tệp do moveToTrash báo false. */
export async function trashBlockReason(qs: readonly Question[]): Promise<string | null> {
  if (!decisionsLoaded()) await loadDecisions();
  if (trashRoomFor(qs)) return null;
  return `Thùng rác đã đầy (tối đa ${TRASH_CAP} câu) nên CHƯA xoá câu nào. Vào Hệ thống → Thùng rác để khôi phục hoặc xoá hẳn bớt, rồi thử lại.`;
}

/** Số câu còn thêm được vào thùng rác. */
export const trashFree = (): number => Math.max(0, TRASH_CAP - trashCount());

export type MoveManyResult =
  | { ok: true; moved: number }
  | { ok: false; why: 'full' | 'trash-write' | 'bank-write'; moved: 0; message: string; /** câu vẫn nằm trong thùng rác dù chưa xoá khỏi ngân hàng (hoàn tác thùng rác cũng lỗi) — không mất dữ liệu */ strayInTrash?: number };

/**
 * Chuyển NHIỀU câu vào thùng rác, tất cả hoặc không câu nào:
 *  1) kiểm tra sức chứa cho CẢ lô (đầy ⇒ từ chối, không cắt bớt);
 *  2) thùng rác ghi bền vững bằng MỘT lần ghi (lỗi ⇒ chưa đụng ngân hàng);
 *  3) xoá khỏi ngân hàng bằng MỘT lần ghi và kiểm tra ghi thành công;
 *     lỗi ⇒ ngân hàng được hoàn lại đủ VÀ các bản vừa cất trong thùng rác được gỡ ra (nếu gỡ cũng lỗi: câu nằm ở cả hai nơi, không mất).
 * Chỉ khi trả ok mới được nói "Đã xoá N câu".
 */
export async function moveManyToTrash(qs: readonly Question[]): Promise<MoveManyResult> {
  if (qs.length === 0) return { ok: true, moved: 0 };
  if (!decisionsLoaded()) await loadDecisions();
  if (!trashRoomFor(qs)) return { ok: false, why: 'full', moved: 0, message: `Thùng rác chỉ còn chỗ cho ${trashFree()} câu (tối đa ${TRASH_CAP}) nên CHƯA xoá câu nào.` };
  const ids = qs.map((q) => q.uid);
  if (!(await trashAddMany(qs))) return { ok: false, why: 'trash-write', moved: 0, message: 'Không lưu được thùng rác nên CHƯA xoá câu nào.' };
  const r = await deleteMany(ids);
  if (r.ok) return { ok: true, moved: r.changed };
  const undone = await trashRemoveMany(ids);
  return { ok: false, why: 'bank-write', moved: 0, strayInTrash: undone ? undefined : ids.length, message: 'Không ghi được ngân hàng nên CHƯA xoá câu nào (mọi câu vẫn còn nguyên).' };
}

export type UndoResult = { ok: true; restored: number; strayInTrash?: number } | { ok: false; message: string };

/**
 * Hoàn tác "Chuyển vào Thùng rác": đưa các câu về ngân hàng TRƯỚC (ghi một lần, kiểm tra), rồi mới gỡ khỏi thùng rác.
 * Nếu gỡ khỏi thùng rác lỗi thì câu nằm ở cả hai nơi (không mất) và có báo.
 */
export async function undoMoveToTrash(qs: readonly Question[]): Promise<UndoResult> {
  const r = await restoreMany(qs);
  if (!r.ok) return { ok: false, message: 'Không ghi được ngân hàng nên CHƯA hoàn tác (các câu vẫn nằm trong Thùng rác, không mất).' };
  if (!(await trashRemoveMany(qs.map((q) => q.uid)))) return { ok: true, restored: r.changed, strayInTrash: qs.length };
  return { ok: true, restored: r.changed };
}
