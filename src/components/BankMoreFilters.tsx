// Nút "Bộ lọc ▾" trên thanh công cụ màn Ngân hàng: Hình, Duyệt, Nhãn (Mức độ và Loại câu đã nằm trên thanh thống kê).
import { useEffect, useRef, useState } from 'react';
import { FIGURE_LABEL, type FigureFilter } from '../lib/figure';
import type { BankFilters, Facets } from '../lib/bankfilter';
import { REVIEW_LABEL, type ReviewFilter } from '../lib/types';
import { FieldMenu, type FieldOption } from './FieldMenu';

const FIG_HINT = 'Phân tích mã LaTeX: có TikZ/ảnh ở đề, nhóm hình \\immini, phương án hoặc phần đuôi. Hình chỉ nằm trong lời giải không tính. “Chưa xác định” = có lệnh lạ chưa biết có phải hình không.';

/** Lọc theo trạng thái xác minh Dạng (áp sau bộ lọc chính). */
export type IdFilter = 'all' | 'chua' | 'may' | 'gv' | 'xem-lai' | 'chua-phan-loai';
const ID_LABEL: Record<Exclude<IdFilter, 'all'>, string> = { chua: 'Chưa xác minh', may: 'Máy phân loại', gv: 'Giáo viên xác minh', 'xem-lai': 'Cần xem lại', 'chua-phan-loai': 'Chưa có ID' };

/** Số bộ lọc đang bật trong nút này. */
export const moreCount = (f: BankFilters, idF: IdFilter = 'all'): number => (f.figure !== 'all' ? 1 : 0) + (f.review !== 'all' ? 1 : 0) + (f.tag ? 1 : 0) + (idF !== 'all' ? 1 : 0);

interface Props {
  f: BankFilters; facets: Facets; onF(next: BankFilters): void; idF: IdFilter; onIdF(v: IdFilter): void;
  /** bỏ MỌI bộ lọc (kể cả Mức/Kiểu trên thanh thống kê), giữ mục đang xem */
  onClearAll(): void;
  /** về toàn bộ ngân hàng: bỏ mục đang xem, bộ lọc, chữ tìm */
  onResetAll(): void;
  canReset: boolean;
  /** số bộ lọc đang bật trên toàn màn (Mức, Kiểu, Hình, Duyệt, Dạng, Nhãn) */
  nAll: number;
}

export function BankMoreFilters({ f, facets, onF, idF, onIdF, onClearAll, onResetAll, canReset, nAll }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    // FieldMenu mở danh sách ra ngoài khung bằng cổng (portal) ⇒ chỉ đóng khi bấm ngoài cả khung lẫn danh sách đang mở
    const h = (e: MouseEvent) => { const t = e.target as HTMLElement; if (!box.current?.contains(t) && !t.closest?.('.fm-pop, [role="listbox"]')) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.fm-pop, [role="listbox"]')) { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open]);

  const figOpts: FieldOption[] = (['yes', 'no', 'unknown'] as const)
    .filter((k) => k !== 'unknown' || facets.figure.unknown > 0 || f.figure === 'unknown')
    .map((k) => ({ id: k, label: FIGURE_LABEL[k], count: facets.figure[k] }));
  const revOpts: FieldOption[] = (['unreviewed', 'needs_fix', 'approved'] as const).map((r) => ({ id: r, label: REVIEW_LABEL[r], count: facets.review[r] }));
  const tagOpts: FieldOption[] = [...facets.tag].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi')).map(([t, n]) => ({ id: t, label: t, count: n }));
  if (f.tag && !facets.tag.has(f.tag)) tagOpts.unshift({ id: f.tag, label: f.tag, count: 0 });
  const n = moreCount(f, idF);
  const idOpts: FieldOption[] = (Object.keys(ID_LABEL) as Exclude<IdFilter, 'all'>[]).map((k) => ({ id: k, label: ID_LABEL[k] }));

  return (
    <span className="mf" ref={box}>
      <button ref={btn} type="button" className={`btn btn-sm${n ? ' on' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)} title="Lọc theo Hình, Duyệt, Dạng, Nhãn">
        Bộ lọc{n > 0 && <i className="fs-badge">{n}</i>} ▾
      </button>
      {open && (
        <div className="mf-pop" role="dialog" aria-label="Bộ lọc khác">
          <FieldMenu
            label="Hình" summary={f.figure === 'all' ? 'Tất cả' : FIGURE_LABEL[f.figure]} active={f.figure !== 'all'} hint={FIG_HINT} onReset={() => onF({ ...f, figure: 'all' })}
            options={figOpts} selected={f.figure === 'all' ? null : f.figure} onPick={(id) => onF({ ...f, figure: (id ?? 'all') as FigureFilter })}
            allLabel="Tất cả" allCount={facets.figure.yes + facets.figure.no + facets.figure.unknown}
          />
          <FieldMenu
            label="Duyệt" summary={f.review === 'all' ? 'Tất cả' : REVIEW_LABEL[f.review]} active={f.review !== 'all'} onReset={() => onF({ ...f, review: 'all' })}
            options={revOpts} selected={f.review === 'all' ? null : f.review} onPick={(id) => onF({ ...f, review: (id ?? 'all') as ReviewFilter })}
            allLabel="Tất cả" allCount={facets.review.unreviewed + facets.review.needs_fix + facets.review.approved}
          />
          <FieldMenu
            label="Dạng" summary={idF === 'all' ? 'Tất cả' : ID_LABEL[idF]} active={idF !== 'all'} hint="Trạng thái xác minh Dạng của câu" onReset={() => onIdF('all')}
            options={idOpts} selected={idF === 'all' ? null : idF} onPick={(id) => onIdF((id ?? 'all') as IdFilter)} allLabel="Tất cả"
          />
          <FieldMenu
            label="Nhãn" summary={f.tag ?? 'Tất cả'} active={!!f.tag} searchable hint="Nhãn gắn khi nhập (Nguồn, Lô, Thư mục) hoặc do bạn tự đặt" onReset={() => onF({ ...f, tag: null })}
            options={tagOpts} selected={f.tag} onPick={(id) => onF({ ...f, tag: id })}
            allLabel="Tất cả" allCount={facets.tagAll}
          />
          <div className="mf-foot">
            <button type="button" className="btn btn-sm" disabled={nAll === 0} onClick={onClearAll} title="Bỏ mọi bộ lọc (Mức, Kiểu, Hình, Duyệt, Dạng, Nhãn); giữ nguyên mục đang xem">Xoá bộ lọc{nAll > 0 ? ` (${nAll})` : ''}</button>
            <button type="button" className="btn btn-sm" disabled={!canReset} onClick={onResetAll} title="Về toàn bộ ngân hàng: bỏ mục đang xem, bộ lọc và chữ tìm. Các câu đã tick vẫn giữ">Đặt lại toàn bộ</button>
            <button type="button" className="btn btn-sm btn-dark" onClick={() => { setOpen(false); btn.current?.focus(); }}>Xong</button>
          </div>
        </div>
      )}
    </span>
  );
}
