// Kiểm tra trùng: danh sách cặp nghi trùng + xem hai câu cạnh nhau.
// Máy chỉ GỢI Ý. Không xoá / gộp / sửa gì; "Đã xem" chỉ nhớ trong phiên làm việc này.
import { useEffect, useMemo, useRef, useState } from 'react';
import { DupIndex, type DupPairHit, type ScanStats } from '../lib/dupindex';
import { DUP_KIND_LABEL, fingerprint, type DupKind } from '../lib/dup2';
import { parseExTest } from '../lib/extest';
import { QuestionView } from './QuestionView';
import { ReviewBadge } from './ReviewControl';
import { questionCode, seqLabel } from '../lib/id';
import { LEVEL_LABEL, TYPE_LABEL, type Question } from '../lib/types';

const SHOWN: DupKind[] = ['raw', 'conflict', 'same', 'near', 'template', 'insufficient'];
const HINT: Record<DupKind, string> = {
  raw: 'Mã LaTeX giống hệt nhau.',
  conflict: 'Cùng đề, phương án, hình nhưng đáp án khác nhau — cần xem câu nào đúng.',
  same: 'Cùng đề, phương án, hình, đáp án; chỉ khác cách trình bày.',
  near: 'Cùng số liệu, dấu và hình nhưng diễn đạt khác.',
  template: 'Cùng mẫu nhưng khác số liệu, dấu, điều kiện, hình hoặc loại câu — thường là câu khác nhau.',
  insufficient: 'Có câu chưa đọc được đầy đủ (lỗi cú pháp/thiếu thành phần) nên chưa thể kết luận — nên mở ra sửa mã rồi quét lại.', unrelated: '',
};
const stamp = (qs: Question[]) => `${qs.length}:${qs.reduce((m, q) => Math.max(m, q.updatedAt), 0)}`;

export function DupCheck({ questions, onClose, onOpen }: { questions: Question[]; onClose: () => void; onOpen: (uid: string) => void }) {
  const byUid = useMemo(() => new Map(questions.map((q) => [q.uid, q])), [questions]);
  const idx = useRef(new DupIndex());
  const abort = useRef({ aborted: false });
  const [busy, setBusy] = useState<{ done: number; total: number; phase: string } | null>(null);
  const [pairs, setPairs] = useState<DupPairHit[] | null>(null);
  const [stats, setStats] = useState<ScanStats | null>(null);
  const [scanned, setScanned] = useState('');
  const [kinds, setKinds] = useState<Set<DupKind>>(new Set(['raw', 'conflict', 'same', 'near']));
  const [seen, setSeen] = useState<Set<string>>(new Set()); // chỉ trong phiên
  const [hideSeen, setHideSeen] = useState(false);
  const [cur, setCur] = useState<string | null>(null);
  const [showSol, setShowSol] = useState(false);
  const key = (p: DupPairHit) => p.a + '|' + p.b;

  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.drw')) onClose(); }; document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h); }, [onClose]);
  useEffect(() => () => { abort.current.aborted = true; }, []);

  const run = async () => {
    abort.current = { aborted: false };
    setBusy({ done: 0, total: questions.length, phase: 'Đang lập chỉ mục' });
    const sig = stamp(questions);
    const r = await idx.current.scan(questions.map((q) => ({ uid: q.uid, latex: q.latex })), {
      signal: abort.current,
      keep: (k) => SHOWN.includes(k),
      onProgress: (done, total, phase) => setBusy({ done, total, phase: phase === 'index' ? 'Đang lập chỉ mục' : 'Đang so sánh' }),
    });
    setBusy(null);
    if (r.stats.aborted) return;
    setPairs(r.pairs); setStats(r.stats); setScanned(sig); setCur(r.pairs[0] ? key(r.pairs[0]) : null);
  };

  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const p of pairs ?? []) c[p.result.kind] = (c[p.result.kind] ?? 0) + 1; return c; }, [pairs]);
  const list = useMemo(() => (pairs ?? []).filter((p) => kinds.has(p.result.kind) && (!hideSeen || !seen.has(key(p))) && byUid.has(p.a) && byUid.has(p.b)), [pairs, kinds, hideSeen, seen, byUid]);
  const active = list.find((p) => key(p) === cur) ?? list[0];
  const stale = pairs !== null && scanned !== stamp(questions);
  const toggleKind = (k: DupKind) => setKinds((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div className="dc" role="dialog" aria-modal="true" aria-label="Kiểm tra trùng">
      <header className="dc-head">
        <h2>Kiểm tra trùng</h2>
        <p className="dc-note">Máy chỉ gợi ý để bạn xem lại. “Mức tương đồng” không phải bằng chứng hai câu trùng nhau. Bạn quyết định giữ, sửa hay xoá — ở màn Ngân hàng.</p>
        <div className="dc-acts">
          {busy
            ? <button type="button" className="btn btn-sm" onClick={() => { abort.current.aborted = true; }}>Dừng quét</button>
            : <button type="button" className="btn btn-primary btn-sm" onClick={run}>{pairs ? 'Quét lại' : `Quét ${questions.length} câu`}</button>}
          <button type="button" className="btn btn-sm" onClick={onClose}>Đóng</button>
        </div>
      </header>

      {busy && <div className="dc-prog" role="progressbar" aria-valuemin={0} aria-valuemax={busy.total} aria-valuenow={busy.done}><div style={{ width: `${Math.round((100 * busy.done) / Math.max(1, busy.total))}%` }} /><span>{busy.phase}… {busy.done}/{busy.total}</span></div>}
      {stale && !busy && <p className="dc-stale">Ngân hàng đã thay đổi sau lần quét này — bấm “Quét lại” để cập nhật danh sách.</p>}

      {pairs === null && !busy && <p className="dc-empty">Bấm “Quét” để tìm các cặp câu nghi trùng. Quét chỉ đọc, không thay đổi câu nào.</p>}

      {pairs !== null && (
        <div className="dc-body">
          <div className="dc-left">
            <div className="chips" role="group" aria-label="Loại nghi vấn">
              {SHOWN.map((k) => <button key={k} type="button" className="chip" aria-pressed={kinds.has(k)} onClick={() => toggleKind(k)}>{DUP_KIND_LABEL[k]}<span className="chip-n">{counts[k] ?? 0}</span></button>)}
            </div>
            <label className="dc-chk"><input type="checkbox" checked={hideSeen} onChange={(e) => setHideSeen(e.target.checked)} /> Ẩn các cặp đã xem (chỉ trong phiên này)</label>
            {stats && <p className="dc-stat">{pairs.length} cặp từ {stats.questions} câu · {stats.comparisons} phép so · {(stats.ms / 1000).toFixed(1)} giây. Ứng viên được chọn theo từ khoá hiếm nên có thể bỏ sót cặp chỉ giống ở các từ rất phổ biến.</p>}
            {!list.length && <p className="dc-empty">Không có cặp nào ở các nhóm đang chọn.</p>}
            <ul className="dc-list">
              {list.slice(0, 300).map((p) => {
                const A = byUid.get(p.a)!, B = byUid.get(p.b)!;
                return (
                  <li key={key(p)}>
                    <button type="button" className={`dc-row${active && key(p) === key(active) ? ' on' : ''}${seen.has(key(p)) ? ' seen' : ''}`} onClick={() => setCur(key(p))}>
                      <span className={`dc-kind k-${p.result.kind}`}>{DUP_KIND_LABEL[p.result.kind]}</span>
                      <span className="mono">{seqLabel(A.seq)} ↔ {seqLabel(B.seq)}</span>
                      <span className="dc-sc">tương đồng {Math.round(p.result.score * 100)}%</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {list.length > 300 && <p className="dc-stat">Đang hiện 300 cặp đầu trong {list.length}. Lọc theo loại để thu hẹp.</p>}
          </div>

          <div className="dc-right">
            {active ? (
              <Compare key={key(active)} hit={active} A={byUid.get(active.a)!} B={byUid.get(active.b)!} showSol={showSol} setShowSol={setShowSol}
                onOpen={onOpen} seenNow={seen.has(key(active))} onSeen={() => setSeen((s) => new Set(s).add(key(active)))} />
            ) : <p className="dc-empty">Chọn một cặp ở bên trái.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function Compare({ hit, A, B, showSol, setShowSol, onOpen, seenNow, onSeen }: { hit: DupPairHit; A: Question; B: Question; showSol: boolean; setShowSol: (v: boolean) => void; onOpen: (uid: string) => void; seenNow: boolean; onSeen: () => void }) {
  const fa = fingerprint(A.latex), fb = fingerprint(B.latex);
  const parts: [string, boolean][] = [
    ['Loại câu', fa.type === fb.type], ['Đề bài', fa.stemKey === fb.stemKey], ['Phương án', fa.optSet === fb.optSet],
    ['Đáp án đúng', fa.ansKey === fb.ansKey], ['Hình', fa.figKey === fb.figKey], ['Lời giải', fa.solKey === fb.solKey],
  ];
  const r = hit.result;
  return (
    <div className="dc-cmp">
      <div className="dc-why">
        <b className={`dc-kind k-${r.kind}`}>{DUP_KIND_LABEL[r.kind]}</b>
        {!r.reasons.length && <span>{HINT[r.kind]}</span>}
        {r.reasons.map((t, i) => <p key={i}>{t}</p>)}
        {r.flags.length > 0 && <p className="dc-flags">Khác nhau: {r.flags.join(' · ')}</p>}
        <p className="dc-sc">Mức tương đồng {Math.round(r.score * 100)}% (chữ {Math.round(r.text * 100)}%, công thức {Math.round(r.math * 100)}%) — chỉ để tham khảo.</p>
        <div className="dc-parts" aria-label="Đối chiếu từng phần">
          {parts.map(([n, eq]) => <span key={n} className={`dc-part ${eq ? 'eq' : 'ne'}`}>{n}: {eq ? 'giống' : 'khác'}</span>)}
        </div>
        <div className="dc-btns">
          <label className="dc-chk"><input type="checkbox" checked={showSol} onChange={(e) => setShowSol(e.target.checked)} /> Hiện lời giải</label>
          <button type="button" className="btn btn-sm" disabled={seenNow} onClick={onSeen}>{seenNow ? 'Đã xem' : 'Đánh dấu đã xem'}</button>
        </div>
      </div>
      <div className="dc-pair">
        {[A, B].map((q, n) => (
          <article key={q.uid} className="dc-card">
            <div className="card-meta">
              <b>{n === 0 ? 'Câu A' : 'Câu B'}</b>
              <span className={`pill t-${q.type}`}>{TYPE_LABEL[q.type]}</span>
              <span className={`pill l-${q.level}`}>{LEVEL_LABEL[q.level]}</span>
              <ReviewBadge q={q} />
              <span className="code-tag">{questionCode(q, q.level)}</span>
              <span className="mono card-no">{seqLabel(q.seq)}</span>
              <button type="button" className="btn btn-sm dc-open" onClick={() => onOpen(q.uid)}>Mở để sửa</button>
            </div>
            <QuestionView p={parseExTest(q.latex)} variant="compact" showSolution={showSol} raw={q.latex} />
          </article>
        ))}
      </div>
    </div>
  );
}
