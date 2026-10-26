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

use crate::examlib::{self, bad_rel, is_link, open_inside, projects_dir, read_manifest, sha256_file, sha256_reader, valid_id, MAX_DEPTH, MAX_FILES, MAX_TOTAL_BYTES};
use crate::proc::run_job;
use crate::support;
use crate::tikz;

pub const JOBNAME: &str = "hedu-out";
/// Chế độ E2a: biên dịch nguyên văn, CHƯA xác định đề hay lời giải (E5 mới có hai chế độ).
pub const MODE_RAW: &str = "nguyen-van";
const MAX_LOG: usize = 2 * 1024 * 1024;
const RAW_LOG_KEEP: usize = 64 * 1024;
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

fn engine_command(tex_bin: &Option<String>, engine: &str, support_dir: &Option<PathBuf>, cwd: &Path) -> Command {
    let mut c = Command::new(tikz::prog(tex_bin, engine));
    c.current_dir(cwd);
    if let Some(t) = texinputs_for_project(support_dir) {
        c.env("TEXINPUTS", t);
    }
    tikz::hide_console(&mut c);
    c
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
    log.contains("Rerun to get") || log.contains("Label(s) may have changed")
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

fn build_dir(root: &Path, id: &str) -> PathBuf {
    root.join("cache").join("exam-build").join(id)
}

fn out_rel(id: &str, name: &str) -> String {
    format!("cache/exam-build/{id}/out/{name}")
}

/// Bản tốt gần nhất. Mọi tệp đọc qua `open_inside` từ thư mục dữ liệu: không đi theo liên kết/junction ở bất kỳ cấp nào.
pub fn last_good(root: &Path, id: &str) -> Option<GoodInfo> {
    if !valid_id(id) {
        return None;
    }
    let mut b = Vec::new();
    open_inside(root, &out_rel(id, "last-good.json")).ok()?.take(1024 * 1024).read_to_end(&mut b).ok()?;
    let info: GoodInfo = serde_json::from_slice(&b).ok()?;
    let pdf = open_inside(root, &out_rel(id, "last-good.pdf")).ok()?;
    (pdf.metadata().map(|m| m.len() == info.bytes).unwrap_or(false)).then_some(GoodInfo { pdf_path: build_dir(root, id).join("out").join("last-good.pdf").to_string_lossy().into_owned(), ..info })
}

fn publish(root: &Path, id: &str, pdf: &Path, info: &GoodInfo) -> Result<GoodInfo, String> {
    let out = build_dir(root, id).join("out");
    fs::create_dir_all(&out).map_err(|e| format!("Không tạo được thư mục PDF: {e}"))?;
    for d in [build_dir(root, id), out.clone()] {
        if fs::symlink_metadata(&d).map(|m| is_link(&m)).unwrap_or(true) {
            return Err("Thư mục PDF là liên kết/junction nên không xuất bản (an toàn).".into());
        }
    }
    let dest = out.join("last-good.pdf");
    let mut src = fs::File::open(pdf).map_err(|e| format!("Không mở được PDF vừa dịch: {e}"))?;
    copy_atomic(&mut src, &dest).map_err(|e| format!("Không xuất bản được PDF: {e}"))?;
    let bytes = fs::metadata(&dest).map(|m| m.len()).map_err(|e| e.to_string())?;
    let rec = GoodInfo { bytes, pdf_path: dest.to_string_lossy().into_owned(), ..info.clone() };
    let part = out.join("last-good.json.part");
    fs::write(&part, serde_json::to_vec(&rec).map_err(|e| e.to_string())?).map_err(|e| format!("Không ghi được thông tin PDF: {e}"))?;
    let j = out.join("last-good.json");
    if fs::rename(&part, &j).is_err() {
        let _ = fs::remove_file(&j);
        fs::rename(&part, &j).map_err(|e| format!("Không ghi được thông tin PDF: {e}"))?;
    }
    Ok(rec)
}

// ---------- chạy, đăng ký huỷ ----------

static RUNNING: Mutex<Option<HashMap<String, Arc<AtomicBool>>>> = Mutex::new(None);

struct RunGuard(String);
impl Drop for RunGuard {
    fn drop(&mut self) {
        if let Some(m) = RUNNING.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
            m.remove(&self.0);
        }
    }
}

/// Đăng ký một lần biên dịch cho dự án; đang chạy rồi thì từ chối (không chạy song song trên cùng thư mục build).
fn register(id: &str) -> Result<(RunGuard, Arc<AtomicBool>), String> {
    let mut g = RUNNING.lock().unwrap_or_else(|e| e.into_inner());
    let m = g.get_or_insert_with(HashMap::new);
    if m.contains_key(id) {
        return Err("Dự án này đang được biên dịch. Hãy chờ hoặc bấm Dừng.".into());
    }
    let flag = Arc::new(AtomicBool::new(false));
    m.insert(id.to_string(), flag.clone());
    Ok((RunGuard(id.to_string()), flag))
}

/// Yêu cầu dừng lần biên dịch đang chạy của dự án. true nếu có lần đang chạy.
pub fn cancel(id: &str) -> bool {
    match RUNNING.lock().unwrap_or_else(|e| e.into_inner()).as_ref().and_then(|m| m.get(id)) {
        Some(f) => {
            f.store(true, Ordering::SeqCst);
            true
        }
        None => false,
    }
}

fn read_capped(p: &Path) -> String {
    let mut b = Vec::new();
    let _ = fs::File::open(p).and_then(|f| f.take(MAX_LOG as u64).read_to_end(&mut b));
    String::from_utf8_lossy(&b).into_owned()
}

fn tail(s: &str, keep: usize) -> String {
    if s.len() <= keep {
        return s.to_string();
    }
    let mut i = s.len() - keep;
    while !s.is_char_boundary(i) {
        i += 1;
    }
    s[i..].to_string()
}

fn first_line(s: &str) -> String {
    s.lines().next().unwrap_or("").trim().chars().take(160).collect()
}

/// Biên dịch dự án `id`. Lỗi biên dịch KHÔNG phải `Err`: trả `Ok` với `status` tương ứng. `Err` chỉ cho lỗi dùng sai/hạ tầng.
pub fn compile(root: &Path, id: &str, opts: &CompileOpts, support_dir: &Option<PathBuf>) -> Result<CompileOut, String> {
    let lib = root.join("exam-library");
    let m = read_manifest(&lib, id)?;
    let main = m.main_file.clone().ok_or("Dự án chưa chọn tệp chính. Hãy chọn tệp chính trước khi biên dịch.")?;
    if bad_rel(&main).is_some() || main.starts_with('-') || !main.to_lowercase().ends_with(".tex") {
        return Err("Tệp chính không hợp lệ.".into());
    }
    let engine = engine_of(&opts.engine.clone().or_else(|| Some(m.compile.engine.clone())))?;
    let limit = Duration::from_secs(opts.timeout_secs.unwrap_or(m.compile.timeout_secs as u64).clamp(1, 900));
    let runs = opts.runs.unwrap_or(m.compile.runs).clamp(1, 3);
    let (_guard, cancel_flag) = register(id)?;
    let started = Instant::now();

    let build = build_dir(root, id);
    let work = build.join("work");
    let sync = sync_workspace(&projects_dir(&lib).join(id), &work, &build.join("synced.json"))?;
    if !sync.files.iter().any(|(r, _)| *r == main) {
        return Err(format!("Tệp chính '{main}' không còn trong dự án."));
    }
    let mut out = CompileOut { engine: engine.to_string(), mode: MODE_RAW.to_string(), ..Default::default() };
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
    let work_fwd = work.to_string_lossy().replace('\\', "/");
    let work_fwd = work_fwd.trim_start_matches("//?/").to_string();

    // phiên bản TeX (vào dấu vân bộ đệm; cũng là phép thử có TeX Live hay chưa)
    let tex_bin = opts.tex_bin.clone();
    let mut vc = engine_command(&tex_bin, engine, support_dir, &work);
    vc.arg("--version");
    let ver = match run_job(&mut vc, Duration::from_secs(20), &cancel_flag) {
        Ok(v) => first_line(&v.stdout),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let t = tikz::missing_tool(engine);
            out.status = "no-tex".into();
            out.message = t.message;
            out.last_good = last_good(root, id);
            return Ok(out);
        }
        Err(e) => return Err(format!("Không chạy được {engine}: {e}")),
    };
    out.tex_version = ver.clone();
    out.fingerprint = fingerprint(&sync.files, engine, runs, MODE_RAW, &ver);

    if !opts.force.unwrap_or(false) {
        if let Some(g) = last_good(root, id) {
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
        c.args(["-interaction=nonstopmode", "-file-line-error", "-no-shell-escape"]).arg(format!("-jobname={JOBNAME}")).arg(&main_name);
        let r = match run_job(&mut c, left, &cancel_flag) {
            Ok(r) => r,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                out.status = "no-tex".into();
                out.message = tikz::missing_tool(engine).message;
                out.last_good = last_good(root, id);
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
    out.ms = started.elapsed().as_millis() as u64;
    out.pages = parse_pages(&last_log);
    let work_dir_fwd = work_fwd;
    let diags = parse_log(&last_log, &main_dir, &work_dir_fwd);
    out.error_count = diags.iter().filter(|d| d.severity == "error").count() as u32;
    out.warning_count = diags.iter().filter(|d| d.severity == "warning").count() as u32;
    out.diagnostics = diags;
    out.raw_log = tail(&last_log, RAW_LOG_KEEP);

    if out.status == "ok" {
        let info = GoodInfo { fingerprint: out.fingerprint.clone(), engine: engine.to_string(), mode: MODE_RAW.to_string(), tex_version: ver, pages: out.pages, bytes: 0, at: examlib::iso_now(), pdf_path: String::new() };
        let rec = publish(root, id, &pdf, &info)?;
        out.published = true;
        out.last_good = Some(rec);
        out.message = format!("Biên dịch thành công{}.", out.pages.map(|p| format!(" ({p} trang)")).unwrap_or_default());
    } else {
        out.last_good = last_good(root, id);
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

fn good_pdf_handle(root: &Path, id: &str) -> Result<(fs::File, GoodInfo), String> {
    let g = last_good(root, id).ok_or("Chưa có PDF biên dịch thành công cho dự án này.")?;
    let h = open_inside(root, &out_rel(id, "last-good.pdf"))?;
    Ok((h, g))
}

/// Nội dung PDF tốt gần nhất (chỉ đúng tệp `last-good.pdf` của dự án, qua `open_inside`).
pub fn read_good(root: &Path, id: &str) -> Result<Vec<u8>, String> {
    let (h, g) = good_pdf_handle(root, id)?;
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

/// Lưu một BẢN SAO PDF tốt gần nhất ra nơi người dùng chọn (đuôi .pdf; ghi tạm rồi đổi tên; không đụng bản trong thư viện).
pub fn export_good(root: &Path, id: &str, dest: &Path) -> Result<(), String> {
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
    let (mut h, _) = good_pdf_handle(root, id)?;
    copy_atomic(&mut h, dest).map_err(|e| format!("Không lưu được PDF: {e}"))
}

/// Mở PDF bằng ứng dụng mặc định của Windows (explorer.exe + đường dẫn; không qua shell).
pub fn open_external(root: &Path, id: &str) -> Result<(), String> {
    let (_h, g) = good_pdf_handle(root, id)?;
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
pub fn exam_compile_last(app: AppHandle, id: String) -> Result<Option<GoodInfo>, String> {
    Ok(last_good(&root_of(&app)?, &id))
}

#[tauri::command]
pub fn exam_pdf_read(app: AppHandle, id: String) -> Result<tauri::ipc::Response, String> {
    read_good(&root_of(&app)?, &id).map(tauri::ipc::Response::new)
}

#[tauri::command]
pub async fn exam_pdf_export(app: AppHandle, id: String, dest: String) -> Result<(), String> {
    let root = root_of(&app)?;
    tauri::async_runtime::spawn_blocking(move || export_good(&root, &id, Path::new(&dest))).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn exam_pdf_open_external(app: AppHandle, id: String) -> Result<(), String> {
    open_external(&root_of(&app)?, &id)
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn nhan_dien_loi_nghiem_trong_va_chay_lai() {
        assert!(has_severe(SAMPLE));
        assert!(has_severe("! Emergency stop."));
        assert!(has_severe("Fatal error occurred, no output PDF file produced!"));
        assert!(has_severe("./a.tex:3: Undefined control sequence."));
        assert!(!has_severe("LaTeX Warning: Label(s) may have changed. Rerun\nOverfull \\hbox\nOutput written on x.pdf (1 page, 1 bytes)."));
        assert!(needs_rerun("LaTeX Warning: Label(s) may have changed. Rerun to get cross-references right."));
        assert!(!needs_rerun("all good"));
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
    const FAKE_TEX: &str = "@echo off\r\nif \"%~1\"==\"--version\" (echo FakeTeX 1.0 & exit /b 0)\r\nif exist hang.flag ping -n 40 127.0.0.1 >nul\r\nif exist fail.flag (\r\n  echo ./%~5:3: Undefined control sequence.>hedu-out.log\r\n  echo l.3 \\foo>>hedu-out.log\r\n  echo PDF-HONG>hedu-out.pdf\r\n  exit /b 1\r\n)\r\nif exist fatal0.flag (\r\n  echo ! Emergency stop.>hedu-out.log\r\n  echo PDF-HONG>hedu-out.pdf\r\n  exit /b 0\r\n)\r\necho Output written on hedu-out.pdf (2 pages, 100 bytes).>hedu-out.log\r\ntype main.tex>hedu-out.pdf\r\nexit /b 0\r\n";

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
        let info = GoodInfo { fingerprint: "f".into(), engine: "pdflatex".into(), mode: MODE_RAW.into(), tex_version: "t".into(), pages: Some(1), bytes: 0, at: "x".into(), pdf_path: String::new() };
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
        let info = GoodInfo { fingerprint: "f".into(), engine: "e".into(), mode: MODE_RAW.into(), tex_version: "t".into(), pages: None, bytes: 0, at: "x".into(), pdf_path: String::new() };
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
            let o = CompileOpts { engine: Some(eng.into()), tex_bin: Some(bin.clone()), timeout_secs: Some(180), runs: Some(2), force: Some(true) };
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
}
