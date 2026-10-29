//! Thư mục trao đổi "Gán ID nhờ Claude": HEdu ghi tệp lô (hedu-gan-id-*.json) vào một thư mục cố định, Claude (Claude Code)
//! ghi tệp đề xuất (de-xuat-*.json) vào cùng thư mục, HEdu đọc lại. Chỉ đọc/ghi tệp .json tên an toàn, ngay trong thư mục đó
//! (không thư mục con, không đi theo đường dẫn tương đối); không ghi đè tệp đã có.
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const MAX_READ: u64 = 20 * 1024 * 1024;
const MAX_LIST: usize = 500;

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct XFile {
    pub name: String,
    pub bytes: u64,
    pub mtime_ms: u64,
}

fn safe_name(name: &str) -> Result<(), String> {
    let ok = !name.is_empty()
        && name.len() <= 120
        && name.to_lowercase().ends_with(".json")
        && !name.starts_with('.')
        && name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'));
    if ok { Ok(()) } else { Err(format!("Tên tệp không hợp lệ: {name}")) }
}

fn dir_of(dir: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(dir.trim());
    if dir.trim().is_empty() || !p.is_absolute() {
        return Err("Thư mục trao đổi phải là đường dẫn đầy đủ (vd D:\\HEdu-gan-id).".into());
    }
    Ok(p)
}

/// Thư mục mặc định: D:\HEdu-gan-id nếu có ổ D, không thì Documents\HEdu-gan-id.
pub fn default_dir() -> String {
    if Path::new("D:\\").exists() {
        return "D:\\HEdu-gan-id".into();
    }
    let home = std::env::var("USERPROFILE").unwrap_or_else(|_| ".".into());
    Path::new(&home).join("Documents").join("HEdu-gan-id").to_string_lossy().into_owned()
}

pub fn list(dir: &str) -> Result<Vec<XFile>, String> {
    let d = dir_of(dir)?;
    if !d.exists() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    for e in fs::read_dir(&d).map_err(|e| format!("Không đọc được thư mục: {e}"))?.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        if safe_name(&name).is_err() {
            continue;
        }
        let Ok(m) = e.metadata() else { continue };
        if !m.is_file() {
            continue;
        }
        let mtime_ms = m.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0);
        out.push(XFile { name, bytes: m.len(), mtime_ms });
        if out.len() >= MAX_LIST {
            break;
        }
    }
    out.sort_by(|a, b| b.mtime_ms.cmp(&a.mtime_ms).then(a.name.cmp(&b.name)));
    Ok(out)
}

pub fn write(dir: &str, name: &str, text: &str) -> Result<String, String> {
    safe_name(name)?;
    let d = dir_of(dir)?;
    fs::create_dir_all(&d).map_err(|e| format!("Không tạo được thư mục trao đổi: {e}"))?;
    let p = d.join(name);
    if p.exists() {
        return Err(format!("Tệp {name} đã có trong thư mục trao đổi; HEdu không ghi đè."));
    }
    fs::write(&p, text.as_bytes()).map_err(|e| format!("Không ghi được tệp: {e}"))?;
    Ok(p.to_string_lossy().into_owned())
}

pub fn read(dir: &str, name: &str) -> Result<String, String> {
    safe_name(name)?;
    let p = dir_of(dir)?.join(name);
    let m = fs::metadata(&p).map_err(|e| format!("Không mở được {name}: {e}"))?;
    if m.len() > MAX_READ {
        return Err(format!("Tệp {name} quá lớn (trên 20 MB)."));
    }
    let b = fs::read(&p).map_err(|e| format!("Không đọc được {name}: {e}"))?;
    String::from_utf8(b).map_err(|_| format!("Tệp {name} không phải UTF-8."))
}

#[tauri::command]
pub fn id_exchange_default() -> String {
    default_dir()
}
#[tauri::command]
pub fn id_exchange_list(dir: String) -> Result<Vec<XFile>, String> {
    list(&dir)
}
#[tauri::command]
pub fn id_exchange_write(dir: String, name: String, text: String) -> Result<String, String> {
    write(&dir, &name, &text)
}
#[tauri::command]
pub fn id_exchange_read(dir: String, name: String) -> Result<String, String> {
    read(&dir, &name)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("hedu-idx-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn ghi_doc_liet_ke_va_khong_ghi_de() {
        let d = tmp("rw");
        let ds = d.to_string_lossy().into_owned();
        assert_eq!(list(&ds).unwrap(), vec![], "thư mục chưa có ⇒ rỗng");
        write(&ds, "hedu-gan-id-L1.json", "{\"a\":1}").unwrap();
        assert!(write(&ds, "hedu-gan-id-L1.json", "x").is_err(), "không ghi đè");
        assert_eq!(read(&ds, "hedu-gan-id-L1.json").unwrap(), "{\"a\":1}");
        fs::write(d.join("ghi-chu.txt"), "x").unwrap();
        let l = list(&ds).unwrap();
        assert_eq!(l.iter().map(|f| f.name.as_str()).collect::<Vec<_>>(), vec!["hedu-gan-id-L1.json"], "chỉ liệt kê .json");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn chan_ten_va_duong_dan_la() {
        let d = tmp("bad");
        let ds = d.to_string_lossy().into_owned();
        for bad in ["../x.json", "a/b.json", "a\\b.json", "x.txt", ".json", "C:x.json", ""] {
            assert!(write(&ds, bad, "x").is_err(), "{bad}");
            assert!(read(&ds, bad).is_err(), "{bad}");
        }
        assert!(list("tuong-doi").is_err(), "thư mục tương đối bị từ chối");
        let _ = fs::remove_dir_all(&d);
    }
}
