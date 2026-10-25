// Thanh "Mục lục & bộ lọc" của màn Ngân hàng — MỘT nơi duy nhất chứa mọi bộ lọc.
// Hai nhóm: THEO CHƯƠNG TRÌNH (Lớp → Phân môn → Chương → Bài → Dạng) và LỌC CÂU HỎI (Mức độ, Loại câu, Hình, Kiểm duyệt).
// Dùng cho cả kiểu gắn cố định bên trái và kiểu ngăn trượt khi cửa sổ hẹp/đã ẩn mục lục (cùng một thành phần, cùng một trạng thái).
import { FIGURE_LABEL, type FigureFilter } from '../lib/figure';
import { attrCount, attrGroups, levelsActive, typesActive, pickBranch, pickChapter, pickForm, pickGrade, pickLesson, type BankFilters, type Facets } from '../lib/bankfilter';
import { branchShort, gradeLabel, shortName } from '../lib/taxonomy';
import { LEVEL_LABEL, LEVELS, REVIEW_LABEL, TYPE_LABEL, TYPES, type Level, type QType, type ReviewFilter, type Taxonomy } from '../lib/types';
import { FieldMenu, type FieldOption } from './FieldMenu';

const nf = new Intl.NumberFormat('vi-VN');
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
  const grade = tax.grades.find((g) => g.id === f.gradeId) ?? null;
  const branches = grade?.branches ?? [];
  const branch = branches.find((b) => b.id === f.branchId) ?? null;
  const gradeOpts: FieldOption[] = tax.grades.map((g) => ({ id: g.id, label: gradeLabel(g), search: `${g.code} ${g.name}`, count: facets.grade.get(g.id) ?? 0 }));
  const branchOpts: FieldOption[] = branches.map((b) => ({ id: b.id, label: branchShort(b.name), search: `${b.code} ${b.name}`, count: facets.branch.get(b.id) ?? 0 }));
  const chapters = grade ? (f.branchId ? branches.filter((b) => b.id === f.branchId) : branches).flatMap((b) => b.chapters.map((c) => ({ c, b }))) : [];
  const chapter = chapters.find((x) => x.c.id === f.chapterId)?.c ?? null;
  const lesson = chapter?.lessons.find((l) => l.id === f.lessonId) ?? null;
  const form = lesson?.forms.find((x) => x.id === f.formId) ?? null;

  const chapterOpts: FieldOption[] = chapters.map(({ c, b }) => ({ id: c.id, label: shortName(c.name), hint: `${grade!.code}${b.code}${c.code}`, search: c.name, count: facets.chapter.get(c.id) ?? 0 }));
  const lessonOpts: FieldOption[] = (chapter?.lessons ?? []).map((l) => ({ id: l.id, label: shortName(l.name), search: `${l.code} ${l.name}`, count: facets.lesson.get(l.id) ?? 0 }));
  const formOpts: FieldOption[] = (lesson?.forms ?? []).map((x) => ({ id: x.id, label: shortName(x.name), search: `${x.code} ${x.name}`, count: facets.form.get(x.id) ?? 0 }));
  const sum = (o: FieldOption[]) => o.reduce((n, x) => n + (x.count ?? 0), 0);

  const levelOpts: FieldOption[] = LEVELS.map((l) => ({ id: l, label: LEVEL_LABEL[l], count: facets.level.get(l) ?? 0 }));
  const typeOpts: FieldOption[] = TYPES.map((t) => ({ id: t, label: TYPE_LABEL[t], count: facets.type.get(t) ?? 0 }));
  const figOpts: FieldOption[] = (['yes', 'no', 'unknown'] as const)
    .filter((k) => k !== 'unknown' || facets.figure.unknown > 0 || f.figure === 'unknown')
    .map((k) => ({ id: k, label: FIGURE_LABEL[k], count: facets.figure[k] }));
  const revOpts: FieldOption[] = (['unreviewed', 'needs_fix', 'approved'] as const).map((r) => ({ id: r, label: REVIEW_LABEL[r], count: facets.review[r] }));

  const tagOpts: FieldOption[] = [...facets.tag]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi'))
    .map(([t, n]) => ({ id: t, label: t, count: n }));
  if (f.tag && !facets.tag.has(f.tag)) tagOpts.unshift({ id: f.tag, label: f.tag, count: 0 });

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
          <FieldMenu
            label="Lớp" summary={grade ? gradeLabel(grade) : 'Tất cả các lớp'} active={!!grade} searchable
            options={gradeOpts} selected={f.gradeId} onPick={(id) => onF(pickGrade(f, id))} onReset={() => onF(pickGrade(f, null))}
            allLabel="Tất cả các lớp" allCount={facets.gradeAll} count={grade ? facets.grade.get(grade.id) ?? 0 : undefined}
          />
          <FieldMenu
            label="Phân môn" summary={branch ? branchShort(branch.name) : 'Tất cả phân môn'} active={!!branch} searchable
            disabled={!grade || !branches.length} disabledText={!grade ? 'Chọn lớp trước' : 'Lớp này chưa có phân môn'}
            options={branchOpts} selected={f.branchId} onPick={(id) => onF(pickBranch(f, id))} onReset={() => onF(pickBranch(f, null))}
            allLabel="Tất cả phân môn" allCount={sum(branchOpts)} count={branch ? facets.branch.get(branch.id) ?? 0 : undefined}
          />

          <FieldMenu
            label="Chương" summary={chapter ? shortName(chapter.name) : 'Tất cả chương'} active={!!chapter}
            disabled={!grade} disabledText="Chọn lớp trước" searchable
            options={chapterOpts} selected={f.chapterId} onPick={(id) => onF(pickChapter(tax, f, id))} onReset={() => onF(pickChapter(tax, f, null))}
            allLabel="Tất cả chương" allCount={sum(chapterOpts)} count={chapter ? facets.chapter.get(chapter.id) ?? 0 : undefined}
          />
          <FieldMenu
            label="Bài" summary={lesson ? shortName(lesson.name) : 'Tất cả bài'} active={!!lesson}
            disabled={!chapter} disabledText="Chọn chương trước" searchable
            options={lessonOpts} selected={f.lessonId} onPick={(id) => onF(pickLesson(f, id))} onReset={() => onF(pickLesson(f, null))}
            allLabel="Tất cả bài" allCount={sum(lessonOpts)} count={lesson ? facets.lesson.get(lesson.id) ?? 0 : undefined}
          />
          <FieldMenu
            label="Dạng" summary={form ? shortName(form.name) : 'Tất cả dạng'} active={!!form}
            disabled={!lesson || !lesson.forms.length} disabledText={!lesson ? 'Chọn bài trước' : 'Bài này chưa có dạng'} searchable
            options={formOpts} selected={f.formId} onPick={(id) => onF(pickForm(f, id))} onReset={() => onF(pickForm(f, null))}
            allLabel="Tất cả dạng" allCount={sum(formOpts)} count={form ? facets.form.get(form.id) ?? 0 : undefined}
          />
        </div>

        <div className="fs-sec"><span>Lọc câu hỏi</span>{groups > 0 && <i className="fs-badge" aria-label={`${groups} nhóm đang lọc`}>{groups}</i>}</div>
        <FieldMenu
          multi label="Mức độ" summary={levelsActive(f) ? LEVELS.filter((l) => f.levels.has(l)).map((l) => LEVEL_LABEL[l]).join(', ') : 'Tất cả'} active={levelsActive(f)} onReset={() => onF({ ...f, levels: new Set() })}
          options={levelOpts} selected={f.levels} onToggle={(id) => onF({ ...f, levels: toggle<Level>(f.levels, id as Level) })} onClear={() => onF({ ...f, levels: new Set() })}
        />
        <FieldMenu
          multi label="Loại câu" summary={typesActive(f) ? TYPES.filter((t) => f.types.has(t)).map((t) => TYPE_LABEL[t]).join(', ') : 'Tất cả'} active={typesActive(f)} onReset={() => onF({ ...f, types: new Set() })}
          options={typeOpts} selected={f.types} onToggle={(id) => onF({ ...f, types: toggle<QType>(f.types, id as QType) })} onClear={() => onF({ ...f, types: new Set() })}
        />
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
          label="Nhãn" summary={f.tag ?? 'Tất cả'} active={!!f.tag} searchable hint="Nhãn gắn khi nhập (Nguồn, Lô, Thư mục) hoặc do bạn tự đặt" onReset={() => onF({ ...f, tag: null })}
          options={tagOpts} selected={f.tag} onPick={(id) => onF({ ...f, tag: id })}
          allLabel="Tất cả" allCount={facets.tagAll}
        />
      </div>

      <div className="fs-foot">
        <p className="fs-count" aria-live="polite">Đang hiện <b>{nf.format(total)}</b> / {nf.format(facets.scoped)} câu</p>
        <div className="fs-btns">
          <button type="button" className="btn btn-sm" disabled={nAttr === 0} onClick={onClearAttrs} title="Chỉ bỏ Mức độ, Loại câu, Hình, Duyệt, Nhãn; giữ nguyên mục đang xem">Xoá bộ lọc{nAttr > 0 ? ` (${nAttr})` : ''}</button>
          <button type="button" className="btn btn-sm" disabled={!canReset} onClick={onResetAll} title="Về toàn bộ ngân hàng: bỏ mục đang xem, bộ lọc và chữ tìm. Các câu đã tick vẫn giữ">Đặt lại toàn bộ</button>
        </div>
      </div>
    </aside>
  );
}
