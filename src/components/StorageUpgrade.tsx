// Màn "Nâng cấp lưu trữ" lúc khởi động: còn dữ liệu JSON cũ mà chưa có SQLite. HEdu KHÔNG tự chuyển; chỉ chuyển khi người dùng bấm xác nhận.
// Tệp cũ không bị sửa hay xoá; Rust chụp nguyên trạng, dựng tệp tạm, đối chiếu từng câu rồi mới đổi tên (src-tauri/src/jsonmig.rs).
import { useEffect, useRef, useState } from 'react';
import { IcAlert } from './Icons';
import { keepLegacyJson, storageMigrate, storagePreflight, type UpgradePreflight, type UpgradeResult } from '../lib/storage';

const nf = new Intl.NumberFormat('vi-VN');
type Phase = 'checking' | 'ready' | 'migrating' | 'done' | 'error';

export function StorageUpgrade({ onDone }: { onDone(): void }) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [pre, setPre] = useState<UpgradePreflight | null>(null);
  const [res, setRes] = useState<UpgradeResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const busy = useRef(false);
  const later = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    storagePreflight().then((p) => { if (live) { setPre(p); setPhase('ready'); } }).catch((e) => { if (live) { setErr(String(e instanceof Error ? e.message : e)); setPhase('error'); } });
    return () => { live = false; };
  }, []);
  useEffect(() => { if (phase === 'ready') later.current?.focus(); }, [phase]);

  const upgrade = async () => {
    if (busy.current) return;
    busy.current = true;
    setErr(null);
    setPhase('migrating');
    try { setRes(await storageMigrate()); setPhase('done'); }
    catch (e) { setErr(String(e instanceof Error ? e.message : e)); setPhase('error'); }
    busy.current = false;
  };
  const useOld = () => { keepLegacyJson(); onDone(); };

  return (
    <div className="boot-gate">
      <section className="panel" style={{ maxWidth: 680 }} aria-label="Nâng cấp lưu trữ" aria-live="polite">
        <h1 style={{ fontSize: 20 }}>Nâng cấp cách lưu ngân hàng câu hỏi</h1>
        {phase === 'checking' && <p className="aid-wait" role="status">Đang kiểm tra dữ liệu hiện có…</p>}

        {(phase === 'ready' || phase === 'migrating') && pre && (
          <>
            <p>HEdu sẽ chuyển ngân hàng của thầy/cô từ tệp cũ (<span className="mono">hedu.json</span>) sang cơ sở dữ liệu <b>SQLite</b>: lưu nhanh hơn rất nhiều và an toàn hơn khi có hàng chục nghìn câu.</p>
            <ul className="set-help">
              <li><b>{nf.format(pre.questions)}</b> câu hỏi · Thùng rác <b>{nf.format(pre.trash)}</b> · quyết định “không trùng/giữ cả hai” <b>{nf.format(pre.decisions)}</b> · nhãn chuẩn <b>{nf.format(pre.gold)}</b>.</li>
              <li>Tệp cũ <b>không bị xoá hay sửa</b>. HEdu còn chụp một bản nguyên trạng vào thư mục <span className="mono">backups</span> trước khi chuyển.</li>
              <li>HEdu đối chiếu <b>từng câu, từng ký tự</b>; chỉ khi khớp hoàn toàn mới dùng dữ liệu mới. Có lỗi gì thì giữ nguyên dữ liệu cũ.</li>
              <li>Sau khi nâng cấp, bản HEdu cũ (beta.29 trở về trước) sẽ không thấy các thay đổi mới. Nút “Xuất ra JSON” để quay về bản cũ đang được hoàn thiện; dữ liệu cũ vẫn còn trong thư mục <span className="mono">data</span> và <span className="mono">backups</span>.</li>
            </ul>
            {pre.warnings.map((w) => <div key={w} className="note warn"><IcAlert /><div className="note-body"><span>{w}</span></div></div>)}
            <div className="head-actions">
              <button type="button" className="btn btn-accent" disabled={phase === 'migrating'} onClick={() => { void upgrade(); }}>{phase === 'migrating' ? 'Đang chuyển và đối chiếu…' : 'Nâng cấp ngay'}</button>
              <button ref={later} type="button" className="btn" disabled={phase === 'migrating'} onClick={useOld}>Để sau (lần này vẫn dùng cách cũ)</button>
            </div>
            {phase === 'migrating' && <p className="sys-hint" role="status">Có thể mất vài giây tới vài chục giây. Xin đừng tắt HEdu.</p>}
          </>
        )}

        {phase === 'done' && res && (
          <>
            <p role="status">Đã nâng cấp xong: <b>{nf.format(res.questions)}</b> câu đã được chuyển và đối chiếu khớp hoàn toàn (mất {(res.millis / 1000).toFixed(1)} giây).</p>
            <p className="sys-hint">Bản chụp nguyên trạng dữ liệu cũ: <span className="mono" style={{ wordBreak: 'break-all' }}>{res.backupDir}</span></p>
            {res.warnings.map((w) => <div key={w} className="note warn"><IcAlert /><div className="note-body"><span>{w}</span></div></div>)}
            <div className="head-actions"><button type="button" className="btn btn-accent" autoFocus onClick={onDone}>Tiếp tục vào HEdu</button></div>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="note bad" role="alert"><IcAlert /><div className="note-body"><b>Chưa nâng cấp được — dữ liệu cũ vẫn nguyên vẹn</b><span>{err}</span></div></div>
            <div className="head-actions">
              <button type="button" className="btn btn-accent" onClick={() => { void upgrade(); }}>Thử lại</button>
              <button type="button" className="btn" onClick={useOld}>Dùng cách cũ trong lần mở này</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
