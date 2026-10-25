// Màn Thư viện đề thi (E1): danh sách dự án đề, nhập .tex đơn / thư mục (sao chép vào thư viện), tạo đề trống, xem chi tiết tệp.
// Chỉ ĐỌC/SAO CHÉP: tệp gốc ngoài không bị đụng. Biên dịch PDF, soạn nhiều tab, sao lưu: E2–E4 (claude/thiet-ke-de-thi.md).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { isDesktop } from '../lib/platform';
import {
  chooseProjectFolder, chooseTexFile, DEFAULT_EXAM_FILTER, dateText, describeScan, examCreate, examGet, examImport, examList, examScan, examVerify, filterExams,
  formatBytes, KIND_LABEL, needsMainChoice, SORT_LABEL, sortExams, STATUS_LABEL,
  type ExamFilter, type ExamKind, type ExamManifest, type ExamScan, type ExamSort, type ExamStatus, type ExamSummary, type ExamVerify,
} from '../lib/examlib';

const nf = new Intl.NumberFormat('vi-VN');
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface Pending { path: string; scan: ExamScan; name: string; main: string }

export function ExamLibraryScreen() {
  const { toast } = useApp();
  const desktop = isDesktop();
  const [items, setItems] = useState<ExamSummary[]>([]);
  const [load, setLoad] = useState<'loading' | 'ok' | 'error'>(desktop ? 'loading' : 'ok');
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<ExamFilter>(DEFAULT_EXAM_FILTER);
  const [sort, setSort] = useState<ExamSort>('updated');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ExamManifest | null>(null);
  const [check, setCheck] = useState<ExamVerify | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [newName, setNewName] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try { setItems(await examList()); setLoad('ok'); setErr(null); }
    catch (e) { setLoad('error'); setErr(msg(e)); }
  }, []);
  useEffect(() => { if (desktop) void reload(); }, [desktop, reload]);

  useEffect(() => {
    setDetail(null); setCheck(null);
    if (!activeId) return;
    let live = true;
    examGet(activeId).then((m) => { if (live) setDetail(m); }).catch((e) => { if (live) toast(`Không đọc được dự án: ${msg(e)}`); });
    return () => { live = false; };
  }, [activeId, toast]);

  const shown = useMemo(() => sortExams(filterExams(items, filter), sort), [items, filter, sort]);
  const filtered = filter.text.trim() !== '' || filter.kind !== 'all' || filter.status !== 'all';

  const run = async (f: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await f(); } catch (e) { toast(msg(e)); } finally { busyRef.current = false; setBusy(false); }
  };

  const pick = (choose: () => Promise<string | null>) => run(async () => {
    const path = await choose();
    if (!path) return;
    const scan = await examScan(path);
    setPending({ path, scan, name: scan.name, main: scan.mainFile ?? '' });
  });

  const confirmImport = () => run(async () => {
    if (!pending) return;
    if (needsMainChoice(pending.scan) && pending.scan.candidates.length > 1 && !pending.main) { toast('Hãy chọn tệp chính trước khi nhập.'); return; }
    const s = await examImport(pending.path, pending.name, pending.main || null);
    setPending(null);
    await reload();
    setActiveId(s.id);
    toast(`Đã nhập “${s.name}” vào thư viện. Tệp gốc không bị thay đổi.`);
  });

  const createBlank = () => run(async () => {
    const s = await examCreate(newName ?? '');
    setNewName(null);
    await reload();
    setActiveId(s.id);
  });

  const verify = () => run(async () => { if (activeId) setCheck(await examVerify(activeId)); });

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Thư viện đề thi</h1>
          <span className="sys-hint">Đề được SAO CHÉP vào thư viện của HEdu; tệp gốc của bạn không bị sửa. Biên dịch PDF và soạn thảo có ở các bản sau.</span>
        </div>
        <div className="xl-actions">
          <button type="button" className="btn btn-sm" disabled={!desktop || busy} onClick={() => pick(chooseTexFile)}>Nhập .tex</button>
          <button type="button" className="btn btn-sm" disabled={!desktop || busy} onClick={() => pick(chooseProjectFolder)}>Nhập thư mục</button>
          <button type="button" className="btn btn-sm" disabled={!desktop || busy} onClick={() => setNewName('')}>Tạo đề trống</button>
        </div>
      </header>
      <div className="simple xl-wrap">
        {!desktop && <div className="note warn" role="status"><div className="note-body"><b>Chỉ có trên app Windows</b><span>Thư viện đề lưu tệp trên máy nên không dùng được ở bản xem thử trên trình duyệt.</span></div></div>}
        {load === 'error' && <div className="note bad" role="alert"><div className="note-body"><b>Chưa đọc được thư viện đề</b><span>{err} Tệp của bạn trong thư viện không bị xoá.</span></div></div>}

        {newName !== null && (
          <div className="xl-box" role="group" aria-label="Tạo đề trống">
            <label>Tên đề <input className="xl-in" value={newName} autoFocus maxLength={120} placeholder="Ví dụ: Đề HKI Toán 12" onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void createBlank(); }} /></label>
            <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={createBlank}>Tạo</button>
            <button type="button" className="btn btn-sm" onClick={() => setNewName(null)}>Huỷ</button>
          </div>
        )}

        {pending && (
          <div className="xl-box xl-col" role="group" aria-label="Xác nhận nhập đề">
            <b>Nhập vào thư viện: {pending.path}</b>
            <ul className="xl-lines">{describeScan(pending.scan).map((l, i) => <li key={i}>{l}</li>)}</ul>
            {pending.scan.skipped.length > 0 && (
              <details open><summary>Các mục không được chép ({pending.scan.skipped.length})</summary>
                <ul className="xl-lines">{pending.scan.skipped.slice(0, 50).map((k, i) => <li key={i}><code>{k.rel}</code>: {k.reason}</li>)}{pending.scan.skipped.length > 50 && <li>…và {pending.scan.skipped.length - 50} mục khác.</li>}</ul>
              </details>
            )}
            <label>Tên đề <input className="xl-in" value={pending.name} maxLength={120} onChange={(e) => setPending({ ...pending, name: e.target.value })} /></label>
            {pending.scan.kind === 'multi' && (
              <label>Tệp chính
                <select className="xl-in" value={pending.main} onChange={(e) => setPending({ ...pending, main: e.target.value })}>
                  <option value="">{pending.scan.candidates.length ? '— chọn tệp chính —' : '— chọn sau —'}</option>
                  {(pending.scan.candidates.length ? pending.scan.candidates : pending.scan.files.filter((f) => f.rel.toLowerCase().endsWith('.tex')).map((f) => f.rel)).map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
            )}
            <div className="xl-actions">
              <button type="button" className="btn btn-sm btn-primary" disabled={busy || pending.scan.truncated} onClick={confirmImport}>{busy ? 'Đang chép…' : 'Nhập vào thư viện'}</button>
              <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setPending(null)}>Huỷ</button>
            </div>
          </div>
        )}

        <div className="xl-bar">
          <input className="xl-in xl-search" type="search" aria-label="Tìm đề" placeholder="Tìm theo tên, tệp chính, nhãn, năm học, lớp…" value={filter.text} onChange={(e) => setFilter({ ...filter, text: e.target.value })} />
          <select className="xl-in" aria-label="Loại dự án" value={filter.kind} onChange={(e) => setFilter({ ...filter, kind: e.target.value as ExamKind | 'all' })}>
            <option value="all">Mọi loại</option>{(Object.keys(KIND_LABEL) as ExamKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
          <select className="xl-in" aria-label="Trạng thái" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value as ExamStatus | 'all' })}>
            <option value="all">Mọi trạng thái</option>{(Object.keys(STATUS_LABEL) as ExamStatus[]).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
          </select>
          <select className="xl-in" aria-label="Sắp xếp" value={sort} onChange={(e) => setSort(e.target.value as ExamSort)}>
            {(Object.keys(SORT_LABEL) as ExamSort[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
          </select>
          <b className="xl-count" aria-live="polite">{nf.format(shown.length)} / {nf.format(items.length)} đề</b>
        </div>

        {load === 'loading' && <p className="aid-wait" role="status">Đang đọc thư viện đề…</p>}
        {load === 'ok' && items.length === 0 && desktop && (
          <div className="empty" role="status"><b>Thư viện đề chưa có đề nào.</b><span>Nhập một tệp .tex, một thư mục dự án, hoặc tạo đề trống để bắt đầu.</span></div>
        )}
        {items.length > 0 && shown.length === 0 && (
          <div className="empty" role="status"><b>Không có đề nào khớp.</b>{filtered && <button type="button" className="btn btn-sm" onClick={() => setFilter(DEFAULT_EXAM_FILTER)}>Xoá bộ lọc</button>}</div>
        )}

        {shown.length > 0 && (
          <div className="xl-split">
            <ul className="xl-list" aria-label="Danh sách đề">
              {shown.map((e) => (
                <li key={e.id}>
                  <button type="button" className="xl-row" aria-pressed={e.id === activeId} onClick={() => setActiveId(e.id === activeId ? null : e.id)}>
                    <span className="xl-name">{e.name}</span>
                    <span className="xl-meta">{KIND_LABEL[e.kind]} · {e.fileCount} tệp · {formatBytes(e.totalBytes)} · {STATUS_LABEL[e.status]} · sửa {dateText(e.updatedAt)}</span>
                    {(e.warningCount > 0 || e.skippedCount > 0 || !e.mainFile) && (
                      <span className="xl-flags">{!e.mainFile && 'Chưa chọn tệp chính. '}{e.skippedCount > 0 && `${e.skippedCount} mục không chép. `}{e.warningCount > 0 && `${e.warningCount} cảnh báo.`}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            {activeId && (
              <aside className="xl-detail" aria-label="Chi tiết đề">
                {!detail ? <p className="aid-wait">Đang đọc…</p> : (
                  <>
                    <h2>{detail.name}</h2>
                    <p className="xl-meta">Tệp chính: <b>{detail.mainFile ?? 'chưa chọn'}</b> · tạo {dateText(detail.createdAt)}</p>
                    <p className="xl-meta">Nguồn: {detail.source.mode === 'created' ? 'tạo trong HEdu' : `đã chép từ ${detail.source.originalPathDisplay}`}</p>
                    {detail.warnings.length > 0 && <div className="note warn"><div className="note-body">{detail.warnings.map((w, i) => <span key={i}>{w}</span>)}</div></div>}
                    {detail.skipped.length > 0 && <details><summary>{detail.skipped.length} mục không được chép</summary><ul className="xl-lines">{detail.skipped.map((k, i) => <li key={i}><code>{k.rel}</code>: {k.reason}</li>)}</ul></details>}
                    <details open><summary>{detail.files.length} tệp</summary>
                      <ul className="xl-lines">{detail.files.slice(0, 300).map((f) => <li key={f.rel}><code>{f.rel}</code> <span className="xl-meta">{formatBytes(f.bytes)}</span></li>)}{detail.files.length > 300 && <li>…và {detail.files.length - 300} tệp khác.</li>}</ul>
                    </details>
                    <button type="button" className="btn btn-sm" disabled={busy} onClick={verify}>Kiểm tra tệp trong thư viện</button>
                    {check && (
                      <div className={`note ${check.ok && check.extra.length === 0 ? 'ok' : 'warn'}`} role="status"><div className="note-body">
                        {check.ok && check.extra.length === 0 ? <b>Mọi tệp khớp với lúc nhập.</b> : <b>Có khác biệt so với lúc nhập</b>}
                        {check.changed.length > 0 && <span>Đã bị sửa: {check.changed.join(', ')}</span>}
                        {check.missing.length > 0 && <span>Bị mất: {check.missing.join(', ')}</span>}
                        {check.blocked.length > 0 && <span>Bị chặn vì là liên kết/junction hoặc không đọc an toàn được (HEdu không đi theo): {check.blocked.join(', ')}</span>}
                        {check.extra.length > 0 && <span>Tệp thêm ngoài HEdu: {check.extra.join(', ')}</span>}
                      </div></div>
                    )}
                  </>
                )}
              </aside>
            )}
          </div>
        )}
      </div>
    </>
  );
}
