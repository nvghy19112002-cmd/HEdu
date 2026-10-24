// Màn hình Hệ thống: phiên bản, cập nhật (kênh chính thức / beta), quay lại bản trước,
// sao lưu tự động trước cập nhật, sao lưu thủ công, dữ liệu mẫu.
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { IcAlert, IcCheckCircle } from '../components/Icons';
import { isDesktop } from '../lib/platform';
import { clearTikzCache, defaultPreamble, findTeX, getSettings as getTikz, probeTeX, setSettings as setTikz, type TikzSettings } from '../lib/tikz';
import { asTikzErr } from '../lib/tikz';
import { addSamples, exportBackup, importBackup, resetToSample, useBank } from '../lib/store';
import { decisionsLoaded, loadDecisions, trashCount, useDecisions } from '../lib/dupdecisions';
import {
  backupInfo, checkUpdate, CHANNEL_LABEL, formatBytes, friendlyError, installUpdate, restoreBackup,
  type BackupMeta, type Channel, type Progress, type UpdateInfo,
} from '../lib/updates';
import { FigScalePanel, ZoomPanel } from '../components/ZoomControl';
import { AiSettingsPanel } from '../components/AiSettingsPanel';
import { aiKeyStatus } from '../lib/ai/client';
import { initProfiles } from '../lib/ai/profiles';
import { loadAiPrefs } from '../lib/ai/prefs';
import { PANES, paneLabel, searchSettings, type PaneId } from '../lib/settingsnav';
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
  const { toast, showFile, go } = useApp();
  useDecisions();
  const trashN = trashCount();
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

  // ---- khung danh mục (PR-5): chỉ đổi cách SẮP XẾP; mọi trạng thái/giá trị cài đặt ở trên giữ nguyên khi chuyển mục
  const [pane, setPane] = useState<PaneId>('overview');
  const [q, setQ] = useState('');
  /** số cấu hình AI đã có khoá / đang dùng (null = chưa rõ) */
  const [aiInfo, setAiInfo] = useState<{ saved: number; total: number; active: string | null } | null>(null);
  const found = searchSettings(q);
  const jump = useRef<string | null>(null);
  useEffect(() => {
    if (!desktop) return;
    void initProfiles().then(async (st) => {
      let saved = 0;
      for (const p of st.profiles) if ((await aiKeyStatus(p.id).catch(() => ({ hasKey: false }))).hasKey) saved++;
      setAiInfo({ saved, total: st.profiles.length, active: st.profiles.find((p) => p.id === st.active)?.name ?? null });
    }).catch(() => setAiInfo(null));
  }, [desktop, pane]);
  const aiText = aiInfo === null ? 'Chưa rõ trạng thái khoá.' : aiInfo.total === 0 ? 'Chưa có cấu hình khoá API.' : `Đã lưu ${aiInfo.saved}/${aiInfo.total} khoá · ${aiInfo.active ? `đang dùng “${aiInfo.active}”` : 'chưa chọn cấu hình đang dùng'}`;
  useEffect(() => {
    const t = jump.current;
    if (!t) return;
    jump.current = null;
    const el = [...document.querySelectorAll<HTMLElement>('section[aria-label]')].find((e) => e.getAttribute('aria-label') === t);
    if (el) { el.scrollIntoView({ block: 'start' }); const f = el.querySelector<HTMLElement>('button, input, select, textarea, summary'); f?.focus({ preventScroll: true }); }
  }, [pane]);
  const open = (id: PaneId, target = '') => { jump.current = target || null; setPane(id); setQ(''); };
  const aiPrefs = loadAiPrefs();
  const diag = () => [
    `HEdu ${up.info ? `v${up.info.version}` : 'bản xem thử trên trình duyệt'} (kênh ${up.channel})`,
    `Hệ điều hành: ${typeof navigator !== 'undefined' ? navigator.platform || 'không rõ' : 'không rõ'}`,
    `Chạy trong: ${desktop ? 'app Windows' : 'trình duyệt'}`,
    `TeX Live: ${tikz.texBin.trim() ? 'đã đặt đường dẫn' : 'chưa đặt đường dẫn'}; kiểm tra trong phiên này: ${texMsg === null ? 'chưa' : texOk ? 'đạt' : 'không đạt'}`,
    `AI Gemini: ${aiText}; đồng ý gửi: ${aiPrefs.consent ? 'bật' : 'tắt'}`,
    `Số câu trong ngân hàng: ${questions.length}; trong Thùng rác: ${trashN}`,
  ].join('\n');
  const copyDiag = async () => {
    try { await navigator.clipboard.writeText(diag()); toast('Đã sao chép thông tin chẩn đoán (không có khoá API, câu hỏi hay đường dẫn riêng).'); }
    catch { toast('Không sao chép được tự động.'); }
  };
  const is = (id: PaneId) => pane === id;

  return (
    <>
      <header className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1>Cài đặt</h1>
          <span className="crumbs">{paneLabel(pane)} — mọi lựa chọn được giữ khi bạn chuyển mục</span>
        </div>
      </header>

      <div className="set-shell">
        <nav className="set-nav" aria-label="Các mục Cài đặt">
          <label className="search sm set-search">
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm cài đặt: TeX Live, API, sao lưu…" aria-label="Tìm cài đặt" />
          </label>
          {q.trim() ? (
            <ul className="set-results" aria-label="Kết quả tìm cài đặt">
              {found.length === 0 && <li className="sys-hint">Không có cài đặt nào khớp.</li>}
              {found.map((e, i) => <li key={i}><button type="button" onClick={() => open(e.pane, e.target)}><b>{e.label}</b><small>{paneLabel(e.pane)}</small></button></li>)}
            </ul>
          ) : (
            <ul className="set-list">
              {PANES.map((p) => <li key={p.id}><button type="button" className={is(p.id) ? 'is-on' : undefined} aria-current={is(p.id) ? 'page' : undefined} onClick={() => open(p.id)}>{p.label}</button></li>)}
            </ul>
          )}
        </nav>
      <div className="simple set-body">
        {!desktop && (
          <div className="note warn">
            <IcAlert />
            <div className="note-body"><b>Đây là bản xem thử trên trình duyệt</b><span>Cập nhật tự động và sao lưu trước cập nhật chỉ hoạt động trong bản cài trên Windows. Các nút bên dưới đang tắt để bạn xem bố cục.</span></div>
          </div>
        )}

        {is('overview') && (
          <div className="set-cards">
            <section className="panel" aria-label="Phiên bản HEdu">
              <h2>Phiên bản HEdu</h2>
              <span className="sys-hint"><b className="mono">{up.info ? `v${up.info.version}` : 'bản xem thử'}</b> · kênh {up.channel === 'beta' ? 'beta' : up.channel === 'stable' ? 'chính thức' : up.channel}{up.checkedAt ? ` · kiểm tra lúc ${when(up.checkedAt)}` : ' · chưa kiểm tra bản mới trong phiên này'}</span>
              <div className="head-actions"><button type="button" className="btn btn-sm" onClick={() => open('updates', 'Phiên bản và cập nhật')}>Đi tới Cập nhật</button></div>
            </section>
            <section className="panel" aria-label="Ngân hàng đang dùng">
              <h2>Ngân hàng đang dùng</h2>
              <span className="sys-hint"><b>{questions.length.toLocaleString('vi-VN')}</b> câu · {up.info?.dataDir ? <span className="mono" style={{ wordBreak: 'break-all' }}>{up.info.dataDir}</span> : 'lưu trong trình duyệt (bản xem thử)'}</span>
              <div className="head-actions"><button type="button" className="btn btn-sm" onClick={() => open('source', 'Nguồn dữ liệu')}>Xem nguồn dữ liệu</button></div>
            </section>
            <section className="panel" aria-label="TeX Live">
              <h2>TeX Live</h2>
              <span className="sys-hint">{tikz.texBin.trim() ? <>Đường dẫn: <span className="mono" style={{ wordBreak: 'break-all' }}>{tikz.texBin}</span></> : 'Chưa đặt đường dẫn (dùng TeX Live trong PATH nếu có).'} · {texMsg === null ? 'Chưa kiểm tra trong phiên này' : texOk ? 'Đã thử: sẵn sàng' : 'Lần thử gần nhất: chưa đạt'}</span>
              <div className="head-actions"><button type="button" className="btn btn-sm" onClick={() => open('latex', 'Vẽ hình TikZ')}>Mở LaTeX & TikZ</button></div>
            </section>
            <section className="panel" aria-label="AI Gemini (tóm tắt)">
              <h2>AI Gemini</h2>
              <span className="sys-hint">{!desktop ? 'Chỉ dùng được trong bản cài trên Windows.' : aiText} · gửi câu hỏi lên AI: {aiPrefs.consent ? 'đã đồng ý (mỗi lượt vẫn hỏi lại)' : 'đang tắt'}</span>
              <div className="head-actions"><button type="button" className="btn btn-sm" onClick={() => open('ai', 'AI (Gemini)')}>Mở AI Gemini</button></div>
            </section>
            <section className="panel" aria-label="Sao lưu (tóm tắt)">
              <h2>Sao lưu</h2>
              <span className="sys-hint">{!desktop ? 'Sao lưu trước cập nhật chỉ có trong bản cài trên Windows.' : backup ? `Bản trước cập nhật: ${backup.kind === 'swapped' ? 'dữ liệu trước lần khôi phục gần nhất' : `trước khi lên v${backup.toVersion}`} · ${when(backup.at * 1000)}` : 'Chưa có bản sao lưu trước cập nhật.'}</span>
              <div className="head-actions"><button type="button" className="btn btn-sm" onClick={() => open('backup', 'Sao lưu thủ công')}>Tạo / khôi phục file sao lưu</button></div>
            </section>
            <section className="panel" aria-label="Thùng rác (tóm tắt)">
              <h2>Thùng rác</h2>
              <span className="sys-hint">{trashN.toLocaleString('vi-VN')} câu đang được giữ lại.</span>
              <div className="head-actions"><button type="button" className="btn btn-sm" onClick={() => go({ screen: 'trash' })}>Mở Thùng rác ({trashN} câu)</button></div>
            </section>
          </div>
        )}

        {is('source') && (
          <section className="panel" aria-label="Nguồn dữ liệu">
            <h2>Nguồn dữ liệu</h2>
            <span className="sys-hint"><b>Đang dùng:</b> ngân hàng HEdu cục bộ (tệp JSON + tệp phụ cho quyết định trùng, Thùng rác, bộ nhãn). {questions.length.toLocaleString('vi-VN')} câu.</span>
            <span className="sys-hint"><b>Nơi lưu:</b> {up.info?.dataDir ? <span className="mono" style={{ wordBreak: 'break-all' }}>{up.info.dataDir}</span> : 'trình duyệt này (bản xem thử, không phải dữ liệu thật)'}</span>
            <span className="sys-hint">Sao lưu và khôi phục từ file nằm ở mục Dữ liệu & sao lưu.</span>
            <div className="head-actions"><button type="button" className="btn btn-sm" onClick={() => open('backup')}>Đi tới Dữ liệu & sao lưu</button></div>
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--ink-2)' }}>Nhiều nguồn dữ liệu (dự kiến)</summary>
              <span className="sys-hint">HEdu hiện chỉ làm việc với một ngân hàng cục bộ. Quản lý nhiều nguồn là tính năng khác, chưa có trong bản này nên không có nút thao tác.</span>
            </details>
          </section>
        )}

        {is('updates') && (<>
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

        </>)}

        {is('backup') && (<>
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
                <span>Ngân hàng hiện có {questions.length} câu sẽ bị thay bằng nội dung file. Phần quyết định “giữ cả hai”, Thùng rác và nhãn chuẩn trong file sẽ được GỘP vào dữ liệu đang có, không xoá gì. Nên bấm “Tạo file sao lưu” trước nếu chưa có bản sao lưu gần đây.</span>
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

        <section className="panel" aria-label="Thùng rác">
          <h2>Thùng rác</h2>
          <span className="sys-hint">Câu đã xoá nằm trong Thùng rác cho tới khi bạn chủ động xoá hẳn. Xem, tìm, khôi phục và xoá hẳn ở màn riêng.</span>
          <div className="head-actions">
            <button type="button" className="btn btn-sm" onClick={() => go({ screen: 'trash' })}>Mở Thùng rác ({trashN} câu)</button>
          </div>
        </section>

        </>)}

        {is('source') && (
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

        )}

        {is('ai') && <AiSettingsPanel toast={toast} />}

        {is('display') && (<>
          <ZoomPanel />
          <FigScalePanel />
        </>)}

        {is('latex') && (
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
        )}

        {is('help') && (
          <>
            <section className="panel" aria-label="Giới thiệu">
              <h2>Giới thiệu</h2>
              <span className="sys-hint">HEdu {up.info ? <b className="mono">v{up.info.version}</b> : '(bản xem thử)'} — ngân hàng câu hỏi LaTeX cho giáo viên Toán. Dữ liệu lưu trên máy bạn.</span>
              <span className="sys-hint">Trang chính thức và ghi chú phát hành: <span className="mono">github.com/nvghy19112002-cmd/HEdu</span> (mục Releases).</span>
            </section>
            <section className="panel" aria-label="Hướng dẫn ngắn">
              <h2>Hướng dẫn ngắn</h2>
              <ul className="set-help">
                <li><b>Tìm câu đã xoá:</b> mở Thùng rác ở thanh bên; gõ chữ, số # hoặc ID vào ô tìm.</li>
                <li><b>Khôi phục:</b> bấm Khôi phục ở câu cần lấy lại; câu nào đã có trong Ngân hàng hoặc mất vị trí sẽ được giữ lại và báo lý do.</li>
                <li><b>Xem chuẩn bằng TeX Live:</b> trong khung xem câu chọn tab Xem chuẩn rồi bấm Biên dịch (cần cài TeX Live, xem mục LaTeX & TikZ).</li>
                <li><b>Thiết lập Gemini:</b> mục AI Gemini; dán khoá API của bạn, mỗi lượt gửi câu lên AI đều hỏi lại.</li>
                <li><b>Sao lưu:</b> mục Dữ liệu & sao lưu; nên tạo file sao lưu trước khi xoá hẳn hoặc cập nhật.</li>
              </ul>
            </section>
            <section className="panel" aria-label="Thông tin chẩn đoán">
              <h2>Thông tin chẩn đoán</h2>
              <span className="sys-hint">Khi cần hỗ trợ, sao chép đoạn này gửi đi. Chỉ gồm phiên bản, hệ điều hành, trạng thái cấu hình và số lượng — không có khoá API, nội dung câu hỏi hay đường dẫn riêng.</span>
              <pre className="tr-pre" tabIndex={0} aria-label="Thông tin chẩn đoán">{diag()}</pre>
              <div className="head-actions"><button type="button" className="btn btn-sm" onClick={() => { void copyDiag(); }}>Sao chép thông tin chẩn đoán</button></div>
            </section>
          </>
        )}
      </div>
      </div>
    </>
  );
}
