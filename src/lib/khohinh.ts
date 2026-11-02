// Kho hình TikZ (giai đoạn 1: lưu trữ, nạp, tìm, thêm/sửa/xoá). Lưu ở tệp riêng kho-hinh.db trong thư mục dữ liệu của app (Rust: khohinh.rs),
// KHÔNG nằm trong ngân hàng câu hỏi. Nguồn MathHub chỉ dùng trên máy, không đóng vào bản cài, không đưa vào repo.
import { invoke, listen } from './platform';

export interface KhoTrangThai { co: boolean; hinh: number; thung_rac: number; nut: number; nap_luc: number | null; kich_thuoc: number }
export interface KhoNapKetQua { tong: number; moi: number; da_co: number; trung: number; loi: number; nut: number; ms: number }
export interface KhoNut { id: string; parent_id: string | null; name: string; sort: number; dem: number }
export interface KhoMuc { id: string; title: string; node_id: string; grades: string; kind: string; status: string; code_len: number }
export interface KhoKetQua { tong: number; muc: KhoMuc[] }
export interface KhoHinh {
  id: string; node_id: string; title: string; code: string; extra_preamble: string; grades: string; topics: string; kind: string; source_key: string;
  status: string; err: string; nguon: string; edited: boolean; da_xoa: boolean;
}
export interface KhoHinhMoi { node_id: string; title: string; code: string; extra_preamble?: string; grades?: string; topics?: string; kind?: string | null }
export type KhoHinhSua = Partial<Omit<KhoHinhMoi, 'extra_preamble'>> & { extra_preamble?: string };

/** Loại hình (do mã tự nhận, sửa tay được). */
export const KHO_LOAI: Readonly<Record<string, string>> = { bbt: 'Bảng biến thiên', '3d': 'Hình không gian', 'do-thi': 'Đồ thị', 'tkz-euclide': 'Hình học (tkz-euclide)', khac: 'Khác' };
export const loaiText = (k: string): string => KHO_LOAI[k] ?? k;

export const khoTrangThai = () => invoke<KhoTrangThai>('kho_hinh_trang_thai');
/** Nạp từ một tệp kho MathHub (.db). Đọc chỉ đọc; nạp lại không ghi đè hình đã có hay đã sửa/xoá. */
export const khoNap = (path: string) => invoke<KhoNapKetQua>('kho_hinh_nap', { path });
export const khoCay = () => invoke<KhoNut[]>('kho_hinh_cay');
export const khoTim = (o: { q?: string; node?: string | null; kind?: string | null; lop?: string | null; status?: string | null; thungRac?: boolean; offset?: number; limit?: number }) =>
  invoke<KhoKetQua>('kho_hinh_tim', { q: o.q ?? '', node: o.node ?? null, kind: o.kind ?? null, lop: o.lop ?? null, status: o.status ?? null, thungRac: o.thungRac ?? false, offset: o.offset ?? 0, limit: o.limit ?? 60 });
export const khoLay = (id: string) => invoke<KhoHinh | null>('kho_hinh_lay', { id });
export const khoThem = (hinh: KhoHinhMoi) => invoke<string>('kho_hinh_them', { hinh });
export const khoSua = (id: string, suaDoi: KhoHinhSua) => invoke<void>('kho_hinh_sua', { id, suaDoi });
/** Xoá vào thùng rác (xoaDi = true) hoặc khôi phục (false). */
export const khoXoa = (ids: string[], xoaDi: boolean) => invoke<number>('kho_hinh_xoa', { ids, xoaDi });
/** Ghi kết quả dịch thử khi vẽ ảnh thu nhỏ (ok | loi | chua). */
export const khoDatTrangThai = (items: { id: string; status: 'ok' | 'loi' | 'chua'; err?: string }[]) => invoke<number>('kho_hinh_dat_trang_thai', { items: items.map((x) => ({ id: x.id, status: x.status, err: x.err ?? '' })) });
export const khoNutThem = (parent: string | null, name: string) => invoke<string>('kho_hinh_nut_them', { parent, name });
export const khoNutDoiTen = (id: string, name: string) => invoke<void>('kho_hinh_nut_doi_ten', { id, name });
export const khoNutChuyen = (id: string, moiCha: string | null) => invoke<void>('kho_hinh_nut_chuyen', { id, moiCha });
export const khoNutXoa = (id: string) => invoke<void>('kho_hinh_nut_xoa', { id });
/** Tiến độ lúc nạp: sau mỗi lô 1.000 hình. */
export const onKhoTienDo = (cb: (p: { da: number; tong: number }) => void) => listen<{ da: number; tong: number }>('kho-hinh:tien-do', cb);

type Dlg = { open?(o: { title?: string; directory?: boolean; multiple?: boolean; filters?: { name: string; extensions: string[] }[] }): Promise<string | string[] | null> };
const dlg = (): Dlg | undefined => (typeof window !== 'undefined' ? (window.__TAURI__?.dialog as Dlg | undefined) : undefined);
export async function chooseKhoFile(): Promise<string | null> {
  const d = dlg();
  if (!d?.open) return null;
  const r = await d.open({ title: 'Chọn tệp kho hình MathHub (.db)', multiple: false, directory: false, filters: [{ name: 'Kho hình (.db)', extensions: ['db'] }] });
  return r == null ? null : Array.isArray(r) ? r[0] ?? null : r;
}

export function kichThuocText(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1048576).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}
