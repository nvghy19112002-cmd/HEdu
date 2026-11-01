//! Màn "Xử lí TeX" — bản nháp DUY NHẤT của bàn nháp, lưu bền trên đĩa (claude/de-xuat-man-xu-li-tex.md mục 10).
//!
//!   <app data>/xu-li-tex/nhap.tex       bản nháp hiện tại (nguyên văn, UTF-8)
//!   <app data>/xu-li-tex/nhap.tex.bak   bản ghi liền trước (phòng mất điện / tệp chính hỏng)
//!
//! Ghi kiểu "tệp tạm → sao .bak → đổi tên" như hedu.json; không đụng ngân hàng, Thư viện đề hay thư mục biên dịch.
//! Giao diện không truyền đường dẫn nào: tên tệp cố định ở đây.
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Giới hạn kích thước bản nháp (byte).
pub const MAX_BYTES: usize = 20 * 1024 * 1024;

pub struct Paths {
    dir: PathBuf,
}

impl Paths {
    pub fn new(app_data: &Path) -> Self {
        Paths { dir: app_data.join("xu-li-tex") }
    }
    fn main(&self) -> PathBuf {
        self.dir.join("nhap.tex")
    }
    fn bak(&self) -> PathBuf {
        self.dir.join("nhap.tex.bak")
    }
    fn tmp(&self) -> PathBuf {
        self.dir.join("nhap.tex.part")
    }
}

/// Ghi bản nháp. Quá giới hạn ⇒ lỗi, không ghi gì.
pub fn save(p: &Paths, text: &str) -> io::Result<()> {
    if text.len() > MAX_BYTES {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, format!("Bản nháp quá lớn (giới hạn {} MB).", MAX_BYTES / 1024 / 1024)));
    }
    fs::create_dir_all(&p.dir)?;
    {
        let mut f = fs::File::create(p.tmp())?;
        f.write_all(text.as_bytes())?;
        f.sync_all()?;
    }
    if p.main().exists() {
        // sao chép (không đổi tên) để tệp chính luôn tồn tại trong suốt quá trình
        fs::copy(p.main(), p.bak())?;
    }
    fs::rename(p.tmp(), p.main())?;
    Ok(())
}

fn read_text(path: &Path) -> io::Result<Option<String>> {
    match fs::read(path) {
        Ok(b) if b.len() <= MAX_BYTES => Ok(String::from_utf8(b).ok()),
        Ok(_) => Ok(None),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Err(e),
        Err(e) => Err(e),
    }
}

/// Kết quả đọc: nội dung (chưa có ⇒ None) và cờ "đã phải lấy từ .bak".
#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LoadOut {
    pub text: Option<String>,
    pub from_backup: bool,
}

/// Đọc bản nháp. Tệp chính hỏng/không phải UTF-8 ⇒ thử .bak; cả hai hỏng ⇒ lỗi (giao diện không được ghi đè lên).
pub fn load(p: &Paths) -> io::Result<LoadOut> {
    let main_exists = p.main().exists();
    match read_text(&p.main()) {
        Ok(Some(t)) => return Ok(LoadOut { text: Some(t), from_backup: false }),
        Ok(None) => {}
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        Err(e) => return Err(e),
    }
    match read_text(&p.bak()) {
        Ok(Some(t)) => Ok(LoadOut { text: Some(t), from_backup: true }),
        Ok(None) => Err(io::Error::new(io::ErrorKind::InvalidData, "Bản nháp và bản dự phòng đều không đọc được.")),
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            if main_exists {
                Err(io::Error::new(io::ErrorKind::InvalidData, "Bản nháp không đọc được và chưa có bản dự phòng."))
            } else {
                Ok(LoadOut { text: None, from_backup: false })
            }
        }
        Err(e) => Err(e),
    }
}

fn paths(app: &AppHandle) -> Result<Paths, String> {
    Ok(Paths::new(&app.path().app_data_dir().map_err(|e| e.to_string())?))
}

#[tauri::command]
pub async fn tex_scratch_load(app: AppHandle) -> Result<LoadOut, String> {
    let p = paths(&app)?;
    tauri::async_runtime::spawn_blocking(move || load(&p)).await.map_err(|e| e.to_string())?.map_err(|e| format!("Không đọc được bản nháp: {e}"))
}

#[tauri::command]
pub async fn tex_scratch_save(app: AppHandle, text: String) -> Result<(), String> {
    let p = paths(&app)?;
    tauri::async_runtime::spawn_blocking(move || save(&p, &text)).await.map_err(|e| e.to_string())?.map_err(|e| format!("Không lưu được bản nháp: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("hedu-texscratch-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn chua_co_ban_nhap_thi_rong() {
        let d = tmp_dir("rong");
        assert_eq!(load(&Paths::new(&d)).unwrap(), LoadOut { text: None, from_backup: false });
    }

    #[test]
    fn ghi_roi_doc_lai_nguyen_van_va_giu_ban_truoc() {
        let d = tmp_dir("ghi");
        let p = Paths::new(&d);
        let a = "\\begin{ex}%[0D1N1-1]\r\n\tCâu một\u{00a0}$x^2$ \n\\end{ex}\n";
        save(&p, a).unwrap();
        assert_eq!(load(&p).unwrap().text.as_deref(), Some(a), "không đổi một byte (CRLF, tab, khoảng trắng đặc biệt)");
        save(&p, "bản hai").unwrap();
        assert_eq!(fs::read_to_string(p.bak()).unwrap(), a, "bản trước vào .bak");
        assert!(!p.tmp().exists(), "không để lại tệp tạm");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn tep_chinh_hong_thi_lay_ban_du_phong() {
        let d = tmp_dir("hong");
        let p = Paths::new(&d);
        save(&p, "bản tốt").unwrap();
        save(&p, "bản mới").unwrap();
        fs::write(p.main(), [0xff, 0xfe, 0x00]).unwrap();
        assert_eq!(load(&p).unwrap(), LoadOut { text: Some("bản tốt".into()), from_backup: true });
        fs::write(p.bak(), [0xff]).unwrap();
        assert!(load(&p).is_err(), "cả hai hỏng ⇒ báo lỗi, không coi như trống");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn qua_gioi_han_thi_khong_ghi() {
        let d = tmp_dir("lon");
        let p = Paths::new(&d);
        save(&p, "nhỏ").unwrap();
        let big = "a".repeat(MAX_BYTES + 1);
        assert!(save(&p, &big).is_err());
        assert_eq!(load(&p).unwrap().text.as_deref(), Some("nhỏ"));
        let _ = fs::remove_dir_all(&d);
    }
}
