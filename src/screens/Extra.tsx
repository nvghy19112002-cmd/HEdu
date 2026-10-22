// Màn Nhập liệu: dán hoặc mở file LaTeX, xem trước rồi nhập hàng loạt vào ngân hàng.
import { useMemo, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { chapters, firstLocation, grades } from '../lib/curriculum';
import { shortName } from '../lib/taxonomy';
import { findDuplicates } from '../lib/dup';
import { parseExTest, splitExBlocks } from '../lib/extest';
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

  const rows = useMemo(() => splitExBlocks(src).map((latex) => {
    const p = parseExTest(latex);
    const fromId = p.idComment ? parseCode(p.idComment) : null;
    const dup = findDuplicates(latex, questions)[0];
    return { latex, p, fromId, dup };
  }), [src, questions]);
  const importable = rows.filter((r) => !(r.dup && r.dup.score === 1));

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
            <h2 style={{ marginTop: 6 }}>Tìm thấy {rows.length} câu</h2>
            <ol style={{ margin: 0, paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13.5 }}>
              {rows.map((r, i) => (
                <li key={i}>
                  <b>{TYPE_LABEL[r.p.type]}</b> · {r.fromId ? <span className="mono">{questionCode(r.fromId.loc, r.fromId.level)}</span> : 'không có ID'}
                  {r.p.issues.length > 0 && <span style={{ color: 'var(--warn)' }}> · {r.p.issues[0]}</span>}
                  {r.dup && <span style={{ color: 'var(--accent)' }}> · {r.dup.score === 1 ? 'trùng hẳn, bỏ qua' : `giống ${Math.round(r.dup.score * 100)}% một câu đã có`}</span>}
                </li>
              ))}
            </ol>
            <div><button type="button" className="btn btn-accent" disabled={!importable.length} onClick={run}>Nhập {importable.length} câu vào ngân hàng</button></div>
          </div>
        )}
      </div>
    </>
  );
}
