// Thư viện đề thi (E1): kiểu dữ liệu khớp Rust `examlib.rs`, gọi lệnh và hàm thuần để lọc/sắp xếp/mô tả.
// Nhập = sao chép vào thư viện HEdu; tệp gốc ngoài không bị đụng. Thiết kế: claude/thiet-ke-de-thi.md.
import { invoke } from './platform';

export interface ExamMeta { grade?: number | null; schoolYear?: string | null; examType?: string | null; tags: string[] }
export type ExamKind = 'single' | 'multi';
export type ExamStatus = 'draft' | 'needs_review' | 'finalized';

export interface ExamSummary {
  id: string; name: string; kind: ExamKind; mainFile: string | null; status: ExamStatus;
  createdAt: string; updatedAt: string; fileCount: number; totalBytes: number;
  warningCount: number; skippedCount: number; metadata: ExamMeta;
}
export interface ExamSkip { rel: string; reason: string }
export interface ExamScan {
  kind: ExamKind; name: string; files: { rel: string; bytes: number }[]; totalBytes: number;
  candidates: string[]; mainFile: string | null; skipped: ExamSkip[]; warnings: string[]; truncated: boolean;
}
export interface ExamManifest extends Omit<ExamSummary, 'id' | 'fileCount' | 'totalBytes' | 'warningCount' | 'skippedCount'> {
  projectId: string; source: { mode: string; originalPathDisplay: string; fingerprint: string }; files: { rel: string; bytes: number; sha256: string }[]; skipped: ExamSkip[]; warnings: string[];
}
export interface ExamVerify { ok: boolean; missing: string[]; changed: string[]; extra: string[]; blocked: string[] }

export const examScan = (path: string) => invoke<ExamScan>('exam_lib_scan', { path });
export const examImport = (path: string, name: string, main: string | null) => invoke<ExamSummary>('exam_lib_import', { path, name, main });
export const examCreate = (name: string) => invoke<ExamSummary>('exam_lib_create', { name });
export const examList = () => invoke<ExamSummary[]>('exam_lib_list');
export const examGet = (id: string) => invoke<ExamManifest>('exam_lib_get', { id });
export const examVerify = (id: string) => invoke<ExamVerify>('exam_lib_verify', { id });

// ---------- hàm thuần ----------

export const KIND_LABEL: Record<ExamKind, string> = { single: 'Một tệp .tex', multi: 'Nhiều tệp' };
export const STATUS_LABEL: Record<ExamStatus, string> = { draft: 'Đang soạn', needs_review: 'Cần rà soát', finalized: 'Đã chốt' };

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export interface ExamFilter { text: string; kind: ExamKind | 'all'; status: ExamStatus | 'all' }
export const DEFAULT_EXAM_FILTER: ExamFilter = { text: '', kind: 'all', status: 'all' };

/** Lọc theo chữ (tên, tệp chính, nhãn, năm học, lớp — không phân biệt dấu/hoa thường), loại dự án, trạng thái. */
export function filterExams(list: readonly ExamSummary[], f: ExamFilter): ExamSummary[] {
  const q = fold(f.text.trim());
  return list.filter((e) => {
    if (f.kind !== 'all' && e.kind !== f.kind) return false;
    if (f.status !== 'all' && e.status !== f.status) return false;
    if (!q) return true;
    const hay = fold([e.name, e.mainFile ?? '', e.metadata.schoolYear ?? '', e.metadata.examType ?? '', e.metadata.grade ? `lop ${e.metadata.grade}` : '', ...e.metadata.tags].join(' '));
    return hay.includes(q);
  });
}

export type ExamSort = 'updated' | 'name' | 'created';
export const SORT_LABEL: Record<ExamSort, string> = { updated: 'Sửa gần nhất', name: 'Tên A→Z', created: 'Mới nhập' };

export function sortExams(list: readonly ExamSummary[], mode: ExamSort): ExamSummary[] {
  const a = [...list];
  const byName = (x: ExamSummary, y: ExamSummary) => x.name.localeCompare(y.name, 'vi', { numeric: true, sensitivity: 'base' });
  if (mode === 'name') return a.sort(byName);
  const key = mode === 'created' ? 'createdAt' : 'updatedAt';
  return a.sort((x, y) => (y[key] < x[key] ? -1 : y[key] > x[key] ? 1 : byName(x, y)));
}

/** Dự án chưa chọn được tệp chính (nhiều ứng viên hoặc không có \documentclass) ⇒ người dùng phải chọn trước khi biên dịch (E2). */
export const needsMainChoice = (s: Pick<ExamScan, 'kind' | 'mainFile' | 'candidates'>): boolean => s.kind === 'multi' && !s.mainFile;

/** Các dòng tóm tắt bằng tiếng Việt cho hộp xác nhận nhập. */
export function describeScan(s: ExamScan): string[] {
  const out = [`${s.kind === 'single' ? 'Một tệp .tex' : `Thư mục ${s.files.length} tệp`}, ${formatBytes(s.totalBytes)}.`];
  if (s.kind === 'multi') {
    if (s.mainFile) out.push(`Tệp chính tìm được: ${s.mainFile}.`);
    else if (s.candidates.length > 1) out.push(`Có ${s.candidates.length} tệp có thể là tệp chính. Hãy chọn một.`);
    else out.push('Không tìm thấy tệp nào có \\documentclass. Hãy chọn tệp chính (hoặc nhập rồi chọn sau).');
  }
  if (s.skipped.length) out.push(`${s.skipped.length} mục KHÔNG được chép (xem danh sách bên dưới).`);
  out.push(...s.warnings);
  return out;
}

export function dateText(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ---------- hộp chọn tệp của Windows ----------
type Dlg = { open?(o: { title?: string; directory?: boolean; multiple?: boolean; filters?: { name: string; extensions: string[] }[] }): Promise<string | string[] | null> };
const dlg = (): Dlg | undefined => (typeof window !== 'undefined' ? (window.__TAURI__?.dialog as Dlg | undefined) : undefined);
const one = (r: string | string[] | null | undefined): string | null => (r == null ? null : Array.isArray(r) ? r[0] ?? null : r);

export async function chooseTexFile(): Promise<string | null> {
  const d = dlg();
  return d?.open ? one(await d.open({ title: 'Chọn tệp đề .tex', multiple: false, directory: false, filters: [{ name: 'File LaTeX (.tex)', extensions: ['tex'] }] })) : null;
}
export async function chooseProjectFolder(): Promise<string | null> {
  const d = dlg();
  return d?.open ? one(await d.open({ title: 'Chọn thư mục dự án đề', multiple: false, directory: true })) : null;
}
