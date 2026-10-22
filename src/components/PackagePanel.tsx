// Bảng "Gói LaTeX" trong màn Nhập liệu (Issue #1): nói rõ gói nào dùng được, thiếu, hay chưa khai báo.
// Cảnh báo nằm cố định trong trang, không phải thông báo thoáng qua: chỉ biến mất khi vấn đề hết.
// HEdu chỉ tra cứu và gợi ý; không tự cài gói, không tự sửa mã LaTeX của bạn.
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../app-context';
import { collectRows } from '../lib/packages';
import { addPackageToRenderPreamble, checkRows, findPackage, forgetChecks, installCommand, type CheckResult, type PkgHit, type PkgStatus } from '../lib/texcheck';
import { defaultPreamble, getSettings, isTikzReady, onSettingsChange } from '../lib/tikz';

interface Props {
  src: string;
  blocks: string[];
  /** bấm “Xem N câu”: báo cho màn cha lọc danh sách câu theo các số này (rỗng = bỏ lọc) */
  onFilter: (rows: number[] | null, label: string) => void;
  activeFilter: string | null;
}

const copy = async (text: string, ok: () => void) => {
  try { await navigator.clipboard.writeText(text); ok(); } catch { /* không có quyền chép: bỏ qua */ }
};

export function PackagePanel({ src, blocks, onFilter, activeFilter }: Props) {
  const { go, toast } = useApp();
  const [preamble, setPreamble] = useState('');
  const [tick, setTick] = useState(0);
  const [res, setRes] = useState<CheckResult | null>(null);
  const [busy, setBusy] = useState(false);

  // đầu file mà HEdu dùng để vẽ hình: của người dùng nếu có, không thì mặc định
  useEffect(() => {
    let off = false;
    const load = async () => {
      const s = getSettings();
      const p = s.preamble.trim() ? s.preamble : isTikzReady() ? await defaultPreamble().catch(() => '') : '';
      if (!off) setPreamble(p);
    };
    void load();
    const un = onSettingsChange(() => { void load(); setTick((t) => t + 1); });
    return () => { off = true; un(); };
  }, []);

  const rows = useMemo(() => collectRows(src, blocks, preamble), [src, blocks, preamble]);

  useEffect(() => {
    let off = false;
    setBusy(true);
    checkRows(rows).then((r) => { if (!off) { setRes(r); setBusy(false); } });
    return () => { off = true; };
  }, [rows, tick]);

  const recheck = () => { forgetChecks(); setTick((t) => t + 1); };

  const items = res?.items ?? [];
  const bad = items.filter((i) => i.level === 'loi' || i.level === 'canh');
  const good = items.filter((i) => !(i.level === 'loi' || i.level === 'canh'));

  if (!rows.length) return null;

  return (
    <div className="pkg-panel" aria-label="Gói LaTeX">
      <div className="pkg-head">
        <h2>Gói LaTeX</h2>
        {busy && <span className="chk-pill">Đang hỏi TeX Live…</span>}
        {!busy && res && !res.texError && (
          <span className={`chk-pill${bad.length ? (bad.some((b) => b.level === 'loi') ? ' bad' : ' warn') : ' ok'}`}>
            {bad.length ? `${bad.length} gói cần xử lý` : `${good.length} gói đều dùng được`}
          </span>
        )}
        <button type="button" className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={recheck} disabled={busy}>Kiểm tra lại</button>
      </div>

      {res?.texError && (
        <div className="pkg-card loi" role="alert">
          <b>{res.texError.stage === 'thieu-texlive' ? 'Chưa tìm thấy TeX Live' : 'Chưa kiểm tra được gói'}</b>
          <span>{res.texError.message}</span>
          <div className="pkg-actions">
            <button type="button" className="btn btn-sm" onClick={() => go({ screen: 'system' })}>Mở cài đặt TeX Live</button>
            <button type="button" className="btn btn-sm" onClick={recheck}>Kiểm tra lại</button>
          </div>
        </div>
      )}
      {!res?.texError && !isTikzReady() && <span className="sys-hint">Bản xem thử trên web chỉ liệt kê gói đã khai báo. Bản cài trên Windows sẽ hỏi TeX Live xem máy có đủ không.</span>}

      {bad.map((it) => (
        <PkgCard key={it.row.key} it={it} filtered={activeFilter === it.row.key} onFilter={onFilter} onRecheck={recheck} toast={toast} goSystem={() => go({ screen: 'system' })} />
      ))}

      {good.length > 0 && (
        <details className="pkg-ok">
          <summary>{good.length} gói đã nhận{res?.texError ? '' : ' và dùng được'}</summary>
          <ul>
            {good.map((g) => (
              <li key={g.row.key}>
                <span className="mono">{g.row.name}</span>
                <span className="pkg-kind">{g.row.declared === 'hedu' ? 'HEdu tự nạp khi vẽ hình' : 'khai báo trong file'}</span>
                {g.row.questions.length > 0 && <span className="pkg-kind">{g.row.questions.length} câu</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function PkgCard({ it, filtered, onFilter, onRecheck, toast, goSystem }: {
  it: PkgStatus; filtered: boolean; onFilter: Props['onFilter']; onRecheck: () => void; toast: (m: string) => void; goSystem: () => void;
}) {
  const [log, setLog] = useState(false);
  const [ask, setAsk] = useState<'mang' | 'them' | null>(null);
  const [hits, setHits] = useState<PkgHit[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const r = it.row;

  const lookup = async () => {
    setAsk(null); setBusy(true); setErr('');
    try { setHits(await findPackage(r.file, true)); } catch (e) { setErr(String((e as { message?: string })?.message ?? e)); }
    setBusy(false);
  };
  const add = async () => {
    setAsk(null);
    await addPackageToRenderPreamble(r.name);
    toast(`Đã thêm \\usepackage{${r.name}} vào đầu file HEdu dùng để vẽ hình. File .tex của bạn không bị sửa.`);
  };

  return (
    <div className={`pkg-card ${it.level}`} role={it.level === 'loi' ? 'alert' : 'status'}>
      <b>{it.state === 'thieu' ? 'Thiếu gói' : it.state === 'chua-khai-bao' ? 'Chưa khai báo' : it.state === 'tai-nguyen' ? 'Tệp ngoài' : 'Gói'}: <span className="mono">{r.name}</span></b>
      <span>{it.message}</span>
      {it.hint && <span className="pkg-hint">{it.hint}</span>}
      {hits && (
        <span className="pkg-hint">
          {hits.length ? <>Gói chứa tệp này: <b>{hits.map((h) => h.package).join(', ')}</b>.</> : 'Không thấy gói nào chứa đúng tệp này trong kho TeX Live (có thể tên tệp khác tên gói, hoặc không có mạng).'}
        </span>
      )}
      {err && <span className="pkg-hint">{err}</span>}

      <div className="pkg-actions">
        {r.questions.length > 0 && (
          <button type="button" className="btn btn-sm" onClick={() => onFilter(filtered ? null : r.questions, r.key)}>
            {filtered ? 'Hiện lại mọi câu' : `Xem ${r.questions.length} câu`}
          </button>
        )}
        <button type="button" className="btn btn-sm" onClick={onRecheck}>Kiểm tra lại</button>
        <button type="button" className="btn btn-sm" onClick={() => setLog(!log)}>{log ? 'Ẩn chi tiết' : 'Xem log'}</button>
        {it.state === 'thieu' && <>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setAsk('mang')}>Tra tên gói cần cài</button>
          <button type="button" className="btn btn-sm" onClick={goSystem}>Mở cài đặt TeX Live</button>
          <button type="button" className="btn btn-sm" onClick={() => void copy(installCommand(hits ?? [], r.file), () => toast('Đã chép. Dán vào cửa sổ lệnh (chạy quyền quản trị) để cài.'))}>Sao chép hướng dẫn</button>
        </>}
        {it.state === 'chua-khai-bao' && <button type="button" className="btn btn-sm btn-accent" onClick={() => setAsk('them')}>Thêm khai báo…</button>}
      </div>

      {ask === 'mang' && (
        <div className="pkg-confirm">
          Để biết tên gói, HEdu cần hỏi kho TeX Live trên mạng (chỉ gửi tên tệp <span className="mono">{r.file}</span>). Đồng ý?
          <button type="button" className="btn btn-sm btn-accent" onClick={() => void lookup()}>Đồng ý, tra cứu</button>
          <button type="button" className="btn btn-sm" onClick={() => setAsk(null)}>Thôi</button>
        </div>
      )}
      {ask === 'them' && (
        <div className="pkg-confirm">
          HEdu sẽ thêm dòng <span className="mono">\usepackage{'{' + r.name + '}'}</span> vào đầu file dùng để vẽ hình (mục Hệ thống). File .tex và các câu của bạn không bị sửa.
          <button type="button" className="btn btn-sm btn-accent" onClick={() => void add()}>Xác nhận thêm</button>
          <button type="button" className="btn btn-sm" onClick={() => setAsk(null)}>Thôi</button>
        </div>
      )}
      {log && (
        <code className="fig-log">
          {`Tệp cần có: ${r.file}\nLoại: ${r.kind}\nKhai báo: ${r.declared === 'file' ? 'trong file của bạn' : r.declared === 'hedu' ? 'đầu file HEdu dùng để vẽ hình' : 'không ai khai báo (suy ra từ lệnh)'}\n${r.why.length ? 'Bằng chứng: ' + r.why.join('; ') + '\n' : ''}${it.path ? 'Tìm thấy tại: ' + it.path : 'TeX Live (kpsewhich) không tìm thấy tệp này.'}\nCâu liên quan: ${r.questions.length ? r.questions.slice(0, 40).map((q) => q + 1).join(', ') + (r.questions.length > 40 ? '…' : '') : '(khai báo chung của file)'}`}
        </code>
      )}
    </div>
  );
}
