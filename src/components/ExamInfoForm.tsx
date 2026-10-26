// Biểu mẫu "Thông tin đề" (E4): tên, thư mục ảo, lớp, năm học, loại đề, nhãn, trạng thái. Chốt đề là nút riêng, có hộp xác nhận.
import { useEffect, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import { parseTags, STATUS_LABEL, type ExamManifest, type ExamMetaIn, type ExamStatus } from '../lib/examlib';

const TYPES = ['Giữa kỳ 1', 'Cuối kỳ 1', 'Giữa kỳ 2', 'Cuối kỳ 2', 'Thi thử', 'Kiểm tra 15 phút', 'Kiểm tra 1 tiết', 'Luyện tập'];

interface Props {
  detail: ExamManifest;
  folders: string[];
  busy: boolean;
  /** có PDF biên dịch gần nhất (điều kiện cần để chốt đề) */
  hasPdf: boolean;
  onSave(m: ExamMetaIn): void;
}

export function ExamInfoForm({ detail, folders, busy, hasPdf, onSave }: Props) {
  const init = () => ({
    name: detail.name, folder: detail.folder ?? '', grade: detail.metadata.grade ? String(detail.metadata.grade) : '', year: detail.metadata.schoolYear ?? '',
    type: detail.metadata.examType ?? '', tags: detail.metadata.tags.join(', '), status: detail.status as ExamStatus,
  });
  const [f, setF] = useState(init);
  const [ask, setAsk] = useState(false);
  useEffect(() => { setF(init()); }, [detail.projectId, detail.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const final = detail.status === 'finalized';
  const build = (status: ExamStatus): ExamMetaIn => ({
    name: f.name, folder: f.folder.trim() || null, grade: f.grade ? +f.grade : null, schoolYear: f.year.trim() || null, examType: f.type.trim() || null, tags: parseTags(f.tags), status,
  });
  const set = (k: keyof ReturnType<typeof init>) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <details className="xl-info">
      <summary>Thông tin đề · {STATUS_LABEL[detail.status]}</summary>
      <form className="xl-form" onSubmit={(e) => { e.preventDefault(); onSave(build(final ? 'finalized' : f.status === 'finalized' ? 'draft' : f.status)); }}>
        <label>Tên đề <input className="xl-in" value={f.name} maxLength={120} onChange={set('name')} required /></label>
        <label>Thư mục <input className="xl-in" list="xl-folders" value={f.folder} maxLength={250} placeholder="Lớp 12/Học kỳ 1" onChange={set('folder')} /></label>
        <datalist id="xl-folders">{folders.map((x) => <option key={x} value={x} />)}</datalist>
        <label>Lớp <select className="xl-in" value={f.grade} onChange={set('grade')}><option value="">—</option>{Array.from({ length: 12 }, (_, i) => i + 1).map((g) => <option key={g} value={g}>Lớp {g}</option>)}</select></label>
        <label>Năm học <input className="xl-in" value={f.year} maxLength={20} placeholder="2026-2027" onChange={set('year')} /></label>
        <label>Loại đề <input className="xl-in" list="xl-types" value={f.type} maxLength={30} onChange={set('type')} /></label>
        <datalist id="xl-types">{TYPES.map((x) => <option key={x} value={x} />)}</datalist>
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
