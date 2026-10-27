// Kiểm thử các hàm thuần của script phát hành.
import { parseTag, applyToTauriConf, applyToCargoToml, applyToCargoLock } from './ci-config.mjs';
import { compareNewestFirst, parseVersionTag, planPrune } from './prune-releases.mjs';

let failed = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) failed++; };
const throws = (f) => { try { f(); return false; } catch { return true; } };

console.log('Tên phiên bản (tag)');
ok(parseTag('v1.2.3').channel === 'stable' && parseTag('v1.2.3').version === '1.2.3', 'v1.2.3 → kênh chính thức');
ok(parseTag('v0.3.0-beta.2').channel === 'beta', 'v0.3.0-beta.2 → kênh beta');
ok(throws(() => parseTag('v1.2')) && throws(() => parseTag('beta')) && throws(() => parseTag('v1.2.3-rc.1')), 'tên sai bị từ chối');

console.log('Gắn cấu hình');
const conf = { version: '0.1.0', plugins: { updater: { pubkey: 'x', endpoints: [] } } };
const out = applyToTauriConf(conf, { version: '0.2.0', repo: 'a/b', pubkey: 'KEY' });
ok(out.version === '0.2.0' && out.plugins.updater.pubkey === 'KEY' && out.plugins.updater.endpoints[0].includes('a/b/releases/download/channel-stable'), 'ghi phiên bản, khóa, địa chỉ kênh');
ok(conf.version === '0.1.0', 'không sửa bản gốc');
ok(applyToCargoToml('[package]\nname = "x"\nversion = "0.1.0"\n[dependencies]\nfoo = { version = "2" }\n', '0.2.0').includes('version = "0.2.0"\n[dependencies]\nfoo = { version = "2" }'), 'chỉ đổi version của gói chính');
const lock = '[[package]]\nname = "a"\nversion = "1.0.0"\n\n[[package]]\nname = "hedu"\nversion = "0.1.0"\n';
const lock2 = applyToCargoLock(lock, '0.1.0-beta.34');
ok(lock2.includes('name = "hedu"\nversion = "0.1.0-beta.34"') && lock2.includes('name = "a"\nversion = "1.0.0"'), 'Cargo.lock: chỉ đổi phiên bản của gói hedu');

console.log('Dọn bản cũ: sắp xếp phiên bản');
ok(parseVersionTag('v0.1.0-beta.34')?.beta === 34 && parseVersionTag('v1.2.3')?.beta === null && parseVersionTag('channel-beta') === null && parseVersionTag('v1.2') === null, 'đọc tag phiên bản; tag kênh và tag lạ không phải bản phát hành');
ok(['v0.1.0-beta.9', 'v0.1.0', 'v0.1.0-beta.34', 'v0.2.0-beta.1', 'v0.1.1'].sort(compareNewestFirst).join() === 'v0.2.0-beta.1,v0.1.1,v0.1.0,v0.1.0-beta.34,v0.1.0-beta.9', 'xếp mới → cũ: số lõi, chính thức trước beta, beta theo SỐ (9 < 34)');

console.log('Dọn bản cũ: kế hoạch');
const ch = (stable, previous, beta) => [
  { channel: 'channel-stable', ...(stable ? { state: 'ok', version: stable } : { state: 'empty' }) },
  { channel: 'channel-previous', ...(previous ? { state: 'ok', version: previous } : { state: 'empty' }) },
  { channel: 'channel-beta', ...(beta ? { state: 'ok', version: beta } : { state: 'empty' }) },
];
const kept = (r) => r.keep.map((k) => k.tag);
{
  // TÌNH HUỐNG THẬT: chỉ có kênh beta; vừa phát hành beta.35, beta.34 phải CÒN
  const tags = ['v0.1.0-beta.35', 'v0.1.0-beta.34', 'v0.1.0-beta.33', 'v0.1.0-beta.32', 'v0.1.0-beta.31', 'channel-stable', 'channel-previous', 'channel-beta'];
  const r = planPrune(tags, ch(null, null, '0.1.0-beta.35'), { protectedTags: ['v0.1.0-beta.34'] });
  ok(!r.abort && kept(r).includes('v0.1.0-beta.34') && !r.remove.includes('v0.1.0-beta.34'), 'chỉ có beta, không có stable/previous: beta.34 KHÔNG bị xóa khi có beta.35');
  ok(r.remove.join() === 'v0.1.0-beta.32,v0.1.0-beta.31' && kept(r).join() === 'v0.1.0-beta.35,v0.1.0-beta.34,v0.1.0-beta.33', 'giữ 3 bản mới nhất, chỉ xóa bản cũ hơn');
  ok(!r.remove.some((t) => t.startsWith('channel-')), 'không bao giờ xóa các kênh');
  // không có ghim: vẫn giữ nhờ luật "N bản mới nhất"
  const r2 = planPrune(tags, ch(null, null, '0.1.0-beta.35'));
  ok(kept(r2).includes('v0.1.0-beta.34'), 'không cần ghim cũng không xóa bản beta ngay trước');
  // ghim giữ cả bản rất cũ
  const r3 = planPrune(tags, ch(null, null, '0.1.0-beta.35'), { protectedTags: ['v0.1.0-beta.31'] });
  ok(kept(r3).includes('v0.1.0-beta.31') && r3.keep.find((k) => k.tag === 'v0.1.0-beta.31').why.includes('ghim'), 'bản được ghim không bao giờ bị xóa dù rất cũ');
  // chạy lại cùng phiên bản: kết quả y hệt
  ok(JSON.stringify(planPrune(tags, ch(null, null, '0.1.0-beta.35'))) === JSON.stringify(r2), 'chạy lại cùng phiên bản cho cùng kết quả');
  // --keep bản vừa phát hành
  const r4 = planPrune(['v0.1.0-beta.36', ...tags], ch(null, null, '0.1.0-beta.35'), { extraKeep: ['v0.1.0-beta.36'] });
  ok(kept(r4).includes('v0.1.0-beta.36'), 'bản vừa phát hành luôn được giữ');
}
{
  // các kênh đều có: chính thức, bản trước, beta mới
  const tags = ['v0.1.0', 'v0.2.0', 'v0.3.0-beta.1', 'v0.3.0-beta.2', 'channel-stable'];
  const r = planPrune(tags, ch('0.2.0', '0.1.0', '0.3.0-beta.2'), { keepLatest: 1 });
  ok(r.remove.join() === 'v0.3.0-beta.1' && kept(r).includes('v0.1.0') && kept(r).includes('v0.2.0'), 'giữ chính thức, bản trước, beta mới; chỉ xóa beta cũ khi chỉ giữ 1 bản mới nhất');
  ok(r.keep.find((k) => k.tag === 'v0.2.0').why.includes('channel-stable'), 'lý do giữ ghi rõ kênh nào trỏ tới');
}
{
  // KHÔNG xác định được bản cần giữ ⇒ không xóa gì
  const tags = ['v0.1.0-beta.35', 'v0.1.0-beta.34', 'v0.1.0-beta.33', 'v0.1.0-beta.32'];
  const bad = [{ channel: 'channel-stable', state: 'empty' }, { channel: 'channel-previous', state: 'error' }, { channel: 'channel-beta', state: 'ok', version: '0.1.0-beta.35' }];
  const r = planPrune(tags, bad);
  ok(r.abort && r.remove.length === 0, 'một kênh không đọc được ⇒ dừng, không xóa gì');
  const none = planPrune(tags, ch(null, null, null));
  ok(none.abort && none.remove.length === 0, 'không kênh nào có bản ⇒ dừng, không xóa gì');
  const empty = planPrune([], ch(null, null, '0.1.0-beta.35'));
  ok(empty.abort && empty.remove.length === 0, 'danh sách bản phát hành rỗng ⇒ dừng');
  const missing = planPrune(tags, ch(null, null, '0.1.0-beta.99'));
  ok(missing.abort && missing.remove.length === 0, 'kênh trỏ tới bản không có thật ⇒ dừng, không xóa gì');
  const badver = planPrune(tags, ch(null, null, 'abc'));
  ok(badver.abort && badver.remove.length === 0, 'kênh ghi phiên bản không hợp lệ ⇒ dừng');
  const badN = planPrune(tags, ch(null, null, '0.1.0-beta.35'), { keepLatest: 0 });
  ok(badN.abort && badN.remove.length === 0, 'số bản giữ không hợp lệ ⇒ dừng');
  ok(planPrune(['v0.1.0-beta.35', 'v0.1.0-beta.35', 'v0.1.0-beta.34'], ch(null, null, '0.1.0-beta.35')).keep.length === 2, 'tag lặp chỉ tính một lần');
}
{
  // luôn còn ít nhất một bản; không xóa tag không phải phiên bản
  const r = planPrune(['v0.1.0-beta.1', 'channel-beta', 'lung-tung'], ch(null, null, '0.1.0-beta.1'));
  ok(r.remove.length === 0 && !r.abort, 'tag lạ và tag kênh không bị đụng tới; bản duy nhất được giữ');
}

if (failed) { console.log(`\n${failed} kiểm thử lỗi`); process.exit(1); }
console.log('\nĐạt hết.');
