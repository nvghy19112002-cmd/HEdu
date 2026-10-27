import { useState } from 'react';
import { downloadText, useApp } from '../app-context';
import { DECISION_TEXT, ID_PLACE_TEXT, ID_STATE_TEXT, reportCsv, reportFileBase, reportMd, whenText, type ImportReport, type LogEntry } from '../lib/importreport';
import { saveTextFile } from '../lib/savefile';

type View = ImportReport | LogEntry;
const truncated = (r: View): number => ('rowsTruncated' in r ? r.rowsTruncated : 0);

/** Kết quả một lô nhập (hiện ngay sau khi nhập, và trong Cài đặt → Nhật ký nhập). Không có nội dung câu hỏi. */
export function ImportReportView({ report, full, onBank, onShowBatch, onClose, logSaved }: { report: View; full: boolean; onBank?: () => void; onShowBatch?: () => void; onClose?: () => void; logSaved?: boolean }) {
  const { toast } = useApp();
  const [showAll, setShowAll] = useState(false);
  const r = report;
  const save = async (kind: 'csv' | 'md') => {
    const name = `${reportFileBase(r.at)}.${kind}`;
    const text = kind === 'csv' ? reportCsv(r) : reportMd(r);
    const res = await saveTextFile(name, text, () => downloadText(name, text, kind === 'csv' ? 'text/csv' : 'text/markdown'));
    if (res.kind === 'saved') toast(`Đã lưu báo cáo: ${res.path}`);
    else if (res.kind === 'downloaded') toast('Đã tải báo cáo về máy.');
    else if (res.kind === 'error') toast(`Chưa lưu được báo cáo: ${res.message}`);
  };
  const problems = r.rows.filter((x) => x.decision !== 'import' || x.idState !== 'ok' || x.preview !== '' || x.tex === 'loi');
  const list = showAll ? r.rows : problems;
  return (
    <section className="panel" aria-label="Kết quả nhập">
      <h2>Kết quả nhập{r.name ? `: ${r.name}` : ''}</h2>
      <span className="sys-hint">{whenText(r.at)}{r.restorePoint ? ' · đã chụp điểm khôi phục trước khi nhập (Cài đặt → Dữ liệu & sao lưu)' : ''}</span>
      <ul className="imp-sum" aria-label="Tổng kết">
        <li><b>{r.found}</b> câu tìm thấy</li>
        <li><b>{r.imported}</b> đã nhập</li>
        <li><b>{r.skippedDup}</b> bỏ qua vì nghi trùng</li>
        <li><b>{r.skippedUser}</b> bỏ qua theo lựa chọn của bạn</li>
      </ul>
      <span className="sys-hint">
        Vị trí các câu đã nhập: {r.ids.ok} theo mã ID{r.ids.unverified ? ` (${r.ids.unverified} chưa kiểm chứng)` : ''}{r.ids.kept ? ` (${r.ids.kept} bất đồng ngân hàng, bạn giữ ID)` : ''}{r.ids.queued ? ` (${r.ids.queued} bất đồng ngân hàng, chờ xác minh)` : ''} · {r.ids.firstForm} thiếu Dạng (vào Dạng đầu của Bài) · {r.ids.ai} theo gợi ý bạn chọn · {r.ids.general} vào vị trí chung{r.ids.general ? ' (nên xếp lại sau)' : ''}.
      </span>
      <span className="sys-hint">
        Kiểm tra: {r.previewErrors} câu lỗi và {r.previewWarnings} câu cảnh báo khi xem trước{r.texChecked ? `; TeX Live đã thử ${r.texChecked} câu, ${r.texFailed} lỗi` : '; chưa biên dịch bằng TeX Live'}.
      </span>
      {r.warnings.map((w) => <span key={w} className="sys-hint aid-bad">{w}</span>)}
      {r.files.length > 1 && (
        <div className="aid-scroll aid-scroll-sm" aria-label="Kết quả theo tệp">
          <table className="aid-table">
            <thead><tr><th>Tệp</th><th>Tìm thấy</th><th>Đã nhập</th><th>Bỏ qua</th></tr></thead>
            <tbody>{r.files.map((f) => <tr key={`${f.rel}/${f.file}`}><td className="aid-q"><span className="mono">{f.rel ? `${f.rel}/` : ''}{f.file}</span></td><td>{f.found}</td><td>{f.imported}</td><td>{f.skipped}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      {list.length > 0 && (
        <div className="aid-scroll aid-scroll-sm" aria-label="Các câu cần xem lại">
          <table className="aid-table">
            <thead><tr><th>Tệp : dòng</th><th>Quyết định</th><th>Lý do</th><th>ID trong tệp</th><th>Vị trí đặt</th></tr></thead>
            <tbody>
              {list.slice(0, 300).map((x, k) => (
                <tr key={k}>
                  <td className="aid-q"><span className="mono">{x.file || 'dán'}:{x.line}</span></td>
                  <td>{DECISION_TEXT[x.decision]}</td><td>{x.reason}{x.preview === 'loi' ? ' · lỗi xem trước' : x.preview === 'canh' ? ' · cảnh báo' : ''}{x.tex === 'loi' ? ' · TeX lỗi' : ''}</td>
                  <td>{ID_STATE_TEXT[x.idState]}</td><td>{x.idPlace ? ID_PLACE_TEXT[x.idPlace] : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.length > 300 && <span className="sys-hint">Bảng chỉ hiện 300 dòng đầu; xem đủ trong tệp .csv.</span>}
      {truncated(r) > 0 && <span className="sys-hint">Nhật ký chỉ giữ {r.rows.length} dòng có vấn đề đầu tiên (còn {truncated(r)} dòng nữa).</span>}
      <div className="head-actions">
        {full && <label className="chk"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Hiện cả câu đã nhập bình thường</label>}
        {full && <button type="button" className="btn btn-sm" onClick={() => save('csv')}>Lưu báo cáo (.csv)</button>}
        <button type="button" className="btn btn-sm" onClick={() => save('md')}>Lưu bản tóm tắt (.md)</button>
        {onShowBatch && <button type="button" className="btn btn-sm btn-primary" onClick={onShowBatch}>Xem các câu vừa nhập</button>}
        {onBank && <button type="button" className={`btn btn-sm${onShowBatch ? '' : ' btn-primary'}`} onClick={onBank}>Mở Ngân hàng</button>}
        {onClose && <button type="button" className="btn btn-sm" onClick={onClose}>Đóng</button>}
      </div>
      {logSaved === false && <span className="sys-hint aid-bad">Chưa ghi được báo cáo vào Nhật ký nhập (việc nhập vẫn thành công). Hãy lưu báo cáo ra tệp.</span>}
    </section>
  );
}
