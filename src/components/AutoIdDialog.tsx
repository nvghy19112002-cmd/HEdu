// Gán ID tự động cho các câu đã chọn ở Ngân hàng: gợi ý (chỉ đối chiếu ngân hàng, không gửi gì ra ngoài) → bảng xem trước →
// giáo viên tick câu cần áp dụng → kiểm lại ngay trước khi ghi → ghi MỘT lần (vị trí/mức độ + ID trong LaTeX cùng nhau).
// Bảng theo đặc tả Gán ID mục XII: ID hiện tại (đọc từ LaTeX) · ID đề xuất · Vị trí · Lý do · Trạng thái · Áp dụng.
// KHÔNG tự tick câu nào: giáo viên tick từng câu hoặc bấm "Chọn tất cả câu có đề xuất".
import { useEffect, useMemo, useRef, useState } from 'react';
import { AI_VERDICT_LABEL, examplesFor, mergeAi, type AiVerdict, type GanIdRun } from '../lib/ai/tasks/ganidrun';
import { getTaxonomy } from '../lib/curriculum';
import { seqLabel } from '../lib/id';
import { idStatus, LATEX_ID_LABEL } from '../lib/idsync';
import { applyAutoId, buildRows, canApply, defaultChoice, levelTarget, planApply, ROW_ACTION_LABEL, rowAction, summarize, type AutoIdRow, type RowAction, type RowChoice } from '../lib/idapply';
import { CONFIDENCE_LABEL, IdSuggester, type Suggestion } from '../lib/idsuggest';
import { plainSnippet } from '../lib/snippet';
import { getState } from '../lib/store';
import { indexOf, shortName, type TaxIndex } from '../lib/taxonomy';
import { taxRevision } from '../lib/taxpath';
import { LEVEL_LABEL, type Question, type Taxonomy } from '../lib/types';
import { AiAskBar } from './AiAskBar';

const nf = new Intl.NumberFormat('vi-VN');
type Filter = 'all' | 'de-xuat' | RowAction['kind'];
const FILTERS: { v: Filter; label: string }[] = [
  { v: 'all', label: 'Tất cả' },
  { v: 'de-xuat', label: 'Đề xuất (thêm/đổi ID)' },
  { v: 'khong-du', label: 'Không đủ căn cứ' },
  { v: 'loi', label: 'Cần xử lý' },
  { v: 'giu', label: 'Có ID hợp lệ' },
];
const STATUS_TEXT: Record<RowAction['kind'], string> = { them: 'Đề xuất', thay: 'Đề xuất', giu: 'Hợp lệ', 'khong-du': 'Không chắc', loi: 'Xung đột' };

const pathLabel = (ix: TaxIndex, formId: string): string => {
  const p = ix.get(formId);
  return p?.chapter && p.lesson && p.form ? `${shortName(p.chapter.name)} › ${shortName(p.lesson.name)} › ${shortName(p.form.name)}` : '—';
};

export function AutoIdDialog({ qs: picked, onClose, onDone }: { qs: readonly Question[]; onClose(): void; onDone(message: string): void }) {
  // chụp danh sách câu lúc mở: ngân hàng đổi trong lúc xem không làm quét lại / mất lựa chọn (đã có kiểm lại trước khi ghi)
  const [qs] = useState(picked);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [rows, setRows] = useState<AutoIdRow[] | null>(null);
  const [ix, setIx] = useState<TaxIndex | null>(null);
  const [tax, setTax] = useState<Taxonomy | null>(null);
  const [choices, setChoices] = useState<Map<string, RowChoice>>(new Map());
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const busyRef = useRef(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // gợi ý GỐC của ngân hàng (để hỏi AI lại vẫn trộn với gợi ý gốc) + kết luận trộn AI theo từng câu
  const localRef = useRef<Map<string, Suggestion>>(new Map());
  const [verdicts, setVerdicts] = useState<Map<string, AiVerdict>>(new Map());

  // quét sau khi hộp thoại đã hiện (để "Đang quét…" kịp vẽ)
  useEffect(() => {
    const t = setTimeout(() => {
      const tx = getTaxonomy();
      const tix = indexOf(tx);
      const r = buildRows(qs, new IdSuggester(tx, getState().questions), tix);
      localRef.current = new Map(r.map((x) => [x.uid, x.suggestion]));
      setTax(tx);
      setIx(tix);
      setRows(r);
      setChoices(new Map(r.map((x) => [x.uid, defaultChoice(x)])));
    }, 30);
    return () => clearTimeout(t);
  }, [qs]);

  useEffect(() => {
    cancelRef.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!busyRef.current) closeRef.current(); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, []);

  const actions = useMemo(() => {
    const m = new Map<string, RowAction>();
    if (rows && ix && tax) for (const r of rows) m.set(r.uid, rowAction(r, choices.get(r.uid), ix, tax));
    return m;
  }, [rows, choices, ix, tax]);
  const sum = useMemo(() => (rows && ix && tax ? summarize(rows, choices, ix, tax) : null), [rows, choices, ix, tax]);
  const shown = useMemo(() => (rows ?? []).filter((r) => {
    const k = actions.get(r.uid)?.kind ?? 'khong-du';
    return filter === 'all' || (filter === 'de-xuat' ? k === 'them' || k === 'thay' : k === filter);
  }), [rows, filter, actions]);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: rows?.length ?? 0, 'de-xuat': 0, them: 0, thay: 0, giu: 0, 'khong-du': 0, loi: 0 };
    for (const r of rows ?? []) { const k = actions.get(r.uid)?.kind ?? 'khong-du'; c[k]++; if (k === 'them' || k === 'thay') c['de-xuat']++; }
    return c;
  }, [rows, actions]);

  const setChoice = (uid: string, patch: Partial<RowChoice>) => setChoices((m) => {
    const n = new Map(m);
    const r = rows!.find((x) => x.uid === uid)!;
    const c = { ...m.get(uid)!, ...patch };
    if (!canApply(rowAction(r, c, ix!, tax!))) c.apply = false;
    else if (patch.formId !== undefined || patch.changeLevel !== undefined) c.apply = true; // giáo viên vừa chủ động chọn ⇒ tick
    n.set(uid, c);
    return n;
  });
  const eligible = shown.filter((r) => { const a = actions.get(r.uid); return !!a && canApply(a); });
  const allOn = eligible.length > 0 && eligible.every((r) => choices.get(r.uid)!.apply);
  const toggleAll = () => setChoices((m) => {
    const n = new Map(m);
    for (const r of eligible) n.set(r.uid, { ...m.get(r.uid)!, apply: !allOn });
    return n;
  });

  const apply = async () => {
    if (!rows || busyRef.current) return;
    const tx = getTaxonomy();
    const tix = indexOf(tx);
    const plan = planApply(rows, choices, new Map(getState().questions.map((q) => [q.uid, q])), tix, taxRevision(tx) !== rows[0]?.suggestion.taxRev, tx);
    const skipped = [
      plan.stale.length ? `${nf.format(plan.stale.length)} câu đã bị sửa/xoá hoặc cây đã đổi sau lúc xem trước nên KHÔNG ghi (hãy mở lại để gợi ý mới)` : '',
      plan.invalid.length ? `${nf.format(plan.invalid.length)} câu có vị trí chọn không còn hợp lệ trong cây nên KHÔNG ghi` : '',
      plan.idBlocked.length ? `${nf.format(plan.idBlocked.length)} câu không ghi được ID vào LaTeX (có nhiều ID, hoặc cây có mã trùng) nên KHÔNG ghi — mở câu để sửa ID` : '',
    ].filter(Boolean).join('; ');
    if (plan.edits.size === 0) { setErr(skipped ? `Không có câu nào được ghi: ${skipped}.` : 'Không có gì thay đổi.'); return; }
    busyRef.current = true;
    setBusy(true);
    setErr(null);
    const r = await applyAutoId(plan.edits);
    busyRef.current = false;
    setBusy(false);
    if (!r.ok) { setErr('Chưa lưu được — KHÔNG câu nào bị thay đổi. Hãy kiểm tra ổ đĩa rồi bấm Áp dụng lại.'); return; }
    onDone(`Đã ghi ID (vị trí + LaTeX) cho ${nf.format(r.changed)}/${nf.format(plan.edits.size)} câu${skipped ? `. ${skipped}` : ''}.`);
  };

  /** Hỏi AI cho MỌI câu trong bảng (kể cả câu đã có ID hợp lệ: "Kiểm tra lại bằng AI"). Câu mẫu gửi AI chỉ lấy câu có nội dung đã duyệt (ví dụ tham khảo, không phải căn cứ xác minh ID), trừ chính nó. */
  const aiJobs = () => {
    const bank = new Map(getState().questions.map((q) => [q.uid, q]));
    return (rows ?? []).map((r) => ({ key: r.uid, latex: r.snap.latex, grade: r.snap.grade, examples: examplesFor(localRef.current.get(r.uid) ?? r.suggestion, bank, new Set([r.uid])) }));
  };
  /** Trộn kết quả AI vào bảng. Không tự tick: Dạng AI chọn chỉ được điền sẵn; Dạng khác lúc trước thì bỏ tick cũ. */
  const onAi = (run: GanIdRun) => {
    if (!rows) return;
    const v = new Map(verdicts);
    const ch = new Map(choices);
    const nextRows = rows.map((r) => {
      const ai = run.results.get(r.uid);
      if (!ai) return r;
      const mg = mergeAi(localRef.current.get(r.uid) ?? r.suggestion, ai);
      v.set(r.uid, mg.verdict);
      const old = ch.get(r.uid)!;
      const best = mg.suggestion.best?.formId ?? null;
      ch.set(r.uid, { ...old, formId: best, apply: old.apply && best === old.formId });
      return { ...r, suggestion: mg.suggestion };
    });
    setRows(nextRows);
    setVerdicts(v);
    setChoices(ch);
  };

  return (
    <>
      <div className="cfm-scrim" onClick={() => { if (!busy) onClose(); }} />
      <div className="cfm aid" role="dialog" aria-modal="true" aria-label="Gán ID tự động">
        <h3>Gán ID tự động cho {nf.format(qs.length)} câu</h3>
        <p className="aid-src">Gợi ý ban đầu chỉ đối chiếu Ngân hàng trên máy — không gửi gì ra ngoài. Bấm “Hỏi AI” để nhờ Gemini phân loại (HEdu hỏi trước khi gửi). HEdu không tự tick câu nào; “tin cậy” chỉ là nhãn tham khảo, không phải xác suất đúng.</p>
        {!rows || !ix || !tax ? (
          <p className="aid-wait" role="status">Đang quét {nf.format(qs.length)} câu…</p>
        ) : (
          <>
            <div className="aid-bar">
              <label className="qsel">Hiện
                <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
                  {FILTERS.map((f) => <option key={f.v} value={f.v}>{f.label} ({nf.format(counts[f.v])})</option>)}
                </select>
              </label>
              <label className="aid-all"><input type="checkbox" checked={allOn} disabled={eligible.length === 0 || busy} onChange={toggleAll} /> Chọn tất cả câu có đề xuất đang hiện ({nf.format(eligible.length)})</label>
            </div>
            <AiAskBar count={rows.length} buildJobs={aiJobs} onResults={onAi} disabled={busy} />
            <div className="aid-scroll">
              <table className="aid-table">
                <thead>
                  <tr><th aria-label="Áp dụng" /><th>Câu hỏi</th><th>ID hiện tại</th><th>ID đề xuất</th><th>Vị trí</th><th>Lý do</th><th>Trạng thái</th><th>Mức độ</th></tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const c = choices.get(r.uid)!;
                    const a = actions.get(r.uid)!;
                    const s = r.suggestion;
                    const opts = [s.best, ...s.alternatives].filter((o): o is NonNullable<typeof o> => !!o);
                    const lt = levelTarget(r);
                    const ids = idStatus(r.snap, tax);
                    const fromLatex = ids.latex.raw;
                    /** vị trí đang lưu đúng nhưng ID trong LaTeX lệch/lỗi ⇒ cho chọn lại chính vị trí này để sửa ID (có tick xác nhận) */
                    const fixable = r.currentOk && (ids.state === 'lech' || ids.state === 'id-loi');
                    return (
                      <tr key={r.uid} className={c.apply ? 'is-on' : ''}>
                        <td><input type="checkbox" checked={c.apply} disabled={busy || !canApply(a)} aria-label={`Áp dụng cho câu ${seqLabel(r.seq)}`} onChange={(e) => setChoice(r.uid, { apply: e.target.checked })} /></td>
                        <td className="aid-q"><span className="mono">{seqLabel(r.seq)}</span><small>{plainSnippet(r.snap.latex, 90)}</small></td>
                        <td className="aid-code">
                          {fromLatex ? <span className="code-tag">{fromLatex}</span> : <span className="aid-none">Chưa có ID</span>}
                          <small className={ids.latex.state === 'hop-le' || ids.latex.state === 'khong-co' ? 'aid-note' : 'aid-bad'}>{ids.state === 'lech' ? 'Khác vị trí đang lưu' : LATEX_ID_LABEL[ids.latex.state]}</small>
                        </td>
                        <td className="aid-code">
                          {a.kind === 'them' || a.kind === 'thay' ? <span className="code-tag is-new">{a.code}</span> : a.kind === 'giu' ? <span className="code-tag">{a.code}</span> : '—'}
                          {a.kind === 'thay' && a.old && <small className="aid-note">Đổi {a.old} → {a.code}</small>}
                        </td>
                        <td>
                          {opts.length || fixable ? (
                            <select className="aid-sel" value={c.formId ?? ''} disabled={busy} onChange={(e) => setChoice(r.uid, { formId: e.target.value || null })} aria-label={`Vị trí cho câu ${seqLabel(r.seq)}`}>
                              {opts.map((o, i) => <option key={o.formId} value={o.formId}>{i === 0 && s.best ? '★ ' : ''}{pathLabel(ix, o.formId)}{o.formId === r.snap.formId ? (fixable ? ' (đang ở đây — sửa ID theo vị trí này)' : ' (đang ở đây)') : ''}</option>)}
                              {fixable && !opts.some((o) => o.formId === r.snap.formId) && <option value={r.snap.formId}>Vị trí hiện tại — sửa ID theo vị trí này ({pathLabel(ix, r.snap.formId)})</option>}
                              <option value="">— Giữ nguyên vị trí hiện tại —</option>
                            </select>
                          ) : <span className="sys-hint">{pathLabel(ix, r.snap.formId)}</span>}
                        </td>
                        <td className="aid-why">
                          {s.notes.length ? s.notes.map((n) => <small key={n} className="aid-note">{n}</small>) : <small className="aid-note">{s.best ? `${nf.format(s.evidence.length)} câu tương tự trong ngân hàng` : '—'}</small>}
                          {a.kind === 'loi' && <small className="aid-bad">{a.why}</small>}
                        </td>
                        <td>
                          <span className={`aid-conf aid-st st-${a.kind}`} title={ROW_ACTION_LABEL[a.kind]}>{STATUS_TEXT[a.kind]}</span>
                          {s.best && <small className="aid-note">Tin cậy: {CONFIDENCE_LABEL[s.confidence]}</small>}
                          {verdicts.has(r.uid) && <small className={`aid-note ai-v v-${verdicts.get(r.uid)}`}>{AI_VERDICT_LABEL[verdicts.get(r.uid)!]}</small>}
                        </td>
                        <td>
                          <span className={`pill l-${r.snap.level}`}>{LEVEL_LABEL[r.snap.level]}</span>
                          {lt ? (
                            <label className="aid-lv"><input type="checkbox" checked={c.changeLevel} disabled={busy} onChange={(e) => setChoice(r.uid, { changeLevel: e.target.checked })} /> Đổi thành {LEVEL_LABEL[lt]} <small>(gợi ý tham khảo)</small></label>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {sum && (
              <p className="bd-sum" role="status">
                Sẽ áp dụng {nf.format(sum.chosen)} câu: <b>{nf.format(sum.add)} thêm ID</b> · <b>{nf.format(sum.change)} đổi ID</b>{sum.moveLevel ? <> · {nf.format(sum.moveLevel)} đổi mức độ</> : null}
                {' '}— trong bảng còn {nf.format(sum.keep)} giữ nguyên · {nf.format(sum.noBasis)} không đủ căn cứ · {nf.format(sum.errors)} cần xử lý
              </p>
            )}
            <p className="aid-warn">HEdu chỉ đổi vùng <span className="mono">%[ID]</span> và vị trí/mức độ; nội dung câu, nhãn và trạng thái kiểm duyệt giữ nguyên. Hoàn tác được trong phiên làm việc này.</p>
          </>
        )}
        {err && <p className="bd-bad" role="alert">{err}</p>}
        <div className="cfm-acts">
          <button ref={cancelRef} type="button" className="btn btn-outline" disabled={busy} onClick={onClose}>Đóng</button>
          <button type="button" className="btn btn-accent" disabled={busy || !sum || sum.chosen === 0} onClick={() => { void apply(); }}>{busy ? 'Đang lưu…' : sum && sum.chosen > 0 ? `Áp dụng cho ${nf.format(sum.chosen)} câu (${nf.format(sum.add)} thêm · ${nf.format(sum.change)} đổi)` : 'Chưa chọn câu nào'}</button>
        </div>
      </div>
    </>
  );
}
