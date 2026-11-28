// Ngân hàng (giao diện macOS đợt 2): khung chi tiết câu đang chọn — Xem trước / Mã LaTeX, ‹ › chuyển câu,
// chân: Nhân bản · Xoá · Sửa (E) · Duyệt câu này. Bấm "Xem lớn" (hoặc Enter) mở cửa sổ đầy đủ để kiểm duyệt, xác minh Dạng.
import { useEffect, useMemo, useState } from 'react';
import { parseExTest } from '../lib/extest';
import { texTokens } from '../lib/banktriage';
import { seqLabel } from '../lib/id';
import { LEVEL_LABEL, TYPE_LABEL, type Question } from '../lib/types';
import { QuestionView } from './QuestionView';
import type { CardBadge } from './BankCards';
import { IcCheck, IcCopy, IcEdit, IcTrash } from './Icons';

const VIEW_KEY = 'hedu.bankdetail.view';
const SOL_KEY = 'hedu.bankprev.sol';
const readView = (): 'preview' | 'latex' => { try { return localStorage.getItem(VIEW_KEY) === 'latex' ? 'latex' : 'preview'; } catch { return 'preview'; } };
const readSol = () => { try { return localStorage.getItem(SOL_KEY) !== '0'; } catch { return true; } };

interface Props {
  q: Question;
  code: string | null;
  where: string;
  badge: CardBadge;
  /** việc còn thiếu (vd "Chưa có ID · Thiếu lời giải") — chỉ để nhắc, không chặn duyệt */
  issues: string[];
  index: number;
  total: number;
  onPrev(): void;
  onNext(): void;
  onEdit(): void;
  onBig(): void;
  onDuplicate(): void;
  onDelete(): void;
  onApprove(on: boolean): void;
  onAddToExam?(): void;
  onSlides(): void;
  toast(msg: string): void;
}

export function BankDetail({ q, code, where, badge, issues, index, total, onPrev, onNext, onEdit, onBig, onDuplicate, onDelete, onApprove, onAddToExam, onSlides, toast }: Props) {
  const p = useMemo(() => parseExTest(q.latex), [q.latex]);
  const [view, setViewState] = useState(readView);
  const setView = (v: 'preview' | 'latex') => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* tiện lợi */ } };
  const [sol, setSolState] = useState(readSol);
  const setSol = (v: boolean) => { setSolState(v); try { localStorage.setItem(SOL_KEY, v ? '1' : '0'); } catch { /* tiện lợi */ } };
  const [delAsk, setDelAsk] = useState(false);
  useEffect(() => { setDelAsk(false); }, [q.uid]);
  const toks = useMemo(() => (view === 'latex' ? texTokens(q.latex) : []), [view, q.latex]);
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast(`Đã sao chép ${what}.`); } catch { toast('Không sao chép được — hãy bôi đen rồi Ctrl C.'); }
  };
  const approved = q.review === 'approved';
  return (
    <section className="bk2-det" aria-label={`Chi tiết câu ${seqLabel(q.seq)}`}>
      <div className="bk2-dhead">
        <span className="bk2-dmeta">
          <b className="bk2-no">{seqLabel(q.seq)}</b>
          {code
            ? <button type="button" className="bk2-copyid" title="Sao chép mã ID" onClick={() => { void copy(code, `mã ${code}`); }}>{code}<IcCopy size={13} /></button>
            : <span className="bk2-id none">— chưa có ID —</span>}
          <span className={`bk2-badge ${badge.tone}`}>{badge.label}</span>
        </span>
        <span className="seg" role="tablist" aria-label="Chế độ xem">
          <button type="button" role="tab" aria-selected={view === 'preview'} aria-current={view === 'preview' ? 'page' : undefined} onClick={() => setView('preview')}>Xem trước</button>
          <button type="button" role="tab" aria-selected={view === 'latex'} aria-current={view === 'latex' ? 'page' : undefined} onClick={() => setView('latex')}>Mã LaTeX</button>
        </span>
        <span className="bk2-pager">
          <button type="button" disabled={index <= 0} onClick={onPrev} aria-label="Câu trước (↑)" title="Câu trước (↑)">‹</button>
          <span>{index + 1} / {total}</span>
          <button type="button" disabled={index >= total - 1} onClick={onNext} aria-label="Câu sau (↓)" title="Câu sau (↓)">›</button>
        </span>
      </div>
      <div className="bk2-dbody">
        <div className="bk2-tags">
          <span className={`pill l-${q.level}`}>{LEVEL_LABEL[q.level]}</span>
          <span className={`pill t-${q.type}`}>{TYPE_LABEL[q.type]}</span>
          {where && <span className="bk2-path" title={where}>{where}</span>}
        </div>
        {view === 'preview'
          ? <QuestionView p={p} raw={q.latex} showSolution={sol} />
          : (
            <div className="bk2-code">
              <pre>{toks.map((t, i) => (t.t === 'txt' ? t.s : <span key={i} className={`tk-${t.t}`}>{t.s}</span>))}</pre>
              <button type="button" className="btn btn-sm" onClick={() => { void copy(q.latex, 'mã LaTeX'); }}><IcCopy size={14} />Sao chép LaTeX</button>
            </div>
          )}
      </div>
      <div className="bk2-dfoot">
        {view === 'preview' && <label className="sw"><input type="checkbox" checked={sol} onChange={(e) => setSol(e.target.checked)} />Lời giải</label>}
        <button type="button" className="btn btn-sm btn-ghost" onClick={onDuplicate}>Nhân bản</button>
        {onAddToExam && <button type="button" className="btn btn-sm btn-ghost" onClick={onAddToExam}>Thêm vào đề</button>}
        <button type="button" className="btn btn-sm btn-ghost" onClick={onSlides}>Trình chiếu</button>
        {delAsk
          ? <button type="button" className="btn btn-sm btn-ghost bk2-danger" autoFocus onClick={() => { setDelAsk(false); onDelete(); }} onBlur={() => setDelAsk(false)}><IcTrash size={14} />Bấm lần nữa để xoá</button>
          : <button type="button" className="btn btn-sm btn-ghost bk2-danger" onClick={() => setDelAsk(true)} title="Chuyển vào Thùng rác (có hỏi lại)"><IcTrash size={14} />Xoá</button>}
        <span className="bk2-sp" />
        {issues.length > 0 && !approved && <span className="bk2-hint">{issues.join(' · ')}</span>}
        <button type="button" className="btn btn-sm" onClick={onBig} title="Mở cửa sổ đầy đủ: kiểm duyệt, xác minh Dạng (Enter)">Xem lớn</button>
        <button type="button" className="btn btn-sm" onClick={onEdit} title="Sửa câu (E)"><IcEdit size={14} />Sửa <kbd>E</kbd></button>
        {approved
          ? <button type="button" className="btn btn-sm bk2-ok" onClick={() => onApprove(false)} title="Bấm để đưa về Chưa kiểm tra"><IcCheck size={14} />Đã duyệt</button>
          : <button type="button" className="btn btn-sm btn-accent" onClick={() => onApprove(true)}>Duyệt câu này</button>}
      </div>
    </section>
  );
}
