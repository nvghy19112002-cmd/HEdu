// Ngân hàng (giao diện macOS đợt 2): danh sách dạng thẻ câu gọn — số câu, mã ID, trạng thái, hai dòng đề, mức độ, loại, có hình.
// Bấm thẻ: câu hiện ở khung chi tiết bên phải; bấm đúp hoặc Enter: mở cửa sổ đầy đủ.
import { memo, useEffect, useMemo, useRef } from 'react';
import { figureOf } from '../lib/figure';
import { seqLabel } from '../lib/id';
import { stemSnippet } from '../lib/snippet';
import { LEVEL_LABEL, TYPE_LABEL, type Question } from '../lib/types';

export interface CardBadge { tone: 'ok' | 'warn' | 'bad' | 'draft'; label: string }

interface Props {
  rows: Question[];
  sel: Set<string>;
  activeUid: string | null;
  codeOf(q: Question): string | null; // null = chưa có ID
  badgeOf(q: Question): CardBadge;
  onToggle(uid: string): void;
  onPick(uid: string): void;
  onBig(uid: string): void;
}

const Card = memo(function Card({ q, code, badge, on, active, onToggle, onPick, onBig }: { q: Question; code: string | null; badge: CardBadge; on: boolean; active: boolean; onToggle(uid: string): void; onPick(uid: string): void; onBig(uid: string): void }) {
  const info = useMemo(() => ({ sn: stemSnippet(q.latex, 220), fig: figureOf(q) === 'yes' }), [q]);
  return (
    <div role="option" aria-selected={active} tabIndex={active ? 0 : -1} data-uid={q.uid}
      className={`bk2-card${on ? ' is-checked' : ''}`}
      onClick={() => onPick(q.uid)} onDoubleClick={() => onBig(q.uid)}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onBig(q.uid); } else if (e.key === ' ') { e.preventDefault(); onToggle(q.uid); } }}>
      <div className="bk2-top">
        <input type="checkbox" checked={on} aria-label={`Chọn câu ${seqLabel(q.seq)}`} onClick={(e) => e.stopPropagation()} onChange={() => onToggle(q.uid)} />
        <span className="bk2-no">{seqLabel(q.seq)}</span>
        <span className={`bk2-id${code ? '' : ' none'}`} title={code ?? 'Chưa được đặt vào Dạng nào'}>{code ?? '— chưa có ID —'}</span>
        <span className={`bk2-badge ${badge.tone}`}>{badge.label}</span>
      </div>
      <div className="bk2-ex">{info.sn || '—'}</div>
      <div className="bk2-pills">
        <span className={`pill l-${q.level}`}>{LEVEL_LABEL[q.level]}</span>
        <span className={`pill t-${q.type}`}>{TYPE_LABEL[q.type]}</span>
        {info.fig && <span className="bk2-fig" title="Có hình">▲ Hình</span>}
      </div>
    </div>
  );
});

export function BankCards({ rows, sel, activeUid, codeOf, badgeOf, onToggle, onPick, onBig }: Props) {
  const box = useRef<HTMLDivElement>(null);
  // đổi câu bằng ↑/↓ hoặc nút ‹ › ở khung chi tiết thì thẻ tương ứng cuộn vào khung nhìn
  useEffect(() => {
    if (!activeUid) return;
    const el = [...(box.current?.querySelectorAll<HTMLElement>('[data-uid]') ?? [])].find((r) => r.dataset.uid === activeUid);
    if (!el) return;
    el.scrollIntoView({ block: 'nearest' });
    if (box.current?.contains(document.activeElement) && document.activeElement !== el && !(document.activeElement instanceof HTMLInputElement)) el.focus({ preventScroll: true });
  }, [activeUid, rows]);
  return (
    <div ref={box} className="bk2-list" role="listbox" aria-label="Danh sách câu hỏi" aria-multiselectable="true">
      {rows.map((q) => <Card key={q.uid} q={q} code={codeOf(q)} badge={badgeOf(q)} on={sel.has(q.uid)} active={activeUid === q.uid} onToggle={onToggle} onPick={onPick} onBig={onBig} />)}
    </div>
  );
}
