import { aiRun, AiError, getCurrentProfile, setCurrentProfile } from './client';
import { _resetProfiles, addProfile, currentProfiles, initProfiles, MAX_PROFILES, nextFreeId, parseProfiles, removeProfile, renameProfile, saveProfiles, selectActive, serializeProfiles, setEnabled, withLegacy, EMPTY, type ProfilesState } from './profiles';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
const g = globalThis as unknown as { window?: unknown };
const calls: [string, unknown][] = [];
const keys = new Set<string>(); // hồ sơ đang có khoá (giả lập kho mật khẩu)
g.window = { __TAURI__: {
  core: { async invoke(cmd: string, args: { profileId?: string }) { calls.push([cmd, args]); if (cmd === 'ai_key_status') return { hasKey: keys.has(args.profileId ?? 'legacy') }; return { text: '{}', finish: 'STOP', promptTokens: 1, outputTokens: 1, model: 'm' }; } },
  event: { async listen() { return () => {}; } },
} };
type Ed = { ok: true; state: ProfilesState } | { ok: false; message: string };
const must = (e: Ed): ProfilesState => { if (!e.ok) throw new Error(e.message); return e.state; };
const fresh = (): ProfilesState => ({ ...EMPTY, profiles: [] });
const req = { provider: 'gemini' as const, model: 'm', system: 's', user: 'u' };
const sentId = () => (calls[0][1] as { req: { profileId: string } }).req.profileId;

console.log('Hồ sơ khoá AI: thêm / sửa / xoá / chọn');
{
  let s = fresh();
  for (let i = 1; i <= MAX_PROFILES; i++) s = must(addProfile(s, `Cấu hình ${i}`, i === 1 ? 'Project A' : ''));
  ok(s.profiles.length === 5 && s.profiles.map((p) => p.id).join() === 'p1,p2,p3,p4,p5' && s.profiles[0].project === 'Project A', 'thêm đủ 5 cấu hình, id p1..p5');
  const sixth = addProfile(s, 'Thứ sáu');
  ok(!sixth.ok && /tối đa 5/.test((sixth as { message: string }).message), 'thêm cấu hình thứ sáu bị từ chối, có thông báo');
  ok(!addProfile(fresh(), '   ').ok && !addProfile(must(addProfile(fresh(), 'A')), 'a').ok, 'tên trống hoặc trùng bị từ chối');
  s = removeProfile(s, 'p3');
  ok(nextFreeId(s) === 'p3' && s.profiles.length === 4, 'xoá một cấu hình thì có chỗ trống lại');
  ok(!selectActive(s, 'p1', false).ok && !selectActive(s, 'p9' as never, true).ok, 'chọn đang dùng cần có khoá và đúng cấu hình');
  s = must(selectActive(s, 'p1', true));
  ok(s.active === 'p1', 'chọn thủ công cấu hình đang dùng');
  s = setEnabled(s, 'p1', false);
  ok(s.active === null && !selectActive(s, 'p1', true).ok, 'tắt cấu hình đang dùng ⇒ không còn cấu hình đang dùng, KHÔNG tự chuyển sang cấu hình khác');
  const r = renameProfile(s, 'p2', 'Tên mới');
  ok(r.ok && r.state.profiles.find((p) => p.id === 'p2')?.name === 'Tên mới', 'đổi tên');
  s = must(selectActive(setEnabled(s, 'p1', true), 'p2', true));
  s = removeProfile(s, 'p2');
  ok(s.active === null, 'xoá cấu hình đang dùng ⇒ chưa chọn cấu hình nào, không tự chọn thay');
}

console.log('Đọc tệp hồ sơ chịu lỗi + không chứa khoá');
{
  ok(parseProfiles(null).profiles.length === 0 && parseProfiles('không phải json').profiles.length === 0 && parseProfiles('[1,2]').profiles.length === 0, 'tệp thiếu/hỏng/lạ ⇒ rỗng, không ném lỗi');
  const st = parseProfiles(JSON.stringify({ v: 1, active: 'p7', profiles: [{ id: 'p1', name: '  A  ' }, { id: 'p1', name: 'trùng' }, { id: 'xx', name: 'sai' }, { id: 'p2', name: 'B', enabled: false }, null] }));
  ok(st.profiles.length === 2 && st.profiles[0].name === 'A' && st.profiles[1].enabled === false && st.active === null, 'bỏ id sai/trùng, cắt khoảng trắng, active không hợp lệ ⇒ null');
  const off = parseProfiles(JSON.stringify({ v: 1, active: 'p2', profiles: [{ id: 'p2', name: 'B', enabled: false }] }));
  ok(off.active === null, 'cấu hình tắt không thể là đang dùng');
  const json = serializeProfiles(must(addProfile(fresh(), 'Khoá của tôi')));
  ok(!/AIza|"key"/i.test(json) && JSON.parse(json).profiles[0].id === 'p1', 'tệp ghi ra chỉ có id/tên/bật-tắt, không có trường khoá');
}

console.log('Chuyển khoá cũ của beta.27');
{
  ok(withLegacy(fresh(), false).profiles.length === 0, 'không có khoá cũ ⇒ không tạo hồ sơ');
  const w = withLegacy(fresh(), true);
  ok(w.profiles.length === 1 && w.profiles[0].id === 'legacy' && w.profiles[0].name === 'Cấu hình hiện tại' && w.active === 'legacy', 'có khoá cũ ⇒ hồ sơ "Cấu hình hiện tại" dùng ngay, người dùng không nhập lại');
  ok(withLegacy(w, true) === w, 'chạy lại không tạo thêm (idempotent)');
  const user = must(addProfile(fresh(), 'A'));
  const w2 = withLegacy({ ...user, active: 'p1' }, true);
  ok(w2.active === 'p1' && w2.profiles.length === 2, 'đã có cấu hình đang dùng thì không đổi sang khoá cũ');
  let full = fresh();
  for (let i = 0; i < 5; i++) full = must(addProfile(full, `X${i}`));
  ok(withLegacy(full, true) === full, 'đã đủ 5 cấu hình thì không chen thêm (khoá cũ vẫn còn nguyên trong kho)');
}

console.log('Đọc/ghi + cấu hình đang dùng');
{
  let disk: string | null = null; let failSave = false;
  _resetProfiles({ async load() { return disk; }, async save(j: string) { if (failSave) throw new Error('đĩa đầy'); disk = j; } });
  keys.clear(); keys.add('legacy');
  const st = await initProfiles();
  ok(st.active === 'legacy' && disk !== null && JSON.parse(disk).profiles[0].id === 'legacy' && getCurrentProfile() === 'legacy', 'mở lần đầu với khoá cũ: tự có hồ sơ, đã lưu tệp, lượt AI dùng khoá cũ');
  calls.length = 0;
  await aiRun(req);
  ok(sentId() === 'legacy', 'lượt AI gửi đúng profileId đang dùng');
  const next = must(addProfile(currentProfiles(), 'Dự phòng'));
  failSave = true;
  const bad = await saveProfiles({ ...next, active: 'p1' }).then(() => true, () => false);
  ok(!bad && currentProfiles().active === 'legacy' && getCurrentProfile() === 'legacy', 'ghi tệp lỗi ⇒ giữ nguyên cấu hình cũ, không đổi cấu hình đang dùng');
  failSave = false;
  await saveProfiles({ ...next, active: 'p1' });
  calls.length = 0;
  await aiRun(req);
  ok(getCurrentProfile() === 'p1' && sentId() === 'p1', 'chuyển thủ công sang cấu hình mới: lượt sau dùng khoá mới');
  await saveProfiles({ ...next, active: null });
  calls.length = 0;
  const none2 = await aiRun(req).catch((e: unknown) => e);
  ok(none2 instanceof AiError && none2.kind === 'no_key' && calls.length === 0, 'chưa chọn cấu hình nào ⇒ 0 yêu cầu ra ngoài, báo rõ');
  disk = '{hỏng';
  _resetProfiles({ async load() { return disk; }, async save() { throw new Error('x'); } });
  keys.clear();
  const bad2 = await initProfiles();
  ok(bad2.profiles.length === 0, 'tệp hồ sơ hỏng ⇒ coi như chưa có, không sập');
  setCurrentProfile('legacy');
}
_resetProfiles(null);

if (fail) { console.error(`\n${fail} lỗi`); process.exit(1); }
console.log('\nprofiles: đạt hết.');
