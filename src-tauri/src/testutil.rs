//! Thư mục tạm cho test: mỗi lần chạy một thư mục riêng `hedu-tests/p<pid>`, và mỗi lần chạy mới tự dọn các thư mục của
//! lần chạy cũ (quá 30 phút). Trước đây từng test tự đặt tên theo pid rồi không xoá, mỗi lượt `cargo test` để lại hàng trăm
//! thư mục (hàng chục MB mỗi cái).
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::{Duration, SystemTime};

/// Thư mục gốc của lần chạy test hiện tại.
pub fn root() -> &'static PathBuf {
    static R: OnceLock<PathBuf> = OnceLock::new();
    R.get_or_init(|| {
        let base = std::env::temp_dir().join("hedu-tests");
        let _ = std::fs::create_dir_all(&base);
        let me = format!("p{}", std::process::id());
        if let Ok(rd) = std::fs::read_dir(&base) {
            for e in rd.flatten() {
                let old = e.metadata().and_then(|m| m.modified()).ok().and_then(|t| SystemTime::now().duration_since(t).ok()).map(|d| d > Duration::from_secs(1800)).unwrap_or(false);
                if old && e.file_name().to_string_lossy() != me {
                    let _ = std::fs::remove_dir_all(e.path());
                }
            }
        }
        let r = base.join(me);
        let _ = std::fs::create_dir_all(&r);
        r
    })
}

/// Thư mục con riêng cho một test (tên chứa tiền tố mô-đun).
pub fn dir(name: &str) -> PathBuf {
    root().join(name)
}
