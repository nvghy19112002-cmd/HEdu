// Màn Nhập liệu: dán hoặc mở file LaTeX, xem trước rồi nhập hàng loạt vào ngân hàng.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { PackagePanel } from '../components/PackagePanel';
import { chapters, firstLocation, grades } from '../lib/curriculum';
import { shortName } from '../lib/taxonomy';
import { checkQuestion, LEVEL_TEXT, worstLevel, type Issue } from '../lib/check';
import { findDuplicates } from '../lib/dup';
import { parseExTest, splitExBlocksAt } from '../lib/extest';
import { parseCode, questionCode } from '../lib/id';
import { addMany, useBank, type Draft } from '../lib/store';
import { LEVEL_LABEL, LEVELS, TYPE_LABEL, type Level, type Location } from '../lib/types';

function readFile(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(file, 'utf-8'); });
}

export function ImportScreen() {
  const { go, toast } = useApp();
  const { questions } = useBank();
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

  const rows = useMemo(() => splitExBlocksAt(text250).map(({ text: latex, line }) => {
    const p = parseExTest(latex);
    const fromId = p.idComment ? parseCode(p.idComment) : null;
    const dup = findDuplicates(latex, questions)[0];
    return { latex, line, p, fromId, dup };
  }), [text250, questions]);

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
  const importable = rows.filter((r) => !(r.dup && r.dup.score === 1));
  const nErr = issues.filter((x) => x && worstLevel(x) === 'loi').length;
  const nWarn = issues.filter((x) => x && worstLevel(x) === 'canh').length;
  const nFig = issues.filter((x) => x?.some((y) => y.level === 'tin')).length;
  const [onlyBad, setOnlyBad] = useState(false);
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [pkgFilter, setPkgFilter] = useState<{ rows: number[]; key: string } | null>(null);
  const [limit, setLimit] = useState(200);
  const blocks = useMemo(() => rows.map((r) => r.latex), [rows]);
  useEffect(() => { setPkgFilter(null); setLimit(200); }, [text250]);
  const shownRows = rows
    .map((r, i) => ({ r, i }))
    .filter(({ i }) => !onlyBad || worstOf(i) === 'loi' || worstOf(i) === 'canh')
    .filter(({ i }) => !pkgFilter || pkgFilter.rows.includes(i));

  const chs = chapters(loc.grade);
  const chapter = chs.find((c) => c.id === loc.chapterId) ?? chs[0];
  const lesson = chapter?.lessons.find((l) => l.id === loc.lessonId) ?? chapter?.lessons[0];

  const run = () => {
    const drafts: Draft[] = importable.map((r) => ({ latex: r.latex.trim(), level: r.fromId?.level ?? level, tags: [], ...(r.fromId?.loc ?? loc) }));
    const added = addMany(drafts);
    toast(`Đã nhập ${added.length} câu vào ngân hàng.`);
    setSrc('');
    go({ screen: 'bank' });
  };

  return (
    <>
      <header className="page-head"><h1>Nhập câu hỏi</h1></header>
      <div className="simple">
        <div className="panel">
          <h2>Dán mã LaTeX hoặc mở file .tex</h2>
          <span style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
            Mỗi câu nằm trong <span className="mono">\begin{'{ex}'} … \end{'{ex}'}</span>. Câu có sẵn ID dạng <span className="mono">%[2D1H1-1]</span> sẽ tự vào đúng bài và mức độ; câu không có ID dùng vị trí chọn bên dưới. Câu trùng hẳn với ngân hàng sẽ được bỏ qua.
          </span>
          <textarea value={src} onChange={(e) => setSrc(e.target.value)} placeholder={'\\begin{ex}%[2D1N1-1]\n  Đề bài ...\n  \\choice\n  {\\True A}{B}{C}{D}\n\\end{ex}'} aria-label="Mã LaTeX cần nhập" spellCheck={false} />
          <div className="head-actions">
            <button type="button" className="btn btn-sm" onClick={() => file.current?.click()}>Mở file .tex</button>
            <button type="button" className="btn btn-sm" onClick={() => toast('Nhập từ Word (.docx có Equation) sẽ có ở bản cài trên Windows.')}>Mở file Word</button>
            <input ref={file} type="file" accept=".tex,.txt" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setSrc(await readFile(f)); e.target.value = ''; }} />
          </div>
        </div>

        {rows.length > 0 && (
          <div className="panel">
            <h2>Vị trí cho câu không có ID</h2>
            <div className="grid2">
              <label className="lbl">Lớp<select className="sel" value={loc.grade} onChange={(e) => setLoc(firstLocation(Number(e.target.value)))}>{grades().map((g) => <option key={g} value={g}>Lớp {g}</option>)}</select></label>
              <label className="lbl">Chương<select className="sel" value={chapter?.id ?? ''} onChange={(e) => setLoc(firstLocation(loc.grade, e.target.value))}>{chs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label className="lbl">Bài<select className="sel" value={lesson?.id ?? ''} onChange={(e) => setLoc(firstLocation(loc.grade, chapter?.id, e.target.value))}>{(chapter?.lessons ?? []).map((l) => <option key={l.id} value={l.id}>{shortName(l.name)}</option>)}</select></label>
              <label className="lbl">Mức độ<select className="sel" value={level} onChange={(e) => setLevel(e.target.value as Level)}>{LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}</select></label>
            </div>
            <PackagePanel src={text250} blocks={blocks} activeFilter={pkgFilter?.key ?? null} onFilter={(r, key) => setPkgFilter(r ? { rows: r, key } : null)} />
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
            <ol className="chk-list">
              {shownRows.slice(0, limit).map(({ r, i }) => (
                <li key={i} className={`chk-row l-${worstOf(i) ?? 'sach'}`}>
                  <button type="button" className="chk-head" aria-expanded={openRow === i} onClick={() => setOpenRow(openRow === i ? null : i)}>
                    <span className="chk-n" title={`Bắt đầu ở dòng ${r.line} của file`}>{i + 1}</span>
                    <b>{TYPE_LABEL[r.p.type]}</b>
                    <span className="mono">{r.fromId ? questionCode(r.fromId.loc, r.fromId.level) : 'không ID'}</span>
                    <span className="chk-stem">{r.p.stem.replace(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g, '[hình]').replace(/\s+/g, ' ').slice(0, 70)}</span>
                    {r.dup && <span className="chk-tag dup">{r.dup.score === 1 ? 'trùng hẳn, bỏ qua' : `giống ${Math.round(r.dup.score * 100)}%`}</span>}
                    {worstOf(i) && <span className={`chk-tag ${worstOf(i)}`}>{worstOf(i) === 'tin' ? 'có hình' : LEVEL_TEXT[worstOf(i)!]}</span>}
                  </button>
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
            <div><button type="button" className="btn btn-accent" disabled={!importable.length || checking} onClick={run}>{checking ? 'Đang kiểm tra…' : `Nhập ${importable.length} câu vào ngân hàng`}</button></div>
          </div>
        )}
      </div>
    </>
  );
}
