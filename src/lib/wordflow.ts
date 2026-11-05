// Luồng nhập Word: chọn tệp .docx/.doc → Rust (Pandoc + đọc công thức MathType) → ex_test (wordimport.ts) → văn bản đưa vào màn Nhập liệu.
import { invoke } from './platform';
import { convertWord, toExTest, type WordConv } from './wordimport';
import { applyKey, parseKey, type AnswerKey } from './wordkey';

export interface WordImportRaw { latex: string; equations: number; failed: number; images: string[]; warnings: string[]; mediaDir: string }
export interface WordImportResult { tex: string; conv: WordConv; raw: WordImportRaw; summary: string; notes: string[] }

type Dlg = { open?(o: { title?: string; multiple?: boolean; directory?: boolean; filters?: { name: string; extensions: string[] }[] }): Promise<string | string[] | null> };
const dlg = (): Dlg | undefined => (typeof window !== 'undefined' ? (window.__TAURI__?.dialog as Dlg | undefined) : undefined);

export async function chooseWordFile(): Promise<string | null> {
  const d = dlg();
  if (!d?.open) return null;
  const r = await d.open({ title: 'Chọn tệp Word (.docx hoặc .doc)', multiple: false, directory: false, filters: [{ name: 'Tệp Word', extensions: ['docx', 'doc'] }] });
  return Array.isArray(r) ? r[0] ?? null : r;
}

/** Hình trong Word chưa nhập được vào ngân hàng: thay bằng dòng chú thích để thầy/cô vẽ lại hoặc chèn ảnh. */
export function noteImages(latex: string): string {
  return latex.replace(/\\includegraphics(?:\[[^\]]*\])?\{([^}]*)\}/g, (_m, p: string) => `% HÌNH TRONG WORD: ${p.split('/').pop()} (chưa nhập, hãy vẽ lại bằng TikZ hoặc chèn ảnh)\n`);
}

export async function importWord(path: string): Promise<WordImportResult> {
  const raw = await invoke<WordImportRaw>('word_import', { path });
  const nImg = (raw.latex.match(/\\includegraphics/g) ?? []).length;
  const conv = convertWord(noteImages(raw.latex));
  const s = conv.stats;
  const notes: string[] = [];
  if (raw.failed) notes.push(`${raw.failed} công thức MathType không đọc được (đã ghi [CÔNG THỨC LỖI] tại chỗ đó).`);
  if (nImg) notes.push(`${nImg} hình trong Word chưa nhập được: có dòng chú thích “HÌNH TRONG WORD” tại chỗ cần hình.`);
  if (s.noAnswer) notes.push(`${s.noAnswer} câu chưa có đáp án (Word không đánh dấu): hãy điền sau khi nhập hoặc nhập thêm tệp đáp án.`);
  if (s.byType.tln) notes.push(`${s.byType.tln} câu trả lời ngắn có \\shortans{} trống.`);
  if (s.unknownType) notes.push(`${s.unknownType} câu không rõ loại, đang để dạng tự luận.`);
  for (const w of raw.warnings.slice(0, 5)) notes.push(w);
  const summary = `Đọc được ${s.total} câu (trắc nghiệm ${s.byType.tn}, đúng/sai ${s.byType.ds}, trả lời ngắn ${s.byType.tln}, tự luận ${s.byType.tl}); ${raw.equations} công thức MathType/Equation${s.withSolution ? `; ${s.withSolution} câu có lời giải` : ''}.`;
  void invoke('word_import_cleanup', { mediaDir: raw.mediaDir }).catch(() => undefined);
  return { tex: conv.tex, conv, raw, summary, notes };
}

/** Đọc tệp Word chứa bảng đáp án (cây Pandoc JSON) → bảng đáp án theo mã đề. */
export async function loadAnswerKey(path: string): Promise<AnswerKey> {
  const raw = await invoke<WordImportRaw>('word_import_json', { path });
  void invoke('word_import_cleanup', { mediaDir: raw.mediaDir }).catch(() => undefined);
  let ast: unknown;
  try { ast = JSON.parse(raw.latex); } catch { throw new Error('Không đọc được bảng đáp án trong tệp Word.'); }
  const key = parseKey(ast);
  if (!key.codes.length) throw new Error('Không thấy bảng đáp án theo mã đề trong tệp này (cần bảng có cột “MÃ ĐỀ …”).');
  return key;
}

export { applyKey, toExTest };
