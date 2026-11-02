import { CancelledError, Limiter } from './limiter';

let failed = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failed++; console.log('  ✗ ' + msg); }
}
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
/** Việc chỉ xong khi gọi done(). */
function manual<T>(v: T) {
  let done!: () => void;
  const p = new Promise<T>((r) => { done = () => r(v); });
  return { p, done };
}

console.log('Hàng đợi giới hạn (Kho hình)');
await (async () => {
  // không quá 2 việc chạy cùng lúc
  const l = new Limiter(2);
  const m = [manual(1), manual(2), manual(3), manual(4)];
  const order: number[] = [];
  const hs = m.map((x, i) => l.add(() => { order.push(i); return x.p; }));
  ok(l.running === 2 && l.waiting === 2, 'chỉ 2 việc chạy, 2 việc chờ');
  ok(order.join() === '0,1', 'hàng đang trống thì việc xếp vào chạy ngay');
  m[0].done(); await tick();
  ok(l.running === 2 && l.waiting === 1 && order.join() === '0,1,3', 'xong một việc thì lấy việc ĐANG CHỜ mới nhất (thẻ vừa cuộn tới)');
  m[3].done(); m[1].done(); await tick(); await tick();
  ok(order.join() === '0,1,3,2', 'rồi mới tới việc cũ hơn');
  m[2].done(); await tick(); await tick();
  const rs = await Promise.all(hs.map((h) => h.promise));
  ok(rs.join() === '1,2,3,4' && l.running === 0 && l.waiting === 0, 'mọi việc đều trả kết quả đúng của nó');

  // huỷ việc chưa chạy: bị bỏ khỏi hàng, lời hứa bị từ chối bằng CancelledError, việc khác không ảnh hưởng
  const l2 = new Limiter(1);
  const a = manual('a');
  const ra = l2.add(() => a.p);
  let ranB = false;
  const rb = l2.add(() => { ranB = true; return Promise.resolve('b'); });
  rb.cancel();
  const err = await rb.promise.then(() => null, (e) => e);
  ok(err instanceof CancelledError && l2.waiting === 0, 'huỷ việc đang chờ: bị từ chối và rời hàng');
  a.done(); await ra.promise; await tick();
  ok(!ranB, 'việc đã huỷ không bao giờ chạy');

  // huỷ việc đang chạy: không dừng nó, kết quả vẫn trả về bình thường
  const l3 = new Limiter(1);
  const c = manual('c');
  const rc = l3.add(() => c.p);
  rc.cancel();
  c.done();
  ok((await rc.promise) === 'c', 'huỷ việc đang chạy không ảnh hưởng (đã bắt đầu thì chạy nốt)');

  // việc lỗi không làm kẹt hàng
  const l4 = new Limiter(1);
  const bad = l4.add(() => Promise.reject(new Error('lỗi dịch')));
  const good = l4.add(() => Promise.resolve('tiếp'));
  const e4 = await bad.promise.then(() => null, (e) => e as Error);
  ok(e4?.message === 'lỗi dịch' && (await good.promise) === 'tiếp', 'việc lỗi thì báo lỗi và hàng vẫn chạy tiếp');
})();

if (failed) { console.log(`\n${failed} kiểm thử hàng đợi lỗi`); process.exit(1); }
console.log('Hàng đợi: đạt hết.');
