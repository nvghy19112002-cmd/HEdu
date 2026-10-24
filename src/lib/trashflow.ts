// Xoá câu = chuyển vào thùng rác (tệp phụ). Chỉ xoá khỏi ngân hàng KHI thùng rác đã ghi bền vững,
// nên không bao giờ có trạng thái "đã xoá mà không còn bản nào".
// Khôi phục làm ngược lại: ghi NGÂN HÀNG bền vững trước, chỉ khi đó mới gỡ bản trong thùng rác.
// Ngân hàng và tệp phụ là hai nơi lưu khác nhau nên KHÔNG có giao dịch nguyên tử tuyệt đối: mọi lỗi giữa chừng được
// xử lý bằng thứ tự ghi + hoàn lại đúng phần của thao tác, kết quả xấu nhất là câu nằm ở CẢ HAI nơi (thừa một bản, không mất).
import { getTaxonomy } from './curriculum';
import { decisionsLoaded, isDecisionsWritable, loadDecisions, TRASH_CAP, trashAddMany, trashCount, trashList, trashRemoveMany, trashRoomFor } from './dupdecisions';
import { deleteMany, getState, restoreMany, restoreManyEx } from './store';
import { indexOf } from './taxonomy';
import { relocated, validNewLocation } from './trashrelocate';
import type { Level, Location, Question } from './types';

// ---------- Khoá chống đua lệnh ----------
// Hai lệnh cùng chạm một câu (bấm đúp, vừa xoá vừa khôi phục…) không được chạy chồng nhau: lệnh sau bị từ chối với why = 'busy'.
const busy = new Set<string>();
const BUSY_MSG = 'Câu này đang được xử lý ở một thao tác khác — hãy đợi xong rồi thử lại.';
export const isTrashBusy = (uid: string): boolean => busy.has(uid);
async function withLock<T>(uids: readonly string[], onBusy: () => T, fn: () => Promise<T>): Promise<T> {
  if (uids.some((u) => busy.has(u))) return onBusy();
  for (const u of uids) busy.add(u);
  try { return await fn(); } finally { for (const u of uids) busy.delete(u); }
}

/**
 * Xoá MỘT câu = chuyển vào thùng rác, dùng đúng đường của xoá lô (thùng rác ghi bền vững TRƯỚC, rồi ngân hàng ghi bền vững;
 * ngân hàng lỗi ⇒ hoàn lại). Trả true CHỈ KHI cả hai đã ghi xong. Giữ chữ ký cũ cho Ngân hàng / Kiểm tra trùng.
 */
export async function moveToTrash(q: Question): Promise<boolean> {
  return (await moveManyToTrash([q])).ok;
}

/** Lý do KHÔNG thể chuyển các câu này vào thùng rác (null = được). Chỉ nói về sức chứa; lỗi ghi tệp do moveToTrash báo false. */
export async function trashBlockReason(qs: readonly Question[]): Promise<string | null> {
  if (!decisionsLoaded()) await loadDecisions();
  if (trashRoomFor(qs)) return null;
  return `Thùng rác đã đầy (tối đa ${TRASH_CAP} câu) nên CHƯA xoá câu nào. Mở màn Thùng rác để khôi phục hoặc xoá hẳn bớt, rồi thử lại.`;
}

/** Số câu còn thêm được vào thùng rác. */
export const trashFree = (): number => Math.max(0, TRASH_CAP - trashCount());

export type MoveManyResult =
  | { ok: true; moved: number }
  | { ok: false; why: 'full' | 'trash-write' | 'bank-write' | 'busy' | 'trash-readonly'; moved: 0; message: string; /** câu vẫn nằm trong thùng rác dù chưa xoá khỏi ngân hàng (hoàn tác thùng rác cũng lỗi) — không mất dữ liệu */ strayInTrash?: number };

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
  const ids = qs.map((q) => q.uid);
  return withLock<MoveManyResult>(ids, () => ({ ok: false, why: 'busy', moved: 0, message: BUSY_MSG }), async () => {
    if (!decisionsLoaded()) await loadDecisions();
    if (!isDecisionsWritable()) return { ok: false, why: 'trash-readonly', moved: 0, message: 'Không đọc được tệp Thùng rác nên CHƯA xoá câu nào (để không làm mất bản cứu hộ). Hãy tạo file sao lưu và kiểm tra tệp dữ liệu.' };
    if (!trashRoomFor(qs)) return { ok: false, why: 'full', moved: 0, message: `Thùng rác chỉ còn chỗ cho ${trashFree()} câu (tối đa ${TRASH_CAP}) nên CHƯA xoá câu nào.` };
    if (!(await trashAddMany(qs))) return { ok: false, why: 'trash-write', moved: 0, message: 'Không lưu được thùng rác nên CHƯA xoá câu nào.' };
    const r = await deleteMany(ids);
    if (r.ok) return { ok: true, moved: r.changed };
    const undone = await trashRemoveMany(ids);
    return { ok: false, why: 'bank-write', moved: 0, strayInTrash: undone ? undefined : ids.length, message: 'Không ghi được ngân hàng nên CHƯA xoá câu nào (mọi câu vẫn còn nguyên).' };
  });
}

export type UndoResult = { ok: true; restored: number; strayInTrash?: number } | { ok: false; message: string };

/**
 * Hoàn tác "Chuyển vào Thùng rác": đưa các câu về ngân hàng TRƯỚC (ghi một lần, kiểm tra), rồi mới gỡ khỏi thùng rác.
 * Nếu gỡ khỏi thùng rác lỗi thì câu nằm ở cả hai nơi (không mất) và có báo.
 */
export async function undoMoveToTrash(qs: readonly Question[]): Promise<UndoResult> {
  return withLock<UndoResult>(qs.map((q) => q.uid), () => ({ ok: false, message: BUSY_MSG }), async () => {
    const r = await restoreMany(qs);
    if (!r.ok) return { ok: false, message: 'Không ghi được ngân hàng nên CHƯA hoàn tác (các câu vẫn nằm trong Thùng rác, không mất).' };
    if (!(await trashRemoveMany(qs.map((q) => q.uid)))) return { ok: true, restored: r.changed, strayInTrash: qs.length };
    return { ok: true, restored: r.changed };
  });
}

// ---------- Khôi phục từ Thùng rác (ghi ngân hàng bền vững TRƯỚC, chỉ khi đó mới gỡ bản thùng rác) ----------

export type RestoreBlock = 'exists-same' | 'exists-different' | 'bad-location';

export const RESTORE_BLOCK_TEXT: Record<RestoreBlock, string> = {
  'exists-same': 'Câu này đã có trong Ngân hàng (giống hệt) — HEdu chưa ghi đè và chưa xoá bản trong Thùng rác.',
  'exists-different': 'Câu cùng mã đã có trong Ngân hàng nhưng nội dung KHÁC — cần xem lại, HEdu chưa ghi đè.',
  'bad-location': 'Vị trí cũ (lớp/chương/bài/dạng) không còn đúng trong cây chương trình — HEdu không tự gán chỗ khác.',
};

/** Vị trí của câu CÓ VẤN ĐỀ không (không còn trong cây hoặc không nhất quán). Thiếu Dạng thì chấp nhận như dữ liệu cũ. */
export function locationProblem(q: Question): boolean {
  const ix = indexOf(getTaxonomy());
  const c = ix.get(q.chapterId), l = ix.get(q.lessonId);
  if (!c || c.kind !== 'chapter' || !l || l.kind !== 'lesson' || l.chapter?.id !== q.chapterId || l.grade.grade !== q.grade) return true;
  if (q.formId) {
    const f = ix.get(q.formId);
    if (!f || f.kind !== 'form' || f.lesson?.id !== q.lessonId) return true;
  }
  return false;
}

export interface RestoreFromTrashResult {
  /** ngân hàng đã ghi bền vững (hoặc không có gì để ghi) */
  ok: boolean;
  why?: 'busy' | 'trash-readonly' | 'bank-write';
  message: string;
  /** đã đưa về Ngân hàng (số cũ → số mới nếu bị cấp lại) */
  restored: { uid: string; fromSeq: number; toSeq: number }[];
  /** CHƯA khôi phục, còn nguyên trong Thùng rác, kèm lý do */
  blocked: { uid: string; seq: number; reason: RestoreBlock }[];
  /** đã về Ngân hàng nhưng bản trong Thùng rác chưa gỡ được (tệp phụ không ghi) — không mất, chỉ thừa một bản */
  strayInTrash: string[];
}

/** Vì sao câu trong Thùng rác CHƯA khôi phục được (null = khôi phục được). `cur` = câu cùng uid đang có trong Ngân hàng (nếu có). */
export function restoreBlockOf(q: Question, cur: Question | undefined): RestoreBlock | null {
  if (cur) return same(cur, q) ? 'exists-same' : 'exists-different';
  return locationProblem(q) ? 'bad-location' : null;
}

const same = (a: Question, b: Question): boolean => a.latex === b.latex && a.level === b.level && a.type === b.type && a.formId === b.formId && a.lessonId === b.lessonId;

/**
 * Khôi phục các câu (theo uid) từ Thùng rác về Ngân hàng.
 * Cách chọn cho lô (D7): TÁCH "khôi phục được" / "cần xử lý": chỉ làm tập khôi phục được, còn lại giữ nguyên trong Thùng rác
 * và báo từng câu + lý do; không bao giờ âm thầm bỏ câu nào.
 * Thứ tự an toàn: ghi Ngân hàng (kiểm tra bền vững) → mới gỡ khỏi Thùng rác. Ngân hàng lỗi ⇒ giữ nguyên cả hai.
 */
export async function restoreFromTrash(uids: readonly string[], opts: { relocate?: { loc: Location; level?: Level } } = {}): Promise<RestoreFromTrashResult> {
  const empty = (over: Partial<RestoreFromTrashResult>): RestoreFromTrashResult => ({ ok: false, message: '', restored: [], blocked: [], strayInTrash: [], ...over });
  const ids = [...new Set(uids)];
  if (ids.length === 0) return empty({ ok: true, message: 'Không có câu nào để khôi phục.' });
  const rel = opts.relocate;
  // chọn vị trí mới chỉ dành cho MỘT câu, và vị trí phải đủ đường dẫn trong cây hiện hành
  if (rel && (ids.length !== 1 || !validNewLocation(indexOf(getTaxonomy()), rel.loc))) return empty({ message: 'Vị trí mới không hợp lệ (cần chọn đủ Lớp, Phân môn, Chương, Bài, Dạng). Chưa khôi phục gì.' });
  return withLock<RestoreFromTrashResult>(ids, () => empty({ why: 'busy', message: BUSY_MSG }), async () => {
    if (!decisionsLoaded()) await loadDecisions();
    if (!isDecisionsWritable()) return empty({ why: 'trash-readonly', message: 'Không đọc được tệp Thùng rác nên CHƯA khôi phục (để không làm mất bản cứu hộ). Hãy tạo file sao lưu và kiểm tra tệp dữ liệu.' });
    const inTrash = new Map(trashList().map((t) => [t.q.uid, t] as const));
    const bank = new Map(getState().questions.map((q) => [q.uid, q] as const));
    const go: Question[] = [];
    const blocked: RestoreFromTrashResult['blocked'] = [];
    for (const id of ids) {
      const rec = inTrash.get(id);
      if (!rec) continue;
      const q = rel ? relocated(rec.q, rel.loc, rel.level) : rec.q;
      const cur = bank.get(id);
      const why = restoreBlockOf(q, cur);
      if (why) blocked.push({ uid: id, seq: q.seq, reason: why });
      else go.push(q);
    }
    if (go.length === 0) return empty({ ok: true, blocked, message: blocked.length ? `Chưa khôi phục câu nào: ${blocked.length} câu cần xử lý (xem lý do từng câu).` : 'Không có câu nào trong Thùng rác khớp.' });
    const r = await restoreManyEx(go);
    if (!r.ok) return empty({ why: 'bank-write', blocked, message: 'Không lưu được Ngân hàng nên CHƯA khôi phục. Các câu vẫn nằm trong Thùng rác, chưa mất dữ liệu.' });
    const got = new Set(r.restored.map((x) => x.uid));
    // câu vừa bị chỗ khác thêm vào ngân hàng giữa chừng (hiếm) ⇒ không gỡ bản thùng rác của chúng
    for (const uid of r.existing) blocked.push({ uid, seq: inTrash.get(uid)!.q.seq, reason: 'exists-same' });
    const removed = await trashRemoveMany([...got]);
    const stray = removed ? [] : [...got];
    const renum = r.restored.filter((x) => x.fromSeq !== x.toSeq).length;
    let message = `Đã khôi phục ${got.size} câu về Ngân hàng${renum ? ` (${renum} câu đổi số thứ tự vì số cũ đã được dùng)` : ''}.`;
    if (stray.length) message += ' Nhưng chưa dọn được bản sao trong Thùng rác (không ghi được tệp) — không mất dữ liệu, bạn có thể dọn sau.';
    if (blocked.length) message += ` ${blocked.length} câu CHƯA khôi phục vì cần xử lý.`;
    return { ok: true, message, restored: r.restored, blocked, strayInTrash: stray };
  });
}

// ---------- Xoá hẳn khỏi Thùng rác (KHÔNG đụng Ngân hàng) ----------

export type PurgeResult = { ok: true; purged: number } | { ok: false; why: 'busy' | 'trash-readonly' | 'trash-write'; message: string };

/** Xoá vĩnh viễn các bản snapshot khỏi Thùng rác. Chỉ gỡ tệp phụ; không gọi bất kỳ hàm xoá nào của Ngân hàng. Ghi lỗi ⇒ giữ nguyên. */
export async function purgeFromTrash(uids: readonly string[]): Promise<PurgeResult> {
  const ids = [...new Set(uids)];
  if (ids.length === 0) return { ok: true, purged: 0 };
  return withLock<PurgeResult>(ids, () => ({ ok: false, why: 'busy', message: BUSY_MSG }), async () => {
    if (!decisionsLoaded()) await loadDecisions();
    if (!isDecisionsWritable()) return { ok: false, why: 'trash-readonly', message: 'Không đọc được tệp Thùng rác nên CHƯA xoá gì (để không làm mất dữ liệu).' };
    const have = new Set(trashList().map((t) => t.q.uid));
    const n = ids.filter((u) => have.has(u)).length;
    if (!(await trashRemoveMany(ids))) return { ok: false, why: 'trash-write', message: 'Chưa ghi được tệp nên các câu vẫn nằm trong Thùng rác.' };
    return { ok: true, purged: n };
  });
}

/** Dọn sạch cả Thùng rác (nút chủ động ở PR sau; không bao giờ tự chạy). */
export async function purgeAllTrash(): Promise<PurgeResult> {
  if (!decisionsLoaded()) await loadDecisions();
  return purgeFromTrash(trashList().map((t) => t.q.uid));
}
