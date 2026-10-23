// Kiểm tra trùng: danh sách cặp nghi trùng + xem hai câu cạnh nhau.
// Máy chỉ GỢI Ý. Không xoá / gộp / sửa gì; "Đã xem" chỉ nhớ trong phiên làm việc này.
import { useEffect, useMemo, useRef, useState } from 'react';
import { DupIndex, type DupPairHit, type ScanStats } from '../lib/dupindex';
import { compareLatex, DUP_KIND_LABEL, type DupKind } from '../lib/dup2';
import { PairCompare } from './PairCompare';
import { ReviewBadge } from './ReviewControl';
import { questionCode, seqLabel } from '../lib/id';
import { useTaxonomy } from '../lib/curriculum';
import { shortName } from '../lib/taxonomy';
import { ALL_SCOPE, isAll, scopeKey, scopeLabel, scopeOptions, scopeUids, setLevel, type ScanMode, type Scope } from '../lib/dupscope';
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
const PAGE = 50;
/** Đã đổi so với lúc quét? So từng câu (uid + nội dung), không dựa vào đồng hồ. */
function changedSince(snap: Map<string, string>, qs: Question[]): number {
  let n = Math.abs(snap.size - qs.length);
  for (const q of qs) if (snap.get(q.uid) !== q.latex) n++;
  return n;
}

export function DupCheck({ questions, selected, onClose, onOpen, onGoto }: { questions: Question[]; selected?: ReadonlySet<string>; onClose: () => void; onOpen: (uid: string) => void; onGoto: (uid: string) => void }) {
  const { tax } = useTaxonomy();
  const [scope, setScope] = useState<Scope>(ALL_SCOPE);
  const [mode, setMode] = useState<ScanMode>('inside');
  const [page, setPage] = useState(0);
  const snap = useRef<Map<string, string>>(new Map());
  const [scannedKey, setScannedKey] = useState('');
  const [scannedLabel, setScannedLabel] = useState('');
  const byUid = useMemo(() => new Map(questions.map((q) => [q.uid, q])), [questions]);
  const idx = useRef(new DupIndex());
  const abort = useRef({ aborted: false });
  const [busy, setBusy] = useState<{ done: number; total: number; phase: string } | null>(null);
  const [pairs, setPairs] = useState<DupPairHit[] | null>(null);
  const [stats, setStats] = useState<ScanStats | null>(null);
  const [kinds, setKinds] = useState<Set<DupKind>>(new Set(['raw', 'conflict', 'same', 'near']));
  const [seen, setSeen] = useState<Set<string>>(new Set()); // chỉ trong phiên
  const [hideSeen, setHideSeen] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const [scopeOpen, setScopeOpen] = useState(true); // sau khi quét thì thu gọn để dành chỗ cho phần so sánh
  const [cur, setCur] = useState<string | null>(null);
  const pk = (p: DupPairHit) => p.a + '|' + p.b;

  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.drw')) onClose(); }; document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h); }, [onClose]);
  useEffect(() => () => { abort.current.aborted = true; }, []);

  const selCount = selected?.size ?? 0;
  const uids = useMemo(() => (isAll(scope) ? undefined : scopeUids(questions, scope, tax, selected)), [questions, scope, tax, selected]);
  const sideA = uids ? uids.size : questions.length;
  const opts = useMemo(() => scopeOptions(tax, questions, scope, shortName), [tax, questions, scope]);

  const run = async () => {
    if (uids && uids.size === 0) return;
    abort.current = { aborted: false };
    setBusy({ done: 0, total: questions.length, phase: 'Đang lập chỉ mục' });
    const snapshot = new Map(questions.map((q) => [q.uid, q.latex] as const));
    const key = scopeKey(scope, mode);
    const label = scopeLabel(tax, scope, selCount, shortName);
    const r = await idx.current.scan(questions.map((q) => ({ uid: q.uid, latex: q.latex })), {
      signal: abort.current, scope: uids, vsAll: mode === 'vsAll',
      keep: (k) => SHOWN.includes(k),
      onProgress: (done, total, phase) => setBusy({ done, total, phase: phase === 'index' ? 'Đang lập chỉ mục' : 'Đang so sánh' }),
    });
    setBusy(null);
    if (r.stats.aborted) return; // dừng giữa chừng: giữ kết quả cũ, KHÔNG coi là "không trùng"
    snap.current = snapshot;
    setScopeOpen(false); setPairs(r.pairs); setStats(r.stats); setScannedKey(key); setScannedLabel(label); setPage(0); setCur(r.pairs[0] ? pk(r.pairs[0]) : null);
  };

  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const p of pairs ?? []) c[p.result.kind] = (c[p.result.kind] ?? 0) + 1; return c; }, [pairs]);
  const list = useMemo(() => (pairs ?? []).filter((p) => kinds.has(p.result.kind) && (!hideSeen || !seen.has(pk(p))) && byUid.has(p.a) && byUid.has(p.b)), [pairs, kinds, hideSeen, seen, byUid]);
  const active = list.find((p) => pk(p) === cur) ?? list[0];
  const changed = pairs !== null ? changedSince(snap.current, questions) : 0;
  const scopeChanged = pairs !== null && scannedKey !== scopeKey(scope, mode);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const pageNo = Math.min(page, pages - 1);
  const shown = list.slice(pageNo * PAGE, pageNo * PAGE + PAGE);
  const toggleKind = (k: DupKind) => setKinds((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div className="dc" role="dialog" aria-modal="true" aria-label="Kiểm tra trùng">
      <header className="dc-head">
        <h2>Kiểm tra trùng</h2>
        <p className="dc-note">Máy chỉ gợi ý để bạn xem lại. “Mức tương đồng” không phải bằng chứng hai câu trùng nhau. Bạn quyết định giữ, sửa hay xoá — ở màn Ngân hàng.</p>
        <div className="dc-acts">
          {busy
            ? <button type="button" className="btn btn-sm" onClick={() => { abort.current.aborted = true; }}>Dừng quét</button>
            : <button type="button" className="btn btn-primary btn-sm" onClick={run}>{pairs ? 'Quét lại' : `Quét ${sideA} câu`}</button>}
          <button type="button" className="btn btn-sm" onClick={onClose}>Đóng</button>
        </div>
      </header>

      {!scopeOpen && (
        <div className="dc-scope-min">
          <span><b>Phạm vi:</b> {scopeLabel(tax, scope, selCount, shortName)} · {mode === 'vsAll' && !isAll(scope) ? 'đối chiếu với toàn ngân hàng' : 'trong phạm vi'} · {sideA} câu</span>
          <button type="button" className="btn btn-sm" aria-expanded={false} onClick={() => setScopeOpen(true)}>Đổi phạm vi ▾</button>
        </div>
      )}
      <div className="dc-scope" role="group" aria-label="Phạm vi quét" hidden={!scopeOpen}>
        <label>Khối
          <select value={scope.grades.length === 1 ? String(scope.grades[0]) : ''} onChange={(e) => setScope(setLevel(scope, 'grade', e.target.value ? [Number(e.target.value)] : []))}>
            <option value="">Tất cả</option>
            {opts.grades.map((o) => <option key={o.value} value={o.value}>{o.label} ({o.count})</option>)}
          </select>
        </label>
        <label>Phân môn
          <select value={scope.branch} onChange={(e) => setScope(setLevel(scope, 'branch', e.target.value))}>
            <option value="">Tất cả</option>
            {opts.branches.map((o) => <option key={o.value} value={o.value}>{o.label} ({o.count})</option>)}
          </select>
        </label>
        <label>Chương
          <select value={scope.chapterId} onChange={(e) => setScope(setLevel(scope, 'chapter', e.target.value))}>
            <option value="">Tất cả</option>
            {opts.chapters.map((o) => <option key={o.value} value={o.value}>{o.label} ({o.count})</option>)}
          </select>
        </label>
        <label>Bài
          <select value={scope.lessonId} disabled={!scope.chapterId} onChange={(e) => setScope(setLevel(scope, 'lesson', e.target.value))}>
            <option value="">{scope.chapterId ? 'Tất cả' : 'Chọn chương trước'}</option>
            {opts.lessons.map((o) => <option key={o.value} value={o.value}>{o.label} ({o.count})</option>)}
          </select>
        </label>
        <label>Dạng
          <select value={scope.formId} disabled={!scope.lessonId} onChange={(e) => setScope(setLevel(scope, 'form', e.target.value))}>
            <option value="">{scope.lessonId ? 'Tất cả' : 'Chọn bài trước'}</option>
            {opts.forms.map((o) => <option key={o.value} value={o.value}>{o.label} ({o.count})</option>)}
          </select>
        </label>
        {selCount > 0 && (
          <label className="dc-chk"><input type="checkbox" checked={scope.selection} onChange={(e) => setScope(e.target.checked ? { ...ALL_SCOPE, selection: true } : ALL_SCOPE)} /> Chỉ {selCount} câu đang chọn</label>
        )}
        <label>Kiểu đối chiếu
          <select value={mode} onChange={(e) => setMode(e.target.value as ScanMode)} disabled={isAll(scope)}>
            <option value="inside">Trong phạm vi đã chọn</option>
            <option value="vsAll">Đối chiếu với toàn ngân hàng</option>
          </select>
        </label>
        <p className="dc-scope-sum" aria-live="polite">
          {scopeLabel(tax, scope, selCount, shortName)} — {sideA} câu{!isAll(scope) && ` · phía đối chiếu: ${mode === 'vsAll' ? questions.length : sideA} câu`}
          {uids && uids.size === 0 && <b> · Phạm vi này chưa có câu nào</b>}
        </p>
      </div>

      {busy && <div className="dc-prog" role="progressbar" aria-valuemin={0} aria-valuemax={busy.total} aria-valuenow={busy.done}><div style={{ width: `${Math.round((100 * busy.done) / Math.max(1, busy.total))}%` }} /><span>{busy.phase}… {busy.done}/{busy.total}</span></div>}
      {changed > 0 && !busy && <p className="dc-stale" role="status">Có {changed} câu đã thêm/sửa/xoá sau lần quét này — danh sách bên dưới có thể đã lỗi thời. Bấm “Quét lại” để cập nhật.</p>}
      {scopeChanged && !busy && <p className="dc-stale" role="status">Phạm vi hoặc kiểu đối chiếu đã đổi so với lần quét ({scannedLabel}). Danh sách bên dưới thuộc lần quét cũ — bấm “Quét” để quét theo phạm vi mới.</p>}

      {pairs === null && !busy && <p className="dc-empty">Bấm “Quét” để tìm các cặp câu nghi trùng. Quét chỉ đọc, không thay đổi câu nào.</p>}

      {pairs !== null && (
        <div className={`dc-body${listOpen ? '' : ' no-list'}`}>
          {listOpen && <div className="dc-left">
            <div className="chips" role="group" aria-label="Loại nghi vấn">
              {SHOWN.map((k) => <button key={k} type="button" className="chip" aria-pressed={kinds.has(k)} onClick={() => toggleKind(k)}>{DUP_KIND_LABEL[k]}<span className="chip-n">{counts[k] ?? 0}</span></button>)}
            </div>
            <label className="dc-chk"><input type="checkbox" checked={hideSeen} onChange={(e) => setHideSeen(e.target.checked)} /> Ẩn các cặp đã xem (chỉ trong phiên này)</label>
            {stats && <p className="dc-stat">{pairs.length} cặp · phía A {stats.sideA} câu, phía đối chiếu {stats.sideB} câu · {stats.comparisons} phép so · {(stats.ms / 1000).toFixed(1)} giây. Ứng viên được chọn theo từ khoá hiếm nên có thể bỏ sót cặp chỉ giống ở các từ rất phổ biến.</p>}
            {!list.length && <p className="dc-empty">Không có cặp nào ở các nhóm đang chọn.</p>}
            <ul className="dc-list">
              {shown.map((p) => {
                const A = byUid.get(p.a)!, B = byUid.get(p.b)!;
                return (
                  <li key={pk(p)}>
                    <button type="button" className={`dc-row${active && pk(p) === pk(active) ? ' on' : ''}${seen.has(pk(p)) ? ' seen' : ''}`} onClick={() => setCur(pk(p))}>
                      <span className={`dc-kind k-${p.result.kind}`}>{DUP_KIND_LABEL[p.result.kind]}</span>
                      <span className="mono">{seqLabel(A.seq)} ↔ {seqLabel(B.seq)}</span>
                      <span className="dc-sc">tương đồng {Math.round(p.result.score * 100)}%</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {list.length > PAGE && (
              <div className="dc-pager" role="navigation" aria-label="Phân trang">
                <button type="button" className="btn btn-sm" disabled={pageNo === 0} onClick={() => setPage(pageNo - 1)}>‹ Trước</button>
                <span>Trang {pageNo + 1}/{pages} · {list.length} cặp</span>
                <button type="button" className="btn btn-sm" disabled={pageNo >= pages - 1} onClick={() => setPage(pageNo + 1)}>Sau ›</button>
              </div>
            )}
          </div>}

          <div className="dc-right">
            <button type="button" className="btn btn-sm dc-lt" aria-expanded={listOpen} onClick={() => setListOpen(!listOpen)}>{listOpen ? '◀ Ẩn danh sách' : '▶ Hiện danh sách cặp'}</button>
            {active ? (
              <PairView key={pk(active)} hit={active} A={byUid.get(active.a)!} B={byUid.get(active.b)!} snap={snap.current}
                onOpen={onOpen} onGoto={onGoto} seenNow={seen.has(pk(active))} onSeen={() => setSeen((x) => new Set(x).add(pk(active)))} />
            ) : <p className="dc-empty">Chọn một cặp ở bên trái.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function PairView({ hit, A, B, snap, onOpen, onGoto, seenNow, onSeen }: { hit: DupPairHit; A: Question; B: Question; snap: Map<string, string>; onOpen: (uid: string) => void; onGoto: (uid: string) => void; seenNow: boolean; onSeen: () => void }) {
  // Luôn so lại trên nội dung HIỆN TẠI: nếu giáo viên vừa sửa câu thì kết quả quét cũ không còn đúng.
  const live = useMemo(() => compareLatex(A.latex, B.latex), [A.latex, B.latex]);
  const edited = snap.get(A.uid) !== A.latex || snap.get(B.uid) !== B.latex;
  const [del, setDel] = useState(false);
  const side = (q: Question, title: string) => ({
    title,
    latex: q.latex,
    badges: (
      <>
        <span className={`pill t-${q.type}`}>{TYPE_LABEL[q.type]}</span>
        <span className={`pill l-${q.level}`}>{LEVEL_LABEL[q.level]}</span>
        <ReviewBadge q={q} />
        <span className="code-tag">{questionCode(q, q.level)}</span>
        <span className="mono card-no">{seqLabel(q.seq)}</span>
      </>
    ),
    actions: <button type="button" className="btn btn-sm" onClick={() => onOpen(q.uid)}>Mở sửa {title.replace('Câu ', '')}</button>,
  });
  return (
    <PairCompare
      A={side(A, 'Câu A')} B={side(B, 'Câu B')} result={live}
      note={edited ? <p className="dc-flags" role="status">Một trong hai câu đã được sửa sau lần quét — kết quả bên dưới đã so sánh lại trên nội dung hiện tại{hit.result.kind !== live.kind ? ` (trước: ${DUP_KIND_LABEL[hit.result.kind]})` : ''}.</p> : null}
      footer={
        <>
          <button type="button" className="btn btn-sm" disabled={seenNow} onClick={onSeen}>{seenNow ? 'Đã xem' : 'Đánh dấu đã xem'}</button>
          <span className="dc-del">
            <button type="button" className="btn btn-sm" aria-expanded={del} onClick={() => setDel(!del)}>Loại một câu… ▾</button>
            {del && (
              <span className="dc-del-pop" role="group" aria-label="Đi tới Ngân hàng để xoá">
                <small>HEdu không xoá ở đây. Chọn câu để chuyển tới Ngân hàng, rồi dùng “⋯ → Xoá câu” (có hỏi lại).</small>
                <button type="button" className="btn btn-sm" onClick={() => onGoto(A.uid)}>Tới câu A {seqLabel(A.seq)}</button>
                <button type="button" className="btn btn-sm" onClick={() => onGoto(B.uid)}>Tới câu B {seqLabel(B.seq)}</button>
              </span>
            )}
          </span>
        </>
      }
    />
  );
}
