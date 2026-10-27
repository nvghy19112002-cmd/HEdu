// Màn Nhập liệu: dán hoặc mở file LaTeX, xem trước rồi nhập hàng loạt vào ngân hàng.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CompiledView, FailureBox } from '../components/CompiledView';
import { compileBatch, CATEGORY_ORDER, type Category, type Failure } from '../lib/xemchuan';
import { isTikzReady } from '../lib/tikz';
import { useApp } from '../app-context';
import { PackagePanel } from '../components/PackagePanel';
import { chapters, firstLocation, getTaxonomy, grades, useTaxonomy } from '../lib/curriculum';
import { indexOf, shortName } from '../lib/taxonomy';
import { idFromLatex, idStateOf, summarizeImportIds } from '../lib/importid';
import { LATEX_ID_LABEL, placeWithId, readLatexId } from '../lib/idsync';
import { BATCH_MAX, buildRows, defaultBatchName, perFile, tagsFor, type BatchInfo, type ImportSource } from '../lib/importbatch';
import { chooseFiles, chooseFolder, describeScan, IMPORT_LIMITS, readAll, scanSources } from '../lib/importfiles';
import { isDesktop } from '../lib/platform';
import { BIG_OP, ensureRestorePoint } from '../lib/dbbackup';
import { draftLocation, optionsOf, suggestDrafts, useByDefault, type DraftIdPick } from '../lib/iddraft';
import { examplesFor, mergeAi, type GanIdRun } from '../lib/ai/tasks/ganidrun';
import { AiAskBar } from '../components/AiAskBar';
import { CONFIDENCE_LABEL, IdSuggester } from '../lib/idsuggest';
import { taxRevision } from '../lib/taxpath';
import { idRowsOf, planDrafts, readIds } from '../lib/importplan';
import { effectiveOf, flushIdReview, getRec, makeRec, putRecs, useIdReview } from '../lib/idreview';
import { decide, effectiveDecision, isFresh, summarizeVerify, usableDecision, verificationSig, verifierFor, verifyId, VERDICT_LABEL, type IdChoice, type IdDecision, type IdVerification, type LevelChoice } from '../lib/idverify';
import { checkQuestion, LEVEL_TEXT, worstLevel, type Issue } from '../lib/check';
import { DUP_KIND_LABEL, type DupKind } from '../lib/dup2';
import { analyzeDrafts, bankHitSignature, BLOCKING, defaultDecisions, summarize, type AnalyzeResult, type Decision, type DraftHit } from '../lib/dupimport';
import { PairCompare } from '../components/PairCompare';
import { QuestionDrawer } from '../components/QuestionDrawer';
import { seqLabel } from '../lib/id';
import { parseExTest, splitExBlocksAt } from '../lib/extest';
import { questionCode } from '../lib/id';
import { emptyFilters } from '../lib/bankfilter';
import { saveSession } from '../lib/banksession';
import { DEFAULT_SORT } from '../lib/qsort';
import { ImportReportView } from '../components/ImportReportView';
import { appendLog, buildReport, type IdPlace, type ImportReport, type ReportRow } from '../lib/importreport';
import { addMany, flushSave, getState, isLastSaveOk, useBank, type Draft } from '../lib/store';
import { LEVEL_LABEL, LEVELS, TYPE_LABEL, type Level, type Location } from '../lib/types';

function readFile(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(file, 'utf-8'); });
}

export function ImportScreen() {
  const { go, toast } = useApp();
  const { questions } = useBank();
  // Cây đổi ⇒ vẽ lại và đọc lại ID theo cây MỚI (ID từng hợp lệ có thể không còn hợp lệ)
  const taxNow = useTaxonomy().tax;
  const taxRevNow = taxRevision(taxNow);
  const reviewVer = useIdReview();
  const taxIx = useMemo(() => indexOf(taxNow), [taxNow]);
  /** Trạng thái xác minh CÓ HIỆU LỰC của câu trong ngân hàng (căn cứ kiểm chứng không lấy câu chưa phân loại / cần xem lại). */
  const effOf = (q: (typeof questions)[number]) => effectiveOf(q, getRec(q.uid), { ix: taxIx, taxRev: taxRevNow });
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

  // ---- Nhiều nguồn (PR N2): nhiều tệp / thư mục; không có nguồn nào ⇒ dùng đoạn dán như cũ ----
  const [srcs, setSrcs] = useState<(ImportSource & { bytes: number })[]>([]);
  const [skip, setSkip] = useState<ReadonlySet<number>>(new Set()); // tệp bị bỏ tick (không nhập)
  const [scanInfo, setScanInfo] = useState<string[]>([]);
  const [readFailed, setReadFailed] = useState<{ name: string; rel: string; message: string }[]>([]);
  const [loadProg, setLoadProg] = useState<{ done: number; total: number; phase: string } | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const loadStop = useRef(false);
  const [result, setResult] = useState<{ report: ImportReport; logSaved: boolean } | null>(null);
  const [fileF, setFileF] = useState<number | 'all'>('all');
  const [info, setInfo] = useState<BatchInfo>(() => ({ name: defaultBatchName(new Date()), tagFile: true, tagBatch: true, tagFolder: false, extra: '' }));
  const multi = srcs.length > 0;
  const allSources = useMemo<ImportSource[]>(() => (srcs.length ? srcs : [{ name: '', rel: '', text: text250 }]), [srcs, text250]);
  const allRows = useMemo(() => buildRows(allSources), [allSources]);
  const usedRows = useMemo(() => (skip.size ? allRows.filter((r) => !skip.has(r.srcIdx)) : allRows), [allRows, skip]);
  /** lô quá lớn: chưa rà trùng/nhập; giáo viên bỏ tick bớt tệp hoặc chia lô */
  const tooBig = usedRows.length > BATCH_MAX;
  const rows = useMemo(() => (tooBig ? [] : usedRows), [tooBig, usedRows]);
  const fileStats = useMemo(() => perFile(allRows, allSources), [allRows, allSources, taxRevNow]); // eslint-disable-line react-hooks/exhaustive-deps
  /** khoá của lô hiện tại: đổi nguồn/tick tệp ⇒ làm lại rà soát từ đầu */
  const batchKey = useMemo(() => (multi ? `f|${srcs.map((s) => `${s.name}:${s.text.length}`).join('|')}|${[...skip].sort().join(',')}` : `p|${text250}`), [multi, srcs, skip, text250]);
  const clearAll = () => { setSrc(''); setSrcs([]); setSkip(new Set()); setScanInfo([]); setReadFailed([]); setFileF('all'); setLoadErr(null); };

  const loadPaths = async (paths: string[]) => {
    if (!paths.length || loadProg) return;
    setLoadErr(null); setScanInfo([]); setReadFailed([]);
    loadStop.current = false;
    setLoadProg({ done: 0, total: 0, phase: 'Đang quét tệp' });
    try {
      const sc = await scanSources(paths);
      const lines = describeScan(sc);
      setLoadProg({ done: 0, total: sc.files.length, phase: 'Đang đọc tệp' });
      const r = await readAll(sc.files, { onProgress: (done, total) => setLoadProg({ done, total, phase: 'Đang đọc tệp' }), shouldStop: () => loadStop.current });
      if (r.cancelled) lines.push('Đã dừng đọc theo yêu cầu; chỉ lấy các tệp đã đọc xong.');
      if (!r.read.length) { setLoadErr(r.failed.length ? 'Không đọc được tệp nào (xem lý do bên dưới).' : 'Không có tệp .tex/.txt nào để đọc.'); }
      setScanInfo(lines);
      setReadFailed(r.failed.map((x) => ({ name: x.file.name, rel: x.file.rel, message: x.message })));
      if (r.read.length) { setSrcs(r.read.map((x) => ({ name: x.file.name, rel: x.file.rel, text: x.text, bytes: x.file.bytes }))); setSkip(new Set()); setFileF('all'); setInfo((i) => ({ ...i, name: defaultBatchName(new Date()) })); }
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e));
    }
    setLoadProg(null);
  };

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
  useEffect(() => { setEdits({}); setUserDec({}); setCmpKey(null); setEditRow(null); setConfirm(false); setSaveErr(null); setBulkAsk(false); setIdPicks(null); setIdDecs({}); setOnlyIdBD(false); }, [batchKey]);
  // Gán ID tự động cho câu không có %[ID] hợp lệ (chỉ metadata bản nháp; đổi lớp đích ⇒ gợi ý cũ bỏ)
  const [idPicks, setIdPicks] = useState<Map<number, DraftIdPick> | null>(null);
  /** câu mà AI không đủ căn cứ chọn Dạng: cần giáo viên chọn, nếu không sẽ vào vị trí chung (phải xác nhận trước khi nhập) */
  const [refused, setRefused] = useState<ReadonlySet<number>>(new Set());
  const [ackRefused, setAckRefused] = useState(false);
  useEffect(() => { if (!idPicks) setRefused(new Set()); }, [idPicks]);
  useEffect(() => { setIdPicks(null); }, [loc.grade, taxRevNow]);
  const pickIx = useMemo(() => (idPicks ? indexOf(getTaxonomy()) : null), [idPicks]);
  /** Hỏi AI cho các câu đang có gợi ý (câu không có ID): AI dẫn đầu, gợi ý ngân hàng làm bằng chứng. */
  const draftAiJobs = () => {
    const bank = new Map(getState().questions.map((q) => [q.uid, q]));
    return [...(idPicks ?? new Map<number, DraftIdPick>()).entries()].filter(([i, p]) => p.latex === latexOf(i)).map(([i, p]) => ({ key: String(i), latex: p.latex, grade: loc.grade, examples: examplesFor(p.suggestion, bank) }));
  };
  const onDraftAi = (run: GanIdRun) => setIdPicks((m) => {
    if (!m) return m;
    const n = new Map(m);
    for (const [i, p] of m) {
      const ai = run.results.get(String(i));
      if (!ai) continue;
      const mg = mergeAi(p.suggestion, ai);
      const merged = mg.suggestion;
      n.set(i, { ...p, suggestion: merged, formId: useByDefault(merged.confidence) ? merged.best?.formId ?? null : null });
      setRefused((r) => { const x = new Set(r); if (mg.verdict === 'ai-khong-chac') x.add(i); else x.delete(i); return x; });
    }
    return n;
  });
  const latexOf = (i: number) => edits[i] ?? rows[i]?.latex ?? '';
  /** Câu có Dạng đề xuất (★) mà chưa được chọn — để giáo viên nhận cả loạt bằng MỘT thao tác chủ động (không tự tick). */
  const pendingPicks = [...(idPicks ?? new Map<number, DraftIdPick>()).entries()].filter(([i, p]) => !p.formId && !!p.suggestion.best && p.latex === latexOf(i)).length;
  const acceptAllPicks = () => setIdPicks((m) => {
    if (!m) return m;
    const n = new Map(m);
    for (const [i, p] of m) if (!p.formId && p.suggestion.best && p.latex === latexOf(i)) n.set(i, { ...p, formId: p.suggestion.best.formId });
    return n;
  });
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
  useEffect(() => { stopRef.current.stop = true; setTex({}); setTexRun(false); setExactRow(null); }, [batchKey]);
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
  useEffect(() => { setPkgFilter(null); setLimit(200); setFileF('all'); }, [batchKey]);
  // Kiểm chứng ID có sẵn (PR 1B): trạng thái phải khai báo trước danh sách hiển thị
  const [verifs, setVerifs] = useState<ReadonlyMap<number, IdVerification>>(new Map());
  const [idDecs, setIdDecs] = useState<Record<number, IdDecision>>({});
  const [onlyIdBD, setOnlyIdBD] = useState(false);
  const verifOf = (i: number): IdVerification | undefined => { const v = verifs.get(i); return v && isFresh(v, latexOf(i), taxRevNow) ? v : undefined; };
  /** Quyết định của giáo viên còn hiệu lực: đúng câu, đúng kết quả kiểm (gợi ý + cây) đã xem; không thì phải chọn lại. */
  const idDecOf = (i: number): IdDecision | undefined => effectiveDecision(verifOf(i), idDecs[i]);
  const setChoice = (i: number, choice: IdChoice) => setIdDecs((m) => { const n = { ...m }; const v = verifOf(i); if (v) n[i] = decide(v, choice, m[i] && usableDecision(v, m[i]) ? m[i].level : 'giu'); else delete n[i]; return n; });
  const setLevelChoice = (i: number, lv: LevelChoice) => setIdDecs((m) => { const v = verifOf(i); const d = m[i]; if (!v || !d || !usableDecision(v, d)) return m; return { ...m, [i]: { ...d, level: lv } }; });
  const shownRows = rows
    .map((r, i) => ({ r, i }))
    .filter(({ i }) => !onlyBad || worstOf(i) === 'loi' || worstOf(i) === 'canh')
    .filter(({ r }) => fileF === 'all' || r.srcIdx === fileF)
    .filter(({ i }) => !onlyIdBD || verifOf(i)?.verdict === 'bat-dong')
    .filter(({ i }) => !pkgFilter || pkgFilter.rows.includes(i))
    .filter(({ i }) => !texOnlyBad || tex[i]?.ok === false)
    .filter(({ i }) => statusF === 'all' || (statusF === 'hold' ? decOf(i) === 'hold' : statusOf(i).key === statusF));

  const chs = chapters(loc.grade);
  const chapter = chs.find((c) => c.id === loc.chapterId) ?? chs[0];
  const lesson = chapter?.lessons.find((l) => l.id === loc.lessonId) ?? chapter?.lessons[0];

  const importCount = sum.importN;
  // ID đọc theo cây HIỆN TẠI cho từng câu (không dùng kết quả đọc cũ lưu trong dòng của lô): cây đổi ⇒ đọc lại
  const idInfo = useMemo(() => readIds(rows.map((r, i) => edits[i] ?? r.latex), taxNow), [rows, edits, taxNow]);
  const fromIdOf = (i: number) => idInfo[i] ?? null;
  const noIdRows = rows.map((_, i) => i).filter((i) => !fromIdOf(i));
  // ---- Kiểm chứng ID có sẵn (PR 1B, quy tắc 15a): ID trong tệp chỉ là bằng chứng cần kiểm chứng, đối chiếu với ngân hàng ----
  const idRows = useMemo(() => idRowsOf(idInfo), [idInfo]);
  const suggesterRef = useRef<{ q: typeof questions; tax: ReturnType<typeof getTaxonomy>; rv: number; s: IdSuggester } | null>(null);
  useEffect(() => {
    setVerifs(new Map());
    if (!idRows.length) return;
    let stop = false;
    const acc = new Map<number, IdVerification>();
    let k = 0;
    const step = () => {
      if (stop) return;
      const tax = taxNow;
      const c = suggesterRef.current;
      const sg = c && c.q === questions && c.tax === tax && c.rv === reviewVer ? c.s : verifierFor(tax, questions, effOf);
      suggesterRef.current = { q: questions, tax, rv: reviewVer, s: sg };
      const until = Math.min(k + 20, idRows.length);
      for (; k < until; k++) {
        const i = idRows[k];
        const latex = edits[i] ?? rows[i].latex;
        const id = idInfo[i];
        if (id) acc.set(i, verifyId(latex, id.loc, sg, `d${i}`));
      }
      setVerifs(new Map(acc));
      if (k < idRows.length) setTimeout(step, 0);
    };
    const t = setTimeout(step, 0);
    return () => { stop = true; clearTimeout(t); };
  }, [idRows, questions, taxNow, reviewVer]); // eslint-disable-line react-hooks/exhaustive-deps
  const vsum = summarizeVerify(idRows, verifOf, idDecOf, (i) => decOf(i) === 'import');
  const canImport = anaDone && !checking && sum.holdN === 0 && importCount > 0 && vsum.unchecked === 0;
  /** Câu có ID nhưng không dùng được: "%[2D1H1] — Mã thiếu Dạng" (lý do từ bộ đọc chung). */
  const headIdNote = (latex: string): string | null => {
    const r = readLatexId(latex, getTaxonomy());
    return r.raw && r.state !== 'hop-le' ? `%[${r.raw}] — ${LATEX_ID_LABEL[r.state]}` : null;
  };
  const runIdSuggest = () => {
    const tax = getTaxonomy();
    setIdPicks(suggestDrafts(noIdRows.map((i) => ({ index: i, latex: latexOf(i) })), new IdSuggester(tax, getState().questions), loc.grade));
  };
  const setPick = (i: number, formId: string | null) => { if (formId) setRefused((r) => { if (!r.has(i)) return r; const x = new Set(r); x.delete(i); return x; }); setIdPicks((m) => { if (!m?.has(i)) return m; const n = new Map(m); n.set(i, { ...m.get(i)!, formId }); return n; }); };
  /** Vị trí của câu không có ID: gợi ý đã chọn (nếu còn hợp lệ) hoặc vị trí chung. */
  const draftLocOf = (i: number) => { const tax = getTaxonomy(); return draftLocation(idPicks?.get(i), latexOf(i), indexOf(tax), taxRevision(tax), loc); };
  /** Dựng bản ghi sẽ lưu theo cây HIỆN TẠI (logic ở importplan.ts, có test). Không ghi được nhất quán ⇒ lỗi, không ghi gì. */
  const buildDrafts = (verOf: (i: number) => IdVerification | undefined) => planDrafts({
    latexes: rows.map((_, i) => latexOf(i)), importing: (i) => decOf(i) === 'import', ids: idInfo, ver: verOf, decision: (i) => idDecs[i],
    noId: (i) => draftLocOf(i), commonLoc: loc, commonLevel: level, tags: (i) => tagsFor(rows[i], info), tax: taxNow,
  });
  /** Câu sẽ nhập mà AI từ chối chọn Dạng và giáo viên chưa chọn ⇒ sẽ vào vị trí chung: phải xác nhận rõ */
  const idSum = summarizeImportIds(rows.map((_r, i) => idStateOf(latexOf(i))), (i) => decOf(i) === 'import', (i) => draftLocOf(i).suggested);
  /** Báo cáo của lô vừa nhập (dựng ngay sau addMany, trước khi xoá nội dung đang xem). */
  const pendingReport = useRef<ImportReport | null>(null);
  const makeReport = (added: { uid: string; seq: number }[], restorePoint: boolean): ImportReport => {
    let k = 0;
    const rr: ReportRow[] = rows.map((r, i) => {
      const dec = decOf(i);
      const st = idStateOf(latexOf(i));
      const key = statusOf(i).key;
      const vv = st === 'ok' ? verifOf(i) : undefined;
      const idPlaceOk: IdPlace = vv?.verdict === 'khop' ? 'ma-khop' : vv?.verdict === 'bat-dong' ? (idDecOf(i)?.choice === 'goi-y' ? 'ai' : idDecOf(i)?.choice === 'chung' ? 'vi-tri-chung' : idDecOf(i)?.choice === 'giu' ? 'ma-giu-tay' : 'ma-cho') : 'ma-chua-kiem-chung';
      const place: IdPlace | undefined = dec !== 'import' ? undefined : st === 'ok' ? idPlaceOk : draftLocOf(i).suggested ? 'ai' : 'vi-tri-chung';
      const q = dec === 'import' ? added[k++] : undefined;
      const w = issues[i] ? worstLevel(issues[i]!) : null;
      return {
        file: r.file, rel: r.rel, line: r.line, decision: dec === 'import' ? 'import' : ['sure', 'near', 'conflict'].includes(key) ? 'skip-dup' : 'skip-user',
        reason: dec === 'import' ? (key === 'new' ? 'Mới' : ['sure', 'near', 'conflict'].includes(key) ? statusOf(i).label + ' (bạn giữ lại)' : statusOf(i).label) : statusOf(i).label,
        idState: st, idPlace: place, preview: w === 'loi' || w === 'canh' ? w : '', tex: tex[i] ? (tex[i].ok ? 'ok' : 'loi') : '', uid: q?.uid, seq: q?.seq,
      };
    });
    const rep = buildReport({ at: Date.now(), name: info.name, batchTag: info.tagBatch && info.name.trim() ? `Lô: ${info.name}` : undefined, paste: !multi, restorePoint, rows: rr, warnings: readFailed.map((f) => `Không đọc được tệp ${f.rel ? f.rel + '/' : ''}${f.name}: ${f.message}`) });
    pendingReport.current = rep;
    return rep;
  };
  const finish = async (report: ImportReport | null) => {
    if (!report) { clearAll(); go({ screen: 'bank' }); return; }
    const logSaved = await appendLog(report);
    clearAll();
    setResult({ report, logSaved });
  };
  /** Bước cuối: rà soát LẠI theo kho hiện hành (chống kho đổi sau lúc xem), rồi mới ghi. */
  const commit = async () => {
    setConfirm(false);
    if (!ana || vsum.unchecked > 0) return;
    if (taxRevision(getTaxonomy()) !== taxRevNow) { toast('Cây chương trình vừa đổi nên HEdu đã đọc lại ID theo cây mới. Xem lại rồi bấm Nhập một lần nữa.'); return; }
    const fresh = await analyzeDrafts(drafts, getState().questions);
    if (!fresh.complete || bankHitSignature(fresh.rows) !== bankHitSignature(ana.rows)) {
      setAna(fresh);
      toast('Ngân hàng vừa có thay đổi nên HEdu đã rà soát lại. Xem lại các câu nghi trùng rồi bấm Nhập một lần nữa.');
      return;
    }
    // Kiểm chứng ID LẠI ngay trước khi ghi (kho, cây hoặc câu có thể đã đổi): dấu kết quả phải trùng với lúc giáo viên xem và quyết định.
    const tax = getTaxonomy();
    const sg = verifierFor(tax, getState().questions, effOf);
    const freshVer = new Map<number, IdVerification>();
    for (const i of idRows) { const lx = latexOf(i); const id = idFromLatex(lx, tax); if (id) freshVer.set(i, verifyId(lx, id.loc, sg, `d${i}`)); }
    const moved = idRows.filter((i) => decOf(i) === 'import' && (!freshVer.get(i) || !verifOf(i) || verificationSig(freshVer.get(i)!) !== verificationSig(verifOf(i)!)));
    if (moved.length) {
      setVerifs(freshVer);
      toast(`Ngân hàng hoặc cây chương trình vừa đổi nên kết quả kiểm chứng ID của ${moved.length} câu đã thay đổi. HEdu đã kiểm lại: xem lại các câu bất đồng (quyết định cũ của bạn cho các câu đó bị bỏ) rồi bấm Nhập một lần nữa.`);
      return;
    }
    const built = buildDrafts((i) => freshVer.get(i));
    if ('error' in built) { toast(`Chưa ghi gì. ${built.error}`); return; }
    // SQLite: nhập hàng loạt (từ 20 câu) tự chụp điểm khôi phục trước; không chụp được thì KHÔNG nhập
    const rp = await ensureRestorePoint('nhap-hang-loat', sum.importN >= BIG_OP);
    if (!rp.ok) { setSaveErr(null); toast(rp.message); return; }
    const added = addMany(built.drafts);
    // Trạng thái xác minh (tệp phụ). Thiếu/ghi lỗi chỉ làm câu thành "chưa xác minh" (an toàn), không làm sai dữ liệu câu.
    putRecs(added.map((qq, k) => [qq.uid, makeRec(qq, { form: built.meta[k].form, src: built.meta[k].src, taxRev: taxRevNow, unclassified: built.meta[k].unclassified, ...(built.meta[k].why ? { why: built.meta[k].why } : {}), ...(built.meta[k].orig ? { orig: built.meta[k].orig } : {}), ...(built.meta[k].prop ? { prop: built.meta[k].prop } : {}) })] as const));
    const report = makeReport(added, rp.taken);
    await flushSave();
    const reviewSaved = await flushIdReview();
    if (!reviewSaved) toast('Đã nhập câu, nhưng chưa lưu được trạng thái xác minh ID: các câu này sẽ hiện là “chưa xác minh”.');
    if (!isLastSaveOk()) {
      setSaveErr(`Đã đưa ${added.length} câu vào ngân hàng trong phiên này nhưng CHƯA ghi được xuống đĩa. Đừng đóng app. Nội dung dán vẫn được giữ lại; các câu đã thêm sẽ hiện là “trùng chắc”, nên thử lại không bị nhân đôi.`);
      return;
    }
    toast(`Đã nhập ${added.length} câu, bỏ qua ${sum.skipN} câu.`);
    finish(report);
  };
  const retrySave = async () => { await flushSave(); if (isLastSaveOk()) { setSaveErr(null); toast('Đã ghi xuống đĩa.'); finish(pendingReport.current); } };
  const setDec = (i: number, d: Decision) => setUserDec((u) => ({ ...u, [`d${i}`]: d }));
  const sureRows = rows.map((_, i) => i).filter((i) => statusOf(i).key === 'sure' && decOf(i) !== 'skip');
  const hitLabel = (h: DraftHit): string => {
    if (h.with === 'bank') { const q = questions.find((x) => x.uid === h.other); return `Câu ${q ? seqLabel(q.seq) : '(đã xoá)'} trong ngân hàng`; }
    const j = draftIds.get(h.other); return `Câu ${j != null ? j + 1 : '?'} trong ${j != null && multi ? `tệp ${rows[j].file}` : 'file'}${j != null ? ` (dòng ${rows[j].line})` : ''}`;
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
      {result && <div className="simple"><ImportReportView report={result.report} full logSaved={result.logSaved} onBank={() => { setResult(null); go({ screen: 'bank' }); }} onShowBatch={result.report.batchTag ? () => { saveSession({ f0: { ...emptyFilters(), tag: result.report.batchTag! }, text: '', wide: false, sort: DEFAULT_SORT, page: 0 }); setResult(null); go({ screen: 'bank' }); } : undefined} onClose={() => setResult(null)} /></div>}
      {!result && <div className="simple">
        <div className={`panel${rows.length ? ' is-compact' : ''}`}>
          <h2>Dán mã LaTeX hoặc mở file .tex</h2>
          <span style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
            Mỗi câu nằm trong <span className="mono">\begin{'{ex}'} … \end{'{ex}'}</span>. Câu có sẵn ID dạng <span className="mono">%[2D1H1-1]</span> sẽ tự vào đúng bài và mức độ; câu không có ID dùng vị trí chọn bên dưới. HEdu sẽ so từng câu với ngân hàng và với các câu khác trong file, rồi để bạn quyết định câu nào nhập, câu nào bỏ qua.
          </span>
          {!multi && <textarea value={src} onChange={(e) => setSrc(e.target.value)} placeholder={'\\begin{ex}%[2D1N1-1]\n  Đề bài ...\n  \\choice\n  {\\True A}{B}{C}{D}\n\\end{ex}'} aria-label="Mã LaTeX cần nhập" spellCheck={false} />}
          <div className="head-actions">
            {isDesktop() && <button type="button" className="btn btn-sm btn-accent" disabled={!!loadProg} onClick={() => { void chooseFiles().then(loadPaths); }}>Chọn nhiều tệp…</button>}
            {isDesktop() && <button type="button" className="btn btn-sm btn-accent" disabled={!!loadProg} onClick={() => { void chooseFolder().then((d) => (d ? loadPaths([d]) : undefined)); }}>Chọn thư mục…</button>}
            {multi && <button type="button" className="btn btn-sm" disabled={!!loadProg} onClick={clearAll}>Bỏ các tệp, quay lại dán trực tiếp</button>}
            <button type="button" className="btn btn-sm" onClick={() => file.current?.click()}>Mở file .tex</button>
            <button type="button" className="btn btn-sm" onClick={() => toast('Nhập từ Word (.docx có Equation) sẽ có ở bản cài trên Windows.')}>Mở file Word</button>
            <input ref={file} type="file" accept=".tex,.txt" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setSrc(await readFile(f)); e.target.value = ''; }} />
          </div>
          {loadProg && (
            <div className="chk-sum">
              <span className="chk-pill" role="status">{loadProg.phase}{loadProg.total ? ` ${loadProg.done}/${loadProg.total}` : ''}…</span>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => { loadStop.current = true; }}>Dừng</button>
            </div>
          )}
          {loadErr && <div className="note bad" role="alert"><div className="note-body"><b>Chưa nạp được tệp</b><span>{loadErr}</span></div></div>}
          {scanInfo.map((t) => <span key={t} className="sys-hint">{t}</span>)}
          {readFailed.length > 0 && (
            <div className="note warn" role="status"><div className="note-body"><b>{readFailed.length} tệp không đọc được (không ảnh hưởng các tệp khác)</b>
              <ul className="imp-fail">{readFailed.slice(0, 8).map((f) => <li key={`${f.rel}/${f.name}`}><span className="mono">{f.rel ? `${f.rel}/` : ''}{f.name}</span>: {f.message}</li>)}{readFailed.length > 8 && <li>… và {readFailed.length - 8} tệp khác.</li>}</ul></div></div>
          )}
          {multi && (
            <div className="aid-scroll aid-scroll-sm" aria-label="Theo tệp">
              <table className="aid-table">
                <thead><tr><th>Nhập</th><th>Tệp</th><th>Số câu</th><th>ID đúng</th><th>Thiếu Dạng</th><th>ID sai</th><th>Không ID</th>{anaDone && <th>Nghi trùng</th>}</tr></thead>
                <tbody>
                  {fileStats.map((f) => {
                    const dup = anaDone ? rows.reduce((n, r, i) => (r.srcIdx === f.srcIdx && ['sure', 'near', 'conflict'].includes(statusOf(i).key) ? n + 1 : n), 0) : 0;
                    return (
                      <tr key={f.srcIdx} className={skip.has(f.srcIdx) ? '' : 'is-on'}>
                        <td><input type="checkbox" checked={!skip.has(f.srcIdx)} aria-label={`Nhập tệp ${f.name}`} onChange={(e) => setSkip((s) => { const n = new Set(s); if (e.target.checked) n.delete(f.srcIdx); else n.add(f.srcIdx); return n; })} /></td>
                        <td className="aid-q"><span className="mono">{f.rel ? `${f.rel}/` : ''}{f.name}</span>{f.blocks === 0 && <small className="aid-bad">0 câu (không có \begin{'{ex}'}…\end{'{ex}'})</small>}</td>
                        <td>{f.blocks}</td><td>{f.idOk}</td><td>{f.idNoForm}</td><td>{f.idInvalid}</td><td>{f.idMissing}</td>{anaDone && <td>{skip.has(f.srcIdx) ? '—' : dup}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {tooBig && (
            <div className="note bad" role="alert"><div className="note-body"><b>Lô có {usedRows.length.toLocaleString('vi-VN')} câu — vượt giới hạn {BATCH_MAX.toLocaleString('vi-VN')} câu mỗi lô</b>
              <span>Hãy bỏ tick bớt tệp ở bảng trên (nhập phần còn lại ở lần sau). Tạm giới hạn vì rà soát trùng tốn nhiều bộ nhớ; sẽ nới khi bộ dò trùng được làm nhẹ hơn.</span></div></div>
          )}
        </div>

        {rows.length > 0 && (
          <div className="panel" aria-label="Thông tin lô nhập">
            <h2>Thông tin lô nhập</h2>
            <span className="sys-hint">Nhãn sau được gắn cho <b>mọi câu được nhập</b> trong lô này để về sau biết câu đến từ đâu (lọc theo nhãn ở Ngân hàng). Không đổi nội dung câu.</span>
            <div className="grid2">
              <label className="lbl">Tên lô<input className="bd-in" value={info.name} maxLength={60} onChange={(e) => setInfo({ ...info, name: e.target.value })} aria-label="Tên lô nhập" /></label>
              <label className="lbl">Nhãn thêm cho cả lô (cách nhau bằng dấu phẩy)<input className="bd-in" value={info.extra} onChange={(e) => setInfo({ ...info, extra: e.target.value })} placeholder="vd: Sách KNTT 12, Đề 2024" aria-label="Nhãn thêm cho cả lô" /></label>
            </div>
            <div className="head-actions">
              <label className="sw"><input type="checkbox" checked={info.tagFile} onChange={(e) => setInfo({ ...info, tagFile: e.target.checked })} />Gắn tên tệp (Nguồn: …)</label>
              <label className="sw"><input type="checkbox" checked={info.tagBatch} onChange={(e) => setInfo({ ...info, tagBatch: e.target.checked })} />Gắn tên lô (Lô: …)</label>
              {srcs.some((x) => x.rel) && <label className="sw"><input type="checkbox" checked={info.tagFolder} onChange={(e) => setInfo({ ...info, tagFolder: e.target.checked })} />Gắn thư mục con (Thư mục: …)</label>}
            </div>
            <span className="sys-hint">Ví dụ câu đầu tiên sẽ có nhãn: {tagsFor(rows[0], info).map((t) => <span key={t} className="tag" style={{ marginRight: 4 }}>{t}</span>)}{tagsFor(rows[0], info).length === 0 && '(không có nhãn)'}</span>
          </div>
        )}

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
                  {idPicks && pendingPicks > 0 && <button type="button" className="btn btn-sm" onClick={acceptAllPicks} title="Dùng Dạng đề xuất (★) cho mọi câu đang có đề xuất mà thầy/cô chưa chọn. Câu AI không đủ căn cứ vẫn để trống.">Nhận mọi đề xuất ({pendingPicks} câu)</button>}
                </div>
                {idPicks && <AiAskBar count={draftAiJobs().length} buildJobs={draftAiJobs} onResults={onDraftAi} />}
                <span className="sys-hint">Tuỳ chọn. Gợi ý Chương/Bài/Dạng trong <b>Lớp {loc.grade}</b> theo các câu đã có trong ngân hàng — không gửi dữ liệu ra ngoài. Câu có %[ID] hợp lệ giữ nguyên ID; mức độ theo ô Mức độ. HEdu chỉ tự điền gợi ý ngân hàng tin cậy cao; đề xuất của AI thầy/cô tự nhận (từng câu hoặc “Nhận mọi đề xuất”). Câu chưa chọn dùng vị trí chung ở trên. Khi nhập, ID theo vị trí được ghi vào LaTeX lưu trong ngân hàng.</span>
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
                                    {optionsOf(p).map((o, k) => { const pl = pickIx?.get(o.formId); return <option key={o.formId} value={o.formId}>{k === 0 && p.suggestion.best ? '★ ' : ''}{pl && pl.chapter && pl.lesson && pl.form ? `${shortName(pl.chapter.name)} › ${shortName(pl.lesson.name)} › ${shortName(pl.form.name)}` : o.formId}</option>; })}
                                    <option value="">— Vị trí chung ở trên —</option>
                                  </select>
                                )}
                                {p.suggestion.notes.map((t) => <small key={t} className="aid-note">{t}</small>)}
                                {refused.has(i) && !p.formId && <small className="aid-note aid-bad">Chưa chọn Dạng — nếu nhập, câu này vào vị trí chung ở trên.</small>}
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
            <PackagePanel src={multi ? rows.length ? allSources.filter((_, k) => !skip.has(k)).map((x) => x.text).join('\n') : '' : text250} blocks={blocks} activeFilter={pkgFilter?.key ?? null} onFilter={(r, key) => setPkgFilter(r ? { rows: r, key } : null)} />
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
              {multi && fileStats.length > 1 && (
                <label className="dc-kindsel">Chỉ hiện tệp
                  <select value={String(fileF)} onChange={(e) => setFileF(e.target.value === 'all' ? 'all' : Number(e.target.value))} aria-label="Chỉ hiện câu của một tệp">
                    <option value="all">Tất cả các tệp</option>
                    {fileStats.filter((f) => !skip.has(f.srcIdx)).map((f) => <option key={f.srcIdx} value={f.srcIdx}>{f.name} ({f.blocks})</option>)}
                  </select>
                </label>
              )}
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
                    <span className="chk-n" title={`Bắt đầu ở dòng ${r.line} của ${multi ? `tệp ${r.file}` : 'file'}`}>{i + 1}</span>{multi && <span className="chk-tag tin" title={r.rel ? `${r.rel}/${r.file}` : r.file}>{r.file}</span>}
                    <b>{TYPE_LABEL[r.p.type]}</b>
                    <span className="mono">{fromIdOf(i) ? questionCode(fromIdOf(i)!.loc, fromIdOf(i)!.level) : headIdNote(latexOf(i)) ?? (idPicks && draftLocOf(i).suggested ? `${questionCode(draftLocOf(i).loc, level)} (gợi ý)` : 'không ID')}</span>
                    {verifOf(i) && <span className={`chk-tag ${verifOf(i)!.verdict === 'khop' ? 'tin' : verifOf(i)!.verdict === 'bat-dong' ? 'loi' : 'canh'}`} title="Đối chiếu ID trong tệp với câu giống trong ngân hàng">{VERDICT_LABEL[verifOf(i)!.verdict]}</span>}
                    <span className="chk-stem">{r.p.stem.replace(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g, '[hình]').replace(/\s+/g, ' ').slice(0, 70)}</span>
                    {anaDone && statusOf(i).key !== 'new' && <span className={`chk-tag dup d-${statusOf(i).key}`}>{statusOf(i).label}{(ana!.rows[i]?.hits.length ?? 0) > 0 ? ` · ${ana!.rows[i]!.hits.length}` : ''}</span>}
                    {edits[i] != null && <span className="chk-tag tin">đã sửa tại chỗ</span>}
                    {tex[i] && <span className={`chk-tag ${tex[i].ok ? 'tin' : 'loi'}`}>{tex[i].ok ? 'TeX đạt' : `TeX: ${(tex[i] as { fail: Failure }).fail.label}`}</span>}
                    {worstOf(i) && <span className={`chk-tag ${worstOf(i)}`}>{worstOf(i) === 'tin' ? 'có hình' : LEVEL_TEXT[worstOf(i)!]}</span>}
                  </button>
                  {verifOf(i)?.verdict === 'bat-dong' && fromIdOf(i) && (
                    <>
                      <label className="dec-sel">
                        <span className="sr-only">Cách xử lý ID bất đồng của câu {i + 1}</span>
                        <select value={idDecOf(i)?.choice ?? 'cho'} onChange={(e) => setChoice(i, e.target.value as IdChoice)} aria-label={`Cách xử lý ID bất đồng của câu ${i + 1}`}>
                          <option value="cho">Chờ xác minh (hàng đợi, mặc định)</option>
                          <option value="giu">Giữ ID trong tệp ({questionCode(fromIdOf(i)!.loc, fromIdOf(i)!.level)})</option>
                          <option value="goi-y" disabled={!verifOf(i)!.suggested}>Theo gợi ý ({verifOf(i)!.suggested ? questionCode(verifOf(i)!.suggested!.location, fromIdOf(i)!.level) : '—'})</option>
                          <option value="chung">Chưa phân loại (vị trí chung, không ghi ID)</option>
                        </select>
                      </label>
                      {idDecOf(i) && (idDecOf(i)!.choice === 'goi-y' || idDecOf(i)!.choice === 'chung') && (
                        <label className="dec-sel">
                          <span className="sr-only">Mức độ của câu {i + 1} khi đổi vị trí</span>
                          <select value={idDecOf(i)!.level} onChange={(e) => setLevelChoice(i, e.target.value as LevelChoice)} aria-label={`Mức độ của câu ${i + 1} khi đổi vị trí`}>
                            <option value="giu">Giữ mức độ gốc ({LEVEL_LABEL[fromIdOf(i)!.level]})</option>
                            <option value="chung">Đổi theo ô Mức độ chung ({LEVEL_LABEL[level]})</option>
                          </select>
                        </label>
                      )}
                    </>
                  )}
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
            {vsum.total > 0 && (
              <p className="sys-hint" role="status">
                ID trong tệp (đối chiếu với ngân hàng, không tin tuyệt đối): {vsum.khop} khớp · {vsum.chua} chưa kiểm chứng{vsum.unchecked > 0 ? ` · ${vsum.unchecked} đang kiểm` : ''} · {vsum.batDong} bất đồng{vsum.queued > 0 ? ` (${vsum.queued} vào hàng đợi xác minh: giữ ID gốc, đánh dấu cần xem lại)` : ''}.
              </p>
            )}
            <div className="head-actions imp-bar">
              <button type="button" className="btn btn-accent" disabled={!canImport || !!saveErr} onClick={() => { setAckRefused(false); setConfirm(true); }}>
                {checking || !anaDone ? 'Đang kiểm tra…' : sum.holdN > 0 ? `Còn ${sum.holdN} câu cần quyết định` : vsum.unchecked > 0 ? 'Đang kiểm chứng ID…' : `Nhập ${importCount} câu vào ngân hàng`}
              </button>
              {anaDone && sum.holdN > 0 && <button type="button" className="btn btn-sm" onClick={() => setStatusF('hold')}>Xem các câu chưa quyết định</button>}
              {vsum.batDong > 0 && <button type="button" className="btn btn-sm" onClick={() => setOnlyIdBD((x) => !x)}>{onlyIdBD ? 'Hiện tất cả câu' : `Xem ${vsum.batDong} câu ID bất đồng`}</button>}
            </div>
            {confirm && (
              <div className="qe-confirm qe-modal" role="alertdialog" aria-modal="true" aria-label="Xác nhận nhập">
                <b>Sẽ nhập {sum.importN} câu, bỏ qua {sum.skipN} câu.</b>
                {sum.keptSuspect > 0 && <p>Trong số nhập có {sum.keptSuspect} câu HEdu đánh dấu nghi trùng mà bạn đã chọn giữ{sum.keptPairs > 0 ? `, trong đó ${sum.keptPairs} cặp trùng nhau ngay trong file sẽ được nhập cả hai` : ''}.</p>}
                {idSum.mustConfirm && (
                  <label className="bd-sure"><input type="checkbox" checked={ackRefused} onChange={(e) => setAckRefused(e.target.checked)} /> <span>
                    {idSum.needTeacher.missing > 0 && <>{idSum.needTeacher.missing} câu không có ID{' '}</>}
                    {idSum.needTeacher.invalid > 0 && <>{idSum.needTeacher.invalid} câu có ID không hợp lệ{' '}</>}
                    {idSum.needTeacher.noForm > 0 && <>{idSum.needTeacher.noForm} câu có ID thiếu mã Dạng{' '}</>}
                    (thầy/cô chưa chọn Dạng{refused.size > 0 ? ', gồm cả câu AI chưa đủ căn cứ' : ''}) sẽ vào <b>vị trí chung</b> đang chọn ở trên.{' '}
                    <>Các câu này được đánh dấu <b>Chưa phân loại</b> và giữ nguyên mã LaTeX (HEdu không ghi ID giả); câu có ID lỗi giữ nguyên mã để thầy/cô sửa sau. Câu thầy/cô đã nhận gợi ý được ghi ID theo gợi ý (tệp gốc không đổi). </>
                    Tôi đã xem lại và xác nhận.
                  </span></label>
                )}
                {vsum.chua > 0 && <p>{vsum.chua} câu có ID trong tệp nhưng ngân hàng chưa đủ căn cứ để kiểm chứng: vẫn nhập theo ID đó, báo cáo nhập sẽ ghi “chưa kiểm chứng”.</p>}
                <p>HEdu sẽ rà soát lại với ngân hàng ngay trước khi ghi. Không câu nào trong ngân hàng bị sửa hay xoá.</p>
                <div className="head-actions">
                  <button type="button" className="btn btn-accent" autoFocus disabled={idSum.mustConfirm && !ackRefused} onClick={commit}>Nhập {sum.importN} câu</button>
                  <button type="button" className="btn" onClick={() => setConfirm(false)}>Quay lại</button>
                </div>
              </div>
            )}
            {openBank && questions.find((q) => q.uid === openBank) && <QuestionDrawer q={questions.find((q) => q.uid === openBank)!} onClose={() => setOpenBank(null)} onDirty={() => undefined} />}
          </div>
        )}
      </div>}
    </>
  );
}
