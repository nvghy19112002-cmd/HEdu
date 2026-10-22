// Chạy chương trình ngoài (pdflatex, dvisvgm, kpsewhich, tlmgr) một cách an toàn:
//  - đọc stdout/stderr ở luồng riêng, nên chương trình in nhiều cũng không bị treo vì đầy ống;
//  - có giờ chót, quá giờ thì dừng tiến trình;
//  - chỉ giữ tối đa MAX_KEEP byte mỗi luồng để một log khổng lồ không ngốn bộ nhớ.
use std::io::{self, Read};
use std::process::{Command, Stdio};
use std::sync::{Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant};

const MAX_KEEP: usize = 2 * 1024 * 1024;

pub struct Captured {
    pub success: bool,
    pub timed_out: bool,
    pub stdout: String,
    pub stderr: String,
}

fn drain<R: Read + Send + 'static>(mut r: R) -> thread::JoinHandle<Vec<u8>> {
    thread::spawn(move || {
        let mut keep = Vec::new();
        let mut buf = [0u8; 8192];
        loop {
            match r.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if keep.len() < MAX_KEEP {
                        let room = MAX_KEEP - keep.len();
                        keep.extend_from_slice(&buf[..n.min(room)]);
                    }
                }
            }
        }
        keep
    })
}

pub fn run_capture(cmd: &mut Command, limit: Duration) -> io::Result<Captured> {
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn()?;
    let out_h = child.stdout.take().map(drain);
    let err_h = child.stderr.take().map(drain);
    let start = Instant::now();
    let (success, timed_out) = loop {
        match child.try_wait()? {
            Some(st) => break (st.success(), false),
            None => {
                if start.elapsed() > limit {
                    let _ = child.kill();
                    let _ = child.wait();
                    break (false, true);
                }
                thread::sleep(Duration::from_millis(25));
            }
        }
    };
    // Hết giờ: tiến trình con của nó có thể còn giữ ống, nên không chờ luồng đọc (để nó tự kết thúc).
    let take = |h: Option<thread::JoinHandle<Vec<u8>>>| -> String {
        if timed_out {
            return String::new();
        }
        h.and_then(|j| j.join().ok()).map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default()
    };
    Ok(Captured { success, timed_out, stdout: take(out_h), stderr: take(err_h) })
}

/// Giới hạn số tiến trình TeX chạy cùng lúc, để mở file nhiều hình không làm máy đứng.
pub struct Slots {
    left: Mutex<usize>,
    cv: Condvar,
}

pub struct Permit<'a>(&'a Slots);

impl Slots {
    pub const fn new(n: usize) -> Slots {
        Slots { left: Mutex::new(n), cv: Condvar::new() }
    }
    pub fn acquire(&self) -> Permit<'_> {
        let mut g = self.left.lock().unwrap_or_else(|e| e.into_inner());
        while *g == 0 {
            g = self.cv.wait(g).unwrap_or_else(|e| e.into_inner());
        }
        *g -= 1;
        Permit(self)
    }
}

impl Drop for Permit<'_> {
    fn drop(&mut self) {
        let mut g = self.0.left.lock().unwrap_or_else(|e| e.into_inner());
        *g += 1;
        self.0.cv.notify_one();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn chay_va_lay_dau_ra() {
        let r = run_capture(Command::new("sh").args(["-c", "echo xin; echo loi 1>&2"]), Duration::from_secs(5)).unwrap();
        assert!(r.success && !r.timed_out);
        assert_eq!(r.stdout.trim(), "xin");
        assert_eq!(r.stderr.trim(), "loi");
    }

    #[cfg(unix)]
    #[test]
    fn in_nhieu_khong_bi_treo() {
        // 5 MB ra stdout: nếu không đọc song song thì ống đầy và treo mãi.
        let r = run_capture(Command::new("sh").args(["-c", "yes abcdefghij | head -c 5000000"]), Duration::from_secs(20)).unwrap();
        assert!(r.success && !r.timed_out);
        assert_eq!(r.stdout.len(), MAX_KEEP);
    }

    #[cfg(unix)]
    #[test]
    fn qua_gio_thi_dung() {
        let t = Instant::now();
        let r = run_capture(Command::new("sh").args(["-c", "sleep 30"]), Duration::from_millis(300)).unwrap();
        assert!(r.timed_out && !r.success);
        assert!(t.elapsed() < Duration::from_secs(5));
    }

    #[test]
    fn khong_co_chuong_trinh_thi_bao_not_found() {
        let e = run_capture(&mut Command::new("chuong-trinh-khong-co-123"), Duration::from_secs(1)).err().unwrap();
        assert_eq!(e.kind(), io::ErrorKind::NotFound);
    }

    #[test]
    fn gioi_han_dong_thoi() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        use std::sync::Arc;
        static S: Slots = Slots::new(2);
        let now = Arc::new(AtomicUsize::new(0));
        let peak = Arc::new(AtomicUsize::new(0));
        let hs: Vec<_> = (0..8)
            .map(|_| {
                let (now, peak) = (now.clone(), peak.clone());
                thread::spawn(move || {
                    let _p = S.acquire();
                    let n = now.fetch_add(1, Ordering::SeqCst) + 1;
                    peak.fetch_max(n, Ordering::SeqCst);
                    thread::sleep(Duration::from_millis(30));
                    now.fetch_sub(1, Ordering::SeqCst);
                })
            })
            .collect();
        for h in hs {
            h.join().unwrap();
        }
        assert!(peak.load(Ordering::SeqCst) <= 2);
    }
}
