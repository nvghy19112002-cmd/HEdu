// Nhập nhiều đề cùng lúc từ một thư mục (hàm thuần, có kiểm thử): mỗi tệp .tex nằm thẳng trong thư mục là MỘT đề (một tệp),
// (`ScanFile.rel` bắt đầu bằng tên thư mục đã chọn) mỗi thư mục con có tệp .tex là MỘT đề nhiều tệp (hình, gói riêng đi cùng). Tệp gốc không bị đụng (nhập = sao chép vào thư viện).
import type { ScanFile } from './importfiles';

export interface BatchCandidate { kind: 'file' | 'folder'; path: string; name: string; /** số tệp .tex bên trong (thư mục) hoặc 1 */ texCount: number }
export const BATCH_IMPORT_MAX = 200;

const sepOf = (p: string) => (p.includes('\\') && !p.includes('/') ? '\\' : '/');
const stem = (n: string) => n.replace(/\.[^.]+$/, '');
const natural = (a: string, b: string) => a.localeCompare(b, 'vi', { numeric: true, sensitivity: 'base' });

/** Dựng danh sách đề ứng viên từ kết quả quét một thư mục (`files` do scanSources trả về). */
export function batchCandidates(folder: string, files: readonly ScanFile[]): { items: BatchCandidate[]; truncated: boolean } {
  const sep = sepOf(folder);
  const root = folder.replace(/[\\/]+$/, '');
  const byFolder = new Map<string, number>();
  const items: BatchCandidate[] = [];
  for (const f of files) {
    if (!/\.tex$/i.test(f.name)) continue;
    // `rel` do scanSources trả về bắt đầu bằng TÊN thư mục đã chọn ("De/CK1/a.tex"): bỏ thành phần đầu để còn đường dẫn bên trong
    const inside = f.rel.split('/').slice(1);
    const first = inside[0] ?? '';
    if (!first) items.push({ kind: 'file', path: f.path, name: stem(f.name), texCount: 1 });
    else byFolder.set(first, (byFolder.get(first) ?? 0) + 1);
  }
  for (const [c, n] of byFolder) items.push({ kind: 'folder', path: `${root}${sep}${c}`, name: c, texCount: n });
  items.sort((a, b) => natural(a.name, b.name));
  return { items: items.slice(0, BATCH_IMPORT_MAX), truncated: items.length > BATCH_IMPORT_MAX };
}

export interface BatchOutcome { name: string; ok: boolean; message: string }

/** Tóm tắt một lô nhập để báo cho giáo viên. */
export function summarizeBatch(o: readonly BatchOutcome[]): string {
  const ok = o.filter((x) => x.ok).length;
  const bad = o.filter((x) => !x.ok);
  if (!bad.length) return `Đã nhập ${ok} đề vào thư viện. Tệp gốc không bị thay đổi.`;
  return `Đã nhập ${ok}/${o.length} đề. ${bad.length} đề chưa nhập: ${bad.slice(0, 3).map((x) => `“${x.name}” (${x.message})`).join('; ')}${bad.length > 3 ? '…' : ''}.`;
}
