// Hàng đợi giới hạn số việc chạy cùng lúc (dịch TeX nặng: mỗi hình ~2 giây). Dùng cho ảnh thu nhỏ của Kho hình:
// chỉ vài hình dịch cùng lúc; việc chưa chạy mà thẻ đã cuộn ra khỏi màn hình thì huỷ được; việc xếp sau cùng chạy trước
// (thẻ vừa cuộn tới là thẻ người dùng đang nhìn).

export class CancelledError extends Error {
  constructor() { super('đã huỷ'); this.name = 'CancelledError'; }
}

interface Job { run(): void; cancel(): void }

export class Limiter {
  private active = 0;
  private queue: Job[] = [];
  constructor(private readonly max: number) {}

  /** Số việc đang chờ (chưa chạy). */
  get waiting(): number { return this.queue.length; }
  /** Số việc đang chạy. */
  get running(): number { return this.active; }

  add<T>(task: () => Promise<T>): { promise: Promise<T>; cancel(): void } {
    let job!: Job;
    const promise = new Promise<T>((resolve, reject) => {
      job = {
        run: () => {
          this.active++;
          task().then(resolve, reject).finally(() => { this.active--; this.pump(); });
        },
        cancel: () => reject(new CancelledError()),
      };
    });
    this.queue.push(job);
    this.pump();
    return {
      promise,
      cancel: () => {
        const i = this.queue.indexOf(job);
        if (i >= 0) { this.queue.splice(i, 1); job.cancel(); }
      },
    };
  }

  private pump() {
    while (this.active < this.max && this.queue.length) this.queue.pop()!.run();
  }
}
