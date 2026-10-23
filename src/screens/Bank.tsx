// Màn hình Ngân hàng câu hỏi.
// Bố cục: thanh trái "Mục lục & bộ lọc" (Lớp → Phân môn → Chương → Bài → Dạng; Mức độ, Loại, Hình, Kiểm duyệt); cột phải tìm kiếm và xem câu.
// Mọi lựa chọn đều hiện sẵn số câu (đếm theo chiều) để biết chỗ nào đang thiếu.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { featureOn } from '../lib/features';
import { QuestionView } from '../components/QuestionView';
import { CompiledView } from '../components/CompiledView';
import { QuestionDrawer } from '../components/QuestionDrawer';
import { isTikzReady } from '../lib/tikz';
import { loadBankView, loadTreeOpen, saveBankView, saveTreeOpen, type BankView } from '../lib/bankview';
import { plainSnippet } from '../lib/snippet';
import { IcCopy, IcEdit, IcMore, IcSearch, IcTrash } from '../components/Icons';
import { buildExTest, parseExTest } from '../lib/extest';
import { place, useTaxonomy } from '../lib/curriculum';
import { shortName } from '../lib/taxonomy';
import { questionCode, seqLabel } from '../lib/id';
import { duplicateQuestion, setReview, useBank } from '../lib/store';
import { moveToTrash } from '../lib/trashflow';
import { BankSidebar } from '../components/BankSidebar';
import { attrCount, chapterBranchMap, clearAttrs, computeFacets, emptyFilters, sanitize, type BankFilters } from '../lib/bankfilter';
import { DupCheck } from '../components/DupCheck';
import { ReviewBadge, ReviewControl } from '../components/ReviewControl';
import { LEVEL_LABEL, REVIEW_LABEL, TYPE_LABEL, type Question, type ReviewStatus } from '../lib/types';

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

  const [f0, setF0] = useState<BankFilters>(emptyFilters); // vị trí + thuộc tính; luôn đi qua sanitize trước khi dùng
  const [text, setText] = useState('');
  const [wide, setWide] = useState(false); // tìm trong toàn bộ ngân hàng thay vì mục đang chọn (chỉ có hiệu lực khi đang có chữ tìm)
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
  const [treeOpen, setTreeOpenState] = useState(() => loadTreeOpen() ?? (typeof window !== 'undefined' && window.innerWidth < 1000 ? false : loadBankView() === 'list' ? typeof window === 'undefined' || window.innerWidth >= 1500 : true));
  const setTreeOpen = (o: boolean) => { setTreeOpenState(o); saveTreeOpen(o); };
  const [dupOpen, setDupOpen] = useState(false); // màn Kiểm tra trùng
  const [menuUid, setMenuUid] = useState<string | null>(null); // menu ba chấm của thẻ

  const index = useMemo(() => new Map(questions.map((q) => [q.uid, searchable(q)])), [questions]);

  const f = useMemo(() => sanitize(tax, f0), [tax, f0]);
  const setF = (n: BankFilters) => { setPage(0); setF0(n); };
  const hasText = text.trim().length > 0;
  const wideOn = wide && hasText;
  const gradeNum = f.gradeNum;
  const gradeObj = tax.grades.find((g) => g.grade === gradeNum) ?? null;
  const chapter = gradeObj?.branches.flatMap((b) => b.chapters).find((c) => c.id === f.chapterId) ?? null;
  const lesson = chapter?.lessons.find((l) => l.id === f.lessonId) ?? null;

  /** Một lượt duyệt: danh sách hiện ra + số đếm theo chiều cho mọi ô lọc. */
  const facets = useMemo(() => {
    const words = fold(text.trim()).split(/\s+/).filter(Boolean);
    return computeFacets(questions, f, { chapterBranch: chapterBranchMap(tax), wide: wideOn, textOk: (uid) => words.every((w) => index.get(uid)!.includes(w)) });
  }, [questions, f, text, wideOn, tax, index]);
  const list = facets.list;

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

  /** Từ màn Kiểm tra trùng: chuyển tới đúng câu trong Ngân hàng (xem ở chế độ Danh sách) để giáo viên tự xoá có xác nhận. */
  const gotoQuestion = (uid: string) => {
    const q = questions.find((x) => x.uid === uid);
    if (!q) return;
    setDupOpen(false); setWide(false); setText('');
    setF0({ ...emptyFilters(), gradeNum: q.grade, branchId: chapterBranchMap(tax).get(q.chapterId) ?? null, chapterId: q.chapterId || null, lessonId: q.lessonId || null });
    const sc = questions.filter((x) => x.grade === q.grade && (!q.chapterId || x.chapterId === q.chapterId) && (!q.lessonId || x.lessonId === q.lessonId)).sort((a, b) => b.updatedAt - a.updatedAt);
    setPage(Math.floor(Math.max(0, sc.findIndex((x) => x.uid === uid)) / PER_PAGE));
    setView('list'); setActiveUid(uid); setDetailOpen(true);
    toast(`Đã chuyển tới ${seqLabel(q.seq)}. Muốn xoá: nút ⋯ → Xoá câu (có hỏi lại).`);
  };

  const clearFilters = () => setF(clearAttrs(f));
  const resetEverything = () => { setF(emptyFilters()); setText(''); setWide(false); };
  const nAttr = attrCount(f);
  const canReset = f.gradeNum != null || nAttr > 0 || hasText || wide;

  // Thanh trái: gắn cố định khi đủ rộng và đang mở; ngược lại là ngăn trượt (cùng một thành phần, cùng trạng thái).
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1000);
  useEffect(() => { const h = () => setNarrow(window.innerWidth < 1000); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  const docked = !narrow && treeOpen;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (docked && drawerOpen) setDrawerOpen(false); }, [docked, drawerOpen]);
  useEffect(() => {
    if (!drawerOpen) return;
    document.querySelector<HTMLElement>('.fside.is-drawer .fs-top button')?.focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.fm-pop')) { e.preventDefault(); setDrawerOpen(false); openerRef.current?.focus(); }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [drawerOpen]);

  const toggle = <T,>(set: Set<T>, v: T, apply: (s: Set<T>) => void) => { const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); apply(n); };
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
    if (ok && f.review !== 'all' && (s ?? 'unreviewed') !== f.review) toast(`${seqLabel(q.seq)} chuyển sang “${REVIEW_LABEL[s ?? 'unreviewed']}” nên không còn trong bộ lọc này.`);
    return ok;
  };

  /** Xoá một câu: bỏ khỏi ô chọn, và nếu đang xem câu đó thì chuyển sang câu liền kề còn lại. */
  const removeQuestion = async (q: Question) => {
    const i = shown.findIndex((x) => x.uid === q.uid);
    const next = shown[i + 1] ?? shown[i - 1] ?? null;
    setConfirmDel(null);
    if (!(await moveToTrash(q))) { toast('Không lưu được thùng rác nên CHƯA xoá câu. Hãy thử lại hoặc tạo file sao lưu trước.'); return; }
    setSel((s) => { const n = new Set(s); n.delete(q.uid); return n; });
    if (active?.uid === q.uid) setActiveUid(next ? next.uid : null);
    toast(`Đã chuyển ${seqLabel(q.seq)} vào thùng rác (khôi phục ở Hệ thống → Thùng rác).`);
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

  const heading = wideOn ? 'Kết quả tìm trong toàn kho' : chapter ? `Lớp ${gradeNum} · ${chapter.name}` : gradeNum ? `Lớp ${gradeNum}` : 'Toàn bộ ngân hàng';

  return (
    <>
      <header className="page-head bank-head">
        <h1>Ngân hàng câu hỏi</h1>
        <div className="head-actions">
          <button type="button" className="btn btn-outline" onClick={() => go({ screen: 'import' })}>Nhập từ file</button>
          <button type="button" className="btn btn-accent" onClick={() => go({ screen: 'editor' })}>+ Câu hỏi mới</button>
        </div>
      </header>

      <div className={`body-row${view === 'list' ? ' is-list' : ''}${!docked ? ' tree-hidden' : ''}`}>
        {docked && (
          <BankSidebar variant="dock" tax={tax} f={f} facets={facets} wide={wideOn} onF={setF} onClearAttrs={clearFilters} onResetAll={resetEverything} canReset={canReset} onHide={() => setTreeOpen(false)} />
        )}

        <section className="qlist" aria-label="Danh sách câu hỏi">
          <div className="qbar">
            <label className="search sm">
              <IcSearch size={16} />
              <span className="sr-only">Tìm câu hỏi</span>
              <input type="search" value={text} onChange={(e) => { setText(e.target.value); setPage(0); }} placeholder="Tìm câu hoặc mã (vd 2D1H1)" />
              <select className="scope-sel" value={wide ? 'all' : 'here'} onChange={(e) => setWide(e.target.value === 'all')} aria-label="Phạm vi tìm">
                <option value="here">mục này</option>
                <option value="all">toàn kho</option>
              </select>
              <button type="button" className="kbd" style={{ border: 'none' }} onClick={openPalette}>Ctrl K</button>
            </label>
            <div className="vseg" role="group" aria-label="Kiểu hiển thị">
              <button type="button" aria-pressed={view === 'cards'} onClick={() => setView('cards')}>Thẻ</button>
              <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>Danh sách</button>
            </div>
            <button type="button" className="btn btn-sm" onClick={() => setDupOpen(true)}>Kiểm tra trùng</button>
            {!docked && (
              <button ref={openerRef} type="button" className={`btn btn-sm fs-open${nAttr > 0 ? ' on' : ''}`} aria-haspopup="dialog" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)} title="Mở mục lục và bộ lọc">
                {narrow ? 'Mục lục & lọc' : 'Bộ lọc'}{nAttr > 0 && <i className="fs-badge">{nAttr}</i>}
              </button>
            )}
            {!narrow && <button type="button" className="btn btn-sm" aria-pressed={treeOpen} onClick={() => setTreeOpen(!treeOpen)} title="Gắn mục lục và bộ lọc cố định bên trái">Mục lục</button>}
          </div>


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
              {questions.length > 0 && canReset && <button type="button" className="btn btn-sm" onClick={resetEverything}>Đặt lại toàn bộ</button>}
            </div>
          )}
        </section>
      </div>
      {drawerOpen && !docked && (
        <>
          <div className="fs-scrim" onClick={() => { setDrawerOpen(false); openerRef.current?.focus(); }} />
          <BankSidebar variant="drawer" tax={tax} f={f} facets={facets} wide={wideOn} onF={setF} onClearAttrs={clearFilters} onResetAll={resetEverything} canReset={canReset} onHide={() => { setDrawerOpen(false); openerRef.current?.focus(); }} />
        </>
      )}
      {dupOpen && <DupCheck questions={questions} selected={sel} onClose={() => setDupOpen(false)} onOpen={setOpenUid} onGoto={gotoQuestion} onTrash={moveToTrash} />}
      {opened && <QuestionDrawer q={opened} onClose={() => setOpenUid(null)} onDirty={() => undefined} />}
    </>
  );
}
