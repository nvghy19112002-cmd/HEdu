// "Bản nền" của chia sẻ ngân hàng: băm nội dung từng câu ở lần nhận gói trước (xem bankshare.ts). Lưu ở tệp phụ như lịch sử phiên bản.
import { invoke } from './platform';

const KEY = 'share-base';
const WEB = 'hedu.sharebase.v1';

export async function loadShareBase(mode: 'sqlite' | 'web' | 'none'): Promise<Record<string, string>> {
  try {
    const raw = mode === 'sqlite' ? await invoke<string | null>('db_sidecar_get', { key: KEY }) : mode === 'web' ? localStorage.getItem(WEB) : null;
    const o = JSON.parse(raw ?? 'null') as { v?: number; b?: Record<string, unknown> } | null;
    if (!o || o.v !== 1 || !o.b) return {};
    return Object.fromEntries(Object.entries(o.b).filter((e): e is [string, string] => typeof e[1] === 'string'));
  } catch { return {}; }
}

export async function saveShareBase(mode: 'sqlite' | 'web' | 'none', base: Record<string, string>): Promise<void> {
  const json = JSON.stringify({ v: 1, b: base });
  if (mode === 'sqlite') await invoke<void>('db_apply', { upserts: [], deletes: [], meta: [], sidecar: [[KEY, json]] });
  else if (mode === 'web') { try { localStorage.setItem(WEB, json); } catch { /* đầy bộ nhớ trình duyệt thì thôi */ } }
}
