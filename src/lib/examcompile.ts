// Biên dịch cả dự án đề thành PDF (E2a): kiểu dữ liệu khớp Rust `examcompile.rs`, gọi lệnh và hàm thuần để hiển thị kết quả.
// Chế độ đề/lời giải riêng chưa có (E5): mọi PDF là "nguyên văn" (chưa xác định, có thể chứa lời giải).
import { invoke } from './platform';

export type Engine = 'pdflatex' | 'xelatex' | 'lualatex';
export const ENGINES: { id: Engine; label: string }[] = [
  { id: 'pdflatex', label: 'pdfLaTeX' },
  { id: 'xelatex', label: 'XeLaTeX' },
  { id: 'lualatex', label: 'LuaLaTeX' },
];

export interface CompileOpts { engine?: Engine; timeoutSecs?: number; runs?: number; texBin?: string; force?: boolean }
export interface Diag { severity: 'error' | 'warning'; file: string | null; line: number | null; inProject: boolean; message: string; context: string[] }
export interface GoodInfo { fingerprint: string; engine: string; mode: string; texVersion: string; pages: number | null; bytes: number; at: string; pdfPath: string }
export type CompileStatus = 'ok' | 'failed' | 'timeout' | 'cancelled' | 'no-tex';
export interface CompileOut {
  status: CompileStatus; message: string; published: boolean; cached: boolean; invalidPdf: boolean; keptPrevious: boolean;
  pages: number | null; runs: number; ms: number; engine: string; texVersion: string; fingerprint: string; mode: string;
  diagnostics: Diag[]; errorCount: number; warningCount: number; warnings: string[]; rawLog: string; lastGood: GoodInfo | null; treeGuard: boolean;
}

export const examCompile = (id: string, opts: CompileOpts) => invoke<CompileOut>('exam_compile', { id, opts });
export const examCompileCancel = (id: string) => invoke<boolean>('exam_compile_cancel', { id });
export const examCompileLast = (id: string) => invoke<GoodInfo | null>('exam_compile_last', { id });

export const RAW_MODE_NOTE = 'PDF biên dịch nguyên văn: HEdu chưa xác định đây là bản ĐỀ hay bản LỜI GIẢI, nên có thể chứa lời giải. Đừng phát cho học sinh khi chưa xem lại.';

export type Tone = 'ok' | 'warn' | 'bad';
/** Câu tóm tắt và mức độ để tô màu; mọi trạng thái không phải thành công đều KHÔNG được hiện như thành công. */
export function summarize(o: CompileOut): { text: string; tone: Tone } {
  switch (o.status) {
    case 'ok': return { text: o.message, tone: o.warnings.length || o.warningCount ? 'warn' : 'ok' };
    case 'no-tex': return { text: o.message, tone: 'bad' };
    case 'cancelled': return { text: o.message, tone: 'warn' };
    default: return { text: o.message, tone: 'bad' };
  }
}

export interface DiagGroup { file: string | null; inProject: boolean; items: Diag[] }

/** Nhóm theo tệp (lỗi trước cảnh báo, theo dòng). Mục không nêu tệp nằm cuối nhóm "Không rõ tệp". */
export function groupDiagnostics(ds: readonly Diag[]): DiagGroup[] {
  const m = new Map<string, DiagGroup>();
  for (const d of ds) {
    const k = d.file ?? '';
    let g = m.get(k);
    if (!g) { g = { file: d.file, inProject: d.inProject, items: [] }; m.set(k, g); }
    g.items.push(d);
  }
  const rank = (d: Diag) => (d.severity === 'error' ? 0 : 1);
  for (const g of m.values()) g.items.sort((a, b) => rank(a) - rank(b) || (a.line ?? 0) - (b.line ?? 0));
  return [...m.values()].sort((a, b) => (a.file === null ? 1 : 0) - (b.file === null ? 1 : 0) || (a.file ?? '').localeCompare(b.file ?? ''));
}

/** Chỉ cho "nhảy tới dòng" khi chắc chắn tệp nằm trong dự án và có số dòng. */
export const canJump = (d: Diag): boolean => d.inProject && !!d.file && d.line !== null && d.line > 0;
