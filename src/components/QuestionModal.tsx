// Cửa sổ xem một câu (màn Ngân hàng): bấm vào thẻ là mở. Hiện đủ đề, đáp án, lời giải; Trước/Sau theo đúng danh sách đang lọc
// (qua cả ranh giới trang); chọn câu; kiểm duyệt và xác minh Dạng/mức độ; xem chuẩn bằng TeX Live; SỬA NGAY TRONG CỬA SỔ này
// (lưu xong quay về xem; còn thay đổi chưa lưu thì hỏi trước khi rời). Phím: ← → câu trước/sau, Esc đóng / thoát sửa.
import { useEffect, useMemo, useRef, useState } from 'react';
import { QuestionEditor } from './QuestionEditor';
import { parseExTest } from '../lib/extest';
import { questionCode, seqLabel } from '../lib/id';
import { isTikzReady } from '../lib/tikz';
import { place } from '../lib/curriculum';
import { shortName } from '../lib/taxonomy';
import { LEVEL_LABEL, TYPE_LABEL, type Question, type ReviewStatus } from '../lib/types';
import { CompiledView } from './CompiledView';
import { IcEdit } from './Icons';
import { IdReviewControl } from './IdReviewControl';
import type { Effective } from '../lib/idreview';
import { QuestionView } from './QuestionView';
import { ReviewBadge, ReviewControl } from './ReviewControl';

const nf = new Intl.NumberFormat('vi-VN');

interface Props {
  q: Question;
  index: number;
  total: number;
  eff: Effective;
  selected: boolean;
  onToggleSel(): void;
  onPrev(): void;
  onNext(): void;
  /** đang sửa câu ngay trong cửa sổ */
  editing: boolean;
  onEditing(on: boolean): void;
  onReview(s: ReviewStatus | undefined): Promise<boolean>;
  onClose(): void;
}

export function QuestionModal({ q, index, total, eff, selected, onToggleSel, onPrev, onNext, editing, onEditing, onReview, onClose }: Props) {
  const leaveRef = useRef<((proceed: () => void) => boolean) | null>(null);
  /** mọi lối rời (đóng, Trước/Sau, thoát sửa) đi qua câu hỏi "bỏ thay đổi chưa lưu?" của trình sửa */
  const guard = (proceed: () => void) => { const l = editing ? leaveRef.current : null; if (l) l(proceed); else proceed(); };
  const root = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(document.activeElement);
  const [sol, setSol] = useState(true);
  const [tex, setTex] = useState(false);
  const p = useMemo(() => parseExTest(q.latex), [q.latex]);
  const at = place(q.formId) ?? place(q.lessonId) ?? place(q.chapterId);
  const where = at ? [at.chapter?.name, at.lesson?.name, at.form?.name].filter(Boolean).map((x) => shortName(x!)).join(' › ') : 'Chưa gán vị trí';

  useEffect(() => { const prev = opener.current as HTMLElement | null; root.current?.focus(); return () => { prev?.focus?.(); }; }, []);
  useEffect(() => { setTex(false); }, [q.uid]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement;
      if (t.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'Escape') { e.preventDefault(); if (editing) guard(() => onEditing(false)); else onClose(); }
      else if (editing) return;
      else if (e.key === 'ArrowLeft' && index > 0) { e.preventDefault(); onPrev(); }
      else if (e.key === 'ArrowRight' && index < total - 1) { e.preventDefault(); onNext(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  return (
    <>
      <div className="qm-scrim" onMouseDown={() => guard(onClose)} aria-hidden="true" />
      {editing ? (
        <div className="qm qm-edit" role="dialog" aria-modal="true" aria-label={`Sửa câu ${seqLabel(q.seq)}`} tabIndex={-1} ref={root}>
          <QuestionEditor key={q.uid} editing={q} variant="drawer" leaveRef={leaveRef} onSaved={() => onEditing(false)} onClose={() => guard(() => onEditing(false))} />
        </div>
      ) : (
      <div className="qm" role="dialog" aria-modal="true" aria-label={`Câu ${seqLabel(q.seq)}`} tabIndex={-1} ref={root}>
        <header className="qm-head">
          <b className="qm-no">{seqLabel(q.seq)}</b>
          <span className={`pill t-${q.type}`}>{TYPE_LABEL[q.type]}</span>
          <span className={`pill l-${q.level}`}>{LEVEL_LABEL[q.level]}</span>
          <span className="code-tag">{questionCode(q, q.level)}</span>
          <ReviewBadge q={q} />
          <span className="qm-where" title={where}>{where}</span>
          <span className="qm-pos">{nf.format(index + 1)} / {nf.format(total)}</span>
          <button type="button" className="ico qm-x" aria-label="Đóng (Esc)" title="Đóng (Esc)" onClick={onClose}>✕</button>
        </header>
        <div className="qm-body">
          {tex ? <CompiledView latex={q.latex} solution={sol} onBack={() => setTex(false)} /> : <QuestionView p={p} showSolution={sol} raw={q.latex} />}
          {q.tags.length > 0 && <p className="qm-tags">{q.tags.map((t) => <span key={t} className="tag">{t}</span>)}</p>}
          <div className="qm-ctl">
            <ReviewControl key={q.uid} q={q} onChange={onReview} />
            <IdReviewControl key={`id-${q.uid}`} q={q} eff={eff} />
          </div>
        </div>
        <footer className="qm-foot">
          <label className="qm-sel"><input type="checkbox" checked={selected} onChange={onToggleSel} /> Chọn câu</label>
          <label className="sw"><input type="checkbox" checked={sol} onChange={(e) => setSol(e.target.checked)} />Lời giải</label>
          {isTikzReady() && <button type="button" className="btn btn-sm" aria-pressed={tex} onClick={() => setTex(!tex)} title="Biên dịch nguyên câu bằng TeX Live">Xem chuẩn TeX</button>}
          <span className="qm-nav">
            <button type="button" className="btn btn-sm" disabled={index <= 0} onClick={onPrev} title="Câu trước (←)">‹ Trước</button>
            <button type="button" className="btn btn-sm" disabled={index >= total - 1} onClick={onNext} title="Câu sau (→)">Sau ›</button>
          </span>
          <button type="button" className="btn btn-sm btn-dark" onClick={() => onEditing(true)}><IcEdit size={15} /> Sửa câu</button>
        </footer>
      </div>
      )}
    </>
  );
}
