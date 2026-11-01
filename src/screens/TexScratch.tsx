// Màn "Xử lí TeX" — Đợt 1a (claude/de-xuat-man-xu-li-tex.md mục 10): bàn nháp soạn các khối \begin{ex}…\end{ex}.
// Khung soạn (CodeEditor) + danh sách câu (phân tích CHỈ ĐỌC, texscratch.ts) + xem nhanh từng câu (gần đúng, có thể khác PDF).
// Một bản nháp duy nhất, lưu bền (scratchdraft.ts → texscratch.rs). Không ghi gì vào ngân hàng hay Thư viện đề; không sửa văn bản.
// Biên dịch PDF bằng TeX Live là Đợt 1b (PR sau).
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { CodeEditor, type CodeEditorHandle } from '../components/CodeEditor';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { IcAlert, IcCheckCircle } from '../components/Icons';
import { QuestionView } from '../components/QuestionView';
import { useTaxonomy } from '../lib/curriculum';
import { parseExTest } from '../lib/extest';
import { AUTOSAVE_MS, loadDraft, SAVE_LABEL, saveDraft, type SaveState } from '../lib/scratchdraft';
import { blockInfos, ID_STATE_LABEL, scanScratch, type BlockInfo } from '../lib/texscratch';

const KEY = 'nhap';
const MODE_KEY = 'hedu.texmode';
type VMode = 'code' | 'both' | 'view';
const nf = new Intl.NumberFormat('vi-VN');
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const lines = (xs: readonly number[]) => (xs.length > 4 ? `${xs.slice(0, 4).join(', ')}…` : xs.join(', '));

export function TexScratchScreen() {
  const { toast } = useApp();
  const { tax } = useTaxonomy();
  const ed = useRef<CodeEditorHandle>(null);
  const [text, setText] = useState('');
  const [ready, setReady] = useState(false);
  /** không đọc được bản nháp (kể cả bản dự phòng): khoá ghi để không đè lên tệp người dùng còn cứu được */
  const [blocked, setBlocked] = useState<string | null>(null);
  const [fromBackup, setFromBackup] = useState(false);
  const [save, setSave] = useState<SaveState>('da-luu');
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [vmode, setVmodeState] = useState<VMode>(() => { try { const v = localStorage.getItem(MODE_KEY); return v === 'code' || v === 'view' ? v : 'both'; } catch { return 'both'; } });
  const setVmode = (v: VMode) => { setVmodeState(v); try { localStorage.setItem(MODE_KEY, v); } catch { /* chỉ là tiện lợi */ } };
  const [pane, setPane] = useState<'code' | 'view'>('code'); // khung hẹp
  const [sel, setSel] = useState<number | null>(null);
  const [showSol, setShowSol] = useState(true);
  const [askClear, setAskClear] = useState(false);

  const latest = useRef('');
  const saved = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const blockedRef = useRef<string | null>(null);

  /** Lưu NGAY (Ctrl+S, rời màn, hết thời gian chờ). Các lần lưu chạy nối tiếp nhau, không chồng. */
  const flush = useCallback((): Promise<void> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    chain.current = chain.current.then(async () => {
      if (blockedRef.current) return;
      const t = latest.current;
      if (t === saved.current) { setSave('da-luu'); return; }
      setSave('dang-luu');
      try {
        await saveDraft(t);
        saved.current = t;
        ed.current?.markSaved(KEY, t);
        setSaveErr(null);
        setSave(latest.current === t ? 'da-luu' : 'chua-luu');
      } catch (e) {
        setSaveErr(msg(e));
        setSave('loi');
      }
    });
    return chain.current;
  }, []);

  useEffect(() => {
    let alive = true;
    loadDraft().then((d) => {
      if (!alive) return;
      const t = d.text ?? '';
      latest.current = t; saved.current = t;
      setText(t); setFromBackup(d.fromBackup); setReady(true);
      ed.current?.open(KEY, t, false);
    }).catch((e) => {
      if (!alive) return;
      const m = `Không đọc được bản nháp đã lưu (${msg(e)}). HEdu không ghi đè lên tệp đó; nội dung mới sẽ KHÔNG được lưu cho tới khi mở lại được.`;
      blockedRef.current = m; setBlocked(m); setReady(true);
      ed.current?.open(KEY, '', false);
    });
    return () => {
      alive = false;
      // rời màn: lưu nốt phần chưa lưu
      if (latest.current !== saved.current && !blockedRef.current) void saveDraft(latest.current).catch(() => undefined);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const onChangeText = (_k: string, t: string) => {
    latest.current = t;
    setText(t);
    if (blockedRef.current) return;
    setSave('chua-luu');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
  };

  const slow = useDeferredValue(text);
  const scan = useMemo(() => scanScratch(slow), [slow]);
  const infos = useMemo(() => blockInfos(scan, tax), [scan, tax]);
  const cur: BlockInfo | null = infos.find((b) => b.block.n === sel) ?? infos[0] ?? null;
  const parsed = useMemo(() => (cur?.block.closed ? parseExTest(cur.block.text) : null), [cur]);
  const nId = infos.filter((b) => b.id.state === 'co-trong-cay').length;
  const nBad = infos.filter((b) => b.problems > 0).length;

  const pick = (b: BlockInfo) => { setSel(b.block.n); ed.current?.jump(KEY, b.block.line0); if (vmode === 'view') setVmode('both'); };
  const clearAll = () => { setAskClear(false); ed.current?.replaceDoc(KEY, ''); ed.current?.focus(); toast('Đã xoá nội dung bàn nháp. Bấm Ctrl+Z trong khung soạn để lấy lại.'); };

  return (
    <div className="qe-page tsx-page">
      <header className="page-head tsx-head">
        <div>
          <h1>Xử lí TeX</h1>
          <span className="sys-hint">Dán hoặc gõ các khối <code>\begin{'{ex}'}…\end{'{ex}'}</code>. Khai báo gói có sẵn, không cần <code>\documentclass</code>. Bàn nháp không ghi vào ngân hàng.</span>
        </div>
        <div className="head-actions">
          <span className={`qs ${save === 'loi' ? 'bad' : save === 'da-luu' ? 'ok' : 'idle'}`} role="status" title={saveErr ?? undefined}>{blocked ? 'Không lưu được' : SAVE_LABEL[save]}</span>
          <button type="button" className="btn btn-sm" disabled={!!blocked || save === 'da-luu'} onClick={() => void flush()} title="Ctrl+S">Lưu nháp</button>
          <button type="button" className="btn btn-sm btn-ghost" disabled={!text} onClick={() => setAskClear(true)}>Xoá nội dung…</button>
        </div>
      </header>

      {blocked && <div className="note bad" role="alert"><div className="note-body"><IcAlert size={16} /><span>{blocked}</span></div></div>}
      {fromBackup && <div className="note warn" role="status"><div className="note-body"><span>Bản nháp chính bị hỏng nên HEdu đã mở bản dự phòng gần nhất. Kiểm tra lại nội dung.</span></div></div>}
      {saveErr && !blocked && <div className="note bad" role="alert"><div className="note-body"><span>{saveErr}</span><button type="button" className="btn btn-sm" onClick={() => void flush()}>Thử lưu lại</button></div></div>}

      <div className="seg sm qe-vmode" role="group" aria-label="Chế độ xem">
        {([['code', 'Mã'], ['both', 'Mã + Xem trước'], ['view', 'Xem trước']] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={vmode === k} onClick={() => setVmode(k)}>{l}</button>
        ))}
      </div>
      <div className="qe-tabs" role="tablist" aria-label="Khung đang xem">
        <button type="button" role="tab" aria-selected={pane === 'code'} onClick={() => setPane('code')}>Mã LaTeX</button>
        <button type="button" role="tab" aria-selected={pane === 'view'} onClick={() => setPane('view')}>Câu hỏi</button>
      </div>

      <div className="qe-panes tsx-panes" data-pane={pane} data-vmode={vmode}>
        <section className="qe-code" aria-label="Mã LaTeX">
          <div className="qe-bar"><h2>Mã LaTeX</h2><span className="qe-pos">{ready ? `${nf.format(scan.blocks.length)} khối ex` : 'Đang mở bản nháp…'}</span></div>
          <div className="tsx-editor">
            <CodeEditor ref={ed} label="Soạn nội dung LaTeX" onDirty={() => undefined} onSave={() => void flush()} onChangeText={onChangeText} />
          </div>
        </section>

        <section className="qe-view tsx-view" aria-label="Câu hỏi">
          <div className="qe-bar">
            <h2>Câu hỏi</h2>
            <span className="tsx-tag" title="Dựng nhanh trong app, không qua TeX Live">Xem nhanh (có thể khác PDF)</span>
            <label className="sw"><input type="checkbox" checked={showSol} onChange={(e) => setShowSol(e.target.checked)} />Lời giải</label>
          </div>
          <div className="tsx-notes">
            {scan.fullDoc.length > 0 && <p className="q-warn">Có vẻ đây là cả một tài liệu (<code>\documentclass</code>/<code>\begin{'{document}'}</code> ở dòng {lines(scan.fullDoc)}). Màn này đã có sẵn khai báo; nên chỉ giữ các khối câu hỏi. HEdu không tự xoá phần nào.</p>}
            {scan.io.length > 0 && <p className="q-warn">Có lệnh đọc/ghi tệp ({[...new Set(scan.io.map((x) => x.text))].join(', ')} ở dòng {lines(scan.io.map((x) => x.line))}). Khi biên dịch, chỉ đọc được tệp trong thư mục của bàn nháp.</p>}
            {scan.strayEnds.length > 0 && <p className="q-warn"><code>\end{'{ex}'}</code> thừa ở dòng {lines(scan.strayEnds)}.</p>}
            {scan.outside.length > 0 && <p className="sys-hint">{scan.outside.length} đoạn nằm ngoài các khối câu (dòng {lines(scan.outside.map((o) => o.line0))}): giữ nguyên, không tính là câu.</p>}
          </div>
          <div className="tsx-split">
            <ol className="tsx-list" aria-label="Danh sách câu">
              {infos.length === 0 && <li className="sys-hint">Chưa có khối <code>\begin{'{ex}'}</code> nào.</li>}
              {infos.map((b) => (
                <li key={b.block.n}>
                  <button type="button" className={`tsx-item${cur?.block.n === b.block.n ? ' on' : ''}`} aria-current={cur?.block.n === b.block.n ? 'true' : undefined} onClick={() => pick(b)} title={b.firstProblem ?? undefined}>
                    <b>Câu {b.block.n}</b>
                    <span className="tsx-ln">dòng {b.block.line0}–{b.block.line1}</span>
                    <span className={`tsx-id id-${b.id.state}`}>{b.id.code ? `${b.id.code} · ` : ''}{ID_STATE_LABEL[b.id.state]}</span>
                    {b.problems > 0 && <span className="tsx-bad"><IcAlert size={13} />{b.problems}</span>}
                  </button>
                </li>
              ))}
            </ol>
            <div className="qe-sheet tsx-sheet">
              {!cur ? <p className="sys-hint">Dán nội dung vào khung Mã LaTeX để xem từng câu.</p>
                : !parsed ? <p className="q-warn">Câu {cur.block.n} chưa có <code>\end{'{ex}'}</code> nên chưa xem nhanh được.</p>
                : <>
                    {cur.firstProblem && <p className="q-warn">{cur.firstProblem}</p>}
                    <QuestionView p={parsed} number={cur.block.n} raw={cur.block.text} showSolution={showSol} />
                  </>}
            </div>
          </div>
        </section>
      </div>

      <footer className="qe-status" aria-label="Trạng thái">
        <span className="qs">{nf.format(infos.length)} câu</span>
        <span className="qs" title="ID đúng cú pháp và có trong cây chương trình (chưa phải giáo viên xác minh Dạng)">{nf.format(nId)} có ID trong cây</span>
        <span className={`qs ${nBad ? 'bad' : 'ok'}`}>{nBad ? <IcAlert size={15} /> : <IcCheckCircle size={15} />}{nBad ? `${nf.format(nBad)} câu cần xem lại` : 'Không thấy lỗi cú pháp'}</span>
        <span className="qs idle">PDF TeX Live: có ở bản cập nhật sau</span>
      </footer>

      {askClear && (
        <ConfirmDialog title="Xoá toàn bộ nội dung bàn nháp?" confirmLabel="Xoá nội dung" danger onConfirm={clearAll} onCancel={() => setAskClear(false)}>
          <p>Bản nháp được lưu lại sau khi xoá. Muốn lấy lại, bấm Ctrl+Z trong khung soạn trước khi đóng app.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
