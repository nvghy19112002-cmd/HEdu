import { useEffect, useState } from 'react';
import { clearLog, loadLog, logPersists, LOG_MAX, whenText, type LogEntry } from '../lib/importreport';
import { ImportReportView } from './ImportReportView';

/** Cài đặt → Dữ liệu & sao lưu → Nhật ký nhập: tóm tắt các lô nhập gần nhất (không có nội dung câu hỏi). */
export function ImportLogPanel() {
  const [list, setList] = useState<LogEntry[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [ask, setAsk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reload = () => { void loadLog().then(setList); };
  useEffect(reload, []);
  const wipe = async () => { setAsk(false); if (await clearLog()) { setOpen(null); reload(); } else setErr('Chưa xoá được nhật ký nhập.'); };
  return (
    <section className="panel" aria-label="Nhật ký nhập">
      <h2>Nhật ký nhập</h2>
      <span className="sys-hint">
        {logPersists()
          ? `HEdu giữ báo cáo của ${LOG_MAX} lần nhập gần nhất (tổng số, các câu bỏ qua hoặc cần xem lại). Không lưu nội dung câu hỏi. Xoá nhật ký không ảnh hưởng ngân hàng câu hỏi.`
          : 'Đang dùng cách lưu cũ (JSON) nên HEdu chưa giữ nhật ký nhập. Sau mỗi lần nhập vẫn lưu được báo cáo ra tệp.'}
      </span>
      {list && list.length === 0 && logPersists() && <span className="sys-hint">Chưa có lần nhập nào được ghi lại.</span>}
      {list && list.length > 0 && (
        <ul className="imp-log" aria-label="Các lần nhập">
          {list.map((e, k) => (
            <li key={e.at}>
              <button type="button" className="btn btn-sm" aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)}>
                {whenText(e.at)} · {e.name || 'dán trực tiếp'} · nhập {e.imported}/{e.found} câu{e.skippedDup + e.skippedUser ? `, bỏ qua ${e.skippedDup + e.skippedUser}` : ''}
              </button>
              {open === k && <ImportReportView report={e} full={false} onClose={() => setOpen(null)} />}
            </li>
          ))}
        </ul>
      )}
      {err && <span className="sys-hint aid-bad">{err}</span>}
      {list && list.length > 0 && (
        <div className="head-actions">
          {!ask && <button type="button" className="btn btn-sm" onClick={() => setAsk(true)}>Xoá nhật ký nhập</button>}
          {ask && <><span className="sys-hint">Xoá toàn bộ nhật ký nhập? (Ngân hàng câu hỏi không bị ảnh hưởng.)</span><button type="button" className="btn btn-sm" onClick={wipe}>Xoá nhật ký</button><button type="button" className="btn btn-sm" onClick={() => setAsk(false)}>Giữ lại</button></>}
        </div>
      )}
    </section>
  );
}
