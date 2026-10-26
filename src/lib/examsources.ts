// Nguồn gốc câu hỏi trong đề (E5): chép NGUYÊN VĂN từ Ngân hàng câu hỏi, ghi UID vào sổ riêng của dự án, không tự đồng bộ.
// Phía Rust (examsources.rs) giữ sổ `.hedu/sources.json`; ở đây là kiểu dữ liệu, lệnh và hàm thuần để dựng đoạn chèn/đối chiếu.
import { invoke } from './platform';
import { questionCode } from './id';
import type { Question } from './types';

export interface SourceIn { uid: string; label: string; latex: string }
export interface SourceItem { uid: string; label: string; rel: string; sha256: string; latex: string; addedAt: string }
export type SourceState = 'verbatim' | 'changed' | 'missing';
export interface SourceStatus { item: SourceItem; state: SourceState }

export const sourcesAdd = (id: string, rel: string, items: SourceIn[]) => invoke<number>('exam_sources_add', { id, rel, items });
export const sourcesStatus = (id: string) => invoke<SourceStatus[]>('exam_sources_status', { id });
export const sourcesForget = (id: string, uid: string, rel: string, sha256: string) => invoke<number>('exam_sources_forget', { id, uid, rel, sha256 });
export const createFromFiles = (name: string, files: { path: string; text: string }[], main: string, sourcesRel: string, sources: SourceIn[]) =>
  invoke<import('./examlib').ExamSummary>('exam_lib_create_files', { name, files, main, sourcesRel, sources });

export const STATE_LABEL: Record<SourceState, string> = {
  verbatim: 'Còn nguyên văn',
  changed: 'Có thể đã thay đổi',
  missing: 'Không còn thấy trong đề',
};

/** Ghi nguồn từ một câu của ngân hàng: UID, ID để tham khảo, LaTeX NGUYÊN VĂN (không qua bộ phân tích). */
export function toSource(q: Question): SourceIn {
  return { uid: q.uid, label: questionCode(q, q.level), latex: q.latex };
}

/** Đoạn chèn vào đề: các câu nguyên văn, cách nhau đúng một dòng trống, kết thúc bằng một dấu xuống dòng. Không sửa chữ nào trong câu. */
export function insertionText(qs: readonly Question[]): string {
  return qs.map((q) => q.latex.replace(/\s+$/, '')).join('\n\n') + '\n';
}

/** Chuẩn hoá xuống dòng để so khớp. */
export const norm = (s: string): string => s.replace(/\r\n/g, '\n');

/** Ngân hàng đã đổi so với bản đã chép chưa (so nội dung hiện tại của câu theo UID). null = câu không còn trong ngân hàng. */
export function bankDrift(item: Pick<SourceItem, 'uid' | 'latex'>, bank: readonly Question[]): 'same' | 'changed' | null {
  const q = bank.find((x) => x.uid === item.uid);
  if (!q) return null;
  return norm(q.latex).trim() === norm(item.latex).trim() ? 'same' : 'changed';
}

export interface LineDiff { kind: 'same' | 'del' | 'add'; text: string }

/** So sánh theo dòng đơn giản (LCS) giữa bản đã chép và bản hiện có trong ngân hàng, để giáo viên xem khác ở đâu. */
export function lineDiff(a: string, b: string): LineDiff[] {
  const x = norm(a).split('\n'), y = norm(b).split('\n');
  const n = x.length, m = y.length;
  if (n * m > 4_000_000) return [...x.map((t) => ({ kind: 'del' as const, text: t })), ...y.map((t) => ({ kind: 'add' as const, text: t }))];
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: LineDiff[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { out.push({ kind: 'same', text: x[i] }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push({ kind: 'del', text: x[i++] });
    else out.push({ kind: 'add', text: y[j++] });
  }
  while (i < n) out.push({ kind: 'del', text: x[i++] });
  while (j < m) out.push({ kind: 'add', text: y[j++] });
  return out;
}
