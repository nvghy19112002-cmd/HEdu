// Các gói LaTeX đi kèm HEdu (ex_test, tkz-tab-vn, twemojis…, thư mục src-tauri/tex).
// Nhúng vào chương trình, giải nén một lần vào thư mục dữ liệu, rồi báo cho TeX Live biết
// qua biến TEXINPUTS. Không đụng tới thư mục cài TeX Live của người dùng.
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

pub const FILES: &[(&str, &[u8])] = &[
    ("ex_test.sty", include_bytes!("../tex/ex_test.sty")),
    ("ex_tkz-euclide.sty", include_bytes!("../tex/ex_tkz-euclide.sty")),
    ("tkz-linknodes.sty", include_bytes!("../tex/tkz-linknodes.sty")),
    ("tkz-tab-vn.sty", include_bytes!("../tex/tkz-tab-vn.sty")),
    ("twemojis.sty", include_bytes!("../tex/twemojis.sty")),
    ("shared-content.tex", include_bytes!("../tex/shared-content.tex")),
];

/// Đổi khi nội dung bất kỳ tệp nào đổi; dùng làm một phần khoá bộ nhớ đệm hình.
pub fn rev() -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for (n, b) in FILES {
        for x in n.as_bytes().iter().chain(b.iter()) {
            h ^= *x as u64;
            h = h.wrapping_mul(0x100_0000_01b3);
        }
    }
    format!("{h:016x}")
}

pub fn dir_of(root: &Path) -> PathBuf {
    root.join("cache").join("tex-support")
}

/// Bảo đảm thư mục có đủ tệp đúng nội dung. Tệp nào khác/thiếu thì ghi lại (qua tệp tạm rồi đổi tên).
pub fn ensure(dir: &Path) -> io::Result<()> {
    fs::create_dir_all(dir)?;
    for (name, bytes) in FILES {
        let p = dir.join(name);
        if fs::read(&p).map(|b| b == *bytes).unwrap_or(false) {
            continue;
        }
        let part = dir.join(format!("{name}.part"));
        fs::write(&part, bytes)?;
        if fs::rename(&part, &p).is_err() {
            let _ = fs::remove_file(&p);
            fs::rename(&part, &p)?;
        }
    }
    Ok(())
}

/// Giải nén một lần mỗi lần chạy app; trả về thư mục, hoặc None nếu không ghi được (khi đó TeX vẫn chạy, chỉ thiếu gói đi kèm).
pub fn prepare(root: &Path) -> Option<PathBuf> {
    static DONE: std::sync::OnceLock<Option<PathBuf>> = std::sync::OnceLock::new();
    DONE.get_or_init(|| {
        let d = dir_of(root);
        ensure(&d).ok().map(|_| d)
    })
    .clone()
}

/// Giá trị TEXINPUTS: thư mục của HEdu rồi dấu phân cách cuối để TeX vẫn tìm ở chỗ mặc định.
pub fn texinputs(dir: &Path) -> String {
    let d = dir.display().to_string().replace('\\', "/");
    let sep = if cfg!(windows) { ';' } else { ':' };
    format!("{d}{sep}")
}

/// Gắn TEXINPUTS vào lệnh sắp chạy. `dir` None = không có thư mục đi kèm (giữ nguyên môi trường).
pub fn apply(cmd: &mut Command, dir: &Option<PathBuf>) {
    if let Some(d) = dir {
        cmd.env("TEXINPUTS", texinputs(d));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn giai_nen_du_tep_va_sua_tep_hong() {
        let d = std::env::temp_dir().join(format!("hedu-sup-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        ensure(&d).unwrap();
        for (n, b) in FILES {
            assert_eq!(fs::read(d.join(n)).unwrap(), *b, "{n}");
        }
        fs::write(d.join("ex_test.sty"), b"hong").unwrap();
        ensure(&d).unwrap();
        assert_eq!(fs::read(d.join("ex_test.sty")).unwrap(), FILES[0].1);
        assert!(!d.join("ex_test.sty.part").exists());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn texinputs_co_dau_phan_cach_cuoi() {
        let t = texinputs(Path::new("/a/b"));
        assert!(t.starts_with("/a/b") && (t.ends_with(':') || t.ends_with(';')));
    }

    #[test]
    fn rev_on_dinh() {
        assert_eq!(rev(), rev());
        assert_eq!(rev().len(), 16);
    }
}
