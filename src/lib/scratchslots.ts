// Nhiều bàn nháp có tên cho màn "Xử lí TeX". Danh sách (tên, thứ tự, bàn nháp đang mở) lưu như một bản nháp đặc biệt tên `danh-sach`
// (cùng cơ chế ghi an toàn + bản dự phòng). Bàn nháp CHÍNH luôn có (id rỗng, tệp nhap.tex như trước) và không xoá được.
import { deleteDraft, loadDraft, saveDraft } from './scratchdraft';

export const INDEX_SLOT = 'danh-sach';
export const MAIN_NAME = 'Bàn nháp chính';
export const MAX_DRAFTS = 30;

export interface DraftItem { id: string; name: string }
export interface DraftIndex { v: 1; /** các bàn nháp RIÊNG (không kể bàn nháp chính) */ items: DraftItem[]; /** id đang mở ('' = chính) */ active: string }
export const EMPTY_INDEX: DraftIndex = { v: 1, items: [], active: '' };

const ID_OK = /^[a-z0-9-]{1,40}$/;
export const cleanName = (s: string): string => s.replace(/\s+/g, ' ').trim().slice(0, 60);

/** Đọc danh sách từ chuỗi đã lưu; hỏng/không đúng khuôn ⇒ danh sách rỗng (các tệp bản nháp riêng vẫn còn trên đĩa, không bị xoá). */
export function parseIndex(text: string | null): DraftIndex {
  if (!text) return EMPTY_INDEX;
  try {
    const j = JSON.parse(text) as Partial<DraftIndex>;
    const seen = new Set<string>();
    const items: DraftItem[] = [];
    for (const it of Array.isArray(j.items) ? j.items : []) {
      if (!it || typeof it.id !== 'string' || !ID_OK.test(it.id) || it.id === INDEX_SLOT || seen.has(it.id)) continue;
      seen.add(it.id);
      items.push({ id: it.id, name: cleanName(typeof it.name === 'string' ? it.name : '') || it.id });
      if (items.length >= MAX_DRAFTS) break;
    }
    const active = typeof j.active === 'string' && (j.active === '' || seen.has(j.active)) ? j.active : '';
    return { v: 1, items, active };
  } catch { return EMPTY_INDEX; }
}

export const serializeIndex = (ix: DraftIndex): string => JSON.stringify(ix);

/** id mới, không trùng id cũ, không trùng tên ngăn dành riêng */
export function newId(ix: DraftIndex, now: number = Date.now()): string {
  const used = new Set(ix.items.map((i) => i.id));
  let id = `b${now.toString(36)}`;
  for (let k = 1; used.has(id) || id === INDEX_SLOT; k++) id = `b${now.toString(36)}-${k}`;
  return id;
}

export const nameOf = (ix: DraftIndex, id: string): string => (id === '' ? MAIN_NAME : ix.items.find((i) => i.id === id)?.name ?? MAIN_NAME);

export function addDraft(ix: DraftIndex, name: string, now?: number): { ix: DraftIndex; id: string } | { error: string } {
  if (ix.items.length >= MAX_DRAFTS) return { error: `Tối đa ${MAX_DRAFTS} bàn nháp riêng.` };
  const id = newId(ix, now);
  const nm = cleanName(name) || `Bàn nháp ${ix.items.length + 2}`;
  return { ix: { ...ix, items: [...ix.items, { id, name: nm }], active: id }, id };
}

export const renameDraft = (ix: DraftIndex, id: string, name: string): DraftIndex => {
  const nm = cleanName(name);
  if (!nm || id === '') return ix;
  return { ...ix, items: ix.items.map((i) => (i.id === id ? { ...i, name: nm } : i)) };
};

export const removeDraft = (ix: DraftIndex, id: string): DraftIndex => ({ ...ix, items: ix.items.filter((i) => i.id !== id), active: ix.active === id ? '' : ix.active });
export const setActive = (ix: DraftIndex, id: string): DraftIndex => (id === '' || ix.items.some((i) => i.id === id) ? { ...ix, active: id } : ix);

export async function loadIndex(): Promise<DraftIndex> {
  try { return parseIndex((await loadDraft(INDEX_SLOT)).text); } catch { return EMPTY_INDEX; }
}
export const saveIndex = (ix: DraftIndex): Promise<void> => saveDraft(serializeIndex(ix), INDEX_SLOT);
export { deleteDraft };
