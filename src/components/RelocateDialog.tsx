// Khôi phục một câu có "Vị trí không còn": giáo viên TỰ chọn vị trí mới (Lớp → Phân môn → Chương → Bài → Dạng).
// Gợi ý từ bộ dò trên máy chỉ để tham khảo: không tự chọn, không tự khôi phục. Không sửa LaTeX; mã %[ID] cũ giữ nguyên (có cảnh báo nếu lệch).
import { useMemo, useRef, useState } from 'react';
import { getTaxonomy } from '../lib/curriculum';
import { IdSuggester } from '../lib/idsuggest';
import { questionCode } from '../lib/id';
import { getState } from '../lib/store';
import { indexOf } from '../lib/taxonomy';
import { relocatePreview, validNewLocation } from '../lib/trashrelocate';
import { LEVELS, LEVEL_LABEL, type Level, type Location, type Question } from '../lib/types';
import { ConfirmDialog } from './ConfirmDialog';

export function RelocateDialog({ q, busy, onConfirm, onCancel }: { q: Question; busy: boolean; onConfirm(loc: Location, level: Level | undefined): void; onCancel(): void }) {
  const tax = getTaxonomy();
  const ix = useMemo(() => indexOf(tax), [tax]);
  const [gradeId, setGradeId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [formId, setFormId] = useState('');
  const [level, setLevel] = useState<Level>(q.level);
  const grade = tax.grades.find((g) => g.id === gradeId);
  const branch = grade?.branches.find((b) => b.id === branchId);
  const chapter = branch?.chapters.find((c) => c.id === chapterId);
  const lesson = chapter?.lessons.find((l) => l.id === lessonId);
  const loc: Location | null = grade && chapter && lesson && formId ? { grade: grade.grade, chapterId, lessonId, formId } : null;
  const valid = !!loc && validNewLocation(ix, loc);
  const pv = loc && valid ? relocatePreview(q, loc, level, ix) : null;

  // gợi ý tham khảo từ ngân hàng trên máy, theo lớp đang chọn (chỉ tính khi giáo viên đã chọn lớp)
  const sugRef = useRef<IdSuggester | null>(null);
  const sug = useMemo(() => {
    if (!grade) return [];
    sugRef.current ??= new IdSuggester(tax, getState().questions);
    const s = sugRef.current.suggest({ key: `rl-${q.uid}`, latex: q.latex, grade: grade.grade });
    return [s.best, ...s.alternatives].filter((o): o is NonNullable<typeof o> => !!o).slice(0, 3);
  }, [grade, tax, q.uid, q.latex]);
  const useSug = (l: Location) => {
    const p = ix.get(l.formId);
    if (!p?.grade || !p.branch || !p.chapter || !p.lesson) return;
    setGradeId(p.grade.id); setBranchId(p.branch.id); setChapterId(p.chapter.id); setLessonId(p.lesson.id); setFormId(l.formId);
  };

  const pick = (v: string, set: (x: string) => void, ...reset: ((x: string) => void)[]) => { set(v); reset.forEach((r) => r('')); };
  return (
    <ConfirmDialog
      title={`Khôi phục câu ${String(q.seq).padStart(4, '0')} vào vị trí mới`}
      confirmLabel="Khôi phục vào vị trí mới"
      cancelLabel="Chưa khôi phục"
      disabled={!valid}
      busy={busy}
      onConfirm={() => { if (loc && valid) onConfirm(loc, level !== q.level ? level : undefined); }}
      onCancel={onCancel}
    >
      <p className="sys-hint">Vị trí cũ của câu không còn trong cây chương trình. Hãy chọn đủ <b>Lớp → Phân môn → Chương → Bài → Dạng</b>. Nội dung câu và mã %[ID] trong LaTeX được giữ nguyên; câu sẽ được đặt là <b>Cần sửa</b> để thầy/cô kiểm tra lại.</p>
      <div className="rl-grid">
        <label className="qsel">Lớp
          <select value={gradeId} onChange={(e) => pick(e.target.value, setGradeId, setBranchId, setChapterId, setLessonId, setFormId)}>
            <option value="">— chọn lớp —</option>
            {tax.grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <label className="qsel">Phân môn
          <select value={branchId} disabled={!grade} onChange={(e) => pick(e.target.value, setBranchId, setChapterId, setLessonId, setFormId)}>
            <option value="">— chọn phân môn —</option>
            {grade?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="qsel">Chương
          <select value={chapterId} disabled={!branch} onChange={(e) => pick(e.target.value, setChapterId, setLessonId, setFormId)}>
            <option value="">— chọn chương —</option>
            {branch?.chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="qsel">Bài
          <select value={lessonId} disabled={!chapter} onChange={(e) => pick(e.target.value, setLessonId, setFormId)}>
            <option value="">— chọn bài —</option>
            {chapter?.lessons.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label className="qsel">Dạng
          <select value={formId} disabled={!lesson} onChange={(e) => setFormId(e.target.value)}>
            <option value="">— chọn dạng —</option>
            {lesson?.forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <label className="qsel">Mức độ
          <select value={level} onChange={(e) => setLevel(e.target.value as Level)}>
            {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}{l === q.level ? ' (giữ nguyên)' : ''}</option>)}
          </select>
        </label>
      </div>
      {sug.length > 0 && (
        <div className="rl-sug">
          <b>Gợi ý tham khảo (từ ngân hàng trên máy, HEdu không tự chọn):</b>
          <ul>{sug.map((o) => <li key={o.formId}><button type="button" className="btn btn-sm" onClick={() => useSug(o.location)}>Dùng vị trí này</button> {questionCode(o.location, q.level)} · {ix.get(o.formId)?.form?.name}</li>)}</ul>
        </div>
      )}
      {pv ? (
        <dl className="rl-prev" aria-label="Xem trước thay đổi">
          <div><dt>Vị trí cũ</dt><dd>{pv.oldPlace}</dd></div>
          <div><dt>Vị trí mới</dt><dd>{pv.newPlace}</dd></div>
          <div><dt>ID cũ → ID mới</dt><dd><span className="code-tag">{pv.oldCode}</span> → <span className="code-tag is-new">{pv.newCode}</span>{pv.levelChanged ? ' (mức độ đổi theo lựa chọn của thầy/cô)' : ''}</dd></div>
          {pv.latexCode && <div><dt>Mã trong LaTeX</dt><dd><span className="code-tag">{pv.latexCode}</span> (giữ nguyên, HEdu không sửa)</dd></div>}
        </dl>
      ) : <p className="sys-hint">Chọn đủ 5 cấp để xem trước ID mới.</p>}
      {pv?.mismatch && <p className="aid-warn" role="alert">Cảnh báo: mã trong LaTeX gốc (<b>{pv.latexCode}</b>) khác ID mới (<b>{pv.newCode}</b>). HEdu không tự sửa LaTeX; nếu muốn khớp, thầy/cô sửa sau trong Ngân hàng.</p>}
    </ConfirmDialog>
  );
}
