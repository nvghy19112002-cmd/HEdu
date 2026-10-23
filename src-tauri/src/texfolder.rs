//! Xuất "thư mục biên dịch được": ghi main.tex, khaibaochung.tex, cauhoi.tex, CAN-CO-GI.md (do giao diện sinh)
//! cùng các gói .sty và shared-content.tex đi kèm (bản nhúng trong app) vào MỘT thư mục MỚI.
//! Không bao giờ ghi đè: nếu tên đã có thì thêm -2, -3…

use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};

use crate::support;

#[derive(Deserialize)]
pub struct OutFile {
    pub path: String,
    pub text: String,
}

/// Tên tệp con hợp lệ: không rỗng, không có dấu phân cách thư mục, không phải "." hay "..".
fn safe_leaf(n: &str) -> bool {
    !n.is_empty() && n != "." && n != ".." && !n.contains(['/', '\\', ':', '\0'])
}

/// Tên thư mục hợp lệ (cùng quy tắc, thêm: không dấu chấm/cách cuối, không ký tự cấm của Windows).
fn safe_dir_name(n: &str) -> bool {
    safe_leaf(n)
        && !n.contains(['*', '?', '"', '<', '>', '|'])
        && !n.ends_with('.')
        && !n.ends_with(' ')
}

fn unique_dir(parent: &Path, name: &str) -> PathBuf {
    let first = parent.join(name);
    if !first.exists() {
        return first;
    }
    let mut i = 2;
    loop {
        let p = parent.join(format!("{name}-{i}"));
        if !p.exists() {
            return p;
        }
        i += 1;
    }
}

/// Ghi toàn bộ thư mục. Trả về đường dẫn thư mục đã tạo. Lỗi giữa chừng thì xoá thư mục dở dang.
pub fn write_project(parent: &str, name: &str, files: &[OutFile]) -> Result<String, String> {
    let parent = Path::new(parent);
    if !parent.is_dir() {
        return Err("Thư mục đã chọn không tồn tại.".into());
    }
    if !safe_dir_name(name) {
        return Err("Tên thư mục không hợp lệ.".into());
    }
    for f in files {
        if !safe_leaf(&f.path) {
            return Err(format!("Tên file không hợp lệ: {}", f.path));
        }
        if support::FILES.iter().any(|(n, _)| *n == f.path) {
            return Err(format!("Trùng tên file đi kèm: {}", f.path));
        }
    }
    let dir = unique_dir(parent, name);
    fs::create_dir(&dir).map_err(|e| format!("Không tạo được thư mục: {e}"))?;
    let run = || -> std::io::Result<()> {
        for f in files {
            fs::write(dir.join(&f.path), f.text.as_bytes())?;
        }
        for (n, b) in support::FILES {
            fs::write(dir.join(n), b)?;
        }
        Ok(())
    };
    if let Err(e) = run() {
        let _ = fs::remove_dir_all(&dir);
        return Err(format!("Không ghi được file: {e}"));
    }
    Ok(dir.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("hedu-tf-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
    fn f(p: &str, t: &str) -> OutFile {
        OutFile {
            path: p.into(),
            text: t.into(),
        }
    }

    #[test]
    fn ghi_du_tep_va_khong_ghi_de() {
        let d = tmp("a");
        let p = d.to_string_lossy().into_owned();
        let files = vec![f("main.tex", "m"), f("cauhoi.tex", "Đề \\\\ x")];
        let a = write_project(&p, "bo-de", &files).unwrap();
        let b = write_project(&p, "bo-de", &files).unwrap();
        assert!(a.ends_with("bo-de") && b.ends_with("bo-de-2"));
        assert_eq!(
            fs::read_to_string(Path::new(&a).join("cauhoi.tex")).unwrap(),
            "Đề \\\\ x"
        );
        for (n, bytes) in support::FILES {
            assert_eq!(fs::read(Path::new(&a).join(n)).unwrap(), *bytes, "{n}");
        }
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn tu_choi_ten_nguy_hiem() {
        let d = tmp("b");
        let p = d.to_string_lossy().into_owned();
        for bad in ["", "..", "a/b", "a\\b", "x.", "a:b", "a|b"] {
            assert!(write_project(&p, bad, &[]).is_err(), "{bad}");
        }
        assert!(write_project(&p, "ok", &[f("../x.tex", "")]).is_err());
        assert!(write_project(&p, "ok", &[f("ex_test.sty", "")]).is_err());
        assert!(write_project("/khong/ton/tai/hedu", "ok", &[]).is_err());
        assert!(!d.join("ok").exists());
        let _ = fs::remove_dir_all(&d);
    }
}
