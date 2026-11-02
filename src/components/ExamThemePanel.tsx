// Cài đặt › Đề thi: chọn mẫu in (9 mẫu HyMath + kiểu cũ của HEdu) cho tệp đề chỉ có dữ liệu + Thông tin mặc định
// (Sở/Phòng, Trường, Tổ tự điền vào đề mới ở Tạo đề; dòng tên giáo viên và năm học in trên mẫu HyMath).
import { useState } from 'react';
import { EMPTY_INFO, loadDefaultInfo, loadThemeId, saveDefaultInfo, saveThemeId, themeOf, THEMES, type DefaultInfo } from '../lib/examtheme';

export function ExamThemePanel({ toast }: { toast(m: string): void }) {
  const [theme, setTheme] = useState(loadThemeId);
  const [saved, setSaved] = useState<DefaultInfo>(loadDefaultInfo);
  const [info, setInfo] = useState<DefaultInfo>(saved);
  const t = themeOf(theme);
  const changed = (Object.keys(info) as (keyof DefaultInfo)[]).some((k) => info[k] !== saved[k]);
  const field = (k: keyof DefaultInfo, label: string, ph: string) => (
    <label className="xm-field">{label}<input className="xl-in" value={info[k]} maxLength={120} placeholder={ph} onChange={(e) => setInfo({ ...info, [k]: e.target.value })} /></label>
  );
  return (
    <>
      <section className="panel" aria-label="Mẫu in đề thi">
        <h2>Mẫu in đề thi</h2>
        <span className="sys-hint">Dùng khi biên dịch tệp đề <b>chỉ có dữ liệu</b> (không có \documentclass, vd tệp có \TieuDeDeSo…): HEdu tự ghép phần đầu theo mẫu chọn ở đây, tệp đề không bị sửa. Mẫu HyMath dịch bằng XeLaTeX và có ba bản: Đề, Đề in trắng đen, Lời giải. Đề có \documentclass riêng và đề tạo từ Ngân hàng giữ cách in của chúng.</span>
        <div className="xt-themes" role="radiogroup" aria-label="Mẫu in">
          {THEMES.map((x) => (
            <label key={x.id} className={`xt-theme${x.id === theme ? ' on' : ''}`}>
              <input type="radio" name="examtheme" checked={x.id === theme} onChange={() => { saveThemeId(x.id); setTheme(x.id); toast(`Tệp đề chỉ có dữ liệu sẽ dịch theo mẫu “${x.name}”.`); }} />
              <span><b>{x.name}</b> <small className="xl-meta">{x.kind === 'hymath' ? `HyMath · ${x.file}` : `phiên bản ${x.version}`}</small><br /><span className="xl-meta">{x.desc}</span></span>
            </label>
          ))}
        </div>
        <span className="xl-meta">Đang dùng: <b>{t.name}</b>.</span>
      </section>
      <section className="panel" aria-label="Thông tin mặc định">
        <h2>Thông tin mặc định</h2>
        <span className="sys-hint">Sở/Trường/Tổ tự điền vào đầu đề khi tạo đề mới ở “Tạo đề” (đề nào đã gõ thì giữ nguyên). Dòng tên giáo viên và năm học in ở đầu/chân trang của mẫu HyMath (năm học trong Thông tin đề được ưu tiên).</span>
        <div className="xt-info">
          {field('teacher', 'Dòng tên giáo viên', 'Giáo viên: Nguyễn Văn A')}
          {field('year', 'Năm học mặc định', '2026–2027')}
          {field('dept', 'Sở / phòng giáo dục', 'SỞ GD&ĐT …')}
          {field('school', 'Trường', 'TRƯỜNG THPT …')}
          {field('group', 'Tổ / bộ môn', 'TỔ TOÁN – TIN')}
        </div>
        <div className="head-actions">
          <button type="button" className="btn btn-sm btn-accent" disabled={!changed} onClick={() => { const c = saveDefaultInfo(info); setSaved(c); setInfo(c); toast('Đã lưu thông tin mặc định.'); }}>Lưu</button>
          <button type="button" className="btn btn-sm" disabled={!changed} onClick={() => setInfo(saved)}>Huỷ sửa</button>
          <button type="button" className="btn btn-sm" disabled={!Object.values(saved).some(Boolean)} onClick={() => { saveDefaultInfo(EMPTY_INFO); setSaved(EMPTY_INFO); setInfo(EMPTY_INFO); toast('Đã xoá thông tin mặc định.'); }}>Xoá</button>
        </div>
      </section>
    </>
  );
}
