import { describeScore, scoreRun, TARGET_PRECISION, type BenchItem } from './benchmark';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const it = (id: string, truth: string | null, predicted: string | null, confident: boolean, over: Partial<BenchItem> = {}): BenchItem => ({ id, truth, predicted, confident, jsonOk: true, ms: 1000, ...over });

console.log('Chấm điểm đo AI gán Dạng (dữ liệu giả)');
{
  const items: BenchItem[] = [
    it('a', 'F1', 'F1', true), it('b', 'F2', 'F2', true), it('c', 'F3', 'F9', true), it('d', 'F4', 'F4', false),
    it('e', null, null, false), it('f', null, 'F5', true), it('g', 'F6', null, false), it('h', 'F7', 'F7', true, { jsonOk: false, ms: 3000 }),
  ];
  const s = scoreRun(items);
  ok(s.total === 8 && s.confidentN === 5 && Math.abs(s.coverage - 5 / 8) < 1e-9, 'bao phủ = số câu đủ tin cậy / tổng');
  ok(s.precision !== null && Math.abs(s.precision - 3 / 5) < 1e-9, 'precision = đúng trong nhóm đủ tin cậy (3/5)');
  ok(Math.abs(s.accuracyAll - 5 / 8) < 1e-9, 'độ đúng toàn tập: từ chối đúng câu không có Dạng cũng tính đúng');
  ok(s.wrongFillRate === 0.5 && s.correctRefusalRate === 0.5, 'câu không có Dạng: gán bừa 1/2, từ chối đúng 1/2');
  ok(s.falseRefusalRate !== null && Math.abs(s.falseRefusalRate - 1 / 6) < 1e-9, 'câu có Dạng mà AI từ chối nhầm: 1/6');
  ok(Math.abs(s.jsonErrorRate - 1 / 8) < 1e-9 && s.avgMs === 1250, 'tỉ lệ lỗi JSON và thời gian trung bình');
  ok(!s.enoughSample && /chưa đủ/.test(describeScore(s, true)), 'dưới 100 câu: nói rõ chưa đủ mẫu');
  ok(/CHƯA được giáo viên xác minh/.test(describeScore(s, false)) && !/Đạt mục tiêu/.test(describeScore(s, false)), 'nhãn chưa xác minh: không bao giờ kết luận đạt');
}
console.log('Ngưỡng 95%');
{
  const many = (wrong: number): BenchItem[] => Array.from({ length: 200 }, (_, i) => it(`x${i}`, 'F1', i < wrong ? 'F2' : 'F1', true));
  const ok95 = scoreRun(many(10)), no95 = scoreRun(many(11));
  ok(ok95.precision === 0.95 && TARGET_PRECISION === 0.95 && /Đạt mục tiêu/.test(describeScore(ok95, true)), 'đúng 95% trên 200 câu có nhãn xác minh ⇒ đạt');
  ok(no95.precision !== null && no95.precision < 0.95 && /CHƯA đạt/.test(describeScore(no95, true)), 'dưới 95% ⇒ chưa đạt');
  const none = scoreRun([it('a', 'F1', null, false)]);
  ok(none.precision === null && none.coverage === 0, 'không câu nào đủ tin cậy ⇒ precision không xác định, bao phủ 0 (không chia cho 0)');
  ok(scoreRun([]).total === 0 && scoreRun([]).accuracyAll === 0, 'rỗng không lỗi');
}

console.log('Bao phủ thấp không được tính là đạt')
{
  const items: BenchItem[] = Array.from({ length: 200 }, (_, i) => it(`z${i}`, 'F1', i < 40 ? 'F1' : null, i < 40));
  const s = scoreRun(items);
  ok(s.precision === 1 && s.coverage === 0.2 && /bao phủ chỉ 20\.0%/.test(describeScore(s, true)) && !/Đạt mục tiêu/.test(describeScore(s, true)), 'đúng 100% nhưng chỉ phủ 20% ⇒ KHÔNG kết luận đạt');
}

if (fail) { console.error(`\n${fail} lỗi`); process.exit(1); }
console.log('\nbenchmark: đạt hết.');
