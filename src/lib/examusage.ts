// PR 4B: tránh dùng lại câu đã dùng. Dữ liệu DẪN XUẤT từ các đề đang hoạt động trong Thư viện (Rust: examusage.rs), không có kho riêng.
// Ở đây là hàm thuần: phạm vi (D8), UID đáng tin (D6), danh sách tránh, thống kê thiếu câu, dấu vết ghi vào hedu-de.json. Không sửa ngân hàng.
import { invoke } from './platform';
import type { Row } from './examgen';

export type UsageSource = 'spec' | 'sources' | 'both' | 'none';
export interface UsageProject {
  id: string; name: string; folder: string | null; schoolYear: string | null; examType: string | null; updatedAt: string;
  source: UsageSource; uids: string[]; missing: number; note: string | null;
}
export interface UsageScan { projects: UsageProject[] }
export const scanUsage = () => invoke<UsageScan>('exam_usage_scan');

/** Phạm vi tránh câu đã dùng. Mặc định TẮT. */
export interface UsageScope { on: boolean; folders: string[]; years: string[]; types: string[]; ids: string[] }
export const defaultScope = (): UsageScope => ({ on: false, folders: [], years: [], types: [], ids: [] });

/** Giáo viên đã xác nhận cho dùng lại một câu đã dùng: uid → lúc xác nhận và các đề đã dùng nó (để lưu dấu vết trong đề). */
export type ReuseOk = Record<string, { at: number; from: string[] }>;

export const hasCriteria = (s: UsageScope): boolean => s.folders.length > 0 || s.years.length > 0 || s.types.length > 0;

/** Thư mục chọn gồm cả thư mục con ("Lớp 12" gồm "Lớp 12/Học kỳ 1"). */
const inFolder = (folder: string | null, f: string): boolean => folder === f || (folder !== null && folder.startsWith(f + '/'));

/**
 * Các đề được đối chiếu. Logic kết hợp (hiển thị nguyên văn cho giáo viên):
 * (thư mục HOẶC…) VÀ (năm học HOẶC…) VÀ (loại đề HOẶC…) — chỉ tính tiêu chí đã chọn — rồi HỢP với các đề chọn riêng.
 * Tắt hoặc chưa chọn gì ⇒ không đề nào.
 */
export function matchedProjects(all: readonly UsageProject[], s: UsageScope): UsageProject[] {
  if (!s.on) return [];
  const ids = new Set(s.ids);
  const crit = hasCriteria(s);
  return all.filter((p) => ids.has(p.id) || (crit
    && (!s.folders.length || s.folders.some((f) => inFolder(p.folder, f)))
    && (!s.years.length || (p.schoolYear !== null && s.years.includes(p.schoolYear)))
    && (!s.types.length || (p.examType !== null && s.types.includes(p.examType)))));
}

/** Giải thích logic kết hợp bằng tiếng Việt cho giao diện. */
export function describeScope(s: UsageScope, nameOf: (id: string) => string = (x) => x): string {
  if (!s.on) return 'Không tránh câu đã dùng.';
  const parts: string[] = [];
  if (s.folders.length) parts.push(`thư mục ${s.folders.map((f) => `“${f}”`).join(' hoặc ')}`);
  if (s.years.length) parts.push(`năm học ${s.years.join(' hoặc ')}`);
  if (s.types.length) parts.push(`loại đề ${s.types.join(' hoặc ')}`);
  const crit = parts.join(' VÀ ');
  const picked = s.ids.length ? `đề chọn riêng: ${s.ids.map(nameOf).join(', ')}` : '';
  if (crit && picked) return `Các đề thuộc ${crit}, cộng thêm ${picked}.`;
  if (crit) return `Các đề thuộc ${crit}.`;
  if (picked) return `Chỉ ${picked}.`;
  return 'Chưa chọn đề nào để đối chiếu.';
}

export interface UsageIndex {
  /** uid → các đề (trong phạm vi) đã dùng câu đó */
  used: Map<string, UsageProject[]>;
  matched: UsageProject[];
  /** đề trong phạm vi không có UID đáng tin ⇒ "chưa thể đối chiếu đầy đủ" (D6), KHÔNG coi là chưa dùng */
  unverifiable: UsageProject[];
  /** đề trong phạm vi có câu trong sổ nguồn không còn thấy trong tệp đề (vẫn tính đã dùng) */
  withMissing: UsageProject[];
}

export function buildIndex(all: readonly UsageProject[], s: UsageScope): UsageIndex {
  const matched = matchedProjects(all, s);
  const used = new Map<string, UsageProject[]>();
  for (const p of matched) for (const u of p.uids) { const a = used.get(u); if (a) a.push(p); else used.set(u, [p]); }
  return { used, matched, unverifiable: matched.filter((p) => p.source === 'none'), withMissing: matched.filter((p) => p.missing > 0) };
}

/** Tập UID máy phải tránh: câu đã dùng trong phạm vi, trừ câu giáo viên đã xác nhận cho dùng lại. */
export function avoidSet(idx: UsageIndex, reuse: Readonly<ReuseOk>): Set<string> {
  const out = new Set<string>();
  for (const u of idx.used.keys()) if (!reuse[u]) out.add(u);
  return out;
}

/** Tên các đề đã dùng một câu (rút gọn) để hiện nhãn "Đã dùng ở: …". */
export const usedAtLabel = (idx: UsageIndex, uid: string, max = 3): string | null => {
  const ps = idx.used.get(uid);
  if (!ps?.length) return null;
  const names = ps.slice(0, max).map((p) => p.name);
  return names.join('; ') + (ps.length > max ? ` … (+${ps.length - max})` : '');
};

/**
 * Các câu bị loại khỏi một dòng vì đã dùng (đủ điều kiện và khớp dòng, đang nằm trong `avoid`): để báo số lượng, đề nghị dùng lại có chủ đích.
 * `match` là bộ lọc khớp dòng + đủ điều kiện do màn hình truyền vào (giữ nguyên chính sách đang chọn, không nới).
 */
export function avoidedFor<Q extends { uid: string }>(bank: readonly Q[], row: Row, avoid: ReadonlySet<string>, match: (q: Q, r: Row) => boolean): Q[] {
  return avoid.size ? bank.filter((q) => avoid.has(q.uid) && match(q, row)) : [];
}

/** Dấu vết ghi trong hedu-de.json khi giáo viên bật tính năng. Không ghi gì khi tắt. */
export function traceOf(s: UsageScope, idx: UsageIndex, reuse: Readonly<ReuseOk>, at: string): unknown {
  if (!s.on) return undefined;
  return {
    tao: at,
    phamVi: { thuMuc: s.folders, namHoc: s.years, loaiDe: s.types, deChon: s.ids },
    soDeDoiChieu: idx.matched.length,
    deChuaDoiChieuDuoc: idx.unverifiable.map((p) => p.id),
    giaoVienChoDungLai: Object.entries(reuse).map(([uid, r]) => ({ uid, luc: r.at, daDungO: r.from })),
  };
}
