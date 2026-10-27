// Dọn các bản phát hành cũ để kho không phình ra — nhưng KHÔNG BAO GIỜ làm mất bản quay lại.
// Giữ: (1) mọi bản còn được kênh nào trỏ tới; (2) N bản mới nhất (mặc định 3), nên bản beta ngay trước luôn còn để quay lại;
//      (3) bản được ghim trong scripts/giu-lai-phat-hanh.json; (4) bản vừa phát hành (--keep).
// Không xóa gì khi không xác định chắc các bản cần giữ: không đọc được một kênh, kênh trỏ tới bản không có thật, danh sách bản rỗng,
// và khi tệp chính sách ghim (scripts/giu-lai-phat-hanh.json) THIẾU hoặc KHÔNG HỢP LỆ (không âm thầm bỏ chính sách ghim).
// Dùng:  node scripts/prune-releases.mjs <chủ/kho> [--dry] [--keep v0.1.0-beta.35] [--keep-latest 3]
//        (--dry chỉ in ra bản giữ/xóa và lý do, không xóa gì)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const CHANNELS = ['channel-stable', 'channel-previous', 'channel-beta'];
export const KEEP_LATEST = 3;
const VERSION_TAG = /^v(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/;

/** Tách tag phiên bản (v1.2.3 hoặc v1.2.3-beta.4). Tag khác (kênh, tên lạ) trả null. */
export function parseVersionTag(tag) {
  const m = VERSION_TAG.exec(String(tag));
  return m ? { major: +m[1], minor: +m[2], patch: +m[3], beta: m[4] === undefined ? null : +m[4] } : null;
}

/** So sánh để xếp MỚI → CŨ: số lõi lớn hơn trước; cùng số lõi thì bản chính thức đứng trước mọi beta, beta số lớn hơn đứng trước. */
export function compareNewestFirst(a, b) {
  const x = parseVersionTag(a), y = parseVersionTag(b);
  for (const k of ['major', 'minor', 'patch']) if (x[k] !== y[k]) return y[k] - x[k];
  const bx = x.beta === null ? Infinity : x.beta, by = y.beta === null ? Infinity : y.beta;
  return by === bx ? 0 : by > bx ? 1 : -1;
}

/**
 * Kế hoạch dọn. `channels` = [{ channel, state: 'ok' | 'empty' | 'error', version? }]. Trả { keep: [{tag, why}], remove: [tag], abort?: lý do }.
 * `abort` có mặt ⇒ KHÔNG được xóa gì (remove luôn rỗng).
 */
export function planPrune(tags, channels, { protectedTags, extraKeep = [], keepLatest = KEEP_LATEST } = {}) {
  const versionTags = [...new Set(tags.filter((t) => parseVersionTag(t)))].sort(compareNewestFirst);
  const stop = (abort) => ({ keep: versionTags.map((tag) => ({ tag, why: 'không xóa (dừng an toàn)' })), remove: [], abort });
  // chính sách ghim PHẢI được cung cấp (mảng, có thể rỗng): thiếu ⇒ không biết bản nào cần bảo vệ ⇒ không xóa gì
  if (!Array.isArray(protectedTags) || protectedTags.some((t) => !parseVersionTag(t))) return stop('chính sách ghim bản phát hành không được cung cấp hoặc không hợp lệ');
  if (!Number.isInteger(keepLatest) || keepLatest < 1) return stop('số bản mới nhất cần giữ không hợp lệ');
  if (!versionTags.length) return stop('không có bản phát hành nào để xét');
  const bad = channels.filter((c) => c.state === 'error');
  if (bad.length) return stop(`không đọc được kênh ${bad.map((c) => c.channel).join(', ')}`);
  if (channels.every((c) => c.state !== 'ok')) return stop('không kênh nào trỏ tới bản nào, không xác định được bản cần giữ');
  const why = new Map();
  const mark = (tag, reason) => { if (!why.has(tag)) why.set(tag, reason); };
  for (const c of channels) {
    if (c.state !== 'ok') continue;
    const tag = `v${c.version}`;
    if (!parseVersionTag(tag)) return stop(`kênh ${c.channel} ghi phiên bản không hợp lệ: ${c.version}`);
    if (!versionTags.includes(tag)) return stop(`kênh ${c.channel} trỏ tới ${tag} nhưng không có bản phát hành này`);
    mark(tag, `kênh ${c.channel} đang trỏ tới`);
  }
  for (const t of extraKeep) if (versionTags.includes(t)) mark(t, 'bản vừa phát hành');
  for (const t of protectedTags) if (versionTags.includes(t)) mark(t, 'được ghim bảo vệ');
  versionTags.slice(0, keepLatest).forEach((t) => mark(t, `trong ${keepLatest} bản mới nhất (để quay lại)`));
  return { keep: versionTags.filter((t) => why.has(t)).map((tag) => ({ tag, why: why.get(tag) })), remove: versionTags.filter((t) => !why.has(t)) };
}

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' });

/** Trạng thái một kênh: ok (có latest.json đọc được), empty (kênh có thật nhưng chưa có tệp — hợp lệ), error (không biết). */
function readChannel(repo, channel) {
  try {
    const assets = JSON.parse(gh('release', 'view', channel, '--repo', repo, '--json', 'assets')).assets ?? [];
    if (!assets.some((a) => a.name === 'latest.json')) return { channel, state: 'empty' };
    const version = JSON.parse(gh('release', 'download', channel, '--repo', repo, '--pattern', 'latest.json', '--output', '-')).version;
    return typeof version === 'string' && version ? { channel, state: 'ok', version } : { channel, state: 'error' };
  } catch {
    return { channel, state: 'error' };
  }
}

/**
 * Đọc nội dung tệp chính sách ghim. `text` = null/undefined khi tệp thiếu. Trả { ok: true, tags } hoặc { ok: false, reason }.
 * Hợp lệ: JSON là đối tượng có `tags` là MẢNG (được rỗng) và mọi phần tử là tag phiên bản đúng dạng (v1.2.3 hoặc v1.2.3-beta.4).
 */
export function parseProtected(text) {
  if (text === null || text === undefined) return { ok: false, reason: 'thiếu tệp scripts/giu-lai-phat-hanh.json' };
  let j;
  try { j = JSON.parse(text); } catch { return { ok: false, reason: 'scripts/giu-lai-phat-hanh.json không phải JSON hợp lệ' }; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return { ok: false, reason: 'scripts/giu-lai-phat-hanh.json phải là một đối tượng' };
  if (!Array.isArray(j.tags)) return { ok: false, reason: 'scripts/giu-lai-phat-hanh.json thiếu mảng "tags"' };
  const bad = j.tags.filter((t) => typeof t !== 'string' || !parseVersionTag(t));
  if (bad.length) return { ok: false, reason: `scripts/giu-lai-phat-hanh.json có tag không hợp lệ: ${bad.map(String).join(', ')}` };
  return { ok: true, tags: [...new Set(j.tags)] };
}

function readProtected() {
  const f = join(dirname(fileURLToPath(import.meta.url)), 'giu-lai-phat-hanh.json');
  try { return parseProtected(existsSync(f) ? readFileSync(f, 'utf8') : null); } catch (e) { return { ok: false, reason: `không đọc được scripts/giu-lai-phat-hanh.json (${e instanceof Error ? e.message : e})` }; }
}

function main() {
  const args = process.argv.slice(2);
  const valueOf = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const repo = args.find((a, i) => !a.startsWith('--') && !['--keep', '--keep-latest'].includes(args[i - 1] ?? ''));
  const dry = args.includes('--dry');
  const extraKeep = args.flatMap((a, i) => (a === '--keep' && args[i + 1] ? [args[i + 1]] : []));
  const keepLatest = valueOf('--keep-latest') === undefined ? KEEP_LATEST : Number(valueOf('--keep-latest'));
  if (!repo) throw new Error('Cách dùng: node scripts/prune-releases.mjs <chủ/kho> [--dry] [--keep v0.1.0-beta.35] [--keep-latest 3]');
  // kiểm chính sách ghim TRƯỚC mọi thao tác: hỏng/thiếu ⇒ dừng, không xóa gì (thoát mã 1 để lỗi cấu hình lộ rõ trên CI)
  const prot = readProtected();
  if (!prot.ok) { console.log(`::error::DỪNG, không xóa gì: ${prot.reason}.`); process.exitCode = 1; return; }
  const channels = CHANNELS.map((c) => readChannel(repo, c));
  console.log('Kênh:', channels.map((c) => `${c.channel}=${c.state === 'ok' ? `v${c.version}` : c.state === 'empty' ? '(trống)' : '(KHÔNG ĐỌC ĐƯỢC)'}`).join(', '));
  const tags = JSON.parse(gh('release', 'list', '--repo', repo, '--limit', '200', '--json', 'tagName')).map((r) => r.tagName);
  const plan = planPrune(tags, channels, { protectedTags: prot.tags, extraKeep, keepLatest });
  for (const k of plan.keep) console.log(`Giữ ${k.tag} — ${k.why}`);
  if (plan.abort) { console.log(`DỪNG, không xóa gì: ${plan.abort}.`); return; }
  for (const t of plan.remove) {
    console.log(`${dry ? '[xem thử] ' : ''}Xóa ${t}`);
    if (!dry) gh('release', 'delete', t, '--repo', repo, '--yes', '--cleanup-tag');
  }
  if (!plan.remove.length) console.log('Không có gì cần dọn.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
