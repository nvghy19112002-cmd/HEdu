// Gắn số phiên bản, kho GitHub và khóa công khai vào các file cấu hình trước khi đóng gói.
// Dùng trong workflow:  node scripts/ci-config.mjs <phiên-bản> <chủ/kho>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SEMVER = /^\d+\.\d+\.\d+(-(beta)\.\d+)?$/;

/** Tách "v0.2.0-beta.1" thành phiên bản + kênh. Chỉ nhận dạng x.y.z hoặc x.y.z-beta.N. */
export function parseTag(tag) {
  const version = String(tag).replace(/^v/, '');
  if (!SEMVER.test(version)) throw new Error(`Tên phiên bản không hợp lệ: "${tag}". Dùng dạng v1.2.3 hoặc v1.2.3-beta.1`);
  return { version, channel: version.includes('-beta.') ? 'beta' : 'stable' };
}

export function applyToTauriConf(conf, { version, repo, pubkey }) {
  const c = structuredClone(conf);
  c.version = version;
  c.plugins.updater.pubkey = pubkey;
  c.plugins.updater.endpoints = [`https://github.com/${repo}/releases/download/channel-stable/latest.json`];
  return c;
}

export function applyToCargoToml(text, version) {
  return text.replace(/^version = ".*"$/m, `version = "${version}"`);
}

/** Cargo.lock ghi sẵn phiên bản của gói hedu; đổi phiên bản trong Cargo.toml mà không đổi ở đây thì `--locked` báo lỗi. */
export function applyToCargoLock(text, version) {
  return text.replace(/(\[\[package\]\]\r?\nname = "hedu"\r?\nversion = )".*"/, `$1"${version}"`);
}

function main() {
  const [, , tag, repo] = process.argv;
  if (!tag || !repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Cách dùng: node scripts/ci-config.mjs <tag> <chủ/kho>');
  const { version } = parseTag(tag);
  const pubFile = 'src-tauri/updater.pub';
  const pubkey = existsSync(pubFile) ? readFileSync(pubFile, 'utf8').trim() : '';
  if (!pubkey) throw new Error('Thiếu file src-tauri/updater.pub (khóa công khai). Xem HUONG-DAN-PHAT-HANH.md, phần "Tạo khóa ký".');

  const confPath = 'src-tauri/tauri.conf.json';
  writeFileSync(confPath, JSON.stringify(applyToTauriConf(JSON.parse(readFileSync(confPath, 'utf8')), { version, repo, pubkey }), null, 2) + '\n');
  writeFileSync('src-tauri/Cargo.toml', applyToCargoToml(readFileSync('src-tauri/Cargo.toml', 'utf8'), version));
  const lockPath = 'src-tauri/Cargo.lock';
  if (existsSync(lockPath)) writeFileSync(lockPath, applyToCargoLock(readFileSync(lockPath, 'utf8'), version));
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  pkg.version = version;
  writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  console.log(`Đã gắn phiên bản ${version} cho ${repo}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
