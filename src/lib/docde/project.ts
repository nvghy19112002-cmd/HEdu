// Dự án "Đọc đề": dữ liệu thuần (lưu thành state.json qua lệnh ocr_proj_save) + các phép tính không cần giao diện.
export type Loai = 'cau' | 'hinh' | 'bbt' | 'dapan';
export type Phan = 'I' | 'II' | 'III' | 'IV' | '';
export type Box = [number, number, number, number]; // [ymin, xmin, ymax, xmax], thang 0–1000 (box_2d của Gemini)

export interface Khung { id: string; page: number; loai: Loai; box: Box; phan: Phan; cau: string; vatTrang?: boolean }
export type KieuTrang = 'de' | 'dapan' | 'loigiai' | 'bo';
export interface Trang { n: number; file: string; no: number; kieu: KieuTrang; trangThai: 'cho' | 'xong' | 'loi' }
export interface Lo { pages: number[]; trangThai: 'cho' | 'doc' | 'xong' | 'loi'; loi?: string }
export interface Cau { id: string; lo: number; soNguon: string; phan: Phan; dang: 'tn' | 'ds' | 'tln' | 'tl'; tex: string; orig: string; canXacMinh: string[]; ok: number[]; loi: string[] }

export interface Project {
  v: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  files: { name: string; pages: number }[];
  pages: Trang[];
  /** 0 Nguồn · 1 Bố cục · 2 Chép chữ · 3 Gắn khoá · 4 Dựng hình · 5 Soát · 6 Xuất */
  step: number;
  boCuc: { chot: boolean; khung: Khung[] };
  chep: { lo: Lo[]; cau: Cau[] };
  model: string;
}

export const STEPS = ['Nguồn', 'Bố cục', 'Chép chữ', 'Gắn khoá', 'Dựng hình', 'Soát', 'Xuất'] as const;

export function newProject(name: string, model: string, now = Date.now()): Project {
  const id = `p${new Date(now).toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 8)}`;
  return { v: 1, id, name: name.trim() || 'Dự án đọc đề', createdAt: now, updatedAt: now, files: [], pages: [], step: 0, boCuc: { chot: false, khung: [] }, chep: { lo: [], cau: [] }, model };
}

/** Đọc state.json; hỏng/khác phiên bản ⇒ null (không làm sập màn). */
export function parseProject(json: string): Project | null {
  try {
    const p = JSON.parse(json) as Project;
    return p && p.v === 1 && typeof p.id === 'string' && Array.isArray(p.pages) && p.boCuc && p.chep ? p : null;
  } catch { return null; }
}

const clamp = (n: number) => Math.max(0, Math.min(1000, Math.round(n)));
/** Dịch khung (mũi tên) hoặc đổi cỡ (Shift+mũi tên); luôn giữ trong trang và cao/rộng ≥ 10. */
export function nudge(b: Box, dx: number, dy: number, resize = false): Box {
  if (resize) return [b[0], b[1], clamp(Math.max(b[0] + 10, b[2] + dy)), clamp(Math.max(b[1] + 10, b[3] + dx))];
  const h = b[2] - b[0], w = b[3] - b[1];
  const y = Math.max(0, Math.min(1000 - h, b[0] + dy)), x = Math.max(0, Math.min(1000 - w, b[1] + dx));
  return [y, x, y + h, x + w];
}
/** Gộp các khung thành một khung bao (giữ loại/phần/câu của khung đầu). */
export function gop(ks: Khung[]): Khung | null {
  if (ks.length < 2 || ks.some((k) => k.page !== ks[0].page)) return null;
  const b: Box = [Math.min(...ks.map((k) => k.box[0])), Math.min(...ks.map((k) => k.box[1])), Math.max(...ks.map((k) => k.box[2])), Math.max(...ks.map((k) => k.box[3]))];
  return { ...ks[0], box: b };
}
/** Tách khung theo chiều ngang thành hai nửa. */
export function tach(k: Khung, newId: string): [Khung, Khung] {
  const mid = Math.round((k.box[0] + k.box[2]) / 2);
  return [{ ...k, box: [k.box[0], k.box[1], mid, k.box[3]] }, { ...k, id: newId, cau: '', box: [mid, k.box[1], k.box[2], k.box[3]] }];
}

/** Đếm câu theo phần (một câu vắt trang có thể có 2 khung cùng số ⇒ đếm một). Thiếu số liên tiếp ⇒ báo. */
export function demTheoPhan(khung: Khung[]): { phan: Phan; so: number; thieu: number[] }[] {
  const out: { phan: Phan; so: number; thieu: number[] }[] = [];
  for (const ph of ['I', 'II', 'III', 'IV', ''] as Phan[]) {
    const nums = [...new Set(khung.filter((k) => k.loai === 'cau' && k.phan === ph).map((k) => Number.parseInt(k.cau, 10)).filter((n) => n > 0))].sort((a, b) => a - b);
    const all = khung.filter((k) => k.loai === 'cau' && k.phan === ph);
    if (!all.length) continue;
    const thieu: number[] = [];
    for (let i = 1; nums.length && i < nums[nums.length - 1]; i++) if (!nums.includes(i)) thieu.push(i);
    out.push({ phan: ph, so: new Set(all.map((k) => k.cau || k.id)).size, thieu });
  }
  return out;
}

/** Chia các trang có đề thành lô `size` trang liên tiếp (trang bìa/lời giải bỏ; trang bảng đáp án vẫn đi kèm để lấy khoá). */
export function chiaLo(pages: Trang[], size = 3): number[][] {
  const ns = pages.filter((p) => p.kieu === 'de' || p.kieu === 'dapan').map((p) => p.n);
  const out: number[][] = [];
  for (let i = 0; i < ns.length; i += size) out.push(ns.slice(i, i + size));
  return out;
}

const LOAI_TEN: Record<Loai, string> = { cau: 'cau', hinh: 'hinh', bbt: 'bang bien thien', dapan: 'bang dap an' };
/** Lời nhắn cho một lô: bố cục đã duyệt (số thứ tự hình để đặt mốc %%%HINH-n%%%) + 15 dòng cuối lô trước. */
export function loiNhanLo(p: Project, lo: number[], duoiLoTruoc: string): string {
  const hinhSo = new Map(p.boCuc.khung.filter((k) => k.loai === 'hinh' || k.loai === 'bbt').map((k, i) => [k.id, i + 1]));
  const lines = lo.map((n, i) => {
    const ks = p.boCuc.khung.filter((k) => k.page === n).sort((a, b) => a.box[0] - b.box[0] || a.box[1] - b.box[1]);
    const ds = ks.map((k) => `  - ${LOAI_TEN[k.loai]}${k.phan ? ` phan ${k.phan}` : ''}${k.cau ? ` cau ${k.cau}` : ''}${hinhSo.has(k.id) ? ` => moc %%%HINH-${hinhSo.get(k.id)}%%%` : ''} box_2d=[${k.box.join(',')}]${k.vatTrang ? ' (vat sang trang sau)' : ''}`);
    return `Anh ${i + 1} = trang ${n}:\n${ds.join('\n') || '  (khong co khung)'}`;
  });
  const truoc = duoiLoTruoc.trim() ? `\nCuoi lo truoc (de noi cau vat trang, KHONG chep lai):\n${duoiLoTruoc.trim().split('\n').slice(-15).join('\n')}\n` : '';
  return `Chep cac anh trang theo bo cuc da duyet duoi day (dung dung so cau, dat moc hinh dung cho).\n${lines.join('\n')}\n${truoc}Tra JSON dung khuon.`;
}

/** Như chiaLo nhưng không cắt ngang câu vắt trang: trang cuối lô còn câu vắt ⇒ kéo trang kế vào lô (tối đa 4 trang). */
export function chiaLoNoi(pages: Trang[], khung: Khung[], size = 3): number[][] {
  const los = chiaLo(pages, size);
  for (let i = 0; i < los.length - 1; i++) {
    const last = los[i][los[i].length - 1];
    if (los[i].length < 4 && khung.some((k) => k.page === last && k.loai === 'cau' && k.vatTrang)) los[i].push(los[i + 1].shift()!);
  }
  return los.filter((l) => l.length);
}
