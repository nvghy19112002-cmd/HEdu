// Trình soạn câu hỏi DÙNG CHUNG cho màn “Câu hỏi mới” và ngăn sửa bên phải ở Ngân hàng (Issue #3).
// Một nơi duy nhất lo: đọc câu (parseExTest), kiểm tra, ID6, kiểm tra trùng, lưu, nháp, xem trước, Xem chuẩn.
// Bố cục: thanh ngữ cảnh gọn + bảng “Thuộc tính” gập được, hai khung (Mã LaTeX | Xem trước), dải trạng thái.
import { useDeferredValue, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useApp } from '../app-context';
import { chapters, firstLocation, grades } from '../lib/curriculum';
import { checkQuestion, type Issue } from '../lib/check';
import { findDuplicates } from '../lib/dup';
import { buildExTest, parseExTest, TEMPLATES, type ParsedQuestion } from '../lib/extest';
import { questionCode, seqLabel } from '../lib/id';
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
  /** để bên ngoài (ngăn sửa) hỏi “có rời đi được không” theo cùng một cách với go() */
  leaveRef?: MutableRefObject<((proceed: () => void) => boolean) | null>;
}

export function QuestionEditor({ editing, variant, onDirty, onSaved, onClose, leaveRef }: QuestionEditorProps) {
  const { go, toast, setGuard } = useApp();
  const { questions } = useBank();

  const init = useMemo<Draft>(() => {
    if (editing) return { latex: editing.latex, loc: { grade: editing.grade, chapterId: editing.chapterId, lessonId: editing.lessonId, formId: editing.formId }, level: editing.level, tags: [...editing.tags] };
    const d = loadDraft();
    if (d) return d;
    const sample = questions[0];
    return { latex: sample ? sample.latex.replace('x^3 - 3x^2 + 2', 'x^3 - 3x^2 + 4') : TEMPLATES.tn, loc: firstLocation(12), level: 'TH', tags: [] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [latex, setLatex] = useState(init.latex);
  const [loc, setLoc] = useState<Location>(init.loc);
  const [level, setLevel] = useState<Level>(init.level);
  const [tags, setTags] = useState<string[]>(init.tags);
  const [tagInput, setTagInput] = useState<string | null>(null);
  const [pos, setPos] = useState({ line: 1, col: 1 });
  const [attrs, setAttrs] = useState(!editing);
  const [pane, setPane] = useState<'code' | 'view'>('code'); // chỉ dùng khi khung hẹp
  const [mode, setMode] = useState<'quick' | 'exact'>('quick');
  const [snap, setSnap] = useState<string | null>(null);
  const [tex, setTex] = useState<'dang' | 'xong' | 'loi' | null>(null);
  const [showSol, setShowSol] = useState(true);
  const [details, setDetails] = useState(false);
  const [convertTo, setConvertTo] = useState<QType | null>(null);
  const [undo, setUndo] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<(() => void) | null>(null);
  const ed = useRef<LatexEditorHandle>(null);

  // Đọc, kiểm tra, xem trước theo bản “trễ”: gõ liên tục thì giao diện không bị khựng.
  const slow = useDeferredValue(latex);
  const parsed = useMemo(() => parseExTest(slow), [slow]);
  const issues = useMemo<Issue[]>(() => checkQuestion(parsed, slow), [parsed, slow]);
  const dups = useMemo(() => findDuplicates(slow, questions, editing?.uid), [slow, questions, editing?.uid]);
  const code = questionCode(loc, level);

  const dirty = editing
    ? latex !== editing.latex || level !== editing.level || loc.formId !== editing.formId || loc.lessonId !== editing.lessonId || tags.join('|') !== editing.tags.join('|')
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
    const hadReview = editing?.review;
    const q = saveQuestion({ latex, level, tags, ...loc }, editing?.uid);
    if (!editing) saveDraft(null);
    toast(editing ? `Đã cập nhật ${questionCode(q, q.level)} · ${seqLabel(q.seq)}${hadReview && !q.review ? ' — nội dung đổi nên trạng thái về “Chưa kiểm tra”' : ''}` : `Đã lưu vào ngân hàng: ${questionCode(q, q.level)} · ${seqLabel(q.seq)}`);
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
          {editing && variant === 'page' && <button type="button" className="btn btn-outline" onClick={() => go({ screen: 'editor' })}>+ Câu mới</button>}
          <button type="button" className="btn btn-accent" onClick={() => save()} disabled={!!editing && !dirty} title="Ctrl S">{editing ? 'Lưu câu hỏi' : 'Lưu vào ngân hàng'}</button>
          {variant === 'drawer' && <button type="button" className="btn btn-outline" onClick={onClose}>Đóng</button>}
        </div>
      </header>

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
          <span>Lớp {loc.grade}</span><span aria-hidden="true">/</span>
          <span>{chapter ? shortName(chapter.name) : '—'}</span><span aria-hidden="true">/</span>
          <b>{lesson ? shortName(lesson.name) : '—'}</b>
        </nav>
        <span className="qe-chip mono" title="ID tự động theo Chương trình 2018">{code}</span>
        <span className="qe-chip">{TYPE_LABEL[parsed.type]}</span>
        <span className="qe-chip">{LEVEL_LABEL[level]}</span>
        <button type="button" className="btn btn-sm qe-attrbtn" aria-expanded={attrs} onClick={() => setAttrs(!attrs)}>Thuộc tính {attrs ? '▴' : '▾'}</button>
      </div>

      {attrs && (
        <div className="qe-attrs" role="group" aria-label="Thuộc tính câu hỏi">
          <div className="qe-grid">
            <label className="lbl">Lớp
              <select className="sel" value={loc.grade} onChange={(e) => setLoc(firstLocation(Number(e.target.value)))}>
                {grades().map((g) => <option key={g} value={g}>Lớp {g}</option>)}
              </select>
            </label>
            <label className="lbl">Chương
              <select className="sel" value={chapter?.id ?? ''} onChange={(e) => setLoc(firstLocation(loc.grade, e.target.value))}>
                {Object.entries(byBranch).map(([mon, list]) => (
                  <optgroup key={mon} label={mon}>
                    {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="lbl">Bài
              <select className="sel" value={lesson?.id ?? ''} onChange={(e) => setLoc(firstLocation(loc.grade, chapter?.id, e.target.value))}>
                {(chapter?.lessons ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label className="lbl">Dạng toán
              <select className="sel" value={loc.formId} onChange={(e) => setLoc({ ...loc, formId: e.target.value })}>
                {(lesson?.forms ?? []).map((f) => <option key={f.id} value={f.id}>{shortName(f.name)}</option>)}
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
                <span className="mono">{code}</span>
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

      <div className="qe-tabs" role="tablist" aria-label="Khung đang xem">
        <button type="button" role="tab" aria-selected={pane === 'code'} onClick={() => setPane('code')}>Mã LaTeX</button>
        <button type="button" role="tab" aria-selected={pane === 'view'} onClick={() => setPane('view')}>Xem trước</button>
      </div>

      <div className="qe-panes" data-pane={pane}>
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
