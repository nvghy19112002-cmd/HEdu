// Cài đặt › Đề thi: chọn mẫu in cho đề tạo mới + Thông tin mặc định (Sở/Phòng, Trường, Tổ) tự điền vào đề mới.
import { useState } from 'react';
import { EMPTY_INFO, loadDefaultInfo, loadThemeId, saveDefaultInfo, saveThemeId, themeOf, THEMES, type DefaultInfo } from '../lib/examtheme';

export function ExamThemePanel({ toast }: { toast(m: string): void }) {
  const [theme, setTheme] = useState(loadThemeId);
  const [saved, setSaved] = useState<DefaultInfo>(loadDefaultInfo);
  const [info, setInfo] = useState<DefaultInfo>(saved);
  const t = themeOf(theme);
  const changed = info.dept !== saved.dept || info.school !== saved.school || info.group !== saved.group;
  const field = (k: keyof DefaultInfo, label: string, ph: string) => (
    <label className="xm-field">{label}<input className="xl-in" value={info[k]} maxLength={120} placeholder={ph} onChange={(e) => setInfo({ ...info, [k]: e.target.value })} /></label>
  );
  return (
    <>
      <section className="panel" aria-label="Mẫu in đề thi">
        <h2>Mẫu in đề thi</h2>
        <span className="sys-hint">Mẫu quyết định cách trình bày khi biên dịch đề ra PDF (khổ giấy, đầu đề, đánh số trang). Mẫu chọn ở đây dùng cho đề TẠO MỚI; đề đã có trong Thư viện giữ nguyên cách in của nó.</span>
        <div className="xt-themes" role="radiogroup" aria-label="Mẫu in">
          {THEMES.map((x) => (
            <label key={x.id} className={`xt-theme${x.id === theme ? ' on' : ''}`}>
              <input type="radio" name="examtheme" checked={x.id === theme} onChange={() => { saveThemeId(x.id); setTheme(x.id); toast(`Đề tạo mới sẽ dùng mẫu “${x.name}”.`); }} />
              <span><b>{x.name}</b> <small className="xl-meta">phiên bản {x.version}</small><br /><span className="xl-meta">{x.desc}</span></span>
            </label>
          ))}
        </div>
        <span className="xl-meta">Đang dùng: <b>{t.name}</b>. Hiện mới có một mẫu; mẫu khác sẽ được thêm khi thầy/cô gửi mẫu đề muốn dùng.</span>
      </section>
      <section className="panel" aria-label="Thông tin mặc định">
        <h2>Thông tin mặc định</h2>
        <span className="sys-hint">Tự điền vào đầu đề khi tạo đề mới ở “Tạo đề” (đề nào đã gõ Sở/Trường/Tổ thì giữ nguyên). Sửa lại được trong từng đề.</span>
        <div className="xt-info">
          {field('dept', 'Sở / phòng giáo dục', 'SỞ GD&ĐT …')}
          {field('school', 'Trường', 'TRƯỜNG THPT …')}
          {field('group', 'Tổ / bộ môn', 'TỔ TOÁN – TIN')}
        </div>
        <div className="head-actions">
          <button type="button" className="btn btn-sm btn-accent" disabled={!changed} onClick={() => { const c = saveDefaultInfo(info); setSaved(c); setInfo(c); toast('Đã lưu thông tin mặc định.'); }}>Lưu</button>
          <button type="button" className="btn btn-sm" disabled={!changed} onClick={() => setInfo(saved)}>Huỷ sửa</button>
          <button type="button" className="btn btn-sm" disabled={!saved.dept && !saved.school && !saved.group} onClick={() => { saveDefaultInfo(EMPTY_INFO); setSaved(EMPTY_INFO); setInfo(EMPTY_INFO); toast('Đã xoá thông tin mặc định.'); }}>Xoá</button>
        </div>
      </section>
    </>
  );
}
