// Xuất đề từng mã (PR 3): kiểu dữ liệu và lệnh Tauri. Phần nặng (biên dịch, ZIP, đối chiếu) ở Rust: src-tauri/src/examexport.rs.
import { invoke } from './platform';

export interface CodeInfo { code: string; hasMain: boolean; hasDe: boolean; counts: [number, number, number, number]; problem: string | null }
export interface CodesInfo { hasSpec: boolean; title: string; seed: number; codes: CodeInfo[]; problems: string[]; canBackfill: boolean; maxCodes: number }
export type PackKind = 'giao-vien' | 'hoc-sinh';
export interface ExportOpts { kind: PackKind; codes?: string[]; withSolution?: boolean; destDir: string }
export interface CodeResult { code: string; status: 'ok' | 'failed' | 'cancelled' | 'skipped'; message: string; pages: number | null; cached: boolean; sha256: string | null }
export interface ExportOut { ok: boolean; cancelled: boolean; zipPath: string | null; zipBytes: number | null; exportId: string; message: string; results: CodeResult[] }
export interface ExportProgress { id: string; phase: string; index: number; total: number; code: string }
export interface BackfillOut { applied: boolean; willCreate: string[]; skipped: string[]; message: string; /** đã đối chiếu được */ verified: string[]; /** chưa chứng minh được (nói thẳng) */ limits: string[] }

export const codesInfo = (id: string) => invoke<CodesInfo>('exam_codes_info', { id });
export const codesExport = (id: string, opts: ExportOpts) => invoke<ExportOut>('exam_codes_export', { id, opts });
/** Chỉ xuất Excel đáp án (mọi mã) vào thư mục đã chọn; trả đường dẫn tệp đã ghi (không ghi đè). */
export const answersXlsx = (id: string, destDir: string) => invoke<string>('exam_answers_xlsx', { id, destDir });
export const codesExportCancel = (id: string) => invoke<boolean>('exam_codes_export_cancel', { id });
export const codesBackfill = (id: string, apply: boolean) => invoke<BackfillOut>('exam_codes_backfill', { id, apply });

export const PACK_LABEL: Record<PackKind, string> = { 'giao-vien': 'Gói giáo viên', 'hoc-sinh': 'Gói học sinh' };
export const PACK_NOTE: Record<PackKind, string> = {
  'giao-vien': 'PDF đề từng mã, CSV đáp án riêng từng mã, Excel đáp án chung (theo mã đề và theo câu), nguồn LaTeX kèm tệp phụ thuộc để biên dịch lại, manifest.json (SHA-256, hạt giống). Có đáp án: KHÔNG phát cho học sinh.',
  'hoc-sinh': 'Chỉ có PDF đề của từng mã (chế độ Đề). Không có đáp án, lời giải, nguồn LaTeX hay manifest.',
};

const PHASE: Record<string, string> = { 'dich-de': 'Đang dịch PDF đề', 'dich-loigiai': 'Đang dịch PDF lời giải' };
export const phaseText = (p: ExportProgress): string => `${PHASE[p.phase] ?? p.phase} · mã ${p.code} (${p.index}/${p.total})`;

/** Mã đề nào dùng được ngay (có tệp chính riêng và đã đối chiếu khớp dữ liệu đã lưu). */
export const readyCodes = (i: CodesInfo): string[] => i.codes.filter((c) => c.hasMain && !c.problem).map((c) => c.code);

export interface Gate { ok: boolean; why?: string }
/** Điều kiện bấm Xuất: có mã được chọn, đã chọn thư mục, không quá giới hạn, mọi mã chọn đã sẵn sàng. */
export function exportGate(info: CodesInfo | null, chosen: readonly string[], dest: string | null, max = 24): Gate {
  if (!info || !info.hasSpec) return { ok: false, why: info?.problems[0] ?? 'Chưa đọc được dữ liệu mã đề.' };
  if (info.problems.length) return { ok: false, why: info.problems[0] };
  if (!chosen.length) return { ok: false, why: 'Chưa chọn mã đề nào.' };
  if (chosen.length > max) return { ok: false, why: `Mỗi lượt xuất tối đa ${max} mã đề.` };
  const bad = chosen.map((c) => info.codes.find((x) => x.code === c)).find((c) => !c || !c.hasMain || c.problem);
  if (bad) return { ok: false, why: bad.problem ?? `Mã ${bad.code} chưa có tệp chính riêng.` };
  if (!dest) return { ok: false, why: 'Chưa chọn thư mục lưu.' };
  return { ok: true };
}

/** Kết quả hiển thị cho người dùng: không bao giờ nói “đã xuất đủ” khi có mã lỗi hoặc đã dừng. */
export function summarize(o: ExportOut): string {
  if (o.ok) return `${o.message} ${o.zipPath ?? ''}`.trim();
  const bad = o.results.filter((r) => r.status === 'failed').map((r) => r.code);
  if (o.cancelled) return 'Đã dừng. Không tạo ZIP vì chưa đủ mã.';
  if (bad.length) return `KHÔNG tạo ZIP. Mã lỗi: ${bad.join(', ')}.`;
  return o.message || 'Không tạo được ZIP.';
}
