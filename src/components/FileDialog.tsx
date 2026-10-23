// Hộp hiển thị file xuất ra (.tex, sao lưu): xem, sao chép, lưu thành (đặt tên + chọn thư mục).
// Trong bản xem thử trên web, việc tải file có thể bị trình xem chặn, nên luôn có nút Sao chép.
import { useEffect, useRef } from 'react';
import { downloadText, type FileOut } from '../app-context';
import { saveTextFile } from '../lib/savefile';

export function FileDialog({ file, onClose, onToast }: { file: FileOut; onClose(): void; onToast(m: string): void }) {
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(file.text);
      onToast('Đã sao chép vào bộ nhớ tạm.');
    } catch {
      area.current?.focus();
      area.current?.select();
      onToast('Đã chọn toàn bộ — nhấn Ctrl C để sao chép.');
    }
  };

  const save = async () => {
    const r = await saveTextFile(file.name, file.text, () => downloadText(file.name, file.text, file.mime));
    if (r.kind === 'saved') onToast(`Đã lưu: ${r.path}`);
    else if (r.kind === 'error') onToast(`Không lưu được file (${r.message}). Hãy dùng nút Sao chép rồi dán vào file mới.`);
    else if (r.kind === 'downloaded') onToast('Đã gửi file cho trình duyệt tải về.');
  };

  const lines = file.text.split('\n').length;
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette filedlg" role="dialog" aria-modal="true" aria-label={file.title}>
        <div className="filedlg-head">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <b>{file.title}</b>
            <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{file.name} · {lines} dòng</span>
          </div>
          <button type="button" className="ico" aria-label="Đóng" onClick={onClose}>×</button>
        </div>
        <textarea ref={area} readOnly value={file.text} aria-label="Nội dung file" spellCheck={false} />
        <div className="filedlg-foot">
          <button type="button" className="btn btn-sm" onClick={() => { void save(); }}>Lưu thành…</button>
          <button type="button" className="btn btn-sm btn-dark" onClick={copy} autoFocus>Sao chép</button>
        </div>
      </div>
    </div>
  );
}
