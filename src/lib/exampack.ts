// Xuất trọn gói nhiều đề: mỗi đề một thư mục con (PDF các bản đã dịch, ma trận, đáp án, gói HEdu) + "Danh mục.xlsx" ở thư mục gốc.
// Phần thuần (đặt tên, dựng danh mục) có kiểm thử; phần chạy gọi các lệnh sẵn có của Thư viện đề. Không ghi đè: trùng tên thì thêm -2, -3…
import { examCompileAll, pdfFileName, modeLabel, type ExamMode } from './examcompile';
import { answersXlsx, codesInfo } from './examexport';
import { chooseXlsxPath, exportPdfTo } from './exampdf';
import { bundleFolderName, examBundleExport, formatBytes, STATUS_LABEL, type ExamSummary } from './examlib';
import { matrixBook, parseMatrixSpec } from './exammatrix';
import { invoke } from './platform';
import type { Question, Taxonomy } from './types';
import { cellNum, cellText, saveXlsx, S_HEAD, S_LEFT, S_TITLE, type XBook } from './xlsxbook';

export interface PackOpts { pdf: boolean; matrix: boolean; answers: boolean; bundle: boolean }
export const DEFAULT_PACK_OPTS: PackOpts = { pdf: true, matrix: true, answers: true, bundle: false };

export interface PackFile { rel: string; kind: string; bytes: number | null; sha: string | null }
export interface PackExam {
  exam: ExamSummary; questions: number | null; codes: number | null; pages: number | null;
  folder: string; files: PackFile[]; notes: string[];
}

const slug = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'de';
/** Tên thư mục con của đề thứ `index` (từ 0): "01-De-giua-ky-1-Toan-12". */
export const packFolderName = (index: number, name: string): string => `${String(index + 1).padStart(2, '0')}-${slug(name)}`;
export const MATRIX_FILE = 'Ma-tran.xlsx';
export const CATALOG_FILE = 'Danh-muc.xlsx';

const join = (...p: string[]): string => {
  const sep = p[0].includes('\\') && !p[0].includes('/') ? '\\' : '/';
  return p.map((x, i) => (i === 0 ? x.replace(/[\\/]+$/, '') : x.replace(/^[\\/]+|[\\/]+$/g, ''))).join(sep);
};
const base = (p: string): string => p.split(/[\\/]/).pop() ?? p;

/** Câu mô tả những gì đã xuất cho một đề (cột "Tệp đã xuất"). */
export const filesSummary = (x: PackExam): string => (x.files.length ? x.files.map((f) => f.kind).join(', ') : 'không có tệp nào');

/** Sổ "Danh mục": trang 1 mỗi đề một dòng, trang 2 từng tệp (dung lượng, SHA-256 rút gọn). */
export function catalogBook(items: readonly PackExam[], meta: { at: string; dir: string }): XBook {
  const heads = ['STT', 'Tên đề', 'Lớp', 'Loại đề', 'Năm học', 'Trạng thái', 'Số câu', 'Số mã đề', 'Số trang (PDF)', 'Thư mục con', 'Tệp đã xuất', 'Ghi chú'];
  const rows = [
    [{ v: 'DANH MỤC XUẤT TRỌN GÓI — Thư viện đề HEdu', s: S_TITLE }],
    [{ v: `Xuất lúc ${meta.at} · ${items.length} đề · Thư mục: ${meta.dir}` }],
    [],
    heads.map((h) => cellText(h, S_HEAD)),
    ...items.map((x, i) => [
      cellNum(i + 1), cellText(x.exam.name, S_LEFT), cellNum(x.exam.metadata.grade ?? null), cellText(x.exam.metadata.examType ?? ''), cellText(x.exam.metadata.schoolYear ?? ''),
      cellText(STATUS_LABEL[x.exam.status]), cellNum(x.questions), cellNum(x.codes), cellNum(x.pages),
      cellText(x.folder, S_LEFT), cellText(filesSummary(x), S_LEFT), cellText(x.notes.join('; '), S_LEFT),
    ]),
  ];
  const frows = [
    ['Đề', 'Tệp', 'Loại tệp', 'Dung lượng', 'SHA-256 (8 ký tự đầu)'].map((h) => cellText(h, S_HEAD)),
    ...items.flatMap((x, i) => x.files.map((f) => [cellText(String(i + 1).padStart(2, '0')), cellText(`${x.folder}/${f.rel}`, S_LEFT), cellText(f.kind), cellText(f.bytes === null ? '—' : formatBytes(f.bytes)), cellText(f.sha ?? '—')])),
  ];
  return {
    sheets: [
      { name: 'Danh mục', rows, widths: [5, 36, 6, 14, 11, 12, 8, 9, 12, 28, 46, 30], freeze: [4, 2], landscape: true },
      { name: 'Tệp đã xuất', rows: frows, widths: [6, 62, 18, 12, 22], freeze: [1, 0] },
    ],
  };
}

export interface PackCtx { tax: Taxonomy; question(uid: string): Question | undefined; progress(done: number, total: number, name: string): void }
export interface PackResult { dir: string; catalog: string | null; items: PackExam[]; failed: { name: string; error: string }[] }

const info = async (path: string): Promise<{ bytes: number | null; sha: string | null }> => {
  try { const i = await invoke<{ bytes: number; sha: string }>('pack_file_info', { path }); return { bytes: i.bytes, sha: i.sha }; } catch { return { bytes: null, sha: null }; }
};
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Xuất từng đề vào thư mục con của `parent`. Một đề lỗi không làm dừng cả lô (ghi vào ghi chú và danh sách lỗi). */
export async function runPack(exams: readonly ExamSummary[], opts: PackOpts, parent: string, qn: ReadonlyMap<string, number>, ctx: PackCtx, now: Date): Promise<PackResult> {
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const root = await invoke<string>('pack_make_dir', { parent, name: `HEdu-xuat-${stamp}` });
  const items: PackExam[] = [];
  const failed: { name: string; error: string }[] = [];
  for (let i = 0; i < exams.length; i++) {
    const e = exams[i];
    ctx.progress(i, exams.length, e.name);
    const x: PackExam = { exam: e, questions: qn.get(e.id) ?? null, codes: null, pages: null, folder: packFolderName(i, e.name), files: [], notes: [] };
    items.push(x);
    try {
      const dir = await invoke<string>('pack_make_dir', { parent: root, name: x.folder });
      x.folder = base(dir);
      const add = async (path: string, kind: string) => { x.files.push({ rel: base(path), kind, ...(await info(path)) }); };
      if (opts.pdf) {
        const goods = await examCompileAll(e.id);
        if (!goods.length) x.notes.push('Chưa có PDF biên dịch');
        for (const g of goods) {
          const dest = join(dir, pdfFileName(g.mode as ExamMode, e.name));
          await exportPdfTo(e.id, dest, g.mode as ExamMode);
          await add(dest, `PDF ${modeLabel(g.mode).toLowerCase()}`);
          if (g.mode === 'de' || x.pages === null) x.pages = g.pages ?? x.pages;
        }
      }
      const specText = opts.matrix || opts.answers ? await invoke<string | null>('exam_spec_text', { id: e.id }) : null;
      const spec = specText ? parseMatrixSpec(specText) : null;
      if (spec) { x.codes = spec.codes; if (x.questions === null) x.questions = spec.rows.reduce((a, r) => a + r.count, 0); }
      if (opts.matrix) {
        if (!spec) x.notes.push('Soạn tay: không có ma trận');
        else { const p = await saveXlsx(join(dir, MATRIX_FILE), matrixBook(spec, { name: e.name, grade: e.metadata.grade, schoolYear: e.metadata.schoolYear, examType: e.metadata.examType }, ctx.tax, ctx.question)); await add(p, 'Ma trận (xlsx)'); }
      }
      if (opts.answers) {
        if (!spec) { if (!opts.matrix) x.notes.push('Soạn tay: không có đáp án theo mã đề'); }
        else if (!(await codesInfo(e.id)).hasSpec) x.notes.push('Thiếu thông tin mã đề để xuất đáp án');
        else await add(await answersXlsx(e.id, dir), 'Đáp án (xlsx)');
      }
      if (opts.bundle) { const p = await examBundleExport(e.id, dir, bundleFolderName(e.name)); x.files.push({ rel: base(p), kind: 'Gói HEdu', bytes: null, sha: null }); }
    } catch (err) {
      x.notes.push(`Lỗi: ${msg(err)}`);
      failed.push({ name: e.name, error: msg(err) });
    }
  }
  ctx.progress(exams.length, exams.length, '');
  let catalog: string | null = null;
  try {
    const at = now.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    catalog = await saveXlsx(join(root, CATALOG_FILE), catalogBook(items, { at, dir: root }));
  } catch (err) { failed.push({ name: 'Danh mục', error: msg(err) }); }
  return { dir: root, catalog, items, failed };
}


/** Xuất MỘT ma trận ra Excel qua hộp "Lưu thành". 'none' = đề soạn tay (không có ma trận); null = bạn huỷ. */
export async function exportMatrixXlsx(e: ExamSummary, tax: Taxonomy, question: (uid: string) => Question | undefined): Promise<string | 'none' | null> {
  const text = await invoke<string | null>('exam_spec_text', { id: e.id });
  const spec = text ? parseMatrixSpec(text) : null;
  if (!spec) return 'none';
  const dest = await chooseXlsxPath('Xuất ma trận đề ra Excel', `ma-tran_${slug(e.name).toLowerCase()}.xlsx`);
  if (!dest) return null;
  return saveXlsx(dest, matrixBook(spec, { name: e.name, grade: e.metadata.grade, schoolYear: e.metadata.schoolYear, examType: e.metadata.examType }, tax, question));
}
