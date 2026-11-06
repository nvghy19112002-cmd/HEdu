//! Dịch một tệp .tex độc lập (phiếu tô trắc nghiệm) thành PDF và lưu vào thư mục người dùng chọn, không ghi đè tệp có sẵn.
//! Chạy pdflatex hai lượt (phiếu dùng `remember picture` nên lượt đầu chưa biết vị trí trang), có giới hạn thời gian, không `shell-escape`.
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::time::Duration;
use tauri::{AppHandle, Manager};

use crate::examcompile::engine_command;
use crate::proc::run_job;

const MAX_TEX: usize = 2 * 1024 * 1024;

fn safe_base(s: &str) -> String {
    let t: String = s.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').take(60).collect();
    if t.is_empty() { "phieu-to".into() } else { t }
}

fn unique(dir: &Path, base: &str) -> PathBuf {
    for n in 1..1000 {
        let p = dir.join(if n == 1 { format!("{base}.pdf") } else { format!("{base}-{n}.pdf") });
        if !p.exists() {
            return p;
        }
    }
    dir.join(format!("{base}-{}.pdf", std::process::id()))
}

pub fn compile_to_pdf(work_root: &Path, tex_bin: &Option<String>, support: &Option<PathBuf>, tex: &str, dest_dir: &Path, base: &str) -> Result<String, String> {
    if tex.len() > MAX_TEX || !tex.contains("\\documentclass") {
        return Err("Mã phiếu không hợp lệ.".into());
    }
    let md = fs::symlink_metadata(dest_dir).map_err(|e| format!("Thư mục đích không dùng được: {e}"))?;
    if !md.is_dir() {
        return Err("Thư mục đích không phải thư mục thường.".into());
    }
    let work = work_root.join(format!("tmp-phieu-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)));
    fs::create_dir_all(&work).map_err(|e| format!("Không tạo được thư mục tạm: {e}"))?;
    let r = (|| -> Result<String, String> {
        fs::write(work.join("phieu.tex"), tex).map_err(|e| e.to_string())?;
        let never = AtomicBool::new(false);
        for _ in 0..2 {
            let mut c = engine_command(tex_bin, "pdflatex", support, &work);
            c.args(["-interaction=nonstopmode", "-halt-on-error", "-no-shell-escape", "phieu.tex"]);
            match run_job(&mut c, Duration::from_secs(90), &never) {
                Ok(o) if o.timed_out => return Err("Dịch phiếu quá 90 giây nên đã dừng.".into()),
                Ok(o) if !o.success => {
                    let log = fs::read_to_string(work.join("phieu.log")).unwrap_or_default();
                    let first = log.lines().find(|l| l.starts_with('!')).unwrap_or("TeX báo lỗi khi dịch phiếu.");
                    return Err(format!("Dịch phiếu lỗi: {first}"));
                }
                Ok(_) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Err(crate::tikz::missing_tool("pdflatex").message),
                Err(e) => return Err(format!("Không chạy được pdflatex: {e}")),
            }
        }
        let pdf = work.join("phieu.pdf");
        if !pdf.is_file() {
            return Err("TeX không tạo được PDF.".into());
        }
        let dest = unique(dest_dir, &safe_base(base));
        fs::copy(&pdf, &dest).map_err(|e| format!("Không ghi được PDF: {e}"))?;
        Ok(dest.to_string_lossy().into_owned())
    })();
    let _ = fs::remove_dir_all(&work);
    r
}

#[tauri::command]
pub async fn sheet_pdf(app: AppHandle, tex: String, dest_dir: String, base: String, tex_bin: Option<String>) -> Result<String, String> {
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let sup = crate::support::prepare(&root);
    let work_root = root.join("cache");
    fs::create_dir_all(&work_root).map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || compile_to_pdf(&work_root, &tex_bin, &sup, &tex, Path::new(&dest_dir), &base)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ten_an_toan_va_khong_ghi_de() {
        assert_eq!(safe_base("../x y"), "xy");
        assert_eq!(safe_base(""), "phieu-to");
        let d = crate::testutil::dir("sheetpdf");
        fs::create_dir_all(&d).unwrap();
        fs::write(d.join("a.pdf"), "x").unwrap();
        assert_eq!(unique(&d, "a"), d.join("a-2.pdf"));
        assert!(compile_to_pdf(&d, &None, &None, "khong phai tex", &d, "a").is_err());
    }
}
