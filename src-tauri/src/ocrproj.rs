// Dự án "Đọc đề" lưu trên đĩa: <app_data>/ocr-projects/<id>/{state.json, pages/<n>.jpg}.
// Tắt app vẫn làm tiếp được. Chỉ nhận id/tên trang an toàn (không chèn đường dẫn), ghi state qua tệp tạm rồi đổi tên.
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

pub const MAX_STATE_BYTES: usize = 20_000_000;
pub const MAX_PAGE_BYTES: usize = 8_000_000;

/// id dự án: "p" + 6–40 ký tự [a-z0-9-]
pub fn valid_id(id: &str) -> bool {
    id.len() >= 7 && id.len() <= 41 && id.starts_with('p') && id.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
}
/// tên trang: 1–4 chữ số (số thứ tự trang trong dự án)
pub fn valid_page(n: &str) -> bool { !n.is_empty() && n.len() <= 4 && n.bytes().all(|c| c.is_ascii_digit()) }

fn dir(root: &Path, id: &str) -> Result<PathBuf, String> {
    if !valid_id(id) { return Err("Mã dự án không hợp lệ.".into()); }
    Ok(root.join(id))
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

pub fn save_state(root: &Path, id: &str, json: &str) -> Result<(), String> {
    if json.len() > MAX_STATE_BYTES { return Err("Dự án quá lớn.".into()); }
    serde_json::from_str::<serde_json::Value>(json).map_err(|_| "Dữ liệu dự án hỏng.".to_string())?;
    let d = dir(root, id)?;
    fs::create_dir_all(d.join("pages")).map_err(|e| e.to_string())?;
    write_atomic(&d.join("state.json"), json.as_bytes())
}

pub fn load_state(root: &Path, id: &str) -> Result<Option<String>, String> {
    match fs::read_to_string(dir(root, id)?.join("state.json")) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn save_page(root: &Path, id: &str, page: &str, jpeg: &[u8]) -> Result<(), String> {
    if !valid_page(page) { return Err("Tên trang không hợp lệ.".into()); }
    if jpeg.len() > MAX_PAGE_BYTES || jpeg.len() < 3 || jpeg[..3] != [0xFF, 0xD8, 0xFF] { return Err("Ảnh trang phải là JPEG ≤ 8 MB.".into()); }
    let d = dir(root, id)?.join("pages");
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    write_atomic(&d.join(format!("{page}.jpg")), jpeg)
}

pub fn read_page(root: &Path, id: &str, page: &str) -> Result<Vec<u8>, String> {
    if !valid_page(page) { return Err("Tên trang không hợp lệ.".into()); }
    fs::read(dir(root, id)?.join("pages").join(format!("{page}.jpg"))).map_err(|e| e.to_string())
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProjInfo { pub id: String, pub state: String }

/// Mọi dự án (kèm state.json để giao diện tự đọc tên/tiến độ), mới sửa trước.
pub fn list(root: &Path) -> Result<Vec<ProjInfo>, String> {
    let Ok(rd) = fs::read_dir(root) else { return Ok(vec![]) };
    let mut v: Vec<(std::time::SystemTime, ProjInfo)> = rd.flatten().filter_map(|e| {
        let id = e.file_name().to_string_lossy().into_owned();
        if !valid_id(&id) { return None; }
        let p = e.path().join("state.json");
        let t = fs::metadata(&p).and_then(|m| m.modified()).ok()?;
        Some((t, ProjInfo { id, state: fs::read_to_string(&p).ok()? }))
    }).collect();
    v.sort_by(|a, b| b.0.cmp(&a.0));
    Ok(v.into_iter().map(|x| x.1).collect())
}

pub fn delete(root: &Path, id: &str) -> Result<(), String> {
    let d = dir(root, id)?;
    if d.exists() { fs::remove_dir_all(d).map_err(|e| e.to_string())?; }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp() -> PathBuf {
        let d = std::env::temp_dir().join(format!("hedu-ocrproj-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn kiem_ten() {
        assert!(valid_id("p20261123-abc") && !valid_id("p..") && !valid_id("x2026112") && !valid_id("p2026/../x") && !valid_id("P2026112"));
        assert!(valid_page("1") && valid_page("0012") && !valid_page("") && !valid_page("1.jpg") && !valid_page("..") && !valid_page("12345"));
    }

    #[test]
    fn luu_doc_liet_ke_xoa() {
        let r = tmp();
        assert_eq!(list(&r).unwrap(), vec![], "chưa có thư mục ⇒ danh sách rỗng");
        save_state(&r, "p1-thu-nghiem", r#"{"name":"A"}"#).unwrap();
        assert_eq!(load_state(&r, "p1-thu-nghiem").unwrap().as_deref(), Some(r#"{"name":"A"}"#));
        assert_eq!(load_state(&r, "p2-chua-co").unwrap(), None);
        assert!(save_state(&r, "p1-thu-nghiem", "không phải json").is_err());
        let jpg = [0xFF, 0xD8, 0xFF, 0xE0, 1, 2];
        save_page(&r, "p1-thu-nghiem", "3", &jpg).unwrap();
        assert_eq!(read_page(&r, "p1-thu-nghiem", "3").unwrap(), jpg);
        assert!(save_page(&r, "p1-thu-nghiem", "4", b"PNG.....").is_err(), "chỉ nhận JPEG");
        assert!(save_page(&r, "p1-thu-nghiem", "../x", &jpg).is_err());
        let l = list(&r).unwrap();
        assert_eq!(l.len(), 1); assert_eq!(l[0].id, "p1-thu-nghiem");
        delete(&r, "p1-thu-nghiem").unwrap();
        assert!(list(&r).unwrap().is_empty());
        let _ = fs::remove_dir_all(&r);
    }
}
