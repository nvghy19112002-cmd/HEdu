// Bảng gọn của màn Câu hỏi: mỗi câu một dòng (chọn · số câu · mã ID · mức độ · loại · nội dung · đáp án · hình).
// Bấm dòng mở cửa sổ xem; dòng đang xem được tô sáng và tự cuộn vào khung nhìn khi đổi câu bằng ←/→.
import { memo, useEffect, useMemo, useRef } from 'react';
import { answerText } from '../lib/banktable';
import { figureOf } from '../lib/figure';
import { seqLabel } from '../lib/id';
import { stemSnippet } from '../lib/snippet';
import { LEVEL_LABEL, TYPE_LABEL, type Question } from '../lib/types';

interface Props {
  rows: Question[];
  sel: Set<string>;
  activeUid: string | null;
  codeOf(q: Question): string | null; // null = chưa có ID
  onToggle(uid: string): void;
  onOpen(uid: string): void;
  /** bấm đúp: mở cửa sổ đầy đủ (khi có khung xem trước) */
  onBig?(uid: string): void;
}

const Row = memo(function Row({ q, code, on, active, onToggle, onOpen, onBig }: { q: Question; code: string | null; on: boolean; active: boolean; onToggle(uid: string): void; onOpen(uid: string): void; onBig?(uid: string): void }) {
  const info = useMemo(() => ({ ans: answerText(q), sn: stemSnippet(q.latex, 150), fig: figureOf(q) }), [q]);
  return (
    <tr data-uid={q.uid} className={`qt-row lv-${q.level}${on ? ' is-selected' : ''}${active ? ' is-active' : ''}`} tabIndex={0}
      onClick={() => onOpen(q.uid)}
      onDoubleClick={() => onBig?.(q.uid)}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (onBig ?? onOpen)(q.uid); } else if (e.key === ' ') { e.preventDefault(); onOpen(q.uid); } }}>
      <td className="qt-c qt-sel" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={on} aria-label={`Chọn câu ${seqLabel(q.seq)}`} onChange={() => onToggle(q.uid)} />
      </td>
      <td className="qt-c qt-no mono">{seqLabel(q.seq)}</td>
      <td className="qt-c qt-id">{code ? <span className="code-tag" title={code}>{code}</span> : <span className="code-tag is-noid">Chưa có ID</span>}</td>
      <td className="qt-c"><span className={`pill l-${q.level}`}>{LEVEL_LABEL[q.level]}</span></td>
      <td className="qt-c"><span className={`pill t-${q.type}`}>{TYPE_LABEL[q.type]}</span></td>
      <td className="qt-c qt-sn" title={info.sn}>{info.sn || '—'}</td>
      <td className="qt-c qt-ans mono">{info.ans || '—'}</td>
      <td className="qt-c qt-fig" title={info.fig === 'yes' ? 'Có hình' : undefined}>{info.fig === 'yes' ? '▦' : ''}</td>
    </tr>
  );
});

export function BankTable({ rows, sel, activeUid, codeOf, onToggle, onOpen, onBig }: Props) {
  const body = useRef<HTMLTableSectionElement>(null);
  // đổi câu bằng ←/→ trong cửa sổ xem thì dòng tương ứng cuộn vào khung nhìn
  useEffect(() => {
    if (!activeUid) return;
    const el = [...(body.current?.querySelectorAll<HTMLElement>('tr[data-uid]') ?? [])].find((r) => r.dataset.uid === activeUid);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeUid, rows]);
  return (
    <div className="qt-wrap">
      <table className="qt">
        <thead><tr><th className="qt-sel" /><th>Câu</th><th>Mã ID</th><th>Mức độ</th><th>Loại câu</th><th>Nội dung</th><th>Đáp án</th><th className="qt-fig" title="Có hình">▦</th></tr></thead>
        <tbody ref={body}>
          {rows.map((q) => <Row key={q.uid} q={q} code={codeOf(q)} on={sel.has(q.uid)} active={activeUid === q.uid} onToggle={onToggle} onOpen={onOpen} onBig={onBig} />)}
        </tbody>
      </table>
    </div>
  );
}
