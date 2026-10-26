// Tệp trong một dự án đề (E3): kiểu dữ liệu khớp Rust `examfiles.rs`, gọi lệnh và hàm thuần (cây tệp, trạng thái tab, kế hoạch lưu).
// Quy tắc an toàn dữ liệu nằm ở Rust (mã hoá byte, so dấu vân, chụp bản cũ); lớp này chỉ điều phối và KHÔNG báo lưu thành công khi chưa ghi.
import { invoke } from './platform';

export type FileKind = 'text' | 'image' | 'pdf' | 'other';
export interface FileEntry { rel: string; bytes: number; kind: FileKind }
export interface ListOut { files: FileEntry[]; blocked: string[] }
export interface TextFile { text: string; bytes: number; sha256: string; eol: 'lf' | 'crlf' | 'none'; bom: boolean; mtimeMs: number }
export type WriteOut =
  | { status: 'saved'; sha256: string; bytes: number; mtimeMs: number; changed: boolean }
  | { status: 'conflict'; currentSha256: string | null; missing: boolean };
export interface StatOut { rel: string; exists: boolean; bytes: number; sha256: string | null }
export interface Draft { rel: string; baseSha256: string; text: string; at: string }

export const fileList = (id: string) => invoke<ListOut>('exam_file_list', { id });
export const fileRead = (id: string, rel: string) => invoke<TextFile>('exam_file_read', { id, rel });
export const fileWrite = (id: string, rel: string, text: string, eol: string, bom: boolean, expectedSha256: string) =>
  invoke<WriteOut>('exam_file_write', { id, rel, text, eol, bom, expectedSha256 });
export const fileCreate = (id: string, rel: string, text: string) => invoke<FileEntry>('exam_file_create', { id, rel, text });
export const fileStat = (id: string, rels: string[]) => invoke<StatOut[]>('exam_file_stat', { id, rels });
export const fileImage = (id: string, rel: string) => invoke<ArrayBuffer>('exam_file_image', { id, rel });
export const draftWrite = (id: string, rel: string, baseSha256: string, text: string) => invoke<void>('exam_draft_write', { id, rel, baseSha256, text });
export const draftRead = (id: string, rel: string) => invoke<Draft | null>('exam_draft_read', { id, rel });
export const draftClear = (id: string, rel: string) => invoke<void>('exam_draft_clear', { id, rel });

// ---------- cây tệp ----------

export interface TreeNode { name: string; rel: string; dir: boolean; kind?: FileKind; bytes?: number; children: TreeNode[] }

const natural = (a: string, b: string) => a.localeCompare(b, 'vi', { numeric: true, sensitivity: 'base' });

/** Dựng cây từ danh sách phẳng: thư mục trước, tệp sau, mỗi nhóm theo thứ tự tự nhiên. */
export function buildTree(files: readonly FileEntry[]): TreeNode[] {
  const root: TreeNode = { name: '', rel: '', dir: true, children: [] };
  for (const f of files) {
    let cur = root;
    const parts = f.rel.split('/');
    parts.forEach((p, i) => {
      const rel = parts.slice(0, i + 1).join('/');
      if (i === parts.length - 1) { cur.children.push({ name: p, rel, dir: false, kind: f.kind, bytes: f.bytes, children: [] }); return; }
      let d = cur.children.find((c) => c.dir && c.name === p);
      if (!d) { d = { name: p, rel, dir: true, children: [] }; cur.children.push(d); }
      cur = d;
    });
  }
  const sort = (n: TreeNode) => { n.children.sort((a, b) => (a.dir === b.dir ? natural(a.name, b.name) : a.dir ? -1 : 1)); n.children.forEach(sort); };
  sort(root);
  return root.children;
}

// ---------- trạng thái tab ----------

export type External = 'none' | 'changed' | 'missing';
export interface TabInfo {
  rel: string;
  /** dấu vân của byte gốc lúc mở / lần lưu gần nhất */
  sha: string;
  eol: 'lf' | 'crlf' | 'none';
  bom: boolean;
  dirty: boolean;
  external: External;
  /** lý do chỉ xem (không phải UTF-8, trộn xuống dòng…) hoặc null nếu sửa được */
  readOnly: string | null;
  kind: FileKind;
}

/** So dấu vân đang có trên đĩa với dấu vân lúc mở. */
export function externalState(tab: Pick<TabInfo, 'sha'>, st: StatOut | undefined): External {
  if (!st) return 'none';
  if (!st.exists) return 'missing';
  if (st.sha256 !== null && st.sha256 !== tab.sha) return 'changed';
  return 'none';
}

/** Các tab cần lưu khi "Lưu tất cả"/trước khi biên dịch: tab đang sửa, sửa được. Tab có xung đột chặn cả đợt (không lưu một nửa). */
export function savePlan(tabs: readonly TabInfo[]): { toSave: string[]; blocked: string[] } {
  const dirty = tabs.filter((t) => t.dirty && !t.readOnly);
  const blocked = dirty.filter((t) => t.external !== 'none').map((t) => t.rel);
  return { toSave: blocked.length ? [] : dirty.map((t) => t.rel), blocked };
}

export const anyDirty = (tabs: readonly TabInfo[]): boolean => tabs.some((t) => t.dirty);

/** Trạng thái hiển thị trên đầu trang (không chỉ bằng màu). */
export function saveBadge(tabs: readonly TabInfo[], saving: boolean): { text: string; tone: 'ok' | 'warn' | 'bad' } {
  if (saving) return { text: 'Đang lưu…', tone: 'warn' };
  if (tabs.some((t) => t.external !== 'none')) return { text: 'Tệp đổi ngoài HEdu — cần xử lý', tone: 'bad' };
  const n = tabs.filter((t) => t.dirty).length;
  return n ? { text: `Chưa lưu (${n} tệp)`, tone: 'warn' } : { text: 'Đã lưu', tone: 'ok' };
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const TEXT_EXT = ['tex', 'sty', 'cls', 'clo', 'def', 'cfg', 'fd', 'ltx', 'bib', 'bst', 'tikz', 'txt', 'md', 'code', 'lua'];

/** Kiểm tên tệp mới trước khi gọi Rust (Rust vẫn kiểm lại). Trả về lý do lỗi hoặc null nếu hợp lệ. */
export function newFileProblem(rel: string): string | null {
  const r = rel.trim();
  if (!r) return 'Chưa nhập tên tệp.';
  if (r.startsWith('/') || r.includes('\\') || r.includes(':')) return 'Dùng dấu / giữa các thư mục, không dùng \\ hay ổ đĩa.';
  for (const p of r.split('/')) {
    if (!p || p === '.' || p === '..') return 'Tên có thành phần rỗng hoặc ".."';
    if (/[<>:"|?*\u0000-\u001f]/.test(p)) return `Tên "${p}" có ký tự Windows không cho phép.`;
    if (/[. ]$/.test(p)) return `Tên "${p}" không được kết thúc bằng dấu chấm hoặc dấu cách.`;
    if (RESERVED.test(p.split('.')[0])) return `"${p}" là tên dành riêng của Windows.`;
  }
  if (r.split('/')[0] === '.hedu') return 'Thư mục .hedu dành riêng cho HEdu.';
  const ext = (r.split('.').pop() ?? '').toLowerCase();
  if (!TEXT_EXT.includes(ext)) return `Chỉ tạo được tệp văn bản (${TEXT_EXT.slice(0, 6).join(', ')}…).`;
  return null;
}

export const kindIcon = (k: FileKind | undefined, dir: boolean): string => (dir ? '▸' : k === 'text' ? '≡' : k === 'image' ? '▣' : k === 'pdf' ? '▤' : '·');
