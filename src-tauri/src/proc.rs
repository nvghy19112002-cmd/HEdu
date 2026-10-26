// Chạy chương trình ngoài (pdflatex, dvisvgm, kpsewhich, tlmgr) một cách an toàn:
//  - đọc stdout/stderr ở luồng riêng, nên chương trình in nhiều cũng không bị treo vì đầy ống;
//  - có giờ chót, quá giờ thì dừng tiến trình;
//  - chỉ giữ tối đa MAX_KEEP byte mỗi luồng để một log khổng lồ không ngốn bộ nhớ.
use std::io::{self, Read};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
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

// ---------- chạy có Job Object: dừng được CẢ CÂY tiến trình (E2a) ----------

#[cfg(windows)]
mod job {
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject, TerminateJobObject,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    /// Job Object của Windows. Đóng tay cầm (Drop) ⇒ Windows giết MỌI tiến trình còn trong job (KILL_ON_JOB_CLOSE).
    pub struct Job(HANDLE);
    // tay cầm job dùng được từ luồng khác
    unsafe impl Send for Job {}

    impl Job {
        pub fn new() -> Option<Job> {
            unsafe {
                let h = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                if h.is_null() {
                    return None;
                }
                let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                let ok = SetInformationJobObject(
                    h,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const std::ffi::c_void,
                    std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                );
                if ok == 0 {
                    CloseHandle(h);
                    return None;
                }
                Some(Job(h))
            }
        }
        pub fn assign(&self, child: &Child) -> bool {
            unsafe { AssignProcessToJobObject(self.0, child.as_raw_handle() as HANDLE) != 0 }
        }
        pub fn kill(&self) {
            unsafe {
                TerminateJobObject(self.0, 1);
            }
        }
    }

    impl Drop for Job {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
}

#[allow(dead_code)]
pub struct JobOut {
    pub success: bool,
    pub code: Option<i32>,
    pub timed_out: bool,
    pub cancelled: bool,
    /// true nếu tiến trình nằm trong Job Object (dừng được cả cây). false = chỉ dừng được tiến trình chính.
    pub tree_guard: bool,
    pub stdout: String,
    pub stderr: String,
}

/// Như `run_capture` nhưng (1) dừng được theo cờ `cancel`, (2) trên Windows đặt tiến trình vào Job Object: hết giờ/huỷ/xong đều
/// giết mọi tiến trình con cháu còn sót, nên không còn TeX chạy ngầm. Tiến trình được gán vào job ngay sau khi sinh ra; trong
/// khoảng cực ngắn đó nó chưa kịp sinh tiến trình con (TeX chỉ sinh tiến trình con sau khi đọc tệp).
pub fn run_job(cmd: &mut Command, limit: Duration, cancel: &AtomicBool) -> io::Result<JobOut> {
    run_job_notify(cmd, limit, cancel, |_| {})
}

/// Như `run_job`, và báo mã tiến trình (PID) của tiến trình vừa sinh ra ngay sau khi sinh (dùng để kiểm thử huỷ cả cây tiến trình).
pub fn run_job_notify(cmd: &mut Command, limit: Duration, cancel: &AtomicBool, on_spawn: impl FnOnce(u32)) -> io::Result<JobOut> {
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn()?;
    on_spawn(child.id());
    #[cfg(windows)]
    let job = job::Job::new().filter(|j| j.assign(&child));
    #[cfg(windows)]
    let tree_guard = job.is_some();
    #[cfg(not(windows))]
    let tree_guard = false;
    let out_h = child.stdout.take().map(drain);
    let err_h = child.stderr.take().map(drain);
    let start = Instant::now();
    let (status, timed_out, cancelled) = loop {
        match child.try_wait()? {
            Some(st) => break (Some(st), false, false),
            None => {
                let (c, t) = (cancel.load(Ordering::SeqCst), start.elapsed() > limit);
                if c || t {
                    #[cfg(windows)]
                    match &job {
                        Some(j) => j.kill(),
                        None => {
                            let _ = child.kill();
                        }
                    }
                    #[cfg(not(windows))]
                    let _ = child.kill();
                    let _ = child.wait();
                    break (None, t && !c, c);
                }
                thread::sleep(Duration::from_millis(25));
            }
        }
    };
    // Đóng job TRƯỚC khi đọc nốt ống: tiến trình con còn sót (giữ ống) bị giết nên không treo.
    #[cfg(windows)]
    drop(job);
    let killed = status.is_none();
    let take = |h: Option<thread::JoinHandle<Vec<u8>>>| -> String {
        if killed && !tree_guard {
            return String::new(); // không có job: con cháu có thể còn giữ ống, không chờ
        }
        h.and_then(|j| j.join().ok()).map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default()
    };
    Ok(JobOut {
        success: status.map(|s| s.success()).unwrap_or(false),
        code: status.and_then(|s| s.code()),
        timed_out,
        cancelled,
        tree_guard,
        stdout: take(out_h),
        stderr: take(err_h),
    })
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
    #[cfg(windows)]
    fn pid_alive(pid: u32) -> bool {
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::Threading::{GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
        unsafe {
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if h.is_null() {
                return false;
            }
            let mut code = 0u32;
            let ok = GetExitCodeProcess(h, &mut code);
            CloseHandle(h);
            ok != 0 && code == 259 // STILL_ACTIVE
        }
    }

    /// Tìm tiến trình con tên `name` của tiến trình `parent` (qua ảnh chụp danh sách tiến trình của Windows).
    #[cfg(windows)]
    fn child_named(parent: u32, name: &str) -> Option<u32> {
        use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
        use windows_sys::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS};
        unsafe {
            let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snap == INVALID_HANDLE_VALUE {
                return None;
            }
            let mut e: PROCESSENTRY32W = std::mem::zeroed();
            e.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
            let mut found = None;
            let mut ok = Process32FirstW(snap, &mut e);
            while ok != 0 {
                let len = e.szExeFile.iter().position(|&c| c == 0).unwrap_or(e.szExeFile.len());
                if e.th32ParentProcessID == parent && String::from_utf16_lossy(&e.szExeFile[..len]).eq_ignore_ascii_case(name) {
                    found = Some(e.th32ProcessID);
                    break;
                }
                ok = Process32NextW(snap, &mut e);
            }
            CloseHandle(snap);
            found
        }
    }

    /// Lệnh `cmd /C ping`: cmd.exe (tiến trình con) sinh ra ping.exe (tiến trình CHÁU) chạy 120 giây. Không phụ thuộc PowerShell nên khởi động tức thì.
    #[cfg(windows)]
    fn cmd_ping() -> Command {
        let mut c = Command::new("cmd");
        c.args(["/C", "ping", "-n", "120", "127.0.0.1"]);
        c
    }

    /// Chờ tiến trình cháu `ping.exe` của `parent` xuất hiện (tối đa 60 giây, chịu được máy đang quá tải).
    #[cfg(windows)]
    fn wait_grandchild(parent: u32) -> u32 {
        for _ in 0..1200 {
            if let Some(p) = child_named(parent, "ping.exe") {
                return p;
            }
            thread::sleep(Duration::from_millis(50));
        }
        panic!("tiến trình cháu không khởi động");
    }

    #[cfg(windows)]
    fn wait_dead(pid: u32) {
        for _ in 0..100 {
            if !pid_alive(pid) {
                return;
            }
            thread::sleep(Duration::from_millis(100));
        }
    }

    #[cfg(windows)]
    #[test]
    fn huy_dung_ca_cay_tien_trinh_that() {
        use std::sync::Arc;
        let cancel = Arc::new(AtomicBool::new(false));
        let (tx, rx) = std::sync::mpsc::channel::<u32>();
        let c2 = cancel.clone();
        let watcher = thread::spawn(move || {
            let grand = wait_grandchild(rx.recv().unwrap());
            assert!(pid_alive(grand), "tiến trình cháu phải đang chạy trước khi huỷ");
            c2.store(true, Ordering::SeqCst);
            grand
        });
        let t0 = Instant::now();
        let r = run_job_notify(&mut cmd_ping(), Duration::from_secs(90), &cancel, move |pid| {
            let _ = tx.send(pid);
        })
        .unwrap();
        let grand = watcher.join().unwrap();
        assert!(r.cancelled && !r.timed_out && !r.success && r.tree_guard);
        assert!(t0.elapsed() < Duration::from_secs(80));
        wait_dead(grand);
        assert!(!pid_alive(grand), "tiến trình CHÁU phải bị giết cùng cây");
    }

    #[cfg(windows)]
    #[test]
    fn het_gio_cung_dung_ca_cay_tien_trinh_that() {
        let cancel = AtomicBool::new(false);
        let (tx, rx) = std::sync::mpsc::channel::<u32>();
        let watcher = thread::spawn(move || wait_grandchild(rx.recv().unwrap()));
        let r = run_job_notify(&mut cmd_ping(), Duration::from_secs(6), &cancel, move |pid| {
            let _ = tx.send(pid);
        })
        .unwrap();
        let grand = watcher.join().unwrap();
        assert!(r.timed_out && !r.cancelled && !r.success && r.tree_guard, "timed_out={} tree_guard={}", r.timed_out, r.tree_guard);
        wait_dead(grand);
        assert!(!pid_alive(grand), "tiến trình CHÁU phải bị giết khi hết giờ");
    }

    #[cfg(windows)]
    #[test]
    fn xong_binh_thuong_van_lay_dau_ra_va_ma_thoat() {
        let cancel = AtomicBool::new(false);
        let r = run_job(Command::new("cmd").args(["/C", "echo xin&& exit 3"]), Duration::from_secs(20), &cancel).unwrap();
        assert!(!r.success && r.code == Some(3) && !r.timed_out && !r.cancelled);
        assert_eq!(r.stdout.trim(), "xin");
    }
}
