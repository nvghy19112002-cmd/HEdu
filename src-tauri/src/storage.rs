//! Lưu dữ liệu an toàn trên đĩa. Chỉ dùng thư viện chuẩn của Rust để kiểm thử độc lập được.
//!
//! Cấu trúc thư mục dữ liệu (nằm ngoài thư mục cài app, nên cập nhật app không đụng tới):
//!
//!   data/hedu.json            dữ liệu hiện tại
//!   data/hedu.json.bak        bản ghi liền trước (phòng file chính bị hỏng khi mất điện)
//!   backups/before-update/    bản sao lưu duy nhất, tạo ngay trước mỗi lần cập nhật
//!       hedu.json
//!       meta.json
//!
//!   data/dup-decisions.json   quyết định "không trùng / giữ cả hai" của giáo viên (tệp phụ, KHÔNG nằm trong hedu.json)
//!   data/dup-decisions.json.bak  bản ghi liền trước của tệp phụ
//!
//! Tệp phụ chỉ là trí nhớ về các cặp câu đã xem; mất tệp này KHÔNG làm mất câu hỏi nào.
//! Tổng cộng tối đa 4 file dữ liệu chính + 2 file của tệp phụ. Mỗi lần cập nhật, thư mục before-update bị xoá và tạo lại,
//! nên không bao giờ tích tụ nhiều bản.

use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub struct Paths {
    root: PathBuf,
}

impl Paths {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Paths { root: root.into() }
    }
    pub fn root(&self) -> &Path {
        &self.root
    }
    fn data_dir(&self) -> PathBuf {
        self.root.join("data")
    }
    fn data(&self) -> PathBuf {
        self.data_dir().join("hedu.json")
    }
    fn tmp(&self) -> PathBuf {
        self.data_dir().join("hedu.json.tmp")
    }
    fn bak(&self) -> PathBuf {
        self.data_dir().join("hedu.json.bak")
    }
    fn sidecar(&self) -> PathBuf {
        self.data_dir().join("dup-decisions.json")
    }
    fn sidecar_tmp(&self) -> PathBuf {
        self.data_dir().join("dup-decisions.json.tmp")
    }
    fn sidecar_bak(&self) -> PathBuf {
        self.data_dir().join("dup-decisions.json.bak")
    }
    fn backup_dir(&self) -> PathBuf {
        self.root.join("backups").join("before-update")
    }
    fn backup_data(&self) -> PathBuf {
        self.backup_dir().join("hedu.json")
    }
    fn backup_meta(&self) -> PathBuf {
        self.backup_dir().join("meta.json")
    }
}

pub fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Ghi dữ liệu theo kiểu "ghi file tạm rồi đổi tên": nếu mất điện giữa chừng,
/// file chính vẫn nguyên vẹn. Bản ghi trước đó được giữ lại thành .bak.
pub fn write_atomic(p: &Paths, bytes: &[u8]) -> io::Result<()> {
    fs::create_dir_all(p.data_dir())?;
    {
        let mut f = fs::File::create(p.tmp())?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    if p.data().exists() {
        // Sao chép (không đổi tên) để file chính luôn tồn tại trong suốt quá trình.
        fs::copy(p.data(), p.bak())?;
    }
    fs::rename(p.tmp(), p.data())?;
    Ok(())
}

/// Ghi tệp phụ (quyết định cặp trùng) theo cùng cách: file tạm → .bak → đổi tên. Không đụng hedu.json.
pub fn write_sidecar(p: &Paths, bytes: &[u8]) -> io::Result<()> {
    fs::create_dir_all(p.data_dir())?;
    {
        let mut f = fs::File::create(p.sidecar_tmp())?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    if p.sidecar().exists() {
        fs::copy(p.sidecar(), p.sidecar_bak())?;
    }
    fs::rename(p.sidecar_tmp(), p.sidecar())?;
    Ok(())
}

/// Đọc tệp phụ. Chưa có ⇒ None. File chính hỏng ⇒ thử .bak; cả hai hỏng ⇒ lỗi (giao diện không được ghi đè).
pub fn read_sidecar(p: &Paths, is_valid: impl Fn(&[u8]) -> bool) -> io::Result<Option<Vec<u8>>> {
    match fs::read(p.sidecar()) {
        Ok(b) if is_valid(&b) => return Ok(Some(b)),
        Ok(_) => {}
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        Err(e) => return Err(e),
    }
    match fs::read(p.sidecar_bak()) {
        Ok(b) if is_valid(&b) => Ok(Some(b)),
        Ok(_) => Err(io::Error::new(io::ErrorKind::InvalidData, "Tệp quyết định trùng không đọc được.")),
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            if p.sidecar().exists() {
                Err(io::Error::new(io::ErrorKind::InvalidData, "Tệp quyết định trùng không đọc được và chưa có bản dự phòng."))
            } else {
                Ok(None)
            }
        }
        Err(e) => Err(e),
    }
}

pub struct Loaded {
    pub bytes: Vec<u8>,
    /// true nếu file chính hỏng và đã phải lấy từ bản .bak
    pub recovered: bool,
}

/// Đọc dữ liệu. Nếu file chính không qua được `is_valid`, thử bản .bak.
pub fn read_with_recovery(
    p: &Paths,
    is_valid: impl Fn(&[u8]) -> bool,
) -> io::Result<Option<Loaded>> {
    match fs::read(p.data()) {
        Ok(b) if is_valid(&b) => {
            return Ok(Some(Loaded { bytes: b, recovered: false }));
        }
        Ok(_) => {} // hỏng: thử bản .bak
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            // Chưa có file chính. Nếu cũng không có .bak thì đây là lần chạy đầu.
        }
        Err(e) => return Err(e),
    }
    match fs::read(p.bak()) {
        Ok(b) if is_valid(&b) => Ok(Some(Loaded { bytes: b, recovered: true })),
        Ok(_) => Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Cả file dữ liệu và bản dự phòng đều không đọc được.",
        )),
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            if p.data().exists() {
                Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "File dữ liệu không đọc được và chưa có bản dự phòng.",
                ))
            } else {
                Ok(None)
            }
        }
        Err(e) => Err(e),
    }
}

fn json_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

fn meta_json(from: &str, to: &str, schema: u32, bytes: u64, kind: &str, at: u64) -> String {
    format!(
        "{{\"fromVersion\":\"{}\",\"toVersion\":\"{}\",\"schema\":{},\"bytes\":{},\"kind\":\"{}\",\"at\":{}}}",
        json_escape(from),
        json_escape(to),
        schema,
        bytes,
        json_escape(kind),
        at
    )
}

/// Tạo bản sao lưu duy nhất trước khi cập nhật. Bản cũ bị xoá hẳn.
/// Không có dữ liệu (lần chạy đầu) thì không làm gì và trả về Ok(false).
pub fn snapshot_before_update(
    p: &Paths,
    from_version: &str,
    to_version: &str,
    schema: u32,
) -> io::Result<bool> {
    if !p.data().exists() {
        return Ok(false);
    }
    let dir = p.backup_dir();
    if dir.exists() {
        fs::remove_dir_all(&dir)?;
    }
    fs::create_dir_all(&dir)?;
    let bytes = fs::copy(p.data(), p.backup_data())?;
    fs::write(
        p.backup_meta(),
        meta_json(from_version, to_version, schema, bytes, "pre-update", now_secs()),
    )?;
    Ok(true)
}

/// Nội dung meta.json của bản sao lưu, nếu có.
pub fn backup_meta_text(p: &Paths) -> io::Result<Option<String>> {
    match fs::read_to_string(p.backup_meta()) {
        Ok(s) if p.backup_data().exists() => Ok(Some(s)),
        Ok(_) => Ok(None),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
}

/// Hoán đổi dữ liệu hiện tại với bản sao lưu. Trả về dữ liệu hiện tại sau khi đổi.
/// Dữ liệu cũ không bị mất: nó trở thành bản sao lưu, nên bấm nhầm vẫn đảo lại được.
pub fn swap_with_backup(p: &Paths) -> io::Result<Vec<u8>> {
    let backup = fs::read(p.backup_data()).map_err(|e| {
        if e.kind() == io::ErrorKind::NotFound {
            io::Error::new(io::ErrorKind::NotFound, "Chưa có bản sao lưu để khôi phục.")
        } else {
            e
        }
    })?;
    let current = fs::read(p.data()).ok();

    write_atomic(p, &backup)?;

    match current {
        Some(cur) => {
            fs::write(p.backup_data(), &cur)?;
            let old = backup_meta_text(p)?.unwrap_or_default();
            // Giữ lại phiên bản gốc trong meta, chỉ đổi loại và thời điểm.
            let (from, to, schema) = (
                extract_str(&old, "fromVersion"),
                extract_str(&old, "toVersion"),
                extract_num(&old, "schema").unwrap_or(1) as u32,
            );
            fs::write(
                p.backup_meta(),
                meta_json(&from, &to, schema, cur.len() as u64, "swapped", now_secs()),
            )?;
        }
        None => {
            fs::remove_dir_all(p.backup_dir())?;
        }
    }
    Ok(backup)
}

// Đọc nhanh vài trường của meta.json do chính mình ghi (định dạng cố định, không cần thư viện JSON).
fn extract_str(json: &str, key: &str) -> String {
    let pat = format!("\"{}\":\"", key);
    match json.find(&pat) {
        Some(i) => {
            let rest = &json[i + pat.len()..];
            let mut out = String::new();
            let mut esc = false;
            for c in rest.chars() {
                if esc {
                    out.push(match c {
                        'n' => '\n',
                        't' => '\t',
                        'r' => '\r',
                        other => other,
                    });
                    esc = false;
                } else if c == '\\' {
                    esc = true;
                } else if c == '"' {
                    break;
                } else {
                    out.push(c);
                }
            }
            out
        }
        None => String::new(),
    }
}

fn extract_num(json: &str, key: &str) -> Option<u64> {
    let pat = format!("\"{}\":", key);
    let i = json.find(&pat)? + pat.len();
    let digits: String = json[i..].chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static N: AtomicU32 = AtomicU32::new(0);

    fn temp_paths() -> Paths {
        let n = N.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!(
            "hedu-test-{}-{}-{}",
            std::process::id(),
            n,
            now_secs()
        ));
        let _ = fs::remove_dir_all(&dir);
        Paths::new(dir)
    }

    fn ok_json(b: &[u8]) -> bool {
        b.starts_with(b"{") && b.ends_with(b"}")
    }

    fn files_under(root: &Path) -> Vec<String> {
        fn walk(dir: &Path, base: &Path, out: &mut Vec<String>) {
            if let Ok(rd) = fs::read_dir(dir) {
                for e in rd.flatten() {
                    let p = e.path();
                    if p.is_dir() {
                        walk(&p, base, out);
                    } else {
                        out.push(p.strip_prefix(base).unwrap().to_string_lossy().replace('\\', "/"));
                    }
                }
            }
        }
        let mut v = Vec::new();
        walk(root, root, &mut v);
        v.sort();
        v
    }

    #[test]
    fn first_run_has_no_data() {
        let p = temp_paths();
        assert!(read_with_recovery(&p, ok_json).unwrap().is_none());
    }

    #[test]
    fn write_then_read_roundtrip() {
        let p = temp_paths();
        write_atomic(&p, b"{\"a\":1}").unwrap();
        let l = read_with_recovery(&p, ok_json).unwrap().unwrap();
        assert_eq!(l.bytes, b"{\"a\":1}");
        assert!(!l.recovered);
        assert!(!p.tmp().exists(), "file tạm phải được dọn");
    }

    #[test]
    fn second_write_keeps_previous_as_bak() {
        let p = temp_paths();
        write_atomic(&p, b"{\"v\":1}").unwrap();
        write_atomic(&p, b"{\"v\":2}").unwrap();
        assert_eq!(fs::read(p.bak()).unwrap(), b"{\"v\":1}");
        assert_eq!(fs::read(p.data()).unwrap(), b"{\"v\":2}");
    }

    #[test]
    fn corrupted_main_recovers_from_bak() {
        let p = temp_paths();
        write_atomic(&p, b"{\"v\":1}").unwrap();
        write_atomic(&p, b"{\"v\":2}").unwrap();
        fs::write(p.data(), b"{\"v\":2, truncat").unwrap();
        let l = read_with_recovery(&p, ok_json).unwrap().unwrap();
        assert!(l.recovered);
        assert_eq!(l.bytes, b"{\"v\":1}");
    }

    #[test]
    fn both_corrupted_is_an_error_not_silent_data_loss() {
        let p = temp_paths();
        write_atomic(&p, b"{\"v\":1}").unwrap();
        write_atomic(&p, b"{\"v\":2}").unwrap();
        fs::write(p.data(), b"xx").unwrap();
        fs::write(p.bak(), b"yy").unwrap();
        assert!(read_with_recovery(&p, ok_json).is_err());
    }

    #[test]
    fn corrupted_main_without_bak_is_an_error() {
        let p = temp_paths();
        fs::create_dir_all(p.data_dir()).unwrap();
        fs::write(p.data(), b"xx").unwrap();
        assert!(read_with_recovery(&p, ok_json).is_err());
    }

    #[test]
    fn snapshot_skipped_when_no_data() {
        let p = temp_paths();
        assert!(!snapshot_before_update(&p, "0.1.0", "0.2.0", 1).unwrap());
        assert!(backup_meta_text(&p).unwrap().is_none());
    }

    #[test]
    fn snapshot_keeps_only_the_latest_backup() {
        let p = temp_paths();
        write_atomic(&p, b"{\"gen\":1}").unwrap();
        assert!(snapshot_before_update(&p, "0.1.0", "0.2.0", 1).unwrap());
        write_atomic(&p, b"{\"gen\":2}").unwrap();
        assert!(snapshot_before_update(&p, "0.2.0", "0.3.0-beta.1", 1).unwrap());

        assert_eq!(fs::read(p.backup_data()).unwrap(), b"{\"gen\":2}");
        let meta = backup_meta_text(&p).unwrap().unwrap();
        assert_eq!(extract_str(&meta, "fromVersion"), "0.2.0");
        assert_eq!(extract_str(&meta, "toVersion"), "0.3.0-beta.1");
        assert_eq!(extract_num(&meta, "schema"), Some(1));

        // Không tích tụ: đúng 4 file dữ liệu, không hơn.
        assert_eq!(
            files_under(p.root()),
            vec![
                "backups/before-update/hedu.json",
                "backups/before-update/meta.json",
                "data/hedu.json",
                "data/hedu.json.bak",
            ]
        );
    }

    #[test]
    fn swap_restores_and_is_reversible() {
        let p = temp_paths();
        write_atomic(&p, b"{\"gen\":\"old\"}").unwrap();
        snapshot_before_update(&p, "0.1.0", "0.2.0", 1).unwrap();
        write_atomic(&p, b"{\"gen\":\"new\"}").unwrap();

        let restored = swap_with_backup(&p).unwrap();
        assert_eq!(restored, b"{\"gen\":\"old\"}");
        assert_eq!(fs::read(p.data()).unwrap(), b"{\"gen\":\"old\"}");
        assert_eq!(fs::read(p.backup_data()).unwrap(), b"{\"gen\":\"new\"}");
        let meta = backup_meta_text(&p).unwrap().unwrap();
        assert_eq!(extract_str(&meta, "kind"), "swapped");
        assert_eq!(extract_str(&meta, "fromVersion"), "0.1.0");

        // Bấm nhầm thì đảo lại được.
        let back = swap_with_backup(&p).unwrap();
        assert_eq!(back, b"{\"gen\":\"new\"}");
    }

    #[test]
    fn swap_without_backup_fails_cleanly() {
        let p = temp_paths();
        write_atomic(&p, b"{\"x\":1}").unwrap();
        assert!(swap_with_backup(&p).is_err());
        assert_eq!(fs::read(p.data()).unwrap(), b"{\"x\":1}");
    }

    #[test]
    fn meta_escapes_odd_versions() {
        let m = meta_json("a\"b\\c", "d\ne", 2, 10, "pre-update", 5);
        assert_eq!(extract_str(&m, "fromVersion"), "a\"b\\c");
        assert_eq!(extract_str(&m, "toVersion"), "d\ne");
        assert_eq!(extract_num(&m, "schema"), Some(2));
    }

    #[test]
    fn sidecar_ghi_doc_va_khong_dung_vao_du_lieu_chinh() {
        let p = temp_paths();
        assert!(read_sidecar(&p, |_| true).unwrap().is_none());
        write_atomic(&p, b"{\"questions\":[]}").unwrap();
        write_sidecar(&p, b"{\"v\":1,\"recs\":[]}").unwrap();
        write_sidecar(&p, b"{\"v\":1,\"recs\":[1]}").unwrap();
        assert_eq!(read_sidecar(&p, |b| !b.is_empty()).unwrap().unwrap(), b"{\"v\":1,\"recs\":[1]}".to_vec());
        // dữ liệu chính còn nguyên
        assert_eq!(fs::read(p.data()).unwrap(), b"{\"questions\":[]}".to_vec());
        // file chính của tệp phụ hỏng ⇒ lấy .bak
        fs::write(p.sidecar(), b"hong").unwrap();
        let got = read_sidecar(&p, |b| b.starts_with(b"{")).unwrap().unwrap();
        assert_eq!(got, b"{\"v\":1,\"recs\":[]}".to_vec());
        // cả hai hỏng ⇒ lỗi, không âm thầm coi là rỗng
        fs::write(p.sidecar_bak(), b"hong").unwrap();
        assert!(read_sidecar(&p, |b| b.starts_with(b"{")).is_err());
    }
}
