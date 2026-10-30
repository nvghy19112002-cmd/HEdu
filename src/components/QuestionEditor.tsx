// Trình soạn câu hỏi DÙNG CHUNG cho màn “Câu hỏi mới” và ngăn sửa bên phải ở Ngân hàng (Issue #3).
// Một nơi duy nhất lo: đọc câu (parseExTest), kiểm tra, ID6, kiểm tra trùng, lưu, nháp, xem trước, Xem chuẩn.
// Bố cục: thanh ngữ cảnh gọn + bảng “Thuộc tính” gập được, hai khung (Mã LaTeX | Xem trước), dải trạng thái.
import { useDeferredValue, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useApp, type NewAt } from '../app-context';
import { chapters, firstLocation, getTaxonomy, grades } from '../lib/curriculum';
import { checkQuestion, type Issue } from '../lib/check';
import { findDuplicates } from '../lib/dup';
import { buildExTest, parseExTest, TEMPLATES, type ParsedQuestion } from '../lib/extest';
import { questionCode, seqLabel } from '../lib/id';
import { idStatus, LATEX_ID_LABEL, strictCode } from '../lib/idsync';
import { sameCode, writeHeadId } from '../lib/idtex';
import { commitRecs, getRec, keepNoId, makeRec } from '../lib/idreview';
import { taxRevision } from '../lib/taxpath';
import { useEffectiveOf } from './IdReviewControl';
import { saveQuestion, useBank } from '../lib/store';
import { shortName } from '../lib/taxonomy';
import { isTikzReady } from '../lib/tikz';
import { LEVEL_LABEL, LEVELS, TYPE_LABEL, TYPES, type Level, type Location, type QType, type Question } from '../lib/types';
import { CompiledView } from './CompiledView';
import { IcAlert, IcCheckCircle } from './Icons';
import { LatexEditor, type LatexEditorHandle } from './LatexEditor';
import { QuestionView } from './QuestionView';
import { SymbolPalette } from './SymbolPalette';

const DRAFT_KEY = 'hedu.draft.v1';

interface Draft { latex: string; loc: Location; level: Level; tags: string[] }

function loadDraft(): Draft | null {
  try { const r = localStorage.getItem(DRAFT_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function saveDraft(d: Draft | null) {
  try { if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); else localStorage.removeItem(DRAFT_KEY); } catch { /* bỏ qua */ }
}

/** Đổi loại câu mà vẫn giữ đề bài, phương án, lời giải đã gõ */
export function convertType(latex: string, p: ParsedQuestion, to: QType): string {
  if (!latex.trim() || !p.stem) return TEMPLATES[to];
  const tpl = parseExTest(TEMPLATES[to]);
  const next: ParsedQuestion = { ...p, type: to };
  if (to === 'tn' || to === 'ds') {
    next.options = p.options.length === 4 ? p.options.map((o, i) => ({ ...o, correct: to === 'tn' ? i === Math.max(0, p.options.findIndex((x) => x.correct)) : o.correct })) : tpl.options;
    next.shortAnswer = null;
  } else {
    next.options = [];
    next.shortAnswer = to === 'tln' ? p.shortAnswer ?? 'đáp số' : null;
  }
  return buildExTest(next, { id: p.idComment ?? undefined });
}

export interface QuestionEditorProps {
  /** câu đang sửa; bỏ trống = câu mới (có bản nháp tự lưu) */
  editing?: Question;
  variant: 'page' | 'drawer';
  onDirty?(dirty: boolean): void;
  onSaved?(q: Question): void;
  /** nút Đóng của ngăn sửa */
  onClose?(): void;
  /** Câu mới từ Ngân hàng: gợi ý vị trí (và mức độ) đang duyệt. Không bao giờ đè bản nháp chưa lưu mà không hỏi. */
  prefill?: NewAt;
  /** nút "Về Ngân hàng" (khi màn Soạn được mở từ Ngân hàng) */
  onBack?(): void;
  /** để bên ngoài (ngăn sửa) hỏi “có rời đi được không” theo cùng một cách với go() */
  leaveRef?: MutableRefObject<((proceed: () => void) => boolean) | null>;
}

export function QuestionEditor({ editing, variant, onDirty, onSaved, onClose, leaveRef, prefill, onBack }: QuestionEditorProps) {
  const { go, toast, setGuard } = useApp();
  const { questions } = useBank();

  const defaultLatex = () => { const sample = questions[0]; return sample ? sample.latex.replace('x^3 - 3x^2 + 2', 'x^3 - 3x^2 + 4') : TEMPLATES.tn; };
  const prefillLoc = (): Location | null => (prefill ? { grade: prefill.grade, chapterId: prefill.chapterId, lessonId: prefill.lessonId, formId: prefill.formId } : null);
  const boot = useMemo<{ init: Draft; conflict: boolean }>(() => {
    if (editing) return { init: { latex: editing.latex, loc: { grade: editing.grade, chapterId: editing.chapterId, lessonId: editing.lessonId, formId: editing.formId }, level: editing.level, tags: [...editing.tags] }, conflict: false };
    const dl = defaultLatex();
    const d = loadDraft();
    const real = !!d && d.latex !== dl; // bản nháp có nội dung do người dùng gõ (không phải mẫu mặc định)
    const pre: Draft = { latex: dl, loc: prefillLoc() ?? firstLocation(12), level: prefill?.level ?? 'TH', tags: [] };
    if (d && (!prefill || real)) return { init: d, conflict: !!prefill && real };
    return { init: pre, conflict: false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const init = boot.init;
  const [conflict, setConflict] = useState(boot.conflict);

  const [latex, setLatex] = useState(init.latex);
  const [loc, setLoc] = useState<Location>(init.loc);
  const [level, setLevel] = useState<Level>(init.level);
  const [tags, setTags] = useState<string[]>(init.tags);
  const [tagInput, setTagInput] = useState<string | null>(null);
  const [pos, setPos] = useState({ line: 1, col: 1 });
  const [attrs, setAttrs] = useState(!editing);
  const [pane, setPane] = useState<'code' | 'view'>('code'); // chỉ dùng khi khung hẹp
  // 3 chế độ xem (V3): Mã / Mã + Xem trước / Xem trước. Lưu theo máy, không đụng dữ liệu câu hỏi.
  const [vmode, setVmodeState] = useState<'code' | 'both' | 'view'>(() => { try { const v = localStorage.getItem('hedu.qemode'); return v === 'code' || v === 'view' ? v : 'both'; } catch { return 'both'; } });
  const setVmode = (v: 'code' | 'both' | 'view') => { setVmodeState(v); try { localStorage.setItem('hedu.qemode', v); } catch { /* không lưu được thì thôi */ } };
  const [mode, setMode] = useState<'quick' | 'exact'>('quick');
  const [snap, setSnap] = useState<string | null>(null);
  const [tex, setTex] = useState<'dang' | 'xong' | 'loi' | null>(null);
  const [showSol, setShowSol] = useState(true);
  const [details, setDetails] = useState(false);
  const [convertTo, setConvertTo] = useState<QType | null>(null);
  const [undo, setUndo] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<(() => void) | null>(null);
  const ed = useRef<LatexEditorHandle>(null);
  // Câu "Chưa có ID": vị trí lưu chỉ là chỗ giữ. Chưa chọn vị trí thật thì không hiện mã, không ghi %[ID]; chọn Lớp/Chương/Bài/Dạng ⇒ thành vị trí thật.
  const effOf = useEffectiveOf();
  const noIdEff = useMemo(() => (editing ? effOf(editing) : null), [editing?.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  const wasNoId = !!noIdEff?.unclassified;
  const [placed, setPlaced] = useState(!wasNoId);
  const pickLoc = (l: Location) => { setLoc(l); setPlaced(true); };

  // Đọc, kiểm tra, xem trước theo bản “trễ”: gõ liên tục thì giao diện không bị khựng.
  const slow = useDeferredValue(latex);
  const parsed = useMemo(() => parseExTest(slow), [slow]);
  const issues = useMemo<Issue[]>(() => checkQuestion(parsed, slow), [parsed, slow]);
  const dups = useMemo(() => findDuplicates(slow, questions, editing?.uid), [slow, questions, editing?.uid]);
  const code = questionCode(loc, level);

  // ID trong LaTeX ↔ ID theo vị trí/mức độ đang chọn (bộ đọc chung idsync). Tính trên bản LaTeX đang gõ (không trễ) để nút lưu luôn đúng.
  const ids = useMemo(() => idStatus({ latex, level, ...loc }, getTaxonomy()), [latex, level, loc]);
  /** Câu đang sửa vốn KHỚP ID và giáo viên vừa đổi vị trí/mức độ trên giao diện ⇒ thao tác đó là căn cứ: thay ID khi lưu. */
  const movedFromSynced = useMemo(() => {
    if (!editing || ids.state !== 'lech') return false;
    const before = strictCode(editing, editing.level, getTaxonomy());
    const moved = loc.formId !== editing.formId || loc.lessonId !== editing.lessonId || loc.chapterId !== editing.chapterId || level !== editing.level;
    return moved && before.ok && !!ids.latex.raw && sameCode(ids.latex.raw, before.code);
  }, [editing, ids, loc, level]);
  /** ID trong LaTeX khác vị trí mà không phải do vừa đổi vị trí ⇒ giáo viên phải chọn bên đúng trước khi lưu. */
  const idConflict = ids.state === 'lech' && !movedFromSynced;
  /** Mã LaTeX sẽ lưu: thêm ID cho câu chưa có, thay ID khi giáo viên vừa đổi vị trí; còn lại giữ nguyên từng ký tự. */
  const latexToSave = (): string => {
    if (!placed || !ids.meta.ok) return latex;
    if (ids.state === 'chua-co-id') return writeHeadId(latex, ids.meta.code, 'them').latex;
    if (ids.state === 'lech' && movedFromSynced) return writeHeadId(latex, ids.meta.code, 'thay').latex;
    return latex;
  };
  const useLatexId = () => { const r = ids.latex.resolved; if (r) { pickLoc(r.loc); setLevel(r.level); } };
  const useMetaId = () => { if (ids.meta.ok) setLatex(writeHeadId(latex, ids.meta.code, 'thay').latex); };

  const dirty = editing
    ? latex !== editing.latex || level !== editing.level || loc.formId !== editing.formId || loc.lessonId !== editing.lessonId || placed !== !wasNoId || tags.join('|') !== editing.tags.join('|')
    : false;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => { onDirty?.(dirty); }, [dirty, onDirty]);

  // Tự lưu bản nháp CÂU MỚI (câu đang sửa thì chỉ lưu khi bấm Lưu)
  useEffect(() => {
    if (editing) return;
    const t = setTimeout(() => saveDraft({ latex, loc, level, tags }), 400);
    return () => clearTimeout(t);
  }, [latex, loc, level, tags, editing]);

  const save = (): boolean => {
    if (!parsed.stem) { toast('Đề bài đang trống — chưa lưu.'); return false; }
    const exact = dups.find((d) => d.score === 1);
    if (exact) { toast(`Câu này trùng hẳn với ${seqLabel(exact.question.seq)} — chưa lưu.`); return false; }
    if (placed && idConflict) { setAttrs(true); toast('ID trong LaTeX khác vị trí đang chọn — hãy chọn bên đúng (ngay dưới thanh vị trí) rồi lưu.'); return false; }
    const hadReview = editing?.review;
    const idWarn = !placed ? '' : ids.state === 'id-loi' ? ' — lưu ý: ID trong LaTeX đang lỗi, cần sửa' : ids.state === 'vi-tri-loi' ? ' — lưu ý: vị trí chưa ra được ID hợp lệ' : '';
    const q = saveQuestion({ latex: latexToSave(), level, tags, ...loc }, editing?.uid);
    if (!editing) saveDraft(null);
    if (editing && wasNoId && noIdEff) {
      // Vẫn chưa chọn vị trí ⇒ giữ câu trong mục "Chưa có ID" dù nội dung đổi. Đã chọn vị trí ⇒ rời mục: giáo viên chọn, chưa xác minh.
      const prev = getRec(q.uid);
      const keep = { ...(prev?.why ? { why: prev.why } : {}), ...(prev?.orig ? { orig: prev.orig } : {}), ...(prev?.prop ? { prop: prev.prop } : {}) };
      void commitRecs([[q.uid, placed ? makeRec(q, { form: 'chua', src: 'tay', taxRev: taxRevision(getTaxonomy()), why: 'Giáo viên chọn vị trí trong Sửa câu', ...(prev?.orig ? { orig: prev.orig } : {}) }) : makeRec(q, { form: noIdEff.form === 'gv' ? 'chua' : noIdEff.form, src: noIdEff.src ?? 'tay', taxRev: taxRevision(getTaxonomy()), ...keepNoId(noIdEff), ...keep })]]);
    }
    toast((editing ? `Đã cập nhật ${!placed ? 'câu Chưa có ID' : questionCode(q, q.level)} · ${seqLabel(q.seq)}${hadReview && !q.review ? ' — nội dung đổi nên trạng thái về “Chưa kiểm tra”' : ''}` : `Đã lưu vào ngân hàng: ${questionCode(q, q.level)} · ${seqLabel(q.seq)}`) + idWarn);
    onSaved?.(q);
    return true;
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  // Chặn rời đi khi còn thay đổi chưa lưu (đóng ngăn sửa, Esc, bấm ra ngoài, đổi màn, Ctrl K…)
  const leave = (proceed: () => void): boolean => {
    if (!dirtyRef.current) { proceed(); return true; }
    setLeaving(() => proceed);
    return false;
  };
  const leaveFn = useRef(leave);
  leaveFn.current = leave;
  useEffect(() => {
    const g = (proceed: () => void) => leaveFn.current(proceed);
    setGuard(g);
    if (leaveRef) leaveRef.current = g;
    return () => { setGuard(null); if (leaveRef) leaveRef.current = null; };
  }, [setGuard, leaveRef]);

  // Esc khi đang hỏi “thay đổi chưa lưu” = Tiếp tục sửa (không đóng ngăn sửa)
  useEffect(() => {
    if (!leaving) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); setLeaving(null); } };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [leaving]);

  // Ctrl+S chỉ lưu câu đang sửa
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Mã đổi thì kết quả Xem chuẩn cũ không còn đúng: giữ ảnh cũ nhưng báo rõ
  const stale = mode === 'exact' && snap != null && snap !== latex;
  const startExact = () => { setSnap(latex); setTex('dang'); setMode('exact'); setPane('view'); };

  const chs = chapters(loc.grade);
  const chapter = chs.find((c) => c.id === loc.chapterId) ?? chs[0];
  const lesson = chapter?.lessons.find((l) => l.id === loc.lessonId) ?? chapter?.lessons[0];
  const byBranch = chs.reduce<Record<string, typeof chs>>((m, c) => ({ ...m, [c.monName]: [...(m[c.monName] ?? []), c] }), {});

  const addTag = () => {
    const t = (tagInput ?? '').trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput(null);
  };

  const askConvert = (to: QType) => { if (parsed.type !== to) setConvertTo(to); };
  const doConvert = () => {
    if (!convertTo) return;
    setUndo(latex);
    setLatex(convertType(latex, parsed, convertTo));
    setConvertTo(null);
  };

  const errors = issues.filter((i) => i.level === 'loi');
  const warns = issues.filter((i) => i.level === 'canh');
  const title = editing ? `Sửa câu ${seqLabel(editing.seq)}` : 'Câu hỏi mới';
  const statusText = editing ? (dirty ? 'Có thay đổi chưa lưu' : 'Đã lưu trong ngân hàng') : 'Bản nháp · đã tự lưu';

  return (
    <div className={`qe qe-${variant}`}>
      <header className="qe-head">
        <div className="qe-title">
          <h1>{title}</h1>
          <span className={`status-chip${editing && dirty ? ' dirty' : ''}`} role="status">{statusText}</span>
        </div>
        <div className="head-actions">
          {onBack && variant === 'page' && <button type="button" className="btn btn-outline" onClick={onBack}>‹ Về Ngân hàng</button>}
          {editing && variant === 'page' && <button type="button" className="btn btn-outline" onClick={() => go({ screen: 'editor', fromBank: !!onBack })}>+ Câu mới</button>}
          <button type="button" className="btn btn-accent" onClick={() => save()} disabled={!!editing && !dirty} title="Ctrl S">{editing ? 'Lưu câu hỏi' : 'Lưu vào ngân hàng'}</button>
          {variant === 'drawer' && <button type="button" className="btn btn-outline" onClick={onClose}>Đóng</button>}
        </div>
      </header>

      {conflict && prefill && (
        <div className="qe-confirm qe-modal" role="alertdialog" aria-modal="true" aria-label="Bản nháp chưa lưu">
          <span><b>Đang có bản nháp câu hỏi chưa lưu.</b> Bạn vừa chọn soạn câu mới ở <b>{prefill.label}</b>. Muốn làm gì?</span>
          <div className="head-actions">
            <button type="button" className="btn btn-sm btn-accent" autoFocus onClick={() => setConflict(false)}>Giữ bản nháp</button>
            <button type="button" className="btn btn-sm" onClick={() => { setLatex(defaultLatex()); setLoc(prefillLoc() ?? firstLocation(12)); setLevel(prefill.level ?? 'TH'); setTags([]); setConflict(false); }}>Bỏ bản nháp, soạn câu mới ở đây</button>
          </div>
        </div>
      )}
      {leaving && (
        <div className="qe-confirm qe-modal" role="alertdialog" aria-modal="true" aria-label="Thay đổi chưa lưu">
          <span><b>Câu này có thay đổi chưa lưu.</b> Muốn đóng thì chọn một trong ba:</span>
          <div className="head-actions">
            <button type="button" className="btn btn-sm btn-accent" onClick={() => { const go2 = leaving; if (save()) { setLeaving(null); go2(); } }}>Lưu rồi tiếp tục</button>
            <button type="button" className="btn btn-sm" onClick={() => { const go2 = leaving; setLeaving(null); go2(); }}>Bỏ thay đổi</button>
            <button type="button" className="btn btn-sm" onClick={() => setLeaving(null)} autoFocus>Tiếp tục sửa</button>
          </div>
        </div>
      )}

      <div className="qe-ctx">
        <nav className="crumbs" aria-label="Vị trí trong khung chương trình">
          {placed ? (
            <>
              <span>Lớp {loc.grade}</span><span aria-hidden="true">/</span>
              <span>{chapter ? shortName(chapter.name) : '—'}</span><span aria-hidden="true">/</span>
              <b>{lesson ? shortName(lesson.name) : '—'}</b>
            </>
          ) : <b>Chưa có ID{noIdEff?.rec?.lop != null ? ` · Lớp ${noIdEff.rec.lop}` : ''}</b>}
        </nav>
        {placed ? <span className="qe-chip mono" title="ID tự động theo Chương trình 2018">{code}</span> : <span className="qe-chip" title="Câu chưa được đặt vào Dạng nào">Chưa có ID</span>}
        <span className="qe-chip">{TYPE_LABEL[parsed.type]}</span>
        <span className="qe-chip">{LEVEL_LABEL[level]}</span>
        <button type="button" className="btn btn-sm qe-attrbtn" aria-expanded={attrs} onClick={() => setAttrs(!attrs)}>Thuộc tính {attrs ? '▴' : '▾'}</button>
      </div>

      {!placed && (
        <div className="qe-idbar sys-hint" role="status" aria-label="ID trong LaTeX">
          <span>Câu chưa có ID — khi lưu, HEdu <b>không</b> thêm ID vào LaTeX. Muốn gán: mở Thuộc tính, chọn Lớp → Chương → Bài → Dạng.</span>
          {!attrs && <button type="button" className="btn btn-sm" onClick={() => setAttrs(true)}>Chọn vị trí</button>}
        </div>
      )}
      {placed && ids.state !== 'khop' && (
        <div className={ids.state === 'chua-co-id' || movedFromSynced ? 'qe-idbar sys-hint' : 'qe-idbar qe-confirm'} role={idConflict ? 'alert' : 'status'} aria-label="ID trong LaTeX">
          {ids.state === 'chua-co-id' && ids.meta.ok && <span>LaTeX chưa có ID — khi lưu, HEdu ghi <b className="mono">%[{ids.meta.code}]</b> ngay sau <span className="mono">{'\\begin{ex}'}</span> (không đổi gì khác).</span>}
          {movedFromSynced && ids.meta.ok && <span>Thầy/cô vừa đổi vị trí/mức độ: khi lưu, ID trong LaTeX đổi <b className="mono">{ids.latex.raw}</b> → <b className="mono">{ids.meta.code}</b>.</span>}
          {idConflict && ids.meta.ok && (
            <>
              <span>ID trong LaTeX <b className="mono">{ids.latex.raw}</b> khác ID theo vị trí đang chọn <b className="mono">{ids.meta.code}</b>. Bên nào đúng?</span>
              <span className="head-actions">
                <button type="button" className="btn btn-sm" onClick={useLatexId}>Theo ID trong LaTeX (đổi vị trí)</button>
                <button type="button" className="btn btn-sm" onClick={useMetaId}>Theo vị trí (thay ID trong LaTeX)</button>
              </span>
            </>
          )}
          {ids.state === 'id-loi' && (
            <>
              <span>ID trong LaTeX{ids.latex.raw ? <> <b className="mono">{ids.latex.raw}</b></> : null}: {LATEX_ID_LABEL[ids.latex.state]}. HEdu không tự sửa.</span>
              {ids.meta.ok && ids.latex.head.ids.length === 1 && <button type="button" className="btn btn-sm" onClick={useMetaId}>Thay bằng {ids.meta.code} (theo vị trí)</button>}
            </>
          )}
          {ids.state === 'vi-tri-loi' && <span>Vị trí đang chọn chưa ra được ID hợp lệ (thiếu Dạng hoặc cây có mã trùng) — chọn đủ Lớp → Chương → Bài → Dạng.</span>}
        </div>
      )}

      {attrs && (
        <div className="qe-attrs" role="group" aria-label="Thuộc tính câu hỏi">
          <div className="qe-grid">
            <label className="lbl">Lớp
              <select className="sel" value={placed ? loc.grade : ''} onChange={(e) => { if (e.target.value) pickLoc(firstLocation(Number(e.target.value))); }}>
                {!placed && <option value="">— Chưa có ID —</option>}
                {grades().map((g) => <option key={g} value={g}>Lớp {g}</option>)}
              </select>
            </label>
            <label className="lbl">Chương
              <select className="sel" disabled={!placed} value={placed ? chapter?.id ?? '' : ''} onChange={(e) => pickLoc(firstLocation(loc.grade, e.target.value))}>
                {!placed ? <option value="">—</option> : Object.entries(byBranch).map(([mon, list]) => (
                  <optgroup key={mon} label={mon}>
                    {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="lbl">Bài
              <select className="sel" disabled={!placed} value={placed ? lesson?.id ?? '' : ''} onChange={(e) => pickLoc(firstLocation(loc.grade, chapter?.id, e.target.value))}>
                {!placed ? <option value="">—</option> : (chapter?.lessons ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label className="lbl">Dạng toán
              <select className="sel" disabled={!placed} value={placed ? loc.formId : ''} onChange={(e) => pickLoc({ ...loc, formId: e.target.value })}>
                {!placed ? <option value="">—</option> : (lesson?.forms ?? []).map((f) => <option key={f.id} value={f.id}>{shortName(f.name)}</option>)}
              </select>
            </label>
          </div>
          <div className="qe-grid">
            <div className="lbl">Loại câu
              <div className="type-grid" role="group" aria-label="Loại câu">
                {TYPES.map((t) => (
                  <button key={t} type="button" aria-pressed={parsed.type === t} onClick={() => askConvert(t)}>{TYPE_LABEL[t]}</button>
                ))}
              </div>
            </div>
            <div className="lbl">Mức độ
              <div className="chips" role="group" aria-label="Mức độ">
                {LEVELS.map((l) => <button key={l} type="button" className="chip lv" aria-pressed={level === l} onClick={() => setLevel(l)}>{LEVEL_LABEL[l]}</button>)}
              </div>
            </div>
            <div className="lbl">Thẻ
              <div className="chips">
                {tags.map((t) => (
                  <span key={t} className="tag">{t}<button type="button" aria-label={`Bỏ thẻ ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))}>×</button></span>
                ))}
                {tagInput == null ? (
                  <button type="button" className="tag-add" onClick={() => setTagInput('')}>+ Thêm thẻ</button>
                ) : (
                  <input className="tag-input" autoFocus value={tagInput} aria-label="Tên thẻ mới" placeholder="Tên thẻ, Enter"
                    onChange={(e) => setTagInput(e.target.value)} onBlur={addTag}
                    onKeyDown={(e) => { if (e.key === 'Enter') addTag(); if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setTagInput(null); } }} />
                )}
              </div>
            </div>
            <div className="id-card">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <small>ID tự động</small>
                <span className="mono">{placed ? code : 'Chưa có ID'}</span>
              </div>
              <small>{editing ? seqLabel(editing.seq) : 'Số thứ tự cấp khi lưu'}</small>
            </div>
          </div>
        </div>
      )}

      {convertTo && (
        <div className="qe-confirm" role="alertdialog" aria-label="Đổi loại câu">
          <span>
            <b>Đổi sang “{TYPE_LABEL[convertTo]}”?</b> HEdu sẽ dựng lại mã LaTeX theo mẫu ex_test: khoảng trắng được chuẩn hoá và các dòng chú thích (%) trong câu bị bỏ. Bạn có thể hoàn tác ngay sau đó.
          </span>
          <div className="head-actions">
            <button type="button" className="btn btn-sm btn-accent" onClick={doConvert}>Đổi loại</button>
            <button type="button" className="btn btn-sm" onClick={() => setConvertTo(null)} autoFocus>Giữ nguyên</button>
          </div>
        </div>
      )}

      <div className="seg sm qe-vmode" role="group" aria-label="Chế độ xem">
        {([['code', 'Mã'], ['both', 'Mã + Xem trước'], ['view', 'Xem trước']] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={vmode === k} onClick={() => setVmode(k)}>{l}</button>
        ))}
      </div>

      <div className="qe-tabs" role="tablist" aria-label="Khung đang xem">
        <button type="button" role="tab" aria-selected={pane === 'code'} onClick={() => setPane('code')}>Mã LaTeX</button>
        <button type="button" role="tab" aria-selected={pane === 'view'} onClick={() => setPane('view')}>Xem trước</button>
      </div>

      <div className="qe-panes" data-pane={pane} data-vmode={vmode}>
        <section className="qe-code" aria-label="Mã LaTeX">
          <div className="qe-bar">
            <h2>Mã LaTeX</h2>
            <span className="qe-pos">ex_test · dòng {pos.line}, cột {pos.col}</span>
            <SymbolPalette onPick={(snippet, raw) => ed.current?.insert(snippet, { wrapMath: !raw })} />
          </div>
          <LatexEditor ref={ed} value={latex} onChange={setLatex} onCursor={(line, col) => setPos({ line, col })} />
        </section>

        <section className="qe-view" aria-label="Xem trước">
          <div className="qe-bar">
            <h2>Xem trước</h2>
            <div className="seg sm" role="group" aria-label="Kiểu xem trước">
              <button type="button" aria-pressed={mode === 'quick'} onClick={() => setMode('quick')}>Xem nhanh</button>
              <button type="button" aria-pressed={mode === 'exact'} disabled={!isTikzReady()} title={isTikzReady() ? 'Biên dịch nguyên câu bằng TeX Live' : 'Chỉ có ở bản cài trên Windows'} onClick={startExact}>Xem chuẩn</button>
            </div>
            <label className="sw"><input type="checkbox" checked={showSol} onChange={(e) => setShowSol(e.target.checked)} />Lời giải</label>
          </div>
          <div className="qe-sheet">
            {mode === 'exact' && snap != null ? (
              <>
                {stale && (
                  <div className="q-warn" role="status">
                    Mã đã đổi sau lần biên dịch này. <button type="button" className="linkbtn" onClick={startExact}>Dịch lại</button>
                  </div>
                )}
                <CompiledView key={snap} latex={snap} solution={showSol} onBack={() => setMode('quick')} onState={setTex} />
              </>
            ) : (
              <QuestionView p={parsed} number={1} raw={slow} showSolution={showSol} />
            )}
          </div>
        </section>
      </div>

      <footer className="qe-status" aria-label="Trạng thái kiểm tra">
        <span className={`qs ${errors.length ? 'bad' : 'ok'}`}>
          {errors.length ? <IcAlert size={15} /> : <IcCheckCircle size={15} />}
          {errors.length ? `${errors.length} lỗi cấu trúc` : 'Đã đọc được cú pháp'}
        </span>
        {warns.length > 0 && <span className="qs warn">{warns.length} điểm cần xem lại</span>}
        <span className={`qs ${tex === 'xong' && !stale ? 'ok' : tex === 'loi' ? 'bad' : 'idle'}`}>
          {tex == null ? 'TeX Live: chưa biên dịch' : tex === 'dang' ? 'TeX Live: đang biên dịch…' : tex === 'xong' ? (stale ? 'TeX Live: đã dịch bản cũ' : 'TeX Live: biên dịch được') : 'TeX Live: báo lỗi'}
        </span>
        {dups.length > 0 && (
          <span className={`qs ${dups[0].score === 1 || dups[0].kind === 'conflict' ? 'bad' : 'warn'}`}>
            {dups[0].score === 1 ? 'Trùng hẳn' : dups[0].kind === 'conflict' ? 'Mâu thuẫn đáp án' : 'Gần giống'} {questionCode(dups[0].question, dups[0].question.level)} · {Math.round(dups[0].score * 100)}%
          </span>
        )}
        {undo != null && <button type="button" className="linkbtn" onClick={() => { setLatex(undo); setUndo(null); }}>Hoàn tác đổi loại</button>}
        <button type="button" className="linkbtn qe-more" aria-expanded={details} onClick={() => setDetails(!details)}>{details ? 'Ẩn chi tiết' : 'Chi tiết'}</button>
      </footer>
      {details && (
        <div className="qe-details">
          <p className="sys-hint">“Đã đọc được cú pháp” là HEdu tự đọc cấu trúc, chưa phải TeX đã biên dịch. Bấm “Xem chuẩn” để TeX Live biên dịch thật.</p>
          {issues.filter((i) => i.level !== 'tin').length === 0 && <p className="sys-hint">Không có điểm nào cần xem lại.</p>}
          <ul>
            {issues.filter((i) => i.level !== 'tin').map((it, k) => (
              <li key={k} className={it.level}><span>{it.message}</span>{it.detail && <code>{it.detail}</code>}</li>
            ))}
          </ul>
          {dups.slice(0, 3).map((d) => (
            <p key={d.question.uid} className="sys-hint">
              {questionCode(d.question, d.question.level)} · {seqLabel(d.question.seq)} — giống {Math.round(d.score * 100)}%{' '}
              <button type="button" className="linkbtn" onClick={() => go({ screen: 'bank', openUid: d.question.uid })}>Mở</button>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
