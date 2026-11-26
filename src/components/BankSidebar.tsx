// Thanh "Mục lục" của màn Ngân hàng: cây thư mục Lớp → (Phân môn) → Chương → Bài → Dạng, có số câu.
// Mức độ và Loại câu lọc bằng nút trên thanh thống kê; Hình, Duyệt, Nhãn ở nút "Bộ lọc ▾" trên thanh công cụ.
// Dùng cho cả kiểu gắn cố định bên trái và kiểu ngăn trượt khi cửa sổ hẹp/đã ẩn mục lục (cùng một thành phần, cùng một trạng thái).
import { useEffect, useRef } from 'react';
import { pickGrade, pickNoId, type BankFilters, type Facets } from '../lib/bankfilter';
import { pickPath, type NodeStat } from '../lib/banktree';
import type { Taxonomy } from '../lib/types';
import { CurriculumTree } from './CurriculumTree';

export interface BankSidebarProps {
  tax: Taxonomy;
  f: BankFilters;
  facets: Facets;
  /** thống kê từng mục trên toàn kho (nodeStats) */
  stats: ReadonlyMap<string, NodeStat>;
  /** Đang tìm "toàn kho" (có chữ tìm): mục lục tạm không áp dụng */
  wide: boolean;
  onF: (next: BankFilters) => void;
  onHide: () => void;
  variant: 'dock' | 'drawer';
}

/** Khung gắn cố định: cao vừa đúng chỗ trống còn lại của cửa sổ (đổi theo khi cuộn trang/đổi cỡ), để cây mục lục dùng hết chiều cao mà không lấn ra ngoài. */
function useFitHeight(on: boolean) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!on || !el) return;
    let raf = 0;
    const fit = () => { raf = 0; const top = Math.max(16, el.getBoundingClientRect().top); el.style.maxHeight = `${Math.max(240, Math.floor(window.innerHeight - top - 16))}px`; };
    const later = () => { if (!raf) raf = requestAnimationFrame(fit); };
    fit();
    window.addEventListener('scroll', later, { passive: true });
    window.addEventListener('resize', later);
    return () => { window.removeEventListener('scroll', later); window.removeEventListener('resize', later); cancelAnimationFrame(raf); el.style.maxHeight = ''; };
  }, [on]);
  return ref;
}

export function BankSidebar({ tax, f, facets, stats, wide, onF, onHide, variant }: BankSidebarProps) {
  const ref = useFitHeight(variant === 'dock');
  return (
    <aside ref={ref} className={`fside${variant === 'drawer' ? ' is-drawer' : ''}`} aria-label="Mục lục">
      {variant === 'drawer' && <div className="fs-top"><h2 title={tax.name}>Mục lục</h2><button type="button" className="btn btn-sm" onClick={onHide} title="Đóng (Esc)">Đóng ✕</button></div>}
      <CurriculumTree tax={tax} path={{ gradeId: f.gradeId, branchId: f.branchId, chapterId: f.chapterId, lessonId: f.lessonId, formId: f.formId }} counts={facets.node} total={facets.gradeAll}
        stats={stats} off={wide} allOn={!!f.all}
        onPick={(p) => onF(p ? pickPath(f, p) : pickGrade(f, null))}
        noId={{ total: facets.noId, sel: f.noId, onPick: (v) => onF(pickNoId(f, v)) }} />

    </aside>
  );
}
