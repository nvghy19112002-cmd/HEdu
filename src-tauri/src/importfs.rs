//! Đọc tệp nguồn cho màn Nhập liệu (PR N1 — CHƯA nối vào giao diện; nối ở N2). Phương án: claude/thiet-ke-nhap-nhieu-tep.md.
//! Nguyên tắc: CHỈ ĐỌC (không sửa, đổi tên hay xoá tệp nguồn); chỉ nhận `.tex` / `.txt`; BẮT BUỘC UTF-8 (không đoán bảng mã);
//! mọi giới hạn đều báo rõ (không cắt lặng lẽ); nội dung tệp được trả về NGUYÊN VĂN (chỉ bỏ dấu BOM ở đầu tệp, vốn không phải nội dung).
#![allow(dead_code)] // được lệnh Tauri và (ở N2) giao diện dùng

use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

pub const MAX_FILES: usize = 2000;
pub const MAX_FILE_BYTES: u64 = 20 * 1024 * 1024;
pub const MAX_DEPTH: usize = 6;

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    /// đường dẫn đầy đủ (giao diện đưa lại cho `import_read`)
    pub path: String,
    pub name: String,
    /// thư mục con tính từ thư mục người dùng chọn, dùng '/' (rỗng nếu tệp được chọn lẻ)
    pub rel: String,
    pub bytes: u64,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Skipped {
    pub path: String,
    pub rel: String,
    pub reason: String,
}

#[derive(Serialize, Debug, Default)]
pub struct ScanOut {
    pub files: Vec<FileEntry>,
    pub skipped: Vec<Skipped>,
    /// đã đạt MAX_FILES: còn tệp chưa liệt kê ⇒ giao diện phải báo và đề nghị chia lô
    pub truncated: bool,
}

fn ext_ok(p: &Path) -> bool {
    p.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("tex") || e.eq_ignore_ascii_case("txt")).unwrap_or(false)
}

fn name_of(p: &Path) -> String {
    p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default()
}

/// So sánh "tự nhiên" không phân biệt hoa/thường: de2 < de10.
fn natural_key(s: &str) -> Vec<(u8, String, u64)> {
    let low = s.to_lowercase();
    let mut out = Vec::new();
    let mut chars = low.chars().peekable();
    while let Some(&c) = chars.peek() {
        if c.is_ascii_digit() {
            let mut n = String::new();
            while let Some(&d) = chars.peek() {
                if d.is_ascii_digit() { n.push(d); chars.next(); } else { break; }
            }
            out.push((0, String::new(), n.trim_start_matches('0').parse::<u64>().unwrap_or(if n.chars().all(|x| x == '0') { 0 } else { u64::MAX })));
        } else {
            let mut t = String::new();
            while let Some(&d) = chars.peek() {
                if !d.is_ascii_digit() { t.push(d); chars.next(); } else { break; }
            }
            out.push((1, t, 0));
        }
    }
    out
}

struct Walk<'a> {
    out: &'a mut ScanOut,
    seen: HashSet<String>,
}

impl Walk<'_> {
    fn skip(&mut self, p: &Path, rel: &str, why: impl Into<String>) {
        self.out.skipped.push(Skipped { path: p.display().to_string(), rel: rel.to_string(), reason: why.into() });
    }

    fn full(&self) -> bool {
        self.out.files.len() >= MAX_FILES
    }

    fn file(&mut self, p: &Path, rel: &str) {
        if !ext_ok(p) {
            self.skip(p, rel, "không phải tệp .tex / .txt");
            return;
        }
        let key = fs::canonicalize(p).map(|c| c.display().to_string().to_lowercase()).unwrap_or_else(|_| p.display().to_string().to_lowercase());
        if !self.seen.insert(key) {
            return; // cùng một tệp được chọn hai lần: chỉ lấy một
        }
        let meta = match fs::metadata(p) {
            Ok(m) => m,
            Err(e) => return self.skip(p, rel, format!("không đọc được: {e}")),
        };
        if meta.len() == 0 {
            return self.skip(p, rel, "tệp rỗng");
        }
        if meta.len() > MAX_FILE_BYTES {
            return self.skip(p, rel, format!("quá lớn ({} MB; tối đa {} MB)", meta.len() / 1024 / 1024, MAX_FILE_BYTES / 1024 / 1024));
        }
        if self.full() {
            self.out.truncated = true;
            return;
        }
        self.out.files.push(FileEntry { path: p.display().to_string(), name: name_of(p), rel: rel.to_string(), bytes: meta.len() });
    }

    fn dir(&mut self, p: &Path, rel: &str, depth: usize) {
        if depth > MAX_DEPTH {
            return self.skip(p, rel, format!("thư mục quá sâu (tối đa {MAX_DEPTH} cấp)"));
        }
        let rd = match fs::read_dir(p) {
            Ok(r) => r,
            Err(e) => return self.skip(p, rel, format!("không đọc được thư mục: {e}")),
        };
        let mut entries: Vec<PathBuf> = rd.flatten().map(|e| e.path()).collect();
        entries.sort_by_key(|e| (!e.is_dir(), natural_key(&name_of(e)))); // thư mục trước, tệp sau (như Windows Explorer), mỗi nhóm theo thứ tự tự nhiên
        for e in entries {
            let name = name_of(&e);
            if name.starts_with('.') {
                continue; // thư mục/tệp ẩn (.git…) — không phải dữ liệu của giáo viên
            }
            let ft = match fs::symlink_metadata(&e) {
                Ok(m) => m.file_type(),
                Err(err) => {
                    self.skip(&e, rel, format!("không đọc được: {err}"));
                    continue;
                }
            };
            if ft.is_symlink() {
                self.skip(&e, rel, "liên kết (không đi theo để tránh lặp vòng)");
            } else if ft.is_dir() {
                let sub = if rel.is_empty() { name } else { format!("{rel}/{name}") };
                self.dir(&e, &sub, depth + 1);
            } else if ft.is_file() {
                if self.full() && ext_ok(&e) {
                    self.out.truncated = true;
                } else {
                    self.file(&e, rel);
                }
            }
        }
    }
}

/// Quét các đường dẫn người dùng chọn (tệp và/hoặc thư mục). Kết quả xếp theo thứ tự tự nhiên, ổn định.
pub fn scan(paths: &[PathBuf]) -> ScanOut {
    let mut out = ScanOut::default();
    let mut w = Walk { out: &mut out, seen: HashSet::new() };
    for p in paths {
        match fs::metadata(p) {
            Ok(m) if m.is_dir() => {
                let root = name_of(p);
                w.dir(p, &root, 1);
            }
            Ok(m) if m.is_file() => w.file(p, ""),
            Ok(_) => w.skip(p, "", "không phải tệp hay thư mục"),
            Err(e) => w.skip(p, "", format!("không đọc được: {e}")),
        }
    }
    out
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReadOut {
    /// nội dung NGUYÊN VĂN (đã bỏ dấu BOM ở đầu nếu có)
    pub text: String,
    pub bytes: u64,
    pub had_bom: bool,
    /// utf-8 | utf-16 (đọc chắc chắn) | windows-1258 (ĐOÁN: giáo viên phải xem chữ mẫu và xác nhận trước khi nhập)
    pub encoding: String,
}

/// Windows-1258 (tiếng Việt): byte 0x80–0xFF → mã Unicode; 0 = byte không có trong bảng mã này.
/// Dấu thanh là ký tự tổ hợp (U+0300, U+0301, U+0303, U+0309, U+0323): phía giao diện chuẩn hoá NFC sau khi đọc.
const CP1258_HI: [u16; 128] = [
    0x20AC, 0, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0, 0x2039, 0x0152, 0, 0, 0,
    0, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0, 0x203A, 0x0153, 0, 0, 0x0178,
    0x00A0, 0x00A1, 0x00A2, 0x00A3, 0x00A4, 0x00A5, 0x00A6, 0x00A7, 0x00A8, 0x00A9, 0x00AA, 0x00AB, 0x00AC, 0x00AD, 0x00AE, 0x00AF,
    0x00B0, 0x00B1, 0x00B2, 0x00B3, 0x00B4, 0x00B5, 0x00B6, 0x00B7, 0x00B8, 0x00B9, 0x00BA, 0x00BB, 0x00BC, 0x00BD, 0x00BE, 0x00BF,
    0x00C0, 0x00C1, 0x00C2, 0x0102, 0x00C4, 0x00C5, 0x00C6, 0x00C7, 0x00C8, 0x00C9, 0x00CA, 0x00CB, 0x0300, 0x00CD, 0x00CE, 0x00CF,
    0x0110, 0x00D1, 0x0309, 0x00D3, 0x00D4, 0x01A0, 0x00D6, 0x00D7, 0x00D8, 0x00D9, 0x00DA, 0x00DB, 0x00DC, 0x01AF, 0x0303, 0x00DF,
    0x00E0, 0x00E1, 0x00E2, 0x0103, 0x00E4, 0x00E5, 0x00E6, 0x00E7, 0x00E8, 0x00E9, 0x00EA, 0x00EB, 0x0301, 0x00ED, 0x00EE, 0x00EF,
    0x0111, 0x00F1, 0x0323, 0x00F3, 0x00F4, 0x01A1, 0x00F6, 0x00F7, 0x00F8, 0x00F9, 0x00FA, 0x00FB, 0x00FC, 0x01B0, 0x20AB, 0x00FF,
];

/// Đọc theo Windows-1258. Gặp byte không có trong bảng mã ⇒ None (có thể là TCVN3/VNI hoặc tệp nhị phân: không đoán tiếp).
pub fn decode_cp1258(b: &[u8]) -> Option<String> {
    let mut out = String::with_capacity(b.len());
    for &c in b {
        if c < 0x80 {
            out.push(c as char);
        } else {
            let u = CP1258_HI[(c - 0x80) as usize];
            if u == 0 {
                return None;
            }
            out.push(char::from_u32(u as u32)?);
        }
    }
    Some(out)
}

/// UTF-16 có dấu BOM (FF FE hoặc FE FF). Lẻ byte hoặc cặp thay thế hỏng ⇒ None.
pub fn decode_utf16_bom(b: &[u8]) -> Option<String> {
    let le = b.starts_with(&[0xFF, 0xFE]);
    let body = &b[2..];
    if body.len() % 2 != 0 {
        return None;
    }
    let units: Vec<u16> = body.chunks_exact(2).map(|p| if le { u16::from_le_bytes([p[0], p[1]]) } else { u16::from_be_bytes([p[0], p[1]]) }).collect();
    String::from_utf16(&units).ok()
}

/// Đọc một tệp `.tex`/`.txt` thành chữ: UTF-8 (có/không BOM), UTF-16 có BOM (chắc chắn); không phải UTF-8 thì THỬ Windows-1258 và
/// đánh dấu là đoán (`encoding = windows-1258`) để giao diện bắt giáo viên xem chữ mẫu, xác nhận rồi mới nhập. Không đọc được ⇒ lỗi kèm cách khắc phục.
pub fn read_text(p: &Path) -> Result<ReadOut, String> {
    if !ext_ok(p) {
        return Err("Chỉ đọc tệp .tex hoặc .txt.".into());
    }
    let meta = fs::metadata(p).map_err(|e| format!("Không đọc được tệp: {e}"))?;
    if !meta.is_file() {
        return Err("Đây không phải một tệp.".into());
    }
    if meta.len() > MAX_FILE_BYTES {
        return Err(format!("Tệp quá lớn ({} MB; tối đa {} MB). Hãy tách nhỏ tệp.", meta.len() / 1024 / 1024, MAX_FILE_BYTES / 1024 / 1024));
    }
    let bytes = fs::read(p).map_err(|e| format!("Không đọc được tệp: {e}"))?;
    if bytes.starts_with(&[0xFF, 0xFE]) || bytes.starts_with(&[0xFE, 0xFF]) {
        return match decode_utf16_bom(&bytes) {
            Some(text) => Ok(ReadOut { text, bytes: bytes.len() as u64, had_bom: true, encoding: "utf-16".into() }),
            None => Err("Tệp lưu dạng UTF-16 nhưng bị hỏng nên không đọc được. Hãy mở bằng trình soạn thảo, lưu lại bằng UTF-8 rồi nhập lại.".into()),
        };
    }
    let (body, had_bom) = match bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        Some(b) => (b, true),
        None => (&bytes[..], false),
    };
    match std::str::from_utf8(body) {
        Ok(s) => Ok(ReadOut { text: s.to_string(), bytes: bytes.len() as u64, had_bom, encoding: "utf-8".into() }),
        Err(_) => match decode_cp1258(body) {
            Some(text) => Ok(ReadOut { text, bytes: bytes.len() as u64, had_bom, encoding: "windows-1258".into() }),
            None => Err("Tệp không phải UTF-8 và cũng không phải Windows-1258 (có thể là bảng mã cũ TCVN3/VNI) nên HEdu không đoán để tránh làm sai chữ. Hãy chuyển tệp sang UTF-8 (ví dụ bằng Unikey: Công cụ chuyển mã) rồi nhập lại.".into()),
        },
    }
}

// ---------------- lệnh Tauri ----------------

/// Quét tệp/thư mục (chạy ở luồng riêng để giao diện không đứng).
#[tauri::command]
pub async fn import_scan(paths: Vec<String>) -> Result<ScanOut, String> {
    if paths.is_empty() {
        return Err("Chưa chọn tệp hay thư mục.".into());
    }
    tauri::async_runtime::spawn_blocking(move || scan(&paths.into_iter().map(PathBuf::from).collect::<Vec<_>>())).await.map_err(|e| e.to_string())
}

/// Đọc MỘT tệp đã liệt kê bởi `import_scan` (hoặc chọn lẻ).
#[tauri::command]
pub async fn import_read(path: String) -> Result<ReadOut, String> {
    tauri::async_runtime::spawn_blocking(move || read_text(Path::new(&path))).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("hedu-imp-test-{}-{}", std::process::id(), name));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
    fn put(p: &Path, text: &str) {
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, text).unwrap();
    }
    fn names(o: &ScanOut) -> Vec<String> {
        o.files.iter().map(|f| if f.rel.is_empty() { f.name.clone() } else { format!("{}/{}", f.rel, f.name) }).collect()
    }

    #[test]
    fn thu_muc_long_nhau_thu_tu_tu_nhien_va_bo_qua_tep_la() {
        let d = dir("quet");
        let r = d.join("Lop12");
        put(&r.join("de10.tex"), "x");
        put(&r.join("de2.tex"), "x");
        put(&r.join("De1.TEX"), "x");
        put(&r.join("ghi chu.docx"), "x");
        put(&r.join("Chương 1").join("Hàm số 1.txt"), "x");
        put(&r.join("Chương 1").join("Tích phân").join("câu hỏi.tex"), "x");
        put(&r.join(".git").join("a.tex"), "x");
        put(&r.join("rong.tex"), "");
        let o = scan(&[r.clone()]);
        assert_eq!(names(&o), vec!["Lop12/Chương 1/Tích phân/câu hỏi.tex", "Lop12/Chương 1/Hàm số 1.txt", "Lop12/De1.TEX", "Lop12/de2.tex", "Lop12/de10.tex"], "thư mục trước tệp, thứ tự tự nhiên, thư mục con tính từ thư mục đã chọn, có tên tiếng Việt");
        assert!(o.skipped.iter().any(|s| s.reason.contains("không phải tệp .tex")), "tệp .docx được liệt kê là bị bỏ qua");
        assert!(o.skipped.iter().any(|s| s.reason == "tệp rỗng"));
        assert!(!o.skipped.iter().any(|s| s.path.contains(".git")) && !o.files.iter().any(|f| f.path.contains(".git")), "thư mục ẩn bị bỏ, không ồn ào");
        assert!(!o.truncated);
    }

    #[test]
    fn chon_le_nhieu_tep_khong_lap_va_khong_co_thu_muc_con() {
        let d = dir("le");
        put(&d.join("a.tex"), "x");
        put(&d.join("b.txt"), "x");
        let o = scan(&[d.join("b.txt"), d.join("a.tex"), d.join("a.tex"), d.join("khong-co.tex"), d.join("x.pdf")]);
        assert_eq!(o.files.iter().map(|f| f.name.as_str()).collect::<Vec<_>>(), vec!["b.txt", "a.tex"], "giữ thứ tự chọn, bỏ trùng");
        assert!(o.files.iter().all(|f| f.rel.is_empty()));
        assert_eq!(o.skipped.len(), 2, "tệp không có và .pdf được báo");
        // chọn cả thư mục lẫn tệp nằm trong nó: tệp chỉ được lấy một lần
        let o2 = scan(&[d.clone(), d.join("a.tex")]);
        assert_eq!(o2.files.len(), 2);
    }

    #[test]
    fn gioi_han_do_sau_kich_thuoc_va_so_tep() {
        let d = dir("gh");
        // quá sâu
        let mut deep = d.join("goc");
        for i in 0..8 { deep = deep.join(format!("c{i}")); }
        put(&deep.join("sau.tex"), "x");
        put(&d.join("goc").join("c0").join("c1").join("nong.tex"), "x");
        let o = scan(&[d.join("goc")]);
        assert_eq!(o.files.len(), 1, "chỉ lấy tệp trong giới hạn độ sâu");
        assert!(o.skipped.iter().any(|s| s.reason.contains("quá sâu")), "báo rõ thư mục quá sâu");
        // quá lớn
        let big = d.join("lon.tex");
        let f = fs::File::create(&big).unwrap();
        f.set_len(MAX_FILE_BYTES + 1).unwrap();
        let o = scan(&[big.clone()]);
        assert!(o.files.is_empty() && o.skipped[0].reason.contains("quá lớn"));
        assert!(read_text(&big).unwrap_err().contains("quá lớn"));
        // quá nhiều tệp: không cắt lặng lẽ
        let many = d.join("nhieu");
        for i in 0..(MAX_FILES + 5) { put(&many.join(format!("f{i:05}.tex")), "x"); }
        let o = scan(&[many]);
        assert_eq!(o.files.len(), MAX_FILES);
        assert!(o.truncated, "vượt giới hạn phải bật cờ truncated để giao diện báo và đề nghị chia lô");
    }

    #[test]
    fn doc_nguyen_van_bo_bom_giu_xuong_dong_va_tieng_viet() {
        let d = dir("doc");
        let body = "\\begin{ex}%[2D1H1-1]\r\n  Tính $\\dfrac{1}{2}$ — đạo hàm của hàm số\r\n  \\choice{\\True 1}{2}{3}{4}\r\n\\end{ex}\r\n";
        put(&d.join("a.tex"), body);
        let r = read_text(&d.join("a.tex")).unwrap();
        assert_eq!(r.text, body, "giống từng ký tự, kể cả \\r\\n và gạch chéo ngược");
        assert!(!r.had_bom);
        let mut with_bom = vec![0xEF, 0xBB, 0xBF];
        with_bom.extend_from_slice(body.as_bytes());
        fs::write(d.join("b.tex"), &with_bom).unwrap();
        let r = read_text(&d.join("b.tex")).unwrap();
        assert!(r.had_bom && r.text == body && r.bytes == with_bom.len() as u64, "bỏ đúng dấu BOM ở đầu, nội dung còn nguyên");
    }

    #[test]
    fn bang_ma_utf16_windows1258_va_tu_choi_dung_loai() {
        let d = dir("loi");
        // Windows-1258: "Tính đúng" — í là 0xED; "đ" là 0xF0; "ú" là 0xFA. Đọc được nhưng đánh dấu là ĐOÁN (giao diện bắt xác nhận)
        fs::write(d.join("cu.tex"), [b'T', 0xED, b'n', b'h', b' ', 0xF0, 0xFA, b'n', b'g']).unwrap();
        let r = read_text(&d.join("cu.tex")).unwrap();
        assert_eq!((r.text.as_str(), r.encoding.as_str()), ("Tính đúng", "windows-1258"));
        // dấu thanh tổ hợp: "ê" + dấu ngã (0xDE → U+0303) giữ nguyên dạng tổ hợp, giao diện chuẩn hoá NFC
        assert_eq!(decode_cp1258(&[0xEA, 0xDE]).unwrap(), "ê\u{0303}");
        // byte không có trong Windows-1258 (0x81) ⇒ không đoán tiếp, báo cách chuyển mã
        fs::write(d.join("tcvn.tex"), [b'T', 0x81, b'n']).unwrap();
        let e = read_text(&d.join("tcvn.tex")).unwrap_err();
        assert!(e.contains("TCVN3/VNI") && e.contains("UTF-8"), "{e}");
        // UTF-16 có BOM (LE và BE) đọc chắc chắn
        fs::write(d.join("u16.tex"), [0xFF, 0xFE, b'a', 0, 0xBF, 0x1E]).unwrap();
        let r = read_text(&d.join("u16.tex")).unwrap();
        assert_eq!((r.text.as_str(), r.encoding.as_str()), ("aế", "utf-16"));
        fs::write(d.join("u16be.tex"), [0xFE, 0xFF, 0, b'b']).unwrap();
        assert_eq!(read_text(&d.join("u16be.tex")).unwrap().text, "b");
        fs::write(d.join("u16le.tex"), [0xFF, 0xFE, b'a']).unwrap();
        assert!(read_text(&d.join("u16le.tex")).unwrap_err().contains("UTF-16"), "UTF-16 lẻ byte ⇒ lỗi, không đoán");
        // UTF-8 vẫn là utf-8
        put(&d.join("u8.tex"), "Tính");
        assert_eq!(read_text(&d.join("u8.tex")).unwrap().encoding, "utf-8");
        // sai đuôi, thư mục, không tồn tại
        put(&d.join("a.pdf"), "x");
        assert!(read_text(&d.join("a.pdf")).is_err());
        fs::create_dir_all(d.join("thu-muc.tex")).unwrap();
        assert!(read_text(&d.join("thu-muc.tex")).is_err());
        assert!(read_text(&d.join("khong-co.tex")).is_err());
    }

    #[test]
    fn khong_sua_khong_xoa_tep_nguon() {
        let d = dir("chi-doc");
        let p = d.join("a.tex");
        put(&p, "\\begin{ex}x\\end{ex}");
        let before = (fs::read(&p).unwrap(), fs::metadata(&p).unwrap().modified().unwrap());
        scan(&[d.clone()]);
        read_text(&p).unwrap();
        assert_eq!((fs::read(&p).unwrap(), fs::metadata(&p).unwrap().modified().unwrap()), before, "nội dung và giờ sửa tệp nguồn không đổi");
        assert_eq!(fs::read_dir(&d).unwrap().count(), 1, "không tạo tệp thừa");
    }

    #[test]
    fn doc_muoi_lam_mb_nhanh() {
        let d = dir("lon");
        let line = "\\begin{ex} Câu thử \\end{ex}\n";
        let text = line.repeat(15 * 1024 * 1024 / line.len());
        put(&d.join("lon.tex"), &text);
        let t = std::time::Instant::now();
        let r = read_text(&d.join("lon.tex")).unwrap();
        assert_eq!(r.text.len(), text.len());
        assert!(t.elapsed().as_secs() < 5, "{:?}", t.elapsed());
    }
}
