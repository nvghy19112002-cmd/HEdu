//! E3: đọc/sửa/tạo tệp trong một dự án đề của thư viện, an toàn dữ liệu. Thiết kế: claude/thiet-ke-de-thi.md (mục 2.6, 2.3).
//! - Đọc qua `open_inside` (không đi theo liên kết/junction). Chỉ UTF-8; BOM và kiểu xuống dòng (LF/CRLF) được GHI NHỚ và trả đúng khi lưu:
//!   mở rồi lưu mà không sửa thì byte không đổi. Tệp trộn CRLF/LF/CR lẻ, UTF-16, không phải UTF-8 ⇒ chỉ xem, KHÔNG sửa (không đoán).
//! - Lưu = so dấu vân với lúc mở (tệp đổi ngoài app ⇒ báo xung đột, không ghi đè) → chụp bản cũ vào `.hedu/versions` (tối đa 10) → ghi tạm → đổi tên.
//! - Đề đã chốt không sửa trực tiếp. Bản nháp chưa lưu nằm ngoài dự án (`cache/exam-drafts`), không bao giờ ghi đè tệp thật.
#![allow(dead_code)]

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

use crate::examcompile::collect;
use crate::examlib::{bad_rel, handle_inside, is_link, iso_now, open_inside, projects_dir, read_manifest, sha256_reader, valid_id, write_manifest, FileRec};

/// Chỉ một thao tác ghi tệp dự án tại một thời điểm (tránh hai lần lưu chồng nhau và hỏng manifest).
pub(crate) static WRITE_GATE: Mutex<()> = Mutex::new(());
pub const MAX_EDIT_BYTES: u64 = 20 * 1024 * 1024;
pub const MAX_IMAGE_BYTES: u64 = 20 * 1024 * 1024;
const KEEP_VERSIONS: usize = 10;

const TEXT_EXT: &[&str] = &["tex", "sty", "cls", "clo", "def", "cfg", "fd", "ltx", "bib", "bst", "tikz", "txt", "md", "code", "lua"];
const IMAGE_EXT: &[&str] = &["png", "jpg", "jpeg", "gif", "svg"];

fn ext_of(rel: &str) -> String {
    Path::new(rel).extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase()
}

pub fn kind_of(rel: &str) -> &'static str {
    let e = ext_of(rel);
    if TEXT_EXT.contains(&e.as_str()) {
        "text"
    } else if IMAGE_EXT.contains(&e.as_str()) {
        "image"
    } else if e == "pdf" {
        "pdf"
    } else {
        "other"
    }
}

#[derive(Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub rel: String,
    pub bytes: u64,
    /// text | image | pdf | other
    pub kind: String,
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ListOut {
    pub files: Vec<FileEntry>,
    /// liên kết/junction/tên không an toàn: không liệt kê như tệp, không mở
    pub blocked: Vec<String>,
}

/// Liệt kê tệp thật trong thư mục dự án (không đi theo liên kết, bỏ `.hedu`).
pub fn list_files(lib: &Path, id: &str) -> Result<ListOut, String> {
    read_manifest(lib, id)?; // kiểm mã, thư mục không phải liên kết
    let dir = projects_dir(lib).join(id);
    let (mut rels, mut blocked) = (Vec::new(), Vec::new());
    collect(&dir, "", 1, &mut rels, &mut blocked);
    let mut files = Vec::new();
    for r in rels {
        if bad_rel(&r).is_some() {
            blocked.push(r);
            continue;
        }
        match open_inside(&dir, &r).and_then(|h| h.metadata().map_err(|e| e.to_string())) {
            Ok(md) => files.push(FileEntry { kind: kind_of(&r).into(), rel: r, bytes: md.len() }),
            Err(_) => blocked.push(r),
        }
    }
    blocked.sort();
    blocked.dedup();
    Ok(ListOut { files, blocked })
}

// ---------- mã hoá / giải mã giữ nguyên byte ----------

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TextFile {
    /// nội dung với xuống dòng chuẩn hoá về '\n' (trình soạn dùng '\n')
    pub text: String,
    pub bytes: u64,
    /// dấu vân (SHA-256) của BYTE gốc trên đĩa
    pub sha256: String,
    /// lf | crlf | none
    pub eol: String,
    pub bom: bool,
    pub mtime_ms: i64,
}

/// Giải mã byte → (chữ chuẩn hoá '\n', eol, bom). Không đoán: ngoài UTF-8 thuần với một kiểu xuống dòng thì Err.
pub fn decode(bytes: &[u8]) -> Result<(String, &'static str, bool), String> {
    if bytes.starts_with(&[0xFF, 0xFE]) || bytes.starts_with(&[0xFE, 0xFF]) {
        return Err("Tệp được lưu dạng UTF-16 nên không sửa trực tiếp trong HEdu (chỉ xem thông tin).".into());
    }
    let (body, bom) = match bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        Some(b) => (b, true),
        None => (bytes, false),
    };
    let s = std::str::from_utf8(body).map_err(|_| "Tệp không phải UTF-8 nên không sửa trực tiếp (HEdu không đoán bảng mã để tránh làm sai chữ).".to_string())?;
    let crlf = s.matches("\r\n").count();
    let lf_total = s.matches('\n').count();
    let cr_total = s.matches('\r').count();
    if cr_total != crlf {
        return Err("Tệp có ký tự xuống dòng '\\r' đứng lẻ nên không sửa trực tiếp.".into());
    }
    if crlf > 0 && lf_total != crlf {
        return Err("Tệp trộn lẫn hai kiểu xuống dòng (CRLF và LF) nên không sửa trực tiếp để không làm đổi kiểu.".into());
    }
    if crlf > 0 {
        Ok((s.replace("\r\n", "\n"), "crlf", bom))
    } else if lf_total > 0 {
        Ok((s.to_string(), "lf", bom))
    } else {
        Ok((s.to_string(), "none", bom))
    }
}

pub fn encode(text: &str, eol: &str, bom: bool) -> Vec<u8> {
    let mut out = Vec::with_capacity(text.len() + 8);
    if bom {
        out.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    }
    if eol == "crlf" {
        out.extend_from_slice(text.replace('\n', "\r\n").as_bytes());
    } else {
        out.extend_from_slice(text.as_bytes());
    }
    out
}

fn sha_hex(b: &[u8]) -> String {
    Sha256::digest(b).iter().map(|x| format!("{x:02x}")).collect()
}

fn mtime_ms(md: &fs::Metadata) -> i64 {
    md.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as i64).unwrap_or(0)
}

fn read_all(dir: &Path, rel: &str, cap: u64) -> Result<(Vec<u8>, fs::Metadata), String> {
    let h = open_inside(dir, rel)?;
    let md = h.metadata().map_err(|e| format!("Không đọc được '{rel}': {e}"))?;
    if md.len() > cap {
        return Err(format!("Tệp '{rel}' quá lớn ({} MB; tối đa {} MB để sửa/xem trong HEdu).", md.len() / 1024 / 1024, cap / 1024 / 1024));
    }
    let mut b = Vec::with_capacity(md.len() as usize);
    h.take(cap + 1).read_to_end(&mut b).map_err(|e| format!("Không đọc được '{rel}': {e}"))?;
    Ok((b, md))
}

fn project_dir(lib: &Path, id: &str) -> Result<PathBuf, String> {
    read_manifest(lib, id)?;
    Ok(projects_dir(lib).join(id))
}

fn editable(rel: &str) -> Result<(), String> {
    if let Some(r) = bad_rel(rel) {
        return Err(format!("Đường dẫn không hợp lệ: {r}"));
    }
    if rel.split('/').next() == Some(".hedu") {
        return Err("Thư mục .hedu dành riêng cho HEdu.".into());
    }
    if kind_of(rel) != "text" {
        return Err("Chỉ sửa được tệp văn bản (.tex, .sty, .cls, .bib…).".into());
    }
    Ok(())
}

pub fn read_text_file(lib: &Path, id: &str, rel: &str) -> Result<TextFile, String> {
    editable(rel)?;
    let dir = project_dir(lib, id)?;
    let (bytes, md) = read_all(&dir, rel, MAX_EDIT_BYTES)?;
    let (text, eol, bom) = decode(&bytes)?;
    Ok(TextFile { text, bytes: bytes.len() as u64, sha256: sha_hex(&bytes), eol: eol.into(), bom, mtime_ms: mtime_ms(&md) })
}

/// Nội dung nhị phân của ảnh (xem trước). Chỉ ảnh, tối đa 20 MB.
pub fn read_image(lib: &Path, id: &str, rel: &str) -> Result<Vec<u8>, String> {
    if bad_rel(rel).is_some() || kind_of(rel) != "image" {
        return Err("Chỉ xem trước được ảnh PNG/JPG/GIF/SVG.".into());
    }
    let dir = project_dir(lib, id)?;
    Ok(read_all(&dir, rel, MAX_IMAGE_BYTES)?.0)
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum WriteOut {
    #[serde(rename_all = "camelCase")]
    Saved { sha256: String, bytes: u64, mtime_ms: i64, changed: bool },
    /// tệp trên đĩa không còn như lúc mở (đã đổi ngoài HEdu hoặc đã mất): KHÔNG ghi gì
    #[serde(rename_all = "camelCase")]
    Conflict { current_sha256: Option<String>, missing: bool },
}

fn versions_dir(dir: &Path, rel: &str) -> PathBuf {
    dir.join(".hedu").join("versions").join(rel.replace('/', "__"))
}

fn checkpoint(dir: &Path, rel: &str, old: &[u8]) -> Result<(), String> {
    for d in [dir.join(".hedu"), dir.join(".hedu").join("versions")] {
        if let Ok(md) = fs::symlink_metadata(&d) {
            if is_link(&md) {
                return Err("Thư mục .hedu/versions là liên kết nên không chụp bản cũ (an toàn).".into());
            }
        }
    }
    let vd = versions_dir(dir, rel);
    fs::create_dir_all(&vd).map_err(|e| format!("Không tạo được thư mục bản cũ: {e}"))?;
    if fs::symlink_metadata(&vd).map(|m| is_link(&m)).unwrap_or(true) {
        return Err("Thư mục bản cũ là liên kết nên không ghi (an toàn).".into());
    }
    let ms = std::time::SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let name = format!("{ms:015}.bak");
    let mut f = fs::File::create(vd.join(&name)).map_err(|e| format!("Không chụp được bản cũ: {e}"))?;
    f.write_all(old).and_then(|_| f.sync_all()).map_err(|e| format!("Không chụp được bản cũ: {e}"))?;
    let mut all: Vec<String> = fs::read_dir(&vd).map(|rd| rd.flatten().map(|e| e.file_name().to_string_lossy().into_owned()).filter(|n| n.ends_with(".bak")).collect()).unwrap_or_default();
    all.sort();
    while all.len() > KEEP_VERSIONS {
        let _ = fs::remove_file(vd.join(all.remove(0)));
    }
    Ok(())
}

/// Ghi tạm rồi đổi tên. `guard` (nếu có) là thư mục gốc mà tệp tạm BẮT BUỘC nằm trong: kiểm bằng chính tay cầm vừa tạo, TRƯỚC khi ghi chữ nào,
/// nên thư mục cha bị hoán thành junction giữa chừng thì không có dữ liệu nào bị ghi ra ngoài.
fn write_atomic_in(guard: Option<&Path>, dest: &Path, bytes: &[u8]) -> Result<(), String> {
    let part = dest.with_extension("hedu-part");
    let r = (|| -> Result<(), String> {
        let mut f = fs::File::create(&part).map_err(|e| format!("Không ghi được tệp: {e}"))?;
        if let Some(g) = guard {
            if !fs::canonicalize(g).map(|b| handle_inside(&f, &part, &b)).unwrap_or(false) {
                return Err("Vị trí ghi nằm ngoài thư mục dự án (có liên kết/junction) nên đã dừng, chưa ghi gì.".into());
            }
        }
        f.write_all(bytes).and_then(|_| f.sync_all()).map_err(|e| format!("Không ghi được tệp: {e}"))?;
        drop(f);
        fs::rename(&part, dest).map_err(|e| format!("Không ghi được tệp: {e}"))
    })();
    if r.is_err() {
        let _ = fs::remove_file(&part);
    }
    r
}

fn write_atomic(dest: &Path, bytes: &[u8]) -> Result<(), String> {
    write_atomic_in(None, dest, bytes)
}

fn note_in_manifest(dir: &Path, lib: &Path, id: &str, rel: &str, bytes: u64, sha: &str) -> Result<(), String> {
    let mut m = read_manifest(lib, id)?;
    match m.files.iter_mut().find(|f| f.rel == rel) {
        Some(f) => {
            f.bytes = bytes;
            f.sha256 = sha.to_string();
        }
        None => m.files.push(FileRec { rel: rel.to_string(), bytes, sha256: sha.to_string() }),
    }
    m.updated_at = iso_now();
    write_manifest(dir, &m)
}

/// Lưu tệp văn bản. `expected_sha` = dấu vân của byte gốc lúc MỞ (hoặc lần lưu gần nhất).
pub fn write_text_file(lib: &Path, id: &str, rel: &str, text: &str, eol: &str, bom: bool, expected_sha: &str) -> Result<WriteOut, String> {
    editable(rel)?;
    if !matches!(eol, "lf" | "crlf" | "none") {
        return Err("Kiểu xuống dòng không hợp lệ.".into());
    }
    if text.len() as u64 > MAX_EDIT_BYTES {
        return Err("Nội dung quá lớn để lưu từ trình soạn.".into());
    }
    let _g = WRITE_GATE.lock().unwrap_or_else(|e| e.into_inner());
    let m = read_manifest(lib, id)?;
    if m.status == "finalized" {
        return Err("Đề đã chốt nên không sửa trực tiếp. Hãy tạo phiên bản mới (sao chép dự án) rồi sửa.".into());
    }
    let dir = projects_dir(lib).join(id);
    let cur = match read_all(&dir, rel, MAX_EDIT_BYTES) {
        Ok((b, _)) => b,
        Err(_) if matches!(fs::symlink_metadata(dir.join(rel)), Err(e) if e.kind() == std::io::ErrorKind::NotFound) => {
            return Ok(WriteOut::Conflict { current_sha256: None, missing: true });
        }
        Err(e) => return Err(e),
    };
    let cur_sha = sha_hex(&cur);
    if cur_sha != expected_sha {
        return Ok(WriteOut::Conflict { current_sha256: Some(cur_sha), missing: false });
    }
    let new = encode(text, eol, bom);
    if new == cur {
        let md = fs::metadata(dir.join(rel)).map_err(|e| e.to_string())?;
        return Ok(WriteOut::Saved { sha256: cur_sha, bytes: cur.len() as u64, mtime_ms: mtime_ms(&md), changed: false });
    }
    checkpoint(&dir, rel, &cur)?;
    write_atomic_in(Some(&dir), &dir.join(rel), &new)?;
    let sha = sha_hex(&new);
    note_in_manifest(&dir, lib, id, rel, new.len() as u64, &sha)?;
    let md = fs::metadata(dir.join(rel)).map_err(|e| e.to_string())?;
    Ok(WriteOut::Saved { sha256: sha, bytes: new.len() as u64, mtime_ms: mtime_ms(&md), changed: true })
}

/// Tạo tệp văn bản MỚI (không ghi đè). Không đi qua liên kết ở bất kỳ thư mục cha nào.
pub fn create_text_file(lib: &Path, id: &str, rel: &str, text: &str) -> Result<FileEntry, String> {
    editable(rel)?;
    let _g = WRITE_GATE.lock().unwrap_or_else(|e| e.into_inner());
    let m = read_manifest(lib, id)?;
    if m.status == "finalized" {
        return Err("Đề đã chốt nên không thêm tệp. Hãy tạo phiên bản mới.".into());
    }
    let dir = projects_dir(lib).join(id);
    let mut cur = dir.clone();
    let parts: Vec<&str> = rel.split('/').collect();
    for (i, p) in parts.iter().enumerate() {
        cur.push(p);
        match fs::symlink_metadata(&cur) {
            Ok(md) if is_link(&md) => return Err(format!("'{rel}' đi qua liên kết/junction nên không tạo (an toàn).")),
            Ok(_) if i + 1 == parts.len() => return Err(format!("Tệp '{rel}' đã có. HEdu không ghi đè.")),
            Ok(md) if !md.is_dir() => return Err(format!("'{p}' không phải thư mục.")),
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                if i + 1 < parts.len() {
                    fs::create_dir(&cur).map_err(|e| format!("Không tạo được thư mục: {e}"))?;
                }
            }
            Err(e) => return Err(format!("Không đọc được '{rel}': {e}")),
        }
    }
    let bytes = encode(text, "lf", false);
    let mut f = fs::OpenOptions::new().write(true).create_new(true).open(&cur).map_err(|e| format!("Không tạo được tệp: {e}"))?;
    if !fs::canonicalize(&dir).map(|b| handle_inside(&f, &cur, &b)).unwrap_or(false) {
        drop(f);
        let _ = fs::remove_file(&cur);
        return Err("Vị trí tạo tệp nằm ngoài thư mục dự án (có liên kết/junction) nên đã dừng.".into());
    }
    f.write_all(&bytes).and_then(|_| f.sync_all()).map_err(|e| format!("Không ghi được tệp: {e}"))?;
    drop(f);
    note_in_manifest(&dir, lib, id, rel, bytes.len() as u64, &sha_hex(&bytes))?;
    Ok(FileEntry { rel: rel.to_string(), bytes: bytes.len() as u64, kind: "text".into() })
}

/// Tạo NHIỀU tệp mới ở thư mục gốc dự án theo kiểu TẤT CẢ HOẶC KHÔNG (bổ sung tệp chính từng mã).
/// Kiểm hết trước khi ghi (tên, tệp đã có, đường dẫn đi qua liên kết, đề đã chốt); ghi từng tệp bằng `create_new` (không bao giờ ghi đè);
/// sổ (manifest) chỉ được cập nhật MỘT lần ở cuối. Lỗi ở bất kỳ tệp nào ⇒ xoá đúng các tệp VỪA tạo trong lượt này (không đụng tệp vốn có)
/// và sổ giữ nguyên. `fault(i)` chỉ để kiểm thử: ép lỗi trước khi ghi tệp thứ i.
pub fn create_text_files_batch(lib: &Path, id: &str, files: &[(String, String)], fault: Option<&dyn Fn(usize) -> Result<(), String>>) -> Result<Vec<FileEntry>, String> {
    let _g = WRITE_GATE.lock().unwrap_or_else(|e| e.into_inner());
    let m = read_manifest(lib, id)?;
    if m.status == "finalized" {
        return Err("Đề đã chốt nên không thêm tệp. Hãy tạo phiên bản mới.".into());
    }
    let dir = projects_dir(lib).join(id);
    let mut seen = std::collections::HashSet::new();
    for (rel, text) in files {
        editable(rel)?;
        if rel.contains('/') {
            return Err(format!("Tệp '{rel}' phải nằm ở thư mục gốc của đề."));
        }
        if !seen.insert(rel.to_lowercase()) {
            return Err(format!("Tệp '{rel}' bị lặp trong danh sách."));
        }
        if text.len() as u64 > MAX_EDIT_BYTES {
            return Err(format!("Tệp '{rel}' quá lớn."));
        }
        match fs::symlink_metadata(dir.join(rel)) {
            Ok(_) => return Err(format!("Tệp '{rel}' đã có (hoặc trùng tên một mục khác). HEdu không ghi đè nên chưa tạo tệp nào.")),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(format!("Không đọc được '{rel}': {e}")),
        }
        if m.files.iter().any(|f| f.rel.eq_ignore_ascii_case(rel)) {
            return Err(format!("'{rel}' đã có trong sổ của đề nên chưa tạo tệp nào."));
        }
    }
    let mut created: Vec<(String, PathBuf, u64, String)> = Vec::new();
    let rollback = |created: &[(String, PathBuf, u64, String)], why: String| -> String {
        let mut left = Vec::new();
        for (rel, path, _, _) in created {
            if fs::remove_file(path).is_err() && path.exists() {
                left.push(rel.clone());
            }
        }
        if left.is_empty() {
            format!("{why} Đã hoàn tác: không tệp mới nào được giữ lại.")
        } else {
            format!("{why} KHÔNG hoàn tác hết được; còn tệp mới: {}. Hãy xoá các tệp đó bằng tay.", left.join(", "))
        }
    };
    for (i, (rel, text)) in files.iter().enumerate() {
        if let Some(f) = fault {
            if let Err(e) = f(i) {
                return Err(rollback(&created, e));
            }
        }
        let bytes = encode(text, "lf", false);
        let path = dir.join(rel);
        let mut f = match fs::OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(f) => f,
            Err(e) => return Err(rollback(&created, format!("Không tạo được tệp '{rel}': {e}."))),
        };
        created.push((rel.clone(), path.clone(), bytes.len() as u64, sha_hex(&bytes)));
        if !fs::canonicalize(&dir).map(|b| handle_inside(&f, &path, &b)).unwrap_or(false) {
            drop(f);
            return Err(rollback(&created, "Vị trí tạo tệp nằm ngoài thư mục dự án (có liên kết/junction) nên đã dừng.".into()));
        }
        if let Err(e) = f.write_all(&bytes).and_then(|_| f.sync_all()) {
            drop(f);
            return Err(rollback(&created, format!("Không ghi được tệp '{rel}': {e}.")));
        }
    }
    // cập nhật sổ MỘT lần; lỗi ⇒ sổ không đổi (ghi nguyên tử) và các tệp mới bị xoá
    let mut m2 = read_manifest(lib, id)?;
    for (rel, _, n, sha) in &created {
        m2.files.push(FileRec { rel: rel.clone(), bytes: *n, sha256: sha.clone() });
    }
    m2.updated_at = iso_now();
    if let Err(e) = write_manifest(&dir, &m2) {
        return Err(rollback(&created, e));
    }
    Ok(created.iter().map(|(rel, _, n, _)| FileEntry { rel: rel.clone(), bytes: *n, kind: "text".into() }).collect())
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StatOut {
    pub rel: String,
    pub exists: bool,
    pub bytes: u64,
    pub sha256: Option<String>,
}

/// Kiểm tra nhanh các tệp đang mở: còn không, dấu vân hiện tại (để phát hiện sửa ngoài app).
pub fn stat_files(lib: &Path, id: &str, rels: &[String]) -> Result<Vec<StatOut>, String> {
    let dir = project_dir(lib, id)?;
    let mut out = Vec::new();
    for rel in rels.iter().take(200) {
        if bad_rel(rel).is_some() {
            return Err(format!("Đường dẫn không hợp lệ: {rel}"));
        }
        match open_inside(&dir, rel) {
            Ok(mut h) => {
                let bytes = h.metadata().map(|m| m.len()).unwrap_or(0);
                let sha = if bytes <= MAX_EDIT_BYTES { sha256_reader(&mut h).ok() } else { None };
                out.push(StatOut { rel: rel.clone(), exists: true, bytes, sha256: sha });
            }
            Err(_) => {
                let gone = matches!(fs::symlink_metadata(dir.join(rel)), Err(e) if e.kind() == std::io::ErrorKind::NotFound);
                if gone {
                    out.push(StatOut { rel: rel.clone(), exists: false, bytes: 0, sha256: None });
                } else {
                    return Err(format!("'{rel}' bị chặn (liên kết/junction hoặc không đọc an toàn được)."));
                }
            }
        }
    }
    Ok(out)
}

// ---------- bản nháp chưa lưu (ngoài dự án) ----------

#[derive(Serialize, serde::Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    pub rel: String,
    pub base_sha256: String,
    pub text: String,
    pub at: String,
}

fn draft_path(root: &Path, id: &str, rel: &str) -> Result<PathBuf, String> {
    if !valid_id(id) || bad_rel(rel).is_some() {
        return Err("Mã dự án hoặc đường dẫn không hợp lệ.".into());
    }
    Ok(root.join("cache").join("exam-drafts").join(id).join(format!("{}.json", &sha_hex(rel.as_bytes())[..32])))
}

pub fn draft_write(root: &Path, id: &str, rel: &str, base_sha: &str, text: &str) -> Result<(), String> {
    if text.len() as u64 > MAX_EDIT_BYTES {
        return Err("Bản nháp quá lớn.".into());
    }
    let p = draft_path(root, id, rel)?;
    fs::create_dir_all(p.parent().unwrap()).map_err(|e| format!("Không tạo được thư mục nháp: {e}"))?;
    let d = Draft { rel: rel.into(), base_sha256: base_sha.into(), text: text.into(), at: iso_now() };
    write_atomic(&p, &serde_json::to_vec(&d).map_err(|e| e.to_string())?)
}

pub fn draft_read(root: &Path, id: &str, rel: &str) -> Result<Option<Draft>, String> {
    let p = draft_path(root, id, rel)?;
    match fs::read(&p) {
        Ok(b) => Ok(serde_json::from_slice::<Draft>(&b).ok().filter(|d| d.rel == rel)),
        Err(_) => Ok(None),
    }
}

pub fn draft_clear(root: &Path, id: &str, rel: &str) -> Result<(), String> {
    let p = draft_path(root, id, rel)?;
    let _ = fs::remove_file(p);
    Ok(())
}

// ---------- lệnh Tauri ----------

use tauri::{AppHandle, Manager};

fn root_of(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}
fn lib_of(app: &AppHandle) -> Result<PathBuf, String> {
    root_of(app).map(|r| r.join("exam-library"))
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn exam_file_list(app: AppHandle, id: String) -> Result<ListOut, String> {
    let lib = lib_of(&app)?;
    blocking(move || list_files(&lib, &id)).await
}
#[tauri::command]
pub async fn exam_file_read(app: AppHandle, id: String, rel: String) -> Result<TextFile, String> {
    let lib = lib_of(&app)?;
    blocking(move || read_text_file(&lib, &id, &rel)).await
}
#[tauri::command]
pub async fn exam_file_write(app: AppHandle, id: String, rel: String, text: String, eol: String, bom: bool, expected_sha256: String) -> Result<WriteOut, String> {
    let lib = lib_of(&app)?;
    blocking(move || write_text_file(&lib, &id, &rel, &text, &eol, bom, &expected_sha256)).await
}
#[tauri::command]
pub async fn exam_file_create(app: AppHandle, id: String, rel: String, text: String) -> Result<FileEntry, String> {
    let lib = lib_of(&app)?;
    blocking(move || create_text_file(&lib, &id, &rel, &text)).await
}
#[tauri::command]
pub async fn exam_file_stat(app: AppHandle, id: String, rels: Vec<String>) -> Result<Vec<StatOut>, String> {
    let lib = lib_of(&app)?;
    blocking(move || stat_files(&lib, &id, &rels)).await
}
#[tauri::command]
pub async fn exam_file_image(app: AppHandle, id: String, rel: String) -> Result<tauri::ipc::Response, String> {
    let lib = lib_of(&app)?;
    blocking(move || read_image(&lib, &id, &rel)).await.map(tauri::ipc::Response::new)
}
#[tauri::command]
pub async fn exam_draft_write(app: AppHandle, id: String, rel: String, base_sha256: String, text: String) -> Result<(), String> {
    let root = root_of(&app)?;
    blocking(move || draft_write(&root, &id, &rel, &base_sha256, &text)).await
}
#[tauri::command]
pub async fn exam_draft_read(app: AppHandle, id: String, rel: String) -> Result<Option<Draft>, String> {
    let root = root_of(&app)?;
    blocking(move || draft_read(&root, &id, &rel)).await
}
#[tauri::command]
pub async fn exam_draft_clear(app: AppHandle, id: String, rel: String) -> Result<(), String> {
    let root = root_of(&app)?;
    blocking(move || draft_clear(&root, &id, &rel)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::examlib;

    fn tmp(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("hedu-ef-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
    fn put(d: &Path, rel: &str, b: &[u8]) {
        let p = d.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, b).unwrap();
    }
    /// thư viện có một dự án với các tệp mẫu; trả về (thư mục tạm, lib, id)
    fn proj(tag: &str, files: &[(&str, &[u8])]) -> (PathBuf, PathBuf, String) {
        let d = tmp(tag);
        for (r, b) in files {
            put(&d, &format!("src/{r}"), b);
        }
        let lib = d.join("lib");
        let s = examlib::import(&lib, &d.join("src"), "T", Some("main.tex")).unwrap();
        (d, lib, s.id)
    }
    fn on_disk(lib: &Path, id: &str, rel: &str) -> Vec<u8> {
        fs::read(projects_dir(lib).join(id).join(rel)).unwrap()
    }

    #[test]
    fn giai_ma_ma_hoa_giu_nguyen_byte() {
        let cases: &[&[u8]] = &[
            b"\\documentclass{article}\nxin chao\n",
            b"\\documentclass{article}\r\nxin chao\r\n",
            b"\xEF\xBB\xBF\\documentclass{article}\r\n\xC4\x90\xE1\xBB\x81 thi\r\n",
            b"\xEF\xBB\xBFdong duy nhat khong xuong dong",
            "Đề kiểm tra Toán 12\n".as_bytes(),
            b"",
        ];
        for b in cases {
            let (t, eol, bom) = decode(b).unwrap();
            assert!(!t.contains('\r'));
            assert_eq!(&encode(&t, eol, bom), b, "{:?}", String::from_utf8_lossy(b));
        }
    }

    #[test]
    fn tu_choi_tep_khong_dam_bao_nguyen_byte() {
        assert!(decode(b"a\r\nb\nc\r\n").is_err(), "trộn CRLF và LF");
        assert!(decode(b"a\rb").is_err(), "CR lẻ");
        assert!(decode(b"\xFF\xFEa\x00").is_err(), "UTF-16");
        assert!(decode(b"\xE0\xE1 khong phai utf8").is_err());
    }

    #[test]
    fn mo_roi_luu_khong_sua_thi_byte_va_dau_van_khong_doi() {
        let raw = b"\xEF\xBB\xBF\\documentclass{article}\r\n\\begin{document}\r\nx\r\n\\end{document}\r\n";
        let (d, lib, id) = proj("noop", &[("main.tex", raw)]);
        let f = read_text_file(&lib, &id, "main.tex").unwrap();
        assert_eq!((f.eol.as_str(), f.bom), ("crlf", true));
        let before = fs::metadata(projects_dir(&lib).join(&id).join("main.tex")).unwrap().modified().unwrap();
        let w = write_text_file(&lib, &id, "main.tex", &f.text, &f.eol, f.bom, &f.sha256).unwrap();
        assert!(matches!(w, WriteOut::Saved { changed: false, .. }));
        assert_eq!(on_disk(&lib, &id, "main.tex"), raw);
        assert_eq!(fs::metadata(projects_dir(&lib).join(&id).join("main.tex")).unwrap().modified().unwrap(), before, "không ghi lại tệp khi không đổi");
        assert!(!projects_dir(&lib).join(&id).join(".hedu/versions").exists(), "không chụp bản cũ khi không đổi");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn luu_sua_giu_crlf_bom_chup_ban_cu_va_cap_nhat_manifest() {
        let raw = b"\xEF\xBB\xBFA\r\nB\r\n";
        let (d, lib, id) = proj("save", &[("main.tex", raw)]);
        let f = read_text_file(&lib, &id, "main.tex").unwrap();
        let w = write_text_file(&lib, &id, "main.tex", "A\nB\nC\n", &f.eol, f.bom, &f.sha256).unwrap();
        let WriteOut::Saved { sha256, changed, .. } = w else { panic!("{w:?}") };
        assert!(changed);
        assert_eq!(on_disk(&lib, &id, "main.tex"), b"\xEF\xBB\xBFA\r\nB\r\nC\r\n");
        let vd = versions_dir(&projects_dir(&lib).join(&id), "main.tex");
        let baks: Vec<_> = fs::read_dir(&vd).unwrap().flatten().collect();
        assert_eq!(baks.len(), 1);
        assert_eq!(fs::read(baks[0].path()).unwrap(), raw, "bản cũ được chụp nguyên byte");
        let m = read_manifest(&lib, &id).unwrap();
        assert_eq!(m.files.iter().find(|x| x.rel == "main.tex").unwrap().sha256, sha256);
        assert!(examlib::verify(&lib, &id).unwrap().ok, "kiểm tra thư viện vẫn khớp sau khi sửa trong HEdu");
        assert!(!projects_dir(&lib).join(&id).join("main.hedu-part").exists());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn tep_doi_ngoai_app_thi_bao_xung_dot_va_khong_ghi_de() {
        let (d, lib, id) = proj("conflict", &[("main.tex", b"goc\n")]);
        let f = read_text_file(&lib, &id, "main.tex").unwrap();
        fs::write(projects_dir(&lib).join(&id).join("main.tex"), b"nguoi khac sua\n").unwrap();
        let w = write_text_file(&lib, &id, "main.tex", "toi sua\n", &f.eol, f.bom, &f.sha256).unwrap();
        assert!(matches!(w, WriteOut::Conflict { missing: false, current_sha256: Some(_) }), "{w:?}");
        assert_eq!(on_disk(&lib, &id, "main.tex"), b"nguoi khac sua\n", "tệp của người khác không bị ghi đè");
        // tệp bị xoá ngoài app
        fs::remove_file(projects_dir(&lib).join(&id).join("main.tex")).unwrap();
        let w = write_text_file(&lib, &id, "main.tex", "x\n", "lf", false, &f.sha256).unwrap();
        assert_eq!(w, WriteOut::Conflict { current_sha256: None, missing: true });
        assert!(!projects_dir(&lib).join(&id).join("main.tex").exists(), "không tự tạo lại tệp đã mất");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn giu_toi_da_10_ban_cu() {
        let (d, lib, id) = proj("versions", &[("main.tex", b"0\n")]);
        let mut sha = read_text_file(&lib, &id, "main.tex").unwrap().sha256;
        for i in 1..=13 {
            let WriteOut::Saved { sha256, .. } = write_text_file(&lib, &id, "main.tex", &format!("{i}\n"), "lf", false, &sha).unwrap() else { panic!() };
            sha = sha256;
            std::thread::sleep(std::time::Duration::from_millis(2));
        }
        let n = fs::read_dir(versions_dir(&projects_dir(&lib).join(&id), "main.tex")).unwrap().count();
        assert_eq!(n, KEEP_VERSIONS);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn de_da_chot_khong_sua_truc_tiep_va_tep_khong_phai_van_ban_bi_tu_choi() {
        let (d, lib, id) = proj("final", &[("main.tex", b"a\n"), ("h.png", &[0x89, 0x50])]);
        let f = read_text_file(&lib, &id, "main.tex").unwrap();
        let mut m = read_manifest(&lib, &id).unwrap();
        m.status = "finalized".into();
        write_manifest(&projects_dir(&lib).join(&id), &m).unwrap();
        assert!(write_text_file(&lib, &id, "main.tex", "b\n", "lf", false, &f.sha256).is_err());
        assert!(create_text_file(&lib, &id, "moi.tex", "").is_err());
        assert_eq!(on_disk(&lib, &id, "main.tex"), b"a\n");
        assert!(read_text_file(&lib, &id, "h.png").is_err(), "ảnh không phải văn bản");
        assert!(read_text_file(&lib, &id, ".hedu/manifest.json").is_err());
        assert!(read_text_file(&lib, &id, "../x.tex").is_err());
        assert_eq!(read_image(&lib, &id, "h.png").unwrap(), vec![0x89, 0x50]);
        assert!(read_image(&lib, &id, "main.tex").is_err());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn tao_tep_moi_khong_ghi_de_va_vao_manifest() {
        let (d, lib, id) = proj("create", &[("main.tex", b"a\n")]);
        let e = create_text_file(&lib, &id, "chapters/c1.tex", "Chuong 1\n").unwrap();
        assert_eq!((e.rel.as_str(), e.kind.as_str()), ("chapters/c1.tex", "text"));
        assert_eq!(on_disk(&lib, &id, "chapters/c1.tex"), b"Chuong 1\n");
        assert!(create_text_file(&lib, &id, "chapters/c1.tex", "khac").is_err(), "không ghi đè");
        assert!(create_text_file(&lib, &id, "chapters/CON.tex", "").is_err());
        assert!(create_text_file(&lib, &id, "anh.png", "").is_err(), "chỉ tạo tệp văn bản");
        assert!(read_manifest(&lib, &id).unwrap().files.iter().any(|f| f.rel == "chapters/c1.tex"));
        assert!(examlib::verify(&lib, &id).unwrap().ok);
        let _ = fs::remove_dir_all(&d);
    }

    #[cfg(windows)]
    fn mk_junction(link: &Path, target: &Path) -> bool {
        let fix = |p: &Path| p.to_string_lossy().replace('/', "\\");
        std::process::Command::new("cmd").args(["/C", "mklink", "/J", &fix(link), &fix(target)]).output().map(|o| o.status.success()).unwrap_or(false)
    }

    #[cfg(windows)]
    #[test]
    fn khong_doc_ghi_tao_qua_junction() {
        let (d, lib, id) = proj("junc", &[("main.tex", b"a\n"), ("s/x.tex", b"trong\n")]);
        let pd = projects_dir(&lib).join(&id);
        put(&d, "ngoai/x.tex", b"trong\n");
        put(&d, "ngoai/bi-mat.tex", b"BI-MAT");
        fs::remove_dir_all(pd.join("s")).unwrap();
        assert!(mk_junction(&pd.join("s"), &d.join("ngoai")), "phải tạo được junction để kiểm");
        assert!(read_text_file(&lib, &id, "s/x.tex").is_err());
        assert!(write_text_file(&lib, &id, "s/x.tex", "sua\n", "lf", false, "0").is_err());
        assert!(create_text_file(&lib, &id, "s/moi.tex", "x").is_err());
        assert!(!d.join("ngoai/moi.tex").exists(), "không được tạo tệp bên ngoài thư mục dự án");
        assert_eq!(fs::read(d.join("ngoai/x.tex")).unwrap(), b"trong\n");
        let l = list_files(&lib, &id).unwrap();
        assert!(l.blocked.contains(&"s".to_string()) && l.files.iter().all(|f| !f.rel.starts_with("s/")), "{l:?}");
        assert!(stat_files(&lib, &id, &["s/x.tex".to_string()]).is_err());
        let _ = fs::remove_dir(pd.join("s"));
        let _ = fs::remove_dir_all(&d);
    }

    /// Tệp lớn: mở/lưu không đổi trong thời gian hợp lý và giữ nguyên byte; quá giới hạn thì từ chối rõ ràng (không treo).
    #[test]
    fn tep_lon_mo_luu_nguyen_byte_va_tu_choi_qua_gioi_han() {
        let mut big = String::with_capacity(13 * 1024 * 1024);
        let mut i = 0usize;
        while big.len() < 12 * 1024 * 1024 {
            big.push_str(&format!("\\item Dòng {i} với công thức $x_{{{i}}}^2+\\frac{{1}}{{{}}}$ % chú thích\r\n", i + 1));
            i += 1;
        }
        let (d, lib, id) = proj("big", &[("main.tex", b"a\n"), ("big.tex", big.as_bytes())]);
        let t = std::time::Instant::now();
        let f = read_text_file(&lib, &id, "big.tex").unwrap();
        let read = t.elapsed();
        assert_eq!((f.eol.as_str(), f.bytes), ("crlf", big.len() as u64));
        let t = std::time::Instant::now();
        let w = write_text_file(&lib, &id, "big.tex", &f.text, &f.eol, f.bom, &f.sha256).unwrap();
        let noop = t.elapsed();
        assert!(matches!(w, WriteOut::Saved { changed: false, .. }));
        assert_eq!(on_disk(&lib, &id, "big.tex"), big.as_bytes(), "mở rồi lưu không sửa: giữ nguyên từng byte");
        eprintln!("{} dòng, {} MB: đọc {read:?}, lưu không đổi {noop:?}", i, big.len() / 1024 / 1024);
        assert!(read < std::time::Duration::from_secs(10) && noop < std::time::Duration::from_secs(10));
        // quá giới hạn (20 MB): từ chối rõ ràng
        put(&projects_dir(&lib).join(&id), "qua-lon.tex", &vec![b'a'; (MAX_EDIT_BYTES + 1) as usize]);
        assert!(read_text_file(&lib, &id, "qua-lon.tex").unwrap_err().contains("quá lớn"));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn stat_phat_hien_doi_va_mat() {
        let (d, lib, id) = proj("stat", &[("main.tex", b"a\n")]);
        let s0 = stat_files(&lib, &id, &["main.tex".into(), "khong-co.tex".into()]).unwrap();
        assert!(s0[0].exists && s0[0].sha256.is_some() && !s0[1].exists);
        let f = read_text_file(&lib, &id, "main.tex").unwrap();
        assert_eq!(s0[0].sha256.as_deref(), Some(f.sha256.as_str()));
        fs::write(projects_dir(&lib).join(&id).join("main.tex"), b"b\n").unwrap();
        assert_ne!(stat_files(&lib, &id, &["main.tex".into()]).unwrap()[0].sha256, s0[0].sha256);
        assert!(stat_files(&lib, &id, &["../x".into()]).is_err());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn ban_nhap_ngoai_du_an_va_khong_ghi_de_tep_that() {
        let (d, lib, id) = proj("draft", &[("main.tex", b"that\n")]);
        let root = d.join("root");
        assert_eq!(draft_read(&root, &id, "main.tex").unwrap(), None);
        draft_write(&root, &id, "main.tex", "abc", "chua luu\n").unwrap();
        let dr = draft_read(&root, &id, "main.tex").unwrap().unwrap();
        assert_eq!((dr.text.as_str(), dr.base_sha256.as_str()), ("chua luu\n", "abc"));
        assert_eq!(on_disk(&lib, &id, "main.tex"), b"that\n", "bản nháp không đụng tệp thật");
        assert!(!projects_dir(&lib).join(&id).join(".hedu/drafts").exists());
        draft_clear(&root, &id, "main.tex").unwrap();
        assert_eq!(draft_read(&root, &id, "main.tex").unwrap(), None);
        assert!(draft_write(&root, "../..", "main.tex", "a", "b").is_err());
        assert!(draft_write(&root, &id, "../x.tex", "a", "b").is_err());
        let _ = fs::remove_dir_all(&d);
    }
}
