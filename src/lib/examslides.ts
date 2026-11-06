// Câu của một đề trong Thư viện đề để trình chiếu. Đề tạo từ ngân hàng: lấy câu mã đề đầu tiên theo thứ tự đề (nội dung câu gốc trong ngân hàng).
// Đề soạn tay (hoặc câu không còn trong ngân hàng): đọc các khối \begin{ex}…\end{ex} trong tệp .tex của dự án. Chỉ đọc, không sửa gì.
import { parseMatrixSpec } from './exammatrix';
import { PARTS } from './examgen';
import { fileList, fileRead } from './examfiles';
import { invoke } from './platform';
import type { DeckItem } from './slidedeck';
import { scanScratch } from './texscratch';
import type { Question } from './types';

/** Câu theo hedu-de.json (null nếu không có hoặc thiếu câu trong ngân hàng). */
export function itemsFromSpec(specText: string | null, bank: readonly Question[]): DeckItem[] | null {
  if (!specText) return null;
  const spec = parseMatrixSpec(specText);
  if (!spec?.firstCode) return null;
  const by = new Map(bank.map((q) => [q.uid, q]));
  const out: DeckItem[] = [];
  for (const p of PARTS) for (const it of spec.firstCode.parts[p]) {
    const q = by.get(it.uid);
    if (!q) return null; // thiếu câu: không đoán, chuyển sang đọc tệp .tex
    out.push({ latex: q.latex, uid: q.uid });
  }
  return out.length ? out : null;
}

/** Các khối ex hoàn chỉnh trong các tệp .tex (bỏ trùng nguyên văn, giữ thứ tự tệp rồi thứ tự trong tệp). */
export function itemsFromTex(files: readonly { rel: string; text: string }[]): DeckItem[] {
  const seen = new Set<string>();
  const out: DeckItem[] = [];
  for (const f of files) for (const b of scanScratch(f.text).blocks) {
    if (!b.closed || seen.has(b.text)) continue;
    seen.add(b.text); out.push({ latex: b.text });
  }
  return out;
}

export async function examSlideItems(id: string, bank: readonly Question[]): Promise<DeckItem[]> {
  const fromSpec = itemsFromSpec(await invoke<string | null>('exam_spec_text', { id }).catch(() => null), bank);
  if (fromSpec) return fromSpec;
  const list = await fileList(id);
  const tex = list.files.filter((f) => f.kind === 'text' && /\.tex$/i.test(f.rel) && f.bytes < 4 * 1024 * 1024);
  const files: { rel: string; text: string }[] = [];
  for (const f of tex) { try { files.push({ rel: f.rel, text: (await fileRead(id, f.rel)).text }); } catch { /* tệp không đọc được: bỏ qua */ } }
  return itemsFromTex(files);
}
