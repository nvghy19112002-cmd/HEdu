// Xoá câu = chuyển vào thùng rác (tệp phụ). Chỉ xoá khỏi ngân hàng KHI thùng rác đã ghi bền vững,
// nên không bao giờ có trạng thái "đã xoá mà không còn bản nào".
import { decisionsLoaded, loadDecisions, trashAdd } from './dupdecisions';
import { deleteQuestion } from './store';
import type { Question } from './types';

export async function moveToTrash(q: Question): Promise<boolean> {
  if (!decisionsLoaded()) await loadDecisions();
  if (!(await trashAdd(q))) return false;
  deleteQuestion(q.uid);
  return true;
}
