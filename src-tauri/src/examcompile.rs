//! E2a: biên dịch TOÀN BỘ một dự án đề trong thư viện thành PDF bằng TeX Live có sẵn trên máy. Thiết kế: claude/thiet-ke-de-thi.md (mục 2.2, 2.4, 3).
//! - Thư mục build riêng `cache/exam-build/<id>/work` (chỉ chép tệp đã đổi, xoá tệp đã bị xoá khỏi nguồn); nguồn không bị ghi thêm tệp phụ.
//! - Không qua shell; `-no-shell-escape`; không tự cài gói; hết giờ/huỷ ⇒ giết CẢ CÂY tiến trình (Job Object, proc.rs).
//! - Thành công = thoát mã 0 + không có lỗi nghiêm trọng trong log + có PDF. Có PDF nhưng lỗi ⇒ "PDF không hợp lệ", KHÔNG xuất bản.
//! - Chỉ xuất bản (ghi tạm rồi đổi tên) khi thành công; luôn giữ PDF tốt gần nhất.
//! - Bộ đệm theo dấu vân của MỌI tệp trong dự án + engine + số lượt + chế độ + gói đi kèm + phiên bản TeX.
//! - Chế độ đề/lời giải chưa có ở E2a (E5): mọi PDF mang nhãn `nguyen-van` (chưa xác định, có thể chứa lời giải).
#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::examprofile;
use crate::examlib::{self, bad_rel, is_link, open_inside, projects_dir, read_manifest, sha256_file, sha256_reader, valid_id, MAX_DEPTH, MAX_FILES, MAX_TOTAL_BYTES};
use crate::proc::run_job;
use crate::support;
use crate::tikz;

pub const JOBNAME: &str = "hedu-out";
/// Chế độ E2a: biên dịch nguyên văn, CHƯA xác định đề hay lời giải (E5 mới có hai chế độ).
pub const MODE_RAW: &str = "nguyen-van";
/// Bản đề in trắng đen — chỉ có với tệp dữ liệu ghép theo mẫu HyMath (chế độ do tệp bọc đặt, `wrap_modes`).
pub const MODE_DE_IN: &str = "de-in";
const MAX_LOG: usize = 2 * 1024 * 1024;
pub(crate) const RAW_LOG_KEEP: usize = 64 * 1024;
const MAX_DIAGS: usize = 200;

#[derive(Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct CompileOpts {
    pub engine: Option<String>,
    pub timeout_secs: Option<u64>,
    pub runs: Option<u32>,
    /// thư mục bin của TeX Live (như cài đặt TikZ)
    pub tex_bin: Option<String>,
    /// true = bỏ qua bộ đệm, luôn dịch lại
    pub force: Option<bool>,
    /// nguyen-van (mặc định) | de | loigiai — hai chế độ sau cần nhận diện chắc ex_test (xem examprofile.rs)
    pub mode: Option<String>,
    /// tệp .tex chính thay cho tệp chính của dự án (vd `main-101.tex`, mỗi mã đề một tệp). Không đặt = như cũ. Phải là tệp .tex có trong dự án.
    pub main: Option<String>,
    /// Tệp chính CHỈ có nội dung đề (không có \documentclass): bộ tệp "bọc" do giao diện dựng theo mẫu in (WRAP_MAIN + khai báo).
    /// Chỉ ghi vào thư mục build, cạnh tệp chính; tệp của dự án không bao giờ bị sửa. Tệp chính đã có \documentclass thì bỏ qua.
    pub wrap: Option<Vec<WrapFile>>,
    /// true = tệp bọc tự đặt chế độ Đề / Đề in / Lời giải (mẫu HyMath: \\CheDo) ⇒ không dò \\usepackage{ex_test} để đổi tuỳ chọn.
    pub wrap_modes: Option<bool>,
    /// làn dịch riêng (0, 1, 2…): thư mục làm việc riêng `build/lane-N/work` để nhiều mã đề dịch SONG SONG không giẫm lên nhau. Không đặt = làn chính như cũ.
    #[serde(default)]
    pub lane: Option<u32>,
}

#[derive(Deserialize, Clone, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WrapFile {
    pub path: String,
    pub text: String,
}

/// Tên tệp bọc (có \documentclass, khai báo và \input tệp dữ liệu) — luôn phải có trong `wrap`.
pub const WRAP_MAIN: &str = "hedu-boc.tex";
const WRAP_MAX_FILES: usize = 8;
const WRAP_MAX_BYTES: usize = 2 * 1024 * 1024;

/// Tệp có lệnh \documentclass đang hoạt động (không tính dòng chú thích) ⇒ đã là tài liệu đầy đủ.
pub fn has_documentclass(text: &str) -> bool {
    text.split('\n').any(|l| examprofile::code_part(l).contains("\\documentclass"))
}

/// Kiểm bộ tệp bọc: tên đơn giản (không thư mục), đuôi .tex/.sty, giới hạn số lượng và dung lượng, có WRAP_MAIN.
pub fn check_wrap(files: &[WrapFile]) -> Result<(), String> {
    if files.is_empty() || files.len() > WRAP_MAX_FILES {
        return Err("Bộ tệp bọc không hợp lệ (số tệp).".into());
    }
    let mut total = 0usize;
    let mut seen = HashSet::new();
    for f in files {
        let n = f.path.as_str();
        let l = n.to_lowercase();
        let ok_name = !n.is_empty() && n.len() <= 64 && n.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.') && n.chars().next().is_some_and(|c| c.is_ascii_alphanumeric()) && !n.contains("..");
        if !ok_name || !(l.ends_with(".tex") || l.ends_with(".sty")) {
            return Err(format!("Tên tệp bọc không hợp lệ: {n}"));
        }
        if !seen.insert(l) {
            return Err(format!("Tệp bọc bị trùng: {n}"));
        }
        total += f.text.len();
    }
    if total > WRAP_MAX_BYTES {
        return Err("Bộ tệp bọc quá lớn.".into());
    }
    if !files.iter().any(|f| f.path == WRAP_MAIN) {
        return Err(format!("Thiếu tệp {WRAP_MAIN}."));
    }
    Ok(())
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Diag {
    /// error | warning
    pub severity: String,
    /// tệp theo đường dẫn tương đối trong dự án (None = log không nêu tệp)
    pub file: Option<String>,
    pub line: Option<u32>,
    /// false: tệp ngoài dự án (gói hệ thống…) hoặc không suy ra được ⇒ giao diện KHÔNG nhảy tới dòng
    pub in_project: bool,
    pub message: String,
    pub context: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GoodInfo {
    pub fingerprint: String,
    pub engine: String,
    pub mode: String,
    pub tex_version: String,
    pub pages: Option<u32>,
    pub bytes: u64,
    pub at: String,
    pub pdf_path: String,
    /// dấu vân của danh sách tệp nguồn lúc biên dịch (để biết PDF còn khớp nguồn hiện tại hay không)
    #[serde(default)]
    pub files_hash: String,
    /// khoá của tệp chính riêng (rỗng = tệp chính của dự án); bản tốt của tệp chính khác nhau KHÔNG ghi đè nhau
    #[serde(default)]
    pub main: String,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CompileOut {
    /// ok | failed | timeout | cancelled | no-tex
    pub status: String,
    pub message: String,
    /// PDF mới vừa được xuất bản làm "bản tốt gần nhất"
    pub published: bool,
    /// lấy lại từ bộ đệm, không dịch lại
    pub cached: bool,
    /// dịch lỗi nhưng TeX vẫn ghi ra PDF: PDF đó KHÔNG hợp lệ để phát hành và đã bị bỏ
    pub invalid_pdf: bool,
    /// có bản tốt cũ còn giữ lại (khi lần này không thành công)
    pub kept_previous: bool,
    pub pages: Option<u32>,
    pub runs: u32,
    pub ms: u64,
    pub engine: String,
    pub tex_version: String,
    pub fingerprint: String,
    pub mode: String,
    pub diagnostics: Vec<Diag>,
    pub error_count: u32,
    pub warning_count: u32,
    pub warnings: Vec<String>,
    /// phần cuối log TeX (tối đa 64 KB) để xem thô khi cần
    pub raw_log: String,
    pub last_good: Option<GoodInfo>,
    /// tiến trình có nằm trong Job Object (dừng được cả cây)
    pub tree_guard: bool,
    /// những dòng bị đổi trong BẢN DẪN XUẤT (chỉ trong thư mục build) khi biên dịch chế độ Đề/Lời giải
    pub profile_changes: Vec<examprofile::Change>,
}

/// Chế độ biên dịch hợp lệ.
pub fn mode_of(m: &Option<String>) -> Result<&'static str, String> {
    match m.as_deref() {
        None | Some("") | Some("nguyen-van") => Ok(MODE_RAW),
        Some("de") => Ok(examprofile::MODE_DE),
        Some("loigiai") => Ok(examprofile::MODE_LOIGIAI),
        Some("de-in") => Ok(MODE_DE_IN),
        Some(o) => Err(format!("Chế độ '{o}' không hợp lệ.")),
    }
}

/// Tên tệp PDF/sổ của bản tốt gần nhất theo chế độ (nguyên văn giữ tên cũ để tương thích).
fn good_names(mode: &str, slot: &str) -> (String, String) {
    let base = match mode {
        "de" => "last-good-de",
        "loigiai" => "last-good-loigiai",
        "de-in" => "last-good-de-in",
        _ => "last-good",
    };
    if slot.is_empty() {
        (format!("{base}.json"), format!("{base}.pdf"))
    } else {
        (format!("{base}@{slot}.json"), format!("{base}@{slot}.pdf"))
    }
}

/// Khoá an toàn (chỉ a-z, 0-9, '-') cho một tệp chính riêng; kèm 8 ký tự băm để hai đường dẫn khác nhau không bao giờ trùng khoá.
pub fn slot_of(rel: &str) -> String {
    let mut t: String = rel.to_lowercase().chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
    while t.contains("--") {
        t = t.replace("--", "-");
    }
    let t = t.trim_matches('-');
    let t: String = t.chars().take(24).collect();
    let mut h = Sha256::new();
    h.update(rel.as_bytes());
    let hex: String = h.finalize().iter().take(4).map(|b| format!("{b:02x}")).collect();
    format!("{t}-{hex}")
}

// ---------- engine, chạy một lượt ----------

pub fn engine_of(e: &Option<String>) -> Result<&'static str, String> {
    match e.as_deref() {
        None | Some("") | Some("pdflatex") => Ok("pdflatex"),
        Some("xelatex") => Ok("xelatex"),
        Some("lualatex") => Ok("lualatex"),
        Some(o) => Err(format!("Engine '{o}' không được hỗ trợ (chỉ pdflatex, xelatex, lualatex).")),
    }
}

fn texinputs_for_project(support_dir: &Option<PathBuf>) -> Option<String> {
    // "." trước: tệp của dự án luôn được ưu tiên hơn gói đi kèm; dấu phân cách cuối để TeX vẫn tìm ở chỗ mặc định.
    support_dir.as_ref().map(|d| {
        let sep = if cfg!(windows) { ';' } else { ':' };
        format!(".{sep}{}{sep}", d.display().to_string().replace('\\', "/"))
    })
}

pub(crate) fn engine_command(tex_bin: &Option<String>, engine: &str, support_dir: &Option<PathBuf>, cwd: &Path) -> Command {
    let mut c = Command::new(tikz::prog(tex_bin, engine));
    c.current_dir(cwd);
    if let Some(t) = texinputs_for_project(support_dir) {
        c.env("TEXINPUTS", t);
    }
    tikz::hide_console(&mut c);
    c
}

#[path = "examfmt.rs"]
pub(crate) mod examfmt;

/// Nơi giữ các tệp phụ (.aux, .out, .thm, .toc…) của lần dịch thành công gần nhất cho (chế độ, tệp chính); dùng chung mọi làn của một đề.
pub(crate) fn aux_store(root: &Path, id: &str, mode: &str, slot: &str) -> PathBuf {
    let slot = if slot.is_empty() { "chinh" } else { slot };
    build_dir(root, id).join("aux").join(format!("{mode}-{slot}"))
}

/// Tệp phụ của lần dịch: `hedu-out.*` trừ PDF, nhật ký, SyncTeX (là kết quả, không phải dữ liệu cho lượt sau).
fn is_aux_file(name: &str) -> bool {
    name.strip_prefix(&format!("{JOBNAME}.")).map(|x| !matches!(x.to_ascii_lowercase().as_str(), "pdf" | "log" | "synctex" | "synctex.gz" | "fls" | "fmt") && !x.ends_with(".part")).unwrap_or(false)
}

/// Đặt các tệp phụ đã giữ vào thư mục dịch (không có thì để nguyên như cũ).
pub(crate) fn restore_aux(store: &Path, cwd: &Path) {
    let Ok(rd) = fs::read_dir(store) else { return };
    for e in rd.flatten() {
        let n = e.file_name().to_string_lossy().into_owned();
        if is_aux_file(&n) {
            let _ = fs::copy(e.path(), cwd.join(&n));
        }
    }
}

/// Giữ các tệp phụ vừa dịch xong: ghi vào thư mục tạm rồi đổi tên, nên không bao giờ còn bộ tệp dở dang.
pub(crate) fn keep_aux(cwd: &Path, store: &Path) {
    let Some(parent) = store.parent() else { return };
    let Ok(rd) = fs::read_dir(cwd) else { return };
    let files: Vec<PathBuf> = rd.flatten().filter(|e| is_aux_file(&e.file_name().to_string_lossy())).map(|e| e.path()).collect();
    if files.is_empty() || fs::create_dir_all(parent).is_err() {
        return;
    }
    let tmp = store.with_extension(format!("{}.part", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    if fs::create_dir_all(&tmp).is_err() || !files.iter().all(|f| f.file_name().map(|n| fs::copy(f, tmp.join(n)).is_ok()).unwrap_or(false)) {
        let _ = fs::remove_dir_all(&tmp);
        return;
    }
    let _ = fs::remove_dir_all(store);
    if fs::rename(&tmp, store).is_err() {
        let _ = fs::remove_dir_all(&tmp);
    }
}

// ---------- phiên bản TeX: hỏi một lần, nhớ trong phiên ----------

/// Dấu nhận diện tệp chạy của bộ dịch: đường dẫn + cỡ + thời điểm sửa. Cài/cập nhật TeX Live (đổi tệp chạy) ⇒ dấu khác ⇒ hỏi lại.
/// None khi không tìm thấy tệp chạy (khi đó không nhớ, hỏi mỗi lần như cũ).
pub(crate) fn exe_stamp(tex_bin: &Option<String>, engine: &str) -> Option<String> {
    let p = PathBuf::from(tikz::prog(tex_bin, engine));
    let found = if p.components().count() > 1 {
        Some(p)
    } else {
        let exts: &[&str] = if cfg!(windows) { &["exe", "bat", "cmd"] } else { &[""] };
        std::env::var_os("PATH").and_then(|paths| {
            std::env::split_paths(&paths).find_map(|d| exts.iter().map(|x| if x.is_empty() { d.join(engine) } else { d.join(engine).with_extension(x) }).find(|c| c.is_file()))
        })
    }?;
    let m = fs::metadata(&found).ok()?;
    let t = m.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_nanos();
    Some(format!("{}|{}|{t}", found.display(), m.len()))
}

static TEX_VERSIONS: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

/// Lấy phiên bản đã nhớ theo `key`, chưa có thì gọi `ask` (trả (dòng phiên bản, chạy thành công?)) và chỉ nhớ khi thành công.
fn remember_version(key: Option<String>, ask: impl FnOnce() -> std::io::Result<(String, bool)>) -> std::io::Result<String> {
    if let Some(k) = &key {
        if let Some(v) = TEX_VERSIONS.lock().unwrap_or_else(|e| e.into_inner()).get_or_insert_with(HashMap::new).get(k) {
            return Ok(v.clone());
        }
    }
    let (v, ok) = ask()?;
    if let (Some(k), true) = (key, ok && !v.is_empty()) {
        TEX_VERSIONS.lock().unwrap_or_else(|e| e.into_inner()).get_or_insert_with(HashMap::new).insert(k, v.clone());
    }
    Ok(v)
}

/// Dòng đầu của `<engine> --version`. Chạy lệnh này mất ~0,4 s nên chỉ hỏi một lần cho mỗi tệp chạy trong phiên làm việc.
pub(crate) fn tex_version(tex_bin: &Option<String>, engine: &str, support_dir: &Option<PathBuf>, cwd: &Path, cancel: &AtomicBool) -> std::io::Result<String> {
    remember_version(exe_stamp(tex_bin, engine).map(|s| format!("{engine}|{s}")), || {
        let mut vc = engine_command(tex_bin, engine, support_dir, cwd);
        vc.arg("--version");
        let v = run_job(&mut vc, Duration::from_secs(20), cancel)?;
        Ok((first_line(&v.stdout), v.success))
    })
}

// ---------- phân tích log ----------

const TEX_EXT: &[&str] = &[".tex", ".sty", ".cls", ".def", ".cfg", ".ltx", ".tikz", ".fd", ".clo", ".bib", ".dtx", ".code", ".lua"];

/// "file:12: thông báo" của `-file-line-error`. Tên tệp có thể có dấu cách và ổ đĩa ("C:/…"), nên đòi tên tệp kết thúc bằng đuôi TeX.
pub fn split_fle(line: &str) -> Option<(&str, u32, &str)> {
    for (i, ch) in line.char_indices() {
        if ch != ':' || i == 0 {
            continue;
        }
        let after = &line[i + 1..];
        let digits = after.bytes().take_while(u8::is_ascii_digit).count();
        if digits == 0 || digits > 7 || !after[digits..].starts_with(": ") {
            continue;
        }
        let file = &line[..i];
        let low = file.to_lowercase();
        if !TEX_EXT.iter().any(|e| low.ends_with(e)) {
            continue;
        }
        return Some((file, after[..digits].parse().ok()?, after[digits + 2..].trim()));
    }
    None
}

/// Đổi tên tệp trong log thành đường dẫn tương đối trong dự án. `main_dir` là thư mục (trong dự án) của tệp chính, cũng là thư mục chạy TeX.
/// `work_root` là thư mục build dạng '/'. Không chắc ⇒ (tên gốc, false).
pub fn project_rel(file: &str, main_dir: &str, work_root: &str) -> (String, bool) {
    let mut f = file.replace('\\', "/");
    let wr = work_root.trim_end_matches('/');
    if !wr.is_empty() && f.to_lowercase().starts_with(&format!("{}/", wr.to_lowercase())) {
        f = f[wr.len() + 1..].to_string();
        return norm_join("", &f).map(|r| (r, true)).unwrap_or((file.to_string(), false));
    }
    while let Some(r) = f.strip_prefix("./") {
        f = r.to_string();
    }
    let absolute = f.starts_with('/') || f.as_bytes().get(1) == Some(&b':');
    if absolute {
        return (f, false);
    }
    norm_join(main_dir, &f).map(|r| (r, true)).unwrap_or((f, false))
}

fn norm_join(base: &str, rel: &str) -> Option<String> {
    let mut st: Vec<&str> = Vec::new();
    for seg in base.split('/').chain(rel.split('/')) {
        match seg {
            "" | "." => {}
            ".." => {
                st.pop()?;
            }
            s => st.push(s),
        }
    }
    if st.is_empty() { None } else { Some(st.join("/")) }
}

pub fn parse_log(log: &str, main_dir: &str, work_root: &str) -> Vec<Diag> {
    let lines: Vec<&str> = log.lines().collect();
    let mut out: Vec<Diag> = Vec::new();
    let mut seen: HashSet<(Option<String>, Option<u32>, String)> = HashSet::new();
    let mut warns = 0;
    let ctx_after = |i: usize| -> Vec<String> {
        lines[i + 1..].iter().take(4).take_while(|l| !l.trim().is_empty()).map(|l| l.trim_end().to_string()).collect()
    };
    for (i, l) in lines.iter().enumerate() {
        let d = if let Some((file, line, msg)) = split_fle(l) {
            let (rel, inp) = project_rel(file, main_dir, work_root);
            Some(Diag { severity: "error".into(), file: Some(rel), line: Some(line), in_project: inp, message: msg.to_string(), context: ctx_after(i) })
        } else if let Some(m) = l.strip_prefix('!') {
            Some(Diag { severity: "error".into(), file: None, line: None, in_project: false, message: m.trim().to_string(), context: ctx_after(i) })
        } else if (l.starts_with("LaTeX Warning:") || l.starts_with("Package ") || l.starts_with("Class ")) && l.contains("Warning:") && warns < 50 {
            warns += 1;
            let line = l.rsplit_once("on input line ").and_then(|(_, n)| n.trim_end_matches('.').trim().parse::<u32>().ok());
            Some(Diag { severity: "warning".into(), file: None, line, in_project: false, message: l.to_string(), context: vec![] })
        } else {
            None
        };
        if let Some(d) = d {
            if out.len() < MAX_DIAGS && seen.insert((d.file.clone(), d.line, d.message.clone())) {
                out.push(d);
            }
        }
    }
    out
}

/// Có lỗi nghiêm trọng trong log (kể cả khi TeX thoát mã 0 hoặc vẫn ghi PDF).
pub fn has_severe(log: &str) -> bool {
    log.lines().any(|l| split_fle(l).is_some() || l.starts_with('!') || l.contains("Fatal error") || l.contains("Emergency stop") || l.contains("No pages of output"))
}

pub fn needs_rerun(log: &str) -> bool {
    // nhãn mới (vd. \pageref{LastPage} cho chân trang "Trang 3/12") chỉ có ở lượt sau: "undefined references" cũng cần dịch lại
    log.contains("Rerun to get") || log.contains("Label(s) may have changed") || log.contains("There were undefined references") || log.contains("Please (re)run")
}

/// "Output written on hedu-out.pdf (12 pages, 3456 bytes)." (có thể bị ngắt dòng).
pub fn parse_pages(log: &str) -> Option<u32> {
    let i = log.rfind("Output written on")?;
    let seg: String = log[i..].chars().take(240).collect::<String>().replace('\n', "");
    let p = seg.find('(')? + 1;
    let n: String = seg[p..].chars().take_while(char::is_ascii_digit).collect();
    if seg[p + n.len()..].trim_start().starts_with("page") { n.parse().ok() } else { None }
}

// ---------- thư mục build ----------

pub struct SyncOut {
    pub files: Vec<(String, String)>,
    pub blocked: Vec<String>,
    pub bytes: u64,
}

pub(crate) fn collect(dir: &Path, rel: &str, depth: usize, out: &mut Vec<String>, blocked: &mut Vec<String>) {
    if depth > MAX_DEPTH + 2 {
        blocked.push(rel.to_string());
        return;
    }
    let Ok(rd) = fs::read_dir(dir) else {
        blocked.push(rel.to_string());
        return;
    };
    let mut es: Vec<_> = rd.flatten().collect();
    es.sort_by_key(|e| e.file_name().to_string_lossy().to_lowercase());
    for e in es {
        let n = e.file_name().to_string_lossy().into_owned();
        let r = if rel.is_empty() { n.clone() } else { format!("{rel}/{n}") };
        if depth == 1 && n == ".hedu" {
            continue;
        }
        match fs::symlink_metadata(e.path()) {
            Ok(md) if is_link(&md) => blocked.push(r),
            Ok(md) if md.is_dir() => collect(&e.path(), &r, depth + 1, out, blocked),
            Ok(md) if md.is_file() => out.push(r),
            _ => blocked.push(r),
        }
    }
}

fn copy_atomic(src: &mut fs::File, dest: &Path) -> std::io::Result<()> {
    src.seek(SeekFrom::Start(0))?;
    if let Some(p) = dest.parent() {
        fs::create_dir_all(p)?;
    }
    let part = dest.with_extension("hedu-part");
    {
        let mut f = fs::File::create(&part)?;
        std::io::copy(src, &mut f)?;
        f.sync_all()?;
    }
    if fs::rename(&part, dest).is_err() {
        let _ = fs::remove_file(dest);
        fs::rename(&part, dest).inspect_err(|_| {
            let _ = fs::remove_file(&part);
        })?;
    }
    Ok(())
}

/// Đồng bộ nguồn → thư mục build: chỉ chép tệp khác/thiếu, xoá tệp đã bị xoá khỏi nguồn (lần đồng bộ trước đã chép).
/// Mọi tệp nguồn đọc qua `open_inside`; liên kết/junction/tên không an toàn KHÔNG được chép mà được báo trong `blocked`.
pub fn sync_workspace(project_dir: &Path, work: &Path, state_file: &Path) -> Result<SyncOut, String> {
    let mut rels = Vec::new();
    let mut blocked = Vec::new();
    collect(project_dir, "", 1, &mut rels, &mut blocked);
    if rels.len() > MAX_FILES {
        return Err(format!("Dự án có hơn {MAX_FILES} tệp nên chưa biên dịch được."));
    }
    fs::create_dir_all(work).map_err(|e| format!("Không tạo được thư mục build: {e}"))?;
    let mut files = Vec::new();
    let mut total = 0u64;
    for rel in rels {
        if bad_rel(&rel).is_some() {
            blocked.push(rel);
            continue;
        }
        let mut h = match open_inside(project_dir, &rel) {
            Ok(h) => h,
            Err(_) => {
                blocked.push(rel);
                continue;
            }
        };
        let len = h.metadata().map_err(|e| format!("Không đọc được {rel}: {e}"))?.len();
        total += len;
        if total > MAX_TOTAL_BYTES {
            return Err("Dự án quá lớn nên chưa biên dịch được.".into());
        }
        let sha = sha256_reader(&mut h).map_err(|e| format!("Không đọc được {rel}: {e}"))?;
        let dest = work.join(&rel);
        let same = fs::symlink_metadata(&dest).map(|m| m.is_file() && m.len() == len).unwrap_or(false) && sha256_file(&dest).map(|d| d == sha).unwrap_or(false);
        if !same {
            copy_atomic(&mut h, &dest).map_err(|e| format!("Không chép được {rel} vào thư mục build: {e}"))?;
        }
        files.push((rel, sha));
    }
    // xoá tệp đã bị xoá khỏi nguồn (không để \input cũ còn tìm thấy bản đã xoá)
    let now: HashSet<&str> = files.iter().map(|(r, _)| r.as_str()).collect();
    if let Ok(b) = fs::read(state_file) {
        if let Ok(old) = serde_json::from_slice::<Vec<String>>(&b) {
            for r in old {
                if !now.contains(r.as_str()) && bad_rel(&r).is_none() {
                    let _ = fs::remove_file(work.join(&r));
                }
            }
        }
    }
    let list: Vec<&str> = files.iter().map(|(r, _)| r.as_str()).collect();
    if let Some(p) = state_file.parent() {
        let _ = fs::create_dir_all(p);
    }
    let _ = fs::write(state_file, serde_json::to_vec(&list).unwrap_or_default());
    blocked.sort();
    blocked.dedup();
    Ok(SyncOut { files, blocked, bytes: total })
}

/// Dấu vân chỉ của danh sách tệp (không kèm engine/phiên bản TeX).
pub fn files_hash(files: &[(String, String)]) -> String {
    let mut sorted: Vec<&(String, String)> = files.iter().collect();
    sorted.sort();
    let mut h = Sha256::new();
    for (r, s) in sorted {
        h.update(r.as_bytes());
        h.update([0]);
        h.update(s.as_bytes());
        h.update([b'\n']);
    }
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

pub fn fingerprint(files: &[(String, String)], engine: &str, runs: u32, mode: &str, tex_version: &str) -> String {
    let mut sorted: Vec<&(String, String)> = files.iter().collect();
    sorted.sort();
    let mut h = Sha256::new();
    h.update(format!("hedu-exam-build-v1\nengine={engine}\nruns={runs}\nmode={mode}\nsupport={}\ntex={tex_version}\n", support::rev()).as_bytes());
    for (r, s) in sorted {
        h.update(r.as_bytes());
        h.update([0]);
        h.update(s.as_bytes());
        h.update([b'\n']);
    }
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

// ---------- bản tốt gần nhất ----------

pub(crate) fn build_dir(root: &Path, id: &str) -> PathBuf {
    root.join("cache").join("exam-build").join(id)
}

fn out_rel(id: &str, name: &str) -> String {
    format!("cache/exam-build/{id}/out/{name}")
}

/// Bản tốt gần nhất (chế độ nguyên văn).
pub fn last_good(root: &Path, id: &str) -> Option<GoodInfo> {
    last_good_mode(root, id, MODE_RAW)
}

/// Bản tốt gần nhất theo chế độ. Mọi tệp đọc qua `open_inside` từ thư mục dữ liệu: không đi theo liên kết/junction ở bất kỳ cấp nào.
pub fn last_good_mode(root: &Path, id: &str, mode: &str) -> Option<GoodInfo> {
    last_good_slot(root, id, mode, "")
}

/// Bản tốt gần nhất theo (chế độ, khoá tệp chính). `slot` rỗng = tệp chính của dự án.
pub fn last_good_slot(root: &Path, id: &str, mode: &str, slot: &str) -> Option<GoodInfo> {
    if !valid_id(id) || !slot.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return None;
    }
    let (jn, pn) = good_names(mode, slot);
    let mut b = Vec::new();
    open_inside(root, &out_rel(id, &jn)).ok()?.take(1024 * 1024).read_to_end(&mut b).ok()?;
    let info: GoodInfo = serde_json::from_slice(&b).ok()?;
    if info.mode != mode && !(mode == MODE_RAW && info.mode.is_empty()) {
        return None; // sổ không đúng chế độ của tệp (bị đổi tay) ⇒ không tin
    }
    if info.main != slot {
        return None; // sổ thuộc tệp chính khác (bị đổi tay hoặc nhầm khoá) ⇒ không tin
    }
    let pdf = open_inside(root, &out_rel(id, &pn)).ok()?;
    (pdf.metadata().map(|m| m.len() == info.bytes).unwrap_or(false)).then_some(GoodInfo { pdf_path: build_dir(root, id).join("out").join(&pn).to_string_lossy().into_owned(), ..info })
}

/// Mọi bản tốt hiện có (mỗi chế độ một bản).
pub fn all_good(root: &Path, id: &str) -> Vec<GoodInfo> {
    [MODE_RAW, examprofile::MODE_DE, MODE_DE_IN, examprofile::MODE_LOIGIAI].iter().filter_map(|m| last_good_mode(root, id, m)).collect()
}

pub(crate) fn publish(root: &Path, id: &str, pdf: &Path, info: &GoodInfo) -> Result<GoodInfo, String> {
    let (jn, pn) = good_names(&info.mode, &info.main);
    let out = build_dir(root, id).join("out");
    fs::create_dir_all(&out).map_err(|e| format!("Không tạo được thư mục PDF: {e}"))?;
    for d in [build_dir(root, id), out.clone()] {
        if fs::symlink_metadata(&d).map(|m| is_link(&m)).unwrap_or(true) {
            return Err("Thư mục PDF là liên kết/junction nên không xuất bản (an toàn).".into());
        }
    }
    let dest = out.join(&pn);
    let mut src = fs::File::open(pdf).map_err(|e| format!("Không mở được PDF vừa dịch: {e}"))?;
    copy_atomic(&mut src, &dest).map_err(|e| format!("Không xuất bản được PDF: {e}"))?;
    // SyncTeX: chép cùng tên gốc với PDF đã xuất bản (synctex tìm <tên>.synctex.gz cạnh <tên>.pdf); không có thì xoá bản cũ để khỏi lệch
    let (sy_src, sy_dest) = (pdf.with_extension("synctex.gz"), dest.with_extension("synctex.gz"));
    match fs::File::open(&sy_src) {
        Ok(mut f) => { let _ = copy_atomic(&mut f, &sy_dest); }
        Err(_) => { let _ = fs::remove_file(&sy_dest); }
    }
    let bytes = fs::metadata(&dest).map(|m| m.len()).map_err(|e| e.to_string())?;
    let rec = GoodInfo { bytes, pdf_path: dest.to_string_lossy().into_owned(), ..info.clone() };
    let part = out.join(format!("{jn}.part"));
    fs::write(&part, serde_json::to_vec(&rec).map_err(|e| e.to_string())?).map_err(|e| format!("Không ghi được thông tin PDF: {e}"))?;
    let j = out.join(&jn);
    if fs::rename(&part, &j).is_err() {
        let _ = fs::remove_file(&j);
        fs::rename(&part, &j).map_err(|e| format!("Không ghi được thông tin PDF: {e}"))?;
    }
    Ok(rec)
}

// ---------- chạy, đăng ký huỷ ----------

static RUNNING: Mutex<Option<HashMap<String, Arc<AtomicBool>>>> = Mutex::new(None);

pub(crate) struct RunGuard(String);
impl Drop for RunGuard {
    fn drop(&mut self) {
        if let Some(m) = RUNNING.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
            m.remove(&self.0);
        }
    }
}

/// Đăng ký một lần biên dịch cho dự án; đang chạy rồi thì từ chối (không chạy song song trên cùng thư mục build).
pub(crate) fn register(id: &str) -> Result<(RunGuard, Arc<AtomicBool>), String> {
    let mut g = RUNNING.lock().unwrap_or_else(|e| e.into_inner());
    let m = g.get_or_insert_with(HashMap::new);
    if m.contains_key(id) {
        return Err("Dự án này đang được biên dịch. Hãy chờ hoặc bấm Dừng.".into());
    }
    let flag = Arc::new(AtomicBool::new(false));
    m.insert(id.to_string(), flag.clone());
    Ok((RunGuard(id.to_string()), flag))
}

/// Dự án có đang được biên dịch không.
pub(crate) fn is_running(id: &str) -> bool {
    RUNNING.lock().unwrap_or_else(|e| e.into_inner()).as_ref().map(|m| m.contains_key(id)).unwrap_or(false)
}

/// Yêu cầu dừng lần biên dịch đang chạy của dự án. true nếu có lần đang chạy.
pub fn cancel(id: &str) -> bool {
    let g = RUNNING.lock().unwrap_or_else(|e| e.into_inner());
    let Some(m) = g.as_ref() else { return false };
    let lane_prefix = format!("{id}#lane");
    let mut any = false;
    for (k, f) in m.iter() {
        if k == id || k.starts_with(&lane_prefix) {
            f.store(true, Ordering::SeqCst);
            any = true;
        }
    }
    any
}

pub(crate) fn read_capped(p: &Path) -> String {
    let mut b = Vec::new();
    let _ = fs::File::open(p).and_then(|f| f.take(MAX_LOG as u64).read_to_end(&mut b));
    String::from_utf8_lossy(&b).into_owned()
}

pub(crate) fn tail(s: &str, keep: usize) -> String {
    if s.len() <= keep {
        return s.to_string();
    }
    let mut i = s.len() - keep;
    while !s.is_char_boundary(i) {
        i += 1;
    }
    s[i..].to_string()
}

pub(crate) fn first_line(s: &str) -> String {
    s.lines().next().unwrap_or("").trim().chars().take(160).collect()
}

/// Biên dịch dự án `id`. Lỗi biên dịch KHÔNG phải `Err`: trả `Ok` với `status` tương ứng. `Err` chỉ cho lỗi dùng sai/hạ tầng.
pub fn compile(root: &Path, id: &str, opts: &CompileOpts, support_dir: &Option<PathBuf>) -> Result<CompileOut, String> {
    let lib = root.join("exam-library");
    let m = read_manifest(&lib, id)?;
    let proj_main = m.main_file.clone().ok_or("Dự án chưa chọn tệp chính. Hãy chọn tệp chính trước khi biên dịch.")?;
    // Tệp chính riêng (vd main-101.tex) phải là tệp .tex CÓ TRONG danh sách tệp của dự án; không nhận đường dẫn tùy ý.
    let main = match opts.main.as_deref() {
        None | Some("") => proj_main.clone(),
        Some(r) => {
            if bad_rel(r).is_some() || r.starts_with('-') || !r.to_lowercase().ends_with(".tex") || !m.files.iter().any(|f| f.rel == r) {
                return Err("Tệp chính riêng không hợp lệ hoặc không nằm trong dự án.".into());
            }
            r.to_string()
        }
    };
    let slot = if main == proj_main { String::new() } else { slot_of(&main) };
    if bad_rel(&main).is_some() || main.starts_with('-') || !main.to_lowercase().ends_with(".tex") {
        return Err("Tệp chính không hợp lệ.".into());
    }
    let engine = engine_of(&opts.engine.clone().or_else(|| Some(m.compile.engine.clone())))?;
    let limit = Duration::from_secs(opts.timeout_secs.unwrap_or(m.compile.timeout_secs as u64).clamp(1, 900));
    let runs = opts.runs.unwrap_or(m.compile.runs).clamp(1, 3);
    let mode = mode_of(&opts.mode)?;
    let reg_key = match opts.lane { Some(n) => format!("{id}#lane{n}"), None => id.to_string() };
    let (_guard, cancel_flag) = register(&reg_key)?;
    let started = Instant::now();

    let build = match opts.lane {
        Some(n) => build_dir(root, id).join(format!("lane-{n}")),
        None => build_dir(root, id),
    };
    let work = build.join("work");
    let sync = sync_workspace(&projects_dir(&lib).join(id), &work, &build.join("synced.json"))?;
    if !sync.files.iter().any(|(r, _)| *r == main) {
        return Err(format!("Tệp chính '{main}' không còn trong dự án."));
    }
    let mut out = CompileOut { engine: engine.to_string(), mode: mode.to_string(), ..Default::default() };
    if !sync.blocked.is_empty() {
        out.warnings.push(format!("{} mục KHÔNG được đưa vào biên dịch vì là liên kết/junction hoặc tên không an toàn: {}.", sync.blocked.len(), sync.blocked.iter().take(8).cloned().collect::<Vec<_>>().join(", ")));
    }
    for (name, _) in support::FILES {
        if sync.files.iter().any(|(r, _)| r.rsplit('/').next().map(|b| b.eq_ignore_ascii_case(name)).unwrap_or(false)) {
            out.warnings.push(format!("Dự án có tệp «{name}» trùng tên gói đi kèm HEdu: HEdu dùng tệp CỦA DỰ ÁN."));
        }
    }
    let (main_dir, main_name) = match main.rsplit_once('/') {
        Some((d, n)) => (d.to_string(), n.to_string()),
        None => (String::new(), main.clone()),
    };
    let cwd = if main_dir.is_empty() { work.clone() } else { work.join(&main_dir) };

    // Tệp chính chỉ có nội dung đề ⇒ ghép phần đầu bằng bộ tệp bọc (CHỈ trong thư mục build). Tệp trùng tên có trong dự án thì dùng tệp của dự án.
    let mut wrap_used: Vec<(String, String)> = Vec::new();
    let mut compile_name = main_name.clone();
    if let Some(files) = opts.wrap.as_ref().filter(|f| !f.is_empty()) {
        check_wrap(files)?;
        let main_text = fs::read(work.join(&main)).ok().map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default();
        if has_documentclass(&main_text) {
            out.warnings.push("Tệp chính đã có \\documentclass nên HEdu biên dịch nguyên tệp, không ghép phần đầu theo mẫu in.".into());
        } else {
            let rel_of = |n: &str| if main_dir.is_empty() { n.to_string() } else { format!("{main_dir}/{n}") };
            for f in files {
                let rel = rel_of(&f.path);
                if sync.files.iter().any(|(r, _)| r.eq_ignore_ascii_case(&rel)) {
                    if f.path == WRAP_MAIN {
                        return Err(format!("Dự án đã có tệp tên {WRAP_MAIN}; hãy đổi tên tệp đó để HEdu ghép phần đầu."));
                    }
                    out.warnings.push(format!("Dự án có sẵn «{}» nên HEdu dùng tệp đó thay cho tệp của mẫu in.", f.path));
                    continue;
                }
                wrap_used.push((rel, f.text.clone()));
            }
            examprofile::write_derived(&work, &examprofile::Derived { files: wrap_used.clone(), changes: vec![] })?;
            compile_name = WRAP_MAIN.to_string();
        }
    }
    let work_fwd = work.to_string_lossy().replace('\\', "/");
    let work_fwd = work_fwd.trim_start_matches("//?/").to_string();

    // chế độ Đề/Lời giải: bản dẫn xuất CHỈ trong thư mục build; không chắc cách bật/tắt lời giải ⇒ KHÔNG biên dịch (không xuất PDF mang nhãn Đề)
    let mut mode_sig = mode.to_string();
    let wrap_modes = !wrap_used.is_empty() && opts.wrap_modes.unwrap_or(false);
    // Đề in trắng đen: tệp bọc HyMath (tệp chỉ có dữ liệu) hoặc đề dựng sẵn theo mẫu HyMath (có \def\CheDo, xử lí ở examprofile::derive)
    let chedo = mode == MODE_DE_IN && !wrap_modes && {
        let rels: Vec<String> = sync.files.iter().map(|(r, _)| r.clone()).collect();
        examprofile::has_chedo(&projects_dir(&lib).join(id), &rels)
    };
    if mode == MODE_DE_IN && !wrap_modes && !chedo {
        out.status = "no-profile".into();
        out.message = "Bản “Đề in trắng đen” chỉ có khi đề theo mẫu in HyMath.".into();
        out.last_good = last_good_slot(root, id, mode, &slot);
        out.kept_previous = out.last_good.is_some();
        return Ok(out);
    }
    if mode != MODE_RAW && !wrap_modes {
        let mut rels: Vec<String> = sync.files.iter().map(|(r, _)| r.clone()).collect();
        // có tệp bọc: tìm \usepackage{ex_test} trong cả tệp bọc (đọc từ thư mục build, nơi đã có bản sao dự án + tệp bọc)
        let scan_dir = if wrap_used.is_empty() { projects_dir(&lib).join(id) } else { work.clone() };
        rels.extend(wrap_used.iter().map(|(r, _)| r.clone()));
        match examprofile::derive(&scan_dir, &rels, mode) {
            Ok(d) => {
                examprofile::write_derived(&work, &d)?;
                let mut h = Sha256::new();
                for (r, t) in &d.files {
                    h.update(r.as_bytes());
                    h.update([0]);
                    h.update(t.as_bytes());
                }
                mode_sig = format!("{mode}|{}", h.finalize().iter().map(|b| format!("{b:02x}")).collect::<String>());
                out.profile_changes = d.changes;
            }
            Err(reason) => {
                out.status = "no-profile".into();
                out.message = format!("Chưa biên dịch được bản {}: {reason} Bạn vẫn có thể biên dịch 'nguyên văn' (PDF chưa xác định đề hay lời giải).", if mode == examprofile::MODE_DE { "ĐỀ" } else { "LỜI GIẢI" });
                out.last_good = last_good_slot(root, id, mode, &slot);
                out.kept_previous = out.last_good.is_some();
                return Ok(out);
            }
        }
    }

    // phiên bản TeX (vào dấu vân bộ đệm; cũng là phép thử có TeX Live hay chưa)
    let tex_bin = opts.tex_bin.clone();
    let ver = match tex_version(&tex_bin, engine, support_dir, &work, &cancel_flag) {
        Ok(v) => v,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let t = tikz::missing_tool(engine);
            out.status = "no-tex".into();
            out.message = t.message;
            out.last_good = last_good_slot(root, id, mode, &slot);
            return Ok(out);
        }
        Err(e) => return Err(format!("Không chạy được {engine}: {e}")),
    };
    out.tex_version = ver.clone();
    // Tệp chính riêng vào dấu vân; tệp chính mặc định giữ nguyên dấu vân cũ nên mọi bộ đệm hiện có vẫn dùng được.
    if !slot.is_empty() {
        mode_sig = format!("{mode_sig}|main={main}");
    }
    // tệp bọc (theo mẫu in) vào dấu vân: đổi mẫu in thì dịch lại
    let mut fp_files = sync.files.clone();
    for (r, t) in &wrap_used {
        fp_files.push((format!("<boc>/{r}"), format!("{:x}", Sha256::digest(t.as_bytes()))));
    }
    out.fingerprint = fingerprint(&fp_files, engine, runs, &mode_sig, &ver);

    if !opts.force.unwrap_or(false) {
        if let Some(g) = last_good_slot(root, id, mode, &slot) {
            if g.fingerprint == out.fingerprint {
                out.status = "ok".into();
                out.message = "Không có gì thay đổi từ lần biên dịch thành công trước nên dùng lại PDF đó.".into();
                out.cached = true;
                out.pages = g.pages;
                out.last_good = Some(g);
                out.ms = started.elapsed().as_millis() as u64;
                return Ok(out);
            }
        }
    }

    let pdf = cwd.join(format!("{JOBNAME}.pdf"));
    let logp = cwd.join(format!("{JOBNAME}.log"));
    let _ = fs::remove_file(&pdf); // không bao giờ nhầm PDF cũ là kết quả lần này
    let _ = fs::remove_file(&logp);
    // Tệp phụ (.aux, .out…) của đúng (chế độ, tệp chính) lần dịch thành công trước: số trang "x/y", nhãn, mục lục đã có sẵn nên
    // thường chỉ cần MỘT lượt. TeX vẫn tự báo khi cần chạy lại (needs_rerun) nên tệp phụ cũ không bao giờ làm sai kết quả.
    let aux_keep = aux_store(root, id, mode, &slot);
    restore_aux(&aux_keep, &cwd);

    // pdfLaTeX: phần đầu đề nạp sẵn thành định dạng (.fmt) nếu đã có; chưa có thì dịch như cũ và dựng ở luồng nền cho lần sau
    let mut fmt = if engine == "pdflatex" { examfmt::ensure(root, &cwd, &compile_name, &tex_bin, support_dir, &ver) } else { None };
    let mut tried_fmt: Option<PathBuf> = None;
    let mut run_no = 0;
    let mut last_log = String::new();
    let mut ok_run;
    loop {
        run_no += 1;
        let left = limit.checked_sub(started.elapsed()).unwrap_or(Duration::ZERO);
        if left.is_zero() {
            out.status = "timeout".into();
            break;
        }
        let mut c = engine_command(&tex_bin, engine, support_dir, &cwd);
        if let Some(f) = &fmt {
            c.arg(format!("-fmt={}", f.with_extension("").to_string_lossy().replace('\\', "/")));
        }
        c.args(["-interaction=nonstopmode", "-file-line-error", "-no-shell-escape", "-synctex=1"]).arg(format!("-jobname={JOBNAME}")).arg(&compile_name);
        let r = match run_job(&mut c, left, &cancel_flag) {
            Ok(r) => r,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                out.status = "no-tex".into();
                out.message = tikz::missing_tool(engine).message;
                out.last_good = last_good_slot(root, id, mode, &slot);
                return Ok(out);
            }
            Err(e) => return Err(format!("Không chạy được {engine}: {e}")),
        };
        out.tree_guard = r.tree_guard;
        out.runs = run_no;
        last_log = if logp.is_file() { read_capped(&logp) } else { r.stdout.clone() };
        if r.cancelled {
            out.status = "cancelled".into();
            break;
        }
        if r.timed_out {
            out.status = "timeout".into();
            break;
        }
        let severe = has_severe(&last_log);
        ok_run = r.success && !severe && pdf.is_file();
        if !ok_run {
            // lỗi khi dùng định dạng dựng sẵn ⇒ dịch lại từ đầu kiểu cũ (kết quả không bao giờ phụ thuộc vào định dạng)
            if let Some(f) = fmt.take() {
                tried_fmt = Some(f);
                run_no = 0;
                let _ = fs::remove_file(&pdf);
                let _ = fs::remove_file(&logp);
                continue;
            }
            out.status = "failed".into();
            out.invalid_pdf = pdf.is_file();
            break;
        }
        if needs_rerun(&last_log) {
            if run_no < runs {
                continue;
            }
            out.warnings.push("TeX báo cần chạy thêm một lượt để cập nhật tham chiếu (mục lục, nhãn…). Tăng 'Số lượt' hoặc biên dịch lại.".into());
        }
        out.status = "ok".into();
        break;
    }
    if let (Some(f), "ok") = (&tried_fmt, out.status.as_str()) {
        examfmt::discard(f); // định dạng làm hỏng lần dịch mà kiểu cũ thì được: bỏ, không dựng lại cho phần đầu này
    }
    if out.status == "ok" {
        keep_aux(&cwd, &aux_keep);
    }
    out.ms = started.elapsed().as_millis() as u64;
    out.pages = parse_pages(&last_log);
    let work_dir_fwd = work_fwd;
    let diags = parse_log(&last_log, &main_dir, &work_dir_fwd);
    out.error_count = diags.iter().filter(|d| d.severity == "error").count() as u32;
    out.warning_count = diags.iter().filter(|d| d.severity == "warning").count() as u32;
    out.diagnostics = diags;
    out.raw_log = tail(&last_log, RAW_LOG_KEEP);

    if out.status == "ok" {
        let info = GoodInfo { fingerprint: out.fingerprint.clone(), engine: engine.to_string(), mode: mode.to_string(), tex_version: ver, pages: out.pages, bytes: 0, at: examlib::iso_now(), pdf_path: String::new(), files_hash: files_hash(&sync.files), main: slot.clone() };
        let rec = publish(root, id, &pdf, &info)?;
        out.published = true;
        out.last_good = Some(rec);
        out.message = format!("Biên dịch thành công{}.", out.pages.map(|p| format!(" ({p} trang)")).unwrap_or_default());
    } else {
        out.last_good = last_good_slot(root, id, mode, &slot);
        out.kept_previous = out.last_good.is_some();
        out.message = match out.status.as_str() {
            "timeout" => format!("Biên dịch quá {} giây nên đã dừng (cả cây tiến trình TeX).", limit.as_secs()),
            "cancelled" => "Đã dừng biên dịch.".into(),
            _ => {
                let first = out.diagnostics.iter().find(|d| d.severity == "error").map(|d| d.message.clone()).unwrap_or_else(|| "TeX báo lỗi khi biên dịch.".into());
                format!("Biên dịch LỖI: {first}{}", if out.invalid_pdf { " (TeX vẫn ghi ra một PDF nhưng PDF đó KHÔNG hợp lệ nên đã bị bỏ)" } else { "" })
            }
        };
        if out.kept_previous {
            out.message.push_str(" Bản PDF tốt gần nhất vẫn được giữ.");
        }
    }
    Ok(out)
}

// ---------- đọc / xuất / mở PDF tốt gần nhất (E2b) ----------

/// Giới hạn PDF nạp vào giao diện (đọc cả tệp qua IPC).
pub const MAX_PDF_VIEW: u64 = 200 * 1024 * 1024;

fn good_pdf_handle(root: &Path, id: &str, mode: &str) -> Result<(fs::File, GoodInfo), String> {
    let g = last_good_mode(root, id, mode).ok_or("Chưa có PDF biên dịch thành công cho dự án này.")?;
    let h = open_inside(root, &out_rel(id, &good_names(mode, "").1))?;
    Ok((h, g))
}

/// Nội dung PDF tốt gần nhất (chế độ nguyên văn).
pub fn read_good(root: &Path, id: &str) -> Result<Vec<u8>, String> {
    read_good_mode(root, id, MODE_RAW)
}

/// Nội dung PDF tốt gần nhất của một chế độ (chỉ đúng tệp của dự án, qua `open_inside`).
/// Đọc PDF tốt của một tệp chính riêng (qua `open_inside`, giới hạn kích thước). Dùng cho gói xuất từng mã.
pub fn read_good_slot(root: &Path, id: &str, mode: &str, slot: &str) -> Result<(Vec<u8>, GoodInfo), String> {
    let g = last_good_slot(root, id, mode, slot).ok_or("Chưa có PDF biên dịch thành công cho mã này.")?;
    if g.bytes > MAX_PDF_VIEW {
        return Err("PDF quá lớn để đóng gói.".into());
    }
    let mut h = open_inside(root, &out_rel(id, &good_names(mode, slot).1))?;
    let mut b = Vec::new();
    h.read_to_end(&mut b).map_err(|e| format!("Không đọc được PDF: {e}"))?;
    if b.len() as u64 != g.bytes {
        return Err("PDF đổi kích thước giữa chừng nên không đóng gói.".into());
    }
    Ok((b, g))
}

pub fn read_good_mode(root: &Path, id: &str, mode: &str) -> Result<Vec<u8>, String> {
    let (h, g) = good_pdf_handle(root, id, mode)?;
    if g.bytes > MAX_PDF_VIEW {
        return Err(format!("PDF quá lớn để xem trong HEdu ({} MB). Hãy mở bằng ứng dụng khác.", g.bytes / 1024 / 1024));
    }
    let mut b = Vec::with_capacity(g.bytes as usize);
    h.take(MAX_PDF_VIEW + 1).read_to_end(&mut b).map_err(|e| format!("Không đọc được PDF: {e}"))?;
    if b.len() as u64 != g.bytes || !b.starts_with(b"%PDF") {
        return Err("Tệp PDF đã lưu bị hỏng hoặc đã bị đổi ngoài HEdu. Hãy biên dịch lại.".into());
    }
    Ok(b)
}

pub fn export_good(root: &Path, id: &str, dest: &Path) -> Result<(), String> {
    export_good_mode(root, id, dest, MODE_RAW)
}

/// Lưu một BẢN SAO PDF tốt gần nhất ra nơi người dùng chọn (đuôi .pdf; ghi tạm rồi đổi tên; không đụng bản trong thư viện).
pub fn export_good_mode(root: &Path, id: &str, dest: &Path, mode: &str) -> Result<(), String> {
    if !dest.to_string_lossy().to_lowercase().ends_with(".pdf") {
        return Err("Tên tệp lưu phải có đuôi .pdf.".into());
    }
    if dest.is_dir() {
        return Err("Đường dẫn lưu là một thư mục.".into());
    }
    if let (Some(p), Ok(base)) = (dest.parent(), fs::canonicalize(build_dir(root, id))) {
        if fs::canonicalize(p).map(|c| c.starts_with(&base)).unwrap_or(false) {
            return Err("Không lưu vào thư mục build của HEdu. Hãy chọn nơi khác.".into());
        }
    }
    let (mut h, _) = good_pdf_handle(root, id, mode)?;
    copy_atomic(&mut h, dest).map_err(|e| format!("Không lưu được PDF: {e}"))
}

/// Mở PDF bằng ứng dụng mặc định của Windows (explorer.exe + đường dẫn; không qua shell).
pub fn open_external(root: &Path, id: &str, mode: &str) -> Result<(), String> {
    let (_h, g) = good_pdf_handle(root, id, mode)?;
    #[cfg(windows)]
    {
        let mut c = Command::new("explorer.exe");
        c.arg(&g.pdf_path);
        c.spawn().map(|_| ()).map_err(|e| format!("Không mở được PDF: {e}"))
    }
    #[cfg(not(windows))]
    {
        let _ = g;
        Err("Chỉ hỗ trợ trên Windows.".into())
    }
}

// ---------- lệnh Tauri ----------

use tauri::{AppHandle, Manager};

fn root_of(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn exam_compile(app: AppHandle, id: String, opts: Option<CompileOpts>) -> Result<CompileOut, String> {
    let root = root_of(&app)?;
    let sup = support::prepare(&root);
    tauri::async_runtime::spawn_blocking(move || compile(&root, &id, &opts.unwrap_or_default(), &sup)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn exam_compile_cancel(id: String) -> bool {
    cancel(&id)
}

#[tauri::command]
pub fn exam_compile_last(app: AppHandle, id: String, mode: Option<String>) -> Result<Option<GoodInfo>, String> {
    Ok(last_good_mode(&root_of(&app)?, &id, mode_of(&mode)?))
}

/// Mọi bản PDF tốt hiện có của dự án (nguyên văn / đề / lời giải).
#[tauri::command]
pub fn exam_compile_all(app: AppHandle, id: String) -> Result<Vec<GoodInfo>, String> {
    Ok(all_good(&root_of(&app)?, &id))
}

/// Dự án có biên dịch riêng được "Đề" và "Lời giải" không (và lý do nếu không).
#[tauri::command]
pub async fn exam_profiles(app: AppHandle, id: String) -> Result<examprofile::ProfileInfo, String> {
    let root = root_of(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let lib = root.join("exam-library");
        let m = read_manifest(&lib, &id)?;
        let dir = projects_dir(&lib).join(&id);
        let rels: Vec<String> = { let (mut r, mut b) = (vec![], vec![]); collect(&dir, "", 1, &mut r, &mut b); r };
        let _ = &m;
        Ok(examprofile::detect(&dir, &rels))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn exam_pdf_read(app: AppHandle, id: String, mode: Option<String>) -> Result<tauri::ipc::Response, String> {
    read_good_mode(&root_of(&app)?, &id, mode_of(&mode)?).map(tauri::ipc::Response::new)
}

#[tauri::command]
pub async fn exam_pdf_export(app: AppHandle, id: String, dest: String, mode: Option<String>) -> Result<(), String> {
    let root = root_of(&app)?;
    let mode = mode_of(&mode)?;
    tauri::async_runtime::spawn_blocking(move || export_good_mode(&root, &id, Path::new(&dest), mode)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn exam_pdf_open_external(app: AppHandle, id: String, mode: Option<String>) -> Result<(), String> {
    open_external(&root_of(&app)?, &id, mode_of(&mode)?)
}

// ---------- SyncTeX: bấm trên PDF ⇒ dòng mã nguồn, và từ dòng mã ⇒ vị trí trên PDF (dùng công cụ `synctex` của TeX Live) ----------

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct SyncSrc {
    /// đường dẫn tệp nguồn do TeX ghi (có thể tương đối với thư mục dịch); giao diện tự đối chiếu với các tệp của đề
    pub file: String,
    pub line: u32,
    pub col: i32,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct SyncPos {
    pub page: u32,
    /// hộp chứa dòng mã trên trang, đơn vị điểm (1/72 inch) từ góc trên trái: x, y của đáy-trái chữ, rộng, cao
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

fn kv(line: &str) -> Option<(&str, &str)> {
    let (k, v) = line.split_once(':')?;
    Some((k.trim(), v.trim()))
}

/// Đọc kết quả `synctex edit`.
pub fn parse_edit(out: &str) -> Option<SyncSrc> {
    let (mut file, mut line, mut col) = (None, None, -1);
    for l in out.lines() {
        match kv(l) {
            Some(("Input", v)) if file.is_none() => file = Some(v.to_string()),
            Some(("Line", v)) if line.is_none() => line = v.parse::<i64>().ok().filter(|n| *n > 0).map(|n| n as u32),
            Some(("Column", v)) => col = v.parse().unwrap_or(-1),
            _ => {}
        }
    }
    Some(SyncSrc { file: file?, line: line?, col })
}

/// Đọc kết quả `synctex view` (lấy bản ghi đầu tiên).
pub fn parse_view(out: &str) -> Option<SyncPos> {
    let (mut page, mut x, mut y, mut h, mut v, mut w, mut hh) = (None, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    for l in out.lines() {
        match kv(l) {
            Some(("Page", s)) if page.is_none() => page = s.parse::<u32>().ok(),
            Some(("x", s)) if page.is_some() && x == 0.0 => x = s.parse().unwrap_or(0.0),
            Some(("y", s)) if page.is_some() && y == 0.0 => y = s.parse().unwrap_or(0.0),
            Some(("h", s)) if page.is_some() && h == 0.0 => h = s.parse().unwrap_or(0.0),
            Some(("v", s)) if page.is_some() && v == 0.0 => v = s.parse().unwrap_or(0.0),
            Some(("W", s)) if page.is_some() && w == 0.0 => w = s.parse().unwrap_or(0.0),
            Some(("H", s)) if page.is_some() && hh == 0.0 => hh = s.parse().unwrap_or(0.0),
            _ => {}
        }
        if l.trim() == "SyncTeX result end" { break; }
    }
    let _ = (x, y);
    Some(SyncPos { page: page?, x: h, y: v, w, h: hh })
}

fn synctex_pdf(root: &Path, id: &str, mode: &str) -> Result<PathBuf, String> {
    let g = last_good_mode(root, id, mode).ok_or("Chưa có PDF để tra vị trí. Hãy biên dịch đề trước.")?;
    let pdf = PathBuf::from(g.pdf_path);
    if !pdf.with_extension("synctex.gz").is_file() && !pdf.with_extension("synctex").is_file() {
        return Err("PDF này chưa có dữ liệu SyncTeX (dịch bằng bản HEdu cũ hơn). Biên dịch lại là có.".into());
    }
    Ok(pdf)
}

fn run_synctex(tex_bin: &Option<String>, args: &[&str]) -> Result<String, String> {
    let mut c = Command::new(tikz::prog(tex_bin, "synctex"));
    c.args(args);
    tikz::hide_console(&mut c);
    let o = crate::proc::run_capture(&mut c, Duration::from_secs(15)).map_err(|e| if e.kind() == std::io::ErrorKind::NotFound { "Không tìm thấy công cụ synctex của TeX Live.".to_string() } else { format!("Không chạy được synctex: {e}") })?;
    if o.timed_out { return Err("synctex chạy quá lâu nên đã dừng.".into()); }
    Ok(o.stdout)
}

/// Từ vị trí bấm trên PDF (trang từ 1, x/y đơn vị điểm từ góc trên trái) ra dòng mã nguồn.
pub fn synctex_edit(root: &Path, id: &str, mode: &str, page: u32, x: f64, y: f64, tex_bin: &Option<String>) -> Result<Option<SyncSrc>, String> {
    let pdf = synctex_pdf(root, id, mode)?;
    let spec = format!("{page}:{x:.2}:{y:.2}:{}", pdf.to_string_lossy());
    let out = run_synctex(tex_bin, &["edit", "-o", &spec])?;
    Ok(parse_edit(&out))
}

/// Từ dòng mã (tệp tương đối trong đề) ra hộp trên PDF.
pub fn synctex_view(root: &Path, id: &str, mode: &str, file: &str, line: u32, col: u32, tex_bin: &Option<String>) -> Result<Option<SyncPos>, String> {
    let pdf = synctex_pdf(root, id, mode)?;
    let spec = format!("{line}:{col}:{file}");
    let out = run_synctex(tex_bin, &["view", "-i", &spec, "-o", &pdf.to_string_lossy()])?;
    Ok(parse_view(&out))
}

#[tauri::command]
pub async fn exam_synctex_edit(app: AppHandle, id: String, mode: Option<String>, page: u32, x: f64, y: f64, tex_bin: Option<String>) -> Result<Option<SyncSrc>, String> {
    let root = root_of(&app)?;
    let mode = mode_of(&mode)?.to_string();
    tauri::async_runtime::spawn_blocking(move || synctex_edit(&root, &id, &mode, page, x, y, &tex_bin)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn exam_synctex_view(app: AppHandle, id: String, mode: Option<String>, file: String, line: u32, col: Option<u32>, tex_bin: Option<String>) -> Result<Option<SyncPos>, String> {
    let root = root_of(&app)?;
    let mode = mode_of(&mode)?.to_string();
    tauri::async_runtime::spawn_blocking(move || synctex_view(&root, &id, &mode, &file, line, col.unwrap_or(0), &tex_bin)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wf(p: &str) -> WrapFile {
        WrapFile { path: p.into(), text: "x".into() }
    }

    #[test]
    fn doc_ket_qua_synctex_edit_va_view() {
        let e = "This is SyncTeX command line utility, version 1.5\nSyncTeX result begin\nOutput:C:/x/last-good.pdf\nInput:C:/x/work/main.tex\nLine:12\nColumn:-1\nOffset:0\nContext:\nSyncTeX result end\n";
        assert_eq!(parse_edit(e), Some(SyncSrc { file: "C:/x/work/main.tex".into(), line: 12, col: -1 }));
        assert_eq!(parse_edit("SyncTeX result begin\nSyncTeX result end"), None);
        assert_eq!(parse_edit("Input:a.tex\nLine:0\n"), None, "dòng 0 không hợp lệ");
        let v = "SyncTeX result begin\nOutput:x.pdf\nPage:2\nx:133.7\ny:134.8\nh:100.5\nv:142.4\nW:343.7\nH:9.96\nbefore:\noffset:0\nmiddle:\nafter:\nPage:3\nh:1\nv:2\nW:3\nH:4\nSyncTeX result end\n";
        let p = parse_view(v).unwrap();
        assert_eq!((p.page, p.x, p.y, p.w, p.h), (2, 100.5, 142.4, 343.7, 9.96), "lấy bản ghi đầu, không trộn với bản ghi sau");
        assert_eq!(parse_view("SyncTeX result begin\nSyncTeX result end"), None);
    }

    #[test]
    fn nhan_tep_day_du_va_tep_chi_du_lieu() {
        assert!(has_documentclass("% đề\n\\documentclass[12pt]{book}\n"));
        assert!(!has_documentclass("\\TieuDeDeSo{a}\n\\begin{ex}x\\end{ex}\n"));
        assert!(!has_documentclass("%\\documentclass{book}\nabc"), "dòng chú thích không tính");
    }

    #[test]
    fn che_do_de_in() {
        assert_eq!(mode_of(&Some("de-in".into())), Ok(MODE_DE_IN));
        assert_eq!(good_names(MODE_DE_IN, ""), ("last-good-de-in.json".to_string(), "last-good-de-in.pdf".to_string()));
    }

    #[test]
    fn kiem_bo_tep_boc() {
        assert!(check_wrap(&[wf(WRAP_MAIN), wf("hedu.sty"), wf("khaibaochung.tex")]).is_ok());
        assert!(check_wrap(&[wf("hedu.sty")]).is_err(), "thiếu tệp bọc chính");
        assert!(check_wrap(&[wf(WRAP_MAIN), wf("../x.tex")]).is_err());
        assert!(check_wrap(&[wf(WRAP_MAIN), wf("a/b.tex")]).is_err());
        assert!(check_wrap(&[wf(WRAP_MAIN), wf("x.exe")]).is_err());
        assert!(check_wrap(&[wf(WRAP_MAIN), wf("HEDU-BOC.tex")]).is_err(), "trùng tên không phân biệt hoa thường");
        assert!(check_wrap(&[]).is_err());
        let big = WrapFile { path: "a.tex".into(), text: "x".repeat(WRAP_MAX_BYTES + 1) };
        assert!(check_wrap(&[wf(WRAP_MAIN), big]).is_err());
    }

    const SAMPLE: &str = "This is pdfTeX\n(./main.tex\nLaTeX Warning: Reference `x' on page 1 undefined on input line 7.\n\n./chapters/c1.tex:5: Undefined control sequence.\nl.5 \\foo\n         bar\n\n./main.tex:12: LaTeX Error: File `zzz.sty' not found.\n\nType X to quit\n! Emergency stop.\n<*> main.tex\n\nOutput written on hedu-out.pdf (3 pages, 12345 bytes).\n";

    #[test]
    fn tach_dong_loi_co_tep_va_dong() {
        assert_eq!(split_fle("./main.tex:12: LaTeX Error: x"), Some(("./main.tex", 12, "LaTeX Error: x")));
        assert_eq!(split_fle("C:/Users/A B/Đề/x.sty:5: Package y Error: z"), Some(("C:/Users/A B/Đề/x.sty", 5, "Package y Error: z")));
        assert_eq!(split_fle("Overfull \\hbox (1.0pt too wide) in paragraph at lines 3--4"), None);
        assert_eq!(split_fle("main.pdf:12: not tex"), None);
        assert_eq!(split_fle("./main.tex:x: no"), None);
    }

    #[test]
    fn chuan_hoa_duong_dan_ve_trong_du_an() {
        assert_eq!(project_rel("./chapters/c1.tex", "", "/w"), ("chapters/c1.tex".into(), true));
        assert_eq!(project_rel("./c1.tex", "sub", "/w"), ("sub/c1.tex".into(), true));
        assert_eq!(project_rel("../common/a.sty", "sub", "/w"), ("common/a.sty".into(), true));
        assert_eq!(project_rel("../../ra-ngoai.tex", "sub", "/w"), ("../../ra-ngoai.tex".into(), false));
        assert_eq!(project_rel("C:/texlive/2026/tex/latex/base/article.cls", "", "/w"), ("C:/texlive/2026/tex/latex/base/article.cls".into(), false));
        assert_eq!(project_rel("/w/sub/x.tex", "sub", "/w"), ("sub/x.tex".into(), true));
        assert_eq!(project_rel("D:\\w\\sub\\x.tex", "sub", "D:/w"), ("sub/x.tex".into(), true));
    }

    #[test]
    fn phan_tich_log_mau() {
        let d = parse_log(SAMPLE, "", "/w");
        let errs: Vec<_> = d.iter().filter(|x| x.severity == "error").collect();
        assert_eq!(errs.len(), 3, "{d:?}");
        assert_eq!((errs[0].file.as_deref(), errs[0].line, errs[0].in_project), (Some("chapters/c1.tex"), Some(5), true));
        assert!(errs[0].context.iter().any(|c| c.starts_with("l.5")));
        assert_eq!((errs[1].file.as_deref(), errs[1].line), (Some("main.tex"), Some(12)));
        assert_eq!((errs[2].file.clone(), errs[2].in_project), (None, false), "dòng '!' không nêu tệp ⇒ không đoán tệp/dòng");
        let w: Vec<_> = d.iter().filter(|x| x.severity == "warning").collect();
        assert_eq!((w.len(), w[0].line), (1, Some(7)));
        assert_eq!(parse_pages(SAMPLE), Some(3));
        assert_eq!(parse_pages("Output written on x.pdf (1 page, 10 bytes)."), Some(1));
        assert_eq!(parse_pages("khong co"), None);
    }

    #[test]
    fn huy_dung_ca_cac_lan_dich_song_song() {
        let (_g0, f0) = register("huy-lan-x").unwrap();
        let (_g1, f1) = register("huy-lan-x#lane0").unwrap();
        let (_g2, f2) = register("huy-lan-x#lane2").unwrap();
        let (_g3, f3) = register("huy-lan-xx").unwrap();
        assert!(cancel("huy-lan-x"));
        assert!(f0.load(Ordering::SeqCst) && f1.load(Ordering::SeqCst) && f2.load(Ordering::SeqCst), "huỷ dự án thì huỷ cả các làn");
        assert!(!f3.load(Ordering::SeqCst), "dự án khác (tên bắt đầu giống) không bị huỷ");
        assert!(register("huy-lan-x#lane0").is_err(), "một làn không chạy hai lượt cùng lúc");
    }

    #[test]
    fn nhan_dien_loi_nghiem_trong_va_chay_lai() {
        assert!(has_severe(SAMPLE));
        assert!(has_severe("! Emergency stop."));
        assert!(has_severe("Fatal error occurred, no output PDF file produced!"));
        assert!(has_severe("./a.tex:3: Undefined control sequence."));
        assert!(!has_severe("LaTeX Warning: Label(s) may have changed. Rerun\nOverfull \\hbox\nOutput written on x.pdf (1 page, 1 bytes)."));
        assert!(needs_rerun("LaTeX Warning: Label(s) may have changed. Rerun to get cross-references right."));
        assert!(!needs_rerun("all good"));
        assert!(needs_rerun("LaTeX Warning: There were undefined references."));
        assert!(needs_rerun("Package rerunfilecheck Warning: File foo.out has changed. Please (re)run LaTeX."));
    }

    #[test]
    fn phien_ban_tex_hoi_mot_lan_va_hoi_lai_khi_doi_tep_chay() {
        let d = crate::testutil::dir("examcompile-phien-ban-tex");
        fs::create_dir_all(&d).unwrap();
        let exe = d.join(if cfg!(windows) { "gialap.exe" } else { "gialap" });
        fs::write(&exe, b"v1").unwrap();
        let bin = Some(d.to_string_lossy().into_owned());
        let s1 = exe_stamp(&bin, "gialap").expect("tìm thấy tệp chạy trong thư mục bin");
        assert!(exe_stamp(&bin, "khong-co-tep-nay-123").is_none());
        let mut calls = 0;
        let mut ask = |v: &str, ok: bool| { calls += 1; Ok::<_, std::io::Error>((v.to_string(), ok)) };
        let k1 = Some(format!("thu|{s1}"));
        assert_eq!(remember_version(k1.clone(), || ask("TeX 1", true)).unwrap(), "TeX 1");
        assert_eq!(remember_version(k1.clone(), || ask("KHÔNG ĐƯỢC GỌI", true)).unwrap(), "TeX 1", "lần sau dùng bản đã nhớ");
        // tệp chạy đổi (cập nhật TeX Live) ⇒ dấu khác ⇒ hỏi lại
        fs::write(&exe, b"phien-ban-moi-dai-hon").unwrap();
        let s2 = exe_stamp(&bin, "gialap").unwrap();
        assert_ne!(s1, s2);
        assert_eq!(remember_version(Some(format!("thu|{s2}")), || ask("TeX 2", true)).unwrap(), "TeX 2");
        // chạy lỗi thì không nhớ; không tìm được tệp chạy thì không nhớ
        let k3 = Some("thu|loi".to_string());
        assert_eq!(remember_version(k3.clone(), || ask("", false)).unwrap(), "");
        assert_eq!(remember_version(k3, || ask("TeX 3", true)).unwrap(), "TeX 3");
        assert_eq!(remember_version(None, || ask("A", true)).unwrap(), "A");
        assert_eq!(remember_version(None, || ask("B", true)).unwrap(), "B");
        assert_eq!(calls, 6);
    }

    #[test]
    fn giu_aux_rieng_theo_che_do_va_tep_chinh() {
        let d = crate::testutil::dir("examcompile-giu-aux");
        let _ = fs::remove_dir_all(&d);
        let a = aux_store(&d, "de1", "de", &slot_of("main-101.tex"));
        let b = aux_store(&d, "de1", "loigiai", &slot_of("main-101.tex"));
        let c = aux_store(&d, "de1", "de", &slot_of("main-102.tex"));
        let m = aux_store(&d, "de1", "de", "");
        assert!(a != b && a != c && a != m && a.starts_with(build_dir(&d, "de1")));
        let w = d.join("work");
        fs::create_dir_all(&w).unwrap();
        keep_aux(&w, &a);
        assert!(!a.exists(), "không có tệp phụ thì không ghi gì");
        for (n, t) in [("hedu-out.aux", "\\zref@newlabel{101-lastpage}{3}"), ("hedu-out.out", "bookmark"), ("hedu-out.pdf", "%PDF"), ("hedu-out.log", "log"), ("hedu-out.synctex.gz", "s"), ("khac.aux", "x")] {
            fs::write(w.join(n), t).unwrap();
        }
        keep_aux(&w, &a);
        let mut kept: Vec<String> = fs::read_dir(&a).unwrap().flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect();
        kept.sort();
        assert_eq!(kept, vec!["hedu-out.aux", "hedu-out.out"], "chỉ giữ tệp phụ của lần dịch, không giữ PDF/nhật ký/SyncTeX");
        fs::write(w.join("hedu-out.aux"), b"moi").unwrap();
        fs::remove_file(w.join("hedu-out.out")).unwrap();
        keep_aux(&w, &a);
        assert_eq!(fs::read(a.join("hedu-out.aux")).unwrap(), b"moi", "ghi đè bản cũ");
        assert!(!a.join("hedu-out.out").exists(), "thay cả bộ, không trộn bộ cũ");
        assert_eq!(fs::read_dir(a.parent().unwrap()).unwrap().count(), 1, "không sót thư mục tạm");
        let w2 = d.join("work2");
        fs::create_dir_all(&w2).unwrap();
        restore_aux(&a, &w2);
        assert_eq!(fs::read(w2.join("hedu-out.aux")).unwrap(), b"moi");
        restore_aux(&d.join("khong-co"), &w2); // không có bộ giữ: không làm gì
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn engine_chi_nhan_ba_bo_dich() {
        assert_eq!(engine_of(&None), Ok("pdflatex"));
        assert_eq!(engine_of(&Some("xelatex".into())), Ok("xelatex"));
        assert_eq!(engine_of(&Some("lualatex".into())), Ok("lualatex"));
        assert!(engine_of(&Some("C:\\evil.exe".into())).is_err());
        assert!(engine_of(&Some("pdflatex -shell-escape".into())).is_err());
    }

    #[test]
    fn dau_van_doi_khi_bat_ky_yeu_to_nao_doi() {
        let f = vec![("main.tex".to_string(), "aa".to_string()), ("images/h.png".to_string(), "bb".to_string())];
        let base = fingerprint(&f, "pdflatex", 2, MODE_RAW, "TeX 2026");
        assert_eq!(base, fingerprint(&[f[1].clone(), f[0].clone()], "pdflatex", 2, MODE_RAW, "TeX 2026"), "không phụ thuộc thứ tự");
        let mut g = f.clone();
        g[1].1 = "cc".into();
        for other in [
            fingerprint(&g, "pdflatex", 2, MODE_RAW, "TeX 2026"),
            fingerprint(&f, "xelatex", 2, MODE_RAW, "TeX 2026"),
            fingerprint(&f, "pdflatex", 1, MODE_RAW, "TeX 2026"),
            fingerprint(&f, "pdflatex", 2, "loigiai", "TeX 2026"),
            fingerprint(&f, "pdflatex", 2, MODE_RAW, "TeX 2027"),
            fingerprint(&f[..1], "pdflatex", 2, MODE_RAW, "TeX 2026"),
        ] {
            assert_ne!(base, other);
        }
    }

    fn tmp(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("hedu-ec-{tag}-{}", std::process::id()));
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
    fn dong_bo_chi_chep_tep_doi_va_xoa_tep_da_bi_xoa() {
        let d = tmp("sync");
        let (src, work, st) = (d.join("src"), d.join("work"), d.join("synced.json"));
        put(&src, "main.tex", b"A");
        put(&src, "chapters/c1.tex", b"B");
        put(&src, ".hedu/manifest.json", b"{}");
        let a = sync_workspace(&src, &work, &st).unwrap();
        assert_eq!(a.files.len(), 2, "không chép .hedu");
        assert!(!work.join(".hedu").exists());
        let t0 = fs::metadata(work.join("main.tex")).unwrap().modified().unwrap();
        std::thread::sleep(Duration::from_millis(30));
        put(&work, "main.aux", b"do TeX sinh ra");
        fs::write(src.join("chapters/c1.tex"), b"B2").unwrap();
        let b = sync_workspace(&src, &work, &st).unwrap();
        assert_eq!(fs::metadata(work.join("main.tex")).unwrap().modified().unwrap(), t0, "tệp không đổi thì không chép lại");
        assert_eq!(fs::read(work.join("chapters/c1.tex")).unwrap(), b"B2");
        assert!(work.join("main.aux").exists(), "không xoá tệp do TeX sinh ra");
        assert_ne!(a.files[0].1.clone() + &a.files[1].1, b.files[0].1.clone() + &b.files[1].1);
        fs::remove_file(src.join("chapters/c1.tex")).unwrap();
        sync_workspace(&src, &work, &st).unwrap();
        assert!(!work.join("chapters/c1.tex").exists(), "tệp đã xoá khỏi nguồn không được còn trong thư mục build");
        let _ = fs::remove_dir_all(&d);
    }

    #[cfg(windows)]
    #[test]
    fn dong_bo_khong_di_theo_junction_trong_du_an() {
        let d = tmp("sync-junc");
        let (src, work, st) = (d.join("src"), d.join("work"), d.join("synced.json"));
        put(&src, "main.tex", b"A");
        put(&d, "outside/bi-mat.tex", b"BI-MAT");
        let ok = Command::new("cmd").args(["/C", "mklink", "/J", &src.join("lk").to_string_lossy().replace('/', "\\"), &d.join("outside").to_string_lossy().replace('/', "\\")]).output().map(|o| o.status.success()).unwrap_or(false);
        assert!(ok, "phải tạo được junction để kiểm");
        let r = sync_workspace(&src, &work, &st).unwrap();
        assert_eq!(r.files.len(), 1);
        assert_eq!(r.blocked, vec!["lk".to_string()]);
        assert!(!work.join("lk").exists() && !work.join("lk/bi-mat.tex").exists());
        let _ = fs::remove_dir(src.join("lk"));
        let _ = fs::remove_dir_all(&d);
    }

    // ---- biên dịch thật qua "TeX giả" (tệp .bat) để kiểm thành công/thất bại/hết giờ/huỷ mà không cần TeX Live ----

    #[cfg(windows)]
    const FAKE_TEX: &str = "@echo off\r\nif \"%~1\"==\"--version\" (echo FakeTeX 1.0 & exit /b 0)\r\nif exist hang.flag ping -n 40 127.0.0.1 >nul\r\nif exist fail.flag (\r\n  echo ./%~6:3: Undefined control sequence.>hedu-out.log\r\n  echo l.3 \\foo>>hedu-out.log\r\n  echo PDF-HONG>hedu-out.pdf\r\n  exit /b 1\r\n)\r\nif exist fatal0.flag (\r\n  echo ! Emergency stop.>hedu-out.log\r\n  echo PDF-HONG>hedu-out.pdf\r\n  exit /b 0\r\n)\r\necho Output written on hedu-out.pdf (2 pages, 100 bytes).>hedu-out.log\r\ntype main.tex>hedu-out.pdf\r\nexit /b 0\r\n";

    #[cfg(windows)]
    struct Env {
        d: PathBuf,
        root: PathBuf,
        id: String,
        opts: CompileOpts,
    }

    #[cfg(windows)]
    fn env(tag: &str) -> Env {
        let d = tmp(tag);
        let root = d.join("root");
        let bin = d.join("bin");
        fs::create_dir_all(&bin).unwrap();
        fs::write(bin.join("pdflatex.bat"), FAKE_TEX).unwrap();
        put(&d, "src/main.tex", b"\\documentclass{article}\nBAN-1\n");
        let s = examlib::import(&root.join("exam-library"), &d.join("src"), "T", None).unwrap();
        let opts = CompileOpts { tex_bin: Some(bin.to_string_lossy().into_owned()), timeout_secs: Some(60), ..Default::default() };
        Env { d, root, id: s.id, opts }
    }
    #[cfg(windows)]
    fn proj(e: &Env) -> PathBuf {
        e.root.join("exam-library/projects").join(&e.id)
    }

    #[cfg(windows)]
    #[test]
    fn bien_dich_thanh_cong_xuat_ban_roi_dung_bo_dem() {
        let e = env("ok");
        let a = compile(&e.root, &e.id, &e.opts, &None).unwrap();
        assert_eq!((a.status.as_str(), a.published, a.cached, a.pages, a.mode.as_str()), ("ok", true, false, Some(2), MODE_RAW), "{a:?}");
        let g = a.last_good.clone().unwrap();
        let first = fs::read(&g.pdf_path).unwrap();
        assert!(String::from_utf8_lossy(&first).contains("BAN-1"));
        assert!(a.tex_version.contains("FakeTeX"));
        let b = compile(&e.root, &e.id, &e.opts, &None).unwrap();
        assert!(b.cached && !b.published && b.status == "ok", "không đổi gì thì dùng bộ đệm");
        let c = compile(&e.root, &e.id, &CompileOpts { force: Some(true), ..e.opts.clone() }, &None).unwrap();
        assert!(!c.cached && c.published);
        // đổi MỘT tệp phụ (không phải main.tex) cũng phải làm mất bộ đệm
        put(&proj(&e), "images/h.png", b"PNG");
        let d2 = compile(&e.root, &e.id, &e.opts, &None).unwrap();
        assert!(!d2.cached && d2.status == "ok");
        let _ = fs::remove_dir_all(&e.d);
    }

    #[cfg(windows)]
    #[test]
    fn loi_bien_dich_giu_pdf_tot_va_bao_pdf_khong_hop_le() {
        let e = env("fail");
        let good = compile(&e.root, &e.id, &e.opts, &None).unwrap();
        let good_pdf = fs::read(&good.last_good.as_ref().unwrap().pdf_path).unwrap();
        put(&proj(&e), "fail.flag", b"1");
        let f = compile(&e.root, &e.id, &e.opts, &None).unwrap();
        assert_eq!(f.status, "failed");
        assert!(f.invalid_pdf && !f.published && f.kept_previous, "{f:?}");
        assert_eq!((f.diagnostics[0].file.as_deref(), f.diagnostics[0].line, f.diagnostics[0].in_project), (Some("main.tex"), Some(3), true));
        assert!(f.message.contains("KHÔNG hợp lệ") && f.message.contains("giữ"));
        assert_eq!(fs::read(&f.last_good.as_ref().unwrap().pdf_path).unwrap(), good_pdf, "PDF tốt cũ không bị đổi");
        // TeX thoát mã 0 và có PDF nhưng log có lỗi nghiêm trọng ⇒ vẫn là lỗi
        fs::remove_file(proj(&e).join("fail.flag")).unwrap();
        put(&proj(&e), "fatal0.flag", b"1");
        let z = compile(&e.root, &e.id, &e.opts, &None).unwrap();
        assert!(z.status == "failed" && z.invalid_pdf && !z.published, "{z:?}");
        assert_eq!(fs::read(&z.last_good.as_ref().unwrap().pdf_path).unwrap(), good_pdf);
        // chưa từng có bản tốt: không bịa ra
        let e2 = env("fail2");
        put(&proj(&e2), "fail.flag", b"1");
        let f2 = compile(&e2.root, &e2.id, &e2.opts, &None).unwrap();
        assert!(f2.status == "failed" && !f2.kept_previous && f2.last_good.is_none());
        let _ = fs::remove_dir_all(&e.d);
        let _ = fs::remove_dir_all(&e2.d);
    }

    #[cfg(windows)]
    #[test]
    fn het_gio_va_huy_dung_tien_trinh_va_giu_pdf_tot() {
        let e = env("hang");
        compile(&e.root, &e.id, &e.opts, &None).unwrap();
        put(&proj(&e), "hang.flag", b"1");
        let t = Instant::now();
        let r = compile(&e.root, &e.id, &CompileOpts { timeout_secs: Some(3), ..e.opts.clone() }, &None).unwrap();
        assert_eq!(r.status, "timeout", "{r:?}");
        assert!(t.elapsed() < Duration::from_secs(25) && r.kept_previous && !r.published && r.tree_guard);
        // huỷ từ luồng khác
        let (root, id, opts) = (e.root.clone(), e.id.clone(), e.opts.clone());
        let h = std::thread::spawn(move || compile(&root, &id, &opts, &None).unwrap());
        for _ in 0..100 {
            if cancel(&e.id) {
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        let c = h.join().unwrap();
        assert_eq!(c.status, "cancelled", "{c:?}");
        assert!(c.kept_previous && !c.published);
        assert!(!cancel(&e.id), "xong rồi thì không còn gì để huỷ");
        let _ = fs::remove_dir_all(&e.d);
    }

    #[cfg(windows)]
    #[test]
    fn khong_chay_song_song_cung_du_an_va_tep_chinh_trong_thu_muc_con() {
        let e = env("sub");
        let (_g, _f) = register(&e.id).unwrap();
        assert!(compile(&e.root, &e.id, &e.opts, &None).is_err(), "đang chạy thì từ chối lần thứ hai");
        drop(_g);
        // tệp chính nằm trong thư mục con: TeX chạy trong thư mục đó, lỗi được quy về đường dẫn của dự án
        let e2 = env("sub2");
        let p = proj(&e2);
        fs::remove_file(p.join("main.tex")).unwrap();
        put(&p, "de/main.tex", b"\\documentclass{article}\n");
        let mut m = examlib::read_manifest(&e2.root.join("exam-library"), &e2.id).unwrap();
        m.main_file = Some("de/main.tex".into());
        m.files.retain(|f| f.rel != "main.tex");
        fs::write(p.join(".hedu/manifest.json"), serde_json::to_vec(&m).unwrap()).unwrap();
        put(&p, "de/fail.flag", b"1");
        let r = compile(&e2.root, &e2.id, &e2.opts, &None).unwrap();
        assert_eq!((r.status.as_str(), r.diagnostics[0].file.as_deref()), ("failed", Some("de/main.tex")), "{r:?}");
        let _ = fs::remove_dir_all(&e.d);
        let _ = fs::remove_dir_all(&e2.d);
    }

    #[cfg(windows)]
    #[test]
    fn tep_trung_ten_goi_di_kem_duoc_bao_va_tu_choi_tham_so_nguy_hiem() {
        let e = env("conflict");
        put(&proj(&e), "ex_test.sty", b"% ban rieng cua du an");
        let r = compile(&e.root, &e.id, &e.opts, &None).unwrap();
        assert!(r.warnings.iter().any(|w| w.contains("ex_test.sty") && w.contains("CỦA DỰ ÁN")), "{:?}", r.warnings);
        assert!(compile(&e.root, &e.id, &CompileOpts { engine: Some("cmd.exe".into()), ..e.opts.clone() }, &None).is_err());
        assert!(compile(&e.root, "../..", &e.opts, &None).is_err());
        let _ = fs::remove_dir_all(&e.d);
    }

    #[test]
    fn doc_xuat_pdf_tot_va_tu_choi_dau_vao_xau() {
        let d = tmp("pdfio");
        let root = d.join("root");
        let id = "11111111-2222-4333-a444-555555555555";
        assert!(read_good(&root, id).is_err(), "chưa có PDF");
        assert!(read_good(&root, "../..").is_err());
        let pdf = b"%PDF-1.5
noi dung
%%EOF
";
        let info = GoodInfo { fingerprint: "f".into(), engine: "pdflatex".into(), mode: MODE_RAW.into(), tex_version: "t".into(), pages: Some(1), bytes: 0, at: "x".into(), pdf_path: String::new(), files_hash: String::new(), main: String::new() };
        let src = d.join("tam.pdf");
        fs::write(&src, pdf).unwrap();
        publish(&root, id, &src, &info).unwrap();
        assert_eq!(read_good(&root, id).unwrap(), pdf);
        // xuất bản sao
        let out = d.join("ra").join("de.pdf");
        fs::create_dir_all(out.parent().unwrap()).unwrap();
        export_good(&root, id, &out).unwrap();
        assert_eq!(fs::read(&out).unwrap(), pdf);
        assert!(export_good(&root, id, &d.join("de.txt")).is_err(), "đuôi phải là .pdf");
        assert!(export_good(&root, id, &d.join("ra")).is_err(), "không ghi đè thư mục");
        let inside = build_dir(&root, id).join("out").join("x.pdf");
        assert!(export_good(&root, id, &inside).is_err(), "không lưu vào thư mục build");
        // tệp bị hỏng/đổi ngoài HEdu thì không đưa cho giao diện
        let good = build_dir(&root, id).join("out").join("last-good.pdf");
        fs::write(&good, b"khong phai pdf!!!!!!!!!!!!!").unwrap();
        assert!(read_good(&root, id).is_err());
        let _ = fs::remove_dir_all(&d);
    }

    #[cfg(windows)]
    #[test]
    fn khong_doc_pdf_qua_junction() {
        let d = tmp("pdfjunc");
        let root = d.join("root");
        let id = "11111111-2222-4333-a444-555555555555";
        let pdf = b"%PDF-1.5
A
%%EOF
";
        let src = d.join("tam.pdf");
        fs::write(&src, pdf).unwrap();
        let info = GoodInfo { fingerprint: "f".into(), engine: "e".into(), mode: MODE_RAW.into(), tex_version: "t".into(), pages: None, bytes: 0, at: "x".into(), pdf_path: String::new(), files_hash: String::new(), main: String::new() };
        publish(&root, id, &src, &info).unwrap();
        // thư mục out bị thay bằng junction sang nơi khác chứa PDF "bí mật" cùng kích thước
        let out = build_dir(&root, id).join("out");
        let other = d.join("khac");
        fs::create_dir_all(&other).unwrap();
        fs::write(other.join("last-good.pdf"), b"%PDF-1.5
B
%%EOF
").unwrap();
        fs::copy(out.join("last-good.json"), other.join("last-good.json")).unwrap();
        fs::remove_dir_all(&out).unwrap();
        let ok = Command::new("cmd").args(["/C", "mklink", "/J", &out.to_string_lossy().replace('/', "\\"), &other.to_string_lossy().replace('/', "\\")]).output().map(|o| o.status.success()).unwrap_or(false);
        assert!(ok, "phải tạo được junction để kiểm");
        assert!(read_good(&root, id).is_err(), "không được đọc qua junction");
        let _ = fs::remove_dir(&out);
        let _ = fs::remove_dir_all(&d);
    }

    #[cfg(windows)]
    fn env_main(tag: &str, main: &str) -> Env {
        let e = env(tag);
        let p = proj(&e);
        fs::write(p.join("main.tex"), main).unwrap();
        // sổ phải khớp tệp vừa đổi (thư viện coi đây là trạng thái đã biết)
        let lib = e.root.join("exam-library");
        let mut m = examlib::read_manifest(&lib, &e.id).unwrap();
        m.files[0].sha256 = examlib::sha256_file(&p.join("main.tex")).unwrap();
        m.files[0].bytes = main.len() as u64;
        fs::write(p.join(".hedu/manifest.json"), serde_json::to_vec(&m).unwrap()).unwrap();
        e
    }

    #[cfg(windows)]
    #[test]
    fn che_do_de_va_loi_giai_bien_dich_rieng_tu_cung_mot_nguon_khong_sua_nguon() {
        let src = "\\documentclass{article}\n\\usepackage[loigiai]{ex_test}\nNOI-DUNG\n";
        let e = env_main("modes", src);
        let de = compile(&e.root, &e.id, &CompileOpts { mode: Some("de".into()), ..e.opts.clone() }, &None).unwrap();
        assert_eq!((de.status.as_str(), de.mode.as_str(), de.published), ("ok", "de", true), "{de:?}");
        assert_eq!(de.profile_changes.len(), 1);
        let de_pdf = String::from_utf8_lossy(&fs::read(&de.last_good.as_ref().unwrap().pdf_path).unwrap()).into_owned();
        assert!(de_pdf.contains("[dethi]{ex_test}") && !de_pdf.contains("loigiai"), "bản Đề phải là bản dẫn xuất: {de_pdf}");
        // chưa có bản lời giải/nguyên văn: các chế độ không lẫn vào nhau
        assert!(last_good_mode(&e.root, &e.id, "loigiai").is_none() && last_good(&e.root, &e.id).is_none());
        let lg = compile(&e.root, &e.id, &CompileOpts { mode: Some("loigiai".into()), ..e.opts.clone() }, &None).unwrap();
        assert_eq!((lg.status.as_str(), lg.mode.as_str()), ("ok", "loigiai"));
        let lg_pdf = String::from_utf8_lossy(&fs::read(&lg.last_good.as_ref().unwrap().pdf_path).unwrap()).into_owned();
        assert!(lg_pdf.contains("[loigiai]{ex_test}") && !lg_pdf.contains("dethi"));
        let raw = compile(&e.root, &e.id, &e.opts, &None).unwrap();
        assert_eq!((raw.status.as_str(), raw.mode.as_str()), ("ok", MODE_RAW));
        assert_eq!(fs::read_to_string(proj(&e).join("main.tex")).unwrap(), src, "tệp nguồn không bao giờ bị sửa");
        assert_eq!(all_good(&e.root, &e.id).len(), 3);
        // mỗi chế độ có bộ đệm riêng; sau chế độ khác vẫn dùng lại đúng
        let again = compile(&e.root, &e.id, &CompileOpts { mode: Some("de".into()), ..e.opts.clone() }, &None).unwrap();
        assert!(again.cached, "{again:?}");
        assert!(String::from_utf8_lossy(&fs::read(&again.last_good.unwrap().pdf_path).unwrap()).contains("[dethi]"));
        let _ = fs::remove_dir_all(&e.d);
    }

    #[cfg(windows)]
    #[test]
    fn khong_nhan_dien_chac_thi_khong_xuat_pdf_de_nhung_van_co_nguyen_van() {
        let e = env_main("noprof", "\\documentclass{article}\nKHONG CO ex_test\n");
        for m in ["de", "loigiai"] {
            let r = compile(&e.root, &e.id, &CompileOpts { mode: Some(m.into()), ..e.opts.clone() }, &None).unwrap();
            assert_eq!(r.status, "no-profile", "{m}: {r:?}");
            assert!(!r.published && r.last_good.is_none() && r.message.contains("nguyên văn"));
            assert!(last_good_mode(&e.root, &e.id, m).is_none(), "không có PDF mang nhãn {m}");
        }
        let raw = compile(&e.root, &e.id, &e.opts, &None).unwrap();
        assert_eq!(raw.status, "ok");
        assert!(compile(&e.root, &e.id, &CompileOpts { mode: Some("xyz".into()), ..e.opts.clone() }, &None).is_err());
        let _ = fs::remove_dir_all(&e.d);
    }

    #[cfg(windows)]
    #[test]
    fn che_do_loi_giai_tat_anloigiai_trong_ban_dan_xuat() {
        let e = env_main("modes2", "\\usepackage[loigiai]{ex_test}\n\\anloigiai\nA\n");
        let lg = compile(&e.root, &e.id, &CompileOpts { mode: Some("loigiai".into()), ..e.opts.clone() }, &None).unwrap();
        let pdf = String::from_utf8_lossy(&fs::read(&lg.last_good.as_ref().unwrap().pdf_path).unwrap()).into_owned();
        assert!(pdf.contains("%\\anloigiai"), "bản Lời giải phải tắt anloigiai trong bản dẫn xuất: {pdf}");
        assert!(lg.profile_changes.iter().any(|c| c.after.starts_with("%\\anloigiai")));
        assert_eq!(fs::read_to_string(proj(&e).join("main.tex")).unwrap(), "\\usepackage[loigiai]{ex_test}\n\\anloigiai\nA\n");
        let _ = fs::remove_dir_all(&e.d);
    }

    #[test]
    fn texinputs_uu_tien_du_an_roi_goi_di_kem() {
        let t = texinputs_for_project(&Some(PathBuf::from("C:\\a\\b"))).unwrap();
        assert!(t.starts_with('.') && t.contains("C:/a/b") && (t.ends_with(';') || t.ends_with(':')), "{t}");
        assert!(texinputs_for_project(&None).is_none());
    }

    /// Thử với TeX Live THẬT (không chạy trong CI). Chạy: HEDU_TEX_BIN=<thư mục bin> cargo test --lib --locked tex_live_that -- --ignored --nocapture
    #[test]
    #[ignore]
    fn tex_live_that_bien_dich_da_tep_ba_bo_dich_va_loi() {
        let Ok(bin) = std::env::var("HEDU_TEX_BIN") else { return };
        let d = tmp("real");
        let root = d.join("root");
        let main = "\\documentclass[12pt,a4paper]{article}\n\\usepackage{amsmath,tikz}\n\\usepackage{ex_test}\n\\begin{document}\n\\input{chapters/c1}\n\\begin{tikzpicture}\\draw (0,0) circle (1);\\end{tikzpicture}\n\\end{document}\n";
        put(&d, "src/main.tex", main.as_bytes());
        put(&d, "src/chapters/c1.tex", "Xin chào $x^2+1$.\n".as_bytes());
        let s = examlib::import(&root.join("exam-library"), &d.join("src"), "Thật", None).unwrap();
        let sup = support::prepare(&root);
        assert!(sup.is_some());
        for eng in ["pdflatex", "xelatex", "lualatex"] {
            let o = CompileOpts { engine: Some(eng.into()), tex_bin: Some(bin.clone()), timeout_secs: Some(180), runs: Some(2), force: Some(true), mode: None, main: None , wrap: None, wrap_modes: None, lane: None };
            let r = compile(&root, &s.id, &o, &sup).unwrap();
            eprintln!("{eng}: {} · {} · {:?} trang · {} ms · {}", r.status, r.message, r.pages, r.ms, r.tex_version);
            assert_eq!(r.status, "ok", "{eng}: {:?} {}", r.diagnostics, r.raw_log);
            assert!(fs::read(&r.last_good.as_ref().unwrap().pdf_path).unwrap().starts_with(b"%PDF"));
        }
        // lỗi ở tệp con: báo đúng tệp/dòng và giữ PDF tốt
        let good = last_good(&root, &s.id).unwrap();
        let p = root.join("exam-library/projects").join(&s.id).join("chapters/c1.tex");
        fs::write(&p, "Dòng 1.\nDòng 2 \\lenhkhongco.\n").unwrap();
        let o = CompileOpts { tex_bin: Some(bin.clone()), timeout_secs: Some(180), ..Default::default() };
        let r = compile(&root, &s.id, &o, &sup).unwrap();
        eprintln!("loi: {} · {:?}", r.message, r.diagnostics.iter().find(|x| x.severity == "error"));
        assert_eq!(r.status, "failed");
        let e = r.diagnostics.iter().find(|x| x.severity == "error").unwrap();
        assert_eq!((e.file.as_deref(), e.line, e.in_project), (Some("chapters/c1.tex"), Some(2), true));
        assert!(r.kept_previous && !r.published);
        assert_eq!(fs::read(&r.last_good.unwrap().pdf_path).unwrap(), fs::read(&good.pdf_path).unwrap());
        let _ = fs::remove_dir_all(&d);
    }

    /// Định dạng dựng sẵn với TeX Live THẬT: lần đầu dịch thường + dựng nền; lần sau dùng định dạng (cùng số trang);
    /// lỗi trong thân đề vẫn báo đúng tệp/dòng và KHÔNG bỏ định dạng; sửa phần đầu ⇒ không dùng định dạng cũ.
    #[test]
    #[ignore]
    fn tex_live_that_dinh_dang_dung_san() {
        let Ok(bin) = std::env::var("HEDU_TEX_BIN") else { return };
        let d = tmp("real-fmt");
        let root = d.join("root");
        put(&d, "src/main.tex", b"\\documentclass[12pt]{article}\n\\input{khaibao}\n\\begin{document}\n\\input{than}\n\\end{document}\n");
        put(&d, "src/khaibao.tex", b"\\usepackage{amsmath,tikz}\n\\usepackage{ex_test}\n");
        put(&d, "src/than.tex", "Xin chào $x^2+1$.\n\\begin{tikzpicture}\\draw (0,0) circle (1);\\end{tikzpicture}\n".as_bytes());
        let s = examlib::import(&root.join("exam-library"), &d.join("src"), "Định dạng", None).unwrap();
        let sup = support::prepare(&root);
        let o = CompileOpts { tex_bin: Some(bin.clone()), timeout_secs: Some(180), force: Some(true), ..Default::default() };
        let fmts = || fs::read_dir(examfmt::cache_dir(&root)).map(|rd| rd.flatten().filter(|e| e.path().extension().map(|x| x == "fmt").unwrap_or(false)).count()).unwrap_or(0);
        let a = compile(&root, &s.id, &o, &sup).unwrap();
        assert_eq!(a.status, "ok", "{}", a.raw_log);
        for _ in 0..60 {
            if fmts() > 0 { break; }
            std::thread::sleep(Duration::from_millis(250));
        }
        assert_eq!(fmts(), 1, "dựng định dạng ở luồng nền");
        let b = compile(&root, &s.id, &o, &sup).unwrap();
        eprintln!("không định dạng {} ms, có định dạng {} ms", a.ms, b.ms);
        assert_eq!((b.status.as_str(), b.pages), ("ok", a.pages));
        // lỗi trong thân đề
        let proj = root.join("exam-library/projects").join(&s.id);
        fs::write(proj.join("than.tex"), "Dòng 1.\nDòng 2 \\lenhkhongco.\n").unwrap();
        let e = compile(&root, &s.id, &o, &sup).unwrap();
        assert_eq!(e.status, "failed");
        let x = e.diagnostics.iter().find(|x| x.severity == "error").unwrap();
        assert_eq!((x.file.as_deref(), x.line), (Some("than.tex"), Some(2)));
        assert_eq!(fmts(), 1, "lỗi của đề không làm bỏ định dạng");
        // sửa phần đầu ⇒ định dạng cũ không khớp, vẫn dịch đúng
        fs::write(proj.join("than.tex"), "Xin chào.\n").unwrap();
        fs::write(proj.join("khaibao.tex"), "\\usepackage{amsmath}\n\\usepackage{ex_test}\n\\newcommand{\\moi}{MỚI}\n").unwrap();
        fs::write(proj.join("than.tex"), "Xin chào \\moi.\n").unwrap();
        let f = compile(&root, &s.id, &o, &sup).unwrap();
        assert_eq!(f.status, "ok", "phần đầu đổi mà dùng định dạng cũ thì \\moi sẽ lỗi: {}", f.raw_log);
        let _ = fs::remove_dir_all(&d);
    }

    /// Hiệu năng với TikZ phức tạp (tikz-3dplot, hàng nghìn đoạn vẽ, bảng biến thiên tkz-tab) qua TeX Live THẬT; in thời gian, không có ngưỡng cứng ngoài giờ chót.
    #[test]
    #[ignore]
    fn tex_live_that_tikz_phuc_tap_trong_gioi_han_gio() {
        let Ok(bin) = std::env::var("HEDU_TEX_BIN") else { return };
        let d = tmp("real-tikz");
        let root = d.join("root");
        let main = "\\documentclass[12pt,a4paper]{article}\n\\usepackage{amsmath,amssymb,tikz,tikz-3dplot,tkz-tab}\n\\usetikzlibrary{calc}\n\\begin{document}\n\\tdplotsetmaincoords{70}{110}\n\\begin{tikzpicture}[tdplot_main_coords]\n\\foreach \\i in {0,...,1500}{\\draw[thin,gray] ({cos(\\i*0.9)*(1+\\i/1500)},{sin(\\i*0.9)*(1+\\i/1500)},{\\i/700}) -- ({cos(\\i*0.9+7)*2},{sin(\\i*0.9+7)*2},{\\i/900});}\n\\draw[->] (0,0,0) -- (3,0,0) node[right]{$x$};\n\\end{tikzpicture}\n\\begin{tikzpicture}\n\\tkzTabInit[lgt=2,espcl=2]{$x$/1,$f'(x)$/1,$f(x)$/2}{$-\\infty$,$0$,$+\\infty$}\n\\tkzTabLine{,+,z,-,}\n\\tkzTabVar{-/$-\\infty$,+/$1$,-/$-\\infty$}\n\\end{tikzpicture}\n\\end{document}\n";
        put(&d, "src/main.tex", main.as_bytes());
        let s = examlib::import(&root.join("exam-library"), &d.join("src"), "TikZ nặng", None).unwrap();
        let sup = support::prepare(&root);
        let o = CompileOpts { engine: Some("pdflatex".into()), tex_bin: Some(bin), timeout_secs: Some(180), runs: Some(2), force: Some(true), mode: None, main: None , wrap: None, wrap_modes: None, lane: None };
        let r = compile(&root, &s.id, &o, &sup).unwrap();
        eprintln!("TikZ nặng: {} · {:?} trang · {} ms · {} lượt", r.status, r.pages, r.ms, r.runs);
        assert_eq!(r.status, "ok", "{:?} {}", r.diagnostics, r.raw_log);
        let _ = fs::remove_dir_all(&d);
    }

    /// Bằng chứng với ex_test THẬT: chữ của lời giải KHÔNG có trong PDF bản Đề, có trong PDF bản Lời giải.
    /// Đo thẳng trên PDF (tắt nén để đọc được chữ): từ ex_test 3.3, bản Đề vẫn chạy thân `\loigiai` nhưng bỏ vào một hộp bị vứt,
    /// nên dấu `\typeout` không còn là bằng chứng; điều phải bảo đảm là lời giải không lọt vào trang in.
    #[test]
    #[ignore]
    fn tex_live_that_che_do_de_khong_lo_loi_giai() {
        let Ok(bin) = std::env::var("HEDU_TEX_BIN") else { return };
        let d = tmp("real-modes");
        let root = d.join("root");
        let main = "\\documentclass[12pt,a4paper]{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amsmath,amssymb}\n\\usepackage[loigiai]{ex_test}\n\\pdfcompresslevel=0\n\\pdfobjcompresslevel=0\n\\begin{document}\n\\begin{ex}\nCho $1+1=?$\n\\choice{$1$}{\\True $2$}{$3$}{$4$}\n\\loigiai{HEDUSOLMARK Vì $1+1=2$.}\n\\end{ex}\n\\end{document}\n";
        put(&d, "src/main.tex", main.as_bytes());
        let s = examlib::import(&root.join("exam-library"), &d.join("src"), "Thật", None).unwrap();
        let sup = support::prepare(&root);
        let o = |m: &str| CompileOpts { engine: Some("pdflatex".into()), tex_bin: Some(bin.clone()), timeout_secs: Some(180), runs: Some(2), force: Some(true), mode: Some(m.into()), main: None , wrap: None, wrap_modes: None, lane: None };
        let de = compile(&root, &s.id, &o("de"), &sup).unwrap();
        let lg = compile(&root, &s.id, &o("loigiai"), &sup).unwrap();
        eprintln!("de: {} {:?} | loigiai: {} {:?}", de.status, de.pages, lg.status, lg.pages);
        assert_eq!((de.status.as_str(), lg.status.as_str()), ("ok", "ok"), "{:?} {:?} {}", de.diagnostics, lg.diagnostics, de.raw_log);
        let text = |p: &std::path::Path| String::from_utf8_lossy(&fs::read(p).unwrap()).into_owned();
        let (de_pdf, lg_pdf) = (text(de.last_good.as_ref().unwrap().pdf_path.as_ref()), text(lg.last_good.as_ref().unwrap().pdf_path.as_ref()));
        assert!(lg_pdf.contains("HEDUSOLMARK"), "bản LỜI GIẢI phải in lời giải (đồng thời chứng minh cách đọc chữ trong PDF còn dùng được)");
        assert!(!de_pdf.contains("HEDUSOLMARK"), "bản ĐỀ không được in lời giải");
        assert_eq!(fs::read_to_string(root.join("exam-library/projects").join(&s.id).join("main.tex")).unwrap(), main, "nguồn không đổi");
        let a = fs::read(&de.last_good.unwrap().pdf_path).unwrap();
        let b = fs::read(&lg.last_good.unwrap().pdf_path).unwrap();
        assert!(a.starts_with(b"%PDF") && b.starts_with(b"%PDF") && a != b);
        let _ = fs::remove_dir_all(&d);
    }
}
