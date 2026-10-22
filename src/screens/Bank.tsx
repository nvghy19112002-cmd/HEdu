// Màn hình Ngân hàng câu hỏi: cây Lớp › Chương › Bài, tìm kiếm, lọc, chọn câu.
import { useMemo, useState } from 'react';
import { useApp } from '../app-context';
import { QuestionView } from '../components/QuestionView';
import { IcCopy, IcEdit, IcSearch, IcTrash } from '../components/Icons';
import { buildExTest, parseExTest } from '../lib/extest';
import { CURRICULUM, findChapter, findLesson } from '../lib/curriculum';
import { questionCode, seqLabel } from '../lib/id';
import { deleteQuestion, duplicateQuestion, useBank } from '../lib/store';
import { LEVEL_LABEL, LEVELS, TYPE_LABEL, TYPES, type Level, type QType, type Question } from '../lib/types';

interface Scope { grade?: number; chapterId?: string; lessonId?: string }

function fold(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

function searchable(q: Question): string {
  const p = parseExTest(q.latex);
  return fold([p.stem, ...p.options.map((o) => o.text), p.solution ?? '', questionCode(q, q.level), q.tags.join(' ')].join(' ').replace(/\\[a-zA-Z]+/g, ' '));
}

export function BankScreen() {
  const { go, toast, openPalette, showFile } = useApp();
  const { questions } = useBank();
  const [scope, setScope] = useState<Scope>({ grade: 12 });
  const [open, setOpen] = useState<Set<string>>(() => new Set(['g12', 'g12c1']));
  const [types, setTypes] = useState<Set<QType>>(new Set());
  const [levels, setLevels] = useState<Set<Level>>(new Set());
  const [text, setText] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const index = useMemo(() => new Map(questions.map((q) => [q.uid, searchable(q)])), [questions]);

  const inScope = (q: Question) =>
    (scope.grade == null || q.grade === scope.grade) &&
    (!scope.chapterId || q.chapterId === scope.chapterId) &&
    (!scope.lessonId || q.lessonId === scope.lessonId);

  const list = useMemo(() => {
    const f = fold(text.trim());
    return questions
      .filter(inScope)
      .filter((q) => !types.size || types.has(q.type))
      .filter((q) => !levels.size || levels.has(q.level))
      .filter((q) => !f || f.split(/\s+/).every((w) => index.get(q.uid)!.includes(w)))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, scope, types, levels, text, index]);

  const count = (pred: (q: Question) => boolean) => questions.filter(pred).length;
  const toggle = <T,>(set: Set<T>, v: T, apply: (s: Set<T>) => void) => { const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); apply(n); };
  const flip = (id: string) => toggle(open, id, setOpen);

  const selected = questions.filter((q) => sel.has(q.uid));
  const scopeLabel = scope.lessonId ? findLesson(scope.lessonId)?.lesson.name : scope.chapterId ? findChapter(scope.chapterId)?.name : scope.grade ? `Lớp ${scope.grade}` : 'Tất cả lớp';

  const exportSelected = () => {
    const body = selected.map((q) => buildExTest(parseExTest(q.latex), { id: questionCode(q, q.level) })).join('\n\n');
    showFile({ title: `${selected.length} câu đã chọn`, name: 'cau-hoi-da-chon.tex', text: `% ${selected.length} câu xuất từ HEdu\n\n${body}\n`, mime: 'application/x-tex' });
  };

  return (
    <>
      <header className="page-head" style={{ alignItems: 'center' }}>
        <h1>Ngân hàng câu hỏi</h1>
        <div className="head-actions">
          <button type="button" className="btn btn-outline" onClick={() => go({ screen: 'import' })}>Nhập từ file .tex / .docx</button>
          <button type="button" className="btn btn-accent" onClick={() => go({ screen: 'editor' })}>+ Câu hỏi mới</button>
        </div>
      </header>

      <div style={{ padding: '0 32px 16px' }}>
        <label className="search">
          <IcSearch size={20} />
          <span className="sr-only">Tìm câu hỏi</span>
          <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tìm trong đề bài, lời giải hoặc ID, ví dụ: nghịch biến, tiệm cận, 2D1…" />
          <button type="button" className="kbd" style={{ border: 'none' }} onClick={openPalette}>Ctrl K</button>
        </label>
      </div>

      <div className="body-row">
        <aside className="tree" aria-label="Khung chương trình">
          <h2>Lớp · Chương · Bài</h2>
          <ul>
            <li><button type="button" className="tn" aria-current={scope.grade == null} onClick={() => setScope({})}><span className="car" />Tất cả<span className="cnt">{questions.length}</span></button></li>
            {CURRICULUM.map((g) => {
              const gid = 'g' + g.grade;
              return (
                <li key={g.grade}>
                  <button type="button" className="tn" aria-expanded={open.has(gid)} aria-current={scope.grade === g.grade && !scope.chapterId}
                    onClick={() => { setScope({ grade: g.grade }); flip(gid); }}>
                    <span className="car" aria-hidden="true">›</span>Lớp {g.grade}<span className="cnt">{count((q) => q.grade === g.grade)}</span>
                  </button>
                  {open.has(gid) && (
                    <ul>
                      {g.chapters.map((c) => (
                        <li key={c.id}>
                          <button type="button" className="tn" aria-expanded={open.has(c.id)} aria-current={scope.chapterId === c.id && !scope.lessonId}
                            onClick={() => { setScope({ grade: g.grade, chapterId: c.id }); flip(c.id); }}>
                            <span className="car" aria-hidden="true">›</span>{c.name}<span className="cnt">{count((q) => q.chapterId === c.id) || ''}</span>
                          </button>
                          {open.has(c.id) && (
                            <ul>
                              {c.lessons.map((l) => (
                                <li key={l.id}>
                                  <button type="button" className="tn leaf" aria-current={scope.lessonId === l.id} onClick={() => setScope({ grade: g.grade, chapterId: c.id, lessonId: l.id })}>
                                    {l.name}<span className="cnt">{count((q) => q.lessonId === l.id) || ''}</span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="qlist" aria-label="Danh sách câu hỏi">
          <div className="filters">
            <div className="chips" role="group" aria-label="Loại câu">
              <button type="button" className="chip" aria-pressed={!types.size} onClick={() => setTypes(new Set())}>Tất cả loại</button>
              {TYPES.map((t) => <button key={t} type="button" className="chip" aria-pressed={types.has(t)} onClick={() => toggle(types, t, setTypes)}>{TYPE_LABEL[t]}</button>)}
            </div>
            <span className="vsep" aria-hidden="true" />
            <div className="chips" role="group" aria-label="Mức độ">
              {LEVELS.map((l) => <button key={l} type="button" className="chip" title={LEVEL_LABEL[l]} aria-pressed={levels.has(l)} onClick={() => toggle(levels, l, setLevels)}>{l}</button>)}
            </div>
          </div>

          {sel.size > 0 ? (
            <div className="selbar">
              <span style={{ fontSize: 14 }}><b>Đã chọn {sel.size} câu</b></span>
              <div className="head-actions" style={{ gap: 8 }}>
                <button type="button" className="btn btn-sm" onClick={() => setSel(new Set())}>Bỏ chọn</button>
                <button type="button" className="btn btn-sm" onClick={exportSelected}>Xuất .tex</button>
                <button type="button" className="btn btn-sm btn-accent" onClick={() => go({ screen: 'exam', examPick: [...sel] })}>Thêm vào đề</button>
              </div>
            </div>
          ) : (
            <div className="list-head">
              <span><b style={{ color: 'var(--ink)' }}>{list.length} câu</b> · {scopeLabel}</span>
              {list.length > 0 && <button type="button" className="linkbtn" onClick={() => setSel(new Set(list.map((q) => q.uid)))}>Chọn tất cả</button>}
            </div>
          )}

          {list.map((q) => {
            const p = parseExTest(q.latex);
            const on = sel.has(q.uid);
            const ch = findChapter(q.chapterId);
            const ls = findLesson(q.lessonId)?.lesson;
            return (
              <article key={q.uid} className={`card${on ? ' sel' : ''}`}>
                <input type="checkbox" checked={on} aria-label={`Chọn câu ${seqLabel(q.seq)}`} onChange={() => toggle(sel, q.uid, setSel)} />
                <div className="card-body">
                  <div className="card-meta">
                    <span className={`pill t-${q.type}`}>{TYPE_LABEL[q.type]}</span>
                    <span className={`pill l-${q.level}`}>{LEVEL_LABEL[q.level]}</span>
                    <span className="code-tag">{questionCode(q, q.level)}</span>
                    <span>{ch?.short} › {ls?.name}</span>
                    {q.tags.map((t) => <span key={t} className="tag" style={{ height: 24, paddingRight: 10, fontSize: 12 }}>{t}</span>)}
                    <span style={{ marginLeft: 'auto' }} className="mono">{seqLabel(q.seq)}</span>
                  </div>
                  <QuestionView p={p} variant="compact" showSolution={false} />
                </div>
                <div className="card-acts">
                  <button type="button" className="ico" aria-label="Sửa câu" title="Sửa" onClick={() => go({ screen: 'editor', editUid: q.uid })}><IcEdit size={18} /></button>
                  <button type="button" className="ico" aria-label="Nhân bản câu" title="Nhân bản" onClick={() => { const c = duplicateQuestion(q.uid); if (c) toast(`Đã nhân bản thành ${seqLabel(c.seq)} — nhớ sửa số liệu.`); }}><IcCopy /></button>
                  {confirmDel === q.uid ? (
                    <button type="button" className="ico danger" style={{ width: 'auto', padding: '0 8px', fontSize: 12, color: 'var(--accent)' }} onClick={() => { deleteQuestion(q.uid); setConfirmDel(null); sel.delete(q.uid); toast(`Đã xoá ${seqLabel(q.seq)}`); }} onBlur={() => setConfirmDel(null)} autoFocus>Xoá?</button>
                  ) : (
                    <button type="button" className="ico danger" aria-label="Xoá câu" title="Xoá" onClick={() => setConfirmDel(q.uid)}><IcTrash /></button>
                  )}
                </div>
              </article>
            );
          })}

          {!list.length && (
            <div className="empty">
              <span>Không có câu nào khớp bộ lọc.</span>
              <button type="button" className="btn btn-sm" onClick={() => { setTypes(new Set()); setLevels(new Set()); setText(''); setScope({}); }}>Xoá bộ lọc</button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
