// Thanh "Mục lục & bộ lọc" của màn Ngân hàng — MỘT nơi duy nhất chứa mọi bộ lọc.
// Hai nhóm: THEO CHƯƠNG TRÌNH (Lớp → Phân môn → Chương → Bài → Dạng) và LỌC CÂU HỎI (Mức độ, Loại câu, Hình, Kiểm duyệt).
// Dùng cho cả kiểu gắn cố định bên trái và kiểu ngăn trượt khi cửa sổ hẹp/đã ẩn mục lục (cùng một thành phần, cùng một trạng thái).
import { FIGURE_LABEL, type FigureFilter } from '../lib/figure';
import { attrCount, attrGroups, pickBranch, pickChapter, pickForm, pickGrade, pickLesson, type BankFilters, type Facets } from '../lib/bankfilter';
import { branchShort, gradeLabel, shortName } from '../lib/taxonomy';
import { LEVEL_LABEL, LEVELS, REVIEW_LABEL, TYPE_LABEL, TYPES, type Level, type QType, type ReviewFilter, type Taxonomy } from '../lib/types';
import { FieldMenu, type FieldOption } from './FieldMenu';

const nf = new Intl.NumberFormat('vi-VN');
/** Tối đa bấy nhiêu lựa chọn thì hiện thành nút bấm; nhiều hơn thì chuyển thành ô chọn có tìm kiếm (để mở rộng nhiều lớp, nhiều phân môn). */
const SEG_MAX = 3;
const FIG_HINT = 'Phân tích mã LaTeX: có TikZ/ảnh ở đề, nhóm hình \\immini, phương án hoặc phần đuôi. Hình chỉ nằm trong lời giải không tính. “Chưa xác định” = có lệnh lạ chưa biết có phải hình không.';

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
  const grade = tax.grades.find((g) => g.grade === f.gradeNum) ?? null;
  const branches = grade?.branches ?? [];
  const branch = branches.find((b) => b.id === f.branchId) ?? null;
  const gradeOpts: FieldOption[] = tax.grades.map((g) => ({ id: String(g.grade), label: gradeLabel(g), count: facets.grade.get(g.grade) ?? 0 }));
  const branchOpts: FieldOption[] = branches.map((b) => ({ id: b.id, label: branchShort(b.name), count: facets.branch.get(b.id) ?? 0 }));
  const chapters = grade ? (f.branchId ? branches.filter((b) => b.id === f.branchId) : branches).flatMap((b) => b.chapters.map((c) => ({ c, b }))) : [];
  const chapter = chapters.find((x) => x.c.id === f.chapterId)?.c ?? null;
  const lesson = chapter?.lessons.find((l) => l.id === f.lessonId) ?? null;
  const form = lesson?.forms.find((x) => x.id === f.formId) ?? null;

  const chapterOpts: FieldOption[] = chapters.map(({ c, b }) => ({ id: c.id, label: shortName(c.name), hint: `${grade!.code}${b.code}${c.code}`, count: facets.chapter.get(c.id) ?? 0 }));
  const lessonOpts: FieldOption[] = (chapter?.lessons ?? []).map((l) => ({ id: l.id, label: shortName(l.name), count: facets.lesson.get(l.id) ?? 0 }));
  const formOpts: FieldOption[] = (lesson?.forms ?? []).map((x) => ({ id: x.id, label: shortName(x.name), count: facets.form.get(x.id) ?? 0 }));
  const sum = (o: FieldOption[]) => o.reduce((n, x) => n + (x.count ?? 0), 0);

  const levelOpts: FieldOption[] = LEVELS.map((l) => ({ id: l, label: LEVEL_LABEL[l], count: facets.level.get(l) ?? 0 }));
  const typeOpts: FieldOption[] = TYPES.map((t) => ({ id: t, label: TYPE_LABEL[t], count: facets.type.get(t) ?? 0 }));
  const figOpts: FieldOption[] = (['yes', 'no', 'unknown'] as const)
    .filter((k) => k !== 'unknown' || facets.figure.unknown > 0 || f.figure === 'unknown')
    .map((k) => ({ id: k, label: FIGURE_LABEL[k], count: facets.figure[k] }));
  const revOpts: FieldOption[] = (['unreviewed', 'needs_fix', 'approved'] as const).map((r) => ({ id: r, label: REVIEW_LABEL[r], count: facets.review[r] }));

  const toggle = <T extends string>(set: Set<T>, v: T) => { const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); return n; };
  const nAttr = attrCount(f);
  const groups = attrGroups(f);
  const total = facets.list.length;

  return (
    <aside className={`fside${variant === 'drawer' ? ' is-drawer' : ''}`} aria-label="Mục lục và bộ lọc">
      <div className="fs-top">
        <h2>Mục lục &amp; bộ lọc</h2>
        <button type="button" className="btn btn-sm" onClick={onHide} title={variant === 'drawer' ? 'Đóng (Esc)' : 'Ẩn thanh này'}>{variant === 'drawer' ? 'Đóng ✕' : 'Ẩn ◀'}</button>
      </div>

      <div className="fs-scroll">
        <div className={`fs-block${wide ? ' is-off' : ''}`}>
          <div className="fs-sec" title={tax.name}><span>Theo chương trình</span></div>
          {wide && <p className="fs-note" role="note">Đang tìm trong toàn kho nên mục lục tạm không áp dụng. Xoá chữ tìm để lọc theo mục lục.</p>}
          {tax.grades.length <= SEG_MAX ? (
            <div className="fs-seg grade" role="group" aria-label="Lớp" style={{ gridTemplateColumns: `repeat(${tax.grades.length + 1}, minmax(0, 1fr))` }}>
              <button type="button" aria-pressed={f.gradeNum == null} onClick={() => onF(pickGrade(f, null))}><b>Tất cả</b><small>{nf.format(facets.gradeAll)}</small></button>
              {tax.grades.map((g) => (
                <button key={g.id} type="button" aria-pressed={f.gradeNum === g.grade} title={gradeLabel(g)} onClick={() => onF(pickGrade(f, g.grade))}>
                  <b>{gradeLabel(g)}</b><small>{nf.format(facets.grade.get(g.grade) ?? 0)}</small>
                </button>
              ))}
            </div>
          ) : (
            <FieldMenu
              label="Lớp" summary={grade ? gradeLabel(grade) : 'Tất cả các lớp'} active={!!grade} searchable={tax.grades.length > 12}
              options={gradeOpts} selected={f.gradeNum == null ? null : String(f.gradeNum)} onPick={(id) => onF(pickGrade(f, id == null ? null : Number(id)))}
              allLabel="Tất cả các lớp" allCount={facets.gradeAll} count={grade ? facets.grade.get(grade.grade) ?? 0 : undefined}
            />
          )}

          {grade ? (
            branches.length <= SEG_MAX ? (
              <div className="fs-seg branch" role="group" aria-label="Phân môn" style={{ gridTemplateColumns: `repeat(${Math.max(1, branches.length)}, minmax(0, 1fr))` }}>
                {branches.map((b) => (
                  <button key={b.id} type="button" aria-pressed={f.branchId === b.id} title={f.branchId === b.id ? 'Bấm lại để bỏ chọn' : b.name} onClick={() => onF(pickBranch(f, f.branchId === b.id ? null : b.id))}>
                    <span>{branchShort(b.name)}</span><small>{nf.format(facets.branch.get(b.id) ?? 0)}</small>
                  </button>
                ))}
                {!branches.length && <span className="fs-none">Lớp này chưa có phân môn</span>}
              </div>
            ) : (
              <FieldMenu
                label="Phân môn" summary={branch ? branchShort(branch.name) : 'Tất cả phân môn'} active={!!branch}
                options={branchOpts} selected={f.branchId} onPick={(id) => onF(pickBranch(f, id))}
                allLabel="Tất cả phân môn" allCount={sum(branchOpts)} count={branch ? facets.branch.get(branch.id) ?? 0 : undefined}
              />
            )
          ) : (
            <p className="fs-hint">Chọn một lớp để duyệt phân môn, chương, bài và dạng.</p>
          )}

          <FieldMenu
            label="Chương" summary={chapter ? shortName(chapter.name) : 'Tất cả chương'} active={!!chapter}
            disabled={!grade} disabledText="Chọn lớp trước" searchable={chapterOpts.length > 12}
            options={chapterOpts} selected={f.chapterId} onPick={(id) => onF(pickChapter(tax, f, id))}
            allLabel="Tất cả chương" allCount={sum(chapterOpts)} count={chapter ? facets.chapter.get(chapter.id) ?? 0 : undefined}
          />
          <FieldMenu
            label="Bài" summary={lesson ? shortName(lesson.name) : 'Tất cả bài'} active={!!lesson}
            disabled={!chapter} disabledText="Chọn chương trước" searchable={lessonOpts.length > 12}
            options={lessonOpts} selected={f.lessonId} onPick={(id) => onF(pickLesson(f, id))}
            allLabel="Tất cả bài" allCount={sum(lessonOpts)} count={lesson ? facets.lesson.get(lesson.id) ?? 0 : undefined}
          />
          <FieldMenu
            label="Dạng" summary={form ? shortName(form.name) : 'Tất cả dạng'} active={!!form}
            disabled={!lesson || !lesson.forms.length} disabledText={!lesson ? 'Chọn bài trước' : 'Bài này chưa có dạng'} searchable={formOpts.length > 12}
            options={formOpts} selected={f.formId} onPick={(id) => onF(pickForm(f, id))}
            allLabel="Tất cả dạng" allCount={sum(formOpts)} count={form ? facets.form.get(form.id) ?? 0 : undefined}
          />
        </div>

        <div className="fs-sec"><span>Lọc câu hỏi</span>{groups > 0 && <i className="fs-badge" aria-label={`${groups} nhóm đang lọc`}>{groups}</i>}</div>
        <FieldMenu
          multi label="Mức độ" summary={f.levels.size ? [...f.levels].map((l) => LEVEL_LABEL[l]).join(', ') : 'Tất cả'} active={f.levels.size > 0}
          options={levelOpts} selected={f.levels} onToggle={(id) => onF({ ...f, levels: toggle<Level>(f.levels, id as Level) })} onClear={() => onF({ ...f, levels: new Set() })}
        />
        <FieldMenu
          multi label="Loại câu" summary={f.types.size ? [...f.types].map((t) => TYPE_LABEL[t]).join(', ') : 'Tất cả'} active={f.types.size > 0}
          options={typeOpts} selected={f.types} onToggle={(id) => onF({ ...f, types: toggle<QType>(f.types, id as QType) })} onClear={() => onF({ ...f, types: new Set() })}
        />
        <FieldMenu
          label="Hình" summary={f.figure === 'all' ? 'Tất cả' : FIGURE_LABEL[f.figure]} active={f.figure !== 'all'} hint={FIG_HINT}
          options={figOpts} selected={f.figure === 'all' ? null : f.figure} onPick={(id) => onF({ ...f, figure: (id ?? 'all') as FigureFilter })}
          allLabel="Tất cả" allCount={facets.figure.yes + facets.figure.no + facets.figure.unknown}
        />
        <FieldMenu
          label="Duyệt" summary={f.review === 'all' ? 'Tất cả' : REVIEW_LABEL[f.review]} active={f.review !== 'all'}
          options={revOpts} selected={f.review === 'all' ? null : f.review} onPick={(id) => onF({ ...f, review: (id ?? 'all') as ReviewFilter })}
          allLabel="Tất cả" allCount={facets.review.unreviewed + facets.review.needs_fix + facets.review.approved}
        />
      </div>

      <div className="fs-foot">
        <p className="fs-count" aria-live="polite">Đang hiện <b>{nf.format(total)}</b> / {nf.format(facets.scoped)} câu</p>
        <div className="fs-btns">
          <button type="button" className="btn btn-sm" disabled={nAttr === 0} onClick={onClearAttrs} title="Chỉ bỏ Mức độ, Loại câu, Hình, Kiểm duyệt; giữ nguyên mục đang xem">Xoá bộ lọc{nAttr > 0 ? ` (${nAttr})` : ''}</button>
          <button type="button" className="btn btn-sm" disabled={!canReset} onClick={onResetAll} title="Về toàn bộ ngân hàng: bỏ mục đang xem, bộ lọc và chữ tìm. Các câu đã tick vẫn giữ">Đặt lại toàn bộ</button>
        </div>
      </div>
    </aside>
  );
}
