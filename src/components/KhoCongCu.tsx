// Hai công cụ của Kho hình: "Quét nền" (dịch thử cả kho, ghi trạng thái Dịch được / Dịch lỗi) và "Hình giống nhau"
// (nhóm các hình chỉ khác số liệu, khoảng trắng hay chú thích; giữ một bản, chuyển các bản còn lại vào thùng rác của kho).
import { useEffect, useRef, useState } from 'react';
import { khoCanDich, khoDatTrangThai, khoNhomGiong, khoTim, khoXoa, loaiText, type KhoMuc } from '../lib/khohinh';
import { asTikzErr, cancelTikz, renderTikz } from '../lib/tikz';

const nf = new Intl.NumberFormat('vi-VN');
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Frame({ title, onClose, busy, foot, children }: { title: string; onClose(): void; busy?: boolean; foot: React.ReactNode; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) { e.preventDefault(); e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [busy, onClose]);
  return (
    <>
      <div className="cfm-scrim" onClick={() => { if (!busy) onClose(); }} />
      <div className="cfm" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: 720, width: 'min(720px, 94vw)' }}>
        <h3>{title}</h3>
        <div className="cfm-body">{children}</div>
        <div className="cfm-acts">{foot}</div>
      </div>
    </>
  );
}

/** Dịch nền các hình chưa dịch theo từng lô nhỏ (2 hình cùng lúc). Dừng được ngay (kể cả tiến trình TeX đang chạy). */
export function KhoQuetNen({ onClose, onChanged }: { onClose(): void; onChanged(): void }) {
  const [total, setTotal] = useState<number | null>(null);
  useEffect(() => { khoTim({ status: 'chua', limit: 1 }).then((r) => setTotal(r.tong)).catch(() => setTotal(0)); }, []);
  const [run, setRun] = useState(false);
  const [done, setDone] = useState({ ok: 0, loi: 0 });
  const [note, setNote] = useState<string | null>(null);
  const stop = useRef(false);

  const go = async () => {
    setRun(true); setNote(null); stop.current = false;
    let ok = 0, loi = 0;
    try {
      for (;;) {
        const batch = await khoCanDich(40);
        if (!batch.length || stop.current) break;
        const res: { id: string; status: 'ok' | 'loi'; err?: string }[] = [];
        let abort: string | null = null;
        let k = 0;
        const worker = async () => {
          while (!stop.current && !abort) {
            const h = batch[k++];
            if (!h) return;
            try { await renderTikz(h.code, h.extra_preamble); res.push({ id: h.id, status: 'ok' }); ok++; }
            catch (e) {
              const er = asTikzErr(e);
              if (er.stage === 'huy') return; // bị dừng: không ghi trạng thái, hình vẫn "chưa dịch"
              if (er.stage === 'thieu-texlive') { abort = 'Máy chưa có TeX Live nên không dịch được. Cài TeX Live hoặc chỉ đường dẫn ở Cài đặt.'; return; }
              res.push({ id: h.id, status: 'loi', err: er.message.slice(0, 300) }); loi++;
            }
            setDone({ ok, loi });
          }
        };
        await Promise.all([worker(), worker()]);
        if (res.length) await khoDatTrangThai(res);
        setDone({ ok, loi });
        if (abort) { setNote(abort); break; }
        if (!res.length) break; // không ghi được gì (bị dừng): thoát để khỏi lặp
      }
    } catch (e) { setNote(msg(e)); }
    setRun(false);
    onChanged();
    if (stop.current) setNote((n) => n ?? 'Đã dừng. Hình chưa dịch vẫn ở trạng thái "Chưa dịch", chạy lại để tiếp tục.');
  };
  const dung = () => { stop.current = true; void cancelTikz(); };

  return (
    <Frame title="Quét nền: dịch thử cả kho hình" busy={run} onClose={onClose} foot={<>
      {run ? <button type="button" className="btn btn-outline" onClick={dung}>Dừng</button> : <button type="button" className="btn btn-outline" onClick={onClose}>Đóng</button>}
      <button type="button" className="btn btn-accent" disabled={run || !total} onClick={() => { void go(); }}>{run ? 'Đang quét…' : 'Bắt đầu quét'}</button>
    </>}>
      <p>Dịch thử mọi hình đang ở trạng thái <b>Chưa dịch</b> ({total === null ? '…' : nf.format(total)} hình) bằng TeX Live và ghi kết quả (Dịch được / Dịch lỗi). Chạy được lâu: cứ để máy chạy, dừng lúc nào cũng được và lần sau tiếp tục từ chỗ còn lại. Kho và nội dung hình không bị đổi.</p>
      {(run || done.ok + done.loi > 0) && <p role="status" aria-live="polite">Đã dịch: <b>{nf.format(done.ok)}</b> được · <b>{nf.format(done.loi)}</b> lỗi.</p>}
      {note && <p className="te-warn" role="status">{note}</p>}
    </Frame>
  );
}

/** Nhóm hình giống nhau: giữ bản đầu mỗi nhóm, chuyển các bản còn lại vào thùng rác của kho (khôi phục được). */
export function KhoHinhGiong({ onClose, onChanged }: { onClose(): void; onChanged(): void }) {
  const [groups, setGroups] = useState<KhoMuc[][] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { khoNhomGiong(300).then(setGroups).catch((e) => setErr(msg(e))); }, []);

  const keepFirst = async (gi: number) => {
    const g = groups?.[gi];
    if (!g) return;
    setBusy(true); setErr(null);
    try {
      await khoXoa(g.slice(1).map((m) => m.id), true);
      setGroups((cur) => (cur ? cur.filter((_, i) => i !== gi) : cur));
      setNote(`Đã chuyển ${g.length - 1} hình vào thùng rác của kho (khôi phục được).`);
      onChanged();
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  };

  return (
    <Frame title="Hình giống nhau trong kho" busy={busy} onClose={onClose} foot={<button type="button" className="btn btn-outline" onClick={onClose}>Đóng</button>}>
      {err && <p className="te-bad" role="alert">{err}</p>}
      {note && <p className="okmark" role="status">{note}</p>}
      {!groups && !err && <p>Đang so sánh các hình trong kho…</p>}
      {groups && groups.length === 0 && <p>Không có nhóm hình nào chỉ khác nhau về số liệu, khoảng trắng hay chú thích.</p>}
      {groups && groups.length > 0 && (
        <>
          <p className="xl-meta">{nf.format(groups.length)} nhóm. Mỗi nhóm là các hình có cùng cấu trúc mã, chỉ khác số liệu, khoảng trắng hoặc chú thích. Mặc định giữ hình đầu tiên (xếp theo tên); hình có số liệu khác nhau vẫn có thể cần giữ cả hai, nên bạn quyết từng nhóm.</p>
          <ol className="hl-qs" style={{ maxHeight: '50vh' }}>
            {groups.map((g, gi) => (
              <li key={g[0].id} style={{ display: 'block', borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
                <ul style={{ margin: 0, paddingLeft: 18 }}>{g.map((m, i) => <li key={m.id} style={{ display: 'list-item' }}>{i === 0 ? <b>{m.title}</b> : m.title} <span className="xl-meta">· {loaiText(m.kind)} · {m.code_len} ký tự{i === 0 ? ' · giữ' : ''}</span></li>)}</ul>
                <button type="button" className="btn btn-sm" disabled={busy} style={{ marginTop: 4 }} onClick={() => { void keepFirst(gi); }}>Giữ “{g[0].title.slice(0, 40)}”, bỏ {g.length - 1} bản còn lại</button>
              </li>
            ))}
          </ol>
        </>
      )}
    </Frame>
  );
}
