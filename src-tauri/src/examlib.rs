//! Thư viện đề thi (E1). Thiết kế: claude/thiet-ke-de-thi.md.
//! Nhập = SAO CHÉP nhị phân từng byte vào `<exam-library>/projects/<uuid>/`; tệp/thư mục gốc không bị đụng.
//! Nguồn sự thật là tệp trong thư mục dự án; `.hedu/manifest.json` chỉ là mô tả; `index.json` dựng lại được.
//! Không đụng hedu.db, schema 3, ID6, UID. Không biên dịch (E2), không sửa tệp (E3).
#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

pub const MAX_FILES: usize = 2000;
pub const MAX_FILE_BYTES: u64 = 100 * 1024 * 1024;
pub const MAX_TOTAL_BYTES: u64 = 500 * 1024 * 1024;
pub const MAX_DEPTH: usize = 12;
/// Windows cũ giới hạn ~260 ký tự cho cả đường dẫn; chừa chỗ cho đuôi do TeX sinh ra.
pub const MAX_PATH_LEN: usize = 240;
const MAX_NAME: usize = 120;
const HEDU_DIR: &str = ".hedu";
const MANIFEST: &str = "manifest.json";

/// Chỉ một thao tác ghi thư viện tại một thời điểm.
static WRITE_GATE: Mutex<()> = Mutex::new(());

/// Đuôi tệp được hỗ trợ trong một dự án LaTeX. Tệp khác vẫn được chép nhưng kèm cảnh báo.
const KNOWN_EXT: &[&str] = &[
    "tex", "sty", "cls", "clo", "def", "cfg", "fd", "ltx", "bib", "bst", "tikz", "txt", "md", "png", "jpg", "jpeg", "pdf", "eps", "svg", "gif",
];
/// Tệp tạm do TeX sinh ra: chép nhưng báo là không cần thiết.
const TEMP_EXT: &[&str] = &["aux", "log", "toc", "out", "synctex", "gz", "dvi", "fls", "fdb_latexmk", "lof", "lot", "bbl", "blg", "nav", "snm"];

// ---------- kiểu dữ liệu ----------

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct FileRec {
    pub rel: String,
    pub bytes: u64,
    pub sha256: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    pub grade: Option<u32>,
    pub school_year: Option<String>,
    pub exam_type: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Compile {
    pub engine: String,
    pub timeout_secs: u32,
    pub runs: u32,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub mode: String,
    pub original_path_display: String,
    pub fingerprint: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Skip {
    pub rel: String,
    pub reason: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub manifest_version: u32,
    pub project_id: String,
    pub name: String,
    /// single | multi
    pub kind: String,
    pub main_file: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub metadata: Meta,
    /// draft | needs_review | finalized
    pub status: String,
    pub compile: Compile,
    pub source: Source,
    pub files: Vec<FileRec>,
    /// tệp bị bỏ qua lúc nhập (liên kết, tên không an toàn…) — luôn được ghi lại, không bỏ qua lặng lẽ
    #[serde(default)]
    pub skipped: Vec<Skip>,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub main_file: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub file_count: u32,
    pub total_bytes: u64,
    pub warning_count: u32,
    pub skipped_count: u32,
    pub metadata: Meta,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScanFile {
    pub rel: String,
    pub bytes: u64,
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScanOut {
    /// single | multi
    pub kind: String,
    pub name: String,
    pub files: Vec<ScanFile>,
    pub total_bytes: u64,
    /// tệp .tex có \documentclass (ứng viên tệp chính)
    pub candidates: Vec<String>,
    pub main_file: Option<String>,
    pub skipped: Vec<Skip>,
    pub warnings: Vec<String>,
    /// đạt giới hạn: còn tệp chưa liệt kê ⇒ không cho nhập
    pub truncated: bool,
}

// ---------- tên, đường dẫn an toàn ----------

/// Lý do tên một thành phần đường dẫn không an toàn trên Windows (None = ổn).
pub fn bad_component(n: &str) -> Option<String> {
    if n.is_empty() || n == "." || n == ".." {
        return Some("tên rỗng hoặc là '.'/'..'".into());
    }
    if n.chars().any(|c| (c as u32) < 32 || "<>:\"|?*\\/".contains(c)) {
        return Some("có ký tự Windows không cho phép".into());
    }
    if n.ends_with('.') || n.ends_with(' ') {
        return Some("kết thúc bằng dấu chấm hoặc dấu cách".into());
    }
    let stem = n.split('.').next().unwrap_or("").to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4 && (stem.starts_with("COM") || stem.starts_with("LPT")) && stem.as_bytes()[3].is_ascii_digit() && stem.as_bytes()[3] != b'0');
    if reserved {
        return Some("trùng tên dành riêng của Windows".into());
    }
    None
}

/// Đường dẫn tương đối dùng '/', mọi thành phần phải an toàn; không tuyệt đối, không thoát lên trên.
pub fn bad_rel(rel: &str) -> Option<String> {
    if rel.is_empty() || rel.starts_with('/') || rel.contains('\\') || rel.contains(':') {
        return Some("đường dẫn không hợp lệ".into());
    }
    for c in rel.split('/') {
        if let Some(r) = bad_component(c) {
            return Some(format!("'{c}': {r}"));
        }
    }
    None
}

/// Liên kết, junction hay điểm phân tích (reparse point) của Windows — không đi theo.
pub(crate) fn is_link(md: &fs::Metadata) -> bool {
    if md.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        return md.file_attributes() & 0x400 != 0;
    }
    #[cfg(not(windows))]
    false
}

/// Mở MỘT tệp thường nằm trong `root` mà KHÔNG đi theo liên kết/junction ở bất kỳ thành phần nào của đường dẫn.
/// Kiểm từng thành phần (symlink_metadata), mở bằng cờ không-đi-theo-điểm-phân-tích (Windows), kiểm lại trên chính tay cầm đã mở,
/// rồi so đường dẫn thật với thư mục gốc. Dùng cho MỌI lần đọc tệp trong quá trình nhập và kiểm tra, để nguồn bị thay thành
/// liên kết giữa lúc quét và lúc chép (hoặc người khác đặt liên kết trong thư viện) không làm HEdu đọc ngoài thư mục.
pub fn open_inside(root: &Path, rel: &str) -> Result<fs::File, String> {
    if let Some(r) = bad_rel(rel) {
        return Err(format!("Đường dẫn không an toàn '{rel}': {r}"));
    }
    let parts: Vec<&str> = rel.split('/').collect();
    let mut cur = root.to_path_buf();
    for (i, c) in parts.iter().enumerate() {
        cur.push(c);
        let md = fs::symlink_metadata(&cur).map_err(|e| format!("Không đọc được '{rel}': {e}"))?;
        if is_link(&md) {
            return Err(format!("'{rel}' đi qua liên kết/junction nên không đọc (để không ra ngoài thư mục)."));
        }
        let last = i + 1 == parts.len();
        if (last && !md.is_file()) || (!last && !md.is_dir()) {
            return Err(format!("'{rel}' không còn là tệp/thư mục thường."));
        }
    }
    let mut oo = fs::OpenOptions::new();
    oo.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        oo.custom_flags(0x0020_0000); // FILE_FLAG_OPEN_REPARSE_POINT: không đi theo liên kết ở tệp cuối
    }
    let f = oo.open(&cur).map_err(|e| format!("Không mở được '{rel}': {e}"))?;
    let hmd = f.metadata().map_err(|e| format!("Không đọc được '{rel}': {e}"))?;
    if is_link(&hmd) || !hmd.is_file() {
        return Err(format!("'{rel}' là liên kết nên không đọc."));
    }
    match (fs::canonicalize(&cur), fs::canonicalize(root)) {
        (Ok(r), Ok(b)) if r.starts_with(&b) => Ok(f),
        _ => Err(format!("'{rel}' nằm ngoài thư mục gốc nên không đọc.")),
    }
}

fn ext_of(rel: &str) -> String {
    Path::new(rel).extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase()
}

// ---------- quét nguồn ----------

struct Walk<'a> {
    out: &'a mut ScanOut,
    seen_lower: HashSet<String>,
    root: PathBuf,
    dest_prefix_len: usize,
}

impl Walk<'_> {
    fn skip(&mut self, rel: &str, reason: impl Into<String>) {
        self.out.skipped.push(Skip { rel: rel.to_string(), reason: reason.into() });
    }

    fn file(&mut self, full: &Path, rel: &str, md: &fs::Metadata) {
        if let Some(r) = bad_rel(rel) {
            return self.skip(rel, r);
        }
        if self.dest_prefix_len + rel.len() > MAX_PATH_LEN {
            return self.skip(rel, format!("đường dẫn quá dài (tối đa {MAX_PATH_LEN} ký tự sau khi chép vào thư viện)"));
        }
        if md.len() > MAX_FILE_BYTES {
            return self.skip(rel, format!("tệp quá lớn ({} MB; tối đa {} MB)", md.len() / 1024 / 1024, MAX_FILE_BYTES / 1024 / 1024));
        }
        if rel.split('/').next() == Some(HEDU_DIR) {
            return self.skip(rel, "thư mục .hedu dành riêng cho HEdu");
        }
        if !self.seen_lower.insert(rel.to_lowercase()) {
            return self.skip(rel, "trùng tên khác hoa/thường (Windows coi là một tệp)");
        }
        if self.out.files.len() >= MAX_FILES || self.out.total_bytes + md.len() > MAX_TOTAL_BYTES {
            self.out.truncated = true;
            return;
        }
        let _ = full;
        self.out.total_bytes += md.len();
        self.out.files.push(ScanFile { rel: rel.to_string(), bytes: md.len() });
    }

    fn dir(&mut self, full: &Path, rel: &str, depth: usize) {
        if depth > MAX_DEPTH {
            return self.skip(rel, format!("thư mục quá sâu (tối đa {MAX_DEPTH} cấp)"));
        }
        let rd = match fs::read_dir(full) {
            Ok(r) => r,
            Err(e) => return self.skip(rel, format!("không đọc được thư mục: {e}")),
        };
        let mut es: Vec<_> = rd.flatten().collect();
        es.sort_by_key(|e| e.file_name().to_string_lossy().to_lowercase());
        for e in es {
            let name = e.file_name().to_string_lossy().into_owned();
            let sub = if rel.is_empty() { name.clone() } else { format!("{rel}/{name}") };
            let p = e.path();
            let md = match fs::symlink_metadata(&p) {
                Ok(m) => m,
                Err(err) => {
                    self.skip(&sub, format!("không đọc được: {err}"));
                    continue;
                }
            };
            if is_link(&md) {
                self.skip(&sub, "liên kết/junction (không đi theo để tránh thoát khỏi thư mục hoặc lặp vòng)");
            } else if md.is_dir() {
                if name == ".git" {
                    self.skip(&sub, "thư mục Git không phải nội dung đề");
                } else {
                    self.dir(&p, &sub, depth + 1);
                }
            } else if md.is_file() {
                self.file(&p, &sub, &md);
            } else {
                self.skip(&sub, "không phải tệp hay thư mục thường");
            }
        }
        let _ = &self.root;
    }
}

fn leaf_name(p: &Path) -> String {
    p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

/// Có dòng \documentclass không nằm sau dấu % (đọc tối đa 256 KB đầu tệp).
fn has_documentclass(p: &Path) -> bool {
    let mut buf = Vec::new();
    if fs::File::open(p).and_then(|f| f.take(256 * 1024).read_to_end(&mut buf)).is_err() {
        return false;
    }
    String::from_utf8_lossy(&buf).lines().any(|l| {
        let t = l.trim_start();
        !t.starts_with('%') && t.contains("\\documentclass")
    })
}

/// Quét nguồn (tệp .tex đơn hoặc thư mục). CHỈ ĐỌC. `lib_root` dùng để tính độ dài đường dẫn đích và chặn nhập từ chính thư viện.
pub fn scan(src: &Path, lib_root: &Path) -> Result<ScanOut, String> {
    let md = fs::symlink_metadata(src).map_err(|e| format!("Không đọc được nguồn: {e}"))?;
    if is_link(&md) {
        return Err("Nguồn là liên kết/junction nên không nhập để tránh thoát khỏi thư mục. Hãy chọn thư mục thật.".into());
    }
    if let (Ok(a), Ok(b)) = (fs::canonicalize(src), fs::canonicalize(lib_root)) {
        if a.starts_with(&b) {
            return Err("Nguồn nằm trong chính thư viện đề của HEdu. Hãy dùng 'Sao chép dự án' (E4) thay vì nhập lại.".into());
        }
    }
    let mut out = ScanOut::default();
    let dest_prefix_len = lib_root.join("projects").join("00000000-0000-0000-0000-000000000000").to_string_lossy().len() + 1;
    if md.is_file() {
        out.kind = "single".into();
        out.name = Path::new(&leaf_name(src)).file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
        let name = leaf_name(src);
        if ext_of(&name) != "tex" {
            return Err("Chỉ nhập tệp .tex đơn hoặc một thư mục dự án.".into());
        }
        let mut w = Walk { out: &mut out, seen_lower: HashSet::new(), root: src.to_path_buf(), dest_prefix_len };
        w.file(src, &name, &md);
        out.main_file = out.files.first().map(|f| f.rel.clone());
    } else if md.is_dir() {
        out.kind = "multi".into();
        out.name = leaf_name(src);
        {
            let mut w = Walk { out: &mut out, seen_lower: HashSet::new(), root: src.to_path_buf(), dest_prefix_len };
            w.dir(src, "", 1);
        }
        let tex: Vec<String> = out.files.iter().filter(|f| ext_of(&f.rel) == "tex").map(|f| f.rel.clone()).collect();
        if tex.is_empty() {
            return Err("Thư mục không có tệp .tex nào.".into());
        }
        out.candidates = tex.into_iter().filter(|r| has_documentclass(&src.join(r))).collect();
        if out.candidates.len() == 1 {
            out.main_file = Some(out.candidates[0].clone());
        }
    } else {
        return Err("Nguồn không phải tệp hay thư mục.".into());
    }
    if out.files.is_empty() {
        return Err("Không có tệp nào nhập được.".into());
    }
    if out.truncated {
        out.warnings.push(format!("Quá giới hạn ({MAX_FILES} tệp hoặc {} MB): chưa nhập được. Hãy tách nhỏ dự án.", MAX_TOTAL_BYTES / 1024 / 1024));
    }
    out.warnings.extend(file_warnings(&out.files));
    Ok(out)
}

fn file_warnings(files: &[ScanFile]) -> Vec<String> {
    let mut temp = 0;
    let mut unknown: Vec<String> = Vec::new();
    for f in files {
        let e = ext_of(&f.rel);
        if TEMP_EXT.contains(&e.as_str()) {
            temp += 1;
        } else if !KNOWN_EXT.contains(&e.as_str()) && !unknown.contains(&e) {
            unknown.push(e);
        }
    }
    let mut w = Vec::new();
    if temp > 0 {
        w.push(format!("{temp} tệp tạm của TeX (.aux, .log…): vẫn được chép nhưng không cần thiết."));
    }
    if !unknown.is_empty() {
        w.push(format!("Có tệp đuôi chưa hỗ trợ ({}): được chép nguyên trạng, HEdu chưa biết dùng chúng khi biên dịch.", unknown.join(", ")));
    }
    w
}

// ---------- thời gian, mã định danh ----------

pub(crate) fn iso_now() -> String {
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) as i64;
    let (days, rem) = (secs.div_euclid(86400), secs.rem_euclid(86400));
    // Howard Hinnant, civil_from_days
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z.rem_euclid(146097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z", rem / 3600, rem % 3600 / 60, rem % 60)
}

fn new_id(salt: &str) -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static N: AtomicU64 = AtomicU64::new(0);
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let mut h = Sha256::new();
    h.update(nanos.to_le_bytes());
    h.update(std::process::id().to_le_bytes());
    h.update(N.fetch_add(1, Ordering::Relaxed).to_le_bytes());
    h.update(salt.as_bytes());
    let b = h.finalize();
    let hex: String = b[..16].iter().map(|x| format!("{x:02x}")).collect();
    format!("{}-{}-4{}-a{}-{}", &hex[0..8], &hex[8..12], &hex[13..16], &hex[17..20], &hex[20..32])
}

/// Mã dự án hợp lệ: đúng dạng uuid chữ thường (chặn mã đi vào đường dẫn như '..').
pub fn valid_id(id: &str) -> bool {
    id.len() == 36 && id.char_indices().all(|(i, c)| if matches!(i, 8 | 13 | 18 | 23) { c == '-' } else { c.is_ascii_hexdigit() && !c.is_ascii_uppercase() })
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

pub fn sha256_reader(r: &mut impl Read) -> std::io::Result<String> {
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = r.read(&mut buf)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(hex(&h.finalize()))
}

/// Băm tệp do HEdu tự ghi (bản chép/thư mục tạm). Tệp NGUỒN và tệp trong thư viện phải đọc qua `open_inside`.
pub fn sha256_file(p: &Path) -> std::io::Result<String> {
    sha256_reader(&mut fs::File::open(p)?)
}

fn fingerprint(files: &[FileRec]) -> String {
    let mut h = Sha256::new();
    for f in files {
        h.update(f.rel.as_bytes());
        h.update([0]);
        h.update(f.sha256.as_bytes());
        h.update([b'\n']);
    }
    hex(&h.finalize())
}

// ---------- thư viện ----------

pub(crate) fn projects_dir(lib: &Path) -> PathBuf {
    lib.join("projects")
}

fn atomic_write(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension("part");
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    if fs::rename(&tmp, path).is_err() {
        let _ = fs::remove_file(path);
        fs::rename(&tmp, path).inspect_err(|_| {
            let _ = fs::remove_file(&tmp);
        })?;
    }
    Ok(())
}

fn summary_of(m: &Manifest) -> Summary {
    Summary {
        id: m.project_id.clone(),
        name: m.name.clone(),
        kind: m.kind.clone(),
        main_file: m.main_file.clone(),
        status: m.status.clone(),
        created_at: m.created_at.clone(),
        updated_at: m.updated_at.clone(),
        file_count: m.files.len() as u32,
        total_bytes: m.files.iter().map(|f| f.bytes).sum(),
        warning_count: m.warnings.len() as u32,
        skipped_count: m.skipped.len() as u32,
        metadata: m.metadata.clone(),
    }
}

fn default_compile() -> Compile {
    Compile { engine: "pdflatex".into(), timeout_secs: 120, runs: 2 }
}

fn write_manifest(dir: &Path, m: &Manifest) -> Result<(), String> {
    let hd = dir.join(HEDU_DIR);
    fs::create_dir_all(&hd).map_err(|e| format!("Không tạo được thư mục .hedu: {e}"))?;
    let json = serde_json::to_vec_pretty(m).map_err(|e| e.to_string())?;
    atomic_write(&hd.join(MANIFEST), &json).map_err(|e| format!("Không ghi được manifest: {e}"))
}

/// Đọc manifest của một dự án. Lỗi/hỏng ⇒ Err (không đoán).
pub fn read_manifest(lib: &Path, id: &str) -> Result<Manifest, String> {
    if !valid_id(id) {
        return Err("Mã dự án không hợp lệ.".into());
    }
    let pd = projects_dir(lib).join(id);
    match fs::symlink_metadata(&pd) {
        Ok(md) if is_link(&md) => return Err("Thư mục dự án là liên kết/junction nên không đọc (an toàn).".into()),
        Ok(md) if md.is_dir() => {}
        _ => return Err("Không tìm thấy dự án trong thư viện.".into()),
    }
    let mut b = Vec::new();
    open_inside(&pd, ".hedu/manifest.json")?
        .take(8 * 1024 * 1024)
        .read_to_end(&mut b)
        .map_err(|e| format!("Không đọc được manifest của dự án: {e}"))?;
    let m: Manifest = serde_json::from_slice(&b).map_err(|e| format!("Manifest hỏng: {e}"))?;
    if m.project_id != id {
        return Err("Manifest không khớp mã thư mục dự án.".into());
    }
    Ok(m)
}

fn clean_name(raw: &str, fallback: &str) -> String {
    let t: String = raw.chars().filter(|c| !c.is_control()).collect::<String>().trim().chars().take(MAX_NAME).collect();
    if t.is_empty() { fallback.to_string() } else { t }
}

/// Ghi chỉ mục (best effort — chỉ để tăng tốc, mất đi vẫn dựng lại được).
fn write_index(lib: &Path, list: &[Summary]) {
    if let Ok(b) = serde_json::to_vec(list) {
        let _ = fs::create_dir_all(lib);
        let _ = atomic_write(&lib.join("index.json"), &b);
    }
}

/// Dựng lại chỉ mục từ các manifest. Thư mục hỏng/không có manifest bị bỏ qua (không xoá).
pub fn rebuild_index(lib: &Path) -> Vec<Summary> {
    let mut out = Vec::new();
    if let Ok(rd) = fs::read_dir(projects_dir(lib)) {
        for e in rd.flatten() {
            let id = e.file_name().to_string_lossy().into_owned();
            if let Ok(m) = read_manifest(lib, &id) {
                out.push(summary_of(&m));
            }
        }
    }
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at).then(a.name.cmp(&b.name)));
    write_index(lib, &out);
    out
}

fn count_project_dirs(lib: &Path) -> usize {
    fs::read_dir(projects_dir(lib)).map(|rd| rd.flatten().filter(|e| !e.file_name().to_string_lossy().starts_with(".staging")).count()).unwrap_or(0)
}

/// Danh sách tóm tắt (KHÔNG nạp danh sách tệp). Dùng index.json nếu còn khớp số thư mục, ngược lại dựng lại.
pub fn list(lib: &Path) -> Vec<Summary> {
    if let Ok(b) = fs::read(lib.join("index.json")) {
        if let Ok(v) = serde_json::from_slice::<Vec<Summary>>(&b) {
            if v.len() == count_project_dirs(lib) {
                return v;
            }
        }
    }
    let _g = WRITE_GATE.lock().unwrap_or_else(|e| e.into_inner());
    rebuild_index(lib)
}

fn add_to_index(lib: &Path, s: Summary) {
    let mut v = list_unlocked(lib);
    v.retain(|x| x.id != s.id);
    v.insert(0, s);
    write_index(lib, &v);
}

fn list_unlocked(lib: &Path) -> Vec<Summary> {
    if let Ok(b) = fs::read(lib.join("index.json")) {
        if let Ok(v) = serde_json::from_slice::<Vec<Summary>>(&b) {
            return v;
        }
    }
    rebuild_index(lib)
}

fn copy_verified(src: &mut fs::File, label: &str, to: &Path) -> Result<(u64, String), String> {
    if let Some(p) = to.parent() {
        fs::create_dir_all(p).map_err(|e| format!("Không tạo được thư mục đích: {e}"))?;
    }
    let mut dst = fs::File::create(to).map_err(|e| format!("Không tạo được tệp đích: {e}"))?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    let mut total = 0u64;
    loop {
        let n = src.read(&mut buf).map_err(|e| format!("Không đọc được {label}: {e}"))?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
        dst.write_all(&buf[..n]).map_err(|e| format!("Không ghi được tệp đích: {e}"))?;
        total += n as u64;
    }
    dst.sync_all().map_err(|e| format!("Không ghi được tệp đích: {e}"))?;
    drop(dst);
    let want = hex(&h.finalize());
    let got = sha256_file(to).map_err(|e| format!("Không đọc lại được tệp đích: {e}"))?;
    if got != want {
        return Err(format!("Bản chép của {label} không khớp (hash khác nhau)."));
    }
    Ok((total, want))
}

/// Chép các tệp đã quét vào `staging`. Mỗi tệp được mở lại qua `open_inside` ngay lúc chép (không tin kết quả quét cũ),
/// và sau khi chép phải mở lại được với cùng kích thước/thời gian sửa, nếu không là nguồn đã bị đổi.
fn copy_scanned(src_dir: &Path, files: &[ScanFile], staging: &Path) -> Result<Vec<FileRec>, String> {
    let changed = |rel: &str| format!("Tệp nguồn '{rel}' bị đổi trong lúc chép. Chưa nhập; hãy thử lại khi không còn chương trình nào đang sửa.");
    let mut recs = Vec::new();
    for f in files {
        let mut src = open_inside(src_dir, &f.rel)?;
        let before = src.metadata().map_err(|e| format!("Không đọc được {}: {e}", f.rel))?;
        let (bytes, sha) = copy_verified(&mut src, &f.rel, &staging.join(&f.rel))?;
        let after = open_inside(src_dir, &f.rel).and_then(|h| h.metadata().map_err(|e| e.to_string())).map_err(|_| changed(&f.rel))?;
        if bytes != f.bytes || before.len() != after.len() || before.modified().ok() != after.modified().ok() {
            return Err(changed(&f.rel));
        }
        recs.push(FileRec { rel: f.rel.clone(), bytes, sha256: sha });
    }
    Ok(recs)
}

/// Nhập nguồn vào thư viện. `main` do người dùng chọn (bắt buộc nếu nhiều ứng viên). Trả về tóm tắt dự án mới.
pub fn import(lib: &Path, src: &Path, name: &str, main: Option<&str>) -> Result<Summary, String> {
    let _g = WRITE_GATE.lock().unwrap_or_else(|e| e.into_inner());
    let sc = scan(src, lib)?;
    if sc.truncated {
        return Err("Dự án quá lớn so với giới hạn, chưa nhập được.".into());
    }
    let src_dir: PathBuf = if sc.kind == "single" { src.parent().map(Path::to_path_buf).unwrap_or_default() } else { src.to_path_buf() };
    let main_file = match main {
        Some(m) => {
            if !sc.files.iter().any(|f| f.rel == m) || ext_of(m) != "tex" {
                return Err("Tệp chính phải là một tệp .tex trong dự án.".into());
            }
            Some(m.to_string())
        }
        None => sc.main_file.clone(),
    };
    let id = loop {
        let c = new_id(&src.to_string_lossy());
        if !projects_dir(lib).join(&c).exists() {
            break c;
        }
    };
    let staging = projects_dir(lib).join(format!(".staging-{id}"));
    let run = || -> Result<Vec<FileRec>, String> {
        fs::create_dir_all(&staging).map_err(|e| format!("Không tạo được thư mục thư viện: {e}"))?;
        copy_scanned(&src_dir, &sc.files, &staging)
    };
    let recs = match run() {
        Ok(r) => r,
        Err(e) => {
            let _ = fs::remove_dir_all(&staging);
            return Err(e);
        }
    };
    let now = iso_now();
    let m = Manifest {
        manifest_version: 1,
        project_id: id.clone(),
        name: clean_name(name, &clean_name(&sc.name, "Đề chưa đặt tên")),
        kind: sc.kind.clone(),
        main_file,
        created_at: now.clone(),
        updated_at: now,
        metadata: Meta::default(),
        status: "draft".into(),
        compile: default_compile(),
        source: Source { mode: "copied".into(), original_path_display: src.to_string_lossy().into_owned(), fingerprint: fingerprint(&recs) },
        files: recs,
        skipped: sc.skipped.clone(),
        warnings: sc.warnings.clone(),
    };
    if let Err(e) = write_manifest(&staging, &m) {
        let _ = fs::remove_dir_all(&staging);
        return Err(e);
    }
    let dir = projects_dir(lib).join(&id);
    if let Err(e) = fs::rename(&staging, &dir) {
        let _ = fs::remove_dir_all(&staging);
        return Err(format!("Không hoàn tất được dự án: {e}"));
    }
    let s = summary_of(&m);
    add_to_index(lib, s.clone());
    Ok(s)
}

const BLANK_TEX: &str = "\\documentclass[12pt,a4paper]{article}\n\\begin{document}\n\n\\end{document}\n";

/// Tạo dự án trống chỉ có main.tex tối giản (đầu file ex_test, khai báo chung… thêm ở E5).
pub fn create_blank(lib: &Path, name: &str) -> Result<Summary, String> {
    let _g = WRITE_GATE.lock().unwrap_or_else(|e| e.into_inner());
    let id = loop {
        let c = new_id(name);
        if !projects_dir(lib).join(&c).exists() {
            break c;
        }
    };
    let staging = projects_dir(lib).join(format!(".staging-{id}"));
    let run = || -> Result<Manifest, String> {
        fs::create_dir_all(&staging).map_err(|e| format!("Không tạo được thư mục thư viện: {e}"))?;
        let p = staging.join("main.tex");
        fs::write(&p, BLANK_TEX).map_err(|e| format!("Không ghi được main.tex: {e}"))?;
        let rec = FileRec { rel: "main.tex".into(), bytes: BLANK_TEX.len() as u64, sha256: sha256_file(&p).map_err(|e| e.to_string())? };
        let now = iso_now();
        let m = Manifest {
            manifest_version: 1,
            project_id: id.clone(),
            name: clean_name(name, "Đề mới"),
            kind: "single".into(),
            main_file: Some("main.tex".into()),
            created_at: now.clone(),
            updated_at: now,
            metadata: Meta::default(),
            status: "draft".into(),
            compile: default_compile(),
            source: Source { mode: "created".into(), original_path_display: String::new(), fingerprint: fingerprint(std::slice::from_ref(&rec)) },
            files: vec![rec],
            skipped: vec![],
            warnings: vec![],
        };
        write_manifest(&staging, &m)?;
        Ok(m)
    };
    let m = match run() {
        Ok(m) => m,
        Err(e) => {
            let _ = fs::remove_dir_all(&staging);
            return Err(e);
        }
    };
    if let Err(e) = fs::rename(&staging, projects_dir(lib).join(&id)) {
        let _ = fs::remove_dir_all(&staging);
        return Err(format!("Không hoàn tất được dự án: {e}"));
    }
    let s = summary_of(&m);
    add_to_index(lib, s.clone());
    Ok(s)
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VerifyOut {
    pub ok: bool,
    pub missing: Vec<String>,
    pub changed: Vec<String>,
    /// tệp có trong thư mục nhưng không có trong manifest (người dùng thêm ngoài app)
    pub extra: Vec<String>,
    /// tệp/thư mục bị CHẶN: là liên kết/junction (hoặc đi qua liên kết) hoặc không đọc an toàn được; không đi theo, không đọc
    pub blocked: Vec<String>,
}

/// So tệp thật với manifest (hash). Không sửa gì và không bao giờ đi theo liên kết/junction trong thư viện.
pub fn verify(lib: &Path, id: &str) -> Result<VerifyOut, String> {
    let m = read_manifest(lib, id)?;
    let dir = projects_dir(lib).join(id);
    let (mut missing, mut changed, mut blocked) = (vec![], vec![], vec![]);
    for f in &m.files {
        match open_inside(&dir, &f.rel) {
            Ok(mut h) => {
                let len_ok = h.metadata().map(|md| md.len() == f.bytes).unwrap_or(false);
                if !len_ok || sha256_reader(&mut h).map(|x| x != f.sha256).unwrap_or(true) {
                    changed.push(f.rel.clone());
                }
            }
            Err(_) => {
                let gone = matches!(fs::symlink_metadata(dir.join(&f.rel)), Err(e) if e.kind() == std::io::ErrorKind::NotFound);
                if gone {
                    missing.push(f.rel.clone())
                } else {
                    blocked.push(f.rel.clone())
                }
            }
        }
    }
    let known: HashSet<&str> = m.files.iter().map(|f| f.rel.as_str()).collect();
    let mut extra = vec![];
    fn walk(d: &Path, rel: &str, depth: usize, known: &HashSet<&str>, extra: &mut Vec<String>, blocked: &mut Vec<String>) {
        if depth > MAX_DEPTH + 2 {
            blocked.push(rel.to_string());
            return;
        }
        let Ok(rd) = fs::read_dir(d) else {
            blocked.push(rel.to_string());
            return;
        };
        for e in rd.flatten() {
            let n = e.file_name().to_string_lossy().into_owned();
            let r = if rel.is_empty() { n.clone() } else { format!("{rel}/{n}") };
            if r == HEDU_DIR {
                continue;
            }
            match fs::symlink_metadata(e.path()) {
                Ok(md) if is_link(&md) => blocked.push(r),
                Ok(md) if md.is_dir() => walk(&e.path(), &r, depth + 1, known, extra, blocked),
                Ok(_) => {
                    if !known.contains(r.as_str()) {
                        extra.push(r)
                    }
                }
                Err(_) => blocked.push(r),
            }
        }
    }
    walk(&dir, "", 1, &known, &mut extra, &mut blocked);
    blocked.sort();
    blocked.dedup();
    Ok(VerifyOut { ok: missing.is_empty() && changed.is_empty() && blocked.is_empty(), missing, changed, extra, blocked })
}

// ---------- lệnh Tauri (mỏng; chạy ở luồng riêng để giao diện không đứng) ----------

use tauri::{AppHandle, Manager};

fn lib_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map(|d| d.join("exam-library")).map_err(|e| e.to_string())
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn exam_lib_scan(app: AppHandle, path: String) -> Result<ScanOut, String> {
    let lib = lib_root(&app)?;
    blocking(move || scan(Path::new(&path), &lib)).await
}

#[tauri::command]
pub async fn exam_lib_import(app: AppHandle, path: String, name: String, main: Option<String>) -> Result<Summary, String> {
    let lib = lib_root(&app)?;
    blocking(move || import(&lib, Path::new(&path), &name, main.as_deref())).await
}

#[tauri::command]
pub async fn exam_lib_create(app: AppHandle, name: String) -> Result<Summary, String> {
    let lib = lib_root(&app)?;
    blocking(move || create_blank(&lib, &name)).await
}

#[tauri::command]
pub async fn exam_lib_list(app: AppHandle) -> Result<Vec<Summary>, String> {
    let lib = lib_root(&app)?;
    blocking(move || Ok(list(&lib))).await
}

#[tauri::command]
pub async fn exam_lib_get(app: AppHandle, id: String) -> Result<Manifest, String> {
    let lib = lib_root(&app)?;
    blocking(move || read_manifest(&lib, &id)).await
}

#[tauri::command]
pub async fn exam_lib_verify(app: AppHandle, id: String) -> Result<VerifyOut, String> {
    let lib = lib_root(&app)?;
    blocking(move || verify(&lib, &id)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("hedu-el-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
    fn put(d: &Path, rel: &str, b: &[u8]) {
        let p = d.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, b).unwrap();
    }

    #[test]
    fn ten_nguy_hiem_bi_tu_choi() {
        for bad in ["", "..", "a\\b", "a:b", "CON", "con.tex", "Nul.txt", "COM1", "lpt9.tex", "x.", "x ", "a|b", "a?b"] {
            assert!(bad_component(bad).is_some(), "{bad}");
        }
        for ok in ["de.tex", "Đề 12 - HKI.tex", "COM0", "CONSOLE.tex", "hinh-01.png"] {
            assert!(bad_component(ok).is_none(), "{ok}");
        }
        assert!(bad_rel("../x.tex").is_some() && bad_rel("/x.tex").is_some() && bad_rel("a/CON/b.tex").is_some() && bad_rel("C:/x").is_some());
        assert!(bad_rel("a/b/c.tex").is_none());
    }

    #[test]
    fn ma_du_an_chi_nhan_uuid() {
        assert!(valid_id(&new_id("x")));
        for bad in ["", "..", "../x", "ABCDEF01-0000-4000-a000-000000000000", "zzzzzzzz-0000-4000-a000-000000000000"] {
            assert!(!valid_id(bad), "{bad}");
        }
        assert_ne!(new_id("x"), new_id("x"));
    }

    #[test]
    fn thoi_gian_iso() {
        let s = iso_now();
        assert!(s.len() == 20 && s.ends_with('Z') && &s[4..5] == "-" && &s[10..11] == "T", "{s}");
    }

    #[test]
    fn nhap_tep_don_giong_het_va_nguon_khong_doi() {
        let d = tmp("single");
        let lib = d.join("lib");
        let bytes: &[u8] = b"\xEF\xBB\xBF\\documentclass{article}\r\n\\begin{document}\r\nx\r\n\\end{document}\r\n";
        put(&d, "src/de.tex", bytes);
        let before = sha256_file(&d.join("src/de.tex")).unwrap();
        let s = import(&lib, &d.join("src/de.tex"), "Đề HKI", None).unwrap();
        assert_eq!((s.kind.as_str(), s.main_file.as_deref(), s.file_count), ("single", Some("de.tex"), 1));
        let copy = lib.join("projects").join(&s.id).join("de.tex");
        assert_eq!(fs::read(&copy).unwrap(), bytes, "BOM và CRLF phải còn nguyên");
        assert_eq!(sha256_file(&d.join("src/de.tex")).unwrap(), before);
        let v = verify(&lib, &s.id).unwrap();
        assert!(v.ok && v.extra.is_empty());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn nhap_thu_muc_nhieu_tep_giu_cay() {
        let d = tmp("multi");
        let lib = d.join("lib");
        put(&d, "p/main.tex", b"\\documentclass{book}\n\\input{chapters/c1}\n");
        put(&d, "p/chapters/c1.tex", b"Chuong 1\n");
        put(&d, "p/images/h.png", &[0x89, b'P', b'N', b'G', 0, 1, 2]);
        put(&d, "p/assets/local.sty", b"\\ProvidesPackage{local}\n");
        put(&d, "p/.git/config", b"x");
        let s = import(&lib, &d.join("p"), "", None).unwrap();
        assert_eq!((s.kind.as_str(), s.main_file.as_deref(), s.file_count), ("multi", Some("main.tex"), 4));
        assert_eq!(s.name, "p");
        let m = read_manifest(&lib, &s.id).unwrap();
        assert!(m.skipped.iter().any(|k| k.rel == ".git"), "thư mục .git phải được ghi là đã bỏ qua");
        let png = fs::read(lib.join("projects").join(&s.id).join("images/h.png")).unwrap();
        assert_eq!(png, vec![0x89, b'P', b'N', b'G', 0, 1, 2]);
        assert!(verify(&lib, &s.id).unwrap().ok);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn nhieu_ung_vien_thi_phai_chon_tay() {
        let d = tmp("cand");
        let lib = d.join("lib");
        put(&d, "p/a.tex", b"\\documentclass{article}\n");
        put(&d, "p/b.tex", b"% \\documentclass{article}\n\\documentclass{book}\n");
        put(&d, "p/c.tex", b"% \\documentclass chu thich\nnoi dung\n");
        let sc = scan(&d.join("p"), &lib).unwrap();
        assert_eq!(sc.candidates, vec!["a.tex", "b.tex"]);
        assert_eq!(sc.main_file, None);
        let s = import(&lib, &d.join("p"), "x", None).unwrap();
        assert_eq!(s.main_file, None, "nhiều ứng viên: không tự chọn");
        assert!(import(&lib, &d.join("p"), "y", Some("khong-co.tex")).is_err());
        let s2 = import(&lib, &d.join("p"), "y", Some("b.tex")).unwrap();
        assert_eq!(s2.main_file.as_deref(), Some("b.tex"));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn trung_ten_tao_du_an_moi_khong_ghi_de() {
        let d = tmp("dup");
        let lib = d.join("lib");
        put(&d, "de.tex", b"\\documentclass{article}\n");
        let a = import(&lib, &d.join("de.tex"), "Đề", None).unwrap();
        let b = import(&lib, &d.join("de.tex"), "Đề", None).unwrap();
        assert_ne!(a.id, b.id);
        assert_eq!(list(&lib).len(), 2);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn tep_khong_ho_tro_va_tam_co_canh_bao() {
        let d = tmp("warn");
        let lib = d.join("lib");
        put(&d, "p/main.tex", b"\\documentclass{article}\n");
        put(&d, "p/main.aux", b"x");
        put(&d, "p/lo.xyz", b"x");
        let s = import(&lib, &d.join("p"), "w", None).unwrap();
        assert!(s.warning_count >= 2 && s.file_count == 3, "{s:?}");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn tu_choi_nguon_sai() {
        let d = tmp("bad");
        let lib = d.join("lib");
        put(&d, "a.txt", b"x");
        put(&d, "empty/readme.md", b"x");
        assert!(scan(&d.join("a.txt"), &lib).is_err());
        assert!(scan(&d.join("empty"), &lib).is_err(), "thư mục không có .tex");
        assert!(scan(&d.join("khong-co"), &lib).is_err());
        // nguồn nằm trong chính thư viện
        put(&lib, "projects/x/main.tex", b"\\documentclass{article}\n");
        assert!(scan(&lib.join("projects/x"), &lib).is_err());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn bo_qua_ten_khong_an_toan_va_ghi_lai() {
        let d = tmp("names");
        let lib = d.join("lib");
        put(&d, "p/main.tex", b"\\documentclass{article}\n");
        put(&d, "p/a.tex", b"1");
        // trên Windows không tạo được CON/…; kiểm bằng hàm thuần ở test khác. Ở đây kiểm tên khác hoa/thường trên hệ phân biệt hoa thường.
        #[cfg(unix)]
        put(&d, "p/A.tex", b"2");
        let sc = scan(&d.join("p"), &lib).unwrap();
        assert!(sc.files.iter().any(|f| f.rel == "a.tex"));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn duong_dan_qua_dai_bi_bo_qua() {
        let d = tmp("long");
        let lib = d.join("lib");
        put(&d, "p/main.tex", b"\\documentclass{article}\n");
        let long = "d".repeat(60);
        let rel = format!("{long}/{long}/{long}/{long}/{long}/x.tex");
        // chỉ kiểm logic độ dài, không cần tạo thật trên đĩa nếu hệ không cho
        let mut out = ScanOut::default();
        let mut w = Walk { out: &mut out, seen_lower: HashSet::new(), root: d.clone(), dest_prefix_len: lib.join("projects").to_string_lossy().len() + 40 };
        let md = fs::metadata(d.join("p/main.tex")).unwrap();
        w.file(&d.join("p/main.tex"), &rel, &md);
        assert_eq!(out.skipped.len(), 1);
        assert!(out.skipped[0].reason.contains("quá dài"));
        let _ = fs::remove_dir_all(&d);
    }

    #[cfg(windows)]
    #[test]
    fn junction_khong_duoc_di_theo() {
        let d = tmp("junc");
        let lib = d.join("lib");
        put(&d, "outside/secret.tex", b"bi mat");
        put(&d, "p/main.tex", b"\\documentclass{article}\n");
        assert!(mk_junction(&d.join("p/lien-ket"), &d.join("outside")), "phải tạo được junction để kiểm");
        let sc = scan(&d.join("p"), &lib).unwrap();
        assert!(sc.files.iter().all(|f| !f.rel.contains("secret")), "không được đi theo junction");
        assert!(sc.skipped.iter().any(|k| k.rel == "lien-ket" && k.reason.contains("liên kết")));
        assert!(scan(&d.join("p/lien-ket"), &lib).is_err(), "nguồn là junction ⇒ từ chối");
        let _ = fs::remove_dir_all(&d);
    }

    /// Tạo junction `link` -> `target` (Windows; không cần quyền quản trị). Đổi '/' thành '\' vì cmd hiểu "/sub" là tuỳ chọn.
    #[cfg(windows)]
    fn mk_junction(link: &Path, target: &Path) -> bool {
        let fix = |p: &Path| p.to_string_lossy().replace('/', "\\");
        std::process::Command::new("cmd").args(["/C", "mklink", "/J", &fix(link), &fix(target)]).output().map(|o| o.status.success()).unwrap_or(false)
    }

    // ---- hồi quy TOCTOU: nguồn bị thay thành liên kết GIỮA lúc quét và lúc chép ----

    #[cfg(windows)]
    #[test]
    fn toctou_thu_muc_con_bi_thay_bang_junction_giua_quet_va_chep() {
        let d = tmp("toctou-dir");
        let lib = d.join("lib");
        put(&d, "p/main.tex", b"\\documentclass{article}\n");
        put(&d, "p/sub/a.tex", b"that");
        put(&d, "outside/a.tex", b"XXXX"); // cùng độ dài với bản thật để lỗi KHÔNG thể được phát hiện chỉ nhờ so kích thước
        let sc = scan(&d.join("p"), &lib).unwrap();
        assert!(sc.files.iter().any(|f| f.rel == "sub/a.tex"));
        // kẻ khác thay thư mục `sub` bằng junction trỏ ra ngoài
        fs::remove_dir_all(d.join("p/sub")).unwrap();
        assert!(mk_junction(&d.join("p/sub"), &d.join("outside")), "phải tạo được junction để kiểm");
        let staging = d.join("stg");
        fs::create_dir_all(&staging).unwrap();
        let r = copy_scanned(&d.join("p"), &sc.files, &staging);
        assert!(r.is_err(), "phải từ chối, không được đọc ngoài thư mục nguồn");
        assert!(!staging.join("sub/a.tex").exists(), "nội dung ngoài thư mục không được lọt vào bản chép");
        // import cả quy trình cũng không để lại dự án dở
        let _ = fs::remove_dir(d.join("p/sub"));
        let _ = fs::remove_dir_all(&d);
    }

    #[cfg(windows)]
    #[test]
    fn open_inside_tu_choi_qua_junction_o_thanh_phan_cha() {
        let d = tmp("open-junc");
        put(&d, "root/ok.tex", b"1");
        put(&d, "outside/x.tex", b"2");
        assert!(open_inside(&d.join("root"), "ok.tex").is_ok());
        assert!(mk_junction(&d.join("root/lk"), &d.join("outside")), "phải tạo được junction để kiểm");
        assert!(open_inside(&d.join("root"), "lk/x.tex").is_err());
        assert!(open_inside(&d.join("root"), "../outside/x.tex").is_err());
        let _ = fs::remove_dir(d.join("root/lk"));
        let _ = fs::remove_dir_all(&d);
    }

    #[cfg(unix)]
    #[test]
    fn toctou_tep_bi_thay_bang_symlink_giua_quet_va_chep() {
        let d = tmp("toctou-file");
        let lib = d.join("lib");
        put(&d, "p/main.tex", b"\\documentclass{article}\n");
        put(&d, "outside.tex", b"BI-MAT");
        let sc = scan(&d.join("p"), &lib).unwrap();
        fs::remove_file(d.join("p/main.tex")).unwrap();
        std::os::unix::fs::symlink(d.join("outside.tex"), d.join("p/main.tex")).unwrap();
        let staging = d.join("stg");
        fs::create_dir_all(&staging).unwrap();
        assert!(copy_scanned(&d.join("p"), &sc.files, &staging).is_err());
        assert!(!staging.join("main.tex").exists());
        let _ = fs::remove_dir_all(&d);
    }

    #[cfg(windows)]
    #[test]
    fn toctou_tep_bi_thay_bang_symlink_windows_neu_may_cho_phep() {
        let d = tmp("toctou-wsym");
        let lib = d.join("lib");
        put(&d, "p/main.tex", b"\\documentclass{article}\n");
        put(&d, "outside.tex", b"BI-MAT");
        let sc = scan(&d.join("p"), &lib).unwrap();
        fs::remove_file(d.join("p/main.tex")).unwrap();
        if std::os::windows::fs::symlink_file(d.join("outside.tex"), d.join("p/main.tex")).is_err() {
            let _ = fs::remove_dir_all(&d); // không có quyền tạo symlink ⇒ bỏ qua (junction đã được kiểm ở test khác)
            return;
        }
        let staging = d.join("stg");
        fs::create_dir_all(&staging).unwrap();
        assert!(copy_scanned(&d.join("p"), &sc.files, &staging).is_err());
        assert!(!staging.join("main.tex").exists());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn nguon_doi_noi_dung_giua_quet_va_chep_thi_bao_loi() {
        let d = tmp("toctou-size");
        let lib = d.join("lib");
        put(&d, "p/main.tex", b"\\documentclass{article}\n");
        let sc = scan(&d.join("p"), &lib).unwrap();
        fs::write(d.join("p/main.tex"), b"\\documentclass{article}\n%them cho dai ra\n").unwrap();
        let staging = d.join("stg");
        fs::create_dir_all(&staging).unwrap();
        assert!(copy_scanned(&d.join("p"), &sc.files, &staging).is_err());
        let _ = fs::remove_dir_all(&d);
    }

    // ---- hồi quy verify()/read_manifest(): không đi theo liên kết trong thư viện ----

    #[cfg(windows)]
    #[test]
    fn verify_khong_di_theo_junction_dat_trong_thu_vien() {
        let d = tmp("verify-junc");
        let lib = d.join("lib");
        put(&d, "p/main.tex", b"\\documentclass{article}\n");
        put(&d, "p/s/a.tex", b"giong");
        put(&d, "outside/a.tex", b"giong"); // cùng nội dung: nếu đi theo junction, hash sẽ KHỚP và verify báo sai là ổn
        put(&d, "outside/them.tex", b"tep ngoai");
        let s = import(&lib, &d.join("p"), "v", None).unwrap();
        let pd = lib.join("projects").join(&s.id);
        fs::remove_dir_all(pd.join("s")).unwrap();
        assert!(mk_junction(&pd.join("s"), &d.join("outside")), "phải tạo được junction để kiểm");
        let v = verify(&lib, &s.id).unwrap();
        assert!(!v.ok, "phải báo không ổn thay vì coi là khớp");
        assert_eq!(v.blocked, vec!["s".to_string(), "s/a.tex".to_string()]);
        assert!(v.extra.iter().all(|e| !e.starts_with("s/")), "không được liệt kê tệp bên ngoài như tệp của dự án: {:?}", v.extra);
        assert_eq!(fs::read(d.join("outside/a.tex")).unwrap(), b"giong", "tệp ngoài không bị đụng");
        let _ = fs::remove_dir(pd.join("s"));
        let _ = fs::remove_dir_all(&d);
    }

    #[cfg(windows)]
    #[test]
    fn thu_muc_du_an_hoac_hedu_la_junction_thi_khong_doc() {
        let d = tmp("proj-junc");
        let lib = d.join("lib");
        put(&d, "a.tex", b"\\documentclass{article}\n");
        put(&d, "b.tex", b"\\documentclass{book}\n");
        let a = import(&lib, &d.join("a.tex"), "A", None).unwrap();
        let b = import(&lib, &d.join("b.tex"), "B", None).unwrap();
        // thư mục dự án A bị thay bằng junction sang dự án B
        let pa = lib.join("projects").join(&a.id);
        fs::remove_dir_all(&pa).unwrap();
        assert!(mk_junction(&pa, &lib.join("projects").join(&b.id)), "phải tạo được junction để kiểm");
        assert!(read_manifest(&lib, &a.id).is_err());
        assert!(verify(&lib, &a.id).is_err());
        let _ = fs::remove_dir(&pa);
        // `.hedu` của B bị thay bằng junction ra ngoài
        let pb = lib.join("projects").join(&b.id);
        put(&d, "evil/manifest.json", b"{}");
        fs::remove_dir_all(pb.join(".hedu")).unwrap();
        assert!(mk_junction(&pb.join(".hedu"), &d.join("evil")), "phải tạo được junction để kiểm");
        assert!(read_manifest(&lib, &b.id).is_err());
        let _ = fs::remove_dir(pb.join(".hedu"));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn chi_muc_dung_lai_duoc_va_manifest_hong_khong_xoa_tep() {
        let d = tmp("index");
        let lib = d.join("lib");
        put(&d, "a.tex", b"\\documentclass{article}\n");
        let a = import(&lib, &d.join("a.tex"), "A", None).unwrap();
        let b = create_blank(&lib, "B").unwrap();
        fs::remove_file(lib.join("index.json")).unwrap();
        let l = list(&lib);
        assert_eq!(l.len(), 2);
        assert!(l.iter().any(|x| x.id == a.id) && l.iter().any(|x| x.id == b.id));
        // index lệch số lượng ⇒ dựng lại
        fs::write(lib.join("index.json"), b"[]").unwrap();
        assert_eq!(list(&lib).len(), 2);
        // manifest hỏng: dự án không vào danh sách nhưng tệp còn nguyên
        fs::write(lib.join("projects").join(&a.id).join(".hedu/manifest.json"), b"{hong").unwrap();
        assert_eq!(rebuild_index(&lib).len(), 1);
        assert!(lib.join("projects").join(&a.id).join("a.tex").is_file());
        assert!(read_manifest(&lib, &a.id).is_err());
        assert!(read_manifest(&lib, "../..").is_err());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn verify_thay_tep_doi_thieu_va_them() {
        let d = tmp("verify");
        let lib = d.join("lib");
        put(&d, "p/main.tex", b"\\documentclass{article}\n");
        put(&d, "p/x.tex", b"1");
        let s = import(&lib, &d.join("p"), "v", None).unwrap();
        let pd = lib.join("projects").join(&s.id);
        fs::write(pd.join("main.tex"), b"\\documentclass{book}\n").unwrap();
        fs::remove_file(pd.join("x.tex")).unwrap();
        fs::write(pd.join("them.tex"), b"3").unwrap();
        let v = verify(&lib, &s.id).unwrap();
        assert!(!v.ok);
        assert_eq!((v.changed, v.missing, v.extra), (vec!["main.tex".to_string()], vec!["x.tex".to_string()], vec!["them.tex".to_string()]));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn tao_du_an_trong() {
        let d = tmp("blank");
        let lib = d.join("lib");
        let s = create_blank(&lib, "  Đề mới  ").unwrap();
        assert_eq!((s.name.as_str(), s.main_file.as_deref(), s.file_count), ("Đề mới", Some("main.tex"), 1));
        assert!(verify(&lib, &s.id).unwrap().ok);
        assert_eq!(create_blank(&lib, "").unwrap().name, "Đề mới");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn loi_giua_chung_khong_de_lai_thu_muc_do() {
        let d = tmp("fail");
        let lib = d.join("lib");
        put(&d, "p/main.tex", b"\\documentclass{article}\n");
        assert!(import(&lib, &d.join("p"), "x", Some("khong-co.tex")).is_err());
        let left = fs::read_dir(lib.join("projects")).map(|r| r.flatten().count()).unwrap_or(0);
        assert_eq!(left, 0, "không để lại thư mục .staging");
        let _ = fs::remove_dir_all(&d);
    }
}
