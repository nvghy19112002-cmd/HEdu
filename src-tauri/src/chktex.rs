//! Kiểm lỗi mã LaTeX bằng ChkTeX (đi kèm TeX Live). Chỉ đọc: ghi văn bản ra tệp tạm, chạy `chktex`, đọc kết quả, xoá tệp tạm.
//! Tắt sẵn các cảnh báo thuần phong cách hay gặp trong đề Toán tiếng Việt (khoảng trắng, dấu gạch, dấu ngoặc kép…).

use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use crate::proc::run_capture;
use crate::tikz;

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Lint {
    pub line: u32,
    pub col: u32,
    /// số hiệu cảnh báo của ChkTeX
    pub num: u32,
    /// "error" | "warning" | "info"
    pub level: String,
    /// thông điệp gốc (tiếng Anh) của ChkTeX
    pub msg: String,
}

/// Cảnh báo phong cách bị tắt: 1 lệnh kết thúc bằng khoảng trắng · 3 bao ngoặc · 8 độ dài gạch · 11 dấu ba chấm · 12, 13 khoảng cách giữa câu ·
/// 18 dấu ngoặc kép · 24 xoá khoảng trắng · 26 khoảng trắng trước dấu câu · 29 \\ · 30 nhiều khoảng trắng · 32 · 36 khoảng trắng quanh ngoặc · 44 · 45 · 46.
const OFF: [u32; 17] = [1, 3, 8, 11, 12, 13, 18, 24, 26, 29, 30, 32, 36, 44, 45, 46, 2];

static N: AtomicU64 = AtomicU64::new(0);

/// Đọc đầu ra theo định dạng "%k|%l|%c|%n|%m".
pub fn parse(out: &str) -> Vec<Lint> {
    let mut v = Vec::new();
    for l in out.lines() {
        let mut it = l.splitn(5, '|');
        let (Some(k), Some(line), Some(col), Some(num), Some(msg)) = (it.next(), it.next(), it.next(), it.next(), it.next()) else { continue };
        let (Ok(line), Ok(col), Ok(num)) = (line.trim().parse::<u32>(), col.trim().parse::<u32>(), num.trim().parse::<u32>()) else { continue };
        let level = match k.trim().to_ascii_lowercase().as_str() { "error" => "error", "warning" => "warning", _ => "info" };
        v.push(Lint { line, col, num, level: level.into(), msg: msg.trim().to_string() });
    }
    v
}

pub fn check(text: &str, tex_bin: &Option<String>) -> Result<Vec<Lint>, String> {
    if text.len() > 2 * 1024 * 1024 {
        return Err("Tệp quá lớn để kiểm (tối đa 2 MB).".into());
    }
    let tmp: PathBuf = std::env::temp_dir().join(format!("hedu-chktex-{}-{}.tex", std::process::id(), N.fetch_add(1, Ordering::Relaxed)));
    fs::write(&tmp, text).map_err(|e| format!("Không ghi được tệp tạm: {e}"))?;
    let mut c = Command::new(tikz::prog(tex_bin, "chktex"));
    c.arg("-q").arg("-f").arg("%k|%l|%c|%n|%m\n");
    for n in OFF {
        c.arg(format!("-n{n}"));
    }
    c.arg(&tmp);
    tikz::hide_console(&mut c);
    let r = run_capture(&mut c, Duration::from_secs(20));
    let _ = fs::remove_file(&tmp);
    let o = r.map_err(|e| if e.kind() == std::io::ErrorKind::NotFound { "Không tìm thấy chktex của TeX Live (cần TeX Live có gói chktex).".to_string() } else { format!("Không chạy được chktex: {e}") })?;
    if o.timed_out {
        return Err("chktex chạy quá lâu nên đã dừng.".into());
    }
    let mut v = parse(&o.stdout);
    v.sort_by_key(|x| (x.line, x.col));
    Ok(v)
}

#[tauri::command]
pub async fn chktex_check(text: String, tex_bin: Option<String>) -> Result<Vec<Lint>, String> {
    tauri::async_runtime::spawn_blocking(move || check(&text, &tex_bin)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn doc_dau_ra_chktex_va_bo_dong_la() {
        let out = "Warning|3|21|15|No match found for `{'.\nWarning|6|1|17|Number of `{' doesn't match the number of `}'!\nError|2|5|9|`}' expected, found `]'.\nrác không đúng định dạng\nWarning|x|1|2|bad\n";
        let v = parse(out);
        assert_eq!(v.len(), 3);
        assert_eq!((v[0].line, v[0].col, v[0].num, v[0].level.as_str()), (3, 21, 15, "warning"));
        assert_eq!(v[1].msg, "Number of `{' doesn't match the number of `}'!");
        assert_eq!(v[2].level, "error");
    }

    /// Chạy tay với TeX Live thật: HEDU_TEX_BIN=<thư mục bin> cargo test --lib chktex_that -- --ignored
    #[test]
    #[ignore]
    fn chktex_that_bat_ngoac_lech_va_bo_qua_nhieu_phong_cach() {
        let bin = std::env::var("HEDU_TEX_BIN").ok();
        let r = check("\\begin{ex}\nCho $\\frac{1}{2$ và \"trích\" , 3-5.\n\\end{ex}\n", &bin).unwrap();
        assert!(r.iter().any(|x| x.num == 15 || x.num == 17), "{r:?}");
        assert!(!r.iter().any(|x| x.num == 18 || x.num == 26 || x.num == 8), "cảnh báo phong cách đã bị tắt: {r:?}");
    }
}
