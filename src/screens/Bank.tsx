// Màn hình Ngân hàng câu hỏi.
// Bố cục: cột trái chọn Lớp → Chương → Bài; cột phải tìm kiếm, lọc theo Dạng/Mức độ/Loại và xem câu.
// Mọi nút lọc đều hiện sẵn số câu để biết chỗ nào đang thiếu.
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../app-context';
import { featureOn } from '../lib/features';
import { QuestionView } from '../components/QuestionView';
import { CompiledView } from '../components/CompiledView';
import { QuestionDrawer } from '../components/QuestionDrawer';
import { isTikzReady } from '../lib/tikz';
import { loadBankView, loadFiltersOpen, loadTreeOpen, saveBankView, saveFiltersOpen, saveTreeOpen, type BankView } from '../lib/bankview';
import { plainSnippet } from '../lib/snippet';
import { IcCopy, IcEdit, IcMore, IcSearch, IcTrash } from '../components/Icons';
import { buildExTest, parseExTest } from '../lib/extest';
import { place, useTaxonomy } from '../lib/curriculum';
import { branchShort, shortName } from '../lib/taxonomy';
import { questionCode, seqLabel } from '../lib/id';
import { deleteQuestion, duplicateQuestion, setReview, useBank } from '../lib/store';
import { ReviewBadge, ReviewControl } from '../components/ReviewControl';
import { LEVEL_LABEL, LEVELS, REVIEW_LABEL, reviewOf, TYPE_LABEL, TYPES, type Level, type QType, type Question, type ReviewFilter, type ReviewStatus } from '../lib/types';

function fold(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

function searchable(q: Question): string {
  const p = parseExTest(q.latex);
  return fold([p.stem, ...p.options.map((o) => o.text), p.solution ?? '', questionCode(q, q.level), q.tags.join(' ')].join(' ').replace(/\\[a-zA-Z]+/g, ' '));
}

const nf = new Intl.NumberFormat('vi-VN');

export function BankScreen() {
  const { go, toast, openPalette, showFile, nav } = useApp();
  const { questions } = useBank();
  const { tax } = useTaxonomy();

  const [gradeNum, setGradeNum] = useState<number | null>(null);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [formId, setFormId] = useState<string | null>(null);
  const [types, setTypes] = useState<Set<QType>>(new Set());
  const [levels, setLevels] = useState<Set<Level>>(new Set());
  const [reviewF, setReviewF] = useState<ReviewFilter>('all');
  const [text, setText] = useState('');
  const [wide, setWide] = useState(false); // tìm trong toàn bộ ngân hàng thay vì mục đang chọn
  const [showSol, setShowSol] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [exact, setExact] = useState<Set<string>>(new Set()); // các câu đang ở chế độ “Xem chuẩn”
  const [openUid, setOpenUid] = useState<string | null>(nav.openUid ?? null); // câu đang sửa ở ngăn bên phải
  const opened = openUid ? questions.find((q) => q.uid === openUid) : undefined;
  const [page, setPage] = useState(0);
  const PER_PAGE = 20;
  const [view, setViewState] = useState<BankView>(loadBankView);
  const setView = (v: BankView) => { setViewState(v); saveBankView(v); };
  const [activeUid, setActiveUid] = useState<string | null>(null); // câu đang xem ở chế độ Danh sách (khác với ô chọn nhiều)
  const [detailOpen, setDetailOpen] = useState(false);            // cửa sổ hẹp: Chi tiết phủ lên danh sách
  const [treeOpen, setTreeOpenState] = useState(() => loadTreeOpen() ?? (loadBankView() === 'list' ? typeof window === 'undefined' || window.innerWidth >= 1500 : true));
  const setTreeOpen = (o: boolean) => { setTreeOpenState(o); saveTreeOpen(o); };
  const [filtersOpen, setFiltersOpenState] = useState(loadFiltersOpen);
  const setFiltersOpen = (o: boolean) => { setFiltersOpenState(o); saveFiltersOpen(o); };
  const [menuUid, setMenuUid] = useState<string | null>(null); // menu ba chấm của thẻ

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
    (!levels.size || levels.has(q.level)) &&
    (reviewF === 'all' || reviewOf(q) === reviewF)).length;

  /** Đếm theo trạng thái kiểm duyệt (bỏ qua chính bộ lọc kiểm duyệt). */
  const reviewTally = (r: ReviewFilter) => base.filter((q) =>
    (!formId || q.formId === formId) && (!types.size || types.has(q.type)) && (!levels.size || levels.has(q.level)) &&
    (r === 'all' || reviewOf(q) === r)).length;

  const list = useMemo(() => {
    const f = fold(text.trim());
    return base
      .filter((q) => !formId || q.formId === formId)
      .filter((q) => !types.size || types.has(q.type))
      .filter((q) => !levels.size || levels.has(q.level))
      .filter((q) => reviewF === 'all' || reviewOf(q) === reviewF)
      .filter((q) => !f || f.split(/\s+/).every((w) => index.get(q.uid)!.includes(w)))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [base, formId, types, levels, reviewF, text, index]);

  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const cur = Math.min(page, pages - 1);
  const shown = list.slice(cur * PER_PAGE, cur * PER_PAGE + PER_PAGE);
  // Câu đang xem: nếu không còn nằm trong trang hiện tại (đổi lọc/trang/xoá) thì lấy câu đầu tiên hợp lệ.
  const active = shown.find((q) => q.uid === activeUid) ?? shown[0] ?? null;
  useEffect(() => { if (!active) setDetailOpen(false); }, [active]);
  // Menu ba chấm: bấm ra ngoài thì đóng
  useEffect(() => {
    if (!menuUid) return;
    const h = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.('.more')) { setMenuUid(null); setConfirmDel(null); } };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setMenuUid(null); setConfirmDel(null); } };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [menuUid]);

  const toggle = <T,>(set: Set<T>, v: T, apply: (s: Set<T>) => void) => { const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); apply(n); };
  const pickGrade = (g: number | null) => { setPage(0); setGradeNum(g); setChapterId(null); setLessonId(null); setFormId(null); };
  const pickChapter = (id: string) => { setPage(0); setChapterId(id === chapterId ? null : id); setLessonId(null); setFormId(null); };
  const pickLesson = (id: string) => { setPage(0); setLessonId(id === lessonId ? null : id); setFormId(null); };

  const selected = questions.filter((q) => sel.has(q.uid));
  const exportSelected = () => {
    const body = selected.map((q) => buildExTest(parseExTest(q.latex), { id: questionCode(q, q.level) })).join('\n\n');
    showFile({ title: `${selected.length} câu đã chọn`, name: 'cau-hoi-da-chon.tex', text: `% ${selected.length} câu xuất từ HEdu\n\n${body}\n`, mime: 'application/x-tex' });
  };


  const renderCard = (q: Question, mode: 'card' | 'detail') => {
    const p = parseExTest(q.latex);
    const on = sel.has(q.uid);
    const at = place(q.lessonId) ?? place(q.chapterId);
    return (
      <article key={q.uid} className={`card${on ? ' is-selected' : ''}${mode === 'detail' ? ' card-detail' : ''}`}>
        <input type="checkbox" checked={on} aria-label={`Chọn câu ${seqLabel(q.seq)}`} onChange={() => toggle(sel, q.uid, setSel)} />
        <div className="card-body">
          <div className="card-meta">
            <span className={`pill t-${q.type}`}>{TYPE_LABEL[q.type]}</span>
            <span className={`pill l-${q.level}`}>{LEVEL_LABEL[q.level]}</span>
            <ReviewBadge q={q} />
            <span className="code-tag">{questionCode(q, q.level)}</span>
            <span className="mono card-no">{seqLabel(q.seq)}</span>
            <div className="card-acts">
              {isTikzReady() && (
                <button type="button" className="ico txt" aria-label="Xem chuẩn bằng TeX Live" aria-pressed={exact.has(q.uid)} title="Xem chuẩn: biên dịch nguyên câu bằng TeX Live" onClick={() => toggle(exact, q.uid, setExact)}>TeX</button>
              )}
              <button type="button" className="ico" aria-label="Sửa câu" title="Sửa" onClick={() => setOpenUid(q.uid)}><IcEdit size={17} /></button>
              <div className="more">
                <button type="button" className="ico" aria-label="Thêm thao tác" aria-haspopup="menu" aria-expanded={menuUid === q.uid} title="Nhân bản, xoá…" onClick={() => { setConfirmDel(null); setMenuUid(menuUid === q.uid ? null : q.uid); }}><IcMore size={17} /></button>
                {menuUid === q.uid && (
                  <div className="more-menu" role="menu" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setMenuUid(null); } }}>
                    <button type="button" role="menuitem" onClick={() => { setMenuUid(null); const c = duplicateQuestion(q.uid); if (c) { if (mode === 'detail') setActiveUid(c.uid); toast(`Đã nhân bản thành ${seqLabel(c.seq)} — nhớ sửa số liệu.`); } }}><IcCopy size={16} />Nhân bản</button>
                    {confirmDel === q.uid
                      ? <button type="button" role="menuitem" className="danger" onClick={() => { setMenuUid(null); removeQuestion(q); }} autoFocus><IcTrash size={16} />Bấm lần nữa để xoá</button>
                      : <button type="button" role="menuitem" className="danger" onClick={() => setConfirmDel(q.uid)}><IcTrash size={16} />Xoá câu</button>}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="card-where">{at ? `${shortName(at.chapter?.name ?? '')} › ${shortName(at.lesson?.name ?? '')}` : 'Chưa gán vị trí'}{q.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
          {exact.has(q.uid)
            ? <CompiledView latex={q.latex} solution={showSol} onBack={() => toggle(exact, q.uid, setExact)} />
            : <QuestionView p={p} variant="compact" showSolution={showSol} raw={q.latex} />}
          <ReviewControl key={q.uid} q={q} onChange={(s) => changeReview(q, s)} />
        </div>
      </article>
    );
  };

  /** Đổi kiểm duyệt; nếu câu rời khỏi bộ lọc đang bật thì báo nhẹ (câu đang xem tự chuyển sang câu hợp lệ kế tiếp). */
  const changeReview = async (q: Question, s: ReviewStatus | undefined): Promise<boolean> => {
    const ok = await setReview(q.uid, s);
    if (ok && reviewF !== 'all' && (s ?? 'unreviewed') !== reviewF) toast(`${seqLabel(q.seq)} chuyển sang “${REVIEW_LABEL[s ?? 'unreviewed']}” nên không còn trong bộ lọc này.`);
    return ok;
  };

  /** Xoá một câu: bỏ khỏi ô chọn, và nếu đang xem câu đó thì chuyển sang câu liền kề còn lại. */
  const removeQuestion = (q: Question) => {
    const i = shown.findIndex((x) => x.uid === q.uid);
    const next = shown[i + 1] ?? shown[i - 1] ?? null;
    deleteQuestion(q.uid);
    setConfirmDel(null);
    setSel((s) => { const n = new Set(s); n.delete(q.uid); return n; });
    if (active?.uid === q.uid) setActiveUid(next ? next.uid : null);
    toast(`Đã xoá ${seqLabel(q.seq)}`);
  };

  const renderRows = () => (
    <ul className="rows" aria-label="Danh sách rút gọn">
      {shown.map((q) => {
        const p = parseExTest(q.latex);
        const isActive = active?.uid === q.uid;
        const on = sel.has(q.uid);
        return (
          <li key={q.uid} className={`row${isActive ? ' is-active' : ''}${on ? ' is-checked' : ''}`}>
            <input type="checkbox" checked={on} aria-label={`Chọn câu ${seqLabel(q.seq)}`} onChange={() => toggle(sel, q.uid, setSel)} />
            <button type="button" className="row-main" aria-current={isActive ? 'true' : undefined} title={plainSnippet(p.stem, 400)} onClick={() => { setActiveUid(q.uid); setDetailOpen(true); }}>
              <span className="row-top">
                <span className="mono row-no">{seqLabel(q.seq)}</span>
                <span className="code-tag">{questionCode(q, q.level)}</span>
                <span className={`pill t-${q.type}`}>{TYPE_LABEL[q.type]}</span>
                <span className={`pill l-${q.level}`}>{LEVEL_LABEL[q.level]}</span>
                <ReviewBadge q={q} compact />
              </span>
              <span className="row-text">{plainSnippet(p.stem) || '(câu chưa có đề bài)'}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  const activeFilters = (formId ? 1 : 0) + levels.size + types.size + (reviewF !== 'all' ? 1 : 0);
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

      <div className={`body-row${view === 'list' ? ' is-list' : ''}${!treeOpen ? ' tree-hidden' : ''}`}>
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
          <div className="qbar">
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
            <div className="vseg" role="group" aria-label="Kiểu hiển thị">
              <button type="button" aria-pressed={view === 'cards'} onClick={() => setView('cards')}>Thẻ</button>
              <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>Danh sách</button>
            </div>
            <button type="button" className="btn btn-sm" aria-pressed={treeOpen} onClick={() => setTreeOpen(!treeOpen)}>{treeOpen ? 'Ẩn mục lục' : 'Hiện mục lục'}</button>
            <button type="button" className="btn btn-sm" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>
              Bộ lọc{activeFilters > 0 && <span className="chip-n on">{activeFilters}</span>} {filtersOpen ? '▴' : '▾'}
            </button>
          </div>

          {filtersOpen && <div className="fgroups">
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
            <div className="fgroup">
              <h3>Kiểm duyệt</h3>
              <div className="chips">
                {(['all', 'unreviewed', 'needs_fix', 'approved'] as const).map((r) => (
                  <button key={r} type="button" className="chip" aria-pressed={reviewF === r} onClick={() => { setReviewF(r); setPage(0); }}>
                    {r === 'all' ? 'Tất cả' : REVIEW_LABEL[r]}<span className="chip-n">{reviewTally(r)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>}

          {sel.size > 0 ? (
            <div className="selbar">
              <span className="selbar-n"><b>Đã chọn {sel.size} câu</b></span>
              <label className="sw"><input type="checkbox" checked={showSol} onChange={(e) => setShowSol(e.target.checked)} />Hiện lời giải</label>
              <div className="head-actions" style={{ gap: 8 }}>
                <button type="button" className="btn btn-sm" onClick={() => setSel(new Set())}>Bỏ chọn</button>
                <button type="button" className="btn btn-sm" onClick={exportSelected}>Xuất .tex</button>
                {featureOn('exam') && <button type="button" className="btn btn-sm btn-accent" onClick={() => go({ screen: 'exam', examPick: [...sel] })}>Thêm vào đề</button>}
              </div>
            </div>
          ) : (
            <div className="list-head">
              <span><b className="lh-title">{heading}</b>{lesson ? ` · Bài: ${lesson.name}` : ''} · <b style={{ color: 'var(--ink)' }}>{nf.format(list.length)} câu</b>{pages > 1 && ` · đang xem ${cur * PER_PAGE + 1}–${Math.min(list.length, (cur + 1) * PER_PAGE)}`}</span>
              <label className="sw"><input type="checkbox" checked={showSol} onChange={(e) => setShowSol(e.target.checked)} />Hiện lời giải</label>
              {shown.length > 0 && <button type="button" className="linkbtn" onClick={() => setSel(new Set([...sel, ...shown.map((q) => q.uid)]))}>Chọn cả trang</button>}
            </div>
          )}

          {view === 'cards' && shown.map((q) => renderCard(q, 'card'))}

          {view === 'list' && shown.length > 0 && active && (
            <div className={`split${detailOpen ? ' has-detail' : ''}`}>
              {renderRows()}
              <div className="detail" aria-label="Chi tiết câu đang xem">
                <button type="button" className="linkbtn detail-back" onClick={() => setDetailOpen(false)}>‹ Quay lại danh sách</button>
                {renderCard(active, 'detail')}
              </div>
            </div>
          )}

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
              {questions.length > 0 && <button type="button" className="btn btn-sm" onClick={() => { setTypes(new Set()); setLevels(new Set()); setReviewF('all'); setText(''); setFormId(null); }}>Xoá bộ lọc</button>}
            </div>
          )}
        </section>
      </div>
      {opened && <QuestionDrawer q={opened} onClose={() => setOpenUid(null)} onDirty={() => undefined} />}
    </>
  );
}
