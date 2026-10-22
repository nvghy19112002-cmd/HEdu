// Màn hình Hệ thống: phiên bản, cập nhật (kênh chính thức / beta), quay lại bản trước,
// sao lưu tự động trước cập nhật, sao lưu thủ công, dữ liệu mẫu.
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { IcAlert, IcCheckCircle } from '../components/Icons';
import { isDesktop } from '../lib/platform';
import { addSamples, exportBackup, importBackup, resetToSample, useBank } from '../lib/store';
import {
  backupInfo, checkUpdate, CHANNEL_LABEL, formatBytes, friendlyError, installUpdate, restoreBackup,
  type BackupMeta, type Channel, type Progress, type UpdateInfo,
} from '../lib/updates';
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
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [armedReset, setArmedReset] = useState(false);

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
              <span className="sys-hint">Dùng khi bản mới có lỗi. Dữ liệu hiện tại được giữ nguyên.</span>
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
            <button type="button" className="btn btn-dark btn-sm" onClick={() => showFile({ title: 'Bản sao lưu ngân hàng', name: `hedu-sao-luu-${today}.json`, text: exportBackup(), mime: 'application/json' })}>Tạo file sao lưu</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => file.current?.click()}>Khôi phục từ file…</button>
            <input ref={file} type="file" accept=".json" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try { const n = importBackup(await readFile(f)); setFileErr(null); toast(`Đã khôi phục ${n} câu từ file.`); } catch (x) { setFileErr((x as Error).message); }
            }} />
          </div>
          {fileErr && <div className="note bad"><IcAlert /><div className="note-body"><b>Không khôi phục được</b><span>{fileErr}</span></div></div>}
          <span className="sys-hint">Khôi phục từ file sẽ thay toàn bộ ngân hàng hiện tại.</span>
        </section>

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
      </div>
    </>
  );
}
