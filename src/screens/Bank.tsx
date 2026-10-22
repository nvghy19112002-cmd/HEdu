// Màn hình Ngân hàng câu hỏi.
// Bố cục: cột trái chọn Lớp → Chương → Bài; cột phải tìm kiếm, lọc theo Dạng/Mức độ/Loại và xem câu.
// Mọi nút lọc đều hiện sẵn số câu để biết chỗ nào đang thiếu.
import { useMemo, useState } from 'react';
import { useApp } from '../app-context';
import { QuestionView } from '../components/QuestionView';
import { IcCopy, IcEdit, IcSearch, IcTrash } from '../components/Icons';
import { buildExTest, parseExTest } from '../lib/extest';
import { place, useTaxonomy } from '../lib/curriculum';
import { branchShort, shortName } from '../lib/taxonomy';
import { questionCode, seqLabel } from '../lib/id';
import { deleteQuestion, duplicateQuestion, useBank } from '../lib/store';
import { LEVEL_LABEL, LEVELS, TYPE_LABEL, TYPES, type Level, type QType, type Question } from '../lib/types';

function fold(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

function searchable(q: Question): string {
  const p = parseExTest(q.latex);
  return fold([p.stem, ...p.options.map((o) => o.text), p.solution ?? '', questionCode(q, q.level), q.tags.join(' ')].join(' ').replace(/\\[a-zA-Z]+/g, ' '));
}

const nf = new Intl.NumberFormat('vi-VN');

export function BankScreen() {
  const { go, toast, openPalette, showFile } = useApp();
  const { questions } = useBank();
  const { tax } = useTaxonomy();

  const [gradeNum, setGradeNum] = useState<number | null>(null);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [formId, setFormId] = useState<string | null>(null);
  const [types, setTypes] = useState<Set<QType>>(new Set());
  const [levels, setLevels] = useState<Set<Level>>(new Set());
  const [text, setText] = useState('');
  const [wide, setWide] = useState(false); // tìm trong toàn bộ ngân hàng thay vì mục đang chọn
  const [showSol, setShowSol] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PER_PAGE = 20;

  const index = useMemo(() => new Map(questions.map((q) => [q.uid, searchable(q)])), [questions]);

  const grade = tax.grades.find((g) => g.grade === gradeNum) ?? null;
  const chaptersOf = useMemo(
    () => (grade ? grade.branches.flatMap((b) => b.chapters.map((c) => ({ ...c, mon: b.name, monCode: b.code }))) : []),
    [grade],
  );
  const chapter = chaptersOf.find((c) => c.id === chapterId) ?? null;
  const lesson = chapter?.lessons.find((l) => l.id === lessonId) ?? null;

  /** Câu nằm trong mục đang chọn (chưa tính tìm kiếm và các bộ lọc chip). */
  const scoped = useMemo(() => questions.filter((q) =>
    (gradeNum == null || q.grade === gradeNum) &&
    (!chapterId || q.chapterId === chapterId) &&
    (!lessonId || q.lessonId === lessonId)), [questions, gradeNum, chapterId, lessonId]);

  const base = wide ? questions : scoped;

  /** Đếm số câu nếu thêm một bộ lọc nữa — để hiện số ngay trên từng nút. */
  const tally = (extra: (q: Question) => boolean) => base.filter((q) =>
    extra(q) &&
    (!formId || q.formId === formId) &&
    (!types.size || types.has(q.type)) &&
    (!levels.size || levels.has(q.level))).length;

  const list = useMemo(() => {
    const f = fold(text.trim());
    return base
      .filter((q) => !formId || q.formId === formId)
      .filter((q) => !types.size || types.has(q.type))
      .filter((q) => !levels.size || levels.has(q.level))
      .filter((q) => !f || f.split(/\s+/).every((w) => index.get(q.uid)!.includes(w)))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [base, formId, types, levels, text, index]);

  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const cur = Math.min(page, pages - 1);
  const shown = list.slice(cur * PER_PAGE, cur * PER_PAGE + PER_PAGE);

  const toggle = <T,>(set: Set<T>, v: T, apply: (s: Set<T>) => void) => { const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); apply(n); };
  const pickGrade = (g: number | null) => { setPage(0); setGradeNum(g); setChapterId(null); setLessonId(null); setFormId(null); };
  const pickChapter = (id: string) => { setPage(0); setChapterId(id === chapterId ? null : id); setLessonId(null); setFormId(null); };
  const pickLesson = (id: string) => { setPage(0); setLessonId(id === lessonId ? null : id); setFormId(null); };

  const selected = questions.filter((q) => sel.has(q.uid));
  const exportSelected = () => {
    const body = selected.map((q) => buildExTest(parseExTest(q.latex), { id: questionCode(q, q.level) })).join('\n\n');
    showFile({ title: `${selected.length} câu đã chọn`, name: 'cau-hoi-da-chon.tex', text: `% ${selected.length} câu xuất từ HEdu\n\n${body}\n`, mime: 'application/x-tex' });
  };

  const heading = chapter ? `Lớp ${gradeNum} · ${chapter.name}` : gradeNum ? `Lớp ${gradeNum}` : 'Toàn bộ ngân hàng';

  return (
    <>
      <header className="page-head bank-head">
        <h1>Ngân hàng câu hỏi</h1>
        <div className="head-actions">
          <button type="button" className="btn btn-outline" onClick={() => go({ screen: 'import' })}>Nhập từ file</button>
          <button type="button" className="btn btn-accent" onClick={() => go({ screen: 'editor' })}>+ Câu hỏi mới</button>
        </div>
      </header>

      <div className="body-row">
        <aside className="tree" aria-label="Mục lục">
          <h2>Chọn lớp</h2>
          <div className="gseg">
            <button type="button" className="gbtn" aria-pressed={gradeNum == null} onClick={() => pickGrade(null)}>
              <b>Tất cả</b><small>{nf.format(questions.length)} câu</small>
            </button>
            {tax.grades.map((g) => (
              <button key={g.id} type="button" className="gbtn" aria-pressed={gradeNum === g.grade} onClick={() => pickGrade(g.grade)}>
                <b>Lớp {g.grade}</b><small>{nf.format(questions.filter((q) => q.grade === g.grade).length)} câu</small>
              </button>
            ))}
          </div>

          {grade && (
            <>
              <h2>Chọn chương, rồi chọn bài<span className="tree-sub">{tax.name}</span></h2>
              <ul className="chlist">
                {chaptersOf.map((c) => {
                  const on = chapterId === c.id;
                  return (
                    <li key={c.id}>
                      <button type="button" className="chrow" aria-current={on} aria-expanded={on} onClick={() => pickChapter(c.id)}>
                        <span className="chno">{grade.code}{c.monCode}{c.code}</span>
                        <span className="chmain">
                          <span className="chname">{c.name}</span>
                          <small>{branchShort(c.mon)}</small>
                        </span>
                        <span className="cnt">{questions.filter((q) => q.chapterId === c.id).length || ''}</span>
                      </button>
                      {on && (
                        <ul className="lslist">
                          {c.lessons.map((l) => (
                            <li key={l.id}>
                              <button type="button" className="lsrow" aria-current={lessonId === l.id} onClick={() => pickLesson(l.id)}>
                                <span>{l.name}</span>
                                <span className="cnt">{questions.filter((q) => q.lessonId === l.id).length || ''}</span>
                              </button>
                            </li>
                          ))}
                          {!c.lessons.length && <li><span className="lsrow empty-note">Chương này chưa có bài nào</span></li>}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </aside>

        <section className="qlist" aria-label="Danh sách câu hỏi">
          <label className="search sm">
            <IcSearch size={16} />
            <span className="sr-only">Tìm câu hỏi</span>
            <input type="search" value={text} onChange={(e) => { setText(e.target.value); setPage(0); }} placeholder="Gõ từ khoá để tìm câu, ví dụ: tiệm cận, xác suất, hoặc mã 2D1H1" />
            <select className="scope-sel" value={wide ? 'all' : 'here'} onChange={(e) => setWide(e.target.value === 'all')} aria-label="Phạm vi tìm">
              <option value="here">trong mục đang chọn</option>
              <option value="all">toàn bộ ngân hàng</option>
            </select>
            <button type="button" className="kbd" style={{ border: 'none' }} onClick={openPalette}>Ctrl K</button>
          </label>

          <div className="scope-head">
            <h2>{heading}</h2>
            {lesson && <span>Bài: {lesson.name}</span>}
          </div>

          <div className="fgroups">
            {lesson && lesson.forms.length > 0 && (
              <div className="fgroup">
                <h3>Dạng toán</h3>
                <div className="chips">
                  <button type="button" className="chip" aria-pressed={!formId} onClick={() => setFormId(null)}>Tất cả các dạng</button>
                  {lesson.forms.map((f) => (
                    <button key={f.id} type="button" className="chip" aria-pressed={formId === f.id} onClick={() => setFormId(formId === f.id ? null : f.id)}>
                      {shortName(f.name)}<span className="chip-n">{base.filter((q) => q.formId === f.id).length}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="fgroup">
              <h3>Mức độ</h3>
              <div className="chips">
                <button type="button" className="chip" aria-pressed={!levels.size} onClick={() => setLevels(new Set())}>Tất cả</button>
                {LEVELS.map((l) => (
                  <button key={l} type="button" className="chip" aria-pressed={levels.has(l)} onClick={() => toggle(levels, l, setLevels)}>
                    {LEVEL_LABEL[l]}<span className="chip-n">{tally((q) => q.level === l)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="fgroup">
              <h3>Loại câu</h3>
              <div className="chips">
                <button type="button" className="chip" aria-pressed={!types.size} onClick={() => setTypes(new Set())}>Tất cả</button>
                {TYPES.map((t) => (
                  <button key={t} type="button" className="chip" aria-pressed={types.has(t)} onClick={() => toggle(types, t, setTypes)}>
                    {TYPE_LABEL[t]}<span className="chip-n">{tally((q) => q.type === t)}</span>
                  </button>
                ))}
              </div>
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
              <span>Tìm thấy <b style={{ color: 'var(--ink)' }}>{nf.format(list.length)} câu</b>{pages > 1 && ` · đang xem ${cur * PER_PAGE + 1}–${Math.min(list.length, (cur + 1) * PER_PAGE)}`}</span>
              <label className="sw"><input type="checkbox" checked={showSol} onChange={(e) => setShowSol(e.target.checked)} />Hiện lời giải</label>
              {shown.length > 0 && <button type="button" className="linkbtn" onClick={() => setSel(new Set([...sel, ...shown.map((q) => q.uid)]))}>Chọn cả trang</button>}
            </div>
          )}

          {shown.map((q) => {
            const p = parseExTest(q.latex);
            const on = sel.has(q.uid);
            const at = place(q.lessonId) ?? place(q.chapterId);
            return (
              <article key={q.uid} className={`card${on ? ' sel' : ''}`}>
                <input type="checkbox" checked={on} aria-label={`Chọn câu ${seqLabel(q.seq)}`} onChange={() => toggle(sel, q.uid, setSel)} />
                <div className="card-body">
                  <div className="card-meta">
                    <span className={`pill t-${q.type}`}>{TYPE_LABEL[q.type]}</span>
                    <span className={`pill l-${q.level}`}>{LEVEL_LABEL[q.level]}</span>
                    <span className="code-tag">{questionCode(q, q.level)}</span>
                    <span>{at ? `${shortName(at.chapter?.name ?? '')} › ${shortName(at.lesson?.name ?? '')}` : 'Chưa gán vị trí'}</span>
                    {q.tags.map((t) => <span key={t} className="tag" style={{ height: 24, paddingRight: 10, fontSize: 12 }}>{t}</span>)}
                    <span style={{ marginLeft: 'auto' }} className="mono">{seqLabel(q.seq)}</span>
                  </div>
                  <QuestionView p={p} variant="compact" showSolution={showSol} />
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

          {pages > 1 && (
            <nav className="pager" aria-label="Phân trang">
              <button type="button" className="btn btn-sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>‹ Trước</button>
              <span>Trang <b>{cur + 1}</b> / {nf.format(pages)}</span>
              <button type="button" className="btn btn-sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Sau ›</button>
            </nav>
          )}

          {!list.length && (
            <div className="empty">
              <span>{questions.length ? 'Không có câu nào khớp bộ lọc.' : 'Ngân hàng đang trống. Bấm “+ Câu hỏi mới”, hoặc nhập cả file .tex ở mục Nhập liệu.'}</span>
              {questions.length > 0 && <button type="button" className="btn btn-sm" onClick={() => { setTypes(new Set()); setLevels(new Set()); setText(''); setFormId(null); }}>Xoá bộ lọc</button>}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
