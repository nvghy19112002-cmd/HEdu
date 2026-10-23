// Màn hình Hệ thống: phiên bản, cập nhật (kênh chính thức / beta), quay lại bản trước,
// sao lưu tự động trước cập nhật, sao lưu thủ công, dữ liệu mẫu.
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { IcAlert, IcCheckCircle } from '../components/Icons';
import { isDesktop } from '../lib/platform';
import { clearTikzCache, defaultPreamble, findTeX, getSettings as getTikz, probeTeX, setSettings as setTikz, type TikzSettings } from '../lib/tikz';
import { asTikzErr } from '../lib/tikz';
import { addSamples, exportBackup, importBackup, resetToSample, restoreQuestion, useBank } from '../lib/store';
import { decisionsLoaded, loadDecisions, trashList, trashRemove, useDecisions } from '../lib/dupdecisions';
import { plainSnippet } from '../lib/snippet';
import { parseExTest } from '../lib/extest';
import { seqLabel } from '../lib/id';
import {
  backupInfo, checkUpdate, CHANNEL_LABEL, formatBytes, friendlyError, installUpdate, restoreBackup,
  type BackupMeta, type Channel, type Progress, type UpdateInfo,
} from '../lib/updates';
import { FigScalePanel, ZoomPanel } from '../components/ZoomControl';
import { useUpdates } from '../update-context';

function readFile(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(file, 'utf-8'); });
}

function when(ts: number | null): string {
  if (!ts) return '';
  return new Date(ts).toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });
}

type Phase = 'idle' | 'installing' | 'restarting';

export function SystemScreen() {
  const { toast, showFile } = useApp();
  const { questions } = useBank();
  const up = useUpdates();
  const desktop = isDesktop();
  const file = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [installErr, setInstallErr] = useState<string | null>(null);
  const [prev, setPrev] = useState<{ state: 'none' | 'checking' | 'found' | 'missing'; info?: UpdateInfo; msg?: string }>({ state: 'none' });
  const [confirmRollback, setConfirmRollback] = useState(false);

  const [backup, setBackup] = useState<BackupMeta | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [restoreErr, setRestoreErr] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<{ name: string; text: string } | null>(null);
  const [tikz, setTikzState] = useState<TikzSettings>(() => getTikz());
  const [defPre, setDefPre] = useState('');
  const [probing, setProbing] = useState(false);
  const [texMsg, setTexMsg] = useState<string | null>(null);
  const [texLog, setTexLog] = useState('');
  const [texOk, setTexOk] = useState(false);

  const saveTikz = (s: TikzSettings) => { setTikzState(s); setTikz(s); };
  const autoFind = async () => {
    setTexMsg(null);
    try {
      const list = await findTeX();
      if (!list.length) { setTexOk(false); setTexMsg('Không tìm thấy TeX Live ở các chỗ cài quen thuộc. Bạn mở thư mục chứa pdflatex.exe rồi chép đường dẫn vào ô bên dưới.'); return; }
      saveTikz({ ...tikz, texBin: list[0] });
      setTexOk(true);
      setTexMsg(`Tìm thấy: ${list.join(' · ')}. Đã chọn chỗ đầu tiên, bấm Kiểm tra TeX Live để thử.`);
    } catch (e) { setTexOk(false); setTexMsg(asTikzErr(e).message); }
  };

  const checkTeX = async () => {
    setProbing(true); setTexMsg(null); setTexLog('');
    try {
      const v = await probeTeX();
      setTexOk(true);
      setTexMsg(`Dịch thử một hình thành công. ${v || ''}`.trim());
    } catch (e) {
      const err = asTikzErr(e);
      setTexOk(false);
      setTexMsg(err.message);
      setTexLog(err.log);
    } finally { setProbing(false); }
  };
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [armedReset, setArmedReset] = useState(false);

  useEffect(() => { if (desktop) void defaultPreamble().then(setDefPre).catch(() => {}); }, [desktop]);

  useEffect(() => { if (desktop) backupInfo().then(setBackup).catch(() => setBackup(null)); }, [desktop]);

  const today = new Date().toISOString().slice(0, 10);
  const pct = progress?.total ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100)) : null;

  const install = async (channel: Channel | 'previous') => {
    setInstallErr(null);
    setPhase('installing');
    setProgress({ downloaded: 0, total: null });
    try {
      await installUpdate(channel, setProgress);
      setPhase('restarting');
    } catch (e) {
      setPhase('idle');
      setInstallErr(friendlyError(e, 'install'));
    }
  };

  const findPrevious = async () => {
    setPrev({ state: 'checking' });
    try {
      const u = await checkUpdate('previous');
      setPrev(u ? { state: 'found', info: u } : { state: 'missing', msg: 'Chưa có bản trước để quay lại.' });
    } catch (e) {
      setPrev({ state: 'missing', msg: friendlyError(e, 'previous') });
    }
  };

  const busy = phase !== 'idle';

  return (
    <>
      <header className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1>Hệ thống</h1>
          <span className="crumbs">Cập nhật app, sao lưu và khôi phục dữ liệu</span>
        </div>
      </header>

      <div className="simple">
        {!desktop && (
          <div className="note warn">
            <IcAlert />
            <div className="note-body"><b>Đây là bản xem thử trên trình duyệt</b><span>Cập nhật tự động và sao lưu trước cập nhật chỉ hoạt động trong bản cài trên Windows. Các nút bên dưới đang tắt để bạn xem bố cục.</span></div>
          </div>
        )}

        <h2 className="sys-group">Cập nhật</h2>
        <section className="panel" aria-label="Phiên bản và cập nhật">
          <div className="sys-row">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h2>Phiên bản và cập nhật</h2>
              <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>
                Đang dùng <b className="mono" style={{ color: 'var(--ink)' }}>{up.info ? `v${up.info.version}` : 'bản xem thử'}</b>
                {up.channel === 'beta' && <span className="pill" style={{ background: 'var(--warn-bg)', color: 'var(--warn)', marginLeft: 8 }}>beta</span>}
              </span>
            </div>
            <div className="seg" role="group" aria-label="Kênh cập nhật">
              {(['stable', 'beta'] as Channel[]).map((c) => (
                <button key={c} type="button" aria-pressed={up.channel === c} disabled={!desktop || busy} onClick={() => up.setChannel(c)}>{CHANNEL_LABEL[c]}</button>
              ))}
            </div>
          </div>
          <span className="sys-hint">
            {up.channel === 'stable'
              ? 'Kênh chính thức chỉ nhận các bản đã được thử kỹ.'
              : 'Kênh thử nghiệm nhận bản mới sớm hơn để bạn dùng thử trước khi phát hành chính thức. Có thể còn lỗi nhỏ; dữ liệu luôn được sao lưu trước mỗi lần cập nhật.'}
          </span>

          {phase === 'idle' && !up.available && (
            <div className="head-actions" style={{ alignItems: 'center' }}>
              <button type="button" className="btn btn-dark" disabled={!desktop || up.checking} onClick={() => void up.check()}>{up.checking ? 'Đang kiểm tra…' : 'Kiểm tra cập nhật'}</button>
              {up.checkedAt && !up.checking && !up.error && <span className="okmark"><IcCheckCircle size={16} />Đang dùng bản mới nhất · kiểm tra lúc {when(up.checkedAt)}</span>}
            </div>
          )}
          {up.error && phase === 'idle' && <div className="note bad"><IcAlert /><div className="note-body"><b>Không kiểm tra được</b><span>{up.error}</span></div></div>}

          {up.available && phase === 'idle' && (
            <div className="note ok">
              <IcCheckCircle />
              <div className="note-body" style={{ flex: 1 }}>
                <b>Có bản mới: v{up.available.version}</b>
                {up.available.notes && <pre className="sys-notes">{up.available.notes}</pre>}
                <span>Dữ liệu được sao lưu tự động trước khi cập nhật. App sẽ tự khởi động lại.</span>
                <div className="head-actions" style={{ marginTop: 8 }}>
                  <button type="button" className="btn btn-accent" onClick={() => void install(up.channel)}>Cập nhật lên v{up.available.version}</button>
                  <button type="button" className="btn btn-ghost" onClick={() => void up.check()} disabled={up.checking}>Kiểm tra lại</button>
                </div>
              </div>
            </div>
          )}

          {phase !== 'idle' && (
            <div className="note ok" role="status" aria-live="polite">
              <IcCheckCircle />
              <div className="note-body" style={{ flex: 1 }}>
                <b>{phase === 'restarting' ? 'Đang cài đặt, app sắp khởi động lại…' : 'Đang tải bản cập nhật…'}</b>
                <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}><div style={{ width: `${phase === 'restarting' ? 100 : pct ?? 8}%` }} /></div>
                <span>{progress ? `${formatBytes(progress.downloaded)}${progress.total ? ` / ${formatBytes(progress.total)}` : ''}` : ''} Đừng tắt máy trong lúc này.</span>
              </div>
            </div>
          )}
          {installErr && <div className="note bad"><IcAlert /><div className="note-body"><b>Chưa cập nhật được</b><span>{installErr}</span></div></div>}

          <div className="divider" />
          <div className="sys-row">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <h2 style={{ fontSize: 14 }}>Quay lại phiên bản trước</h2>
              <span className="sys-hint">Dùng khi bản mới có lỗi. Lưu ý: từ v0.1.0-beta.15 dữ liệu đổi cấu trúc nên bản cũ hơn không mở được — khi đó khôi phục từ “Sao lưu trước cập nhật” bên dưới.</span>
            </div>
            {prev.state === 'none' && <button type="button" className="btn btn-sm" disabled={!desktop || busy} onClick={() => void findPrevious()}>Xem bản trước</button>}
            {prev.state === 'checking' && <span className="sys-hint">Đang tìm…</span>}
          </div>
          {prev.state === 'missing' && <span className="sys-hint" role="status">{prev.msg}</span>}
          {prev.state === 'found' && prev.info && (
            <div className="note warn">
              <IcAlert />
              <div className="note-body" style={{ flex: 1 }}>
                <b>Bản trước: v{prev.info.version}</b>
                <span>Bạn đang dùng v{prev.info.currentVersion}. Nếu bản cũ không đọc được dữ liệu mới, dùng mục “Sao lưu trước cập nhật” bên dưới để khôi phục dữ liệu.</span>
                <div className="head-actions" style={{ marginTop: 8 }}>
                  {confirmRollback ? (
                    <>
                      <button type="button" className="btn btn-accent btn-sm" disabled={busy} onClick={() => void install('previous')}>Xác nhận quay lại v{prev.info.version}</button>
                      <button type="button" className="btn btn-sm" onClick={() => setConfirmRollback(false)}>Huỷ</button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => setConfirmRollback(true)}>Quay lại v{prev.info.version}</button>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        <h2 className="sys-group">Dữ liệu và sao lưu</h2>
        <section className="panel" aria-label="Sao lưu trước cập nhật">
          <h2>Sao lưu trước cập nhật</h2>
          <span className="sys-hint">Trước mỗi lần cập nhật, app tự chép dữ liệu sang một bản sao lưu. Chỉ giữ đúng một bản gần nhất; bản cũ hơn bị xoá để không chiếm chỗ.</span>
          {backup ? (
            <div className="id-card" style={{ alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <b style={{ fontSize: 14 }}>{backup.kind === 'swapped' ? 'Dữ liệu trước lần khôi phục gần nhất' : `Trước khi lên v${backup.toVersion}`}</b>
                <small>Từ app v{backup.fromVersion} · {when(backup.at * 1000)} · {formatBytes(backup.bytes)}</small>
              </div>
            </div>
          ) : (
            <span className="sys-hint" role="status">{desktop ? 'Chưa có. Bản sao lưu sẽ xuất hiện sau lần cập nhật đầu tiên.' : 'Chỉ có trong bản cài trên Windows.'}</span>
          )}
          {backup && (
            <div className="head-actions">
              {confirmRestore ? (
                <>
                  <button type="button" className="btn btn-accent btn-sm" onClick={async () => { try { await restoreBackup(); } catch (e) { setRestoreErr(friendlyError(e, 'restore')); setConfirmRestore(false); } }}>Xác nhận khôi phục</button>
                  <button type="button" className="btn btn-sm" onClick={() => setConfirmRestore(false)}>Huỷ</button>
                </>
              ) : (
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirmRestore(true)}>Khôi phục dữ liệu về bản này</button>
              )}
            </div>
          )}
          {confirmRestore && <span className="sys-hint">Dữ liệu hiện tại sẽ trở thành bản sao lưu, nên nếu bấm nhầm bạn vẫn khôi phục lại được.</span>}
          {restoreErr && <div className="note bad"><IcAlert /><div className="note-body"><b>Không khôi phục được</b><span>{restoreErr}</span></div></div>}
        </section>

        <section className="panel" aria-label="Sao lưu thủ công">
          <h2>Sao lưu thủ công</h2>
          <span className="sys-hint">Ngân hàng hiện có <b style={{ color: 'var(--ink)' }}>{questions.length} câu</b>. Bản sao lưu là một file duy nhất, cất ở USB hoặc Google Drive là đủ.</span>
          <div className="head-actions">
            <button type="button" className="btn btn-dark btn-sm" onClick={async () => { if (!decisionsLoaded()) await loadDecisions(); showFile({ title: 'Bản sao lưu ngân hàng', name: `hedu-sao-luu-${today}.json`, text: exportBackup(), mime: 'application/json' }); }}>Tạo file sao lưu</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => file.current?.click()}>Khôi phục từ file…</button>
            <input ref={file} type="file" accept=".json" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try { setPendingFile({ name: f.name, text: await readFile(f) }); setFileErr(null); } catch (x) { setFileErr((x as Error).message); }
            }} />
          </div>
          {pendingFile && (
            <div className="note warn" role="alertdialog" aria-label="Xác nhận khôi phục từ file">
              <IcAlert />
              <div className="note-body">
                <b>Thay toàn bộ ngân hàng bằng file “{pendingFile.name}”?</b>
                <span>Ngân hàng hiện có {questions.length} câu sẽ bị thay bằng nội dung file. Nên bấm “Tạo file sao lưu” trước nếu chưa có bản sao lưu gần đây.</span>
                <div className="head-actions">
                  <button type="button" className="btn btn-sm" autoFocus onClick={() => setPendingFile(null)}>Giữ ngân hàng hiện tại</button>
                  <button type="button" className="btn btn-accent btn-sm" onClick={() => {
                    try { const n = importBackup(pendingFile.text); setFileErr(null); toast(`Đã khôi phục ${n} câu từ file.`); } catch (x) { setFileErr((x as Error).message); }
                    setPendingFile(null);
                  }}>Thay bằng file này</button>
                </div>
              </div>
            </div>
          )}
          {fileErr && <div className="note bad"><IcAlert /><div className="note-body"><b>Không khôi phục được</b><span>{fileErr}</span></div></div>}
          <span className="sys-hint">Khôi phục từ file sẽ thay toàn bộ ngân hàng hiện tại. Bản sao lưu gồm câu hỏi, khung chương trình, quyết định “giữ cả hai” của Kiểm tra trùng, thùng rác và nhãn chuẩn; khi khôi phục, phần quyết định/thùng rác được GỘP vào dữ liệu đang có (không xoá gì).</span>
        </section>

        <TrashPanel />

        <section className="panel" aria-label="Dữ liệu">
          <h2>Dữ liệu</h2>
          {desktop ? (
            <>
              <span className="sys-hint">Dữ liệu nằm ngoài thư mục cài đặt nên cập nhật hay cài lại app không làm mất.{up.info && <> Vị trí: <span className="mono" style={{ wordBreak: 'break-all' }}>{up.info.dataDir}</span></>}</span>
              <div className="head-actions">
                <button type="button" className="btn btn-sm" onClick={() => toast(`Đã thêm ${addSamples()} câu mẫu.`)}>Nạp 15 câu mẫu Toán 12</button>
              </div>
            </>
          ) : (
            <>
              <span className="sys-hint">Bản xem thử đi kèm 15 câu Toán 12 mẫu. Đưa ngân hàng về đúng bộ mẫu ban đầu (xoá câu bạn đã thêm).</span>
              <div className="head-actions">
                {armedReset ? (
                  <>
                    <button type="button" className="btn btn-accent btn-sm" onClick={() => { resetToSample(); setArmedReset(false); toast('Đã đưa về dữ liệu mẫu.'); }}>Xác nhận đặt lại</button>
                    <button type="button" className="btn btn-sm" onClick={() => setArmedReset(false)}>Huỷ</button>
                  </>
                ) : (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setArmedReset(true)}>Đặt lại dữ liệu mẫu</button>
                )}
              </div>
            </>
          )}
        </section>

        <h2 className="sys-group">Hiển thị</h2>
        <ZoomPanel />
        <FigScalePanel />

        <h2 className="sys-group">Vẽ hình TikZ</h2>
        <section className="panel" aria-label="Vẽ hình TikZ">
          <h2>Vẽ hình TikZ bằng TeX Live</h2>
          <span className="sys-hint">
            App gọi <span className="mono">{tikz.engine === 'pdflatex' ? 'latex' : tikz.engine}</span> rồi <span className="mono">dvisvgm</span> trên máy bạn để dịch mỗi hình thành ảnh SVG.
            Hình đã dịch được nhớ lại nên lần sau hiện ngay. Cần TeX Live (hoặc MiKTeX) đã cài và nằm trong PATH.
          </span>
          <div className="head-actions">
            <button type="button" className="btn btn-dark btn-sm" disabled={!desktop || probing} onClick={() => void checkTeX()}>
              {probing ? 'Đang thử dịch một hình…' : 'Kiểm tra TeX Live'}
            </button>
            <button type="button" className="btn btn-outline btn-sm" disabled={!desktop} onClick={() => void autoFind()}>Tìm TeX Live tự động</button>
            <button type="button" className="btn btn-outline btn-sm" disabled={!desktop} onClick={() => void clearTikzCache().then((n) => toast(`Đã xoá ${n} hình đã dịch. Hình sẽ được dịch lại khi cần.`))}>Xoá hình đã dịch</button>
          </div>
          {texMsg && <div className={`note ${texOk ? 'ok' : 'bad'}`}>{texOk ? <IcCheckCircle /> : <IcAlert />}<div className="note-body"><b>{texOk ? 'TeX Live chạy được' : 'Chưa dịch được hình'}</b><span>{texMsg}</span>{texLog && <code className="fig-log">{texLog}</code>}</div></div>}
          <label className="lbl">Thư mục bin của TeX Live <small style={{ fontWeight: 400, color: 'var(--ink-3)' }}>(để trống nếu đã có trong PATH)</small>
            <input className="inp" type="text" spellCheck={false} placeholder="D:\\texlive\\texlive\\2026\\bin\\windows" value={tikz.texBin} onChange={(e) => saveTikz({ ...tikz, texBin: e.target.value })} />
          </label>
          <div className="sys-row">
            <label className="sw"><input type="checkbox" checked={tikz.auto} onChange={(e) => saveTikz({ ...tikz, auto: e.target.checked })} />Tự vẽ hình khi mở câu hỏi</label>
            <label className="lbl" style={{ maxWidth: 460 }}>Bộ dịch
              <select className="sel" value={tikz.engine} onChange={(e) => saveTikz({ ...tikz, engine: e.target.value as TikzSettings['engine'] })}>
                <option value="pdflatex">pdfLaTeX — qua DVI, không cần Ghostscript (khuyên dùng)</option>
                <option value="lualatex">lualatex (qua PDF, dvisvgm cần Ghostscript &lt; 10.01 hoặc mutool)</option>
                <option value="xelatex">xelatex (qua PDF, như trên)</option>
              </select>
            </label>
            <label className="lbl" style={{ maxWidth: 160 }}>Giới hạn (giây)
              <input className="num" type="number" min={5} max={180} value={tikz.timeoutSecs} onChange={(e) => saveTikz({ ...tikz, timeoutSecs: Number(e.target.value) || 40 })} />
            </label>
          </div>
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--ink-2)' }}>Đầu file khi dịch hình (chỉ sửa khi thiếu gói)</summary>
            <textarea style={{ marginTop: 8, minHeight: 150 }} spellCheck={false} value={tikz.preamble} placeholder={defPre} onChange={(e) => saveTikz({ ...tikz, preamble: e.target.value })} aria-label="Đầu file LaTeX" />
            <div className="head-actions">
              <button type="button" className="btn btn-sm" onClick={() => saveTikz({ ...tikz, preamble: '' })}>Dùng lại mặc định</button>
              <button type="button" className="btn btn-sm" onClick={() => saveTikz({ ...tikz, preamble: defPre })}>Chép mặc định ra để sửa</button>
            </div>
          </details>
        </section>
      </div>
    </>
  );
}


function TrashPanel() {
  const { toast } = useApp();
  useDecisions();
  const [ask, setAsk] = useState<string | null>(null);
  useEffect(() => { if (!decisionsLoaded()) void loadDecisions(); }, []);
  const items = trashList();
  return (
    <section className="panel" aria-label="Thùng rác">
      <h2>Thùng rác ({items.length} câu)</h2>
      <span className="sys-hint">Câu bị xoá ở Ngân hàng hoặc Kiểm tra trùng nằm ở đây, còn nguyên mã LaTeX, để khôi phục khi cần. Khôi phục giữ số thứ tự cũ nếu số đó chưa có câu khác dùng. Thùng rác lưu tối đa 1.000 câu gần nhất.</span>
      {items.length === 0 && <span className="sys-hint">Thùng rác trống.</span>}
      <ul className="trash-list">
        {items.slice(0, 50).map(({ q, at }) => (
          <li key={q.uid}>
            <span className="mono">{seqLabel(q.seq)}</span>
            <span className="trash-t">{plainSnippet(parseExTest(q.latex).stem) || '(câu chưa có đề bài)'}</span>
            <span className="muted sm">{new Date(at).toLocaleDateString('vi-VN')}</span>
            <button type="button" className="btn btn-sm" onClick={async () => {
              if (!restoreQuestion(q)) { toast('Câu này đã có trong ngân hàng, không khôi phục thêm.'); }
              else toast(`Đã khôi phục câu ${seqLabel(q.seq)}.`);
              if (!(await trashRemove(q.uid))) toast('Đã khôi phục nhưng chưa xoá được khỏi thùng rác (không ghi được tệp).');
            }}>Khôi phục</button>
            {ask === q.uid
              ? <><button type="button" className="btn btn-sm btn-accent" onClick={async () => { setAsk(null); if (!(await trashRemove(q.uid))) toast('Chưa ghi được tệp, câu vẫn nằm trong thùng rác.'); }}>Xoá hẳn</button><button type="button" className="btn btn-sm" autoFocus onClick={() => setAsk(null)}>Giữ lại</button></>
              : <button type="button" className="btn btn-sm btn-outline" onClick={() => setAsk(q.uid)}>Xoá hẳn…</button>}
          </li>
        ))}
      </ul>
      {items.length > 50 && <span className="sys-hint">Đang hiện 50 câu gần nhất trong {items.length}.</span>}
    </section>
  );
}
