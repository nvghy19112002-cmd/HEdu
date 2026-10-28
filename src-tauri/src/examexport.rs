//! Xuất đề từng mã: mỗi mã đề một PDF (chế độ Đề), gói ZIP cho giáo viên hoặc cho học sinh.
//!
//! Nguyên tắc (đã chốt D1–D9, `claude/ke-hoach-pr3-pr4.md`):
//! - Nguồn sự thật là dự án trong Thư viện đề: `hedu-de.json` (mã đề, UID, đáp án) và `main-<mã>.tex`, `de-<mã>.tex`. Không đọc ngân hàng câu hỏi.
//! - Gói HỌC SINH chỉ chứa PDF đề (chế độ Đề, đã biên dịch qua hồ sơ ex_test nhận diện chắc); không CSV, không manifest, không nguồn LaTeX.
//! - Gói GIÁO VIÊN: PDF đề từng mã, (tuỳ chọn) PDF lời giải, CSV đáp án từng mã, nguồn LaTeX kèm tệp phụ thuộc, `manifest.json` có SHA-256.
//! - Ghi vào tệp `.part`, đọc lại và đối chiếu từng tệp rồi mới đổi tên; lỗi/huỷ ⇒ không có ZIP thiếu mã. Không bao giờ ghi đè bản xuất cũ.
//! - Mọi tệp đọc từ dự án đi qua `open_inside` (không theo liên kết/junction); đường dẫn không lấy từ metadata.
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use crate::examcompile::{self, compile, read_good_slot, slot_of, CompileOpts};
use crate::examlib::{bad_rel, is_link, open_inside, projects_dir, read_manifest, valid_id};
use crate::support;

/// Số mã tối đa mỗi lượt (D9).
pub const MAX_CODES: usize = 24;
/// Tổng dung lượng tối đa của một gói (cả nguồn lẫn PDF).
const MAX_PACKAGE_BYTES: u64 = 1_500_000_000;
/// Tệp nguồn tối đa đưa vào gói giáo viên.
const MAX_SRC_BYTES: u64 = 200 * 1024 * 1024;
const SPEC: &str = "hedu-de.json";

// ---------- dữ liệu đề đã lưu ----------

#[derive(Debug, Clone, PartialEq)]
pub struct CodeSpec {
    pub code: String,
    /// phần I–IV: (uid, đáp án)
    pub parts: [Vec<(String, String)>; 4],
}

#[derive(Debug, Clone)]
pub struct Spec {
    pub title: String,
    pub seed: u64,
    pub codes: Vec<CodeSpec>,
}

pub fn valid_code(c: &str) -> bool {
    !c.is_empty() && c.len() <= 8 && c.chars().all(|x| x.is_ascii_alphanumeric())
}

/// Đọc `hedu-de.json` do Tạo đề ghi. Thiếu hoặc sai cấu trúc ⇒ lỗi rõ ràng, không đoán.
pub fn parse_spec(text: &str) -> Result<Spec, String> {
    let v: serde_json::Value = serde_json::from_str(text).map_err(|e| format!("hedu-de.json không đọc được: {e}"))?;
    if v.get("v").and_then(|x| x.as_u64()) != Some(1) {
        return Err("hedu-de.json không phải phiên bản 1.".into());
    }
    let title = v.pointer("/thongTin/title").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let seed = v.get("hatGiong").and_then(|x| x.as_u64()).ok_or("hedu-de.json thiếu hạt giống.")?;
    let ma = v.get("maDe").and_then(|x| x.as_array()).ok_or("hedu-de.json thiếu danh sách mã đề.")?;
    let mut codes = Vec::new();
    let mut seen = HashSet::new();
    for m in ma {
        let code = m.get("ma").and_then(|x| x.as_str()).unwrap_or("");
        if !valid_code(code) {
            return Err(format!("Mã đề «{code}» không hợp lệ (chỉ chữ và số, tối đa 8 ký tự)."));
        }
        if !seen.insert(code.to_string()) {
            return Err(format!("Mã đề {code} bị lặp."));
        }
        let mut parts: [Vec<(String, String)>; 4] = Default::default();
        for (i, p) in ["p1", "p2", "p3", "p4"].iter().enumerate() {
            for it in m.pointer(&format!("/phan/{p}")).and_then(|x| x.as_array()).map(|a| a.as_slice()).unwrap_or(&[]) {
                let uid = it.get("uid").and_then(|x| x.as_str()).ok_or("Có câu thiếu UID trong hedu-de.json.")?;
                let key = it.get("dapAn").and_then(|x| x.as_str()).ok_or("Có câu thiếu đáp án trong hedu-de.json.")?;
                parts[i].push((uid.to_string(), key.to_string()));
            }
        }
        codes.push(CodeSpec { code: code.to_string(), parts });
    }
    if codes.is_empty() {
        return Err("hedu-de.json không có mã đề nào.".into());
    }
    Ok(Spec { title, seed, codes })
}

// ---------- tên tệp (D3) ----------

fn fold(c: char) -> Option<char> {
    let m = match c {
        'à' | 'á' | 'ả' | 'ã' | 'ạ' | 'ă' | 'ằ' | 'ắ' | 'ẳ' | 'ẵ' | 'ặ' | 'â' | 'ầ' | 'ấ' | 'ẩ' | 'ẫ' | 'ậ' => 'a',
        'è' | 'é' | 'ẻ' | 'ẽ' | 'ẹ' | 'ê' | 'ề' | 'ế' | 'ể' | 'ễ' | 'ệ' => 'e',
        'ì' | 'í' | 'ỉ' | 'ĩ' | 'ị' => 'i',
        'ò' | 'ó' | 'ỏ' | 'õ' | 'ọ' | 'ô' | 'ồ' | 'ố' | 'ổ' | 'ỗ' | 'ộ' | 'ơ' | 'ờ' | 'ớ' | 'ở' | 'ỡ' | 'ợ' => 'o',
        'ù' | 'ú' | 'ủ' | 'ũ' | 'ụ' | 'ư' | 'ừ' | 'ứ' | 'ử' | 'ữ' | 'ự' => 'u',
        'ỳ' | 'ý' | 'ỷ' | 'ỹ' | 'ỵ' => 'y',
        'đ' => 'd',
        c if c.is_ascii_alphanumeric() => c.to_ascii_lowercase(),
        _ => return None,
    };
    Some(m)
}

/// Tên ngắn an toàn trên Windows từ tên kỳ thi: chỉ a-z, 0-9 và '-'; không rỗng; không trùng tên dành riêng.
pub fn slug(title: &str) -> String {
    let mut out = String::new();
    for c in title.to_lowercase().chars() {
        match fold(c) {
            Some(x) => out.push(x),
            None => {
                if !out.ends_with('-') {
                    out.push('-');
                }
            }
        }
    }
    let t: String = out.trim_matches('-').chars().take(40).collect();
    let t = t.trim_matches('-').to_string();
    if t.is_empty() {
        return "de".into();
    }
    const RESERVED: [&str; 8] = ["con", "prn", "aux", "nul", "com1", "com2", "lpt1", "lpt2"];
    if RESERVED.contains(&t.as_str()) {
        return format!("de-{t}");
    }
    t
}

fn base36(mut n: u128) -> String {
    const D: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if n == 0 {
        return "0".into();
    }
    let mut v = Vec::new();
    while n > 0 {
        v.push(D[(n % 36) as usize]);
        n /= 36;
    }
    v.reverse();
    String::from_utf8(v).unwrap()
}

static EXPORT_SEQ: Mutex<u32> = Mutex::new(0);

/// Định danh lượt xuất: chữ thường và số (thời điểm tính bằng mili-giây, hệ 36, thêm số thứ tự trong phiên) nên luôn hợp lệ làm tên tệp và khác nhau giữa hai lần xuất.
pub fn export_id() -> String {
    let ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let mut g = EXPORT_SEQ.lock().unwrap_or_else(|e| e.into_inner());
    *g += 1;
    format!("e{}{}", base36(ms), base36(*g as u128))
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Kind {
    Teacher,
    Student,
}
impl Kind {
    fn tag(self) -> &'static str {
        match self {
            Kind::Teacher => "giaovien",
            Kind::Student => "hocsinh",
        }
    }
}

pub fn zip_name(slug: &str, seed: u64, export_id: &str, kind: Kind) -> String {
    format!("{slug}-{:08x}-{export_id}-{}.zip", seed & 0xffff_ffff, kind.tag())
}

// ---------- đáp án CSV ----------

fn csv_cell(s: &str) -> String {
    if s.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

/// CSV đáp án riêng của một mã đề (UTF-8 có BOM để Excel đọc đúng tiếng Việt; xuống dòng CRLF).
pub fn answers_csv(c: &CodeSpec) -> String {
    let names = ["Phần I", "Phần II", "Phần III", "Phần IV"];
    let mut s = String::from("\u{feff}Mã đề,Phần,Câu,UID,Đáp án\r\n");
    for (i, part) in c.parts.iter().enumerate() {
        for (k, (uid, key)) in part.iter().enumerate() {
            s.push_str(&format!("{},{},{},{},{}\r\n", csv_cell(&c.code), names[i], k + 1, csv_cell(uid), csv_cell(key)));
        }
    }
    s
}

// ---------- đối chiếu nguồn từng mã ----------

/// Các khối `\begin{ex}…\end{ex}` của từng phần (I–IV) trong `de-<mã>.tex`, theo các lệnh \caulc/\cauds/\caukq/\cautl.
pub fn part_blocks(tex: &str) -> [Vec<String>; 4] {
    let marks = ["\\caulc", "\\cauds", "\\caukq", "\\cautl"];
    let mut pos: Vec<(usize, usize)> = Vec::new();
    for (i, m) in marks.iter().enumerate() {
        let mut from = 0;
        while let Some(k) = tex[from..].find(m) {
            let at = from + k;
            let after = tex[at + m.len()..].chars().next();
            if !after.map(|c| c.is_ascii_alphabetic()).unwrap_or(false) && !tex[..at].ends_with('%') {
                pos.push((at, i));
                break;
            }
            from = at + m.len();
        }
    }
    pos.sort();
    let mut out: [Vec<String>; 4] = Default::default();
    for (n, (at, part)) in pos.iter().enumerate() {
        let end = pos.get(n + 1).map(|x| x.0).unwrap_or(tex.len());
        let mut cur: Option<String> = None;
        for l in tex[*at..end].lines() {
            let t = l.trim_start();
            if cur.is_none() && t.starts_with("\\begin{ex}") {
                cur = Some(String::new());
            }
            if let Some(b) = cur.as_mut() {
                b.push_str(l);
                b.push('\n');
                if t.starts_with("\\end{ex}") {
                    out[*part].push(cur.take().unwrap());
                }
            }
        }
    }
    out
}

/// Số câu mỗi phần trong `de-<mã>.tex`.
pub fn tex_part_counts(tex: &str) -> [usize; 4] {
    let b = part_blocks(tex);
    [b[0].len(), b[1].len(), b[2].len(), b[3].len()]
}

/// Chỉ số byte kết thúc (sau dấu `}`) của nhóm `{…}` bắt đầu tại b[i]; bỏ qua ký tự sau dấu `\`.
fn group_end(b: &[u8], i: usize) -> Option<usize> {
    if b.get(i) != Some(&b'{') {
        return None;
    }
    let mut d = 0;
    let mut j = i;
    while j < b.len() {
        match b[j] {
            b'\\' => j += 1,
            b'{' => d += 1,
            b'}' => {
                d -= 1;
                if d == 0 {
                    return Some(j + 1);
                }
            }
            _ => {}
        }
        j += 1;
    }
    None
}

/// Che chú thích %, \loigiai{…} và tikzpicture bằng khoảng trắng (giữ nguyên độ dài byte) để tìm lệnh cấu trúc của câu.
fn mask_structure(tex: &str) -> String {
    let mut b: Vec<u8> = tex.as_bytes().to_vec();
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && (i == 0 || b[i - 1] != b'\\') {
            while i < b.len() && b[i] != b'\n' {
                b[i] = b' ';
                i += 1;
            }
        } else {
            i += 1;
        }
    }
    let t = String::from_utf8_lossy(&b).into_owned();
    let mut b = t.into_bytes();
    let mut i = 0;
    while let Some(k) = find_from(&b, b"\\loigiai", i) {
        let mut j = k + 8;
        while j < b.len() && b[j].is_ascii_whitespace() {
            j += 1;
        }
        match group_end(&b, j) {
            Some(e) => {
                for x in &mut b[k..e] {
                    *x = b' ';
                }
                i = e;
            }
            None => i = k + 8,
        }
    }
    let mut i = 0;
    while let Some(k) = find_from(&b, b"\\begin{tikzpicture}", i) {
        let e = find_from(&b, b"\\end{tikzpicture}", k).map(|x| x + 17).unwrap_or(b.len());
        for x in &mut b[k..e] {
            *x = b' ';
        }
        i = e;
    }
    String::from_utf8_lossy(&b).into_owned()
}

fn find_from(b: &[u8], pat: &[u8], from: usize) -> Option<usize> {
    if from >= b.len() {
        return None;
    }
    b[from..].windows(pat.len()).position(|w| w == pat).map(|k| k + from)
}

/// Vị trí lệnh `\name` (không bị nối thêm chữ cái) trong văn bản đã che.
fn find_cmd(mask: &str, name: &str) -> Option<usize> {
    let pat = format!("\\{name}");
    let mut from = 0;
    while let Some(k) = mask[from..].find(&pat) {
        let at = from + k;
        let after = mask[at + pat.len()..].chars().next();
        if !after.map(|c| c.is_ascii_alphabetic()).unwrap_or(false) {
            return Some(at);
        }
        from = at + pat.len();
    }
    None
}

fn read_groups(b: &[u8], mut i: usize, n: usize) -> Vec<(usize, usize)> {
    let mut out = Vec::new();
    for _ in 0..n {
        while i < b.len() && b[i].is_ascii_whitespace() {
            i += 1;
        }
        match group_end(b, i) {
            Some(e) => {
                out.push((i + 1, e - 1));
                i = e;
            }
            None => break,
        }
    }
    out
}

/// Đáp án đọc từ CHÍNH văn bản một câu (không dùng bộ phân tích khác): phần I = chữ A–D theo \True; phần II = ĐS theo \True từng ý; phần III = nội dung \shortans; phần IV = —.
pub fn block_answer(part: usize, block: &str) -> String {
    let mask = mask_structure(block);
    let b = mask.as_bytes();
    let skip_opt = |mut i: usize| -> usize {
        while i < b.len() && b[i].is_ascii_whitespace() {
            i += 1;
        }
        if b.get(i) == Some(&b'[') {
            if let Some(e) = mask[i..].find(']') {
                return i + e + 1;
            }
        }
        i
    };
    let has_true = |(a, e): (usize, usize)| mask[a..e].matches("\\True").count();
    match part {
        0 => match find_cmd(&mask, "choice") {
            Some(k) => {
                let g = read_groups(b, skip_opt(k + 7), 4);
                let t: Vec<usize> = g.iter().map(|x| has_true(*x)).collect();
                if g.len() == 4 && t.iter().sum::<usize>() == 1 { ["A", "B", "C", "D"][t.iter().position(|x| *x == 1).unwrap()].to_string() } else { "?".into() }
            }
            None => "?".into(),
        },
        1 => match find_cmd(&mask, "choiceTF") {
            Some(k) => {
                let g = read_groups(b, skip_opt(k + 9), 4);
                if g.len() == 4 { g.iter().map(|x| if has_true(*x) > 0 { 'Đ' } else { 'S' }).collect() } else { "?".into() }
            }
            None => "?".into(),
        },
        2 => match find_cmd(&mask, "shortans") {
            Some(k) => match read_groups(b, skip_opt(k + 9), 1).first() {
                Some((a, e)) if !block[*a..*e].trim().is_empty() => block[*a..*e].trim().to_string(),
                _ => "?".into(),
            },
            None => "?".into(),
        },
        _ => "—".into(),
    }
}

/// Đáp án từng câu trong `de-<mã>.tex` phải KHỚP với hedu-de.json (mỗi câu một dấu hiệu độc lập: \True/\shortans trong chính tệp).
pub fn check_answers(c: &CodeSpec, de_tex: &str) -> Result<(), String> {
    let blocks = part_blocks(de_tex);
    let names = ["Phần I", "Phần II", "Phần III", "Phần IV"];
    for (i, part) in blocks.iter().enumerate() {
        for (k, blk) in part.iter().enumerate() {
            let got = block_answer(i, blk);
            if let Some((_, want)) = c.parts[i].get(k) {
                if &got != want {
                    return Err(format!("de-{}.tex, {} câu {}: đáp án trong tệp là «{got}», hedu-de.json ghi «{want}».", c.code, names[i], k + 1));
                }
            }
        }
    }
    Ok(())
}

fn made_of(tex: &str) -> Option<String> {
    let k = tex.find("\\def\\made{")?;
    let rest = &tex[k + "\\def\\made{".len()..];
    Some(rest[..rest.find('}')?].to_string())
}

/// Tệp chính của mã không được chèn bảng đáp án hay bật lời giải: đó là PDF đề.
pub fn main_has_answers(main_tex: &str) -> bool {
    main_tex.lines().any(|l| {
        let t = l.trim();
        !t.starts_with('%') && (t.contains("\\input{dapan") || t.contains("\\include{dapan") || t.contains("\\anloigiai") && !t.contains("%\\anloigiai"))
    })
}

/// Đối chiếu `main-<mã>.tex` và `de-<mã>.tex` với `hedu-de.json`: mã, số câu từng phần, không lộ đáp án.
pub fn check_code_files(c: &CodeSpec, main_tex: &str, de_tex: &str) -> Result<(), String> {
    if main_has_answers(main_tex) {
        return Err(format!("main-{}.tex có chèn bảng đáp án hoặc bật lời giải nên không dùng làm PDF đề.", c.code));
    }
    if !main_tex.contains(&format!("\\input{{de-{}}}", c.code)) {
        return Err(format!("main-{0}.tex không gọi de-{0}.", c.code));
    }
    if made_of(de_tex).as_deref() != Some(c.code.as_str()) {
        return Err(format!("de-{0}.tex không khai báo \\made là {0}.", c.code));
    }
    let want = [c.parts[0].len(), c.parts[1].len(), c.parts[2].len(), c.parts[3].len()];
    let got = tex_part_counts(de_tex);
    if got != want {
        return Err(format!("de-{}.tex có {:?} câu mỗi phần, hedu-de.json ghi {:?}.", c.code, got, want));
    }
    check_answers(c, de_tex)
}

// ---------- dung lượng đĩa ----------

#[cfg(windows)]
pub fn free_space(dir: &Path) -> Option<u64> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    let w: Vec<u16> = dir.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    let mut avail = 0u64;
    let (mut total, mut free) = (0u64, 0u64);
    // SAFETY: con trỏ hợp lệ trong suốt lời gọi; chuỗi kết thúc bằng 0.
    let ok = unsafe { GetDiskFreeSpaceExW(w.as_ptr(), &mut avail, &mut total, &mut free) };
    (ok != 0).then_some(avail)
}
#[cfg(not(windows))]
pub fn free_space(_dir: &Path) -> Option<u64> {
    None
}

// ---------- gói ----------

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct CodeResult {
    pub code: String,
    /// ok | failed | cancelled | skipped
    pub status: String,
    pub message: String,
    pub pages: Option<u32>,
    pub cached: bool,
    pub sha256: Option<String>,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExportOut {
    pub ok: bool,
    pub cancelled: bool,
    pub zip_path: Option<String>,
    pub zip_bytes: Option<u64>,
    pub export_id: String,
    pub message: String,
    pub results: Vec<CodeResult>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub id: String,
    pub phase: String,
    pub index: usize,
    pub total: usize,
    pub code: String,
}

pub struct PdfOut {
    pub bytes: Vec<u8>,
    pub pages: Option<u32>,
    pub fingerprint: String,
    pub cached: bool,
    pub tex_version: String,
}
pub enum Fail {
    Msg(String),
    Cancelled,
}

pub struct SourceFile {
    pub path: String,
    pub bytes: Vec<u8>,
}

pub struct Plan<'a> {
    pub project_id: &'a str,
    pub project_name: &'a str,
    pub slug: String,
    pub kind: Kind,
    pub spec: &'a Spec,
    pub codes: Vec<String>,
    pub with_solution: bool,
    pub sources: Vec<SourceFile>,
    pub export_id: String,
    pub now: String,
    pub hedu_version: &'a str,
    /// giới hạn dung lượng gói (mặc định `MAX_PACKAGE_BYTES`); chỉ đổi trong kiểm thử
    pub max_bytes: u64,
    /// CHỈ KIỂM THỬ: gọi ở đầu mỗi giai đoạn ghi ("nguon", "manifest", "dong", "kiem", "cong-bo"); trả Err để ép lỗi, hoặc đặt cờ huỷ rồi trả Ok
    pub hook: Option<&'a dyn Fn(&str) -> Result<(), String>>,
}

fn sha_hex(b: &[u8]) -> String {
    Sha256::digest(b).iter().map(|x| format!("{x:02x}")).collect()
}

fn opts() -> zip::write::SimpleFileOptions {
    zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored)
}

struct Entry {
    path: String,
    bytes: u64,
    sha256: String,
}

struct PkgWriter {
    z: zip::ZipWriter<fs::File>,
    entries: Vec<Entry>,
    total: u64,
    max: u64,
    names: HashSet<String>,
}

impl PkgWriter {
    fn add(&mut self, path: &str, data: &[u8]) -> Result<(), String> {
        if path.is_empty() || path.starts_with('/') || path.contains("..") || path.contains('\\') {
            return Err(format!("Tên mục «{path}» trong gói không hợp lệ."));
        }
        if !self.names.insert(path.to_lowercase()) {
            return Err(format!("Tên mục «{path}» bị trùng trong gói."));
        }
        self.total += data.len() as u64;
        if self.total > self.max {
            return Err("Gói vượt quá giới hạn dung lượng.".into());
        }
        self.z.start_file(path, opts()).map_err(|e| format!("Không ghi được ZIP: {e}"))?;
        self.z.write_all(data).map_err(|e| format!("Không ghi được ZIP: {e}"))?;
        self.entries.push(Entry { path: path.to_string(), bytes: data.len() as u64, sha256: sha_hex(data) });
        Ok(())
    }
}

/// Đọc lại ZIP bằng bộ đọc và đối chiếu từng mục (tên, kích thước, SHA-256) với những gì đã ghi. Sai một mục ⇒ lỗi.
pub fn verify_zip(path: &Path, want: &[(String, u64, String)]) -> Result<(), String> {
    let f = fs::File::open(path).map_err(|e| format!("Không mở lại được ZIP để kiểm: {e}"))?;
    let mut a = zip::ZipArchive::new(f).map_err(|e| format!("ZIP vừa ghi không đọc lại được: {e}"))?;
    if a.len() != want.len() {
        return Err(format!("ZIP có {} mục, cần {}.", a.len(), want.len()));
    }
    let mut by: HashMap<&str, &(String, u64, String)> = HashMap::new();
    for w in want {
        by.insert(w.0.as_str(), w);
    }
    for i in 0..a.len() {
        let mut e = a.by_index(i).map_err(|e| format!("Không đọc được mục {i}: {e}"))?;
        let name = e.name().to_string();
        let w = by.get(name.as_str()).ok_or_else(|| format!("ZIP có mục lạ «{name}»."))?;
        let mut b = Vec::new();
        e.read_to_end(&mut b).map_err(|e| format!("Không đọc được «{name}»: {e}"))?; // lỗi CRC của ZIP cũng báo ở đây
        if b.len() as u64 != w.1 || sha_hex(&b) != w.2 {
            return Err(format!("Mục «{name}» trong ZIP không khớp với bản đã ghi."));
        }
    }
    Ok(())
}

/// Tệp tạm tự xoá khi ra khỏi phạm vi (thành công, lỗi `?`, huỷ, thậm chí panic) trừ khi đã `keep()`.
/// Khai báo TRƯỚC bộ ghi ZIP để bộ ghi (giữ tay cầm tệp) được đóng trước khi xoá.
struct TempFile {
    path: PathBuf,
    keep: bool,
}
impl TempFile {
    fn new(path: PathBuf) -> Self {
        TempFile { path, keep: false }
    }
}
impl Drop for TempFile {
    fn drop(&mut self) {
        if !self.keep {
            let _ = fs::remove_file(&self.path);
        }
    }
}

/// Dựng gói. `provider(mã, chế độ)` trả PDF của một mã. Chỉ khi MỌI mã thành công và ZIP đọc lại khớp mới đổi tên thành ZIP chính thức.
/// Mọi đường thoát (thành công, lỗi, huỷ ở bất kỳ giai đoạn nào) đều đi qua `TempFile`: không bao giờ để `.part` mồ côi, ZIP dở dang hay đè bản cũ.
pub fn build_package(
    plan: &Plan,
    dest_dir: &Path,
    provider: &mut dyn FnMut(&str, &str) -> Result<PdfOut, Fail>,
    progress: &dyn Fn(Progress),
    cancel: &AtomicBool,
) -> Result<ExportOut, String> {
    let mut out = ExportOut { export_id: plan.export_id.clone(), ..Default::default() };
    if plan.codes.is_empty() || plan.codes.len() > MAX_CODES {
        return Err(format!("Mỗi lượt xuất 1 đến {MAX_CODES} mã đề."));
    }
    let md = fs::symlink_metadata(dest_dir).map_err(|e| format!("Thư mục đích không dùng được: {e}"))?;
    if !md.is_dir() || is_link(&md) {
        return Err("Thư mục đích phải là thư mục thật (không phải liên kết).".into());
    }
    let name = zip_name(&plan.slug, plan.spec.seed, &plan.export_id, plan.kind);
    let part_path = dest_dir.join(format!("{name}.part"));
    let file = fs::OpenOptions::new().write(true).create_new(true).open(&part_path).map_err(|e| format!("Không tạo được tệp tạm trong thư mục đích: {e}"))?;
    let _part = TempFile::new(part_path.clone()); // khai báo trước `w`: w đóng tay cầm trước, rồi mới xoá
    let mut w = PkgWriter { z: zip::ZipWriter::new(file), entries: Vec::new(), total: 0, max: plan.max_bytes, names: HashSet::new() };
    let hook = |ph: &str| -> Result<(), String> { plan.hook.map(|h| h(ph)).unwrap_or(Ok(())) };
    macro_rules! stop_if_cancelled {
        ($when:expr) => {
            if cancel.load(Ordering::SeqCst) {
                out.cancelled = true;
                out.message = format!("Đã dừng ({}). Không tạo ZIP (không có ZIP thiếu mã).", $when);
                return Ok(out);
            }
        };
    }

    let student = plan.kind == Kind::Student;
    let mut manifest_codes = Vec::new();
    let mut xl_codes: Vec<CodeSpec> = Vec::new();
    let total = plan.codes.len();
    let mut any_fail = false;
    for (idx, code) in plan.codes.iter().enumerate() {
        if cancel.load(Ordering::SeqCst) {
            out.cancelled = true;
            out.results.push(CodeResult { code: code.clone(), status: "cancelled".into(), message: "Đã dừng trước khi dịch mã này.".into(), ..Default::default() });
            continue;
        }
        let spec = match plan.spec.codes.iter().find(|c| &c.code == code) {
            Some(s) => s,
            None => {
                any_fail = true;
                out.results.push(CodeResult { code: code.clone(), status: "failed".into(), message: "Mã này không có trong hedu-de.json.".into(), ..Default::default() });
                continue;
            }
        };
        let mut modes = vec![("de", "de")];
        if plan.with_solution && !student {
            modes.push(("loigiai", "loigiai"));
        }
        let mut res = CodeResult { code: code.clone(), status: "ok".into(), ..Default::default() };
        let mut pdfs: Vec<(&str, PdfOut)> = Vec::new();
        for (mode, label) in &modes {
            progress(Progress { id: plan.project_id.into(), phase: format!("dich-{label}"), index: idx + 1, total, code: code.clone() });
            match provider(code, mode) {
                Ok(p) => pdfs.push((label, p)),
                Err(Fail::Cancelled) => {
                    out.cancelled = true;
                    res.status = "cancelled".into();
                    res.message = "Đã dừng khi đang dịch.".into();
                    break;
                }
                Err(Fail::Msg(m)) => {
                    any_fail = true;
                    res.status = "failed".into();
                    res.message = m;
                    break;
                }
            }
        }
        if res.status == "ok" {
            let de = &pdfs[0].1;
            if de.bytes.len() < 8 || &de.bytes[..5] != b"%PDF-" {
                any_fail = true;
                res.status = "failed".into();
                res.message = "Tệp dịch ra không phải PDF hợp lệ.".into();
            } else {
                res.pages = de.pages;
                res.cached = de.cached;
                res.sha256 = Some(sha_hex(&de.bytes));
            }
        }
        if res.status == "ok" {
            let base = format!("{}-{}", plan.slug, code);
            let mut mcode = json!({ "ma": code, "soCau": { "p1": spec.parts[0].len(), "p2": spec.parts[1].len(), "p3": spec.parts[2].len(), "p4": spec.parts[3].len() },
                "uid": spec.parts.iter().flatten().map(|x| x.0.clone()).collect::<Vec<_>>() });
            for (label, p) in &pdfs {
                let path = if student { format!("{base}-{label}.pdf") } else { format!("{label}/{base}-{label}.pdf") };
                w.add(&path, &p.bytes)?;
                mcode[format!("pdf_{label}")] = json!({ "tep": path, "bytes": p.bytes.len(), "sha256": sha_hex(&p.bytes), "trang": p.pages, "dauVan": p.fingerprint, "dungLaiBoDem": p.cached, "texLive": p.tex_version });
            }
            if !student {
                let csv = answers_csv(spec);
                let cp = format!("dapan/{}-dapan-{code}.csv", plan.slug);
                w.add(&cp, csv.as_bytes())?;
                mcode["csvDapAn"] = json!({ "tep": cp, "sha256": sha_hex(csv.as_bytes()) });
                xl_codes.push(spec.clone());
            }
            manifest_codes.push(mcode);
        }
        out.results.push(res);
    }

    if out.cancelled || any_fail || out.results.iter().any(|r| r.status != "ok") {
        out.message = if out.cancelled { "Đã dừng. Không tạo ZIP (không có ZIP thiếu mã).".into() } else { "Có mã đề lỗi nên KHÔNG tạo ZIP. Các mã đã dịch xong vẫn được giữ trong bộ đệm để thử lại.".into() };
        return Ok(out);
    }

    if !student {
        let refs: Vec<&CodeSpec> = xl_codes.iter().collect();
        let xl = crate::examxlsx::answers_xlsx(&refs)?;
        w.add(&format!("dapan/{}-dap-an.xlsx", plan.slug), &xl)?;
        hook("nguon")?;
        stop_if_cancelled!("khi ghi nguồn");
        for (i, s) in plan.sources.iter().enumerate() {
            if i % 16 == 15 {
                stop_if_cancelled!("khi ghi nguồn");
            }
            w.add(&format!("nguon/{}", s.path), &s.bytes)?;
        }
        hook("manifest")?;
        stop_if_cancelled!("trước khi ghi manifest");
        let files: Vec<_> = w.entries.iter().map(|e| json!({ "tep": e.path, "bytes": e.bytes, "sha256": e.sha256 })).collect();
        let manifest = json!({
            "v": 1, "loai": "giao-vien", "luotXuat": plan.export_id, "tao": plan.now, "hedu": plan.hedu_version,
            "de": { "id": plan.project_id, "ten": plan.project_name }, "hatGiong": plan.spec.seed,
            "ghiChu": "Gói giáo viên: có đáp án và nguồn LaTeX. KHÔNG phát cho học sinh. Gói học sinh chỉ chứa PDF đề.",
            "maDe": manifest_codes, "tep": files,
        });
        let text = serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?;
        w.add("manifest.json", &text)?;
    }
    let want: Vec<(String, u64, String)> = w.entries.iter().map(|e| (e.path.clone(), e.bytes, e.sha256.clone())).collect();
    hook("dong")?;
    let PkgWriter { z, .. } = w;
    let f = z.finish().map_err(|e| format!("Không hoàn tất được ZIP: {e}"))?;
    f.sync_all().ok();
    drop(f);
    hook("kiem")?;
    stop_if_cancelled!("khi kiểm ZIP");
    verify_zip(&part_path, &want).map_err(|e| format!("ZIP không qua bước đối chiếu nên đã bỏ: {e}"))?;
    // Giữ chỗ tên cuối bằng create_new rồi đổi tên đè lên chính chỗ giữ của mình: không bao giờ ghi đè bản xuất cũ.
    hook("cong-bo")?;
    stop_if_cancelled!("ngay trước khi công bố");
    let mut final_path = dest_dir.join(&name);
    let mut n = 1;
    loop {
        match fs::OpenOptions::new().write(true).create_new(true).open(&final_path) {
            Ok(_) => break,
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists && n < 1000 => {
                n += 1;
                final_path = dest_dir.join(name.replace(".zip", &format!("-{n}.zip")));
            }
            Err(e) => return Err(format!("Không đặt được tên tệp ZIP: {e}")),
        }
    }
    let mut reserved = TempFile::new(final_path.clone()); // chỗ giữ tên: lỗi ở bước đổi tên thì xoá đúng tệp rỗng của mình
    fs::rename(&part_path, &final_path).map_err(|e| format!("Không đổi tên được ZIP: {e}"))?;
    reserved.keep = true;
    out.ok = true;
    out.zip_bytes = fs::metadata(&final_path).map(|m| m.len()).ok();
    out.zip_path = Some(final_path.to_string_lossy().into_owned());
    out.message = format!("Đã tạo gói {} gồm {} mã đề.", if student { "học sinh" } else { "giáo viên" }, total);
    Ok(out)
}

// ---------- đọc dự án ----------

fn read_project_text(lib: &Path, id: &str, rel: &str, cap: u64) -> Result<String, String> {
    let dir = projects_dir(lib).join(id);
    let mut f = open_inside(&dir, rel)?;
    let mut b = Vec::new();
    (&mut f).take(cap + 1).read_to_end(&mut b).map_err(|e| format!("Không đọc được {rel}: {e}"))?;
    if b.len() as u64 > cap {
        return Err(format!("{rel} quá lớn."));
    }
    String::from_utf8(b).map_err(|_| format!("{rel} không phải UTF-8."))
}

fn read_project_bytes(lib: &Path, id: &str, rel: &str) -> Result<Vec<u8>, String> {
    let dir = projects_dir(lib).join(id);
    let mut f = open_inside(&dir, rel)?;
    let mut b = Vec::new();
    (&mut f).take(MAX_SRC_BYTES + 1).read_to_end(&mut b).map_err(|e| format!("Không đọc được {rel}: {e}"))?;
    if b.len() as u64 > MAX_SRC_BYTES {
        return Err(format!("{rel} quá lớn."));
    }
    Ok(b)
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct CodeInfo {
    pub code: String,
    pub has_main: bool,
    pub has_de: bool,
    pub counts: [usize; 4],
    /// null = đã đối chiếu khớp hedu-de.json; còn lại là lý do chưa dùng được
    pub problem: Option<String>,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct CodesInfo {
    pub has_spec: bool,
    pub title: String,
    pub seed: u64,
    pub codes: Vec<CodeInfo>,
    pub problems: Vec<String>,
    /// có đủ dữ liệu để bổ sung tệp chính từng mã (D4)
    pub can_backfill: bool,
    pub max_codes: usize,
}

pub fn codes_info(lib: &Path, id: &str) -> Result<CodesInfo, String> {
    if !valid_id(id) {
        return Err("Mã dự án không hợp lệ.".into());
    }
    let m = read_manifest(lib, id)?;
    let mut info = CodesInfo { max_codes: MAX_CODES, ..Default::default() };
    let text = match read_project_text(lib, id, SPEC, 8 * 1024 * 1024) {
        Ok(t) => t,
        Err(_) => {
            info.problems.push("Đề này không được tạo bằng Tạo đề (không có hedu-de.json), nên không xuất từng mã được.".into());
            return Ok(info);
        }
    };
    let spec = match parse_spec(&text) {
        Ok(s) => s,
        Err(e) => {
            info.problems.push(e);
            return Ok(info);
        }
    };
    info.has_spec = true;
    info.title = spec.title.clone();
    info.seed = spec.seed;
    if spec.codes.len() > MAX_CODES {
        info.problems.push(format!("Đề có {} mã, vượt giới hạn {MAX_CODES} mã mỗi lượt.", spec.codes.len()));
    }
    let has = |rel: &str| m.files.iter().any(|f| f.rel == rel);
    let mut all_de = true;
    for c in &spec.codes {
        let (mn, dn) = (format!("main-{}.tex", c.code), format!("de-{}.tex", c.code));
        let mut ci = CodeInfo { code: c.code.clone(), has_main: has(&mn), has_de: has(&dn), ..Default::default() };
        if ci.has_de {
            match read_project_text(lib, id, &dn, 32 * 1024 * 1024) {
                Ok(t) => ci.counts = tex_part_counts(&t),
                Err(e) => ci.problem = Some(e),
            }
        } else {
            all_de = false;
            ci.problem = Some(format!("Thiếu {dn}."));
        }
        if ci.problem.is_none() && ci.has_main {
            match (read_project_text(lib, id, &mn, 1024 * 1024), read_project_text(lib, id, &dn, 32 * 1024 * 1024)) {
                (Ok(mt), Ok(dt)) => ci.problem = check_code_files(c, &mt, &dt).err(),
                (Err(e), _) | (_, Err(e)) => ci.problem = Some(e),
            }
        }
        info.codes.push(ci);
    }
    info.can_backfill = all_de && m.status != "finalized" && has("main.tex") && info.codes.iter().any(|c| !c.has_main);
    Ok(info)
}

/// Các tệp nguồn đưa vào gói giáo viên: mọi tệp của dự án (nguyên byte) + gói đi kèm HEdu nếu dự án chưa có, để biên dịch lại được.
fn collect_sources(lib: &Path, id: &str) -> Result<Vec<SourceFile>, String> {
    let m = read_manifest(lib, id)?;
    let mut out = Vec::new();
    let mut total = 0u64;
    for f in &m.files {
        if bad_rel(&f.rel).is_some() {
            continue;
        }
        let b = read_project_bytes(lib, id, &f.rel)?;
        total += b.len() as u64;
        if total > MAX_SRC_BYTES {
            return Err("Nguồn của đề quá lớn để đóng gói.".into());
        }
        out.push(SourceFile { path: f.rel.clone(), bytes: b });
    }
    for (name, bytes) in support::FILES {
        if !out.iter().any(|s| s.path.eq_ignore_ascii_case(name)) {
            out.push(SourceFile { path: (*name).to_string(), bytes: bytes.to_vec() });
        }
    }
    Ok(out)
}

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExportOpts {
    /// giao-vien | hoc-sinh
    pub kind: String,
    /// rỗng = mọi mã trong hedu-de.json
    pub codes: Option<Vec<String>>,
    pub with_solution: Option<bool>,
    pub dest_dir: String,
    pub engine: Option<String>,
    pub tex_bin: Option<String>,
    pub timeout_secs: Option<u64>,
}

static CANCELS: Mutex<Option<HashMap<String, Arc<AtomicBool>>>> = Mutex::new(None);

pub fn cancel_export(id: &str) -> bool {
    let hit = CANCELS.lock().unwrap_or_else(|e| e.into_inner()).as_ref().and_then(|m| m.get(id).cloned());
    match hit {
        Some(f) => {
            f.store(true, Ordering::SeqCst);
            examcompile::cancel(id);
            true
        }
        None => false,
    }
}

struct CancelGuard(String);
impl Drop for CancelGuard {
    fn drop(&mut self) {
        if let Some(m) = CANCELS.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
            m.remove(&self.0);
        }
    }
}

pub fn export_codes(root: &Path, id: &str, o: &ExportOpts, support_dir: &Option<PathBuf>, progress: &dyn Fn(Progress)) -> Result<ExportOut, String> {
    if !valid_id(id) {
        return Err("Mã dự án không hợp lệ.".into());
    }
    let kind = match o.kind.as_str() {
        "giao-vien" => Kind::Teacher,
        "hoc-sinh" => Kind::Student,
        _ => return Err("Loại gói không hợp lệ.".into()),
    };
    let lib = root.join("exam-library");
    let m = read_manifest(&lib, id)?;
    let info = codes_info(&lib, id)?;
    if !info.has_spec {
        return Err(info.problems.first().cloned().unwrap_or_else(|| "Đề chưa có dữ liệu mã đề.".into()));
    }
    if let Some(p) = info.problems.first() {
        return Err(p.clone());
    }
    let spec = parse_spec(&read_project_text(&lib, id, SPEC, 8 * 1024 * 1024)?)?;
    let want: Vec<String> = match &o.codes {
        Some(v) if !v.is_empty() => v.clone(),
        _ => spec.codes.iter().map(|c| c.code.clone()).collect(),
    };
    let mut seen = HashSet::new();
    for c in &want {
        if !valid_code(c) || !seen.insert(c.clone()) {
            return Err(format!("Mã đề «{c}» không hợp lệ hoặc bị lặp."));
        }
    }
    if want.len() > MAX_CODES {
        return Err(format!("Mỗi lượt xuất tối đa {MAX_CODES} mã đề."));
    }
    for c in &want {
        let ci = info.codes.iter().find(|x| &x.code == c).ok_or_else(|| format!("Mã {c} không có trong đề."))?;
        if !ci.has_main {
            return Err(format!("Đề chưa có main-{c}.tex. Dùng nút “Bổ sung tệp chính từng mã” trước."));
        }
        if let Some(p) = &ci.problem {
            return Err(format!("Mã {c} chưa khớp dữ liệu đã lưu: {p}"));
        }
    }
    let dest = PathBuf::from(&o.dest_dir);
    if !dest.is_absolute() {
        return Err("Thư mục đích phải là đường dẫn đầy đủ.".into());
    }
    // dung lượng đĩa: ước lượng thận trọng (mỗi PDF 3 MB, nhân 3 cho tệp tạm và kiểm lại) + nguồn
    let sources = if kind == Kind::Teacher { collect_sources(&lib, id)? } else { Vec::new() };
    let src_bytes: u64 = sources.iter().map(|s| s.bytes.len() as u64).sum();
    let per = if o.with_solution.unwrap_or(false) && kind == Kind::Teacher { 2 } else { 1 };
    let need = (want.len() as u64 * per * 3 * 1024 * 1024 + src_bytes) * 3 + 64 * 1024 * 1024;
    if let Some(free) = free_space(&dest) {
        if free < need {
            return Err(format!("Ổ đĩa đích còn {} MB trống, cần ít nhất khoảng {} MB.", free / 1048576, need / 1048576));
        }
    }

    let flag = Arc::new(AtomicBool::new(false));
    {
        let mut g = CANCELS.lock().unwrap_or_else(|e| e.into_inner());
        let map = g.get_or_insert_with(HashMap::new);
        if map.contains_key(id) {
            return Err("Đề này đang xuất. Hãy chờ hoặc bấm Dừng.".into());
        }
        map.insert(id.to_string(), flag.clone());
    }
    let _guard = CancelGuard(id.to_string());

    let eid = export_id();
    let plan = Plan {
        project_id: id,
        project_name: &m.name,
        slug: slug(if spec.title.is_empty() { &m.name } else { &spec.title }),
        kind,
        spec: &spec,
        codes: want,
        with_solution: o.with_solution.unwrap_or(false),
        sources,
        export_id: eid,
        now: crate::examlib::iso_now(),
        hedu_version: env!("CARGO_PKG_VERSION"),
        max_bytes: MAX_PACKAGE_BYTES,
        hook: None,
    };
    let root2 = root.to_path_buf();
    let sup = support_dir.clone();
    let (engine, tex_bin, timeout) = (o.engine.clone(), o.tex_bin.clone(), o.timeout_secs);
    let idc = id.to_string();
    let flag2 = flag.clone();
    let mut provider = move |code: &str, mode: &str| -> Result<PdfOut, Fail> {
        if flag2.load(Ordering::SeqCst) {
            return Err(Fail::Cancelled);
        }
        let main = format!("main-{code}.tex");
        let co = CompileOpts { engine: engine.clone(), timeout_secs: timeout, runs: Some(2), tex_bin: tex_bin.clone(), force: None, mode: Some(mode.to_string()), main: Some(main.clone()) };
        let r = compile(&root2, &idc, &co, &sup).map_err(Fail::Msg)?;
        match r.status.as_str() {
            "ok" => {
                let (bytes, g) = read_good_slot(&root2, &idc, mode, &slot_of(&main)).map_err(Fail::Msg)?;
                if g.fingerprint != r.fingerprint || g.mode != mode {
                    return Err(Fail::Msg("PDF đã lưu không khớp với lượt dịch này (dấu vân khác), nên không dùng.".into()));
                }
                Ok(PdfOut { bytes, pages: r.pages, fingerprint: r.fingerprint, cached: r.cached, tex_version: r.tex_version })
            }
            "cancelled" => Err(Fail::Cancelled),
            _ => Err(Fail::Msg(r.message)),
        }
    };
    build_package(&plan, &dest, &mut provider, progress, &flag)
}

// ---------- bổ sung tệp chính từng mã cho đề đã lưu (D4) ----------

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct BackfillOut {
    pub applied: bool,
    pub will_create: Vec<String>,
    pub skipped: Vec<String>,
    pub message: String,
    /// những gì ĐÃ đối chiếu được từ dữ liệu trong dự án
    pub verified: Vec<String>,
    /// những gì CHƯA chứng minh được (nói thẳng, không khẳng định đã đối chiếu toàn bộ)
    pub limits: Vec<String>,
}

/// `main-<mã>.tex` = phần đầu của `main.tex` đã lưu (đến hết \begin{document}) + `\input{de-<mã>}` + `\end{document}`; KHÔNG chèn bảng đáp án.
pub fn derive_main(main_tex: &str, code: &str) -> Result<String, String> {
    let k = main_tex.find("\\begin{document}").ok_or("main.tex không có \\begin{document}.")?;
    let head = &main_tex[..k + "\\begin{document}".len()];
    if head.contains("\\input{de-") {
        return Err("Phần đầu main.tex đã gọi một mã đề nên không dùng làm khung.".into());
    }
    let mut s = String::from(head);
    s.push_str(&format!("\n\\input{{de-{code}}}\n\\end{{document}}\n"));
    Ok(s)
}

/// Dấu vân SHA-256 của tệp trên đĩa (đọc qua `open_inside`), so với dấu vân ghi trong sổ của đề.
fn disk_matches_manifest(lib: &Path, id: &str, m: &crate::examlib::Manifest, rel: &str) -> Result<(), String> {
    let rec = m.files.iter().find(|f| f.rel == rel).ok_or_else(|| format!("{rel} không có trong sổ của đề."))?;
    let b = read_project_bytes(lib, id, rel)?;
    if sha_hex(&b) != rec.sha256 {
        return Err(format!("{rel} trên đĩa KHÔNG khớp dấu vân trong sổ của đề (có thể đã bị sửa ngoài HEdu). Từ chối bổ sung."));
    }
    Ok(())
}

pub fn backfill(lib: &Path, id: &str, apply: bool) -> Result<BackfillOut, String> {
    backfill_with(lib, id, apply, None)
}

/// `apply=false`: chỉ kiểm và liệt kê (để hỏi xác nhận). `apply=true`: tạo các tệp còn thiếu TẤT CẢ HOẶC KHÔNG (`create_text_files_batch`): lỗi giữa chừng
/// thì các tệp mới vừa tạo trong lượt này bị xoá, tệp vốn có không bị đụng. Không bao giờ sửa main.tex, de-<mã>.tex, hedu-de.json, UID hay ngân hàng.
/// `fault` chỉ để kiểm thử (ép lỗi trước khi ghi tệp thứ i).
pub fn backfill_with(lib: &Path, id: &str, apply: bool, fault: Option<&dyn Fn(usize) -> Result<(), String>>) -> Result<BackfillOut, String> {
    let info = codes_info(lib, id)?;
    if !info.has_spec {
        return Err(info.problems.first().cloned().unwrap_or_else(|| "Đề không có dữ liệu để bổ sung.".into()));
    }
    let m = read_manifest(lib, id)?;
    if m.status == "finalized" {
        return Err("Đề đã chốt nên không thêm tệp. Hãy sao chép đề rồi bổ sung trên bản sao.".into());
    }
    let spec_text = read_project_text(lib, id, SPEC, 8 * 1024 * 1024)?;
    let spec = parse_spec(&spec_text)?;
    let main_tex = read_project_text(lib, id, "main.tex", 1024 * 1024).map_err(|_| "Đề không có main.tex gốc để lấy khung.".to_string())?;
    let mut out = BackfillOut::default();

    // 1) KIỂM ĐẦY ĐỦ TẤT CẢ MÃ trước khi ghi bất cứ thứ gì
    // 1a) mọi tệp đầu vào phải khớp dấu vân trong sổ của đề
    for rel in ["main.tex", SPEC] {
        disk_matches_manifest(lib, id, &m, rel)?;
    }
    for c in &spec.codes {
        disk_matches_manifest(lib, id, &m, &format!("de-{}.tex", c.code))?;
    }
    out.verified.push(format!("Dấu vân SHA-256 của main.tex, hedu-de.json và {} tệp de-<mã>.tex khớp sổ của đề.", spec.codes.len()));
    // 1b) dấu vân từng tệp do Tạo đề ghi lúc lưu (có ở đề lưu bằng bản mới): so với tệp hiện tại
    let sv: serde_json::Value = serde_json::from_str(&spec_text).map_err(|e| e.to_string())?;
    match sv.get("dauVanTep").and_then(|x| x.as_object()) {
        Some(map) if !map.is_empty() => {
            for (rel, want) in map {
                let want = want.as_str().unwrap_or("");
                if bad_rel(rel).is_some() || !(rel == "main.tex" || rel.starts_with("de-")) {
                    continue; // chỉ đối chiếu tệp nguồn của đề; không đọc đường dẫn lạ từ metadata
                }
                let b = read_project_bytes(lib, id, rel).map_err(|e| format!("Không đối chiếu được {rel}: {e}"))?;
                if sha_hex(&b) != want {
                    return Err(format!("{rel} đã đổi so với lúc lưu từ Tạo đề (dấu vân trong hedu-de.json khác). Từ chối bổ sung vì không chứng minh được nội dung còn nguyên."));
                }
            }
            out.verified.push("Dấu vân từng tệp nguồn khớp với dấu vân Tạo đề đã ghi lúc lưu (chưa bị sửa tay).".into());
        }
        _ => out.limits.push("Đề này lưu bằng bản trước nên hedu-de.json không có dấu vân từng tệp: KHÔNG chứng minh được các tệp chưa bị sửa tay kể từ lúc tạo (chỉ biết chúng khớp sổ của đề).".into()),
    }
    // 1c) mã, số câu từng phần và đáp án từng câu đọc từ chính tệp
    let mut todo: Vec<(String, String)> = Vec::new();
    for c in &spec.codes {
        let (mn, dn) = (format!("main-{}.tex", c.code), format!("de-{}.tex", c.code));
        let de = read_project_text(lib, id, &dn, 32 * 1024 * 1024).map_err(|e| format!("Không bổ sung được: {e}"))?;
        let want = derive_main(&main_tex, &c.code)?;
        check_code_files(c, &want, &de).map_err(|e| format!("Dữ liệu đã lưu không khớp, từ chối bổ sung: {e}"))?;
        if m.files.iter().any(|f| f.rel == mn) {
            let cur = read_project_text(lib, id, &mn, 1024 * 1024)?;
            if cur == want {
                out.skipped.push(format!("{mn} đã có và đúng."));
            } else {
                return Err(format!("{mn} đã có nhưng khác bản sẽ dựng (có thể đã chỉnh tay). HEdu không ghi đè; hãy xóa hoặc đổi tên tệp đó rồi thử lại."));
            }
        } else {
            todo.push((mn, want));
        }
    }
    out.verified.push("Mã đề, số câu từng phần và đáp án từng câu khớp \\True/\\shortans trong chính tệp de-<mã>.tex so với hedu-de.json.".into());
    // 1d) sổ nguồn UID (nếu có): các câu đã chép phải còn nguyên văn
    let src = crate::examsources::sources_status(lib, id).unwrap_or_default();
    if src.is_empty() {
        out.limits.push("Đề không có sổ nguồn UID nên không đối chiếu được nội dung từng câu với câu gốc đã chép.".into());
    } else {
        if let Some(bad) = src.iter().find(|x| x.state != "verbatim") {
            return Err(format!("Câu nguồn «{}» không còn nguyên văn trong đề (trạng thái: {}). Từ chối bổ sung vì nội dung không còn khớp bản đã lưu.", bad.item.uid, bad.state));
        }
        out.verified.push(format!("{} câu trong sổ nguồn UID còn nguyên văn trong đề.", src.len()));
        out.limits.push("Sổ nguồn chỉ ghi các câu của MÃ ĐẦU; UID của các mã còn lại không chứng minh được từ nội dung (chỉ khớp số câu và đáp án).".into());
    }
    out.limits.push("Khớp số câu và đáp án KHÔNG chứng minh nội dung từng câu giống bản đã lưu của ngân hàng (HEdu không đọc ngân hàng ở bước này, cố ý không lấy câu mới nhất).".into());

    out.will_create = todo.iter().map(|x| x.0.clone()).collect();
    if todo.is_empty() {
        out.message = "Không có tệp nào cần bổ sung.".into();
        return Ok(out);
    }
    if !apply {
        out.message = format!("Sẽ tạo {} tệp mới (tất cả hoặc không), không sửa tệp nào đang có.", todo.len());
        return Ok(out);
    }
    crate::examfiles::create_text_files_batch(lib, id, &todo, fault)?;
    out.applied = true;
    out.message = format!("Đã tạo {} tệp mới.", todo.len());
    Ok(out)
}

// ---------- lệnh Tauri ----------

use tauri::{AppHandle, Emitter, Manager};

fn root_of(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

/// Chỉ xuất Excel đáp án (mọi mã trong hedu-de.json) vào thư mục đã chọn; không ghi đè tệp có sẵn. Dùng cùng điều kiện như xuất ZIP.
pub fn export_answers_xlsx(lib: &Path, id: &str, dest_dir: &Path) -> Result<String, String> {
    let info = codes_info(lib, id)?;
    if !info.has_spec {
        return Err(info.problems.first().cloned().unwrap_or_else(|| "Đề chưa có dữ liệu mã đề.".into()));
    }
    if let Some(p) = info.problems.first() {
        return Err(p.clone());
    }
    let spec = parse_spec(&read_project_text(lib, id, SPEC, 8 * 1024 * 1024)?)?;
    let refs: Vec<&CodeSpec> = spec.codes.iter().collect();
    let bytes = crate::examxlsx::answers_xlsx(&refs)?;
    let md = fs::symlink_metadata(dest_dir).map_err(|e| format!("Thư mục đích không dùng được: {e}"))?;
    if !md.is_dir() || is_link(&md) {
        return Err("Thư mục đích không phải thư mục thường.".into());
    }
    let base = format!("{}-dap-an-{:08x}", slug(&spec.title), spec.seed & 0xffff_ffff);
    for n in 1..1000 {
        let name = if n == 1 { format!("{base}.xlsx") } else { format!("{base}-{n}.xlsx") };
        let p = dest_dir.join(&name);
        match fs::OpenOptions::new().write(true).create_new(true).open(&p) {
            Ok(mut f) => {
                use std::io::Write as _;
                if let Err(e) = f.write_all(&bytes).and_then(|_| f.sync_all()) {
                    drop(f);
                    let _ = fs::remove_file(&p);
                    return Err(format!("Không ghi được tệp Excel: {e}"));
                }
                return Ok(p.to_string_lossy().into_owned());
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("Không tạo được tệp Excel: {e}")),
        }
    }
    Err("Thư mục đích đã có quá nhiều tệp đáp án cùng tên.".into())
}

#[tauri::command]
pub async fn exam_answers_xlsx(app: AppHandle, id: String, dest_dir: String) -> Result<String, String> {
    let lib = root_of(&app)?.join("exam-library");
    tauri::async_runtime::spawn_blocking(move || export_answers_xlsx(&lib, &id, Path::new(&dest_dir))).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn exam_codes_info(app: AppHandle, id: String) -> Result<CodesInfo, String> {
    let lib = root_of(&app)?.join("exam-library");
    tauri::async_runtime::spawn_blocking(move || codes_info(&lib, &id)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn exam_codes_export(app: AppHandle, id: String, opts: ExportOpts) -> Result<ExportOut, String> {
    let root = root_of(&app)?;
    let sup = support::prepare(&root);
    let a2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || export_codes(&root, &id, &opts, &sup, &|p: Progress| { let _ = a2.emit("exam-export-progress", p); }))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn exam_codes_export_cancel(id: String) -> bool {
    cancel_export(&id)
}

#[tauri::command]
pub async fn exam_codes_backfill(app: AppHandle, id: String, apply: bool) -> Result<BackfillOut, String> {
    let lib = root_of(&app)?.join("exam-library");
    tauri::async_runtime::spawn_blocking(move || backfill(&lib, &id, apply)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
#[path = "examexport_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "examexport_backfill_tests.rs"]
mod backfill_tests;

#[cfg(test)]
#[path = "examexport_hardening_tests.rs"]
mod hardening_tests;
