// Thao tác trên thư mục riêng của Thư viện đề (thuần). Thư mục chỉ là NHÃN ghi trong từng đề ("A/B/C"), không phải thư mục trên đĩa:
// đổi tên / di chuyển / xoá thư mục = ghi lại nhãn của các đề bên trong. Thư mục trống (chưa có đề) lưu riêng trong `extras`.
import type { ExamSummary } from './examlib';
import { invoke } from './platform';

export const MAX_DEPTH = 5;
export const MAX_NAME = 60;

export type NameCheck = { ok: true; name: string } | { ok: false; error: string };
export function checkFolderName(raw: string): NameCheck {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (!name) return { ok: false, error: 'Tên thư mục không được để trống.' };
  if (name.length > MAX_NAME) return { ok: false, error: `Tên thư mục tối đa ${MAX_NAME} ký tự.` };
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(name)) return { ok: false, error: 'Tên thư mục không được chứa \\ / : * ? " < > |' };
  if (/^\.+$/.test(name)) return { ok: false, error: 'Tên thư mục không hợp lệ.' };
  return { ok: true, name };
}

export interface FolderPatch { id: string; folder: string | null }
export type FolderResult =
  | { ok: true; patches: FolderPatch[]; extras: string[]; /** đường dẫn mới của thư mục (null nếu đã xoá) */ path: string | null }
  | { ok: false; error: string };

const within = (f: string | null | undefined, p: string): boolean => !!f && (f === p || f.startsWith(p + '/'));
const parentOf = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const join = (parent: string, name: string): string => (parent ? `${parent}/${name}` : name);
const norm = (s: string) => s.normalize('NFC').toLowerCase();
const depth = (p: string) => p.split('/').length;
const uniq = (x: readonly string[]): string[] => [...new Set(x)];

/** Mọi đường dẫn thư mục đang có: từ nhãn của đề và thư mục trống (kể cả thư mục cha). */
export function knownFolders(list: readonly ExamSummary[], extras: readonly string[]): string[] {
  const set = new Set<string>();
  const add = (f: string) => f.split('/').forEach((_, i, a) => set.add(a.slice(0, i + 1).join('/')));
  for (const e of list) if (e.folder) add(e.folder);
  for (const x of extras) add(x);
  return [...set].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
}
const clash = (all: readonly string[], p: string) => all.some((x) => norm(x) === norm(p));

export function createFolder(list: readonly ExamSummary[], extras: readonly string[], parent: string, rawName: string): FolderResult {
  const c = checkFolderName(rawName);
  if (!c.ok) return c;
  const path = join(parent, c.name);
  if (depth(path) > MAX_DEPTH) return { ok: false, error: `Thư mục lồng tối đa ${MAX_DEPTH} cấp.` };
  if (clash(knownFolders(list, extras), path)) return { ok: false, error: `Đã có thư mục “${path}”.` };
  return { ok: true, patches: [], extras: uniq([...extras, path]), path };
}

/** Đổi tên (giữ nguyên vị trí). */
export function renameFolder(list: readonly ExamSummary[], extras: readonly string[], path: string, rawName: string): FolderResult {
  const c = checkFolderName(rawName);
  if (!c.ok) return c;
  return relocate(list, extras, path, join(parentOf(path), c.name));
}

/** Di chuyển vào thư mục khác ('' = ra ngoài cùng). */
export function moveFolder(list: readonly ExamSummary[], extras: readonly string[], path: string, newParent: string): FolderResult {
  if (newParent === path || within(newParent, path)) return { ok: false, error: 'Không thể chuyển thư mục vào chính nó hoặc thư mục con của nó.' };
  return relocate(list, extras, path, join(newParent, path.split('/').pop()!));
}

function relocate(list: readonly ExamSummary[], extras: readonly string[], path: string, to: string): FolderResult {
  if (to === path) return { ok: true, patches: [], extras: [...extras], path };
  const all = knownFolders(list, extras);
  // chỉ đổi hoa/thường của chính nó thì không tính là trùng
  if (norm(to) !== norm(path) && clash(all, to)) return { ok: false, error: `Đã có thư mục “${to}”.` };
  const deepest = Math.max(depth(path), ...all.filter((x) => within(x, path)).map(depth));
  if (depth(to) + (deepest - depth(path)) > MAX_DEPTH) return { ok: false, error: `Thư mục lồng tối đa ${MAX_DEPTH} cấp.` };
  const re = (f: string) => to + f.slice(path.length);
  const patches = list.filter((e) => within(e.folder, path)).map((e) => ({ id: e.id, folder: re(e.folder!) }));
  return { ok: true, patches, extras: uniq(extras.map((x) => (within(x, path) ? re(x) : x))), path: to };
}

/** Xoá thư mục: các đề bên trong KHÔNG bị xoá, được đưa lên thư mục cha (hoặc ra ngoài cùng). */
export function deleteFolder(list: readonly ExamSummary[], extras: readonly string[], path: string): FolderResult {
  const up = parentOf(path) || null;
  const patches = list.filter((e) => within(e.folder, path)).map((e) => ({ id: e.id, folder: up }));
  return { ok: true, patches, extras: extras.filter((x) => !within(x, path)), path: null };
}

/** Số đề nằm trong thư mục (kể cả thư mục con). */
export const folderExamCount = (list: readonly ExamSummary[], path: string): number => list.filter((e) => within(e.folder, path)).length;

// ---- thư mục trống: lưu trong dữ liệu ứng dụng (exam-library/folders.json), không phụ thuộc trình duyệt ----
const LEGACY_KEY = 'hedu.examfolders.empty.v1';
const legacy = (): string[] => {
  try { const v = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? '[]'); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; }
};
/** Đọc danh sách thư mục trống; lần đầu sau khi nâng cấp thì chuyển dữ liệu cũ (lưu theo trình duyệt) sang dữ liệu ứng dụng. */
export async function loadFolders(): Promise<string[]> {
  const cur = await invoke<string[]>('exam_folders_load');
  const old = legacy();
  if (!old.length) return cur;
  const merged = [...new Set([...cur, ...old])];
  await invoke<void>('exam_folders_save', { folders: merged });
  try { localStorage.removeItem(LEGACY_KEY); } catch { /* bỏ qua */ }
  return invoke<string[]>('exam_folders_load');
}
export const saveFolders = (x: readonly string[]) => invoke<void>('exam_folders_save', { folders: [...x] });
