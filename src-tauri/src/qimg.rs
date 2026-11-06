// Kho ảnh của câu hỏi: ảnh \includegraphics{…} (PNG/JPG) nằm cạnh tệp .tex lúc nhập được chép vào kho riêng, đặt tên theo nội dung
// (`<32 ký tự sha256>.<đuôi>`), để câu hỏi mang ảnh đi theo: dịch "Xem chuẩn", dựng mã đề và xuất dự án.
// Kho chỉ THÊM; không bao giờ xoá hay ghi đè tệp có sẵn. Tên ảnh trong câu được kiểm chặt (không ra ngoài thư mục).
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};

pub const MAX_IMG: u64 = 12 * 1024 * 1024;
const EXTS: [&str; 3] = ["png", "jpg", "jpeg"];

pub fn dir_of(root: &Path) -> PathBuf {
    root.join("question-images")
}

/// Một ảnh câu hỏi tham chiếu: `name` là tên viết trong \includegraphics, `file` là tên trong kho.
#[derive(Deserialize, Serialize, Clone, Debug, Default, PartialEq)]
pub struct ImgRef {
    pub name: String,
    pub file: String,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Found {
    pub name: String,
    /// tên trong kho; vắng nếu không tìm thấy hoặc không nhận
    pub file: Option<String>,
    pub bytes: u64,
    pub why: String,
}

/// Tên tương đối an toàn: không rỗng, không tuyệt đối, không `..`, không ổ đĩa, không ký tự điều khiển.
pub fn safe_rel(name: &str) -> Option<String> {
    let n = name.trim().replace('\\', "/");
    let n = n.trim_start_matches("./").to_string();
    if n.is_empty() || n.len() > 200 || n.starts_with('/') || n.contains(':') || n.chars().any(|c| c.is_control()) {
        return None;
    }
    if n.split('/').any(|p| p.is_empty() || p == "." || p == ".." || p.ends_with(' ') || p.ends_with('.')) {
        return None;
    }
    Some(n)
}

fn valid_file(f: &str) -> bool {
    let Some((h, e)) = f.rsplit_once('.') else { return false };
    h.len() == 32 && h.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase()) && EXTS.contains(&e)
}

fn ext_ok(p: &Path) -> Option<String> {
    let e = p.extension()?.to_string_lossy().to_lowercase();
    EXTS.contains(&e.as_str()).then_some(e)
}

fn find_in(folder: &Path, rel: &str) -> Option<PathBuf> {
    let direct = folder.join(rel);
    let has_ext = Path::new(rel).extension().is_some();
    let mut tries = vec![direct.clone()];
    if !has_ext {
        for e in EXTS {
            tries.push(folder.join(format!("{rel}.{e}")));
        }
    }
    if let Some(p) = tries.into_iter().find(|p| p.is_file() && ext_ok(p).is_some()) {
        return Some(p);
    }
    // tìm theo tên tệp trong các thư mục con (tối đa 3 cấp): đề thường để ảnh ở images/ hay hinh/ dù \includegraphics không ghi đường dẫn
    let want = Path::new(rel).file_name()?.to_string_lossy().to_lowercase();
    let stem_only = Path::new(rel).extension().is_none();
    fn walk(dir: &Path, want: &str, stem_only: bool, depth: u32) -> Option<PathBuf> {
        let rd = fs::read_dir(dir).ok()?;
        let mut subs = Vec::new();
        for e in rd.flatten() {
            let p = e.path();
            let Ok(md) = fs::symlink_metadata(&p) else { continue };
            if md.file_type().is_symlink() {
                continue;
            }
            if md.is_dir() {
                subs.push(p);
            } else if md.is_file() && ext_ok(&p).is_some() {
                let name = p.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
                let stem = p.file_stem().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
                if name == want || (stem_only && stem == want) {
                    return Some(p);
                }
            }
        }
        if depth < 3 {
            for s in subs {
                if let Some(f) = walk(&s, want, stem_only, depth + 1) {
                    return Some(f);
                }
            }
        }
        None
    }
    walk(folder, &want, stem_only, 0)
}

fn put(store: &Path, bytes: &[u8], ext: &str) -> Result<String, String> {
    let mut h = Sha256::new();
    h.update(bytes);
    let hex: String = h.finalize().iter().map(|b| format!("{b:02x}")).collect();
    let file = format!("{}.{}", &hex[..32], if ext == "jpeg" { "jpg" } else { ext });
    let dest = store.join(&file);
    if dest.exists() {
        return Ok(file);
    }
    fs::create_dir_all(store).map_err(|e| format!("Không tạo được kho ảnh: {e}"))?;
    let part = store.join(format!("{file}.{}.part", std::process::id()));
    fs::write(&part, bytes).map_err(|e| format!("Không ghi được ảnh: {e}"))?;
    if let Err(e) = fs::rename(&part, &dest) {
        let _ = fs::remove_file(&part);
        if !dest.exists() {
            return Err(format!("Không lưu được ảnh: {e}"));
        }
    }
    Ok(file)
}

/// Tìm các ảnh `names` trong `folder`, chép vào kho. Không tìm thấy / quá lớn / tên không an toàn ⇒ `file` = None kèm lý do (không lỗi cả lô).
pub fn collect(root: &Path, folder: &Path, names: &[String]) -> Vec<Found> {
    let store = dir_of(root);
    names
        .iter()
        .map(|raw| {
            let bad = |why: &str| Found { name: raw.clone(), file: None, bytes: 0, why: why.into() };
            let Some(rel) = safe_rel(raw) else { return bad("tên ảnh không an toàn") };
            let Some(p) = find_in(folder, &rel) else { return bad("không thấy tệp ảnh cạnh tệp .tex") };
            let Some(ext) = ext_ok(&p) else { return bad("chỉ nhận PNG/JPG") };
            let Ok(md) = fs::metadata(&p) else { return bad("không đọc được tệp") };
            if md.len() == 0 || md.len() > MAX_IMG {
                return bad("tệp rỗng hoặc quá lớn (tối đa 12 MB)");
            }
            let Ok(bytes) = fs::read(&p) else { return bad("không đọc được tệp") };
            match put(&store, &bytes, &ext) {
                Ok(file) => Found { name: raw.clone(), file: Some(file), bytes: bytes.len() as u64, why: String::new() },
                Err(e) => bad(&e),
            }
        })
        .collect()
}

/// Chép các ảnh trong kho (`store` = thư mục kho ảnh) vào thư mục `work` đúng tên mà câu hỏi viết (thêm đuôi nếu \includegraphics không ghi đuôi).
pub fn materialize(store: &Path, work: &Path, imgs: &[ImgRef]) -> Result<(), String> {
    for im in imgs {
        if safe_rel(&im.name).is_none() {
            return Err(format!("Tên ảnh «{}» không an toàn.", im.name));
        }
        let dest_rel = project_name(&im.name, &im.file).ok_or_else(|| format!("Tên tệp ảnh trong kho không hợp lệ: {}", im.file))?;
        let dest = work.join(&dest_rel);
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Không tạo được thư mục ảnh: {e}"))?;
        }
        fs::copy(store.join(&im.file), &dest).map_err(|e| format!("Thiếu ảnh «{}» trong kho ảnh: {e} (từ {} đến {})", im.name, store.join(&im.file).display(), dest.display()))?;
    }
    Ok(())
}

/// Đường dẫn của ảnh trong một dự án xuất ra: đúng tên câu viết (thêm đuôi nếu \includegraphics không ghi đuôi). None nếu không an toàn.
pub fn project_name(name: &str, file: &str) -> Option<String> {
    let rel = safe_rel(name)?;
    if !valid_file(file) {
        return None;
    }
    let ext = file.rsplit('.').next().unwrap_or("png");
    let has_ext = Path::new(&rel).extension().map(|e| EXTS.contains(&e.to_string_lossy().to_lowercase().as_str())).unwrap_or(false);
    Some(if has_ext { rel } else { format!("{rel}.{ext}") })
}

/// Dấu để đưa vào khoá bộ nhớ đệm hình: đổi ảnh ⇒ dịch lại.
pub fn sig(imgs: &[ImgRef]) -> String {
    imgs.iter().map(|i| format!("{}={}", i.name, i.file)).collect::<Vec<_>>().join(";")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testutil::dir as tmp;

    fn png(n: u8) -> Vec<u8> {
        vec![0x89, b'P', b'N', b'G', 13, 10, 26, 10, n]
    }

    #[test]
    fn ten_an_toan() {
        assert_eq!(safe_rel("hinh1.png").as_deref(), Some("hinh1.png"));
        assert_eq!(safe_rel("./images\\h.png").as_deref(), Some("images/h.png"));
        for bad in ["", "../x.png", "/etc/x.png", "C:/x.png", "a/../b.png", "a//b.png", "x\u{0}.png", "a /b.png"] {
            assert!(safe_rel(bad).is_none(), "{bad:?}");
        }
    }

    #[test]
    fn thu_thap_tim_theo_ten_trong_thu_muc_con_va_khong_ghi_de() {
        let root = tmp("qimg-root");
        let src = tmp("qimg-src");
        fs::create_dir_all(src.join("images/sub")).unwrap();
        fs::write(src.join("images/sub/Hinh2.PNG"), png(2)).unwrap();
        fs::write(src.join("a.jpg"), b"\xff\xd8\xff\xe0jpg").unwrap();
        fs::write(src.join("doc.txt"), "x").unwrap();
        let r = collect(&root, &src, &["Hinh2".into(), "a".into(), "khong-co.png".into(), "../x.png".into(), "doc.txt".into()]);
        assert!(r[0].file.as_deref().unwrap().ends_with(".png"));
        assert!(r[1].file.as_deref().unwrap().ends_with(".jpg"));
        assert!(r[2].file.is_none() && r[3].file.is_none() && r[4].file.is_none());
        let again = collect(&root, &src, &["Hinh2".into()]);
        assert_eq!(again[0].file, r[0].file, "cùng nội dung ⇒ cùng tên trong kho");
        assert_eq!(fs::read_dir(dir_of(&root)).unwrap().count(), 2);
    }

    #[test]
    fn dua_vao_thu_muc_lam_viec_dung_ten_cau_viet() {
        let root = tmp("qimg-root2");
        let src = tmp("qimg-src2");
        fs::create_dir_all(&src).unwrap();
        fs::write(src.join("h1.png"), png(1)).unwrap();
        let f = collect(&root, &src, &["h1".into()]).remove(0).file.unwrap();
        let work = tmp("qimg-work");
        fs::create_dir_all(&work).unwrap();
        materialize(&dir_of(&root), &work, &[ImgRef { name: "h1".into(), file: f.clone() }, ImgRef { name: "images/x.png".into(), file: f.clone() }]).unwrap();
        assert!(work.join("h1.png").is_file() && work.join("images/x.png").is_file());
        assert!(materialize(&dir_of(&root), &work, &[ImgRef { name: "../out.png".into(), file: f }]).is_err());
        assert!(materialize(&dir_of(&root), &work, &[ImgRef { name: "a.png".into(), file: "../etc".into() }]).is_err());
    }
}
