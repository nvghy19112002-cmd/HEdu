// Trạng thái rỗng của màn Ngân hàng: nói đúng vì sao không có câu nào và cho thao tác nhanh nhất để thấy câu.
import { attrChips, dropAttr, emptyKind, pickBranch, pickChapter, pickForm, pickGrade, pickLesson, type BankFilters, type Facets } from '../lib/bankfilter';
import { gradeLabel, shortName } from '../lib/taxonomy';
import type { Taxonomy } from '../lib/types';

const nf = new Intl.NumberFormat('vi-VN');

export interface BankEmptyProps {
  tax: Taxonomy;
  f: BankFilters;
  facets: Facets;
  totalQuestions: number;
  text: string;
  wide: boolean;
  onF: (f: BankFilters) => void;
  onClearText: () => void;
  onWide: () => void;
  onClearAttrs: () => void;
  onNew: () => void;
  onImport: () => void;
}

/** Bước lên một cấp của vị trí đang xem, kèm tên và số câu của cấp đó (null nếu đã ở ngoài cùng). */
function stepUp(tax: Taxonomy, f: BankFilters, facets: Facets): { label: string; count: number; to: BankFilters } | null {
  const grade = tax.grades.find((g) => g.id === f.gradeId);
  if (!grade) return null;
  const branch = grade.branches.find((b) => b.id === f.branchId);
  const chapter = grade.branches.flatMap((b) => b.chapters).find((c) => c.id === f.chapterId);
  const lesson = chapter?.lessons.find((l) => l.id === f.lessonId);
  if (f.formId && lesson) return { label: shortName(lesson.name), count: facets.lesson.get(lesson.id) ?? 0, to: pickForm(f, null) };
  if (f.lessonId && chapter) return { label: shortName(chapter.name), count: facets.chapter.get(chapter.id) ?? 0, to: pickLesson(f, null) };
  if (f.chapterId && chapter) return branch
    ? { label: shortName(branch.name), count: facets.branch.get(branch.id) ?? 0, to: pickChapter(tax, f, null) }
    : { label: gradeLabel(grade), count: facets.grade.get(grade.id) ?? 0, to: pickChapter(tax, f, null) };
  if (f.branchId && branch) return { label: gradeLabel(grade), count: facets.grade.get(grade.id) ?? 0, to: pickBranch(f, null) };
  return { label: 'toàn bộ ngân hàng', count: facets.gradeAll, to: pickGrade(f, null) };
}

export function BankEmpty(p: BankEmptyProps) {
  const { tax, f, facets } = p;
  const kind = emptyKind(facets, f, { totalQuestions: p.totalQuestions, hasText: p.text.trim().length > 0, wide: p.wide });
  if (!kind) return null;

  if (kind === 'bank') {
    return (
      <div className="bk-empty" role="status">
        <h3>Ngân hàng đang trống</h3>
        <p>Bấm “+ Câu hỏi mới” để soạn câu đầu tiên, hoặc nhập cả file .tex ở mục Nhập liệu.</p>
        <div className="be-acts">
          <button type="button" className="btn btn-accent" onClick={p.onNew}>+ Câu hỏi mới</button>
          <button type="button" className="btn btn-outline" onClick={p.onImport}>Nhập từ file</button>
        </div>
      </div>
    );
  }

  if (kind === 'scope') {
    const up = stepUp(tax, f, facets);
    return (
      <div className="bk-empty" role="status">
        <h3>Mục này chưa có câu nào</h3>
        <p>Chưa có câu hỏi nào được gán vào mục đang xem{facets.inScope === 0 ? ' (dù không lọc gì thêm).' : '.'}</p>
        <div className="be-acts">
          <button type="button" className="btn btn-accent" onClick={p.onNew}>+ Câu hỏi mới</button>
          <button type="button" className="btn btn-outline" onClick={p.onImport}>Nhập từ file</button>
          {up && up.count > 0 && <button type="button" className="btn btn-outline" onClick={() => p.onF(up.to)}>Xem cả {up.label} ({nf.format(up.count)} câu)</button>}
        </div>
      </div>
    );
  }

  if (kind === 'filters') {
    const chips = attrChips(f, facets);
    return (
      <div className="bk-empty" role="status">
        <h3>{p.wide ? 'Không có câu nào khớp bộ lọc' : `Có ${nf.format(facets.inScope)} câu trong mục này, nhưng bộ lọc đã loại hết`}</h3>
        <p>Bỏ một điều kiện để thấy câu (số trong ô là số câu sẽ có):</p>
        <div className="be-chips">
          {chips.map((c) => (
            <span key={c.key} className="be-chip">
              <span title={c.label}>{c.label}</span>
              <em>→ {nf.format(c.after)}</em>
              <button type="button" aria-label={`Bỏ điều kiện ${c.label}`} onClick={() => p.onF(dropAttr(f, c.key))}>✕</button>
            </span>
          ))}
        </div>
        <div className="be-acts">
          <button type="button" className="btn btn-outline" onClick={p.onClearAttrs}>Xoá bộ lọc ({chips.length})</button>
          {p.text.trim() && <button type="button" className="btn btn-outline" onClick={p.onClearText}>Xoá chữ tìm</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="bk-empty" role="status">
      <h3>Không có câu nào chứa “{p.text.trim()}”{p.wide ? '' : ' trong mục này'}</h3>
      <p>{p.wide ? 'Đã tìm trong toàn bộ ngân hàng. Thử bớt từ khoá hoặc gõ mã câu (vd 2D1H1).' : 'Câu có thể nằm ở mục khác của ngân hàng.'}</p>
      <div className="be-acts">
        {!p.wide && <button type="button" className="btn btn-accent" onClick={p.onWide}>Tìm trong toàn kho</button>}
        <button type="button" className="btn btn-outline" onClick={p.onClearText}>Xoá chữ tìm</button>
      </div>
    </div>
  );
}
