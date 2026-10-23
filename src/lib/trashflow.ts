// Xoá câu = chuyển vào thùng rác (tệp phụ). Chỉ xoá khỏi ngân hàng KHI thùng rác đã ghi bền vững,
// nên không bao giờ có trạng thái "đã xoá mà không còn bản nào".
import { decisionsLoaded, loadDecisions, TRASH_CAP, trashAdd, trashRoomFor } from './dupdecisions';
import { deleteQuestion } from './store';
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
