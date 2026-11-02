import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { chooseKhoFile, kichThuocText, khoNap, khoTrangThai, onKhoTienDo, type KhoNapKetQua, type KhoTrangThai } from '../lib/khohinh';
import { isDesktop } from '../lib/platform';

const nf = new Intl.NumberFormat('vi-VN');
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Cài đặt → Dữ liệu & sao lưu → Kho hình TikZ: nạp kho hình từ tệp MathHub (.db) vào kho riêng của HEdu, xem số liệu. */
export function KhoHinhPanel() {
  const { toast } = useApp();
  const [st, setSt] = useState<KhoTrangThai | null>(null);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<{ da: number; tong: number } | null>(null);
  const [out, setOut] = useState<KhoNapKetQua | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const busyRef = useRef(false);
  const reload = useCallback(() => { khoTrangThai().then(setSt).catch((e) => setErr(msg(e))); }, []);
  useEffect(() => { if (isDesktop()) reload(); }, [reload]);

  const nap = async () => {
    if (busyRef.current) return;
    const path = await chooseKhoFile();
    if (!path) return;
    busyRef.current = true; setBusy(true); setErr(null); setOut(null); setProg({ da: 0, tong: 0 });
    const off = await onKhoTienDo(setProg).catch(() => () => undefined);
    try {
      const r = await khoNap(path);
      setOut(r);
      toast(`Đã nạp ${nf.format(r.moi)} hình vào kho hình.`);
    } catch (e) { setErr(msg(e)); } finally { off(); busyRef.current = false; setBusy(false); setProg(null); reload(); }
  };

  if (!isDesktop()) return null;
  const when = st?.nap_luc ? new Date(st.nap_luc * 1000).toLocaleString('vi-VN') : null;
  return (
    <section className="panel" aria-label="Kho hình TikZ">
      <h2>Kho hình TikZ</h2>
      <span className="sys-hint">
        Kho hình vẽ để tìm và chèn vào câu hỏi. Lưu ở tệp riêng của HEdu, tách khỏi ngân hàng câu hỏi; chỉ nằm trên máy này (không đóng vào bản cài, không đưa lên mạng).
        Bạn nạp từ tệp kho hình MathHub (.db); tệp gốc chỉ được đọc, không bị sửa. Nạp lại nhiều lần được: hình đã có, đã sửa hoặc đã xoá không bị ghi đè hay làm sống lại.
      </span>
      {st && (
        <ul style={{ margin: "4px 0", paddingLeft: 18, lineHeight: 1.7, fontSize: 13 }} aria-label="Số liệu kho hình">
          <li><b>{nf.format(st.hinh)}</b> hình · <b>{nf.format(st.nut)}</b> mục{st.thung_rac > 0 ? ` · ${nf.format(st.thung_rac)} hình trong thùng rác` : ''}</li>
          {st.co && <li>Dung lượng {kichThuocText(st.kich_thuoc)}{when ? ` · nạp lần gần nhất ${when}` : ''}</li>}
          {!st.co && <li>Chưa có hình nào. Bấm “Nạp kho hình…” để chọn tệp kho MathHub.</li>}
        </ul>
      )}
      <div className="head-actions">
        <button type="button" className="btn btn-sm btn-accent" disabled={busy} onClick={() => void nap()}>{busy ? 'Đang nạp…' : st?.co ? 'Nạp thêm / nạp lại…' : 'Nạp kho hình…'}</button>
        {busy && prog && prog.tong > 0 && <span className="sys-hint" role="status">Đã xử lý {nf.format(prog.da)} / {nf.format(prog.tong)} hình</span>}
      </div>
      {out && (
        <span className="sys-hint" role="status">
          Xong sau {(out.ms / 1000).toFixed(1)} giây: nạp mới <b>{nf.format(out.moi)}</b>, đã có sẵn {nf.format(out.da_co)}, trùng mã {nf.format(out.trung)}, bỏ qua vì mã rỗng/quá lớn {nf.format(out.loi)} (trên {nf.format(out.tong)} hình, {nf.format(out.nut)} mục).
        </span>
      )}
      {err && <span className="sys-hint aid-bad" role="alert">{err}</span>}
    </section>
  );
}
