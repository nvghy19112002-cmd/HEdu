// Kiểm tra trùng: danh sách cặp nghi trùng + xem hai câu cạnh nhau.
// Máy chỉ GỢI Ý. Không xoá / gộp / sửa câu nào. Quyết định "giữ cả hai" của giáo viên lưu ở tệp phụ (dupdecisions), không đụng dữ liệu ngân hàng.
import { useEffect, useMemo, useRef, useState } from 'react';
import { getSharedIndex, type DupPairHit, type ScanStats } from '../lib/dupindex';
import { compareLatex, DUP_KIND_LABEL, type DupKind } from '../lib/dup2';
import { PairCompare } from './PairCompare';
import { clearDecision, DECISION_LABEL, decisionsLoaded, exportDecisions, importDecisions, isDecisionsWritable, loadDecisions, previewImport, recOf, restoreRec, saveNow, setDecision, statusOf, useDecisions, WHY_CHOICES, type DecisionRec, type PairDecision } from '../lib/dupdecisions';
import { ReviewBadge } from './ReviewControl';
import { GoldPanel } from './GoldPanel';
import { questionCode, seqLabel } from '../lib/id';
import { useTaxonomy } from '../lib/curriculum';
import { shortName } from '../lib/taxonomy';
import { trashBlockReason } from '../lib/trashflow';
import { keepHint, navInfo, nextKeyAfter } from '../lib/dupnav';
import { ALL_SCOPE, changedCount, isAll, scopeKey, scopeLabel, scopeOptions, scopeUids, setLevel, type ScanMode, type Scope } from '../lib/dupscope';
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

export function DupCheck({ questions, selected, initialSelection, onClose, onOpen, onGoto, onTrash }: { questions: Question[]; selected?: ReadonlySet<string>; initialSelection?: boolean; onClose: () => void; onOpen: (uid: string) => void; onGoto: (uid: string) => void; onTrash: (q: Question) => Promise<boolean> }) {
  const { tax } = useTaxonomy();
  const [scope, setScope] = useState<Scope>(() => (initialSelection && selected?.size ? { ...ALL_SCOPE, selection: true } : ALL_SCOPE));
  const [mode, setMode] = useState<ScanMode>(initialSelection && selected?.size ? 'vsAll' : 'inside'); // từ thanh chọn: đối chiếu với TOÀN ngân hàng (gồm cả so với nhau)
  const [page, setPage] = useState(0);
  const snap = useRef<Map<string, string>>(new Map());
  const [scannedKey, setScannedKey] = useState('');
  const [scannedLabel, setScannedLabel] = useState('');
  const byUid = useMemo(() => new Map(questions.map((q) => [q.uid, q])), [questions]);
  const idx = useRef(getSharedIndex());
  const abort = useRef({ aborted: false });
  const [busy, setBusy] = useState<{ done: number; total: number; phase: string } | null>(null);
  const [pairs, setPairs] = useState<DupPairHit[] | null>(null);
  const [stats, setStats] = useState<ScanStats | null>(null);
  const [kindKey, setKindKey] = useState<string>('default');
  const kinds = useMemo<Set<DupKind>>(() => (kindKey === 'default' ? new Set<DupKind>(['raw', 'conflict', 'same', 'near']) : kindKey === 'all' ? new Set<DupKind>(SHOWN) : new Set<DupKind>([kindKey as DupKind])), [kindKey]);
  const [tab, setTab] = useState<'open' | 'later' | 'done'>('open');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dv = useDecisions();
  const fileIn = useRef<HTMLInputElement>(null);
  const [listOpen, setListOpen] = useState(true);
  const [goldOpen, setGoldOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(true); // sau khi quét thì thu gọn để dành chỗ cho phần so sánh
  const [cur, setCur] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [plan, setPlan] = useState<null | { json: string; added: number; updated: number; skipped: number }>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [undoBar, setUndoBar] = useState<null | { a: string; b: string; prev: DecisionRec | undefined; text: string; back: string | null }>(null);
  useEffect(() => { if (!undoBar) return; const t = setTimeout(() => setUndoBar(null), 10000); return () => clearTimeout(t); }, [undoBar]);
  const pk = (p: DupPairHit) => p.a + '|' + p.b;

  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.drw') && !document.querySelector('.gold')) onClose(); }; document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h); }, [onClose]);
  useEffect(() => () => { abort.current.aborted = true; }, []);
  useEffect(() => { if (decisionsLoaded()) return; void loadDecisions().then((r) => { if (!r.ok) setMsg({ ok: false, text: `Không đọc được tệp quyết định (${r.error}). HEdu sẽ KHÔNG ghi đè tệp đó; quyết định bạn đặt lúc này chỉ giữ tới khi đóng cửa sổ.` }); }); }, []);

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
      onProgress: (done, total, phase) => setBusy({ done, total, phase: phase === 'index' ? 'Đang lập chỉ mục' : 'Đang so toàn bộ các cặp' }),
    });
    setBusy(null);
    if (r.stats.aborted) return; // dừng giữa chừng: giữ kết quả cũ, KHÔNG coi là "không trùng"
    snap.current = snapshot;
    setScopeOpen(false); setPairs(r.pairs); setStats(r.stats); setScannedKey(key); setScannedLabel(label); setPage(0); setCur(r.pairs[0] ? pk(r.pairs[0]) : null);
  };

  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const p of pairs ?? []) c[p.result.kind] = (c[p.result.kind] ?? 0) + 1; return c; }, [pairs]);
  const tabOf = (p: DupPairHit): 'open' | 'later' | 'done' => {
    const st = statusOf(byUid.get(p.a)!, byUid.get(p.b)!);
    if (st.status !== 'valid') return 'open';
    return st.rec!.d === 'review_later' ? 'later' : 'done';
  };
  const base = useMemo(() => (pairs ?? []).filter((p) => kinds.has(p.result.kind) && byUid.has(p.a) && byUid.has(p.b)), [pairs, kinds, byUid]);
  const tabCounts = useMemo(() => { const c = { open: 0, later: 0, done: 0 }; for (const p of base) c[tabOf(p)]++; return c; }, [base, dv]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => base.filter((p) => tabOf(p) === tab), [base, tab, dv]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = list.find((p) => pk(p) === cur) ?? list[0];
  const changed = pairs !== null ? changedCount(snap.current, questions) : 0;
  const scopeChanged = pairs !== null && scannedKey !== scopeKey(scope, mode);
  const nav = navInfo(list.map(pk), active ? pk(active) : null);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const pageNo = Math.min(page, pages - 1);
  const shown = list.slice(pageNo * PAGE, pageNo * PAGE + PAGE);

  return (
    <div className="dc" role="dialog" aria-modal="true" aria-label="Kiểm tra trùng">
      {goldOpen && <GoldPanel questions={questions} pairs={pairs ?? []} onClose={() => setGoldOpen(false)} />}
      <header className="dc-head">
        <h2>Kiểm tra trùng</h2>
        <p className="dc-note">Máy chỉ gợi ý để bạn xem lại. “Mức tương đồng” không phải bằng chứng hai câu trùng nhau. Bạn quyết định giữ, sửa hay xoá — ở màn Ngân hàng.</p>
        <div className="dc-acts">
          {busy
            ? <button type="button" className="btn btn-sm" onClick={() => { abort.current.aborted = true; }}>Dừng quét</button>
            : <button type="button" className="btn btn-primary btn-sm" onClick={run}>{pairs ? 'Quét lại' : `Quét ${sideA} câu`}</button>}
        <span className="dc-io dc-tools">
            <button type="button" className="btn btn-sm" aria-haspopup="menu" aria-expanded={toolsOpen} onClick={() => setToolsOpen(!toolsOpen)}>Công cụ ▾</button>
            {toolsOpen && (
              <span className="dc-tools-pop" role="menu" onMouseLeave={() => setToolsOpen(false)}>
                <button type="button" role="menuitem" className="btn btn-sm" onClick={() => {
                  setToolsOpen(false);
                  const blob = new Blob([exportDecisions()], { type: 'application/json' });
                  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'hedu-quyet-dinh-trung.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
                }}>Xuất quyết định</button>
                <button type="button" role="menuitem" className="btn btn-sm" onClick={() => { setToolsOpen(false); fileIn.current?.click(); }}>Nhập quyết định…</button>
                <button type="button" role="menuitem" className="btn btn-sm" onClick={() => { setToolsOpen(false); setGoldOpen(true); }} title="Gắn nhãn khoảng 150 cặp để đo độ chính xác của bộ dò trên ngân hàng thật">Nhãn chuẩn</button>
              </span>
            )}
            <input ref={fileIn} type="file" accept="application/json,.json" hidden onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
              try { const json = await f.text(); setPlan({ json, ...previewImport(json) }); }
              catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) }); }
            }} />
          </span>
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

      {busy && <div className="dc-prog" role="progressbar" aria-valuemin={0} aria-valuemax={busy.total} aria-valuenow={busy.done}><div style={{ width: `${Math.round((100 * busy.done) / Math.max(1, busy.total))}%` }} /><span>{busy.phase}… {Math.floor((100 * busy.done) / Math.max(1, busy.total))}%</span></div>}
      {changed > 0 && !busy && <p className="dc-stale" role="status">Có {changed} câu đã thêm/sửa/xoá sau lần quét này — danh sách bên dưới có thể đã lỗi thời. Bấm “Quét lại” để cập nhật.</p>}
      {scopeChanged && !busy && <p className="dc-stale" role="status">Phạm vi hoặc kiểu đối chiếu đã đổi so với lần quét ({scannedLabel}). Danh sách bên dưới thuộc lần quét cũ — bấm “Quét” để quét theo phạm vi mới.</p>}

      {plan && (
        <p className="dc-stale" role="status">Nhập quyết định: sẽ <b>thêm {plan.added}</b>, <b>cập nhật {plan.updated}</b> (bản trong file mới hơn), bỏ qua {plan.skipped}. Quyết định hiện có không bị xoá.{' '}
          <button type="button" className="btn btn-sm btn-primary" onClick={async () => { const j = plan.json; setPlan(null); try { const r = await importDecisions(j); setMsg({ ok: r.saved, text: `Đã nhập: thêm ${r.added}, cập nhật ${r.updated}, bỏ qua ${r.skipped}.${r.saved ? '' : ' Nhưng CHƯA lưu được vào tệp (đang giữ tạm).'}` }); } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) }); } }}>Áp dụng</button>{' '}
          <button type="button" className="btn btn-sm" onClick={() => setPlan(null)}>Huỷ</button></p>
      )}
      {stats && stats.templateTotal > stats.templateShown && pairs !== null && <p className="dc-stale" role="status">Có {stats.templateTotal.toLocaleString('vi-VN')} cặp “{DUP_KIND_LABEL.template}” (thường là câu khác nhau); danh sách chỉ giữ {stats.templateShown.toLocaleString('vi-VN')} cặp giống nhất. Các loại trùng khác hiện đầy đủ.</p>}
      {msg && <p className={msg.ok ? 'dc-ok' : 'dc-stale'} role="status">{msg.text} <button type="button" className="btn btn-sm" onClick={() => setMsg(null)}>Đóng</button></p>}
      {!isDecisionsWritable() && decisionsLoaded() && !msg && <p className="dc-stale" role="status">Tệp quyết định không ghi được — quyết định chỉ giữ tạm trong phiên này.</p>}

      {pairs === null && !busy && <p className="dc-empty">Bấm “Quét” để tìm các cặp câu nghi trùng. Quét chỉ đọc, không thay đổi câu nào.</p>}

      {pairs !== null && (
        <div className={`dc-body${listOpen ? '' : ' no-list'}`}>
          {listOpen && <div className="dc-left">
            <label className="dc-kindsel">Loại nghi vấn
              <select value={kindKey} onChange={(e) => { setKindKey(e.target.value); setPage(0); }}>
                <option value="default">Cần xem — trùng chắc và gần trùng ({(counts.raw ?? 0) + (counts.conflict ?? 0) + (counts.same ?? 0) + (counts.near ?? 0)})</option>
                {SHOWN.map((k) => <option key={k} value={k}>{DUP_KIND_LABEL[k]} ({k === 'template' && stats && stats.templateTotal > stats.templateShown ? `${counts[k] ?? 0} / ${stats.templateTotal}` : counts[k] ?? 0})</option>)}
                <option value="all">Tất cả loại, kể cả cùng mẫu ({pairs.length})</option>
              </select>
            </label>
            <div className="chips" role="tablist" aria-label="Trạng thái xử lý">
              {([['open', 'Chưa xử lý'], ['later', 'Xem sau'], ['done', 'Đã giữ']] as const).map(([k, l]) => <button key={k} type="button" role="tab" className="chip" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => { setTab(k); setPage(0); }}>{l}<span className="chip-n">{tabCounts[k]}</span></button>)}
            </div>
            {stats && <details className="dc-stat"><summary>{pairs.length} cặp · {stats.comparisons} phép so · {(stats.ms / 1000).toFixed(1)} giây</summary>Phía A {stats.sideA} câu, phía đối chiếu {stats.sideB} câu. Đã xét ĐẦY ĐỦ mọi cặp trong phạm vi: các cặp không được so là các cặp chắc chắn giống nhau dưới 50% cả về chữ lẫn công thức (không thể là trùng, gần trùng hay cùng mẫu).</details>}
            {!list.length && <p className="dc-empty">Không có cặp nào ở các nhóm đang chọn.</p>}
            <ul className="dc-list">
              {shown.map((p) => {
                const A = byUid.get(p.a)!, B = byUid.get(p.b)!;
                return (
                  <li key={pk(p)}>
                    <button type="button" className={`dc-row${active && pk(p) === pk(active) ? ' on' : ''}${tab !== 'open' ? ' seen' : ''}`} onClick={() => setCur(pk(p))}>
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
            <div className="dc-nav" role="group" aria-label="Điều hướng cặp">
              <button type="button" className="btn btn-sm" disabled={!nav.prev} onClick={() => nav.prev && setCur(nav.prev)}>‹ Cặp trước</button>
              <span aria-live="polite">{nav.index >= 0 ? `Cặp ${nav.index + 1}/${nav.total}` : '—'} · còn <b>{tabCounts.open}</b> chưa xử lý</span>
              <button type="button" className="btn btn-sm" disabled={!nav.next} onClick={() => nav.next && setCur(nav.next)}>Cặp tiếp ›</button>
              <span className={`dc-save s-${saveState}`} role="status">
                {saveState === 'saving' && 'Đang lưu…'}{saveState === 'saved' && 'Đã lưu'}
                {saveState === 'error' && <>Chưa lưu được <button type="button" className="btn btn-sm" onClick={async () => { setSaveState('saving'); setSaveState((await saveNow()) ? 'saved' : 'error'); }}>Thử lưu lại</button></>}
              </span>
            </div>
            {undoBar && (
              <p className="dc-ok dc-undo" role="status">{undoBar.text}{' '}
                <button type="button" className="btn btn-sm" onClick={async () => { const u = undoBar; setUndoBar(null); setSaveState('saving'); const ok = await restoreRec(u.a, u.b, u.prev); setSaveState(ok ? 'saved' : 'error'); if (u.back) setCur(u.back); }}>Hoàn tác</button></p>
            )}
            <button type="button" className="btn btn-sm dc-lt" aria-expanded={listOpen} onClick={() => setListOpen(!listOpen)}>{listOpen ? '◀ Ẩn danh sách' : '▶ Hiện danh sách cặp'}</button>
            {active ? (
              <PairView key={pk(active)} hit={active} A={byUid.get(active.a)!} B={byUid.get(active.b)!} snap={snap.current}
                onOpen={onOpen} onGoto={onGoto} onTrash={onTrash} onMsg={setMsg}
                beforeDecide={() => { const n = nextKeyAfter(list.map(pk), pk(active)); setCur(n); return pk(active); }}
                onSave={setSaveState}
                onDecided={(u) => setUndoBar({ ...u, back: pk(active) })} />
            ) : <p className="dc-empty">Chọn một cặp ở bên trái.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function PairView({ hit, A, B, snap, onOpen, onGoto, onTrash, onMsg, beforeDecide, onSave, onDecided }: { beforeDecide: () => string; onSave: (s: 'saving' | 'saved' | 'error') => void; onDecided: (u: { a: string; b: string; prev: DecisionRec | undefined; text: string }) => void; onTrash: (q: Question) => Promise<boolean>; hit: DupPairHit; A: Question; B: Question; snap: Map<string, string>; onOpen: (uid: string) => void; onGoto: (uid: string) => void; onMsg: (m: { ok: boolean; text: string } | null) => void }) {
  // Luôn so lại trên nội dung HIỆN TẠI: nếu giáo viên vừa sửa câu thì kết quả quét cũ không còn đúng.
  const live = useMemo(() => compareLatex(A.latex, B.latex), [A.latex, B.latex]);
  const edited = snap.get(A.uid) !== A.latex || snap.get(B.uid) !== B.latex;
  const [del, setDel] = useState(false);
  const [ask, setAsk] = useState<string | null>(null);
  useDecisions();
  const st = statusOf(A, B);
  const [why, setWhy] = useState(st.rec?.why ?? '');
  const decide = async (d: PairDecision) => {
    const prev = recOf(A.uid, B.uid);
    beforeDecide();
    onSave('saving');
    const saved = await setDecision(A, B, d, why.trim() || undefined);
    onSave(saved ? 'saved' : 'error');
    onDecided({ a: A.uid, b: B.uid, prev, text: `Đã ghi “${DECISION_LABEL[d]}” cho cặp ${seqLabel(A.seq)} ↔ ${seqLabel(B.seq)}.` });
    onMsg(saved ? null : { ok: false, text: 'Chưa lưu được quyết định vào tệp (đang giữ tạm trong phiên). Bấm “Thử lưu lại” hoặc dùng Công cụ → Xuất quyết định để lưu ra file.' });
  };
  const undo = async () => {
    const prev = recOf(A.uid, B.uid);
    beforeDecide();
    onSave('saving');
    const saved = await clearDecision(A, B);
    onSave(saved ? 'saved' : 'error');
    onDecided({ a: A.uid, b: B.uid, prev, text: `Đã bỏ quyết định của cặp ${seqLabel(A.seq)} ↔ ${seqLabel(B.seq)}.` });
    onMsg(saved ? null : { ok: false, text: 'Chưa ghi được việc bỏ quyết định vào tệp.' });
  };
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
      note={keepHint(live.kind, A, B) && !edited ? <p className="dc-flags" role="status">{keepHint(live.kind, A, B)}</p> : edited ? <p className="dc-flags" role="status">Một trong hai câu đã được sửa sau lần quét — kết quả bên dưới đã so sánh lại trên nội dung hiện tại{hit.result.kind !== live.kind ? ` (trước: ${DUP_KIND_LABEL[hit.result.kind]})` : ''}.</p> : null}
      footer={
        <>
          {st.status === 'stale' && <p className="dc-flags" role="status">Trước đây bạn đã quyết định “{DECISION_LABEL[st.rec!.d]}” cho cặp này, nhưng nội dung một câu đã đổi — cần xem lại.</p>}
          {st.status === 'valid' && <p className="dc-ok" role="status">Đã quyết định: <b>{DECISION_LABEL[st.rec!.d]}</b>{st.rec!.why ? ` (${st.rec!.why})` : ''} <button type="button" className="btn btn-sm" onClick={undo}>Bỏ quyết định</button></p>}
          <label className="dc-why">Lý do (tuỳ chọn)
            <input type="text" list="dc-why-list" value={why} maxLength={120} placeholder="chọn hoặc tự gõ" onChange={(e) => setWhy(e.target.value)} />
            <datalist id="dc-why-list">{WHY_CHOICES.map((w) => <option key={w} value={w} />)}</datalist>
          </label>
          {(['not_duplicate', 'legit_variant', 'review_later'] as const).map((d) => <button key={d} type="button" className={`btn btn-sm${d === 'review_later' ? ' btn-ghost' : ''}`} disabled={st.status === 'valid' && st.rec!.d === d} onClick={() => decide(d)}>{DECISION_LABEL[d]}</button>)}
          <span className="dc-del">
            <button type="button" className="btn btn-sm btn-danger-soft" aria-expanded={del} onClick={() => { setDel(!del); setAsk(null); }}>Loại một câu… ▾</button>
            {del && (
              <span className="dc-del-pop" role="group" aria-label="Chuyển một câu vào thùng rác">
                <small>Câu được chuyển vào <b>thùng rác</b> (mở màn Thùng rác ở thanh bên trái), không mất hẳn: có thể khôi phục. Cặp còn lại không bị ảnh hưởng.</small>
                {([[A, 'A'], [B, 'B']] as const).map(([q, tag]) => ask === q.uid ? (
                  <span key={tag} className="dc-confirm" role="alertdialog" aria-label={`Xác nhận chuyển câu ${tag} vào thùng rác`}>
                    <b>Chuyển câu {tag} ({seqLabel(q.seq)} · {questionCode(q, q.level)}) vào thùng rác?</b>
                    <button type="button" className="btn btn-sm btn-accent" onClick={async () => {
                      const block = await trashBlockReason([q]);
                      const ok = block ? false : await onTrash(q); setAsk(null); setDel(false);
                      onMsg(ok ? { ok: true, text: `Đã chuyển câu ${seqLabel(q.seq)} vào thùng rác. Khôi phục ở màn Thùng rác (thanh bên trái).` } : { ok: false, text: block ?? 'Không lưu được thùng rác nên CHƯA xoá câu nào. Thử lại hoặc tạo file sao lưu trước.' });
                    }}>Chuyển vào thùng rác</button>
                    <button type="button" className="btn btn-sm" autoFocus onClick={() => setAsk(null)}>Giữ lại</button>
                  </span>
                ) : (
                  <button key={tag} type="button" className="btn btn-sm" onClick={() => setAsk(q.uid)}>Chuyển câu {tag} {seqLabel(q.seq)} vào thùng rác…</button>
                ))}
                <button type="button" className="linkbtn" onClick={() => onGoto(A.uid)}>Hoặc tới Ngân hàng xem câu A</button>
              </span>
            )}
          </span>
        </>
      }
    />
  );
}
