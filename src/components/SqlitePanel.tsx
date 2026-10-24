// Mục "Lưu trữ SQLite" (Cài đặt → Dữ liệu & sao lưu): bản chụp .db, điểm khôi phục, khôi phục, xuất ra JSON, kiểm tra toàn vẹn.
import { useEffect, useState } from 'react';
import { useApp } from '../app-context';
import { checkIntegrity, exportJsonTo, inspectSource, listRestorePoints, REASON_LABEL, restoreFrom, snapshotTo, type InspectResult, type Integrity, type RestorePoint, type Source } from '../lib/dbbackup';
import { formatBytes } from '../lib/updates';
import { useBank } from '../lib/store';
import { ConfirmDialog } from './ConfirmDialog';

const nf = new Intl.NumberFormat('vi-VN');
const when = (s: number) => new Date(s * 1000).toLocaleString('vi-VN');

export function SqlitePanel() {
  const { toast } = useApp();
  const { questions } = useBank();
  const [points, setPoints] = useState<RestorePoint[]>([]);
  const [busy, setBusy] = useState(false);
  const [integ, setInteg] = useState<Integrity | null>(null);
  const [ask, setAsk] = useState<{ src: Source; label: string; info: InspectResult } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const dlg = typeof window !== 'undefined' ? window.__TAURI__?.dialog : undefined;

  const refresh = () => { listRestorePoints().then(setPoints).catch(() => setPoints([])); };
  useEffect(refresh, []);

  const guard = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setErr(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const verify = () => guard(async () => { setInteg(await checkIntegrity()); });
  const snapshot = () => guard(async () => {
    if (!dlg) throw new Error('Hộp Lưu thành chỉ có trong bản cài trên Windows.');
    const stamp = new Date().toISOString().slice(0, 10);
    const path = await dlg.save({ title: 'Lưu bản chụp ngân hàng', defaultPath: `hedu-${stamp}.db`, filters: [{ name: 'Bản chụp HEdu (.db)', extensions: ['db'] }] });
    if (!path) return;
    const r = await snapshotTo(path);
    toast(`Đã lưu bản chụp ${nf.format(r.questions)} câu (${formatBytes(r.bytes)}) và kiểm tra lại: nguyên vẹn.`);
  });
  const preview = (src: Source, label: string) => guard(async () => {
    const info = await inspectSource(src);
    if (info.damaged) throw new Error(`Tệp này bị hỏng nên không khôi phục được: ${info.messages.join('; ')}`);
    setAsk({ src, label, info });
  });
  const pickFile = () => guard(async () => {
    if (!dlg?.open) throw new Error('Hộp chọn tệp chỉ có trong bản cài trên Windows.');
    const p = await dlg.open({ title: 'Chọn bản chụp .db để khôi phục', multiple: false, directory: false });
    const path = Array.isArray(p) ? p[0] : p;
    if (!path) return;
    const info = await inspectSource({ path });
    if (info.damaged) throw new Error(`Tệp này bị hỏng nên không khôi phục được: ${info.messages.join('; ')}`);
    setAsk({ src: { path }, label: 'tệp bạn chọn', info });
  });
  const doRestore = () => guard(async () => { const a = ask; setAsk(null); if (a) await restoreFrom(a.src); });
  const exportJson = () => guard(async () => {
    if (!dlg?.open) throw new Error('Hộp chọn thư mục chỉ có trong bản cài trên Windows.');
    const d = await dlg.open({ title: 'Chọn (hoặc tạo) thư mục để xuất hedu.json', directory: true, multiple: false });
    const dir = Array.isArray(d) ? d[0] : d;
    if (!dir) return;
    const r = await exportJsonTo(dir);
    toast(`Đã xuất ${nf.format(r.questions)} câu ra ${r.jsonPath} và đối chiếu khớp.`);
  });

  return (
    <section className="panel" aria-label="Lưu trữ SQLite">
      <h2>Lưu trữ SQLite</h2>
      <span className="sys-hint">Ngân hàng đang lưu bằng SQLite: <b>{nf.format(questions.length)}</b> câu. Mỗi lần lưu chỉ ghi phần thay đổi; mất điện giữa chừng không làm hỏng dữ liệu. Trước khi nhập/xoá hàng loạt (từ 20 câu), xoá hẳn khỏi Thùng rác hoặc khôi phục từ file, HEdu tự chụp một <b>điểm khôi phục</b> (giữ 5 bản mới nhất).</span>
      <div className="head-actions">
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { void verify(); }}>Kiểm tra toàn vẹn</button>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { void snapshot(); }}>Lưu bản chụp .db…</button>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { void pickFile(); }}>Khôi phục từ bản chụp .db…</button>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { void exportJson(); }}>Xuất ra JSON…</button>
      </div>
      {integ && (
        <span className={`chk-pill ${integ.damaged ? 'bad' : integ.ok ? 'ok' : 'warn'}`} role="status">
          {integ.damaged ? `Phát hiện lỗi: ${integ.messages.join('; ')}` : `Toàn vẹn tốt: ${nf.format(integ.questions)} câu, cấu trúc tệp và từng câu đều đọc được.${integ.duplicateSeq ? ` Lưu ý: ${integ.duplicateSeq} câu có số thứ tự trùng nhau.` : ''}`}
        </span>
      )}
      {err && <div className="note bad" role="alert"><div className="note-body"><b>Chưa làm được</b><span>{err}</span></div></div>}

      <h3 style={{ fontSize: 13, margin: '6px 0 0' }}>Điểm khôi phục ({points.length}/5)</h3>
      {points.length === 0 ? <span className="sys-hint">Chưa có điểm khôi phục nào. Điểm được tạo tự động trước các thao tác dễ mất dữ liệu.</span> : (
        <ul className="ai-prof" aria-label="Các điểm khôi phục">
          {points.map((p) => (
            <li key={p.file}>
              <span><b>{when(p.at)}</b> · {REASON_LABEL[p.reason] ?? p.reason} · {nf.format(p.questions)} câu · {formatBytes(p.bytes)}</span>
              <span className="ai-prof-acts"><button type="button" className="btn btn-sm" disabled={busy} onClick={() => { void preview({ point: p.file }, `điểm khôi phục lúc ${when(p.at)}`); }}>Khôi phục điểm này…</button></span>
            </li>
          ))}
        </ul>
      )}
      <span className="sys-hint">“Xuất ra JSON” tạo <span className="mono">hedu.json</span> (cấu trúc cũ) trong thư mục bạn chọn — dùng khi cần quay về bản HEdu cũ. HEdu không ghi đè tệp có sẵn và đối chiếu lại sau khi xuất.</span>

      {ask && (
        <ConfirmDialog
          title={`Khôi phục từ ${ask.label}?`}
          confirmLabel={`Khôi phục ${nf.format(ask.info.questions)} câu`}
          cancelLabel="Giữ dữ liệu hiện tại"
          busy={busy}
          onConfirm={() => { void doRestore(); }}
          onCancel={() => setAsk(null)}
        >
          <p>Ngân hàng hiện có <b>{nf.format(questions.length)}</b> câu → bản này có <b>{nf.format(ask.info.questions)}</b> câu. Cả ngân hàng, Thùng rác, quyết định trùng và nhãn chuẩn sẽ được thay bằng nội dung của bản này.</p>
          <p className="sys-hint">HEdu tự chụp một điểm khôi phục “trước khi khôi phục” của dữ liệu hiện tại, nên bấm nhầm vẫn quay lại được. Sau khi khôi phục, HEdu tải lại giao diện.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
