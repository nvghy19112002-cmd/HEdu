// Thanh "Mục lục" của màn Ngân hàng: cây thư mục Lớp → (Phân môn) → Chương → Bài → Dạng, có số câu.
// Mức độ và Loại câu lọc bằng nút trên thanh thống kê; Hình, Duyệt, Nhãn ở nút "Bộ lọc ▾" trên thanh công cụ.
// Dùng cho cả kiểu gắn cố định bên trái và kiểu ngăn trượt khi cửa sổ hẹp/đã ẩn mục lục (cùng một thành phần, cùng một trạng thái).
import { attrCount, pickGrade, type BankFilters, type Facets } from '../lib/bankfilter';
import { pickPath } from '../lib/banktree';
import type { Taxonomy } from '../lib/types';
import { BankTree } from './BankTree';

const nf = new Intl.NumberFormat('vi-VN');

export interface BankSidebarProps {
  tax: Taxonomy;
  f: BankFilters;
  facets: Facets;
  /** Đang tìm "toàn kho" (có chữ tìm): mục lục tạm không áp dụng */
  wide: boolean;
  onF: (next: BankFilters) => void;
  onClearAttrs: () => void;
  onResetAll: () => void;
  /** có gì để đặt lại (vị trí, bộ lọc, chữ tìm) */
  canReset: boolean;
  onHide: () => void;
  variant: 'dock' | 'drawer';
}

export function BankSidebar({ tax, f, facets, wide, onF, onClearAttrs, onResetAll, canReset, onHide, variant }: BankSidebarProps) {
  const nAttr = attrCount(f);
  return (
    <aside className={`fside${variant === 'drawer' ? ' is-drawer' : ''}`} aria-label="Mục lục">
      <div className="fs-top">
        <h2 title={tax.name}>Cây mục lục</h2>
        <button type="button" className="btn btn-sm" onClick={onHide} title={variant === 'drawer' ? 'Đóng (Esc)' : 'Ẩn thanh này'}>{variant === 'drawer' ? 'Đóng ✕' : 'Ẩn ◀'}</button>
      </div>

      <div className="fs-scroll">
        <div className={`fs-block${wide ? ' is-off' : ''}`}>
          {wide && <p className="fs-note" role="note">Đang tìm trong toàn kho nên mục lục tạm không áp dụng. Xoá chữ tìm để lọc theo mục lục.</p>}
          <BankTree tax={tax} path={{ gradeId: f.gradeId, branchId: f.branchId, chapterId: f.chapterId, lessonId: f.lessonId, formId: f.formId }} counts={facets.node} total={facets.gradeAll} off={wide}
            onPick={(p) => onF(p ? pickPath(f, p) : pickGrade(f, null))} />
        </div>
      </div>

      <div className="fs-foot">
        <p className="fs-count" aria-live="polite">Đang hiện <b>{nf.format(facets.list.length)}</b> / {nf.format(facets.scoped)} câu</p>
        <div className="fs-btns">
          <button type="button" className="btn btn-sm" disabled={nAttr === 0} onClick={onClearAttrs} title="Bỏ mọi bộ lọc Mức độ, Loại câu, Hình, Duyệt, Nhãn; giữ nguyên mục đang xem">Xoá bộ lọc{nAttr > 0 ? ` (${nAttr})` : ''}</button>
          <button type="button" className="btn btn-sm" disabled={!canReset} onClick={onResetAll} title="Về toàn bộ ngân hàng: bỏ mục đang xem, bộ lọc và chữ tìm. Các câu đã tick vẫn giữ">Đặt lại toàn bộ</button>
        </div>
      </div>
    </aside>
  );
}
