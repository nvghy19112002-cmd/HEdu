// Thanh "Mục lục" của màn Ngân hàng: cây thư mục Lớp → (Phân môn) → Chương → Bài → Dạng, có số câu.
// Mức độ và Loại câu lọc bằng nút trên thanh thống kê; Hình, Duyệt, Nhãn ở nút "Bộ lọc ▾" trên thanh công cụ.
// Dùng cho cả kiểu gắn cố định bên trái và kiểu ngăn trượt khi cửa sổ hẹp/đã ẩn mục lục (cùng một thành phần, cùng một trạng thái).
import { pickGrade, pickNoId, type BankFilters, type Facets } from '../lib/bankfilter';
import { pickPath } from '../lib/banktree';
import type { Taxonomy } from '../lib/types';
import { BankTree } from './BankTree';

export interface BankSidebarProps {
  tax: Taxonomy;
  f: BankFilters;
  facets: Facets;
  /** Đang tìm "toàn kho" (có chữ tìm): mục lục tạm không áp dụng */
  wide: boolean;
  onF: (next: BankFilters) => void;
  onHide: () => void;
  variant: 'dock' | 'drawer';
}

export function BankSidebar({ tax, f, facets, wide, onF, onHide, variant }: BankSidebarProps) {
  return (
    <aside className={`fside${variant === 'drawer' ? ' is-drawer' : ''}`} aria-label="Mục lục">
      <div className="fs-top">
        <h2 title={tax.name}>Cây mục lục</h2>
        {variant === 'drawer' && <button type="button" className="btn btn-sm" onClick={onHide} title="Đóng (Esc)">Đóng ✕</button>}
      </div>

      <div className="fs-scroll">
        <div className={`fs-block${wide ? ' is-off' : ''}`}>
          {wide && <p className="fs-note" role="note">Đang tìm trong toàn kho nên mục lục tạm không áp dụng. Xoá chữ tìm để lọc theo mục lục.</p>}
          <BankTree tax={tax} path={{ gradeId: f.gradeId, branchId: f.branchId, chapterId: f.chapterId, lessonId: f.lessonId, formId: f.formId }} counts={facets.node} total={facets.gradeAll} off={wide}
            onPick={(p) => onF(p ? pickPath(f, p) : pickGrade(f, null))}
            noId={{ total: facets.noId, by: facets.noIdBy, sel: f.noId, onPick: (v) => onF(pickNoId(f, v)) }} />
        </div>
      </div>

    </aside>
  );
}
