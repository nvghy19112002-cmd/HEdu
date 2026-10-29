// Tạo đề từ Ngân hàng: ma trận → xem trước (đúng như bản in) → lưu vào Thư viện đề để biên dịch PDF.
// Lõi chọn câu/trộn/đáp án/dựng .tex nằm ở lib/examgen.ts (có kiểm thử); bản nháp ở lib/examdraft.ts.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { QuestionView } from '../components/QuestionView';
import { ExamTemplatesDialog } from '../components/ExamTemplatesDialog';
import { ExamExportDialog } from '../components/ExamExportDialog';
import { ExamUsagePanel, useUsageScan } from '../components/ExamUsagePanel';
import { ExamMatrixGrid } from '../components/ExamMatrixGrid';
import { SlotMatrix, SlotStats } from '../components/SlotMatrix';
import { applyForm, expandRows, levelStats, moveSlot, patchSlots } from '../lib/examslots';
import { stockIndex } from '../lib/examgrid';
import { useEffectiveOf } from '../components/IdReviewControl';
import { IcAlert, IcCheck, IcDice, IcLock, IcPlus, IcSwap, IcUnlock, IcX } from '../components/Icons';
import { chapters as chaptersOf, grades, useTaxonomy } from '../lib/curriculum';
import { allocate, brokenQuestions, candidatesFor, checkVariants, collect, countsOf, DS_POINTS_CENTI, eligible, examFiles, fmtScore, hasControlChars, LOST_LABEL, rowMatches, makeVariants, PART_NAME, PARTS, partOf, POLICY_LABEL, reconcile, sourceHashes, specJson, totalCenti, variantFile, verified, type PartKey, type Policy, type Row, type Slot } from '../lib/examgen';
import { confirmRow, effectiveRows, lastGrade, loadDraft, newRowId, rescopeRow, rowsFromPick, saveDraft, scopeLabel, scopeParts, template2025, type Draft } from '../lib/examdraft';
import { avoidSet, avoidedFor, buildIndex, lockedUsed, scanUsage, traceOf, usageSig, usedAtLabel } from '../lib/examusage';
import { parseExTest } from '../lib/extest';
import { createFromFiles, toSource } from '../lib/examsources';
import { requirementsMd, safeFolderName } from '../lib/texproject';
import { heduFiles } from '../lib/hedusty';
import { invoke, isDesktop } from '../lib/platform';
import { stemSnippet } from '../lib/snippet';
import { useBank } from '../lib/store';
import { LEVELS, LEVEL_LABEL, TYPES, TYPE_LABEL, type Level, type QType, type Question } from '../lib/types';

const PART_HEAD: Record<PartKey, string> = {
  p1: 'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.',
  p2: 'PHẦN II. Câu trắc nghiệm đúng sai.',
  p3: 'PHẦN III. Câu trắc nghiệm trả lời ngắn.',
  p4: 'PHẦN IV. Tự luận.',
};
const LEVEL_COLOR: Record<Level, string> = { NB: 'var(--c-nb-fg)', TH: 'var(--c-th-fg)', VD: 'var(--c-vd-fg)', VDC: 'var(--c-vdc-fg)' };
const POLICIES: Policy[] = ['duyet', 'xac-minh', 'tat-ca'];
const POLICY_SHORT: Record<Policy, string> = { duyet: 'Đã duyệt', 'xac-minh': 'Đã xác minh', 'tat-ca': 'Mọi câu' };

function PartHead({ text }: { text: string }) {
  const k = text.indexOf('. ');
  return <p className="sheet-part"><b>{text.slice(0, k + 1)}</b>{text.slice(k + 1)}</p>;
}

interface SlotProps {
  slot: Slot; number: number; locked: boolean; verifiedDa: boolean; exception: boolean;
  onLock(): void; onSwap(): void; onReroll(): void; swapping: boolean;
}

/** Một câu trong trang xem trước, có thao tác khi rê chuột hoặc focus. */
const SlotView = memo(function SlotView({ slot, number, locked, verifiedDa, exception, onLock, onSwap, onReroll, swapping }: SlotProps) {
  const parsed = useMemo(() => parseExTest(slot.latex), [slot.latex]);
  const order = useMemo(() => parsed.options.map((_, i) => i), [parsed]);
  return (
    <div className={`te-q${locked ? ' is-locked' : ''}${swapping ? ' is-swap' : ''}`}>
      <div className="te-q-tools" role="group" aria-label={`Thao tác câu ${number}`}>
        {exception && <span className="te-flag warn" title="Ngoại lệ do giáo viên xác nhận: câu này không đạt mức lấy câu đang chọn">Ngoại lệ</span>}
        {!exception && slot.q.review !== 'approved' && <span className="te-flag warn" title="Câu này chưa được duyệt nội dung">Chưa duyệt</span>}
        {!verifiedDa && <span className="te-flag" title="Dạng hoặc mức độ chưa được giáo viên xác minh">Chưa xác minh Dạng</span>}
        {slot.note && <span className="te-flag" title={slot.note}>Giữ nguyên phương án</span>}
        <button type="button" className="te-tool" aria-pressed={locked} title={locked ? 'Bỏ khóa câu này' : 'Khóa câu này: giữ nguyên khi sinh lại'} onClick={onLock}>{locked ? <IcLock /> : <IcUnlock />}<span>{locked ? 'Đã khóa' : 'Khóa'}</span></button>
        <button type="button" className="te-tool" title="Chọn một câu khác thay cho câu này" aria-expanded={swapping} onClick={onSwap}><IcSwap /><span>Đổi câu</span></button>
        <button type="button" className="te-tool" title="Loại câu này và lấy ngẫu nhiên một câu khác" onClick={onReroll}><IcDice /><span>Ngẫu nhiên</span></button>
      </div>
      <QuestionView p={parsed} order={order} number={number} variant="exam" showAnswer={false} showSolution={false} />
    </div>
  );
});

export function ExamScreen({ pick }: { pick?: string[] }) {
  const { go, toast, showFile } = useApp();
  const { questions } = useBank();
  const { tax } = useTaxonomy();
  const effOf = useEffectiveOf();
  const [d, setD] = useState<Draft>(() => loadDraft());
  const [shown, setShown] = useState(0);
  const [swap, setSwap] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tplDlg, setTplDlg] = useState(false);
  const [rescope, setRescope] = useState<string | null>(null);
  /** bản nháp ngay trước lần áp dụng mẫu gần nhất, để hoàn tác (chỉ trong phiên) */
  const [undoTpl, setUndoTpl] = useState<{ prev: Draft; note: string } | null>(null);
  const [saved, setSaved] = useState<{ id: string; name: string; sig: string } | null>(null);
  const [exportDlg, setExportDlg] = useState(false);
  /** bước đang mở: 1 chọn câu · 2 kết quả · 3 cấu hình & xuất */
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const upd = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  useEffect(() => { saveDraft(d); }, [d]);

  // Câu chọn tay từ Ngân hàng: thành dòng ma trận có câu khóa, chỉ thêm một lần cho mỗi lần chọn.
  useEffect(() => {
    if (!pick?.length) return;
    const sig = [...pick].sort().join(',');
    if (sig === d.pickSig) return;
    const all = questions.filter((q) => pick.includes(q.uid));
    if (!all.length) return;
    const refused = all.filter((q) => q.review === 'needs_fix' || hasControlChars(q));
    const okQs = all.filter((q) => !refused.includes(q));
    const off = okQs.filter((q) => !eligible(q, effOf, d.policy));
    let qs = okQs;
    const exc: Record<string, { at: number; why: string }> = {};
    if (off.length) {
      const yes = window.confirm(`${off.length} / ${okQs.length} câu bạn chọn chưa đạt mức lấy câu “${POLICY_SHORT[d.policy]}” (chưa duyệt hoặc chưa xác minh).\n\nBấm OK để vẫn đưa vào đề như NGOẠI LỆ (HEdu ghi dấu vết trong đề và cảnh báo trên từng câu).\nBấm Hủy để chỉ đưa các câu đạt mức.`);
      if (yes) off.forEach((q) => { exc[q.uid] = { at: Date.now(), why: 'chon-tay-tu-ngan-hang' }; });
      else qs = okQs.filter((q) => !off.includes(q));
    }
    if (refused.length) toast(`${refused.length} câu không đưa vào đề được (đang “Cần sửa” hoặc có ký tự điều khiển lạ).`);
    const add = rowsFromPick(qs);
    setD((x) => ({ ...x, rows: [...x.rows, ...add.rows], locked: { ...x.locked, ...add.locked }, exceptions: { ...x.exceptions, ...exc }, rejected: x.rejected.filter((u) => !pick.includes(u)), pickSig: sig }));
    if (qs.length) toast(`Đã đưa ${qs.length} câu từ Ngân hàng vào đề (đã khóa).`);
  }, [pick, questions, d.pickSig, d.policy, effOf, toast]);

  const byUid = useMemo(() => new Map(questions.map((q) => [q.uid, q])), [questions]);
  const usage = useUsageScan(d.usage.on);
  const idx = useMemo(() => buildIndex(usage.projects, d.usage), [usage.projects, d.usage]);
  const avoid = useMemo(() => avoidSet(idx, d.reuse), [idx, d.reuse]);
  /** đang bật mà chưa có kết quả quét thì KHÔNG được xuất (tránh đề tưởng đã lọc nhưng chưa lọc) */
  const usageBlocked = d.usage.on && (usage.loading || !!usage.error || usage.scannedAt === null);
  const exclude = useMemo(() => new Set(d.rejected), [d.rejected]);
  const exceptions = useMemo(() => new Set(Object.keys(d.exceptions)), [d.exceptions]);
  /** Dòng dùng thật: dòng có cờ hoặc có nút phạm vi không còn trong cây KHÔNG khớp câu nào và chặn xuất */
  const rows = useMemo(() => effectiveRows(d.rows, tax), [d.rows, tax]);
  // ma trận theo từng câu: dòng nhiều câu (bản nháp cũ, mẫu, câu đưa từ Ngân hàng) được tách thành từng câu
  useEffect(() => { const e = expandRows(d.rows, d.locked, newRowId); if (e.changed) setD((x) => ({ ...x, rows: e.rows, locked: e.locked })); }, [d.rows, d.locked]);
  /** Tự chọn: chỉ các câu giáo viên đã chọn (khóa) vào đề; ô chưa chọn để trống, không để máy điền */
  const allocRows = useMemo(() => (d.mode === 'manual' ? rows.filter((r) => d.locked[r.id]?.length) : rows), [rows, d.mode, d.locked]);
  const unchosen = rows.length - allocRows.length;
  const alloc = useMemo(() => allocate(questions, allocRows, { policy: d.policy, eff: effOf, seed: d.seed, locked: d.locked, exclude, exceptions, avoid }), [questions, allocRows, d.policy, d.seed, d.locked, exclude, exceptions, avoid, effOf]);
  const picked = useMemo(() => collect(allocRows, alloc.picks, byUid), [allocRows, alloc, byUid]);
  /** mức độ của đề cho bảng thống kê: mức câu đã chọn, ô chưa có câu thì mức yêu cầu */
  const slotLevels = useMemo(() => levelStats(rows.map((r) => { const u = alloc.picks[r.id]?.[0]; return (u && byUid.get(u)?.level) || r.level; })), [rows, alloc, byUid]);
  const counts = countsOf(picked);
  const total = counts.p1 + counts.p2 + counts.p3 + counts.p4;
  const variants = useMemo(() => makeVariants(picked, { count: d.count, firstCode: d.firstCode, shuffleQuestions: d.shuffleQuestions, shuffleOptions: d.shuffleOptions, seed: d.seed, keepFirstOriginal: true }), [picked, d.count, d.firstCode, d.shuffleQuestions, d.shuffleOptions, d.seed]);
  const variant = variants[Math.min(shown, variants.length - 1)];
  const rowOf = useMemo(() => { const m = new Map<string, string>(); for (const [rid, us] of Object.entries(alloc.picks)) for (const u of us) m.set(u, rid); return m; }, [alloc]);
  const lockedSet = useMemo(() => new Set(Object.values(d.locked).flat()), [d.locked]);
  const missing = allocRows.reduce((a, r) => a + (alloc.deficit[r.id] ?? 0), 0);
  const flaggedN = rows.filter((r) => r.flag).length;
  const issues = useMemo(() => [...checkVariants(variants), ...reconcile(allocRows, alloc, picked, variants, d.scoring).filter((i) => i.kind !== 'thieu-cau')], [variants, allocRows, alloc, picked, d.scoring]);
  const lostLocks = alloc.lost;
  /** dòng thiếu câu mà có ứng viên bị loại vì đã dùng: báo rõ số lượng, giáo viên tự quyết dùng lại */
  const shortUsed = useMemo(() => rows.flatMap((r) => {
    if (!(alloc.deficit[r.id] > 0) || !(alloc.avoided[r.id] > 0)) return [];
    const qs = avoidedFor(questions, r, avoid, (q, row) => rowMatches(row, q) && eligible(q, effOf, d.policy) && !exclude.has(q.uid));
    return qs.length ? [{ row: r, qs }] : [];
  }), [rows, alloc, questions, avoid, effOf, d.policy, exclude]);
  const lockedUsedList = useMemo(() => lockedUsed(idx, d.reuse, Object.values(alloc.picks).flat().filter((u) => lockedSet.has(u))), [idx, d.reuse, alloc, lockedSet]);
  const allowReuse = (qs: readonly Question[]) => {
    const froms = [...new Set(qs.flatMap((q) => (idx.used.get(q.uid) ?? []).map((p) => p.name)))];
    const label = froms.slice(0, 5).join('; ') + (froms.length > 5 ? '…' : '');
    if (!window.confirm(`Cho phép dùng lại ${qs.length} câu đã dùng ở: ${label}?

HEdu ghi dấu vết việc này vào đề (hedu-de.json) và KHÔNG sửa Ngân hàng. Câu vẫn có thể bị máy chọn ngẫu nhiên cho dòng đang thiếu.`)) return;
    const at = Date.now();
    upd({ reuse: { ...d.reuse, ...Object.fromEntries(qs.map((q) => [q.uid, { at, from: (idx.used.get(q.uid) ?? []).map((p) => p.id) }])) } });
  };
  const centi = totalCenti(counts, d.scoring);
  const picks = useMemo(() => PARTS.flatMap((p) => picked[p]), [picked]);
  const unverifiedN = useMemo(() => picks.filter((q) => !verified(effOf(q))).length, [picks, effOf]);
  const unreviewedN = picks.filter((q) => q.review !== 'approved').length;
  const keptN = variant ? PARTS.reduce((a, p) => a + variant.parts[p].filter((s) => s.note).length, 0) : 0;
  const byLevel = (['NB', 'TH', 'VD', 'VDC'] as Level[]).map((l) => ({ l, n: picks.filter((q) => q.level === l).length }));
  const defaultGrade = grades()[grades().length - 1] ?? 12;
  const broken = useMemo(() => brokenQuestions(questions), [questions]);

  const gridStock = useMemo(() => stockIndex(questions, (q) => !exclude.has(q.uid) && !avoid.has(q.uid) && eligible(q, effOf, d.policy)), [questions, exclude, avoid, effOf, d.policy]);
  const goStep = (n: 1 | 2 | 3) => { setStep(n); window.scrollTo({ top: 0 }); };
  /** câu khác có thể đặt vào một ô: đúng Dạng bài + loại + mức, đạt mức lấy câu, chưa nằm ở ô khác */
  const candidatesOf = (r: Row): Question[] => {
    const taken = new Set(Object.entries(alloc.picks).filter(([k]) => k !== r.id).flatMap(([, v]) => v));
    return candidatesFor(questions, r, { policy: d.policy, eff: effOf, avoid }, taken).filter((q) => !exclude.has(q.uid));
  };
  const dropLocks = (ids: readonly string[]): Record<string, string[]> => Object.fromEntries(Object.entries(d.locked).filter(([k]) => !ids.includes(k)));
  const stockOf = (r: Row): number => questions.reduce((a, q) => a + (!exclude.has(q.uid) && !avoid.has(q.uid) && rowMatches(r, q) && eligible(q, effOf, d.policy) ? 1 : 0), 0);
  /** lý do chưa lưu/xuất được, hiện ngắn gọn cạnh nút Lưu */
  const blockers = [
    total === 0 && missing === 0 && unchosen === 0 ? 'ma trận chưa có câu' : '',
    unchosen > 0 ? `${unchosen} câu chưa chọn (Tự chọn)` : '',
    missing > 0 ? `thiếu ${missing} câu` : '',
    flaggedN > 0 ? `${flaggedN} dòng cần chọn lại phạm vi` : '',
    lostLocks.length > 0 ? `${lostLocks.length} câu khóa không vào được đề` : '',
    issues.length > 0 ? 'đáp án hoặc tổng số chưa khớp' : '',
    usageBlocked ? 'đang kiểm câu đã dùng' : '',
  ].filter(Boolean);
  const refWarn = useRef<HTMLElement>(null);
  const setRow = (id: string, p: Partial<Row>) => upd({ rows: d.rows.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  const delRow = (id: string) => { const { [id]: _drop, ...rest } = d.locked; upd({ rows: d.rows.filter((r) => r.id !== id), locked: rest }); };
  const toggleLock = (uid: string) => {
    const rid = rowOf.get(uid);
    if (!rid) return;
    const cur = d.locked[rid] ?? [];
    upd({ locked: { ...d.locked, [rid]: cur.includes(uid) ? cur.filter((u) => u !== uid) : [...cur, uid] } });
  };
  const withoutLock = (uid: string): Record<string, string[]> => { const next: Record<string, string[]> = {}; for (const [k, v] of Object.entries(d.locked)) next[k] = v.filter((u) => u !== uid); return next; };
  const reroll = (uid: string) => { setSwap(null); upd({ rejected: [...d.rejected, uid], locked: withoutLock(uid) }); };
  const replace = (uid: string, to: string) => {
    const rid = rowOf.get(uid);
    if (!rid) return;
    const base = withoutLock(uid);
    setSwap(null);
    upd({ rejected: [...d.rejected, uid], locked: { ...base, [rid]: [...(base[rid] ?? []), to] } });
  };
  const resample = () => upd({ seed: Math.floor(Math.random() * 1e9), rejected: [] });

  const swapRow = swap ? rows.find((r) => r.id === rowOf.get(swap)) : undefined;
  const candidates = useMemo<Question[]>(() => (swapRow ? candidatesFor(questions, swapRow, { policy: d.policy, eff: effOf, avoid }, new Set(picks.map((q) => q.uid))) : []), [swapRow, questions, d.policy, effOf, picks, avoid]);

  const refMatrix = useRef<HTMLElement>(null);
  const refSheet = useRef<HTMLElement>(null);
  const refExport = useRef<HTMLDivElement>(null);
  const desktop = isDesktop();
  const draftSig = useMemo(() => JSON.stringify([d.rows, d.seed, d.policy, d.count, d.firstCode, d.shuffleQuestions, d.shuffleOptions, d.info, d.locked, d.rejected, d.exceptions, d.scoring, d.withKeys, d.usage, d.reuse]), [d]);
  const canExport = !usageBlocked && unchosen === 0 && total > 0 && missing === 0 && variants.length > 0 && issues.length === 0 && lostLocks.length === 0;
  const jump = (r: { current: HTMLElement | null }) => r.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  /** Bộ tệp của đề, kèm dấu vân SHA-256 từng tệp nguồn trong hedu-de.json (để về sau biết tệp có bị sửa tay không). */
  const projectFiles = async (name: string) => {
    // tầng xuất: không bao giờ ghi đề khi ma trận còn dòng chưa xử lý (kể cả khi giao diện bị bỏ qua)
    if (rows.some((r) => r.flag)) throw new Error('Ma trận còn dòng chưa xử lý (phạm vi đã xóa hoặc đổi vị trí).');
    // Thư viện có thể đã đổi từ lúc quét: quét lại ngay trước khi ghi; khác kết quả thì làm mới và dừng để giáo viên xem lại
    if (d.usage.on) {
      const fresh = buildIndex((await scanUsage()).projects, d.usage);
      if (usageSig(fresh, d.reuse) !== usageSig(idx, d.reuse)) { usage.refresh(); throw new Error('Thư viện đề đã thay đổi kể từ lần quét trước nên danh sách câu đã dùng được làm mới. Hãy xem lại đề rồi lưu lại'); }
    }
    const tex = examFiles(d.info, variants, { withKeys: d.withKeys });
    const fileHashes = await sourceHashes(tex);
    return [
      ...tex,
      ...heduFiles(picks, ''),
      { path: 'hedu-de.json', text: specJson({ info: d.info, rows, policy: d.policy, seed: d.seed, scoring: d.scoring, variants, at: new Date().toISOString(), exceptions: d.exceptions, locked: d.locked, fileHashes, tranhCauDaDung: traceOf(d.usage, idx, d.reuse, new Date().toISOString(), lockedSet) }) },
      { path: 'CAN-CO-GI.md', text: requirementsMd(picks, '', name) },
    ];
  };

  const saveToLibrary = async () => {
    if (!canExport || busy) return;
    setBusy(true);
    try {
      const name = `${d.info.title.trim() || 'Đề'} · ${new Date().toLocaleDateString('vi-VN')}`;
      const s = await createFromFiles(name, await projectFiles(name), 'main.tex', variantFile(variants[0].code), picks.map(toSource));
      setSaved({ id: s.id, name: s.name, sig: draftSig });
      toast(`Đã lưu “${s.name}” vào Thư viện đề. Bấm “Xuất PDF từng mã / ZIP” hoặc mở mục Đề thi để biên dịch.`, { label: 'Mở Đề thi', run: () => go({ screen: 'examlib' }) });
    } catch (e) {
      toast(`Không lưu được vào Thư viện đề (${e instanceof Error ? e.message : String(e)}). Đề trên màn hình vẫn còn.`);
    } finally { setBusy(false); }
  };

  const exportFolder = async () => {
    if (!canExport || busy) return;
    const open = window.__TAURI__?.dialog?.open;
    if (!open) { toast('Chỉ xuất được ra thư mục trong bản cài trên Windows.'); return; }
    setBusy(true);
    try {
      const folder = safeFolderName(d.info.title, 'de-hedu');
      const parent = await open({ directory: true, multiple: false, title: 'Chọn nơi tạo thư mục đề' });
      if (!parent || Array.isArray(parent)) return;
      const out = await invoke<string>('export_tex_folder', { parent, name: folder, files: await projectFiles(folder) });
      toast(`Đã tạo thư mục: ${out}`);
    } catch (e) {
      toast(`Không tạo được thư mục (${e instanceof Error ? e.message : String(e)}).`);
    } finally { setBusy(false); }
  };

  const viewTex = () => {
    if (!variant) return;
    const f = examFiles(d.info, variants, { withKeys: false }).find((x) => x.path === variantFile(variant.code));
    if (f) showFile({ title: `Mã LaTeX · mã đề ${variant.code}`, name: f.path, text: f.text, mime: 'application/x-tex' });
  };

  const rowsEmpty = rows.length === 0;

  return (
    <>
      <header className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="crumbs">Tạo đề / Đề mới</span>
          <h1>Tạo đề từ Ngân hàng</h1>
        </div>
        <nav className="te-steps" role="tablist" aria-label="Các bước">
          <button type="button" role="tab" aria-selected={step === 1} onClick={() => goStep(1)}><i>1</i>Chọn câu</button>
          <button type="button" role="tab" aria-selected={step === 2} onClick={() => goStep(2)}><i>2</i>Kết quả{total > 0 ? ` (${total} câu)` : ''}</button>
          <button type="button" role="tab" aria-selected={step === 3} onClick={() => goStep(3)}><i>3</i>Cấu hình &amp; Xuất</button>
        </nav>
      </header>

      <div className="body-row">
        <div className="te-main" hidden={step === 3}>
          {step === 1 && <section className="mx-sec" aria-label="Ma trận đề" ref={refMatrix}>
            <div className="mx-head">
              <h2>Chọn câu theo ma trận</h2>
              <button type="button" className="btn btn-sm" onClick={() => setTplDlg(true)} title="Lưu ma trận vào kho (có tên), hoặc lấy ma trận đã lưu">Kho ma trận…</button>
              <div className="seg" role="group" aria-label="Câu đủ điều kiện">
                {POLICIES.map((p) => <button key={p} type="button" aria-pressed={d.policy === p} title={POLICY_LABEL[p]} onClick={() => upd({ policy: p })}>{POLICY_SHORT[p]}</button>)}
              </div>
            </div>
            {undoTpl && <p className="te-hint" role="status">{undoTpl.note} <button type="button" className="linkbtn" onClick={() => { setD(undoTpl.prev); setUndoTpl(null); toast('Đã hoàn tác áp dụng mẫu.'); }}>Hoàn tác áp dụng mẫu</button></p>}
            <p className="te-hint">Lấy câu: <b>{POLICY_LABEL[d.policy]}</b>.{d.policy === 'duyet' && ' Chưa có câu nào được giáo viên xác minh Dạng thì cứ dùng mức này.'}{d.policy === 'tat-ca' && ' Câu chưa duyệt sẽ có cảnh báo trên đề.'}{broken.length > 0 && <span className="te-bad"> {broken.length} câu có ký tự điều khiển lạ trong LaTeX nên bị loại khỏi tập ứng viên (vẫn còn nguyên trong Ngân hàng).</span>}</p>
            <ExamUsagePanel scope={d.usage} onScope={(usage) => upd({ usage })} usage={usage} idx={idx} />
            {broken.length > 0 && <details className="te-broken"><summary>Xem câu bị loại và nguyên nhân</summary><ul>{broken.slice(0, 50).map((b) => <li key={b.uid}>Câu #{b.seq} · <code>{b.uid}</code> · {b.why}</li>)}{broken.length > 50 && <li>… và {broken.length - 50} câu nữa</li>}</ul></details>}
            <SlotMatrix rows={rows} tax={tax} defaultGrade={defaultGrade} scoring={d.scoring} mode={d.mode} picks={alloc.picks} locked={d.locked} byUid={byUid}
              stockOf={stockOf} candidatesOf={candidatesOf} onMode={(mode) => upd({ mode })}
              onForm={(f) => { const r = applyForm(d.rows, f, { kind: 'grade', id: String(defaultGrade) }, newRowId); upd({ rows: r.rows, locked: dropLocks(r.removed) }); }}
              onPatch={(ids, patch) => { const r = patchSlots(d.rows, ids, patch); upd({ rows: r.rows, locked: dropLocks(r.touched) }); }}
              onDelete={delRow} onMove={(id, dir) => upd({ rows: moveSlot(d.rows, id, dir) })}
              onChoose={(rid, uid) => { const base = withoutLock(uid); upd({ locked: { ...base, [rid]: [uid] }, rejected: d.rejected.filter((u) => u !== uid) }); }}
              onLock={(rid, uid) => upd({ locked: { ...withoutLock(uid), [rid]: [uid] } })}
              onUnlock={(rid) => upd({ locked: dropLocks([rid]) })}
              onReroll={reroll} />
            <details className="mx-quick">
              <summary>Nhập nhanh theo bảng Dạng × mức độ <span className="te-note">gõ số câu cho từng Dạng; mỗi số thành bấy nhiêu câu trong ma trận ở trên</span></summary>
              <ExamMatrixGrid tax={tax} stock={gridStock} rows={d.rows} defaultGrade={defaultGrade} onChange={(next) => upd({ rows: next, locked: Object.fromEntries(Object.entries(d.locked).filter(([k]) => next.some((r) => r.id === k))) })} />
            </details>
            {!rowsEmpty && (
              <div className="mx-foot">
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => { if (window.confirm('Xóa toàn bộ ma trận và các câu đã chọn/khóa?')) upd({ rows: [], locked: {}, rejected: [] }); }}>Làm lại từ đầu</button>
              </div>
            )}
            <div className="te-next"><button type="button" className="btn btn-dark" disabled={total === 0} onClick={() => goStep(2)}>Tiếp: Xem kết quả →</button></div>
          </section>}

          {(usageBlocked || lockedUsedList.length > 0 || missing > 0 || unreviewedN > 0 || unverifiedN > 0 || keptN > 0 || issues.length > 0 || lostLocks.length > 0) && (total > 0 || lostLocks.length > 0) && (
            <section className="te-warn" aria-label="Lưu ý về đề" role="status" ref={refWarn}>
              {usageBlocked && <p className="bad"><IcAlert size={16} />{usage.error ? 'Chưa kiểm tra được câu đã dùng vì không quét được Thư viện đề, nên chưa xuất được.' : 'Đang quét Thư viện đề để tránh câu đã dùng; chưa xuất được cho tới khi quét xong.'}</p>}
              {lostLocks.length > 0 && (
                <div className="bad">
                  <p className="bad"><IcAlert size={16} />{lostLocks.length} câu đã khóa không còn vào được đề, nên đề đang thiếu hoặc đã thay bằng câu khác. Chưa xuất được cho tới khi bạn xử lý:</p>
                  <ul>{lostLocks.slice(0, 20).map((l) => <li key={l.uid}>Câu <code>{byUid.get(l.uid) ? `#${byUid.get(l.uid)!.seq}` : l.uid}</code>: {LOST_LABEL[l.why]}</li>)}</ul>
                  <button type="button" className="btn btn-sm" onClick={() => { const drop = new Set(lostLocks.map((l) => l.uid)); const next: Record<string, string[]> = {}; for (const [k, v] of Object.entries(d.locked)) next[k] = v.filter((u) => !drop.has(u)); upd({ locked: next }); }}>Bỏ khóa các câu này (máy chọn câu khác thay)</button>
                </div>
              )}
              {issues.length > 0 && (
                <div className="bad">
                  <p className="bad"><IcAlert size={16} />Đáp án hoặc tổng số chưa khớp ở {issues.length} chỗ nên chưa xuất được:</p>
                  <ul>{issues.slice(0, 8).map((i, k) => <li key={k}>{i.msg}{i.uid ? <> · <code>{byUid.get(i.uid) ? `#${byUid.get(i.uid)!.seq}` : i.uid}</code></> : null}</li>)}{issues.length > 8 && <li>… và {issues.length - 8} chỗ nữa</li>}</ul>
                </div>
              )}
              {lockedUsedList.length > 0 && (
                <div>
                  <p><IcAlert size={16} />{lockedUsedList.length} câu bạn đã khóa tay đã được dùng ở đề trong phạm vi tránh (vẫn giữ trong đề; HEdu ghi dấu vết vào hedu-de.json):</p>
                  <ul>{lockedUsedList.slice(0, 10).map((l) => <li key={l.uid}>Câu <code>{byUid.get(l.uid) ? `#${byUid.get(l.uid)!.seq}` : l.uid}</code>: {l.from.slice(0, 3).map((p) => p.name).join('; ')}</li>)}</ul>
                </div>
              )}
              {shortUsed.length > 0 && (
                <div className="bad">
                  <p className="bad"><IcAlert size={16} />Thiếu câu do đã loại câu đã dùng (HEdu không tự nới). Bạn có thể cho dùng lại có chủ đích:</p>
                  <ul>{shortUsed.map(({ row, qs }) => <li key={row.id}>{scopeLabel(row.scope, tax) ?? row.label ?? 'Dòng'}: thiếu {alloc.deficit[row.id]} câu, đã loại <b>{qs.length}</b> ứng viên vì đã dùng ở {[...new Set(qs.flatMap((q) => (idx.used.get(q.uid) ?? []).map((p) => p.name)))].slice(0, 3).join('; ')}. <button type="button" className="btn btn-sm" onClick={() => allowReuse(qs)}>Cho phép dùng lại {qs.length} câu này</button></li>)}</ul>
                </div>
              )}
              {missing > 0 && <p className="bad"><IcAlert size={16} />Còn thiếu {missing} câu so với ma trận. Hạ số câu, đổi mức lấy câu hoặc <button type="button" className="linkbtn" onClick={() => go({ screen: 'editor' })}>soạn thêm câu</button>. Chưa xuất được đề.</p>}
              {unreviewedN > 0 && <p><IcAlert size={16} />{unreviewedN} câu chưa được duyệt nội dung (chỉ vào đề qua ngoại lệ bạn đã xác nhận hoặc khi lấy “Mọi câu”).</p>}
              {unverifiedN > 0 && d.policy !== 'xac-minh' && (
                <details className="te-why">
                  <summary><IcAlert size={16} />{unverifiedN} / {total} câu chưa được giáo viên xác minh Dạng và mức độ, nên xem lại trước khi ra đề chính thức.</summary>
                  <p>“Đã duyệt nội dung” không phải là xác minh phân loại: số câu theo mức độ có thể lệch, và ID hợp lệ vẫn có thể sai lớp (từng có câu Toán 10 mang mã lớp 12). Muốn chỉ lấy câu đã xác minh, chọn mức “Đã xác minh” ở đầu ma trận.</p>
                </details>
              )}
              {keptN > 0 && <p><IcAlert size={16} />{keptN} câu trong mã đang xem giữ nguyên thứ tự phương án vì không nhận diện chắc (rê vào nhãn “Giữ nguyên phương án” để xem lý do).</p>}
            </section>
          )}

          {step === 2 && <>
          <section className="sheet-wrap" aria-label="Xem trước trang đề" ref={refSheet}>
            <div className="te-sheet-bar">
              <div className="codes" role="group" aria-label="Xem mã đề">
                {variants.map((v, i) => <button key={v.code} type="button" className="code" aria-pressed={i === Math.min(shown, variants.length - 1)} onClick={() => setShown(i)}>Mã {v.code}{i === 0 ? ' · gốc' : ''}</button>)}
              </div>
              <button type="button" className="btn btn-sm" onClick={resample} title="Chọn lại câu ngẫu nhiên, giữ nguyên câu đã khóa"><IcDice />Sinh lại</button>
            </div>
            <div className="sheet">
              <div className="sheet-top">
                <div><b>{d.info.dept || '[SỞ GD&ĐT]'}</b><b>{d.info.school || '[TÊN TRƯỜNG]'}</b>{d.info.group && <span>{d.info.group}</span>}</div>
                <div><b>{d.info.title.toUpperCase()}</b><span>{d.info.subject}</span><span>Thời gian làm bài: {d.info.minutes} phút</span>{d.info.note && <span>{d.info.note}</span>}</div>
              </div>
              <div className="sheet-code">Mã đề {variant?.code ?? d.firstCode}</div>
              {total === 0 ? (
                <p className="sheet-blank">Chưa có câu nào. Thêm dòng vào ma trận hoặc chọn câu trong Ngân hàng rồi bấm “Thêm vào đề”.</p>
              ) : variant && PARTS.map((p) => variant.parts[p].length > 0 && (
                <div key={p} className="te-part">
                  <PartHead text={p === 'p4' ? PART_HEAD[p] : `${PART_HEAD[p]} Thí sinh trả lời từ câu 1 đến câu ${variant.parts[p].length}.`} />
                  {variant.parts[p].map((s, k) => (
                    <div key={s.q.uid}>
                      <SlotView slot={s} number={k + 1} locked={lockedSet.has(s.q.uid)} verifiedDa={verified(effOf(s.q))} exception={!!d.exceptions[s.q.uid]}
                        swapping={swap === s.q.uid} onLock={() => toggleLock(s.q.uid)} onSwap={() => setSwap(swap === s.q.uid ? null : s.q.uid)} onReroll={() => reroll(s.q.uid)} />
                      {swap === s.q.uid && (
                        <div className="te-swap" role="region" aria-label="Chọn câu thay thế">
                          <div className="te-swap-h"><b>Thay bằng câu khác cùng dòng ({candidates.length} câu)</b><button type="button" className="btn btn-sm btn-ghost" onClick={() => setSwap(null)}>Đóng</button></div>
                          {candidates.length === 0 ? <p className="te-note">Không còn câu nào khác khớp dòng này ở mức “{POLICY_SHORT[d.policy]}”.</p> : (
                            <ul>
                              {candidates.slice(0, 40).map((c) => (
                                <li key={c.uid}><span className="te-snip">{stemSnippet(c.latex, 140)}{usedAtLabel(idx, c.uid) && <em className="te-note"> · Đã dùng ở: {usedAtLabel(idx, c.uid)} (bạn đã cho phép dùng lại)</em>}</span><button type="button" className="btn btn-sm" onClick={() => replace(s.q.uid, c.uid)}>Dùng câu này</button></li>
                              ))}
                              {candidates.length > 40 && <li className="te-note">Còn {candidates.length - 40} câu nữa; thu hẹp dòng ma trận để xem.</li>}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>

          {variants.length > 0 && total > 0 && d.withKeys && (
            <section className="panel" aria-label="Bảng đáp án">
              <h2>Bảng đáp án các mã đề</h2>
              <div style={{ overflowX: 'auto' }}>
                <table className="keytbl">
                  <thead>
                    <tr>
                      <th>Mã đề</th>
                      {variants[0].parts.p1.map((_, i) => <th key={'a' + i}>I.{i + 1}</th>)}
                      {variants[0].parts.p2.map((_, i) => <th key={'b' + i}>II.{i + 1}</th>)}
                      {variants[0].parts.p3.map((_, i) => <th key={'c' + i}>III.{i + 1}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {variants.map((v) => (
                      <tr key={v.code}>
                        <td>{v.code}</td>
                        {[...v.parts.p1, ...v.parts.p2, ...v.parts.p3].map((s, i) => <td key={i}>{s.key}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <div className="te-next">
            <button type="button" className="btn" onClick={() => goStep(1)}>← Quay lại chọn câu</button>
            <button type="button" className="btn btn-dark" onClick={() => goStep(3)}>Tiếp: Cấu hình &amp; Xuất →</button>
          </div>
          </>}
        </div>

        <aside className={`aside te-aside${step === 3 ? ' is-wide' : ''}`} aria-label="Thiết lập đề">
          <div className="panel te-sum" aria-live="polite">
            <div className="te-big"><b>{total}</b><span>câu</span><b>{fmtScore(centi)}</b><span>điểm</span></div>
            <div className="te-parts">{PARTS.filter((p) => counts[p] > 0).map((p) => <span key={p} className="code-tag">{PART_NAME[p].split(' · ')[0]}: {counts[p]}</span>)}</div>
            {total > 0 && step !== 1 && (
              <div className="te-lv" role="img" aria-label={byLevel.map((x) => `${LEVEL_LABEL[x.l]} ${x.n}`).join(', ')}>
                <div className="te-lv-bar">{byLevel.filter((x) => x.n).map((x) => <i key={x.l} style={{ flexGrow: x.n, background: LEVEL_COLOR[x.l] }} />)}</div>
                <div className="te-lv-key">{byLevel.map((x) => <span key={x.l}><i style={{ background: LEVEL_COLOR[x.l] }} />{x.l} {x.n}</span>)}</div>
              </div>
            )}
          </div>

          {step === 1 && rows.length > 0 && <SlotStats s={slotLevels} filled={rows.filter((r) => alloc.picks[r.id]?.length).length} total={rows.length} />}

          {step === 3 && <div className="panel">
            <h2>Thông tin đề</h2>
            <label className="lbl">Sở / phòng giáo dục<input className="inp" type="text" placeholder="SỞ GD&ĐT …" value={d.info.dept} onChange={(e) => upd({ info: { ...d.info, dept: e.target.value } })} /></label>
            <label className="lbl">Trường<input className="inp" type="text" placeholder="TRƯỜNG THPT …" value={d.info.school} onChange={(e) => upd({ info: { ...d.info, school: e.target.value } })} /></label>
            <label className="lbl">Tổ / bộ môn<input className="inp" type="text" value={d.info.group} onChange={(e) => upd({ info: { ...d.info, group: e.target.value } })} /></label>
            <label className="lbl">Kỳ thi<input className="inp" type="text" value={d.info.title} onChange={(e) => upd({ info: { ...d.info, title: e.target.value } })} /></label>
            <div className="grid2">
              <label className="lbl">Môn<input className="inp" type="text" value={d.info.subject} onChange={(e) => upd({ info: { ...d.info, subject: e.target.value } })} /></label>
              <label className="lbl">Thời gian (phút)<input className="inp" type="number" min={1} max={600} value={d.info.minutes} onChange={(e) => upd({ info: { ...d.info, minutes: Math.max(1, Math.min(600, Number(e.target.value) || 1)) } })} /></label>
            </div>
            <label className="lbl">Ghi chú dưới thời gian<input className="inp" type="text" placeholder="(Đề thi có … trang)" value={d.info.note} onChange={(e) => upd({ info: { ...d.info, note: e.target.value } })} /></label>
          </div>}

          {step === 3 && <div className="panel" style={{ gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <h2>Số mã đề</h2>
              <div className="stepper">
                <button type="button" aria-label="Bớt một mã đề" onClick={() => upd({ count: Math.max(1, d.count - 1) })}>−</button>
                <span aria-live="polite">{d.count}</span>
                <button type="button" aria-label="Thêm một mã đề" onClick={() => upd({ count: Math.min(24, d.count + 1) })}>+</button>
              </div>
            </div>
            <label className="lbl">Mã đề đầu tiên<input className="inp" type="number" min={1} max={9999} value={d.firstCode} onChange={(e) => upd({ firstCode: Math.max(1, Math.min(9999, Number(e.target.value) || 101)) })} /></label>
            <div className="divider" />
            <label className="lbl">Điểm tối đa mỗi câu tự luận<input className="inp" type="number" min={0} max={10} step={0.25} value={d.scoring.p4 / 100} onChange={(e) => upd({ scoring: { ...d.scoring, p4: Math.max(0, Math.min(1000, Math.round((Number(e.target.value) || 0) * 100))) } })} /></label>
            <p className="te-note">Điểm tối đa mỗi câu: Phần I {fmtScore(d.scoring.p1)}, Phần II {fmtScore(d.scoring.p2)}, Phần III {fmtScore(d.scoring.p3)}. Điểm thực tế của câu Đúng/Sai tính theo số ý đúng: 1 ý {fmtScore(DS_POINTS_CENTI[1])}, 2 ý {fmtScore(DS_POINTS_CENTI[2])}, 3 ý {fmtScore(DS_POINTS_CENTI[3])}, 4 ý {fmtScore(DS_POINTS_CENTI[4])}.</p>
            <div className="divider" />
            <label className="sw">Trộn thứ tự câu trong từng phần<input type="checkbox" checked={d.shuffleQuestions} onChange={(e) => upd({ shuffleQuestions: e.target.checked })} /></label>
            <label className="sw">Trộn phương án A, B, C, D<input type="checkbox" checked={d.shuffleOptions} onChange={(e) => upd({ shuffleOptions: e.target.checked })} /></label>
            <label className="sw">Tạo tệp đáp án cho giáo viên (không nằm trong PDF đề)<input type="checkbox" checked={d.withKeys} onChange={(e) => upd({ withKeys: e.target.checked })} /></label>
            <p className="te-note">Mã đầu giữ nguyên thứ tự và phương án gốc; các mã sau được trộn. Câu được chép nguyên văn.</p>
          </div>}

          <div className="te-export" ref={refExport}>
            {step !== 3 && <button type="button" className="btn btn-dark" style={{ height: 44 }} onClick={() => goStep(step === 1 ? 2 : 3)}>{step === 1 ? 'Tiếp: Xem kết quả →' : 'Tiếp: Cấu hình & Xuất →'}</button>}
            {step === 3 && <>
            <button type="button" className="btn btn-dark" style={{ height: 48 }} disabled={!canExport || busy || !desktop} onClick={() => { void saveToLibrary(); }}>{busy ? 'Đang lưu…' : 'Lưu vào Thư viện đề'}</button>
            <button type="button" className="btn btn-outline" style={{ height: 44 }} disabled={!saved || saved.sig !== draftSig || busy || !desktop} title={saved && saved.sig === draftSig ? 'PDF từng mã đề và gói ZIP giáo viên/học sinh' : 'Lưu vào Thư viện đề trước (đề đã đổi sau lần lưu gần nhất)'} onClick={() => setExportDlg(true)}>Xuất PDF từng mã / ZIP…</button>
            {!desktop && <span className="te-note">Lưu vào Thư viện đề và biên dịch PDF chỉ có trong bản cài trên Windows. Ở đây xem được mã .tex.</span>}
            <div className="grid2" style={{ gap: 10 }}>
              <button type="button" className="btn btn-outline" style={{ height: 44 }} disabled={!canExport || busy} onClick={desktop ? () => { void exportFolder(); } : viewTex}>{desktop ? 'Xuất thư mục .tex' : 'Xem mã .tex'}</button>
              <button type="button" className="btn btn-ghost" style={{ height: 44 }} disabled title="Xuất Word sẽ làm sau">Xuất Word · sắp có</button>
            </div>
            </>}
            {blockers.length > 0
              ? <p className="te-ready bad" role="status"><IcAlert size={14} />Chưa lưu được: {blockers.join(' · ')}.{total > 0 && <> <button type="button" className="linkbtn" onClick={() => { if (step === 3) setStep(1); setTimeout(() => jump(refWarn), 50); }}>Xem chi tiết</button></>}</p>
              : <p className="te-ready ok" role="status"><IcCheck />Sẵn sàng lưu: {total} câu, {d.count} mã đề.</p>}
          </div>
        </aside>
      </div>
      {tplDlg && <ExamTemplatesDialog draft={d} onToast={toast} onClose={() => setTplDlg(false)} onApply={(next, prev, note) => { setUndoTpl({ prev, note }); setD(next); setSwap(null); }} />}
      {exportDlg && saved && <ExamExportDialog id={saved.id} name={saved.name} onToast={toast} onClose={() => setExportDlg(false)} />}
    </>
  );
}
