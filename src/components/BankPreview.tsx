// Khung xem trước cạnh bảng câu hỏi (kiểu MathHub): bấm một dòng là câu hiện ngay ở đây, ↑/↓ chuyển câu theo danh sách đang lọc.
// Bấm đúp dòng (hoặc Enter, nút "Xem lớn") mở cửa sổ đầy đủ để sửa, kiểm duyệt, xác minh.
import { useMemo, useState } from 'react';
import { parseExTest } from '../lib/extest';
import { seqLabel } from '../lib/id';
import { LEVEL_LABEL, TYPE_LABEL, type Question } from '../lib/types';
import { QuestionView } from './QuestionView';

const SOL_KEY = 'hedu.bankprev.sol';
const readSol = () => { try { return localStorage.getItem(SOL_KEY) !== '0'; } catch { return true; } };

interface Props {
  q: Question;
  code: string | null;
  where: string;
  index: number;
  total: number;
  selected: boolean;
  onToggleSel(): void;
  onPrev(): void;
  onNext(): void;
  onOpen(): void;
  onEdit(): void;
  onAddToExam?(): void;
  onSlides(): void;
}

export function BankPreview({ q, code, where, index, total, selected, onToggleSel, onPrev, onNext, onOpen, onEdit, onAddToExam, onSlides }: Props) {
  const p = useMemo(() => parseExTest(q.latex), [q.latex]);
  const [sol, setSolState] = useState(readSol);
  const setSol = (v: boolean) => { setSolState(v); try { localStorage.setItem(SOL_KEY, v ? '1' : '0'); } catch { /* tiện lợi */ } };
  return (
    <aside className="bk-prev" aria-label={`Xem trước câu ${seqLabel(q.seq)}`}>
      <div className="bkp-head">
        <span className="bkp-nav">
          <button type="button" className="btn btn-sm btn-ghost" disabled={index <= 0} onClick={onPrev} aria-label="Câu trước (↑)" title="Câu trước (↑)">‹</button>
          <span className="bkp-pos">{index + 1}/{total}</span>
          <button type="button" className="btn btn-sm btn-ghost" disabled={index >= total - 1} onClick={onNext} aria-label="Câu sau (↓)" title="Câu sau (↓)">›</button>
        </span>
        <b className="bkp-no mono">Câu {seqLabel(q.seq)}</b>
        {code ? <span className="code-tag">{code}</span> : <span className="code-tag is-noid">Chưa có ID</span>}
        <span className={`pill l-${q.level}`}>{LEVEL_LABEL[q.level]}</span>
        <span className={`pill t-${q.type}`}>{TYPE_LABEL[q.type]}</span>
        <label className="sw bkp-sel" title="Chọn câu này"><input type="checkbox" checked={selected} onChange={onToggleSel} />Chọn</label>
      </div>
      {where && <div className="bkp-where" title={where}>{where}</div>}
      <div className="bkp-body">
        <QuestionView p={p} raw={q.latex} showSolution={sol} />
      </div>
      <div className="bkp-foot">
        <label className="sw"><input type="checkbox" checked={sol} onChange={(e) => setSol(e.target.checked)} />Lời giải</label>
        <span className="bkp-sp" />
        <button type="button" className="btn btn-sm" onClick={onEdit}>Sửa</button>
        {onAddToExam && <button type="button" className="btn btn-sm" onClick={onAddToExam}>Thêm vào đề</button>}
        <button type="button" className="btn btn-sm" onClick={onSlides}>Trình chiếu</button>
        <button type="button" className="btn btn-sm btn-accent" onClick={onOpen} title="Mở cửa sổ đầy đủ: kiểm duyệt, xác minh, sửa (Enter hoặc bấm đúp dòng)">Xem lớn</button>
      </div>
    </aside>
  );
}
