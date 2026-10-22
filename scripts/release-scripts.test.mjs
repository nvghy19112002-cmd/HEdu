// Kiểm thử các hàm thuần của script phát hành.
import { parseTag, applyToTauriConf, applyToCargoToml } from './ci-config.mjs';
import { selectToDelete } from './prune-releases.mjs';

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

console.log('Dọn bản cũ');
const tags = ['v0.1.0', 'v0.2.0', 'v0.3.0-beta.1', 'v0.3.0-beta.2', 'channel-stable', 'channel-beta', 'channel-previous'];
const del = selectToDelete(tags, ['0.2.0', '0.1.0', '0.3.0-beta.2']);
ok(del.length === 1 && del[0] === 'v0.3.0-beta.1', 'chỉ xóa beta cũ, giữ chính thức, bản trước, beta mới');
ok(!selectToDelete(tags, []).some((t) => t.startsWith('channel-')), 'không bao giờ xóa các kênh');
ok(selectToDelete(['v1.0.0'], ['1.0.0']).length === 0, 'giữ bản đang dùng');

if (failed) { console.log(`\n${failed} kiểm thử lỗi`); process.exit(1); }
console.log('\nĐạt hết.');
