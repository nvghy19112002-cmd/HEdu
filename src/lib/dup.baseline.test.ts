// Ghi nhận hành vi của bộ dò trùng CŨ (dup.ts) trên bộ cặp thử khó, để thấy rõ lỗi trước khi sửa.
// Các khẳng định “lỗi đã biết” dưới đây phản ánh hiện trạng; PR sửa bộ dò sẽ đổi chúng.
import { findDuplicates, normalizeForDup, similarity } from './dup';
import { DUP_PAIRS, type DupKind } from './dupfixtures';
import type { Question } from './types';

let failed = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) failed++; };
const score = (a: string, b: string) => similarity(normalizeForDup(a), normalizeForDup(b));
const byId = Object.fromEntries(DUP_PAIRS.map((p) => [p.id, p]));
const sc = (id: string) => score(byId[id].a, byId[id].b);

console.log('Bộ dò trùng cũ — lỗi đã biết (ghi nhận hiện trạng)');
ok(sc('tmp-frac') === 1, 'LỖI: \\frac{1}{23} và \\frac{12}{3} bị coi là trùng hẳn (xoá mọi {})');
ok(sc('conf-true') === 1, 'LỖI: \\True ở A và ở B bị coi là trùng hẳn (không xét đáp án đúng)');
ok(sc('conf-ds') === 1, 'LỖI: cờ Đ/S khác nhau vẫn bị coi là trùng hẳn');
ok(sc('tmp-immini') === 1, 'LỖI: hình trong \\immini khác nhau vẫn bị coi là trùng hẳn');
ok(sc('same-solution') === 1, 'Ghi nhận: lời giải khác nhau không được xét');
ok(sc('tmp-lt') >= 0.8 && sc('tmp-deriv') >= 0.8 && sc('tmp-num') >= 0.8, 'LỖI: x>0 với x<0, f(2) với f\'(2), đổi số đều ≥ 0,8 nên bị báo “gần trùng”');

// Đo thô: “báo trùng” = điểm ≥ 0,8. Đúng là cặp mong đợi raw/same/near.
console.log('Đo thô trên bộ cặp thử (ngưỡng 0,8 của bộ cũ)');
const isDup = (k: DupKind) => k === 'raw' || k === 'same' || k === 'near';
let tp = 0, fp = 0, fn = 0, falseExact = 0;
for (const p of DUP_PAIRS) {
  const s = score(p.a, p.b);
  const flagged = s >= 0.8;
  if (flagged && isDup(p.expect)) tp++;
  else if (flagged) { fp++; if (s === 1 && !(p.expect === 'raw' || p.expect === 'same')) falseExact++; }
  else if (isDup(p.expect)) fn++;
}
console.log(`  ℹ ${DUP_PAIRS.length} cặp: đúng ${tp}, báo nhầm ${fp} (trong đó “trùng hẳn” sai ${falseExact}), bỏ sót ${fn}  [chỉ trên bộ thử]`);
ok(falseExact >= 3, `bộ cũ có ${falseExact} lần báo “trùng hẳn” sai trên bộ thử`);

// Hợp đồng với phần còn lại của app: findDuplicates vẫn trả điểm 1 khi trùng đúng.
const q = (n: number, latex: string): Question => ({ uid: `u${n}`, seq: n, latex } as unknown as Question);
const bank = [q(1, byId['raw-1'].a)];
ok(findDuplicates(byId['raw-1'].b, bank)[0]?.score === 1, 'findDuplicates: hai bản y hệt vẫn trả điểm 1');
for (const id of ['tmp-frac', 'conf-true', 'conf-ds', 'tmp-immini', 'tmp-lt', 'tmp-deriv']) {
  const h = findDuplicates(byId[id].b, [q(2, byId[id].a)], undefined, 0.5)[0];
  ok(!h || h.score < 1, `findDuplicates (đã chuyển sang dup2): ${id} không còn là “trùng hẳn”`);
}
const cf = findDuplicates(byId['conf-true'].b, [q(3, byId['conf-true'].a)])[0];
ok(cf?.kind === 'conflict', 'findDuplicates: cùng đề khác đáp án được báo là mâu thuẫn đáp án');

if (failed) { console.log(`\n${failed} kiểm thử lỗi`); process.exit(1); }
console.log('Baseline dò trùng cũ: đạt hết.');
