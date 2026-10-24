// Hồ sơ khoá AI (tối đa 5): CHỈ thông tin phụ (tên, bật/tắt, hồ sơ đang dùng). Khoá API nằm trong Windows Credential Manager (Rust),
// không bao giờ đi qua đây. Hồ sơ "legacy" trỏ vào khoá cũ của beta.27 — không chuyển chỗ, không tự xoá.
// Phần thuần (parse/thêm/sửa/xoá) tách khỏi phần đọc ghi để kiểm thử không cần Tauri.
import { invoke, isDesktop } from '../platform';
import { aiKeyStatus, setCurrentProfile } from './client';

export const MAX_PROFILES = 5;
export type ProfileId = 'legacy' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5';
const IDS: readonly ProfileId[] = ['legacy', 'p1', 'p2', 'p3', 'p4', 'p5'];
export const LEGACY_NAME = 'Cấu hình hiện tại';

export interface AiProfile { id: ProfileId; name: string; enabled: boolean; /** ghi chú tên project, tuỳ chọn, chỉ để tự nhớ */ project?: string }
export interface ProfilesState { v: 1; active: ProfileId | null; profiles: AiProfile[] }
export const EMPTY: ProfilesState = { v: 1, active: null, profiles: [] };

export const isProfileId = (x: unknown): x is ProfileId => typeof x === 'string' && (IDS as readonly string[]).includes(x);
const clean = (s: unknown, max: number): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Đọc tệp thông tin hồ sơ, chịu được tệp hỏng/thiếu/lạ: bỏ phần sai, không bao giờ ném lỗi. */
export function parseProfiles(json: string | null): ProfilesState {
  if (!json) return { ...EMPTY, profiles: [] };
  let o: unknown;
  try { o = JSON.parse(json); } catch { return { ...EMPTY, profiles: [] }; }
  const r = o as { active?: unknown; profiles?: unknown };
  const seen = new Set<string>();
  const profiles: AiProfile[] = [];
  if (Array.isArray(r?.profiles)) {
    for (const p of r.profiles as Partial<AiProfile>[]) {
      if (!p || !isProfileId(p.id) || seen.has(p.id) || profiles.length >= MAX_PROFILES) continue;
      const name = clean(p.name, 40) || (p.id === 'legacy' ? LEGACY_NAME : `Cấu hình ${p.id.slice(1)}`);
      const project = clean(p.project, 60);
      seen.add(p.id);
      profiles.push({ id: p.id, name, enabled: p.enabled !== false, ...(project ? { project } : {}) });
    }
  }
  const active = isProfileId(r?.active) && profiles.some((p) => p.id === r.active && p.enabled) ? (r.active as ProfileId) : null;
  return { v: 1, active, profiles };
}

export const serializeProfiles = (s: ProfilesState): string => JSON.stringify({ v: 1, active: s.active, profiles: s.profiles });

/** Có khoá cũ của beta.27 mà chưa có hồ sơ legacy ⇒ tạo hồ sơ "Cấu hình hiện tại" (và chọn làm đang dùng nếu chưa có gì đang dùng). Không đụng khoá. */
export function withLegacy(s: ProfilesState, legacyHasKey: boolean): ProfilesState {
  if (!legacyHasKey || s.profiles.some((p) => p.id === 'legacy') || s.profiles.length >= MAX_PROFILES) return s;
  return { ...s, active: s.active ?? 'legacy', profiles: [{ id: 'legacy', name: LEGACY_NAME, enabled: true }, ...s.profiles] };
}

export const nextFreeId = (s: ProfilesState): ProfileId | null => (['p1', 'p2', 'p3', 'p4', 'p5'] as const).find((id) => !s.profiles.some((p) => p.id === id)) ?? null;

export type Edit = { ok: true; state: ProfilesState; id?: ProfileId } | { ok: false; message: string };

export function addProfile(s: ProfilesState, name: string, project = ''): Edit {
  if (s.profiles.length >= MAX_PROFILES) return { ok: false, message: `Chỉ lưu tối đa ${MAX_PROFILES} cấu hình. Hãy xoá bớt một cấu hình rồi thêm.` };
  const id = nextFreeId(s);
  if (!id) return { ok: false, message: 'Không còn chỗ cho cấu hình mới.' };
  const n = clean(name, 40);
  if (!n) return { ok: false, message: 'Hãy đặt tên gợi nhớ cho cấu hình.' };
  if (s.profiles.some((p) => p.name.toLowerCase() === n.toLowerCase())) return { ok: false, message: 'Đã có cấu hình trùng tên, hãy đặt tên khác.' };
  const pr = clean(project, 60);
  return { ok: true, id, state: { ...s, profiles: [...s.profiles, { id, name: n, enabled: true, ...(pr ? { project: pr } : {}) }] } };
}

export function renameProfile(s: ProfilesState, id: ProfileId, name: string): Edit {
  const n = clean(name, 40);
  if (!n) return { ok: false, message: 'Tên không được để trống.' };
  if (s.profiles.some((p) => p.id !== id && p.name.toLowerCase() === n.toLowerCase())) return { ok: false, message: 'Đã có cấu hình trùng tên.' };
  return { ok: true, state: { ...s, profiles: s.profiles.map((p) => (p.id === id ? { ...p, name: n } : p)) } };
}

/** Tắt hồ sơ đang dùng ⇒ không còn hồ sơ đang dùng (người dùng chọn lại bằng tay; không tự chuyển sang hồ sơ khác). */
export function setEnabled(s: ProfilesState, id: ProfileId, enabled: boolean): ProfilesState {
  return { ...s, active: !enabled && s.active === id ? null : s.active, profiles: s.profiles.map((p) => (p.id === id ? { ...p, enabled } : p)) };
}

export function removeProfile(s: ProfilesState, id: ProfileId): ProfilesState {
  return { ...s, active: s.active === id ? null : s.active, profiles: s.profiles.filter((p) => p.id !== id) };
}

/** Chọn hồ sơ đang dùng bằng tay: phải đang bật và đã có khoá. */
export function selectActive(s: ProfilesState, id: ProfileId, hasKey: boolean): Edit {
  const p = s.profiles.find((x) => x.id === id);
  if (!p) return { ok: false, message: 'Không có cấu hình này.' };
  if (!p.enabled) return { ok: false, message: 'Cấu hình đang tắt — hãy bật lại trước.' };
  if (!hasKey) return { ok: false, message: 'Cấu hình này chưa có khoá API.' };
  return { ok: true, state: { ...s, active: id } };
}

// ---------------- đọc/ghi ----------------

export interface ProfilesBackend { load(): Promise<string | null>; save(json: string): Promise<void> }
const desktopBackend: ProfilesBackend = {
  load: () => invoke<string | null>('ai_profiles_load'),
  save: (json) => invoke<void>('ai_profiles_save', { json }),
};
let backend: ProfilesBackend | null = null;
let cache: ProfilesState | null = null;
const be = (): ProfilesBackend => backend ?? desktopBackend;

/** Chỉ dùng trong kiểm thử. */
export function _resetProfiles(b: ProfilesBackend | null): void { backend = b; cache = null; setCurrentProfile('legacy'); }

export const currentProfiles = (): ProfilesState => cache ?? EMPTY;

/** Ghi trước, chỉ khi ghi xong mới đổi bộ nhớ và "hồ sơ đang dùng" của lớp gọi AI. Lỗi ghi ⇒ ném lỗi, trạng thái cũ giữ nguyên. */
export async function saveProfiles(s: ProfilesState): Promise<void> {
  await be().save(serializeProfiles(s));
  cache = s;
  setCurrentProfile(s.active);
}

/** Nạp (một lần), nhận khoá cũ của beta.27 thành hồ sơ "Cấu hình hiện tại" nếu có. `force` = đọc lại từ đĩa. */
export async function initProfiles(force = false): Promise<ProfilesState> {
  if (cache && !force) return cache;
  if (!backend && !isDesktop()) { cache = EMPTY; return cache; }
  let st: ProfilesState;
  try { st = parseProfiles(await be().load()); } catch { st = { ...EMPTY, profiles: [] }; }
  let legacy = false;
  try { legacy = (await aiKeyStatus('legacy')).hasKey; } catch { /* kho mật khẩu lỗi: không tạo hồ sơ, không báo thành công giả */ }
  const next = withLegacy(st, legacy);
  if (next !== st) { try { await be().save(serializeProfiles(next)); } catch { /* lần mở sau sẽ thử lại; trong phiên vẫn dùng được */ } }
  cache = next;
  setCurrentProfile(next.active);
  return next;
}
