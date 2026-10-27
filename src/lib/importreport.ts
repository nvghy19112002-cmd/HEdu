// Báo cáo nhập: tổng hợp kết quả một lô nhập để hiện, lưu .csv/.md và giữ trong "Nhật ký nhập".
// Thuần dữ liệu: KHÔNG chứa nội dung câu hỏi (chỉ tên tệp, dòng, quyết định, lý do, ID, số thứ tự).
import { invoke, isDesktop } from './platform';
import { getStorageMode } from './storage';
import type { IdState } from './importid';

export type RowDecision = 'import' | 'skip-dup' | 'skip-user';
/** 'dung-ma' là giá trị cũ (nhật ký trước PR 1B): ID theo tệp, chưa được kiểm chứng. */
export type IdPlace = 'dung-ma' | 'ma-khop' | 'ma-chua-kiem-chung' | 'ma-giu-tay' | 'ma-cho' | 'dang-dau' | 'ai' | 'vi-tri-chung';

export interface ReportRow {
  file: string;
  rel: string;
  line: number;
  decision: RowDecision;
  /** lý do bỏ qua / trạng thái dò trùng (tiếng Việt, ngắn) */
  reason: string;
  idState: IdState;
  idPlace?: IdPlace;
  /** mức lỗi xem trước: loi | canh | '' */
  preview: 'loi' | 'canh' | '';
  /** biên dịch TeX Live (nếu đã chạy): ok | loi | '' */
  tex: 'ok' | 'loi' | '';
  uid?: string;
  seq?: number;
}

export interface FileStat { file: string; rel: string; found: number; imported: number; skipped: number }
/** `unverified`/`kept` có từ PR 1B (vắng ở nhật ký cũ): trong số `ok`, bao nhiêu câu ID chưa kiểm chứng / bao nhiêu câu bất đồng mà giáo viên giữ ID. */
export interface IdStat { ok: number; firstForm: number; ai: number; general: number; unverified?: number; kept?: number; queued?: number }
export interface ImportReport {
  v: 1;
  at: number;
  /** tên lô (nhãn "Lô: …") */
  name: string;
  /** nhãn "Lô: …" đã gắn vào các câu (để lọc trong Ngân hàng); vắng = không gắn */
  batchTag?: string;
  paste: boolean;
  found: number;
  imported: number;
  skippedDup: number;
  skippedUser: number;
  ids: IdStat;
  /** điểm khôi phục đã chụp trước khi nhập (chỉ có ở chế độ SQLite) */
  restorePoint: boolean;
  texChecked: number;
  texFailed: number;
  previewErrors: number;
  previewWarnings: number;
  warnings: string[];
  files: FileStat[];
  rows: ReportRow[];
}

export const DECISION_TEXT: Record<RowDecision, string> = { import: 'Đã nhập', 'skip-dup': 'Bỏ qua (nghi trùng)', 'skip-user': 'Bỏ qua (bạn chọn)' };
export const ID_STATE_TEXT: Record<IdState, string> = { ok: 'Có ID đủ', 'thieu-dang': 'ID thiếu Dạng', 'khong-hop-le': 'ID không hợp lệ', 'khong-co': 'Không có ID' };
export const ID_PLACE_TEXT: Record<IdPlace, string> = { 'dung-ma': 'Theo mã ID', 'ma-khop': 'Theo mã ID (khớp ngân hàng)', 'ma-chua-kiem-chung': 'Theo mã ID (chưa kiểm chứng)', 'ma-giu-tay': 'Giữ mã ID (bạn chọn, bất đồng ngân hàng)', 'ma-cho': 'Chờ xác minh (ID bất đồng ngân hàng, giữ ID gốc)', 'dang-dau': 'Dạng đầu của Bài', ai: 'Gợi ý đã chọn', 'vi-tri-chung': 'Vị trí chung' };

export function buildReport(input: { at: number; name: string; batchTag?: string; paste: boolean; restorePoint: boolean; rows: ReportRow[]; warnings?: string[] }): ImportReport {
  const rows = input.rows;
  const byFile = new Map<string, FileStat>();
  for (const r of rows) {
    const k = `${r.rel}\u0000${r.file}`;
    const s = byFile.get(k) ?? { file: r.file, rel: r.rel, found: 0, imported: 0, skipped: 0 };
    s.found++;
    if (r.decision === 'import') s.imported++; else s.skipped++;
    byFile.set(k, s);
  }
  const ids: IdStat = { ok: 0, firstForm: 0, ai: 0, general: 0, unverified: 0, kept: 0, queued: 0 };
  for (const r of rows) {
    if (r.decision !== 'import') continue;
    if (r.idPlace === 'vi-tri-chung') ids.general++;
    else if (r.idPlace === 'ai') ids.ai++;
    else if (r.idPlace === 'dang-dau') ids.firstForm++;
    else { ids.ok++; if (r.idPlace === 'ma-chua-kiem-chung') ids.unverified!++; else if (r.idPlace === 'ma-giu-tay') ids.kept!++; else if (r.idPlace === 'ma-cho') ids.queued!++; }
  }
  const imp = rows.filter((r) => r.decision === 'import');
  return {
    v: 1,
    at: input.at,
    name: input.name,
    ...(input.batchTag ? { batchTag: input.batchTag } : {}),
    paste: input.paste,
    found: rows.length,
    imported: imp.length,
    skippedDup: rows.filter((r) => r.decision === 'skip-dup').length,
    skippedUser: rows.filter((r) => r.decision === 'skip-user').length,
    ids,
    restorePoint: input.restorePoint,
    texChecked: rows.filter((r) => r.tex).length,
    texFailed: rows.filter((r) => r.tex === 'loi').length,
    previewErrors: imp.filter((r) => r.preview === 'loi').length,
    previewWarnings: imp.filter((r) => r.preview === 'canh').length,
    warnings: input.warnings ?? [],
    files: [...byFile.values()],
    rows,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
export function whenText(at: number): string {
  const d = new Date(at);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** Tên tệp an toàn cho Windows, vd "bao-cao-nhap-20261025-0930". */
export function reportFileBase(at: number): string {
  const d = new Date(at);
  return `bao-cao-nhap-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/** Ô CSV: bọc nháy kép; chặn ô bị Excel hiểu là công thức (bắt đầu bằng = + - @). */
export function csvCell(v: string | number | undefined): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

/** CSV theo từng câu, UTF-8 có BOM để Excel đọc đúng tiếng Việt. Không có nội dung câu hỏi. */
export function reportCsv(r: ImportReport): string {
  const head = ['Tệp', 'Thư mục', 'Dòng', 'Quyết định', 'Lý do / dò trùng', 'ID trong tệp', 'Vị trí đặt', 'Lỗi xem trước', 'TeX Live', 'Mã nội bộ (uid)', 'Số thứ tự mới'];
  const lines = [head.map(csvCell).join(',')];
  for (const x of r.rows) {
    lines.push([
      x.file, x.rel, x.line, DECISION_TEXT[x.decision], x.reason, ID_STATE_TEXT[x.idState], x.idPlace ? ID_PLACE_TEXT[x.idPlace] : '',
      x.preview === 'loi' ? 'Lỗi' : x.preview === 'canh' ? 'Cảnh báo' : '', x.tex === 'ok' ? 'Đạt' : x.tex === 'loi' ? 'Lỗi' : '', x.uid ?? '', x.seq ?? '',
    ].map(csvCell).join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** Báo cáo dạng đọc nhanh (Markdown), không có nội dung câu hỏi. */
export function reportMd(r: ImportReport): string {
  const L: string[] = [];
  L.push(`# Báo cáo nhập: ${r.name || '(không tên)'}`, '', `Thời điểm: ${whenText(r.at)}`, '');
  L.push('## Tổng quát', '');
  L.push(`- Tìm thấy: ${r.found} câu`, `- Đã nhập: ${r.imported} câu`, `- Bỏ qua vì nghi trùng: ${r.skippedDup} câu`, `- Bỏ qua theo lựa chọn của bạn: ${r.skippedUser} câu`);
  L.push(`- Điểm khôi phục trước khi nhập: ${r.restorePoint ? 'đã chụp' : 'không áp dụng (chế độ lưu cũ hoặc lô nhỏ)'}`, '');
  L.push('## Vị trí của các câu đã nhập', '');
  L.push(`- Theo mã ID đủ: ${r.ids.ok}${r.ids.unverified ? ` (chưa kiểm chứng: ${r.ids.unverified})` : ''}${r.ids.kept ? ` (bất đồng ngân hàng, bạn giữ ID: ${r.ids.kept})` : ''}${r.ids.queued ? ` (bất đồng ngân hàng, chờ xác minh: ${r.ids.queued})` : ''}`, `- ID thiếu Dạng (vào Dạng đầu của Bài): ${r.ids.firstForm}`, `- Theo gợi ý bạn đã chọn: ${r.ids.ai}`, `- Vào vị trí chung (cần xếp lại sau): ${r.ids.general}`, '');
  L.push('## Kiểm tra', '');
  L.push(`- Lỗi xem trước: ${r.previewErrors} câu; cảnh báo: ${r.previewWarnings} câu`);
  L.push(r.texChecked ? `- Biên dịch TeX Live: ${r.texChecked} câu đã thử, ${r.texFailed} câu lỗi` : '- Biên dịch TeX Live: chưa chạy', '');
  if (r.warnings.length) { L.push('## Lưu ý', '', ...r.warnings.map((w) => `- ${w}`), ''); }
  if (r.files.length > 1 || r.files[0]?.file) {
    L.push('## Theo tệp', '', '| Tệp | Tìm thấy | Đã nhập | Bỏ qua |', '|---|---:|---:|---:|');
    for (const f of r.files) L.push(`| ${(f.rel ? f.rel + '/' : '') + f.file} | ${f.found} | ${f.imported} | ${f.skipped} |`);
    L.push('');
  }
  L.push('Báo cáo này không chứa nội dung câu hỏi. Danh sách từng câu nằm trong tệp .csv.', '');
  return L.join('\n');
}

// ---- Nhật ký nhập: giữ tối đa 20 báo cáo gần nhất (tóm tắt + các dòng có vấn đề) ----
export const LOG_MAX = 20;
export const LOG_ROWS_MAX = 200;

export interface LogEntry extends Omit<ImportReport, 'rows'> { rows: ReportRow[]; rowsTruncated: number }

const needsAttention = (x: ReportRow): boolean => x.decision !== 'import' || x.idState !== 'ok' || x.preview !== '' || x.tex === 'loi';

/** Rút gọn để lưu: chỉ giữ dòng có vấn đề, tối đa LOG_ROWS_MAX. */
export function toLogEntry(r: ImportReport): LogEntry {
  const bad = r.rows.filter(needsAttention);
  return { ...r, rows: bad.slice(0, LOG_ROWS_MAX), rowsTruncated: Math.max(0, bad.length - LOG_ROWS_MAX) };
}

export function addToLog(list: readonly LogEntry[], r: ImportReport): LogEntry[] {
  return [toLogEntry(r), ...list].slice(0, LOG_MAX);
}

export function parseLog(json: string | null): LogEntry[] {
  if (!json) return [];
  try {
    const d = JSON.parse(json) as { v?: number; list?: unknown };
    if (d.v !== 1 || !Array.isArray(d.list)) return [];
    return d.list.filter((x): x is LogEntry => !!x && typeof (x as LogEntry).at === 'number' && Array.isArray((x as LogEntry).rows)).slice(0, LOG_MAX);
  } catch { return []; }
}
export const stringifyLog = (list: readonly LogEntry[]): string => JSON.stringify({ v: 1, list });

export interface LogBackend { load(): Promise<string | null>; save(json: string): Promise<void> }
const LOG_KEY = 'import-reports';
const web: LogBackend = {
  async load() { try { return localStorage.getItem('hedu.importlog.v1'); } catch { return null; } },
  async save(json) { localStorage.setItem('hedu.importlog.v1', json); },
};
/** Chế độ SQLite: tệp phụ trong chính tệp dữ liệu. Chế độ JSON cũ: không lưu nhật ký (báo cáo vẫn xuất ra tệp được). */
const sqlite: LogBackend = {
  load: () => invoke<string | null>('db_sidecar_get', { key: LOG_KEY }),
  save: (json) => invoke<void>('db_apply', { upserts: [], deletes: [], meta: [], sidecar: [[LOG_KEY, json]] }),
};
const none: LogBackend = { async load() { return null; }, async save() { /* không lưu */ } };
let override: LogBackend | null = null;
/** Chỉ dùng trong kiểm thử. */
export const _setLogBackend = (b: LogBackend | null) => { override = b; };
const backend = (): LogBackend => override ?? (isDesktop() ? (getStorageMode() === 'sqlite' ? sqlite : none) : web);
export const logPersists = (): boolean => override != null || !isDesktop() || getStorageMode() === 'sqlite';

export const loadLog = async (): Promise<LogEntry[]> => { try { return parseLog(await backend().load()); } catch { return []; } };
/** Ghi nhật ký; lỗi ghi KHÔNG làm hỏng việc nhập (trả false để giao diện báo nhẹ). */
export async function appendLog(r: ImportReport): Promise<boolean> {
  try { const b = backend(); await b.save(stringifyLog(addToLog(parseLog(await b.load()), r))); return true; } catch { return false; }
}
export async function clearLog(): Promise<boolean> { try { await backend().save(stringifyLog([])); return true; } catch { return false; } }
