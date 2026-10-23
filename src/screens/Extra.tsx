// Màn Nhập liệu: dán hoặc mở file LaTeX, xem trước rồi nhập hàng loạt vào ngân hàng.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CompiledView, FailureBox } from '../components/CompiledView';
import { compileBatch, CATEGORY_ORDER, type Category, type Failure } from '../lib/xemchuan';
import { isTikzReady } from '../lib/tikz';
import { useApp } from '../app-context';
import { PackagePanel } from '../components/PackagePanel';
import { chapters, firstLocation, getTaxonomy, grades } from '../lib/curriculum';
import { indexOf, shortName } from '../lib/taxonomy';
import { draftLocation, optionsOf, suggestDrafts, type DraftIdPick } from '../lib/iddraft';
import { CONFIDENCE_LABEL, IdSuggester } from '../lib/idsuggest';
import { taxRevision } from '../lib/taxpath';
import { checkQuestion, LEVEL_TEXT, worstLevel, type Issue } from '../lib/check';
import { DUP_KIND_LABEL, type DupKind } from '../lib/dup2';
import { analyzeDrafts, bankHitSignature, BLOCKING, defaultDecisions, summarize, type AnalyzeResult, type Decision, type DraftHit } from '../lib/dupimport';
import { PairCompare } from '../components/PairCompare';
import { QuestionDrawer } from '../components/QuestionDrawer';
import { seqLabel } from '../lib/id';
import { parseExTest, splitExBlocksAt } from '../lib/extest';
import { parseCode, questionCode } from '../lib/id';
import { addMany, flushSave, getState, isLastSaveOk, useBank, type Draft } from '../lib/store';
import { LEVEL_LABEL, LEVELS, TYPE_LABEL, type Level, type Location } from '../lib/types';

function readFile(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(file, 'utf-8'); });
}

export function ImportScreen() {
  const { go, toast } = useApp();
  const { questions } = useBank();
  const [src, setSrc] = useState('');
  const [loc, setLoc] = useState<Location>(firstLocation(12));
  const [level, setLevel] = useState<Level>('TH');
  const file = useRef<HTMLInputElement>(null);

  // Đọc lại sau khi ngừng gõ 250ms: dán một file vài trăm câu mà đọc ngay từng phím thì treo.
  const [text250, setText250] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setText250(src), 250);
    return () => clearTimeout(t);
  }, [src]);

  const rows = useMemo(() => splitExBlocksAt(text250).map(({ text: latex, line }) => {
    const p = parseExTest(latex);
    const fromId = p.idComment ? parseCode(p.idComment) : null;
    return { latex, line, p, fromId };
  }), [text250]);

  // ---- Rà soát trùng: câu mới ↔ kho, câu mới ↔ câu mới trong lô ----
  const [edits, setEdits] = useState<Record<number, string>>({});   // câu mới được giáo viên sửa tại chỗ (không ghi ngược vào ô dán)
  const [userDec, setUserDec] = useState<Record<string, Decision>>({});
  const [ana, setAna] = useState<AnalyzeResult | null>(null);
  const [anaProg, setAnaProg] = useState<{ done: number; total: number; phase: string } | null>(null);
  const [statusF, setStatusF] = useState<'all' | 'new' | 'sure' | 'near' | 'conflict' | 'template' | 'unread' | 'hold'>('all');
  const [cmpKey, setCmpKey] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<number | null>(null);
  const [openBank, setOpenBank] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [bulkAsk, setBulkAsk] = useState(false);
  useEffect(() => { setEdits({}); setUserDec({}); setCmpKey(null); setEditRow(null); setConfirm(false); setSaveErr(null); setBulkAsk(false); setIdPicks(null); }, [text250]);
  // Gán ID tự động cho câu không có %[ID] hợp lệ (chỉ metadata bản nháp; đổi lớp đích ⇒ gợi ý cũ bỏ)
  const [idPicks, setIdPicks] = useState<Map<number, DraftIdPick> | null>(null);
  useEffect(() => { setIdPicks(null); }, [loc.grade]);
  const pickIx = useMemo(() => (idPicks ? indexOf(getTaxonomy()) : null), [idPicks]);
  const latexOf = (i: number) => edits[i] ?? rows[i]?.latex ?? '';
  const drafts = useMemo(() => rows.map((r, i) => ({ id: `d${i}`, latex: edits[i] ?? r.latex })), [rows, edits]);
  const draftIds = useMemo(() => new Map(drafts.map((d, i) => [d.id, i] as const)), [drafts]);
  useEffect(() => {
    if (!drafts.length) { setAna(null); setAnaProg(null); return; }
    const sig = { aborted: false };
    setAna(null);
    const t = setTimeout(async () => {
      const r = await analyzeDrafts(drafts, questions, { signal: sig, onProgress: (done, total, phase) => { if (!sig.aborted) setAnaProg({ done, total, phase: phase === 'bank' ? 'Đang đọc ngân hàng' : 'Đang so với ngân hàng và trong file' }); } });
      if (sig.aborted) return;
      setAnaProg(null);
      setAna(r);
    }, edits && Object.keys(edits).length ? 350 : 0);
    return () => { sig.aborted = true; clearTimeout(t); };
  }, [drafts, questions]);
  const anaDone = !!ana && ana.complete;
  const defaults = useMemo(() => defaultDecisions(drafts, ana ? ana.rows : drafts.map(() => undefined)), [drafts, ana]);
  const decOf = (i: number): Decision => userDec[`d${i}`] ?? defaults[`d${i}`] ?? 'hold';
  const decisions = useMemo(() => Object.fromEntries(drafts.map((d, i) => [d.id, userDec[d.id] ?? defaults[d.id] ?? 'hold'])) as Record<string, Decision>, [drafts, defaults, userDec]);
  const sum = useMemo(() => summarize(drafts, ana ? ana.rows : drafts.map(() => undefined), decisions), [drafts, ana, decisions]);
  const statusOf = (i: number): { key: typeof statusF; label: string } => {
    const a = ana?.rows[i];
    if (!a) return { key: 'hold', label: 'Chưa phân tích' };
    if (a.hits.some((h) => h.kind === 'conflict')) return { key: 'conflict', label: 'Mâu thuẫn đáp án' };
    if (a.hits.some((h) => h.kind === 'raw' || h.kind === 'same')) return { key: 'sure', label: 'Trùng chắc' };
    if (a.hits.some((h) => h.kind === 'near')) return { key: 'near', label: 'Có thể trùng' };
    if (a.unreadable) return { key: 'unread', label: 'Mã chưa đọc đủ' };
    if (a.hits.some((h) => h.kind === 'template')) return { key: 'template', label: 'Cùng mẫu khác dữ kiện' };
    return { key: 'new', label: 'Mới' };
  };
  const statusCount = useMemo(() => {
    const c: Record<string, number> = {};
    rows.forEach((_, i) => { const k = statusOf(i).key; c[k] = (c[k] ?? 0) + 1; });
    return c;
  }, [rows, ana]); // eslint-disable-line react-hooks/exhaustive-deps

  // Kiểm tra lỗi xem trước theo từng đợt 15 câu, nhường chỗ cho giao diện giữa các đợt.
  const [issues, setIssues] = useState<(Issue[] | undefined)[]>([]);
  useEffect(() => {
    setIssues(new Array(rows.length));
    if (!rows.length) return;
    let stop = false;
    const acc: (Issue[] | undefined)[] = new Array(rows.length);
    let i = 0;
    const step = () => {
      if (stop) return;
      const until = Math.min(i + 15, rows.length);
      for (; i < until; i++) acc[i] = checkQuestion(rows[i].p, rows[i].latex, rows[i].line - 1);
      setIssues(acc.slice());
      if (i < rows.length) setTimeout(step, 0);
    };
    const t = setTimeout(step, 0);
    return () => { stop = true; clearTimeout(t); };
  }, [rows]);

  const done = issues.filter(Boolean).length;
  const checking = rows.length > 0 && done < rows.length;
  const worstOf = (i: number) => (issues[i] ? worstLevel(issues[i]!) : null);
  const nErr = issues.filter((x) => x && worstLevel(x) === 'loi').length;
  const nWarn = issues.filter((x) => x && worstLevel(x) === 'canh').length;
  const nFig = issues.filter((x) => x?.some((y) => y.level === 'tin')).length;
  const [onlyBad, setOnlyBad] = useState(false);
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [pkgFilter, setPkgFilter] = useState<{ rows: number[]; key: string } | null>(null);
  const [limit, setLimit] = useState(200);
  // Biên dịch thử bằng TeX Live (Xem chuẩn hàng loạt)
  type Tex = { ok: true; ms: number; cached: boolean } | { ok: false; fail: Failure };
  const [tex, setTex] = useState<Record<number, Tex>>({});
  const [texRun, setTexRun] = useState(false);
  const [texSol, setTexSol] = useState(true);
  const [texOnlyBad, setTexOnlyBad] = useState(false);
  const [exactRow, setExactRow] = useState<number | null>(null);
  const stopRef = useRef({ stop: false });
  useEffect(() => { stopRef.current.stop = true; setTex({}); setTexRun(false); setExactRow(null); }, [text250]);
  const startTex = async () => {
    const sig = { stop: false };
    stopRef.current = sig;
    setTex({});
    setTexRun(true);
    await compileBatch(rows.map((r) => r.latex), texSol, {
      signal: sig,
      onEach: (i, r) => { if (!sig.stop) setTex((cur) => ({ ...cur, [i]: r.ok ? { ok: true, ms: r.ms, cached: r.cached } : { ok: false, fail: r.fail } })); },
    });
    if (stopRef.current === sig) setTexRun(false);
  };
  const stopTex = () => { stopRef.current.stop = true; setTexRun(false); };
  const texDone = Object.keys(tex).length;
  const texFail = Object.values(tex).filter((x) => !x.ok) as { ok: false; fail: Failure }[];
  const texByCat = texFail.reduce<Partial<Record<Category, number>>>((a, x) => ({ ...a, [x.fail.category]: (a[x.fail.category] ?? 0) + 1 }), {});
  const blocks = useMemo(() => rows.map((r) => r.latex), [rows]);
  useEffect(() => { setPkgFilter(null); setLimit(200); }, [text250]);
  const shownRows = rows
    .map((r, i) => ({ r, i }))
    .filter(({ i }) => !onlyBad || worstOf(i) === 'loi' || worstOf(i) === 'canh')
    .filter(({ i }) => !pkgFilter || pkgFilter.rows.includes(i))
    .filter(({ i }) => !texOnlyBad || tex[i]?.ok === false)
    .filter(({ i }) => statusF === 'all' || (statusF === 'hold' ? decOf(i) === 'hold' : statusOf(i).key === statusF));

  const chs = chapters(loc.grade);
  const chapter = chs.find((c) => c.id === loc.chapterId) ?? chs[0];
  const lesson = chapter?.lessons.find((l) => l.id === loc.lessonId) ?? chapter?.lessons[0];

  const importCount = sum.importN;
  const canImport = anaDone && !checking && sum.holdN === 0 && importCount > 0;
  const fromIdOf = (i: number) => {
    if (edits[i] == null) return rows[i].fromId;
    const id = parseExTest(latexOf(i)).idComment;
    return id ? parseCode(id) : null;
  };
  const noIdRows = rows.map((_, i) => i).filter((i) => !fromIdOf(i));
  const runIdSuggest = () => {
    const tax = getTaxonomy();
    setIdPicks(suggestDrafts(noIdRows.map((i) => ({ index: i, latex: latexOf(i) })), new IdSuggester(tax, getState().questions), loc.grade));
  };
  const setPick = (i: number, formId: string | null) => setIdPicks((m) => { if (!m?.has(i)) return m; const n = new Map(m); n.set(i, { ...m.get(i)!, formId }); return n; });
  /** Vị trí của câu không có ID: gợi ý đã chọn (nếu còn hợp lệ) hoặc vị trí chung. */
  const draftLocOf = (i: number) => { const tax = getTaxonomy(); return draftLocation(idPicks?.get(i), latexOf(i), indexOf(tax), taxRevision(tax), loc); };
  const toDrafts = (): Draft[] => rows.flatMap((_r, i) => {
    if (decOf(i) !== 'import') return [];
    const text = latexOf(i).trim();
    const fromId = fromIdOf(i);
    return [{ latex: text, level: fromId?.level ?? level, tags: [], ...(fromId?.loc ?? draftLocOf(i).loc) } as Draft];
  });
  /** Bước cuối: rà soát LẠI theo kho hiện hành (chống kho đổi sau lúc xem), rồi mới ghi. */
  const commit = async () => {
    setConfirm(false);
    if (!ana) return;
    const fresh = await analyzeDrafts(drafts, getState().questions);
    if (!fresh.complete || bankHitSignature(fresh.rows) !== bankHitSignature(ana.rows)) {
      setAna(fresh);
      toast('Ngân hàng vừa có thay đổi nên HEdu đã rà soát lại. Xem lại các câu nghi trùng rồi bấm Nhập một lần nữa.');
      return;
    }
    const added = addMany(toDrafts());
    await flushSave();
    if (!isLastSaveOk()) {
      setSaveErr(`Đã đưa ${added.length} câu vào ngân hàng trong phiên này nhưng CHƯA ghi được xuống đĩa. Đừng đóng app. Nội dung dán vẫn được giữ lại; các câu đã thêm sẽ hiện là “trùng chắc”, nên thử lại không bị nhân đôi.`);
      return;
    }
    toast(`Đã nhập ${added.length} câu, bỏ qua ${sum.skipN} câu.`);
    setSrc('');
    go({ screen: 'bank' });
  };
  const retrySave = async () => { await flushSave(); if (isLastSaveOk()) { setSaveErr(null); toast('Đã ghi xuống đĩa.'); setSrc(''); go({ screen: 'bank' }); } };
  const setDec = (i: number, d: Decision) => setUserDec((u) => ({ ...u, [`d${i}`]: d }));
  const sureRows = rows.map((_, i) => i).filter((i) => statusOf(i).key === 'sure' && decOf(i) !== 'skip');
  const hitLabel = (h: DraftHit): string => {
    if (h.with === 'bank') { const q = questions.find((x) => x.uid === h.other); return `Câu ${q ? seqLabel(q.seq) : '(đã xoá)'} trong ngân hàng`; }
    const j = draftIds.get(h.other); return `Câu ${j != null ? j + 1 : '?'} trong file${j != null ? ` (dòng ${rows[j].line})` : ''}`;
  };

  return (
    <>
      <header className="page-head"><h1>Nhập câu hỏi</h1>
        <ol className="steps" aria-label="Các bước nhập">
          {['Dán hoặc mở file', 'Chọn vị trí', 'Rà soát', 'Nhập'].map((t, k) => {
            const cur = !rows.length ? 0 : confirm ? 3 : anaDone ? 2 : 1;
            return <li key={t} aria-current={k === cur ? 'step' : undefined} className={k < cur ? 'done' : ''}><b>{k + 1}</b>{t}</li>;
          })}
        </ol>
      </header>
      <div className="simple">
        <div className={`panel${rows.length ? ' is-compact' : ''}`}>
          <h2>Dán mã LaTeX hoặc mở file .tex</h2>
          <span style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
            Mỗi câu nằm trong <span className="mono">\begin{'{ex}'} … \end{'{ex}'}</span>. Câu có sẵn ID dạng <span className="mono">%[2D1H1-1]</span> sẽ tự vào đúng bài và mức độ; câu không có ID dùng vị trí chọn bên dưới. HEdu sẽ so từng câu với ngân hàng và với các câu khác trong file, rồi để bạn quyết định câu nào nhập, câu nào bỏ qua.
          </span>
          <textarea value={src} onChange={(e) => setSrc(e.target.value)} placeholder={'\\begin{ex}%[2D1N1-1]\n  Đề bài ...\n  \\choice\n  {\\True A}{B}{C}{D}\n\\end{ex}'} aria-label="Mã LaTeX cần nhập" spellCheck={false} />
          <div className="head-actions">
            <button type="button" className="btn btn-sm" onClick={() => file.current?.click()}>Mở file .tex</button>
            <button type="button" className="btn btn-sm" onClick={() => toast('Nhập từ Word (.docx có Equation) sẽ có ở bản cài trên Windows.')}>Mở file Word</button>
            <input ref={file} type="file" accept=".tex,.txt" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setSrc(await readFile(f)); e.target.value = ''; }} />
          </div>
        </div>

        {rows.length > 0 && (
          <div className="panel">
            <h2>Vị trí cho câu không có ID</h2>
            <div className="grid2 grid4">
              <label className="lbl">Lớp<select className="sel" value={loc.grade} onChange={(e) => setLoc(firstLocation(Number(e.target.value)))}>{grades().map((g) => <option key={g} value={g}>Lớp {g}</option>)}</select></label>
              <label className="lbl">Chương<select className="sel" value={chapter?.id ?? ''} onChange={(e) => setLoc(firstLocation(loc.grade, e.target.value))}>{chs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label className="lbl">Bài<select className="sel" value={lesson?.id ?? ''} onChange={(e) => setLoc(firstLocation(loc.grade, chapter?.id, e.target.value))}>{(chapter?.lessons ?? []).map((l) => <option key={l.id} value={l.id}>{shortName(l.name)}</option>)}</select></label>
              <label className="lbl">Mức độ<select className="sel" value={level} onChange={(e) => setLevel(e.target.value as Level)}>{LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}</select></label>
            </div>
            {noIdRows.length > 0 && (
              <div className="aid-draft">
                <div className="head-actions">
                  <button type="button" className="btn btn-sm" onClick={runIdSuggest}>{idPicks ? 'Gợi ý lại' : `Gán ID tự động cho ${noIdRows.length} câu không có ID`}</button>
                  {idPicks && <button type="button" className="btn btn-sm" onClick={() => setIdPicks(null)}>Bỏ gợi ý, dùng vị trí chung</button>}
                </div>
                <span className="sys-hint">Tuỳ chọn. Gợi ý Chương/Bài/Dạng trong <b>Lớp {loc.grade}</b> theo các câu đã có trong ngân hàng — không gửi dữ liệu ra ngoài. Câu có %[ID] hợp lệ giữ nguyên ID; mức độ theo ô Mức độ. Mặc định chỉ dùng gợi ý tin cậy cao/vừa, câu còn lại dùng vị trí chung ở trên.</span>
                {idPicks && (
                  <div className="aid-scroll aid-scroll-sm">
                    <table className="aid-table">
                      <thead><tr><th>Câu</th><th>Vị trí sẽ dùng</th><th>Tin cậy</th></tr></thead>
                      <tbody>
                        {[...idPicks.entries()].map(([i, p]) => {
                          const stale = p.latex !== latexOf(i);
                          return (
                            <tr key={i} className={p.formId ? 'is-on' : ''}>
                              <td className="aid-q"><span className="mono">Câu {i + 1}</span><small>dòng {rows[i]?.line}</small></td>
                              <td>
                                {stale ? <span className="aid-none">Câu đã sửa sau khi gợi ý — bấm “Gợi ý lại”</span> : (
                                  <select className="aid-sel" value={p.formId ?? ''} onChange={(e) => setPick(i, e.target.value || null)} aria-label={`Vị trí cho câu ${i + 1}`}>
                                    {optionsOf(p).map((o, k) => { const pl = pickIx?.get(o.formId); return <option key={o.formId} value={o.formId}>{k === 0 ? '★ ' : ''}{pl && pl.chapter && pl.lesson && pl.form ? `${shortName(pl.chapter.name)} › ${shortName(pl.lesson.name)} › ${shortName(pl.form.name)}` : o.formId}</option>; })}
                                    <option value="">— Vị trí chung ở trên —</option>
                                  </select>
                                )}
                                {p.suggestion.notes.map((t) => <small key={t} className="aid-note">{t}</small>)}
                              </td>
                              <td><span className={`aid-conf c-${p.suggestion.confidence}`}>{CONFIDENCE_LABEL[p.suggestion.confidence]}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            <PackagePanel src={text250} blocks={blocks} activeFilter={pkgFilter?.key ?? null} onFilter={(r, key) => setPkgFilter(r ? { rows: r, key } : null)} />
            <h2 style={{ marginTop: 6 }}>Kiểm tra {rows.length} câu trước khi nhập</h2>
            {pkgFilter && <span className="sys-hint">Đang chỉ hiện {pkgFilter.rows.length} câu liên quan tới một gói. Bấm “Hiện lại mọi câu” ở thẻ gói để bỏ lọc.</span>}
            <div className="chk-sum">
              {checking && <span className="chk-pill">Đang kiểm tra {done}/{rows.length}…</span>}
              {!checking && <span className={`chk-pill${nErr ? ' bad' : ' ok'}`}>{nErr ? `${nErr} câu lỗi xem trước` : 'Không câu nào lỗi xem trước'}</span>}
              {nWarn > 0 && <span className="chk-pill warn">{nWarn} câu cần xem lại</span>}
              {nFig > 0 && <span className="chk-pill">{nFig} câu có hình TikZ</span>}
              {(nErr > 0 || nWarn > 0) && (
                <label className="sw" style={{ marginLeft: 'auto' }}>
                  <input type="checkbox" checked={onlyBad} onChange={(e) => setOnlyBad(e.target.checked)} />Chỉ xem câu có vấn đề
                </label>
              )}
            </div>
            {!checking && nErr > 0 && (
              <span className="sys-hint">Câu lỗi vẫn nhập được, nhưng phần xem trước sẽ vỡ cho tới khi bạn sửa. Bấm vào câu để xem lỗi ở đâu.</span>
            )}
            <div className="dup-sum" role="group" aria-label="Rà soát trùng trước khi nhập">
              <div className="chk-sum">
                {anaProg && <span className="chk-pill" role="status">Rà soát trùng: {anaProg.phase} {anaProg.done}/{anaProg.total}…</span>}
                {!anaDone && !anaProg && rows.length > 0 && <span className="chk-pill warn" role="status">Chưa rà soát trùng xong — chưa thể nhập</span>}
                {anaDone && <span className="chk-pill ok">Đã rà soát trùng xong</span>}
              </div>
              {anaDone && (
                <label className="dc-kindsel">Lọc theo kết quả rà soát
                  <select value={statusF} onChange={(e) => setStatusF(e.target.value as typeof statusF)}>
                    {([['all', 'Tất cả', rows.length], ['new', 'Mới', statusCount.new ?? 0], ['sure', 'Trùng chắc', statusCount.sure ?? 0], ['conflict', 'Mâu thuẫn đáp án', statusCount.conflict ?? 0], ['near', 'Có thể trùng', statusCount.near ?? 0], ['template', 'Cùng mẫu khác dữ kiện', statusCount.template ?? 0], ['unread', 'Cần sửa mã', statusCount.unread ?? 0], ['hold', 'Chưa quyết định', sum.holdN]] as [typeof statusF, string, number][]).map(([k, label, n]) => (
                      <option key={k} value={k}>{label} ({n})</option>
                    ))}
                  </select>
                </label>
              )}
              {anaDone && (
                <p className="dup-plan" role="status">
                  Kế hoạch nhập: <b>nhập {sum.importN}</b> · <b>bỏ qua {sum.skipN}</b>{sum.holdN > 0 && <> · <b className="dup-hold">{sum.holdN} câu chưa quyết định</b></>}
                  {sum.keptSuspect > 0 && <> · {sum.keptSuspect} câu nghi trùng được bạn chọn nhập</>}
                </p>
              )}
              {anaDone && sureRows.length > 0 && (
                <div className="head-actions">
                  {!bulkAsk
                    ? <button type="button" className="btn btn-sm" onClick={() => { setStatusF('sure'); setBulkAsk(true); }}>Xem {sureRows.length} câu trùng chắc đang để nhập…</button>
                    : <span className="dup-bulk">Bỏ qua {sureRows.length} câu trùng chắc (đang hiện ở danh sách dưới)?
                        <button type="button" className="btn btn-sm btn-accent" onClick={() => { setUserDec((u) => ({ ...u, ...Object.fromEntries(sureRows.map((i) => [`d${i}`, 'skip' as Decision])) })); setBulkAsk(false); }}>Xác nhận bỏ qua {sureRows.length} câu</button>
                        <button type="button" className="btn btn-sm" onClick={() => setBulkAsk(false)}>Huỷ</button></span>}
                </div>
              )}
            </div>
            {isTikzReady() && (
              <div className="tex-batch">
                <div className="tex-batch-h">
                  <b>Biên dịch thử bằng TeX Live</b>
                  <span>Xem trước ở trên là HEdu tự dựng. Chỉ khi TeX Live biên dịch được thì câu mới chắc chắn in ra đúng.</span>
                </div>
                <div className="head-actions">
                  {!texRun
                    ? <button type="button" className="btn btn-sm" disabled={!rows.length || checking} onClick={startTex}>{texDone ? 'Biên dịch lại' : `Biên dịch thử ${rows.length} câu`}</button>
                    : <button type="button" className="btn btn-sm" onClick={stopTex}>Dừng</button>}
                  <label className="sw"><input type="checkbox" checked={texSol} disabled={texRun} onChange={(e) => setTexSol(e.target.checked)} />Gồm đáp án và lời giải</label>
                  {texFail.length > 0 && <label className="sw"><input type="checkbox" checked={texOnlyBad} onChange={(e) => setTexOnlyBad(e.target.checked)} />Chỉ câu biên dịch lỗi</label>}
                </div>
                {texDone > 0 && (
                  <div className="chk-sum">
                    <span className="chk-pill">{texRun ? 'Đang biên dịch' : 'Đã biên dịch'} {texDone}/{rows.length}</span>
                    <span className="chk-pill ok">{texDone - texFail.length} câu đạt</span>
                    {CATEGORY_ORDER.filter((c) => texByCat[c]).map((c) => (
                      <span key={c} className="chk-pill bad">{texByCat[c]} câu: {texFail.find((x) => x.fail.category === c)!.fail.label}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
            <ol className="chk-list">
              {shownRows.slice(0, limit).map(({ r, i }) => (
                <li key={i} className={`chk-row l-${worstOf(i) ?? 'sach'} dec-${decOf(i)}`}>
                  <div className="chk-line">
                  <button type="button" className="chk-head" aria-expanded={openRow === i} onClick={() => setOpenRow(openRow === i ? null : i)}>
                    <span className="chk-n" title={`Bắt đầu ở dòng ${r.line} của file`}>{i + 1}</span>
                    <b>{TYPE_LABEL[r.p.type]}</b>
                    <span className="mono">{r.fromId ? questionCode(r.fromId.loc, r.fromId.level) : r.p.idComment ? `%[${r.p.idComment}] không hợp lệ` : idPicks && draftLocOf(i).suggested ? `${questionCode(draftLocOf(i).loc, level)} (gợi ý)` : 'không ID'}</span>
                    <span className="chk-stem">{r.p.stem.replace(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g, '[hình]').replace(/\s+/g, ' ').slice(0, 70)}</span>
                    {anaDone && statusOf(i).key !== 'new' && <span className={`chk-tag dup d-${statusOf(i).key}`}>{statusOf(i).label}{(ana!.rows[i]?.hits.length ?? 0) > 0 ? ` · ${ana!.rows[i]!.hits.length}` : ''}</span>}
                    {edits[i] != null && <span className="chk-tag tin">đã sửa tại chỗ</span>}
                    {tex[i] && <span className={`chk-tag ${tex[i].ok ? 'tin' : 'loi'}`}>{tex[i].ok ? 'TeX đạt' : `TeX: ${(tex[i] as { fail: Failure }).fail.label}`}</span>}
                    {worstOf(i) && <span className={`chk-tag ${worstOf(i)}`}>{worstOf(i) === 'tin' ? 'có hình' : LEVEL_TEXT[worstOf(i)!]}</span>}
                  </button>
                  <label className="dec-sel">
                    <span className="sr-only">Quyết định cho câu {i + 1}</span>
                    <select value={decOf(i)} disabled={!anaDone} onChange={(e) => setDec(i, e.target.value as Decision)} aria-label={`Quyết định cho câu ${i + 1}`}>
                      <option value="import">Nhập</option>
                      <option value="skip">Bỏ qua</option>
                      <option value="hold" disabled>{anaDone ? 'Chưa quyết định' : 'Chờ rà soát…'}</option>
                    </select>
                  </label>
                  </div>
                  {openRow === i && isTikzReady() && (
                    <div className="chk-tex">
                      {exactRow === i
                        ? <CompiledView latex={r.latex} solution={texSol} onBack={() => setExactRow(null)} />
                        : <>
                            {tex[i] && !tex[i].ok && <FailureBox fail={(tex[i] as { fail: Failure }).fail} />}
                            <button type="button" className="btn btn-sm" onClick={() => setExactRow(i)}>Xem chuẩn câu này</button>
                          </>}
                    </div>
                  )}
                  {openRow === i && anaDone && (ana!.rows[i]?.hits.length ?? 0) > 0 && (
                    <div className="dup-hits">
                      <b>Giống với:</b>
                      <ul>
                        {ana!.rows[i]!.hits.map((h, k) => (
                          <li key={k}>
                            <span className={`dc-kind k-${h.kind}`}>{DUP_KIND_LABEL[h.kind]}</span> {hitLabel(h)} · tương đồng {Math.round(h.result.score * 100)}%
                            <button type="button" className="btn btn-sm" aria-pressed={cmpKey === `${i}:${k}`} onClick={() => setCmpKey(cmpKey === `${i}:${k}` ? null : `${i}:${k}`)}>{cmpKey === `${i}:${k}` ? 'Ẩn so sánh' : 'So sánh'}</button>
                          </li>
                        ))}
                      </ul>
                      {(() => {
                        const m = /^(\d+):(\d+)$/.exec(cmpKey ?? '');
                        if (!m || Number(m[1]) !== i) return null;
                        const h = ana!.rows[i]!.hits[Number(m[2])];
                        if (!h) return null;
                        let other: { title: string; latex: string; actions?: ReactNode } | null = null;
                        if (h.with === 'bank') { const q = questions.find((x) => x.uid === h.other); if (q) other = { title: `Câu ${seqLabel(q.seq)} trong kho`, latex: q.latex, actions: <button type="button" className="btn btn-sm" onClick={() => setOpenBank(q.uid)}>Mở câu trong kho</button> }; }
                        else { const j = draftIds.get(h.other); if (j != null) other = { title: `Câu ${j + 1} trong file`, latex: latexOf(j) }; }
                        if (!other) return <p className="sys-hint">Câu này không còn trong ngân hàng (có thể vừa bị xoá).</p>;
                        return (
                          <PairCompare
                            A={{ title: `Câu mới ${i + 1}`, latex: latexOf(i), actions: <button type="button" className="btn btn-sm" onClick={() => setEditRow(editRow === i ? null : i)}>{editRow === i ? 'Xong sửa' : 'Sửa câu mới'}</button> }}
                            B={other} result={h.result}
                            note={<p className="dc-sc">Chỉ so sánh để bạn quyết định. HEdu không tự sửa hay xoá câu nào.</p>}
                          />
                        );
                      })()}
                    </div>
                  )}
                  {openRow === i && editRow === i && (
                    <div className="dup-edit">
                      <label className="lbl">Sửa câu mới (chỉ áp dụng cho lần nhập này, không đổi ô dán ở trên)
                        <textarea value={latexOf(i)} onChange={(e) => setEdits((c) => ({ ...c, [i]: e.target.value }))} spellCheck={false} aria-label={`Mã LaTeX câu mới ${i + 1}`} />
                      </label>
                      {edits[i] != null && <button type="button" className="btn btn-sm" onClick={() => setEdits((c) => { const n = { ...c }; delete n[i]; return n; })}>Khôi phục bản gốc</button>}
                    </div>
                  )}
                  {openRow === i && (issues[i]?.length ?? 0) > 0 && (
                    <ul className="chk-why">
                      {issues[i]!.map((it: Issue, k: number) => (
                        <li key={k} className={it.level}>
                          <span>{it.message}</span>
                          {it.detail && <code>{it.detail}</code>}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
            {shownRows.length > limit && (
              <div className="head-actions">
                <span className="sys-hint">Đang hiện {limit} trong {shownRows.length} câu.</span>
                <button type="button" className="btn btn-sm" onClick={() => setLimit(limit + 200)}>Hiện thêm 200 câu</button>
                <button type="button" className="btn btn-sm" onClick={() => setLimit(shownRows.length)}>Hiện hết</button>
              </div>
            )}
            {saveErr && (
              <div className="dup-err" role="alert">
                <b>Chưa ghi được dữ liệu.</b> {saveErr}
                <div className="head-actions"><button type="button" className="btn btn-sm btn-accent" onClick={retrySave}>Thử ghi lại</button></div>
              </div>
            )}
            <div className="head-actions imp-bar">
              <button type="button" className="btn btn-accent" disabled={!canImport || !!saveErr} onClick={() => setConfirm(true)}>
                {checking || !anaDone ? 'Đang kiểm tra…' : sum.holdN > 0 ? `Còn ${sum.holdN} câu cần quyết định` : `Nhập ${importCount} câu vào ngân hàng`}
              </button>
              {anaDone && sum.holdN > 0 && <button type="button" className="btn btn-sm" onClick={() => setStatusF('hold')}>Xem các câu chưa quyết định</button>}
            </div>
            {confirm && (
              <div className="qe-confirm qe-modal" role="alertdialog" aria-modal="true" aria-label="Xác nhận nhập">
                <b>Sẽ nhập {sum.importN} câu, bỏ qua {sum.skipN} câu.</b>
                {sum.keptSuspect > 0 && <p>Trong số nhập có {sum.keptSuspect} câu HEdu đánh dấu nghi trùng mà bạn đã chọn giữ{sum.keptPairs > 0 ? `, trong đó ${sum.keptPairs} cặp trùng nhau ngay trong file sẽ được nhập cả hai` : ''}.</p>}
                <p>HEdu sẽ rà soát lại với ngân hàng ngay trước khi ghi. Không câu nào trong ngân hàng bị sửa hay xoá.</p>
                <div className="head-actions">
                  <button type="button" className="btn btn-accent" autoFocus onClick={commit}>Nhập {sum.importN} câu</button>
                  <button type="button" className="btn" onClick={() => setConfirm(false)}>Quay lại</button>
                </div>
              </div>
            )}
            {openBank && questions.find((q) => q.uid === openBank) && <QuestionDrawer q={questions.find((q) => q.uid === openBank)!} onClose={() => setOpenBank(null)} onDirty={() => undefined} />}
          </div>
        )}
      </div>
    </>
  );
}
