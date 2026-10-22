// Dọn các bản phát hành cũ để kho không phình ra.
// Giữ đúng những bản còn được kênh nào đó trỏ tới: chính thức, bản trước, beta (tối đa 3 bản cài).
// Dùng:  node scripts/prune-releases.mjs <chủ/kho>        (thêm --dry để chỉ xem, không xóa)
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const CHANNELS = ['channel-stable', 'channel-previous', 'channel-beta'];

/** tags: mọi tag bản phát hành; keepVersions: các phiên bản còn được dùng. Trả về tag cần xóa. */
export function selectToDelete(tags, keepVersions) {
  const keep = new Set(keepVersions.filter(Boolean).map((v) => `v${v}`));
  return tags.filter((t) => /^v\d/.test(t) && !keep.has(t));
}

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' });

function manifestVersion(repo, channel) {
  try {
    const body = gh('release', 'download', channel, '--repo', repo, '--pattern', 'latest.json', '--output', '-');
    return JSON.parse(body).version ?? null;
  } catch {
    return null;
  }
}

function main() {
  const repo = process.argv[2];
  const dry = process.argv.includes('--dry');
  if (!repo) throw new Error('Cách dùng: node scripts/prune-releases.mjs <chủ/kho> [--dry]');
  const keepVersions = CHANNELS.map((c) => manifestVersion(repo, c));
  console.log('Đang giữ:', keepVersions.map((v) => (v ? `v${v}` : '(trống)')).join(', '));
  if (keepVersions.every((v) => !v)) { console.log('Không đọc được kênh nào, không xóa gì để an toàn.'); return; }
  const tags = JSON.parse(gh('release', 'list', '--repo', repo, '--limit', '200', '--json', 'tagName')).map((r) => r.tagName);
  const doomed = selectToDelete(tags, keepVersions);
  for (const t of doomed) {
    console.log(`${dry ? '[xem thử] ' : ''}Xóa ${t}`);
    if (!dry) gh('release', 'delete', t, '--repo', repo, '--yes', '--cleanup-tag');
  }
  if (!doomed.length) console.log('Không có gì cần dọn.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
