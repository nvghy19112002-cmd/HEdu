import assert from 'node:assert/strict';
import { dataSig, DEFAULT_PREFS, isDue, parsePrefs } from './autobackup';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const H = 3600_000;

console.log('Sao lưu tự động');
t('đọc cấu hình: hỏng/thiếu ⇒ mặc định (mỗi ngày); giá trị lạ bị bỏ', () => {
  assert.deepEqual(parsePrefs(null), DEFAULT_PREFS);
  assert.deepEqual(parsePrefs('{hong'), DEFAULT_PREFS);
  assert.deepEqual(parsePrefs('{"freq":"khac"}'), DEFAULT_PREFS);
  assert.deepEqual(parsePrefs('{"freq":"weekly","last":123,"sig":"a"}'), { freq: 'weekly', last: 123, sig: 'a' });
  assert.equal(parsePrefs('{"freq":"off","last":-5}').last, 0);
});
t('đến hạn theo lịch; chưa từng sao lưu ⇒ đến hạn; tắt ⇒ không bao giờ; đồng hồ lùi ⇒ đến hạn', () => {
  const now = 1_000_000 * H;
  assert.equal(isDue({ freq: 'daily', last: 0, sig: '' }, now), true);
  assert.equal(isDue({ freq: 'daily', last: now - 10 * H, sig: '' }, now), false);
  assert.equal(isDue({ freq: 'daily', last: now - 21 * H, sig: '' }, now), true);
  assert.equal(isDue({ freq: 'weekly', last: now - 3 * 24 * H, sig: '' }, now), false);
  assert.equal(isDue({ freq: 'weekly', last: now - 7 * 24 * H, sig: '' }, now), true);
  assert.equal(isDue({ freq: 'off', last: 0, sig: '' }, now), false);
  assert.equal(isDue({ freq: 'daily', last: now + 5 * H, sig: '' }, now), true);
});
t('dấu dữ liệu đổi khi thêm/sửa câu hoặc đề, không đổi khi giữ nguyên', () => {
  const a = dataSig({ count: 100, maxUpdated: 5 }, [{ updatedAt: '2026-11-01T10:00:00Z' }, { updatedAt: '2026-11-03T08:00:00Z' }]);
  assert.equal(a, dataSig({ count: 100, maxUpdated: 5 }, [{ updatedAt: '2026-11-03T08:00:00Z' }, { updatedAt: '2026-11-01T10:00:00Z' }]));
  assert.notEqual(a, dataSig({ count: 101, maxUpdated: 5 }, [{ updatedAt: '2026-11-03T08:00:00Z' }, { updatedAt: '2026-11-01T10:00:00Z' }]));
  assert.notEqual(a, dataSig({ count: 100, maxUpdated: 6 }, [{ updatedAt: '2026-11-03T08:00:00Z' }, { updatedAt: '2026-11-01T10:00:00Z' }]));
  assert.notEqual(a, dataSig({ count: 100, maxUpdated: 5 }, [{ updatedAt: '2026-11-04T08:00:00Z' }, { updatedAt: '2026-11-01T10:00:00Z' }]));
});
