// Màn hình Soạn câu hỏi: bảng đen (LaTeX) — giấy ô ly (xem trước) — thông tin câu.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { LatexEditor, type LatexEditorHandle } from '../components/LatexEditor';
import { QuestionView } from '../components/QuestionView';
import { IcAlert, IcCheckCircle, IcPlus, IcSearch } from '../components/Icons';
import { buildExTest, parseExTest, TEMPLATES, type ParsedQuestion } from '../lib/extest';
import { chapters, firstLocation, grades } from '../lib/curriculum';
import { shortName } from '../lib/taxonomy';
import { findDuplicates } from '../lib/dup';
import { questionCode, seqLabel } from '../lib/id';
import { saveQuestion, useBank } from '../lib/store';
import { LEVEL_LABEL, LEVELS, TYPE_LABEL, TYPES, type Level, type Location, type QType } from '../lib/types';

const DRAFT_KEY = 'hedu.draft.v1';

interface Draft { latex: string; loc: Location; level: Level; tags: string[] }

const BBT = String.raw`\begin{center}
\begin{tikzpicture}
  \tkzTabInit[nocadre=false,lgt=1.2,espcl=2]{$x$/1,$y'$/1,$y$/2}{$-\infty$,$x_1$,$x_2$,$+\infty$}
  \tkzTabLine{,+,0,-,0,+,}
  \tkzTabVar{-/$-\infty$,+/$y_1$,-/$y_2$,+/$+\infty$}
\end{tikzpicture}
\end{center}
|`;

const SYMBOLS: { label: React.ReactNode; aria: string; snippet: string; raw?: boolean; cls?: string }[] = [
  { label: <><i>a</i>/<i>b</i></>, aria: 'Phân số', snippet: '\\dfrac{|}{}' },
  { label: '√', aria: 'Căn bậc hai', snippet: '\\sqrt{|}' },
  { label: '∫', aria: 'Tích phân', snippet: '\\displaystyle\\int_{|}^{} \\,\\mathrm{d}x' },
  { label: 'Σ', aria: 'Tổng', snippet: '\\sum_{|}^{}' },
  { label: 'lim', aria: 'Giới hạn', snippet: '\\lim\\limits_{x \\to |}', cls: 'sm' },
  { label: '∞', aria: 'Vô cực', snippet: '\\infty' },
  { label: '≤', aria: 'Nhỏ hơn hoặc bằng', snippet: '\\le ' },
  { label: '≥', aria: 'Lớn hơn hoặc bằng', snippet: '\\ge ' },
  { label: '⇔', aria: 'Tương đương', snippet: '\\Leftrightarrow ' },
  { label: '∈', aria: 'Thuộc', snippet: '\\in ' },
  { label: 'ℝ', aria: 'Tập số thực', snippet: '\\mathbb{R}' },
  { label: '→', aria: 'Vectơ', snippet: '\\overrightarrow{|}' },
  { label: '{', aria: 'Hệ phương trình', snippet: '\\heva{&|\\\\&}' },
  { label: '[ ]', aria: 'Ma trận', snippet: '\\begin{bmatrix} | & \\\\ & \\end{bmatrix}', cls: 'sm' },
  { label: 'BBT', aria: 'Bảng biến thiên', snippet: BBT, raw: true, cls: 'txt' },
];

function loadDraft(): Draft | null {
  try { const r = localStorage.getItem(DRAFT_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function saveDraft(d: Draft | null) {
  try { if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); else localStorage.removeItem(DRAFT_KEY); } catch { /* bỏ qua */ }
}

/** Đổi loại câu mà vẫn giữ đề bài, phương án, lời giải đã gõ */
function convertType(latex: string, p: ParsedQuestion, to: QType): string {
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

export function EditorScreen({ editUid }: { editUid?: string }) {
  const { go, toast, openPalette } = useApp();
  const { questions } = useBank();
  const editing = editUid ? questions.find((q) => q.uid === editUid) : undefined;

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
  const [view, setView] = useState<'paper' | 'word'>('paper');
  const [pos, setPos] = useState({ line: 1, col: 1 });
  const ed = useRef<LatexEditorHandle>(null);

  const parsed = useMemo(() => parseExTest(latex), [latex]);
  const dups = useMemo(() => findDuplicates(latex, questions, editing?.uid), [latex, questions, editing?.uid]);
  const code = questionCode(loc, level);
  const dirty = editing ? latex !== editing.latex || level !== editing.level || loc.formId !== editing.formId || loc.lessonId !== editing.lessonId || tags.join('|') !== editing.tags.join('|') : true;

  // Tự lưu bản nháp câu mới (không cần nút Lưu nháp)
  useEffect(() => {
    if (editing) return;
    const t = setTimeout(() => saveDraft({ latex, loc, level, tags }), 400);
    return () => clearTimeout(t);
  }, [latex, loc, level, tags, editing]);

  const save = () => {
    if (!parsed.stem) { toast('Đề bài đang trống — chưa lưu.'); return; }
    const exact = dups.find((d) => d.score === 1);
    if (exact) { toast(`Câu này trùng hẳn với ${seqLabel(exact.question.seq)} — chưa lưu.`); return; }
    const q = saveQuestion({ latex, level, tags, ...loc }, editing?.uid);
    if (!editing) saveDraft(null);
    toast(editing ? `Đã cập nhật ${questionCode(q, q.level)} · ${seqLabel(q.seq)}` : `Đã lưu vào ngân hàng: ${questionCode(q, q.level)} · ${seqLabel(q.seq)}`);
    if (!editing) go({ screen: 'editor', editUid: q.uid });
  };

  const newQuestion = () => { saveDraft({ latex: TEMPLATES[parsed.type], loc, level, tags: [] }); go({ screen: 'editor' }); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const chs = chapters(loc.grade);
  const chapter = chs.find((c) => c.id === loc.chapterId) ?? chs[0];
  const lesson = chapter?.lessons.find((l) => l.id === loc.lessonId) ?? chapter?.lessons[0];
  const byBranch = chs.reduce<Record<string, typeof chs>>((m, c) => ({ ...m, [c.monName]: [...(m[c.monName] ?? []), c] }), {});

  const addTag = () => {
    const t = (tagInput ?? '').trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput(null);
  };

  return (
    <>
      <header className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <nav className="crumbs" aria-label="Vị trí">
            <span>Lớp {loc.grade}</span><span aria-hidden="true">/</span>
            <span>{chapter.name}</span><span aria-hidden="true">/</span>
            <b>{lesson.name}</b>
          </nav>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1>{editing ? `Sửa câu ${seqLabel(editing.seq)}` : 'Câu hỏi mới'}</h1>
            <span className="status-chip">{editing ? (dirty ? 'Có thay đổi chưa lưu' : 'Đã lưu trong ngân hàng') : 'Bản nháp · đã tự lưu'}</span>
          </div>
        </div>
        <div className="head-actions">
          <button type="button" className="btn btn-ghost" onClick={openPalette}><IcSearch /> Tìm nhanh <span className="kbd">Ctrl K</span></button>
          {editing && <button type="button" className="btn btn-outline" onClick={newQuestion}><IcPlus /> Câu mới</button>}
          <button type="button" className="btn btn-outline" onClick={() => toast('Xuất Word sẽ chạy trong bản cài trên Windows (bước chuyển đổi Pandoc).')}>Xuất Word</button>
          <button type="button" className="btn btn-accent" onClick={save} disabled={!!editing && !dirty} title="Ctrl S">{editing ? 'Lưu thay đổi' : 'Lưu vào ngân hàng'}</button>
        </div>
      </header>

      <div className="body-row" style={{ alignItems: 'stretch' }}>
        <section className="chalk" aria-label="Trình soạn LaTeX">
          <div className="chalk-bar">
            <div className="seg" role="group" aria-label="Chế độ soạn">
              <button type="button" aria-pressed="true">LaTeX</button>
              <button type="button" aria-pressed="false" onClick={() => toast('Gõ trực quan (bàn phím công thức) sẽ có ở lát sau.')}>Gõ trực quan</button>
            </div>
            <div className="chalk-meta">
              <span className="mono">ex_test</span>
              <span>Dòng {pos.line}, cột {pos.col}</span>
            </div>
          </div>
          <LatexEditor ref={ed} value={latex} onChange={setLatex} onCursor={(line, col) => setPos({ line, col })} />
          <div className="sym-box">
            <div className="sym-head"><span>Ký hiệu</span><span>Nhấn để chèn vào vị trí con trỏ</span></div>
            <div className="syms">
              {SYMBOLS.map((s) => (
                <button key={s.aria} type="button" className={`sym ${s.cls === 'txt' ? 'txt' : ''}`} style={s.cls === 'sm' ? { fontSize: 14 } : undefined} aria-label={s.aria} title={s.aria} onClick={() => ed.current?.insert(s.snippet, { wrapMath: !s.raw })}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="preview" aria-label="Xem trước">
          <div className="preview-bar">
            <h2>Xem trước</h2>
            <div className="seg sm" role="group" aria-label="Kiểu xem">
              <button type="button" aria-pressed={view === 'paper'} onClick={() => setView('paper')}>Giấy ô ly</button>
              <button type="button" aria-pressed={view === 'word'} onClick={() => setView('word')}>Trang Word</button>
            </div>
          </div>
          {view === 'paper' ? (
            <div className="oly"><QuestionView p={parsed} number={1} /></div>
          ) : (
            <div className="wordpage"><div className="wordpage-sheet"><QuestionView p={parsed} number={1} variant="exam" showAnswer={false} /></div></div>
          )}
        </section>

        <aside className="aside" aria-label="Thông tin câu hỏi">
          <div className="panel">
            <h2>Vị trí trong ngân hàng</h2>
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
            <div className="id-card">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <small>ID tự động</small>
                <span className="mono">{code}</span>
              </div>
              <small>{editing ? seqLabel(editing.seq) : 'Số thứ tự cấp khi lưu'}</small>
            </div>
          </div>

          <div className="panel">
            <h2>Loại câu</h2>
            <div className="type-grid" role="group" aria-label="Loại câu">
              {TYPES.map((t) => (
                <button key={t} type="button" aria-pressed={parsed.type === t} onClick={() => parsed.type !== t && setLatex(convertType(latex, parsed, t))}>{TYPE_LABEL[t]}</button>
              ))}
            </div>
            <h2 style={{ marginTop: 6 }}>Mức độ</h2>
            <div className="chips" role="group" aria-label="Mức độ">
              {LEVELS.map((l) => <button key={l} type="button" className="chip lv" aria-pressed={level === l} onClick={() => setLevel(l)}>{LEVEL_LABEL[l]}</button>)}
            </div>
            <h2 style={{ marginTop: 6 }}>Thẻ</h2>
            <div className="chips">
              {tags.map((t) => (
                <span key={t} className="tag">{t}<button type="button" aria-label={`Bỏ thẻ ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))}>×</button></span>
              ))}
              {tagInput == null ? (
                <button type="button" className="tag-add" onClick={() => setTagInput('')}>+ Thêm thẻ</button>
              ) : (
                <input className="tag-input" autoFocus value={tagInput} aria-label="Tên thẻ mới" placeholder="Tên thẻ, Enter"
                  onChange={(e) => setTagInput(e.target.value)} onBlur={addTag}
                  onKeyDown={(e) => { if (e.key === 'Enter') addTag(); if (e.key === 'Escape') setTagInput(null); }} />
              )}
            </div>
          </div>

          {dups.length > 0 && (
            <div className="note bad" role="status">
              <IcAlert />
              <div className="note-body">
                <b>{dups[0].score === 1 ? 'Trùng hẳn với câu đã có' : 'Có câu gần giống trong ngân hàng'}</b>
                <ul>
                  {dups.slice(0, 3).map((d) => (
                    <li key={d.question.uid}>
                      {questionCode(d.question, d.question.level)} · {seqLabel(d.question.seq)} — giống {Math.round(d.score * 100)}%{' '}
                      <button type="button" className="linkbtn" onClick={() => go({ screen: 'editor', editUid: d.question.uid })}>Mở</button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {parsed.issues.length > 0 ? (
            <div className="note warn" role="status">
              <IcAlert />
              <div className="note-body">
                <b>Cần xem lại</b>
                <ul>{parsed.issues.map((s) => <li key={s}>{s}</li>)}</ul>
              </div>
            </div>
          ) : (
            <div className="note ok" role="status">
              <IcCheckCircle />
              <div className="note-body">
                <b>Cú pháp hợp lệ</b>
                <span>Câu {TYPE_LABEL[parsed.type].toLowerCase()} đọc được đầy đủ. Kiểm tra chuyển sang Word Equation sẽ có ở bản Windows.</span>
              </div>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
