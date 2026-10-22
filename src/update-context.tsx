// Giữ trạng thái "có bản mới không" cho toàn app (để hiện chấm báo ở thanh bên và màn Hệ thống).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { isDesktop } from './lib/platform';
import { appInfo, checkUpdate, friendlyError, getChannel, markChecked, setChannel as saveChannel, shouldAutoCheck, type AppInfo, type Channel, type UpdateInfo } from './lib/updates';

export interface UpdateApi {
  info: AppInfo | null;
  channel: Channel;
  setChannel(c: Channel): void;
  available: UpdateInfo | null;
  checking: boolean;
  checkedAt: number | null;
  error: string | null;
  check(): Promise<void>;
}

const Ctx = createContext<UpdateApi | null>(null);

export function useUpdates(): UpdateApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('UpdateProvider missing');
  return v;
}

export function UpdateProvider({ children, onFound }: { children: React.ReactNode; onFound?: (u: UpdateInfo) => void }) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [channel, setCh] = useState<Channel>(getChannel());
  const [available, setAvailable] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const run = useCallback(async (ch: Channel, silent: boolean) => {
    if (!isDesktop()) return;
    const my = ++seq.current;
    setChecking(true);
    setError(null);
    try {
      const u = await checkUpdate(ch);
      if (my !== seq.current) return;
      markChecked();
      setCheckedAt(Date.now());
      setAvailable(u);
      if (u && silent) onFound?.(u);
    } catch (e) {
      if (my !== seq.current) return;
      if (!silent) setError(friendlyError(e, 'check'));
    } finally {
      if (my === seq.current) setChecking(false);
    }
  }, [onFound]);

  useEffect(() => {
    if (!isDesktop()) return;
    appInfo().then(setInfo).catch(() => {});
    if (!shouldAutoCheck()) return;
    const t = setTimeout(() => { void run(getChannel(), true); }, 4000); // sau khi app đã sẵn sàng, không làm chậm lúc mở
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const api = useMemo<UpdateApi>(() => ({
    info,
    channel,
    setChannel(c) { saveChannel(c); setCh(c); setAvailable(null); setError(null); void run(c, false); },
    available,
    checking,
    checkedAt,
    error,
    check: () => run(channel, false),
  }), [info, channel, available, checking, checkedAt, error, run]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
