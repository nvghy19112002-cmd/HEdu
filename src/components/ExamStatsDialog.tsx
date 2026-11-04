// Hộp "Thống kê sau thi": chọn mã đề, dán bài làm từ Excel (cột đầu = tên, các cột sau = đáp án từng câu), xem điểm từng học sinh,
// độ khó / độ phân biệt / phân bố lựa chọn từng câu, phổ điểm; xuất Excel. Tính toán ở examstats.ts (thuần, có kiểm thử).
import { useMemo, useState } from 'react';
import { analyze, FLAG_VI, parsePaste } from '../lib/examstats';
import { codeKeyItems, type MatrixSpec } from '../lib/exammatrix';
import { statsBook } from '../lib/examstatsbook';
import { chooseXlsxPath } from '../lib/exampdf';
import { saveXlsx } from '../lib/xlsxbook';

const nf = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function ExamStatsDialog({ name, spec, onClose, onToast }: { name: string; spec: MatrixSpec; onClose(): void; onToast(m: string): void }) {
  const codes = spec.perCode.map((c) => c.code);
  const [code, setCode] = useState(codes[0] ?? '');
  const [text, setText] = useState('');
  const [head, setHead] = useState<'auto' | 'yes' | 'no'>('auto');
  const [busy, setBusy] = useState(false);
  const items = useMemo(() => codeKeyItems(spec, code), [spec, code]);
  const parsed = useMemo(() => (text.trim() ? parsePaste(text, items.length, head === 'auto' ? undefined : head === 'yes') : null), [text, items.length, head]);
  const res = useMemo(() => (parsed && parsed.rows.length ? analyze(items, spec.scoring, parsed.rows) : null), [parsed, items, spec.scoring]);

  const exportXlsx = async () => {
    if (!res) return;
    setBusy(true);
    try {
      const dest = await chooseXlsxPath('Xuất thống kê sau thi ra Excel', `thong-ke_${name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase().slice(0, 40) || 'de'}_ma-${code}.xlsx`);
      if (!dest) return;
      onToast(`Đã xuất thống kê: ${await saveXlsx(dest, statsBook(res, { name, code }))}`);
    } catch (e) { onToast(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const maxH = res ? Math.max(1, ...res.histogram) : 1;

  return (
    <>
      <div className="cfm-scrim" onClick={onClose} />
      <div className="cfm" role="dialog" aria-modal="true" aria-label="Thống kê sau thi" style={{ maxWidth: 1000, width: 'min(1000px, 96vw)' }}>
        <h3>Thống kê sau thi · {name}</h3>
        <div className="cfm-body" style={{ maxHeight: '70vh', overflow: 'auto' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <label>Mã đề <select className="xl-in" value={code} onChange={(e) => setCode(e.target.value)}>{codes.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
            <span className="xl-meta">{items.length} câu</span>
            <label>Dòng đầu <select className="xl-in" value={head} onChange={(e) => setHead(e.target.value as 'auto' | 'yes' | 'no')}><option value="auto">Tự nhận</option><option value="yes">Là tiêu đề</option><option value="no">Là học sinh</option></select></label>
          </div>
          <label className="xm-field">Dán bài làm từ Excel (cột đầu: tên hoặc số báo danh; các cột sau: đáp án từng câu theo thứ tự đề)
            <textarea className="xl-in" style={{ width: '100%', minHeight: 110, fontFamily: 'var(--f-code, monospace)', fontSize: 12 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Nguyễn An\tA\tB\tĐSĐS\t0,5\nTrần Bình\tA\tC\tĐSĐĐ\t'} spellCheck={false} aria-label="Bài làm của học sinh" />
          </label>
          <p className="xl-meta">Đáp án trắc nghiệm: A, B, C, D. Đúng/Sai: bốn ký tự (Đ hoặc D cho đúng, S cho sai), vd ĐSĐS. Trả lời ngắn: số (dấu , hoặc . đều được). Ô trống = bỏ trống.{parsed && parsed.extraCols > 0 ? ` Có ${parsed.extraCols} cột thừa so với số câu của đề: đã bỏ qua.` : ''}</p>
          {res && (
            <>
              <div className="chk-sum" role="status" style={{ flexWrap: 'wrap' }}>
                <span className="chk-pill">{res.summary.n} học sinh</span>
                <span className="chk-pill">Trung bình {nf.format(res.summary.mean)} / {nf.format(res.summary.maxPossible)}</span>
                <span className="chk-pill">Trung vị {nf.format(res.summary.median)}</span>
                <span className="chk-pill">Cao nhất {nf.format(res.summary.max)} · thấp nhất {nf.format(res.summary.min)}</span>
                <span className="chk-pill">Độ lệch chuẩn {nf.format(res.summary.sd)}</span>
                <span className="chk-pill" title="Cronbach α: càng gần 1 thì đề càng đồng nhất; từ 0,7 là tạm ổn">Độ tin cậy {res.summary.kr20 === null ? '—' : nf.format(res.summary.kr20)}</span>
              </div>
              <div className="st-hist" role="img" aria-label="Phổ điểm theo thang 10">
                {res.histogram.map((n, i) => <div key={i} className="st-bar" title={`${i} – ${i + 1}: ${n} học sinh`}><span style={{ height: `${(n / maxH) * 64}px` }} /><i>{n || ''}</i><small>{i}</small></div>)}
              </div>
              <h4 style={{ margin: '12px 0 4px' }}>Theo từng câu</h4>
              <div style={{ overflow: 'auto', maxHeight: 280 }}>
                <table className="st-tab">
                  <thead><tr><th>Câu</th><th>Đáp án</th><th>Tỉ lệ đúng</th><th title="Nhóm 27% điểm cao trừ nhóm 27% thấp (cần từ 10 học sinh)">Phân biệt</th><th>Tương quan</th><th>Phân bố lựa chọn</th><th>Nhận xét</th></tr></thead>
                  <tbody>
                    {res.items.map((i) => (
                      <tr key={i.q} className={i.flags.length ? 'st-warn' : ''}>
                        <td>{i.q}</td><td>{i.key}</td><td>{pct(i.p)}</td><td>{i.d === null ? '—' : nf.format(i.d)}</td><td>{i.r === null ? '—' : nf.format(i.r)}</td>
                        <td>{Object.entries(i.options).sort().map(([o, c]) => `${o}: ${c}`).join(' · ')}{i.blank ? ` · trống: ${i.blank}` : ''}</td>
                        <td>{i.flags.map((f) => FLAG_VI[f]).join('; ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h4 style={{ margin: '12px 0 4px' }}>Theo học sinh</h4>
              <div style={{ overflow: 'auto', maxHeight: 200 }}>
                <table className="st-tab"><thead><tr><th>Học sinh</th><th>Điểm</th><th>Số câu đúng hoàn toàn</th></tr></thead>
                  <tbody>{[...res.students].sort((a, b) => b.score - a.score).map((s, k) => <tr key={k}><td>{s.name}</td><td>{nf.format(s.score)}</td><td>{s.correct}/{items.length}</td></tr>)}</tbody>
                </table>
              </div>
            </>
          )}
          {!res && text.trim() && <p className="te-warn">Chưa đọc được học sinh nào. Kiểm tra lại dòng đầu và các cột đã dán.</p>}
        </div>
        <div className="cfm-acts">
          <button type="button" className="btn btn-outline" onClick={onClose}>Đóng</button>
          <button type="button" className="btn btn-accent" disabled={!res || busy} onClick={() => { void exportXlsx(); }}>Xuất Excel…</button>
        </div>
      </div>
    </>
  );
}
