// Tạo đề từ Ngân hàng: ma trận → xem trước (đúng như bản in) → lưu vào Thư viện đề để biên dịch PDF.
// Lõi chọn câu/trộn/đáp án/dựng .tex nằm ở lib/examgen.ts (có kiểm thử); bản nháp ở lib/examdraft.ts.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { QuestionView } from '../components/QuestionView';
import { useEffectiveOf } from '../components/IdReviewControl';
import { IcAlert, IcCheck, IcDice, IcLock, IcPlus, IcSwap, IcUnlock, IcX } from '../components/Icons';
import { chapters as chaptersOf, grades, useTaxonomy } from '../lib/curriculum';
import { allocate, brokenQuestions, candidatesFor, checkVariants, collect, countsOf, DS_POINTS_CENTI, eligible, examFiles, fmtScore, hasControlChars, LOST_LABEL, makeVariants, PART_NAME, PARTS, POLICY_LABEL, reconcile, specJson, totalCenti, variantFile, verified, type PartKey, type Policy, type Row, type Slot } from '../lib/examgen';
import { loadDraft, newRowId, rowsFromPick, saveDraft, scopeLabel, template2025, type Draft } from '../lib/examdraft';
import { parseExTest } from '../lib/extest';
import { createFromFiles, toSource } from '../lib/examsources';
import { requirementsMd, safeFolderName } from '../lib/texproject';
import { KHAIBAOCHUNG_TEX } from '../lib/texproject.template';
import { invoke, isDesktop } from '../lib/platform';
import { plainSnippet } from '../lib/snippet';
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

function RowAdder({ onAdd, onTemplate, defaultGrade }: { onAdd(r: Row): void; onTemplate(grade: number): void; defaultGrade: number }) {
  const [grade, setGrade] = useState(defaultGrade);
  const [chap, setChap] = useState('');
  const [les, setLes] = useState('');
  const [form, setForm] = useState('');
  const [type, setType] = useState<QType>('tn');
  const [level, setLevel] = useState<Level | 'any'>('NB');
  const [count, setCount] = useState(4);
  const chs = chaptersOf(grade);
  const lessons = chs.find((c) => c.id === chap)?.lessons ?? [];
  const forms = lessons.find((l) => l.id === les)?.forms ?? [];
  const add = () => {
    const scope = form ? { kind: 'form' as const, id: form } : les ? { kind: 'lesson' as const, id: les } : chap ? { kind: 'chapter' as const, id: chap } : { kind: 'grade' as const, id: String(grade) };
    onAdd({ id: newRowId(), scope, type, level: type === 'tn' ? level : 'any', count });
  };
  return (
    <div className="te-add" role="group" aria-label="Thêm dòng ma trận">
      <label className="lbl">Lớp<select className="sel" value={grade} onChange={(e) => { setGrade(Number(e.target.value)); setChap(''); setLes(''); setForm(''); }}>{[...grades()].reverse().map((g) => <option key={g} value={g}>Lớp {g}</option>)}</select></label>
      <label className="lbl">Chương<select className="sel" value={chap} onChange={(e) => { setChap(e.target.value); setLes(''); setForm(''); }}><option value="">Cả lớp</option>{chs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="lbl">Bài<select className="sel" value={les} disabled={!chap} onChange={(e) => { setLes(e.target.value); setForm(''); }}><option value="">Cả chương</option>{lessons.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      <label className="lbl">Dạng<select className="sel" value={form} disabled={!les} onChange={(e) => setForm(e.target.value)}><option value="">Mọi dạng</option>{forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
      <label className="lbl">Loại câu<select className="sel" value={type} onChange={(e) => setType(e.target.value as QType)}>{TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></label>
      <label className="lbl">Mức độ<select className="sel" value={type === 'tn' ? level : 'any'} disabled={type !== 'tn'} onChange={(e) => setLevel(e.target.value as Level | 'any')}><option value="any">Mọi mức</option>{LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}</select></label>
      <label className="lbl">Số câu<input className="inp" type="number" min={1} max={100} value={count} onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} /></label>
      <div className="te-add-acts">
        <button type="button" className="btn btn-dark" onClick={add}><IcPlus />Thêm dòng</button>
        <button type="button" className="btn btn-ghost" onClick={() => onTemplate(grade)} title="Mẫu của HEdu: 12 câu trắc nghiệm (5 NB, 4 TH, 3 VD), 4 câu đúng/sai, 6 câu trả lời ngắn trong cả lớp. Không phải quy định bắt buộc của Bộ; sửa tự do.">Dùng mẫu HEdu 12/4/6 cho lớp {grade}</button>
      </div>
    </div>
  );
}

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
  const exclude = useMemo(() => new Set(d.rejected), [d.rejected]);
  const exceptions = useMemo(() => new Set(Object.keys(d.exceptions)), [d.exceptions]);
  const alloc = useMemo(() => allocate(questions, d.rows, { policy: d.policy, eff: effOf, seed: d.seed, locked: d.locked, exclude, exceptions }), [questions, d.rows, d.policy, d.seed, d.locked, exclude, exceptions, effOf]);
  const picked = useMemo(() => collect(d.rows, alloc.picks, byUid), [d.rows, alloc, byUid]);
  const counts = countsOf(picked);
  const total = counts.p1 + counts.p2 + counts.p3 + counts.p4;
  const variants = useMemo(() => makeVariants(picked, { count: d.count, firstCode: d.firstCode, shuffleQuestions: d.shuffleQuestions, shuffleOptions: d.shuffleOptions, seed: d.seed, keepFirstOriginal: true }), [picked, d.count, d.firstCode, d.shuffleQuestions, d.shuffleOptions, d.seed]);
  const variant = variants[Math.min(shown, variants.length - 1)];
  const rowOf = useMemo(() => { const m = new Map<string, string>(); for (const [rid, us] of Object.entries(alloc.picks)) for (const u of us) m.set(u, rid); return m; }, [alloc]);
  const lockedSet = useMemo(() => new Set(Object.values(d.locked).flat()), [d.locked]);
  const missing = d.rows.reduce((a, r) => a + (alloc.deficit[r.id] ?? 0), 0);
  const issues = useMemo(() => [...checkVariants(variants), ...reconcile(d.rows, alloc, picked, variants, d.scoring).filter((i) => i.kind !== 'thieu-cau')], [variants, d.rows, alloc, picked, d.scoring]);
  const lostLocks = alloc.lost;
  const centi = totalCenti(counts, d.scoring);
  const picks = useMemo(() => PARTS.flatMap((p) => picked[p]), [picked]);
  const unverifiedN = useMemo(() => picks.filter((q) => !verified(effOf(q))).length, [picks, effOf]);
  const unreviewedN = picks.filter((q) => q.review !== 'approved').length;
  const keptN = variant ? PARTS.reduce((a, p) => a + variant.parts[p].filter((s) => s.note).length, 0) : 0;
  const byLevel = (['NB', 'TH', 'VD', 'VDC'] as Level[]).map((l) => ({ l, n: picks.filter((q) => q.level === l).length }));
  const defaultGrade = grades()[grades().length - 1] ?? 12;
  const broken = useMemo(() => brokenQuestions(questions), [questions]);

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

  const swapRow = swap ? d.rows.find((r) => r.id === rowOf.get(swap)) : undefined;
  const candidates = useMemo<Question[]>(() => (swapRow ? candidatesFor(questions, swapRow, { policy: d.policy, eff: effOf }, new Set(picks.map((q) => q.uid))) : []), [swapRow, questions, d.policy, effOf, picks]);

  const refMatrix = useRef<HTMLElement>(null);
  const refSheet = useRef<HTMLElement>(null);
  const refExport = useRef<HTMLDivElement>(null);
  const desktop = isDesktop();
  const canExport = total > 0 && missing === 0 && variants.length > 0 && issues.length === 0 && lostLocks.length === 0;
  const jump = (r: { current: HTMLElement | null }) => r.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const projectFiles = (name: string) => [
    ...examFiles(d.info, variants, { withKeys: d.withKeys }),
    { path: 'khaibaochung.tex', text: KHAIBAOCHUNG_TEX },
    { path: 'hedu-de.json', text: specJson({ info: d.info, rows: d.rows, policy: d.policy, seed: d.seed, scoring: d.scoring, variants, at: new Date().toISOString(), exceptions: d.exceptions, locked: d.locked }) },
    { path: 'CAN-CO-GI.md', text: requirementsMd(picks, '', name) },
  ];

  const saveToLibrary = async () => {
    if (!canExport || busy) return;
    setBusy(true);
    try {
      const name = `${d.info.title.trim() || 'Đề'} · ${new Date().toLocaleDateString('vi-VN')}`;
      const s = await createFromFiles(name, projectFiles(name), 'main.tex', variantFile(variants[0].code), picks.map(toSource));
      toast(`Đã lưu “${s.name}” vào Thư viện đề. Mở mục Đề thi để biên dịch PDF.`, { label: 'Mở Đề thi', run: () => go({ screen: 'examlib' }) });
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
      const out = await invoke<string>('export_tex_folder', { parent, name: folder, files: projectFiles(folder) });
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

  const rowsEmpty = d.rows.length === 0;

  return (
    <>
      <header className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="crumbs">Tạo đề / Đề mới</span>
          <h1>Tạo đề từ Ngân hàng</h1>
        </div>
        <nav className="te-steps" aria-label="Các bước">
          <button type="button" onClick={() => jump(refMatrix)}><i>1</i>Ma trận</button>
          <button type="button" onClick={() => jump(refSheet)}><i>2</i>Xem trước</button>
          <button type="button" onClick={() => jump(refExport)}><i>3</i>Xuất</button>
        </nav>
      </header>

      <div className="body-row">
        <div className="te-main">
          <section className="mx-sec" aria-label="Ma trận đề" ref={refMatrix}>
            <div className="mx-head">
              <h2>Ma trận đề</h2>
              <div className="seg" role="group" aria-label="Câu đủ điều kiện">
                {POLICIES.map((p) => <button key={p} type="button" aria-pressed={d.policy === p} title={POLICY_LABEL[p]} onClick={() => upd({ policy: p })}>{POLICY_SHORT[p]}</button>)}
              </div>
            </div>
            <p className="te-hint">Lấy câu: <b>{POLICY_LABEL[d.policy]}</b>.{d.policy === 'duyet' && ' Chưa có câu nào được giáo viên xác minh Dạng thì cứ dùng mức này.'}{d.policy === 'tat-ca' && ' Câu chưa duyệt sẽ có cảnh báo trên đề.'}{broken.length > 0 && <span className="te-bad"> {broken.length} câu có ký tự điều khiển lạ trong LaTeX nên bị loại khỏi tập ứng viên (vẫn còn nguyên trong Ngân hàng).</span>}</p>
            {broken.length > 0 && <details className="te-broken"><summary>Xem câu bị loại và nguyên nhân</summary><ul>{broken.slice(0, 50).map((b) => <li key={b.uid}>Câu #{b.seq} · <code>{b.uid}</code> · {b.why}</li>)}{broken.length > 50 && <li>… và {broken.length - 50} câu nữa</li>}</ul></details>}
            {rowsEmpty ? (
              <div className="te-empty">
                <b>Chưa có dòng nào.</b>
                <span>Mỗi dòng là một yêu cầu, vd “4 câu trắc nghiệm Nhận biết ở Chương 1”. Thêm dòng bên dưới hoặc bắt đầu từ mẫu HEdu 12/4/6 (chỉ là gợi ý, sửa toàn bộ được).</span>
                <div><button type="button" className="btn btn-dark" onClick={() => upd({ rows: template2025(defaultGrade) })}>Dùng mẫu HEdu 12/4/6 cho lớp {defaultGrade}</button></div>
              </div>
            ) : (
              <div className="te-rows" role="table" aria-label="Các dòng của ma trận">
                <div className="te-row te-row-h" role="row"><span>Phạm vi</span><span>Loại câu</span><span>Mức độ</span><span>Số câu</span><span>Kho câu</span><span /></div>
                {d.rows.map((r) => {
                  const pool = alloc.pool[r.id] ?? 0, def = alloc.deficit[r.id] ?? 0;
                  const name = scopeLabel(r.scope, tax);
                  return (
                    <div key={r.id} className={`te-row${def ? ' short' : ''}`} role="row">
                      <span className="te-scope" title={name ?? ''}>{name ?? <em>Mục này không còn trong cây</em>}</span>
                      <select className="sel" aria-label="Loại câu" value={r.type} onChange={(e) => { const t = e.target.value as QType; setRow(r.id, { type: t, level: t === 'tn' ? r.level : 'any' }); }}>{TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select>
                      <select className="sel" aria-label="Mức độ" value={r.level} onChange={(e) => setRow(r.id, { level: e.target.value as Level | 'any' })}><option value="any">Mọi mức</option>{LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}</select>
                      <div className="stepper" role="group" aria-label="Số câu">
                        <button type="button" aria-label="Bớt một câu" onClick={() => setRow(r.id, { count: Math.max(0, r.count - 1) })}>−</button>
                        <span aria-live="polite">{r.count}</span>
                        <button type="button" aria-label="Thêm một câu" onClick={() => setRow(r.id, { count: Math.min(200, r.count + 1) })}>+</button>
                      </div>
                      <div className="te-stock">
                        <div className="te-bar" aria-hidden="true"><i style={{ width: `${r.count ? Math.min(100, (pool / r.count) * 100) : 100}%` }} className={def ? 'bad' : pool < r.count * 2 ? 'low' : 'ok'} /></div>
                        {def ? <span className="te-lack"><IcAlert size={14} />Thiếu {def} câu · kho {pool}</span> : <span className="okmark"><IcCheck />Đủ · kho {pool}</span>}
                      </div>
                      <button type="button" className="ico" style={{ width: 32, height: 32 }} aria-label={`Bỏ dòng ${name ?? ''}`} onClick={() => delRow(r.id)}><IcX /></button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mx-foot">
              <button type="button" className="btn btn-sm" aria-expanded={adding} onClick={() => setAdding(!adding)}><IcPlus />Thêm dòng</button>
              {!rowsEmpty && <button type="button" className="btn btn-sm btn-ghost" onClick={() => { if (window.confirm('Xóa toàn bộ ma trận và các câu đã khóa?')) upd({ rows: [], locked: {}, rejected: [] }); }}>Xóa ma trận</button>}
              <span className="te-note">Mẫu HEdu 12/4/6 chỉ là gợi ý, không phải quy định của Bộ.</span>
            </div>
            {adding && <RowAdder defaultGrade={defaultGrade} onAdd={(r) => upd({ rows: [...d.rows, r] })} onTemplate={(g) => { upd({ rows: [...d.rows, ...template2025(g)] }); setAdding(false); }} />}
          </section>

          {(missing > 0 || unreviewedN > 0 || unverifiedN > 0 || keptN > 0 || issues.length > 0 || lostLocks.length > 0) && (total > 0 || lostLocks.length > 0) && (
            <section className="te-warn" aria-label="Lưu ý về đề" role="status">
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
              {missing > 0 && <p className="bad"><IcAlert size={16} />Còn thiếu {missing} câu so với ma trận. Hạ số câu, đổi mức lấy câu hoặc <button type="button" className="linkbtn" onClick={() => go({ screen: 'editor' })}>soạn thêm câu</button>. Chưa xuất được đề.</p>}
              {unreviewedN > 0 && <p><IcAlert size={16} />{unreviewedN} câu chưa được duyệt nội dung (chỉ vào đề qua ngoại lệ bạn đã xác nhận hoặc khi lấy “Mọi câu”).</p>}
              {unverifiedN > 0 && d.policy !== 'xac-minh' && <p><IcAlert size={16} />{unverifiedN} / {total} câu chưa được giáo viên xác minh Dạng và mức độ. “Đã duyệt nội dung” không phải là xác minh phân loại: số câu theo mức độ có thể lệch, và ID hợp lệ vẫn có thể sai lớp (từng có câu Toán 10 mang mã lớp 12). Khi ra đề chính thức hãy xem lại các câu này.</p>}
              {keptN > 0 && <p><IcAlert size={16} />{keptN} câu trong mã đang xem giữ nguyên thứ tự phương án vì không nhận diện chắc (rê vào nhãn “Giữ nguyên phương án” để xem lý do).</p>}
            </section>
          )}

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
                                <li key={c.uid}><span className="te-snip">{plainSnippet(c.latex, 120)}</span><button type="button" className="btn btn-sm" onClick={() => replace(s.q.uid, c.uid)}>Dùng câu này</button></li>
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
        </div>

        <aside className="aside te-aside" aria-label="Thiết lập đề">
          <div className="panel te-sum" aria-live="polite">
            <div className="te-big"><b>{total}</b><span>câu</span><b>{fmtScore(centi)}</b><span>điểm</span></div>
            <div className="te-parts">{PARTS.filter((p) => counts[p] > 0).map((p) => <span key={p} className="code-tag">{PART_NAME[p].split(' · ')[0]}: {counts[p]}</span>)}</div>
            {total > 0 && (
              <div className="te-lv" role="img" aria-label={byLevel.map((x) => `${LEVEL_LABEL[x.l]} ${x.n}`).join(', ')}>
                <div className="te-lv-bar">{byLevel.filter((x) => x.n).map((x) => <i key={x.l} style={{ flexGrow: x.n, background: LEVEL_COLOR[x.l] }} />)}</div>
                <div className="te-lv-key">{byLevel.map((x) => <span key={x.l}><i style={{ background: LEVEL_COLOR[x.l] }} />{x.l} {x.n}</span>)}</div>
              </div>
            )}
          </div>

          <div className="panel">
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
          </div>

          <div className="panel" style={{ gap: 12 }}>
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
            <label className="sw">Kèm bảng đáp án mọi mã đề<input type="checkbox" checked={d.withKeys} onChange={(e) => upd({ withKeys: e.target.checked })} /></label>
            <p className="te-note">Mã đầu giữ nguyên thứ tự và phương án gốc; các mã sau được trộn. Câu được chép nguyên văn.</p>
          </div>

          <div className="te-export" ref={refExport}>
            <button type="button" className="btn btn-dark" style={{ height: 48 }} disabled={!canExport || busy || !desktop} onClick={() => { void saveToLibrary(); }}>{busy ? 'Đang lưu…' : 'Lưu vào Thư viện đề'}</button>
            {!desktop && <span className="te-note">Lưu vào Thư viện đề và biên dịch PDF chỉ có trong bản cài trên Windows. Ở đây xem được mã .tex.</span>}
            <div className="grid2" style={{ gap: 10 }}>
              <button type="button" className="btn btn-outline" style={{ height: 44 }} disabled={!canExport || busy} onClick={desktop ? () => { void exportFolder(); } : viewTex}>{desktop ? 'Xuất thư mục .tex' : 'Xem mã .tex'}</button>
              <button type="button" className="btn btn-ghost" style={{ height: 44 }} disabled title="Xuất Word sẽ làm sau">Xuất Word · sắp có</button>
            </div>
            {!canExport && total > 0 && missing > 0 && <span className="te-note" style={{ color: 'var(--danger)' }}>Ma trận còn thiếu câu nên chưa xuất.</span>}
          </div>
        </aside>
      </div>
    </>
  );
}
