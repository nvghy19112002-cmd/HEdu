// Gán ID tự động cho các câu đã chọn ở Ngân hàng: gợi ý (chỉ đối chiếu ngân hàng, không gửi gì ra ngoài) → bảng xem trước →
// giáo viên tick câu cần áp dụng → kiểm lại ngay trước khi ghi → ghi MỘT lần. Mức độ chỉ đổi khi tick riêng.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AI_VERDICT_LABEL, examplesFor, mergeAi, type AiVerdict, type GanIdRun } from '../lib/ai/tasks/ganidrun';
import { getTaxonomy } from '../lib/curriculum';
import { questionCode, seqLabel } from '../lib/id';
import { applyAutoId, buildRows, defaultChoice, levelTarget, movesLocation, planApply, summarize, type AutoIdRow, type RowChoice } from '../lib/idapply';
import { CONFIDENCE_LABEL, IdSuggester, type SuggestConfidence, type Suggestion } from '../lib/idsuggest';
import { plainSnippet } from '../lib/snippet';
import { getState } from '../lib/store';
import { indexOf, shortName, type TaxIndex } from '../lib/taxonomy';
import { taxRevision } from '../lib/taxpath';
import { LEVEL_LABEL, type Location, type Question } from '../lib/types';
import { AiAskBar } from './AiAskBar';

const nf = new Intl.NumberFormat('vi-VN');
type Filter = 'all' | SuggestConfidence;

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
      const tax = getTaxonomy();
      const tix = indexOf(tax);
      const r = buildRows(qs, new IdSuggester(tax, getState().questions), tix);
      localRef.current = new Map(r.map((x) => [x.uid, x.suggestion]));
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

  const sum = useMemo(() => (rows ? summarize(rows, choices) : null), [rows, choices]);
  const shown = useMemo(() => (rows ?? []).filter((r) => filter === 'all' || r.suggestion.confidence === filter), [rows, filter]);
  const counts = useMemo(() => {
    const c: Record<SuggestConfidence, number> = { cao: 0, vua: 0, thap: 0, khong: 0 };
    for (const r of rows ?? []) c[r.suggestion.confidence]++;
    return c;
  }, [rows]);

  const canApply = (r: AutoIdRow, c: RowChoice) => movesLocation(r, c.formId) || (c.changeLevel && !!levelTarget(r));
  const setChoice = (uid: string, patch: Partial<RowChoice>) => setChoices((m) => {
    const n = new Map(m);
    const r = rows!.find((x) => x.uid === uid)!;
    const c = { ...m.get(uid)!, ...patch };
    if (!canApply(r, c)) c.apply = false;
    else if (patch.formId !== undefined || patch.changeLevel !== undefined) c.apply = true;
    n.set(uid, c);
    return n;
  });
  const eligible = shown.filter((r) => canApply(r, choices.get(r.uid)!));
  const allOn = eligible.length > 0 && eligible.every((r) => choices.get(r.uid)!.apply);
  const toggleAll = () => setChoices((m) => {
    const n = new Map(m);
    for (const r of eligible) n.set(r.uid, { ...m.get(r.uid)!, apply: !allOn });
    return n;
  });

  const apply = async () => {
    if (!rows || busyRef.current) return;
    const tax = getTaxonomy();
    const tix = indexOf(tax);
    const plan = planApply(rows, choices, new Map(getState().questions.map((q) => [q.uid, q])), tix, taxRevision(tax) !== rows[0]?.suggestion.taxRev);
    const skipped = [
      plan.stale.length ? `${nf.format(plan.stale.length)} câu đã bị sửa/xoá hoặc cây đã đổi sau lúc xem trước nên KHÔNG ghi (hãy mở lại để gợi ý mới)` : '',
      plan.invalid.length ? `${nf.format(plan.invalid.length)} câu có vị trí chọn không còn hợp lệ trong cây nên KHÔNG ghi` : '',
    ].filter(Boolean).join('; ');
    if (plan.edits.size === 0) { setErr(skipped ? `Không có câu nào được ghi: ${skipped}.` : 'Không có gì thay đổi.'); return; }
    busyRef.current = true;
    setBusy(true);
    setErr(null);
    const r = await applyAutoId(plan.edits);
    busyRef.current = false;
    setBusy(false);
    if (!r.ok) { setErr('Chưa lưu được — KHÔNG câu nào bị thay đổi. Hãy kiểm tra ổ đĩa rồi bấm Áp dụng lại.'); return; }
    onDone(`Đã gán vị trí mới cho ${nf.format(r.changed)}/${nf.format(plan.edits.size)} câu${skipped ? `. ${skipped}` : ''}.`);
  };

  const codeOf = (loc: Location, level: Question['level']) => questionCode(loc, level);

  /** Hỏi AI cho MỌI câu trong bảng (AI dẫn đầu, ngân hàng làm bằng chứng). */
  const aiJobs = () => {
    const bank = new Map(getState().questions.map((q) => [q.uid, q]));
    return (rows ?? []).map((r) => ({ key: r.uid, latex: r.snap.latex, grade: r.snap.grade, examples: examplesFor(localRef.current.get(r.uid) ?? r.suggestion, bank) }));
  };
  /** Trộn kết quả AI vào bảng. Tự tick chỉ khi AI + ngân hàng cùng chọn, hoặc ngân hàng chưa chắc mà AI chắc. */
  const onAi = (run: GanIdRun) => {
    if (!rows) return;
    const nextRows = rows.map((r) => {
      const ai = run.results.get(r.uid);
      return ai ? { ...r, suggestion: mergeAi(localRef.current.get(r.uid) ?? r.suggestion, ai).suggestion } : r;
    });
    const v = new Map(verdicts);
    const ch = new Map(choices);
    for (const r of nextRows) {
      const ai = run.results.get(r.uid);
      if (!ai) continue;
      const verdict = mergeAi(localRef.current.get(r.uid) ?? r.suggestion, ai).verdict;
      v.set(r.uid, verdict);
      const best = r.suggestion.best?.formId ?? null;
      const auto = verdict === 'dong-thuan' || (verdict === 'ai-moi' && ai.confidence === 'high');
      const old = ch.get(r.uid)!;
      // AI không chọn được Dạng: bỏ tick và lựa chọn tự động cũ của gợi ý ngân hàng; giáo viên tự chọn trong ô phương án
      if (verdict === 'ai-khong-chac') { ch.set(r.uid, { ...old, formId: null, apply: false }); continue; }
      ch.set(r.uid, { ...old, formId: best ?? old.formId, apply: auto && movesLocation(r, best) });
    }
    setRows(nextRows);
    setVerdicts(v);
    setChoices(ch);
  };

  return (
    <>
      <div className="cfm-scrim" onClick={() => { if (!busy) onClose(); }} />
      <div className="cfm aid" role="dialog" aria-modal="true" aria-label="Gán ID tự động">
        <h3>Gán ID tự động cho {nf.format(qs.length)} câu</h3>
        <p className="aid-src">Gợi ý ban đầu chỉ đối chiếu Ngân hàng trên máy — không gửi gì ra ngoài. Bấm “Hỏi AI” để nhờ Gemini phân loại (HEdu hỏi trước khi gửi). Tin cậy là nhãn hiển thị, không phải xác suất.</p>
        {!rows || !ix ? (
          <p className="aid-wait" role="status">Đang quét {nf.format(qs.length)} câu…</p>
        ) : (
          <>
            <div className="aid-bar">
              <label className="qsel">Hiện
                <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
                  <option value="all">Tất cả ({nf.format(rows.length)})</option>
                  {(['cao', 'vua', 'thap', 'khong'] as SuggestConfidence[]).map((c) => <option key={c} value={c}>{CONFIDENCE_LABEL[c]} ({nf.format(counts[c])})</option>)}
                </select>
              </label>
              <label className="aid-all"><input type="checkbox" checked={allOn} disabled={eligible.length === 0 || busy} onChange={toggleAll} /> Chọn tất cả câu đang hiện có thể đổi</label>
            </div>
            <AiAskBar count={rows.length} buildJobs={aiJobs} onResults={onAi} disabled={busy} />
            <div className="aid-scroll">
              <table className="aid-table">
                <thead>
                  <tr><th aria-label="Áp dụng" /><th>Câu</th><th>ID hiện tại → dự kiến</th><th>Vị trí dự kiến</th><th>Tin cậy</th><th>Mức độ</th></tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const c = choices.get(r.uid)!;
                    const s = r.suggestion;
                    const opts = [s.best, ...s.alternatives].filter((o): o is NonNullable<typeof o> => !!o);
                    const target = c.formId ? opts.find((o) => o.formId === c.formId)?.location ?? null : null;
                    const lt = levelTarget(r);
                    const newLevel = c.changeLevel && lt ? lt : r.snap.level;
                    const newCode = codeOf(target && movesLocation(r, c.formId) ? target : r.snap, newLevel);
                    const oldCode = r.currentOk ? codeOf(r.snap, r.snap.level) : '—';
                    return (
                      <tr key={r.uid} className={c.apply ? 'is-on' : ''}>
                        <td><input type="checkbox" checked={c.apply} disabled={busy || !canApply(r, c)} aria-label={`Áp dụng cho câu ${seqLabel(r.seq)}`} onChange={(e) => setChoice(r.uid, { apply: e.target.checked })} /></td>
                        <td className="aid-q"><span className="mono">{seqLabel(r.seq)}</span><small>{plainSnippet(r.snap.latex, 90)}</small></td>
                        <td className="aid-code"><span className="code-tag">{oldCode}</span>{newCode !== oldCode && <> → <span className="code-tag is-new">{newCode}</span></>}{!r.currentOk && <small className="aid-bad">Vị trí hiện tại sai đường dẫn cây</small>}</td>
                        <td>
                          {opts.length ? (
                            <select className="aid-sel" value={c.formId ?? ''} disabled={busy} onChange={(e) => setChoice(r.uid, { formId: e.target.value || null })} aria-label={`Vị trí cho câu ${seqLabel(r.seq)}`}>
                              {opts.map((o, i) => <option key={o.formId} value={o.formId}>{i === 0 && s.best ? '★ ' : ''}{pathLabel(ix, o.formId)}{o.formId === r.snap.formId ? ' (đang ở đây)' : ''}</option>)}
                              <option value="">— Giữ nguyên vị trí hiện tại —</option>
                            </select>
                          ) : <span className="aid-none">Cần thầy/cô chọn vị trí</span>}
                          {s.notes.map((n) => <small key={n} className="aid-note">{n}</small>)}
                        </td>
                        <td><span className={`aid-conf c-${s.confidence}`}>{CONFIDENCE_LABEL[s.confidence]}</span>{verdicts.has(r.uid) && <small className={`aid-note ai-v v-${verdicts.get(r.uid)}`}>{AI_VERDICT_LABEL[verdicts.get(r.uid)!]}</small>}{s.evidence.length > 0 && <small className="aid-note">{nf.format(s.evidence.length)} câu mẫu</small>}</td>
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
            {sum && <p className="bd-sum" role="status">{nf.format(sum.chosen)} câu chọn · {nf.format(sum.moveLoc)} đổi vị trí · <b>{nf.format(sum.moveLevel)} đổi mức độ</b> · {nf.format(sum.needTeacher)} cần thầy/cô xử lý</p>}
            <p className="aid-warn">Hoàn tác được trong phiên làm việc này (đóng app thì không hoàn tác được nữa). Nội dung câu, nhãn và trạng thái kiểm duyệt không bị đổi.</p>
          </>
        )}
        {err && <p className="bd-bad" role="alert">{err}</p>}
        <div className="cfm-acts">
          <button ref={cancelRef} type="button" className="btn btn-outline" disabled={busy} onClick={onClose}>Đóng</button>
          <button type="button" className="btn btn-accent" disabled={busy || !sum || sum.chosen === 0} onClick={() => { void apply(); }}>{busy ? 'Đang lưu…' : sum && sum.chosen > 0 ? `Áp dụng cho ${nf.format(sum.chosen)} câu` : 'Chưa chọn câu nào'}</button>
        </div>
      </div>
    </>
  );
}
