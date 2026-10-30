import { useEffect, useMemo, useRef, useState } from 'react';
import { place, useTaxonomy } from '../lib/curriculum';
import { parseExTest } from '../lib/extest';
import { FORM_STATE_LABEL, gradeOfEff, LEVEL_STATE_LABEL, SOURCE_LABEL } from '../lib/idreview';
import { questionCode, seqLabel } from '../lib/id';
import { IdSuggester, CONFIDENCE_LABEL, type Suggestion } from '../lib/idsuggest';
import { indexOf } from '../lib/taxonomy';
import { taxRevision } from '../lib/taxpath';
import { getState, setReview, useBank } from '../lib/store';
import { applyQueueAction, queueUids, SCOPE_LABEL, scopeCounts, scopeOf, undoQueueAction, type QueueAction, type QueueScope, type QueueUndo } from '../lib/verifyqueue';
import { LEVEL_LABEL, TYPE_LABEL, type Question, type ReviewStatus } from '../lib/types';
import { useEffectiveOf } from './IdReviewControl';
import { QuestionView } from './QuestionView';
import { ReviewControl } from './ReviewControl';

const SCOPES: QueueScope[] = ['tat-ca', 'can-xem', 'chua-phan-loai', 'may', 'chua'];
const KEYS: [string, string][] = [
  ['Y / Enter', 'Xác nhận Dạng hiện tại'], ['M', 'Xác nhận mức độ'], ['N', 'Cần xem lại'], ['1 · 2 · 3', 'Đổi sang Dạng gợi ý 1, 2, 3 (rồi xác nhận)'],
  ['D', 'Chọn Dạng khác trong danh sách'], ['U', 'Hoàn tác'], ['S / →', 'Bỏ qua, sang câu sau'], ['←', 'Về câu trước'], ['L', 'Hiện/ẩn lời giải'], ['?', 'Hiện/ẩn bảng phím'], ['Esc', 'Đóng hàng đợi'],
];

const where = (formId: string): string => {
  const p = place(formId);
  return p?.form ? `${p.chapter?.name ?? ''} › ${p.lesson?.name ?? ''} › ${p.form.name}` : '(Dạng không còn trong cây)';
};

/**
 * Hàng đợi xác minh từng câu: xem một câu, xác nhận Dạng/mức độ hoặc đổi sang Dạng đúng bằng phím tắt, có Hoàn tác.
 * Chỉ thao tác của thầy/cô mới tạo trạng thái "giáo viên xác minh". Duyệt NỘI DUNG là ô riêng bên dưới, không bị đổi bởi các phím này.
 * Gợi ý chỉ để tham khảo (dựa trên các câu trong ngân hàng, chưa phải xác minh).
 */
export function VerifyQueue({ pool, onClose }: { pool: readonly Question[]; onClose: () => void }) {
  const { questions } = useBank();
  const { tax } = useTaxonomy();
  const ix = useMemo(() => indexOf(tax), [tax]);
  const taxRev = useMemo(() => taxRevision(tax), [tax]);
  const effOf = useEffectiveOf();
  const byUid = useMemo(() => new Map(questions.map((q) => [q.uid, q])), [questions]);
  const counts = useMemo(() => scopeCounts(pool, effOf), [pool, effOf]);
  const [scope, setScope] = useState<QueueScope>(() => (counts['can-xem'] > 0 ? 'can-xem' : 'tat-ca'));
  // danh sách chụp một lần theo nhóm: câu vừa xử lý không biến mất khỏi hàng đợi giữa chừng
  const [uids, setUids] = useState<string[]>(() => queueUids(pool, effOf, scope));
  const [idx, setIdx] = useState(0);
  const [undo, setUndo] = useState<QueueUndo[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);
  const [showSol, setShowSol] = useState(true);
  const [done, setDone] = useState(0);
  const pick = useRef<HTMLSelectElement>(null);

  const changeScope = (s: QueueScope) => { setScope(s); setUids(queueUids(pool, effOf, s)); setIdx(0); setMsg(null); };
  const remaining = useMemo(() => uids.filter((u) => { const qq = byUid.get(u); return !!qq && scopeOf(effOf(qq)) !== null; }).length, [uids, byUid, effOf]);
  const uid = uids[idx];
  const q = uid ? byUid.get(uid) : undefined;
  const eff = q ? effOf(q) : null;
  // lớp đáng tin: câu Chưa có ID dùng lớp chọn khi nhập (null = chưa rõ ⇒ không gợi ý, cho chọn Dạng mọi lớp), không dùng vị trí giữ chỗ
  const qGrade = q && eff ? gradeOfEff(q, eff) : null;

  // gợi ý tham khảo: dựng MỘT lần khi mở (kho đổi theo từng thao tác nhưng gợi ý cũ vẫn đủ để tham khảo)
  const sug = useRef<{ tax: typeof tax; s: IdSuggester } | null>(null);
  const suggestion = useMemo<Suggestion | null>(() => {
    if (!q) return null;
    // cây đổi ⇒ dựng lại bộ gợi ý (không dùng gợi ý theo cây cũ); câu đổi nội dung/Dạng ⇒ gợi ý tính lại cho câu hiện tại
    if (!sug.current || sug.current.tax !== tax) sug.current = { tax, s: new IdSuggester(tax, getState().questions) };
    if (qGrade == null) return null;
    return sug.current.s.suggest({ key: q.uid, latex: q.latex, grade: qGrade, excludeUid: q.uid });
  }, [q?.uid, q?.latex, q?.formId, tax, qGrade]); // eslint-disable-line react-hooks/exhaustive-deps
  const options = useMemo(() => (suggestion ? [suggestion.best, ...suggestion.alternatives].filter((o): o is NonNullable<typeof o> => !!o && (!!eff?.unclassified || o.formId !== q?.formId)).slice(0, 3) : []), [suggestion, q?.formId, eff?.unclassified]);
  const allForms = useMemo(() => (q ? tax.grades.filter((g) => qGrade == null || g.grade === qGrade).flatMap((g) => g.branches.flatMap((b) => b.chapters.flatMap((c) => c.lessons.flatMap((l) => l.forms.map((f) => ({ id: f.id, label: `${qGrade == null ? `Lớp ${g.grade} › ` : ''}${c.name} › ${l.name} › ${f.name}` })))))) : []), [tax, q, qGrade]);

  const run = async (action: QueueAction, advance: boolean) => {
    if (!q || busy) return;
    setBusy(true);
    const r = await applyQueueAction(q.uid, action, { tax, ix, taxRev }, q.latex);
    setBusy(false);
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) {
      setUndo((u) => [...u, r.undo].slice(-50));
      setDone((d) => d + 1);
      if (advance) setIdx((i) => Math.min(i + 1, Math.max(uids.length - 1, 0)));
    }
  };
  const doUndo = async () => {
    const last = undo[undo.length - 1];
    if (!last || busy) return;
    setBusy(true);
    const r = await undoQueueAction(last);
    setBusy(false);
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) { setUndo((u) => u.slice(0, -1)); setDone((d) => Math.max(0, d - 1)); const at = uids.indexOf(last.uid); if (at >= 0) setIdx(at); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // đang gõ / chọn trong ô nhập, danh sách, vùng soạn thảo (CodeMirror, contenteditable): phím không phải phím tắt
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || t.closest('.cm-editor,[role="textbox"],[contenteditable="true"]'))) { if (e.key === 'Escape') (t as HTMLElement).blur(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if (e.repeat) return; // giữ phím lâu không được sinh nhiều hành động
      // hộp xác nhận con (vd xác nhận "Đã duyệt") đang mở: không bắt phím của hàng đợi
      if (document.querySelector('.vq-overlay [role="alertdialog"], .vq-overlay .rv-ask')) return;
      const k = e.key.toLowerCase();
      const act = (a: QueueAction | null, adv = true) => { e.preventDefault(); if (a) void run(a, adv); };
      if (k === 'y' || k === 'enter') act(eff?.unclassified ? null : { kind: 'xac-nhan-dang' });
      else if (k === 'm') act({ kind: 'xac-nhan-muc-do' }, false);
      else if (k === 'n') act({ kind: 'can-xem-lai' });
      else if ((k === 'p' || k === 'P') && eff?.rec?.prop && q && (eff.unclassified || eff.rec.prop !== q.formId)) act({ kind: 'doi-dang', formId: eff.rec.prop });
      else if (k === '1' || k === '2' || k === '3') { const o = options[Number(k) - 1]; if (o) act({ kind: 'doi-dang', formId: o.formId }); }
      else if (k === 'u') { e.preventDefault(); void doUndo(); }
      else if (k === 's' || k === 'arrowright') { e.preventDefault(); setIdx((i) => Math.min(i + 1, Math.max(uids.length - 1, 0))); setMsg(null); }
      else if (k === 'arrowleft') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); setMsg(null); }
      else if (k === 'l') { e.preventDefault(); setShowSol((v) => !v); }
      else if (k === 'd') { e.preventDefault(); pick.current?.focus(); }
      else if (k === '?') { e.preventDefault(); setHelp((v) => !v); }
      else if (k === 'escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const changeReview = async (qq: Question, s: ReviewStatus | undefined) => setReview(qq.uid, s);
  const p = useMemo(() => (q ? parseExTest(q.latex) : null), [q?.latex]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="vq-overlay" role="dialog" aria-modal="true" aria-label="Hàng đợi xác minh">
      <div className="vq">
        <header className="vq-head">
          <h2>Hàng đợi xác minh</h2>
          <label className="qsel">Nhóm
            <select value={scope} onChange={(e) => changeScope(e.target.value as QueueScope)} aria-label="Nhóm câu cần xác minh">
              {SCOPES.map((s) => <option key={s} value={s}>{SCOPE_LABEL[s]} ({counts[s]})</option>)}
            </select>
          </label>
          <span className="sys-hint" aria-live="polite">{uids.length ? `Câu ${Math.min(idx + 1, uids.length)}/${uids.length} · đã xử lý ${done} · còn ${remaining} chưa xác minh Dạng` : 'Không còn câu nào trong nhóm này.'}</span>
          <span className="vq-acts">
            <button type="button" className="btn btn-sm" onClick={() => setHelp((v) => !v)}>Phím tắt (?)</button>
            <button type="button" className="btn btn-sm" onClick={onClose}>Đóng (Esc)</button>
          </span>
        </header>
        {help && (
          <ul className="vq-keys" aria-label="Bảng phím tắt">
            {KEYS.map(([k, d]) => <li key={k}><kbd>{k}</kbd> {d}</li>)}
          </ul>
        )}
        {!q || !eff || !p ? (
          <p className="sys-hint" style={{ padding: 16 }}>{uids.length ? 'Câu không còn trong ngân hàng.' : 'Hàng đợi trống. Chọn nhóm khác ở trên hoặc đóng.'}</p>
        ) : (
          <div className="vq-body">
            <div className="vq-q">
              <div className="vq-meta">
                <span className="mono">{seqLabel(q.seq)}</span>
                <span className="code-tag">{eff?.unclassified ? 'Chưa có ID' : questionCode(q, q.level)}</span>
                <span className={`pill t-${q.type}`}>{TYPE_LABEL[q.type]}</span>
                <span className={`pill l-${q.level}`}>{LEVEL_LABEL[q.level]}</span>
                {q.tags.map((t) => <span key={t} className="tag">{t}</span>)}
              </div>
              <QuestionView p={p} variant="compact" showSolution={showSol} raw={q.latex} />
            </div>
            <aside className="vq-side" aria-label="Thông tin xác minh">
              <div className="vq-card">
                <b>Đang ở</b>
                <span>{eff.unclassified ? `Chưa có ID${qGrade != null ? ` · Lớp ${qGrade}` : ' · chưa rõ lớp'}` : where(q.formId)}</span>
                <span>
                  <span className={`rv-chip ${eff.form === 'gv' ? 'rv-approved' : eff.form === 'xem-lai' ? 'rv-needs_fix' : 'rv-unreviewed'}`}>Dạng: {FORM_STATE_LABEL[eff.form]}</span>{' '}
                  <span className={`rv-chip ${eff.level === 'gv' ? 'rv-approved' : 'rv-unreviewed'}`}>Mức độ: {LEVEL_STATE_LABEL[eff.level]}</span>{' '}
                  {eff.unclassified && <span className="rv-chip rv-needs_fix">Chưa có ID</span>}
                </span>
                {eff.src && <small className="sys-hint">Nguồn: {SOURCE_LABEL[eff.src]}{eff.why ? ` · ${eff.why}` : ''}</small>}
                {eff.rec?.orig && <small className="sys-hint">ID nguyên bản trong tệp: <span className="mono">{eff.rec.orig}</span></small>}
                {eff.rec?.prop && (eff.unclassified || eff.rec.prop !== q.formId) && (
                  <span className="vq-prop">
                    <small className="sys-hint">{eff.src === 'ai-ngoai' ? 'AI ngoài đề xuất' : 'Máy từng đề xuất'}: <b>{where(eff.rec.prop)}</b></small>
                    <button type="button" className="btn btn-sm btn-accent" disabled={busy} title="Đổi sang Dạng đề xuất (phím P)" onClick={() => void run({ kind: 'doi-dang', formId: eff.rec!.prop! }, true)}><kbd>P</kbd> Dùng Dạng đề xuất</button>
                  </span>
                )}
              </div>
              <div className="vq-card">
                <b>Gợi ý tham khảo</b>
                {suggestion && <small className="sys-hint">{CONFIDENCE_LABEL[suggestion.confidence]} · dựa trên các câu trong ngân hàng, chưa phải xác minh</small>}
                {options.length === 0 && <small className="sys-hint">Không có Dạng nào khác để gợi ý.</small>}
                {options.map((o, i) => (
                  <button key={o.formId} type="button" className="btn btn-sm vq-opt" disabled={busy} onClick={() => void run({ kind: 'doi-dang', formId: o.formId }, true)}>
                    <kbd>{i + 1}</kbd> {where(o.formId)}
                  </button>
                ))}
                <label className="qsel">Dạng khác (D)
                  <select ref={pick} value="" onChange={(e) => { if (e.target.value) void run({ kind: 'doi-dang', formId: e.target.value }, true); }} aria-label="Chọn Dạng khác">
                    <option value="">Chọn…</option>
                    {allForms.filter((f) => eff.unclassified || f.id !== q.formId).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </label>
              </div>
              <div className="vq-actions">
                <button type="button" className="btn btn-accent" disabled={busy || eff.form === 'gv' || eff.unclassified} title={eff.unclassified ? 'Câu chưa có ID: chọn Dạng ở trên' : undefined} onClick={() => void run({ kind: 'xac-nhan-dang' }, true)}><kbd>Y</kbd> Xác nhận Dạng</button>
                <button type="button" className="btn" disabled={busy || eff.level === 'gv'} onClick={() => void run({ kind: 'xac-nhan-muc-do' }, false)}><kbd>M</kbd> Xác nhận mức độ ({LEVEL_LABEL[q.level]})</button>
                <button type="button" className="btn" disabled={busy || eff.form === 'xem-lai'} onClick={() => void run({ kind: 'can-xem-lai' }, true)}><kbd>N</kbd> Cần xem lại</button>
                <button type="button" className="btn" disabled={busy || undo.length === 0} onClick={() => void doUndo()}><kbd>U</kbd> Hoàn tác</button>
                <button type="button" className="btn" disabled={idx >= uids.length - 1} onClick={() => { setIdx((i) => i + 1); setMsg(null); }}><kbd>S</kbd> Bỏ qua</button>
              </div>
              {msg && <span className={`rv-msg${msg.ok ? '' : ' bad'}`} role="status" aria-live="polite">{msg.text}</span>}
              <div className="vq-card">
                <b>Duyệt nội dung (việc riêng)</b>
                <small className="sys-hint">Đề, đáp án, lời giải, hình. Không đổi bởi các phím ở trên và không tự thành xác minh Dạng.</small>
                <ReviewControl key={q.uid} q={q} onChange={(s) => changeReview(q, s)} />
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
