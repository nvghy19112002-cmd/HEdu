// Ma trận theo TỪNG CÂU (kiểu TIAD) cho màn Tạo đề — hàm thuần, có kiểm thử.
// Mỗi câu của đề là một dòng ma trận số câu = 1 (một "ô câu"): Câu 1 … Câu N của từng phần, mỗi ô có phạm vi (lớp/chương/bài/dạng),
// loại câu, mức độ và (nếu giáo viên tự chọn) đúng một câu đã khóa. Nhờ vậy vẫn dùng nguyên bộ phân bổ, khóa câu, mẫu ma trận, xuất đề.
import { partOf, type PartKey, type Row } from './examgen';
import { cellId } from './examgrid';
import type { Level, QType } from './types';

export const PART_TYPE: Record<PartKey, QType> = { p1: 'tn', p2: 'ds', p3: 'tln', p4: 'tl' };
export type Form = Record<PartKey, number>;
/** Cấu trúc đề tốt nghiệp THPT từ 2025: 12 trắc nghiệm, 4 đúng/sai, 6 trả lời ngắn. */
export const FORM_THPT: Form = { p1: 12, p2: 4, p3: 6, p4: 0 };
export const MAX_PER_PART = 60;

/** Tách dòng nhiều câu thành các ô 1 câu (giữ thứ tự, chia câu khóa lần lượt cho từng ô); bỏ dòng 0 câu. */
export function expandRows(rows: readonly Row[], locked: Readonly<Record<string, readonly string[]>>, newId: () => string): { rows: Row[]; locked: Record<string, string[]>; changed: boolean } {
  const changed = rows.some((r) => r.count !== 1 || (locked[r.id]?.length ?? 0) > 1);
  if (!changed) return { rows: [...rows], locked: Object.fromEntries(Object.entries(locked).filter(([k, v]) => v.length && rows.some((r) => r.id === k)).map(([k, v]) => [k, [...v]])), changed };
  const out: Row[] = [];
  const lk: Record<string, string[]> = {};
  for (const r of rows) {
    const mine = [...(locked[r.id] ?? [])];
    if (r.count === 1 && mine.length <= 1) { out.push(r); if (mine.length) lk[r.id] = mine; continue; }
    // ô 1 câu mà có nhiều câu khóa (dữ liệu cũ): tách thêm ô để không mất câu khóa nào
    const n = Math.max(r.count, mine.length);
    for (let i = 0; i < n; i++) {
      const id = i === 0 ? r.id : newId();
      out.push({ ...r, id, count: 1 });
      if (mine[i]) lk[id] = [mine[i]];
    }
  }
  return { rows: out, locked: lk, changed };
}

/** Các ô của một phần theo thứ tự (Câu 1, Câu 2, …). */
export const partSlots = (rows: readonly Row[], p: PartKey): Row[] => rows.filter((r) => partOf(r.type) === p);
export const formOf = (rows: readonly Row[]): Form => ({ p1: partSlots(rows, 'p1').length, p2: partSlots(rows, 'p2').length, p3: partSlots(rows, 'p3').length, p4: partSlots(rows, 'p4').length });
export const sameForm = (a: Form, b: Form): boolean => a.p1 === b.p1 && a.p2 === b.p2 && a.p3 === b.p3 && a.p4 === b.p4;

/**
 * Đặt số câu của một phần: thêm ô ở cuối (lấy phạm vi + mức của ô cuối cùng trong phần, hoặc `scope` mặc định), hoặc bỏ bớt ô ở cuối.
 * Trả về danh sách mới và các id ô bị bỏ (để gỡ khóa).
 */
export function setPartCount(rows: readonly Row[], p: PartKey, n: number, fallback: Row['scope'], newId: () => string): { rows: Row[]; removed: string[] } {
  const want = Math.max(0, Math.min(MAX_PER_PART, Math.round(n) || 0));
  const mine = partSlots(rows, p);
  if (want === mine.length) return { rows: [...rows], removed: [] };
  if (want < mine.length) {
    const drop = new Set(mine.slice(want).map((r) => r.id));
    return { rows: rows.filter((r) => !drop.has(r.id)), removed: [...drop] };
  }
  const last = mine[mine.length - 1];
  const type = PART_TYPE[p];
  // phần trắc nghiệm mới tinh: chia mức như đề 2025 (khoảng 5 NB : 4 TH : 3 VD); các phần khác “Mọi mức”
  const fresh = (i: number, n: number): Level | 'any' => (type !== 'tn' ? 'any' : i < Math.round((n * 5) / 12) ? 'NB' : i < Math.round((n * 9) / 12) ? 'TH' : 'VD');
  const add: Row[] = Array.from({ length: want - mine.length }, (_, i) => ({ id: newId(), scope: last ? last.scope : fallback, type, level: last ? last.level : fresh(i, want), count: 1 }));
  // chèn ngay sau ô cuối của phần (giữ các phần theo thứ tự I → IV)
  const out = [...rows];
  const at = last ? out.indexOf(last) + 1 : out.findIndex((r) => partOf(r.type) > p);
  out.splice(at < 0 ? out.length : at, 0, ...add);
  return { rows: out, removed: [] };
}

/** Đặt cả cấu trúc đề (vd Form THPT). */
export function applyForm(rows: readonly Row[], f: Form, fallback: Row['scope'], newId: () => string): { rows: Row[]; removed: string[] } {
  let cur: Row[] = [...rows];
  const removed: string[] = [];
  for (const p of ['p1', 'p2', 'p3', 'p4'] as PartKey[]) { const r = setPartCount(cur, p, f[p], fallback, newId); cur = r.rows; removed.push(...r.removed); }
  return { rows: cur, removed };
}

/** Sửa nhiều ô một lúc (phạm vi, mức độ). Ô đổi phạm vi/mức thì câu đã khóa không còn hợp lệ ⇒ trả về để gỡ khóa. */
export function patchSlots(rows: readonly Row[], ids: ReadonlySet<string>, patch: Partial<Pick<Row, 'scope' | 'level'>>): { rows: Row[]; touched: string[] } {
  const touched: string[] = [];
  const out = rows.map((r) => {
    if (!ids.has(r.id)) return r;
    const next: Row = { ...r, ...patch };
    if (patch.scope) { delete next.flag; delete next.label; }
    if (JSON.stringify(next.scope) !== JSON.stringify(r.scope) || next.level !== r.level || next.flag !== r.flag) touched.push(r.id);
    return next;
  });
  return { rows: out, touched };
}

/** Đổi chỗ một ô lên/xuống trong phần của nó. */
export function moveSlot(rows: readonly Row[], id: string, dir: -1 | 1): Row[] {
  const r = rows.find((x) => x.id === id);
  if (!r) return [...rows];
  const mine = partSlots(rows, partOf(r.type));
  const k = mine.indexOf(r), j = k + dir;
  if (j < 0 || j >= mine.length) return [...rows];
  const out = [...rows];
  const a = out.indexOf(mine[k]), b = out.indexOf(mine[j]);
  [out[a], out[b]] = [out[b], out[a]];
  return out;
}

// ---------- lưới theo Dạng × mức (nhập nhanh) trên các ô ----------
/** Số ô theo (Dạng, loại, mức) — khoá cellId như lưới cũ. */
export function gridCounts(rows: readonly Row[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) if (r.scope.kind === 'form' && r.level !== 'any') { const k = cellId(r.scope.id, r.type, r.level); m.set(k, (m.get(k) ?? 0) + r.count); }
  return m;
}
/** Đặt số câu cho một ô lưới: thêm/bớt ô câu có đúng phạm vi Dạng + loại + mức đó (bớt từ cuối). */
export function setGridCell(rows: readonly Row[], formId: string, type: QType, level: Level, n: number, newId: () => string): { rows: Row[]; removed: string[] } {
  const want = Math.max(0, Math.min(MAX_PER_PART, Math.round(n) || 0));
  const match = (r: Row) => r.scope.kind === 'form' && r.scope.id === formId && r.type === type && r.level === level;
  const mine = rows.filter(match);
  if (want <= mine.length) {
    const drop = new Set(mine.slice(want).map((r) => r.id));
    return { rows: rows.filter((r) => !drop.has(r.id)), removed: [...drop] };
  }
  const add: Row[] = Array.from({ length: want - mine.length }, () => ({ id: newId(), scope: { kind: 'form', id: formId }, type, level, count: 1 }));
  const p = partOf(type);
  const lastOfPart = [...rows].reverse().find((r) => partOf(r.type) === p);
  const out = [...rows];
  const at = lastOfPart ? out.indexOf(lastOfPart) + 1 : out.findIndex((r) => partOf(r.type) > p);
  out.splice(at < 0 ? out.length : at, 0, ...add);
  return { rows: out, removed: [] };
}

// ---------- thống kê, độ khó ----------
export interface LevelStats { NB: number; TH: number; VD: number; VDC: number; unknown: number; total: number; easyPct: number; hardPct: number; /** 0–10 */ difficulty: number }
/** Thống kê mức độ của đề: dùng mức của câu đã chọn, nếu ô chưa có câu thì dùng mức yêu cầu của ô. */
export function levelStats(levels: readonly (Level | 'any' | null | undefined)[]): LevelStats {
  const s: LevelStats = { NB: 0, TH: 0, VD: 0, VDC: 0, unknown: 0, total: levels.length, easyPct: 0, hardPct: 0, difficulty: 0 };
  for (const l of levels) if (l === 'NB' || l === 'TH' || l === 'VD' || l === 'VDC') s[l]++; else s.unknown++;
  const known = s.total - s.unknown;
  if (known) {
    s.easyPct = Math.round(((s.NB + s.TH) / known) * 100);
    s.hardPct = 100 - s.easyPct;
    s.difficulty = Math.round((((s.NB * 1 + s.TH * 2 + s.VD * 3 + s.VDC * 4) / known - 1) / 3) * 100) / 10;
  }
  return s;
}
export const difficultyLabel = (d: number): string => (d < 2.5 ? 'Dễ' : d < 4.5 ? 'Vừa sức' : d < 6.5 ? 'Khá khó' : 'Khó');
