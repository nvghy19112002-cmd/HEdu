// Màn chặn khi không đọc được dữ liệu lúc mở app. Không bao giờ ghi đè dữ liệu chưa hiểu.
import { useState } from 'react';
import { IcAlert } from './Icons';
import type { BootResult } from '../lib/store';
import { CURRENT_SCHEMA } from '../lib/migrate';
import { isDesktop } from '../lib/platform';
import { checkUpdate, friendlyError, getChannel, installUpdate, restoreBackup, type Progress } from '../lib/updates';

export function BootGate({ boot }: { boot: Exclude<BootResult, { ok: true }> }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [prog, setProg] = useState<Progress | null>(null);
  const desktop = isDesktop();

  const restore = async () => {
    setMsg(null);
    try { await restoreBackup(); } catch (e) { setMsg(friendlyError(e, 'restore')); }
  };
  const update = async () => {
    setMsg(null);
    try {
      const u = await checkUpdate(getChannel());
      if (!u) { setMsg('Chưa có bản mới hơn. Hãy khôi phục dữ liệu trước cập nhật, hoặc báo người phát triển.'); return; }
      await installUpdate(getChannel(), setProg);
    } catch (e) { setMsg(friendlyError(e, 'install')); }
  };

  return (
    <div className="boot-gate">
      <div className="note bad" role="alert" style={{ maxWidth: 640 }}>
        <IcAlert />
        <div className="note-body">
          {boot.kind === 'schema-newer' ? (
            <>
              <b>Dữ liệu được lưu bởi một phiên bản mới hơn</b>
              <span>Dữ liệu thuộc cấu trúc {boot.found}, còn app này chỉ hiểu đến cấu trúc {CURRENT_SCHEMA}. Thường gặp khi bạn vừa quay lại bản cũ. HEdu chưa mở và chưa ghi gì để bảo vệ dữ liệu của bạn.</span>
              <span>Chọn một trong hai cách: cập nhật lại lên bản mới, hoặc khôi phục dữ liệu về lúc trước khi cập nhật.</span>
            </>
          ) : (
            <>
              <b>Không đọc được dữ liệu</b>
              <span>{boot.message}</span>
              <span>HEdu chưa ghi gì để tránh làm mất thêm. Bạn có thể khôi phục bản sao lưu trước lần cập nhật gần nhất.</span>
            </>
          )}
          {desktop && (
            <div className="head-actions" style={{ marginTop: 10 }}>
              {boot.kind === 'schema-newer' && <button type="button" className="btn btn-dark btn-sm" onClick={() => void update()}>Cập nhật app lên bản mới</button>}
              <button type="button" className="btn btn-outline btn-sm" onClick={() => void restore()}>Khôi phục dữ liệu trước cập nhật</button>
            </div>
          )}
          {prog && <span>Đang tải… {Math.round((prog.downloaded / (prog.total || prog.downloaded || 1)) * 100)}%</span>}
          {msg && <span style={{ fontWeight: 600 }}>{msg}</span>}
        </div>
      </div>
    </div>
  );
}
