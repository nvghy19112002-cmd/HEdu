import { evaluateGold, sampleGold } from './goldset';
import type { GoldRec } from './dupdecisions';
import type { DupPairHit } from './dupindex';
import type { Question } from './types';

let failed = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) failed++; };
const qs: Question[] = Array.from({ length: 60 }, (_, i) => ({ uid: `u${i}`, seq: i + 1, latex: `x${i}`, lessonId: `l${i % 3}` }) as unknown as Question);
const kinds = ['raw', 'same', 'conflict', 'near', 'template', 'insufficient'] as const;
const pairs: DupPairHit[] = [];
for (let i = 0; i < 59; i++) pairs.push({ a: `u${i}`, b: `u${i + 1}`, result: { kind: kinds[i % 6] } } as unknown as DupPairHit);

console.log('Nhãn chuẩn: lấy mẫu');
const s1 = sampleGold(qs, pairs, new Set(), 40);
const s2 = sampleGold(qs, pairs, new Set(), 40);
ok(s1.length === 40, `lấy đủ 40 cặp (được ${s1.length})`);
ok(JSON.stringify(s1) === JSON.stringify(s2), 'cùng dữ liệu + cùng seed ⇒ cùng mẫu');
ok(new Set(s1.map((x) => [x.a, x.b].sort().join('|'))).size === s1.length, 'không trùng cặp trong mẫu');
ok(s1.every((x) => x.a !== x.b), 'không có cặp tự so với chính nó');
ok(s1.some((x) => x.kind === 'none'), 'có nhóm đối chứng (cặp bộ dò không báo)');
const reported = new Set(pairs.map((p) => [p.a, p.b].sort().join('|')));
ok(s1.filter((x) => x.kind === 'none').every((x) => !reported.has([x.a, x.b].sort().join('|'))), 'đối chứng chỉ gồm cặp bộ dò thật sự không báo');
const lessonOf = new Map(qs.map((q) => [q.uid, q.lessonId]));
ok(s1.filter((x) => x.kind === 'none').every((x) => lessonOf.get(x.a) === lessonOf.get(x.b)), 'đối chứng cùng bài');
const skip = new Set(s1.slice(0, 10).map((x) => [x.a, x.b].sort().join('|')));
const s3 = sampleGold(qs, pairs, skip, 40);
ok(s3.every((x) => !skip.has([x.a, x.b].sort().join('|'))), 'bỏ qua các cặp đã gắn nhãn');
ok(sampleGold([], [], new Set(), 10).length === 0, 'ngân hàng rỗng ⇒ mẫu rỗng, không lỗi');

console.log('Nhãn chuẩn: báo cáo');
const R = (kind: string, label: GoldRec['label'], n: number): GoldRec[] => Array.from({ length: n }, (_, i) => ({ a: `a${kind}${label}${i}`, b: 'b', fa: '', fb: '', label, kind, at: 1 }));
const recs = [...R('raw', 'true_dup', 9), ...R('raw', 'keep_both', 1), ...R('same', 'true_dup', 8), ...R('near', 'true_dup', 4), ...R('near', 'different', 6), ...R('template', 'true_dup', 2), ...R('template', 'different', 18), ...R('none', 'true_dup', 1), ...R('near', 'unsure', 5)];
const rep = evaluateGold(recs);
ok(rep.sureN === 18 && rep.sureTrue === 17, `chắc trùng: 17/18 là trùng thật (được ${rep.sureTrue}/${rep.sureN})`);
ok(rep.viewN === 28 && rep.viewTrue === 21 && rep.viewRelated === 22, `nhóm mặc định: ${rep.viewTrue}/${rep.viewN} trùng thật, ${rep.viewRelated} liên quan`);
ok(rep.trueTotal === 24 && rep.trueInView === 21 && rep.missed.length === 2, `bỏ sót/bị ẩn: ${rep.trueTotal - rep.trueInView} cặp trùng thật nằm ngoài nhóm mặc định (${rep.missed.map((m) => m.kind + ':' + m.n).join(', ')})`);
ok(rep.unsure === 5, '“Chưa chắc” không tính vào tỉ lệ');
ok(evaluateGold([]).total === 0 && evaluateGold([]).sureN === 0, 'chưa có nhãn ⇒ báo cáo rỗng, không lỗi chia 0');
if (failed) { console.log(`\n${failed} kiểm thử goldset lỗi`); process.exit(1); }
console.log('goldset: đạt hết.');
