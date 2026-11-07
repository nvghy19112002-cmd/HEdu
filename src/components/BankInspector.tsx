// Ngăn Thông tin bên phải màn Câu hỏi (giao diện mới, giai đoạn 3). KHÔNG lặp lại đề/đáp án (thẻ ở giữa đã có):
// chỉ nút việc, thông tin câu và tab Lời giải (mặc định) / LaTeX. Bấm đúp thẻ hoặc "Xem đầy đủ" mở cửa sổ xem câu như cũ.
import { useMemo, useState } from 'react';
import { parseExTest } from '../lib/extest';
import { place } from '../lib/curriculum';
import { questionCode, seqLabel } from '../lib/id';
import { LEVEL_LABEL, REVIEW_LABEL, TYPE_LABEL, type Question } from '../lib/types';
import { IcCopy, IcEdit } from './Icons';
import { Tex } from './QuestionView';

export function BankInspector({ q, noId, onClose, onView, onEdit, onAddToExam, onSlides, onToast }: {
  q: Question;
  /** câu chưa có ID (chưa đặt vào Dạng) */
  noId: boolean;
  onClose(): void;
  onView(): void;
  onEdit(): void;
  onAddToExam?: () => void;
  onSlides(): void;
  onToast(m: string): void;
}) {
  const [tab, setTab] = useState<'sol' | 'tex'>('sol');
  const p = useMemo(() => parseExTest(q.latex), [q.latex]);
  const at = place(q.formId) ?? place(q.lessonId) ?? place(q.chapterId);
  const code = noId ? null : questionCode(q, q.level);
  const path = at ? [at.grade?.name, at.branch?.name, at.chapter?.name, at.lesson?.name, at.form?.name].filter(Boolean) as string[] : [];
  const review = REVIEW_LABEL[q.review ?? 'unreviewed'];
  const copy = () => { void navigator.clipboard?.writeText(q.latex).then(() => onToast(`Đã chép mã LaTeX của ${seqLabel(q.seq)}.`), () => onToast('Không chép được.')); };

  return (
    <aside className="insp-pane" aria-label={`Thông tin câu ${seqLabel(q.seq)}`}>
      <div className="ip-head">
        <b>{seqLabel(q.seq)}</b>
        {code ? <span className="ip-code mono">{code}</span> : <span className="ip-code is-noid">Chưa có ID</span>}
        <span className="ip-sp" />
        <button type="button" className="ico" onClick={onClose} aria-label="Đóng ngăn Thông tin" title="Đóng (Esc)">×</button>
      </div>
      <div className="ip-acts">
        <button type="button" className="btn btn-sm btn-accent" onClick={onEdit}><IcEdit size={15} /> Sửa câu</button>
        <button type="button" className="btn btn-sm" onClick={onView} title="Mở cửa sổ xem đầy đủ (bấm đúp vào thẻ cũng được)">Xem đầy đủ</button>
        {onAddToExam && <button type="button" className="btn btn-sm" onClick={onAddToExam}>Thêm vào đề</button>}
        <button type="button" className="btn btn-sm" onClick={onSlides}>Trình chiếu</button>
        <button type="button" className="btn btn-sm" onClick={copy}><IcCopy size={15} /> Chép LaTeX</button>
      </div>
      <dl className="ip-info">
        <dt>Vị trí</dt>
        <dd>{path.length ? <span className="ip-path">{path.map((s, i) => <span key={i}>{s}</span>)}</span> : <span className="ip-mute">Chưa đặt vào Dạng nào</span>}</dd>
        <dt>Mức độ</dt><dd><span className={`pill l-${q.level}`}>{LEVEL_LABEL[q.level]}</span></dd>
        <dt>Loại câu</dt><dd>{TYPE_LABEL[q.type]}</dd>
        <dt>Kiểm duyệt</dt><dd className={`ip-rv rv-${q.review ?? 'none'}`}>{review}</dd>
        {q.tags.length > 0 && <><dt>Nhãn</dt><dd className="ip-tags">{q.tags.map((t) => <span key={t}>{t}</span>)}</dd></>}
      </dl>
      <div className="ip-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'sol'} onClick={() => setTab('sol')}>Lời giải</button>
        <button type="button" role="tab" aria-selected={tab === 'tex'} onClick={() => setTab('tex')}>LaTeX</button>
      </div>
      <div className="ip-body">
        {tab === 'sol' && (p.solution
          ? <div className="ip-sol q"><Tex as="div" src={p.solution} defs={p.defs} /></div>
          : <p className="ip-mute">Câu này chưa có lời giải. <button type="button" className="linkbtn" onClick={onEdit}>Thêm lời giải</button></p>)}
        {tab === 'tex' && <pre className="ip-tex">{q.latex}</pre>}
      </div>
    </aside>
  );
}
