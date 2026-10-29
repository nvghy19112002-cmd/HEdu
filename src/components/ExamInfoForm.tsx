// Biểu mẫu "Thông tin đề" (E4): tên, vị trí trong cây (lớp, loại đề, chương, bài), thư mục riêng, năm học, nhãn, trạng thái.
// Chốt đề là nút riêng, có hộp xác nhận.
import { useEffect, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import { parseTags, STATUS_LABEL, type ExamManifest, type ExamMetaIn, type ExamStatus } from '../lib/examlib';
import { CAT_LABEL, CATS, catOfType } from '../lib/examtree';
import { chaptersOfGrade } from '../lib/taxonomy';
import { useTaxonomy } from '../lib/curriculum';

interface Props {
  detail: ExamManifest;
  folders: string[];
  busy: boolean;
  /** có PDF biên dịch gần nhất (điều kiện cần để chốt đề) */
  hasPdf: boolean;
  onSave(m: ExamMetaIn): void;
  /** mở sẵn phần thông tin */
  open?: boolean;
}

export function ExamInfoForm({ detail, folders, busy, hasPdf, onSave, open }: Props) {
  const init = () => ({
    name: detail.name, folder: detail.folder ?? '', grade: detail.metadata.grade ? String(detail.metadata.grade) : '', year: detail.metadata.schoolYear ?? '',
    type: detail.metadata.examType ?? '', tags: detail.metadata.tags.join(', '), status: detail.status as ExamStatus,
    ch: detail.metadata.chapterId ?? '', ls: detail.metadata.lessonId ?? '',
  });
  const { tax } = useTaxonomy();
  const [f, setF] = useState(init);
  const [ask, setAsk] = useState(false);
  useEffect(() => { setF(init()); }, [detail.projectId, detail.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const final = detail.status === 'finalized';
  const build = (status: ExamStatus): ExamMetaIn => ({
    name: f.name, folder: f.folder.trim() || null, grade: f.grade ? +f.grade : null, schoolYear: f.year.trim() || null, examType: f.type.trim() || null, tags: parseTags(f.tags), status,
    chapterId: byLesson && f.ch ? f.ch : null, lessonId: byLesson && f.ch && f.ls && cat === 'on-bai' ? f.ls : null,
  });
  const cat = catOfType(f.type);
  /** đề ôn tập theo chương/bài (hoặc ôn tập chung) mới gắn chương/bài */
  const byLesson = cat === 'on-bai' || cat === 'on-chuong' || cat === 'on-tap';
  const chapters = f.grade ? chaptersOfGrade(tax, +f.grade) : [];
  const chapter = chapters.find((c) => c.id === f.ch);
  const custom = f.type.trim() && !CATS.some((c) => CAT_LABEL[c] === f.type.trim());
  const set = (k: keyof ReturnType<typeof init>) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <details className="xl-info" open={open}>
      <summary>Thông tin đề · {STATUS_LABEL[detail.status]}</summary>
      <form className="xl-form" onSubmit={(e) => { e.preventDefault(); onSave(build(final ? 'finalized' : f.status === 'finalized' ? 'draft' : f.status)); }}>
        <label>Tên đề <input className="xl-in" value={f.name} maxLength={120} onChange={set('name')} required /></label>
        <div className="xl-form-row">
          <label>Lớp <select className="xl-in" value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value, ch: '', ls: '' })}><option value="">—</option>{Array.from({ length: 12 }, (_, i) => i + 1).map((g) => <option key={g} value={g}>Lớp {g}</option>)}</select></label>
          <label>Loại đề
            <select className="xl-in" value={f.type} onChange={set('type')}>
              <option value="">— chưa chọn —</option>
              {CATS.map((c) => <option key={c} value={CAT_LABEL[c]}>{CAT_LABEL[c]}</option>)}
              {custom && <option value={f.type}>{f.type} (cũ)</option>}
            </select>
          </label>
          <label>Năm học <input className="xl-in" value={f.year} maxLength={20} placeholder="2026-2027" onChange={set('year')} /></label>
        </div>
        {byLesson && (
          <div className="xl-form-row">
            <label>Chương
              <select className="xl-in" value={f.ch} disabled={!f.grade} onChange={(e) => setF({ ...f, ch: e.target.value, ls: '' })}>
                <option value="">{f.grade ? '— không gắn chương —' : '— chọn lớp trước —'}</option>
                {chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            {cat === 'on-bai' && (
              <label>Bài
                <select className="xl-in" value={f.ls} disabled={!chapter} onChange={set('ls')}>
                  <option value="">— chọn bài —</option>
                  {chapter?.lessons.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
            )}
          </div>
        )}
        <label>Thư mục riêng (tuỳ chọn) <input className="xl-in" list="xl-folders" value={f.folder} maxLength={250} placeholder="vd: Trường THPT A/2026" onChange={set('folder')} /></label>
        <datalist id="xl-folders">{folders.map((x) => <option key={x} value={x} />)}</datalist>
        <label>Nhãn (cách nhau dấu phẩy) <input className="xl-in" value={f.tags} onChange={set('tags')} /></label>
        <label>Trạng thái
          <select className="xl-in" value={final ? 'finalized' : f.status === 'finalized' ? 'draft' : f.status} disabled={final} onChange={set('status')}>
            <option value="draft">{STATUS_LABEL.draft}</option><option value="needs_review">{STATUS_LABEL.needs_review}</option>{final && <option value="finalized">{STATUS_LABEL.finalized}</option>}
          </select>
        </label>
        <div className="xl-actions">
          <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>Lưu thông tin</button>
          {!final && <button type="button" className="btn btn-sm" disabled={busy || !hasPdf} title={hasPdf ? '' : 'Cần có PDF biên dịch thành công trước'} onClick={() => setAsk(true)}>Chốt đề…</button>}
        </div>
        {final && <p className="xl-meta">Đề đã chốt: không sửa trực tiếp và không bỏ chốt được. Muốn sửa, bấm “Sao chép” để tạo phiên bản mới.</p>}
      </form>
      {ask && (
        <ConfirmDialog title="Chốt đề này?" confirmLabel="Chốt đề" cancelLabel="Chưa chốt" busy={busy} onCancel={() => setAsk(false)} onConfirm={() => { setAsk(false); onSave(build('finalized')); }}>
          <p>Chỉ chốt sau khi bạn đã XEM PDF và thấy đúng. Sau khi chốt, đề không sửa trực tiếp được và không bỏ chốt được; muốn sửa phải tạo phiên bản mới (Sao chép).</p>
          <p className="xl-meta">HEdu chỉ cho chốt khi PDF còn khớp đúng nội dung hiện tại.</p>
        </ConfirmDialog>
      )}
    </details>
  );
}
