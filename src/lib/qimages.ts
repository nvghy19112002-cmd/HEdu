// Ảnh của câu hỏi (PNG/JPG viết bằng \includegraphics): tìm tên ảnh trong câu (thuần, có kiểm thử) và nhờ Rust chép vào kho ảnh khi nhập.
// Hình TikZ nằm ngay trong mã câu nên đi theo câu; chỉ ảnh dạng tệp mới cần kho này.
import { invoke } from './platform';

export interface QImg { name: string; file: string }

const INC = /\\includegraphics\s*(?:\[[^\]]*\])?\s*\{([^{}]+)\}/g;

/** Tên ảnh được \includegraphics gọi (bỏ chú thích %, bỏ trùng, giữ thứ tự). */
export function imageNames(latex: string): string[] {
  const code = latex.replace(/(^|[^\\])%[^\n]*/g, '$1');
  const out: string[] = [];
  for (const m of code.matchAll(INC)) {
    const n = m[1].trim();
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

/** Thư mục chứa một đường dẫn tệp (hỗ trợ cả \ và /). Không có thư mục ⇒ null. */
export function dirOf(path: string | undefined): string | null {
  if (!path) return null;
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i > 0 ? path.slice(0, i) : null;
}

interface Found { name: string; file: string | null; bytes: number; why: string }

export interface CollectResult {
  /** ảnh của từng câu (cùng chỉ số với đầu vào); undefined nếu câu không dùng ảnh nào tìm thấy */
  images: (QImg[] | undefined)[];
  /** ảnh câu nhắc tới nhưng không lưu được: tên và lý do */
  missing: { name: string; why: string }[];
}

/**
 * Với mỗi câu (kèm thư mục của tệp nguồn), tìm các ảnh nó nhắc tới và chép vào kho. Câu dán trực tiếp (không có thư mục) không có ảnh để tìm.
 * Một ảnh không tìm thấy không làm hỏng cả lô: chỉ được ghi vào `missing`.
 */
export async function collectImages(items: readonly { latex: string; dir: string | null }[], find?: (folder: string, names: string[]) => Promise<Found[]>): Promise<CollectResult> {
  const ask = find ?? ((folder: string, names: string[]) => invoke<Found[]>('qimg_collect', { folder, names }));
  const byDir = new Map<string, Set<string>>();
  items.forEach((it) => { if (!it.dir) return; const n = imageNames(it.latex); if (n.length) { const s = byDir.get(it.dir) ?? new Set<string>(); n.forEach((x) => s.add(x)); byDir.set(it.dir, s); } });
  const got = new Map<string, Map<string, Found>>();
  const missing: { name: string; why: string }[] = [];
  for (const [dir, names] of byDir) {
    const list = [...names];
    const res = await ask(dir, list);
    const m = new Map<string, Found>();
    for (const r of res) { m.set(r.name, r); if (!r.file && !missing.some((x) => x.name === r.name)) missing.push({ name: r.name, why: r.why }); }
    got.set(dir, m);
  }
  const images = items.map((it) => {
    if (!it.dir) return undefined;
    const m = got.get(it.dir);
    const out: QImg[] = [];
    for (const n of imageNames(it.latex)) { const f = m?.get(n); if (f?.file) out.push({ name: n, file: f.file }); }
    return out.length ? out : undefined;
  });
  return { images, missing };
}

/** Gộp ảnh của nhiều câu thành một danh sách cho dự án. Cùng tên nhưng khác tệp (khác nội dung) là xung đột: không đoán, báo tên. */
export function mergeImages(qs: readonly { images?: readonly QImg[] }[]): { images: QImg[]; conflicts: string[] } {
  const byName = new Map<string, QImg>();
  const conflicts: string[] = [];
  for (const q of qs) for (const im of q.images ?? []) {
    const cur = byName.get(im.name);
    if (!cur) byName.set(im.name, { name: im.name, file: im.file });
    else if (cur.file !== im.file && !conflicts.includes(im.name)) conflicts.push(im.name);
  }
  return { images: [...byName.values()], conflicts };
}

/** Câu có dùng ảnh tệp mà chưa có trong kho (để báo cho giáo viên). */
export const needsImages = (latex: string, have: readonly QImg[] | undefined): string[] => imageNames(latex).filter((n) => !have?.some((h) => h.name === n));
