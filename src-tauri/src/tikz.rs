// Biên dịch hình TikZ thành SVG bằng TeX Live có sẵn trên máy.
//
// Quy trình:  mã TikZ  →  file .tex (lớp standalone)  →  pdflatex  →  dvisvgm --pdf  →  .svg
// Kết quả được nhớ theo mã băm của (đầu file + khai báo + mã hình), nên hình đã dịch
// một lần thì lần sau hiện ngay.
//
// Mọi lỗi đều trả về kèm phần cuối của file .log để người dùng biết sai ở đâu.
use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::proc::{run_capture, run_job_fn, Captured};
use crate::support;

/// Số thứ tự để mỗi lần dịch có thư mục tạm riêng (hai hình giống nhau dịch cùng lúc không giẫm chân nhau).
static JOB: AtomicU64 = AtomicU64::new(0);

/// Đầu file mặc định. Người dùng đổi được trong mục Hệ thống nếu TeX Live của họ
/// thiếu gói nào đó, hoặc cần thêm gói riêng.
pub const DEFAULT_PREAMBLE: &str = r"\documentclass[border=3pt,varwidth=16cm]{standalone}
\usepackage{amsmath,amssymb,mathrsfs,enumerate,etoolbox,xparse,venndiagram,pgf-pie}
\input{shared-content}
\usepackage{ex_test}";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TikzOut {
    pub svg: String,
    /// true nếu lấy lại từ bộ nhớ đệm, không phải vừa dịch
    pub cached: bool,
    pub ms: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TikzErr {
    /// câu tóm tắt dễ hiểu
    pub message: String,
    /// vài dòng quanh chỗ lỗi trong file .log
    pub log: String,
    /// bước nào hỏng: 'latex' | 'svg' | 'thieu-texlive' | 'qua-lau'
    pub stage: String,
}

#[derive(Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct TikzOpts {
    #[serde(default)]
    pub preamble: Option<String>,
    #[serde(default)]
    pub engine: Option<String>,
    #[serde(default)]
    pub timeout_secs: Option<u64>,
    /// Thư mục bin của TeX Live, dùng khi PATH không có (vd. D:\\texlive\\2025\\bin\\windows)
    #[serde(default)]
    pub tex_bin: Option<String>,
}

/// Đường dẫn tới một chương trình: ưu tiên thư mục người dùng chỉ, không có thì tìm trong PATH.
pub(crate) fn prog(tex_bin: &Option<String>, name: &str) -> std::ffi::OsString {
    if let Some(dir) = tex_bin.as_deref().map(str::trim).filter(|d| !d.is_empty()) {
        let p = Path::new(dir).join(name);
        let exe = if cfg!(windows) { p.with_extension("exe") } else { p.clone() };
        if exe.exists() {
            return exe.into_os_string();
        }
        if cfg!(windows) {
            // tlmgr trên Windows là tlmgr.bat
            for ext in ["bat", "cmd"] {
                let b = p.with_extension(ext);
                if b.exists() {
                    return b.into_os_string();
                }
            }
        }
        if p.exists() {
            return p.into_os_string();
        }
    }
    std::ffi::OsString::from(name)
}

/// Dò các chỗ hay cài TeX Live / MiKTeX để người dùng khỏi phải tự tìm.
pub fn find_tex_bins() -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let exe = if cfg!(windows) { "pdflatex.exe" } else { "pdflatex" };
    let mut push_if_ok = |p: PathBuf| {
        if p.join(exe).exists() {
            let s = p.display().to_string();
            if !out.contains(&s) {
                out.push(s);
            }
        }
    };
    // TeX Live: <ổ>:\\texlive\\...\\bin\\<nền tảng> — có máy lồng thêm một cấp (texlive\\texlive\\2026).
    fn walk(dir: &Path, depth: u32, found: &mut Vec<PathBuf>) {
        if depth == 0 {
            return;
        }
        let Ok(rd) = fs::read_dir(dir) else { return };
        for e in rd.flatten() {
            let p = e.path();
            if !p.is_dir() {
                continue;
            }
            let name = e.file_name();
            if name.eq_ignore_ascii_case("bin") {
                if let Ok(bd) = fs::read_dir(&p) {
                    for plat in bd.flatten() {
                        found.push(plat.path());
                    }
                }
            }
            walk(&p, depth - 1, found);
        }
    }
    for drive in ["C:", "D:", "E:", "F:"] {
        for root in [format!("{drive}\\texlive"), format!("{drive}\\texmf"), format!("{drive}\\Program Files\\texlive")] {
            let mut found = Vec::new();
            walk(Path::new(&root), 4, &mut found);
            for f in found {
                push_if_ok(f);
            }
        }
    }
    // MiKTeX
    for cand in [
        "C:\\Program Files\\MiKTeX\\miktex\\bin\\x64",
        "C:\\Program Files (x86)\\MiKTeX\\miktex\\bin",
        "/usr/bin",
        "/usr/local/bin",
        "/Library/TeX/texbin",
    ] {
        push_if_ok(PathBuf::from(cand));
    }
    out
}

/// Đầu file mặc định viết đầy đủ (thay \input{shared-content} bằng nội dung thật) để hiện được
/// trong ô sửa đầu file và để giao diện biết các gói HEdu tự nạp.
pub fn expanded_default() -> String {
    let shared = support::FILES
        .iter()
        .find(|(n, _)| *n == "shared-content.tex")
        .map(|(_, b)| String::from_utf8_lossy(b).into_owned())
        .unwrap_or_default();
    DEFAULT_PREAMBLE.replace("\\input{shared-content}", &shared)
}

fn hash64(parts: &[&str]) -> String {
    // FNV-1a: đủ dùng để đặt tên file đệm, không cần thư viện ngoài.
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for p in parts {
        for b in p.as_bytes() {
            h ^= *b as u64;
            h = h.wrapping_mul(0x100_0000_01b3);
        }
        h ^= 0xff;
        h = h.wrapping_mul(0x100_0000_01b3);
    }
    format!("{h:016x}")
}

/// Chỉ nhận tên chương trình quen thuộc, không cho truyền đường dẫn tuỳ ý.
fn engine_name(engine: &Option<String>) -> &'static str {
    match engine.as_deref() {
        Some("lualatex") => "lualatex",
        Some("xelatex") => "xelatex",
        _ => "pdflatex",
    }
}

/// Lấy đoạn log quanh dòng lỗi đầu tiên (dòng bắt đầu bằng '!').
fn useful_log(log: &str) -> String {
    let lines: Vec<&str> = log.lines().collect();
    if let Some(i) = lines.iter().position(|l| l.starts_with('!')) {
        let from = i.saturating_sub(2);
        let to = (i + 12).min(lines.len());
        return lines[from..to].join("\n");
    }
    let n = lines.len();
    lines[n.saturating_sub(16)..n].join("\n")
}

fn first_error_line(log: &str) -> String {
    log.lines()
        .find(|l| l.starts_with('!'))
        .map(|l| l.trim_start_matches('!').trim().to_string())
        .unwrap_or_else(|| String::from("TeX Live báo lỗi khi dịch hình."))
}

pub(crate) fn missing_tool(name: &str) -> TikzErr {
    TikzErr {
        message: format!(
            "Không chạy được {name}. Nếu TeX Live đã cài nhưng không nằm trong PATH, hãy điền thư mục bin của nó ở mục Hệ thống (ví dụ D:\\texlive\\2025\\bin\\windows), hoặc bấm nút Tìm tự động."
        ),
        log: String::new(),
        stage: String::from("thieu-texlive"),
    }
}

/// "Thế hệ" huỷ chung: `cancel_running()` tăng số này, mọi hình đang dịch thấy khác với lúc bắt đầu thì dừng NGAY cả cây tiến trình
/// (latex/dvisvgm và con cháu của chúng) và trả lỗi giai đoạn "huy". Dùng cho nút Dừng của "Xem chuẩn hàng loạt".
static CANCEL_EPOCH: AtomicU64 = AtomicU64::new(0);
pub fn cancel_running() {
    CANCEL_EPOCH.fetch_add(1, Ordering::SeqCst);
}

/// Như `run_capture` nhưng nằm trong Job Object (dừng được cả cây tiến trình khi hết giờ) và dừng được theo `cancel_running()`.
fn run_c(cmd: &mut Command, limit: Duration, epoch: u64) -> io::Result<Captured> {
    let o = run_job_fn(cmd, limit, &|| CANCEL_EPOCH.load(Ordering::SeqCst) != epoch, |_| {})?;
    Ok(Captured { success: o.success, timed_out: o.timed_out, cancelled: o.cancelled, stdout: o.stdout, stderr: o.stderr })
}
fn cancelled_err() -> TikzErr {
    TikzErr { message: String::from("Đã dừng theo yêu cầu."), log: String::new(), stage: String::from("huy") }
}

/// Dịch một hình. `cache_dir` là nơi giữ các .svg đã dịch.
pub fn render(cache_dir: &Path, support_dir: &Option<PathBuf>, code: &str, defs: &str, opts: &TikzOpts) -> Result<TikzOut, TikzErr> {
    render_at(cache_dir, support_dir, code, defs, opts, current_epoch())
}

/// Thế hệ huỷ hiện tại; lệnh gọi từ giao diện chụp số này TRƯỚC khi chờ lượt, để hình đang xếp hàng lúc bấm Dừng cũng bị dừng.
pub fn current_epoch() -> u64 {
    CANCEL_EPOCH.load(Ordering::SeqCst)
}

pub fn render_at(cache_dir: &Path, support_dir: &Option<PathBuf>, code: &str, defs: &str, opts: &TikzOpts, epoch: u64) -> Result<TikzOut, TikzErr> {
    let started = Instant::now();
    let preamble = opts.preamble.clone().unwrap_or_else(|| DEFAULT_PREAMBLE.to_string());
    let engine = engine_name(&opts.engine);
    // pdfLaTeX (mặc định) đi đường TeX → DVI → SVG: pgf có sẵn bộ vẽ cho dvisvgm nên KHÔNG cần
    // Ghostscript. Đường qua PDF của dvisvgm đòi Ghostscript < 10.01 hoặc mutool, mà máy mới
    // thường có Ghostscript 10.x nên báo lỗi. lualatex/xelatex chỉ ra được PDF nên vẫn đi đường cũ.
    let via_dvi = engine == "pdflatex";
    let tex_prog = if via_dvi { "latex" } else { engine };
    let route = if via_dvi { "dvi" } else { "pdf" };
    let key = hash64(&[&preamble, defs, code, engine, route, &support::rev()]);

    let svg_path = cache_dir.join(format!("{key}.svg"));
    if let Ok(s) = fs::read_to_string(&svg_path) {
        if !s.is_empty() {
            touch(&svg_path);
            return Ok(TikzOut { svg: s, cached: true, ms: started.elapsed().as_millis() as u64 });
        }
    }

    if current_epoch() != epoch {
        return Err(cancelled_err());
    }
    let job = JOB.fetch_add(1, Ordering::Relaxed);
    let work = cache_dir.join(format!("tmp-{key}-{}-{job}", std::process::id()));
    let _ = fs::remove_dir_all(&work);
    fs::create_dir_all(&work).map_err(|e| TikzErr {
        message: format!("Không tạo được thư mục tạm: {e}"),
        log: String::new(),
        stage: String::from("latex"),
    })?;

    let head = if via_dvi { format!("\\def\\pgfsysdriver{{pgfsys-dvisvgm.def}}\n{preamble}") } else { preamble.clone() };
    let tex = format!("{head}\n\\begin{{document}}\n{defs}\n{code}\n\\end{{document}}\n");
    let tex_path = work.join("hinh.tex");
    fs::write(&tex_path, tex).map_err(|e| TikzErr {
        message: format!("Không ghi được file tạm: {e}"),
        log: String::new(),
        stage: String::from("latex"),
    })?;

    let limit = Duration::from_secs(opts.timeout_secs.unwrap_or(40).clamp(5, 180));

    let run_tex = |fmt: Option<&Path>| {
        let mut c = Command::new(prog(&opts.tex_bin, tex_prog));
        c.current_dir(&work);
        if let Some(f) = fmt {
            c.arg(format!("-fmt={}", f.with_extension("").to_string_lossy().replace('\\', "/")));
        }
        c.arg("-interaction=nonstopmode").arg("-halt-on-error").arg("-no-shell-escape").arg("hinh.tex");
        support::apply(&mut c, support_dir);
        hide_console(&mut c);
        run_c(&mut c, limit, epoch)
    };
    // Đường DVI (mặc định): phần đầu tệp được nạp sẵn thành định dạng (.fmt) nên mỗi hình chỉ còn dịch phần thân (~3 lần nhanh hơn).
    // Định dạng hỏng/không khớp bản TeX ⇒ bỏ định dạng đó và dịch lại như cũ: kết quả không bao giờ phụ thuộc vào việc có định dạng hay không.
    let fmt = if via_dvi { format_for(cache_dir, support_dir, &head, opts, limit) } else { None };
    let mut res = run_tex(fmt.as_deref());
    if let (Some(f), Ok(r)) = (&fmt, &res) {
        if !r.timed_out && !r.cancelled && (!r.success || !work.join("hinh.dvi").exists()) {
            let _ = fs::remove_file(f);
            let _ = fs::write(f.with_extension("fail"), b"");
            res = run_tex(None);
        }
    }

    let res = match res {
        Ok(v) => v,
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            let _ = fs::remove_dir_all(&work);
            return Err(missing_tool(tex_prog));
        }
        Err(e) => {
            let _ = fs::remove_dir_all(&work);
            return Err(TikzErr { message: format!("Không chạy được {tex_prog}: {e}"), log: String::new(), stage: String::from("latex") });
        }
    };
    if res.cancelled {
        let _ = fs::remove_dir_all(&work);
        return Err(cancelled_err());
    }
    let log = fs::read_to_string(work.join("hinh.log")).unwrap_or_else(|_| res.stdout.clone());
    if res.timed_out {
        let _ = fs::remove_dir_all(&work);
        return Err(TikzErr {
            message: format!("Dịch hình quá {} giây nên đã dừng. Hình có thể quá nặng, hoặc đang chờ nhập gì đó.", limit.as_secs()),
            log: useful_log(&log),
            stage: String::from("qua-lau"),
        });
    }
    let ok = res.success;
    let outfile = work.join(if via_dvi { "hinh.dvi" } else { "hinh.pdf" });
    if !ok || !outfile.exists() {
        let e = TikzErr { message: first_error_line(&log), log: useful_log(&log), stage: String::from("latex") };
        let _ = fs::remove_dir_all(&work);
        return Err(e);
    }

    let mut d = Command::new(prog(&opts.tex_bin, "dvisvgm"));
    d.current_dir(&work);
    if !via_dvi {
        d.arg("--pdf");
    }
    d.arg("--no-fonts")
        .arg("--exact-bbox")
        .arg("--output=hinh.svg")
        .arg(if via_dvi { "hinh.dvi" } else { "hinh.pdf" });
    support::apply(&mut d, support_dir);
    hide_console(&mut d);
    let svg = match run_c(&mut d, limit, epoch) {
        Ok(o) if o.cancelled => {
            let _ = fs::remove_dir_all(&work);
            return Err(cancelled_err());
        }
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            let _ = fs::remove_dir_all(&work);
            return Err(missing_tool("dvisvgm"));
        }
        Err(e) => {
            let _ = fs::remove_dir_all(&work);
            return Err(TikzErr { message: format!("Không chạy được dvisvgm: {e}"), log: String::new(), stage: String::from("svg") });
        }
        Ok(o) if o.timed_out => {
            let _ = fs::remove_dir_all(&work);
            return Err(TikzErr {
                message: format!("Chuyển sang SVG quá {} giây nên đã dừng.", limit.as_secs()),
                log: String::new(),
                stage: String::from("qua-lau"),
            });
        }
        Ok(o) => {
            let made = work.join("hinh.svg");
            if !o.success || !made.exists() {
                let _ = fs::remove_dir_all(&work);
                return Err(TikzErr {
                    message: if o.stderr.contains("Ghostscript") || o.stderr.contains("mutool") {
                        String::from("Chuyển sang SVG lỗi vì dvisvgm cần Ghostscript hoặc mutool phù hợp (bản Ghostscript quá mới hoặc chưa cài).")
                    } else {
                        String::from("Dịch được nhưng chuyển sang SVG thì lỗi.")
                    },
                    log: o.stderr.chars().take(1200).collect(),
                    stage: String::from("svg"),
                });
            }
            fs::read_to_string(made).unwrap_or_default()
        }
    };

    // ghi ra file tạm rồi đổi tên: người đọc cùng lúc không bao giờ thấy file dở dang
    let part = cache_dir.join(format!("{key}.{}-{job}.part", std::process::id()));
    if fs::write(&part, &svg).is_ok() && fs::rename(&part, &svg_path).is_err() {
        let _ = fs::remove_file(&part);
    }
    let _ = fs::remove_dir_all(&work);
    // cứ mỗi PRUNE_EVERY hình mới thì dọn bớt bộ nhớ đệm nếu vượt trần
    if WRITES.fetch_add(1, Ordering::Relaxed) % PRUNE_EVERY == PRUNE_EVERY - 1 {
        let _ = prune_cache(cache_dir, CACHE_MAX_BYTES, CACHE_MAX_FILES);
    }
    Ok(TikzOut { svg, cached: false, ms: started.elapsed().as_millis() as u64 })
}

/// Định dạng dựng sẵn (.fmt) cho phần đầu tệp `head` của đường DVI, nằm ở `<cache>/fmt/<khoá>.fmt`.
/// Khoá gồm phần đầu tệp, phiên bản gói nhúng và bộ dịch đang dùng. Dựng một lần (khoá loại trừ để không dựng trùng);
/// dựng hỏng thì ghi dấu `.fail` để không thử lại mãi. Giữ tối đa 3 định dạng (mỗi cái ~10 MB). Không có mylatexformat ⇒ None.
fn format_for(cache_dir: &Path, support_dir: &Option<PathBuf>, head: &str, opts: &TikzOpts, limit: Duration) -> Option<PathBuf> {
    static BUILD: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let dir = cache_dir.join("fmt");
    let key = hash64(&[head, &support::rev(), opts.tex_bin.as_deref().unwrap_or(""), "fmt-v1"]);
    let fmt = dir.join(format!("{key}.fmt"));
    if fmt.exists() {
        touch(&fmt);
        return Some(fmt);
    }
    if fmt.with_extension("fail").exists() {
        return None;
    }
    let _g = BUILD.lock().ok()?;
    if fmt.exists() {
        return Some(fmt);
    }
    fs::create_dir_all(&dir).ok()?;
    let work = dir.join(format!("tmp-{key}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&work);
    fs::create_dir_all(&work).ok()?;
    let ok = (|| {
        fs::write(work.join("pre.tex"), format!("{head}\n\\begin{{document}}\n\\end{{document}}\n")).ok()?;
        let mut c = Command::new(prog(&opts.tex_bin, "latex"));
        c.current_dir(&work).args(["-ini", "-interaction=nonstopmode", "-halt-on-error", "-no-shell-escape", "-jobname=pre", "&latex", "mylatexformat.ltx", "pre.tex"]);
        support::apply(&mut c, support_dir);
        hide_console(&mut c);
        let r = run_capture(&mut c, limit).ok()?;
        let built = work.join("pre.fmt");
        (r.success && !r.timed_out && built.exists()).then_some(())?;
        fs::rename(&built, &fmt).ok()
    })()
    .is_some();
    let _ = fs::remove_dir_all(&work);
    if !ok {
        let _ = fs::write(fmt.with_extension("fail"), b"");
        return None;
    }
    // chỉ giữ 3 định dạng dùng gần nhất
    if let Ok(rd) = fs::read_dir(&dir) {
        let mut fs_: Vec<(SystemTime, PathBuf)> = rd.flatten().map(|e| e.path()).filter(|p| p.extension().map(|x| x == "fmt").unwrap_or(false)).map(|p| (fs::metadata(&p).and_then(|m| m.modified()).unwrap_or(UNIX_EPOCH), p)).collect();
        fs_.sort_by(|a, b| b.0.cmp(&a.0));
        for (_, p) in fs_.into_iter().skip(3) {
            let _ = fs::remove_file(p);
        }
    }
    Some(fmt)
}

/// Trần bộ nhớ đệm hình: vượt thì xoá các hình lâu không dùng nhất cho tới khi còn ~80% trần.
pub const CACHE_MAX_BYTES: u64 = 128 * 1024 * 1024;
pub const CACHE_MAX_FILES: usize = 6000;
const PRUNE_EVERY: usize = 25;
static WRITES: AtomicUsize = AtomicUsize::new(0);

/// Đánh dấu hình vừa được dùng (để dọn theo "lâu không dùng"), chỉ ghi lại khi dấu cũ hơn 1 giờ cho đỡ tốn ổ đĩa.
fn touch(p: &Path) {
    let now = SystemTime::now();
    let old = fs::metadata(p).and_then(|m| m.modified()).map(|t| now.duration_since(t).map(|d| d.as_secs() > 3600).unwrap_or(false)).unwrap_or(false);
    if old {
        if let Ok(f) = fs::OpenOptions::new().write(true).open(p) {
            let _ = f.set_modified(now);
        }
    }
}

/// Dọn bộ nhớ đệm: bỏ tệp tạm/dở dang quá 1 giờ, rồi nếu tổng > `max_bytes` hoặc > `max_files` thì xoá hình lâu không dùng nhất
/// cho tới khi còn ≤ 80% hai trần. Trả về (số tệp đã xoá, số byte đã giải phóng).
pub fn prune_cache(cache_dir: &Path, max_bytes: u64, max_files: usize) -> io::Result<(usize, u64)> {
    let now = SystemTime::now();
    let mut files: Vec<(SystemTime, u64, PathBuf)> = Vec::new();
    let (mut removed, mut freed) = (0usize, 0u64);
    for e in fs::read_dir(cache_dir)?.flatten() {
        let p = e.path();
        let Ok(md) = e.metadata() else { continue };
        let age = md.modified().ok().and_then(|t| now.duration_since(t).ok()).map(|d| d.as_secs()).unwrap_or(0);
        let is_svg = md.is_file() && p.extension().map(|x| x == "svg").unwrap_or(false);
        if md.is_file() && !is_svg && age > 3600 {
            // .part dở dang
            if fs::remove_file(&p).is_ok() {
                removed += 1;
                freed += md.len();
            }
        } else if md.is_dir() && age > 3600 && p.file_name().map(|n| n.to_string_lossy().starts_with("tmp-")).unwrap_or(false) {
            // thư mục làm việc bỏ dở
            if fs::remove_dir_all(&p).is_ok() {
                removed += 1;
            }
        } else if is_svg {
            files.push((md.modified().unwrap_or(UNIX_EPOCH), md.len(), p));
        }
    }
    let mut total: u64 = files.iter().map(|f| f.1).sum();
    let mut count = files.len();
    if total <= max_bytes && count <= max_files {
        return Ok((removed, freed));
    }
    let (goal_bytes, goal_files) = (max_bytes / 5 * 4, max_files * 4 / 5);
    files.sort_by_key(|f| f.0);
    for (_, len, p) in files {
        if total <= goal_bytes && count <= goal_files {
            break;
        }
        if fs::remove_file(&p).is_ok() {
            total -= len;
            count -= 1;
            removed += 1;
            freed += len;
        }
    }
    Ok((removed, freed))
}

/// Thử dịch một hình bé xíu để biết máy đã có TeX Live chưa.
pub fn probe(cache_dir: &Path, support_dir: &Option<PathBuf>, tex_bin: Option<String>) -> Result<String, TikzErr> {
    let opts = TikzOpts { preamble: None, engine: None, timeout_secs: Some(90), tex_bin: tex_bin.clone() };
    render(cache_dir, support_dir, r"\begin{tikzpicture}\draw(0,0)--(1,1);\end{tikzpicture}", "", &opts)?;
    let mut c = Command::new(prog(&tex_bin, "pdflatex"));
    c.arg("--version");
    hide_console(&mut c);
    let v = run_capture(&mut c, Duration::from_secs(10)).ok().map(|o| o.stdout.lines().next().unwrap_or("").to_string());
    Ok(v.unwrap_or_default())
}

pub fn clear_cache(cache_dir: &Path) -> io::Result<usize> {
    let mut n = 0;
    if let Ok(rd) = fs::read_dir(cache_dir) {
        for e in rd.flatten() {
            let p = e.path();
            if p.extension().map(|x| x == "svg").unwrap_or(false) {
                if fs::remove_file(&p).is_ok() {
                    n += 1;
                }
            } else if p.is_dir() {
                let _ = fs::remove_dir_all(&p);
            }
        }
    }
    Ok(n)
}

pub fn cache_dir_of(root: &Path) -> PathBuf {
    root.join("cache").join("tikz")
}

#[cfg(windows)]
pub(crate) fn hide_console(c: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    c.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub(crate) fn hide_console(_c: &mut Command) {}

#[cfg(test)]
mod tests {
    use super::*;

    /// Chạy tay với TeX Live thật: HEDU_TEX_BIN=<thư mục bin> HEDU_SUPPORT=<thư mục gói nhúng> cargo test --lib fmt_dung_san -- --ignored --nocapture
    #[test]
    #[ignore]
    fn fmt_dung_san_nhanh_va_giong_het_cach_cu() {
        let bin = std::env::var("HEDU_TEX_BIN").expect("HEDU_TEX_BIN");
        let sup = std::env::var("HEDU_SUPPORT").ok().map(PathBuf::from);
        let d = std::env::temp_dir().join(format!("hedu-tikz-fmt-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        let opts = TikzOpts { tex_bin: Some(bin), ..Default::default() };
        let fig = |i: u32| format!("\\begin{{tikzpicture}}\\draw[->](0,0)--({i},1) node[right]{{$y=x^{i}$}};\\end{{tikzpicture}}");
        // lần đầu: dựng định dạng
        let t = Instant::now();
        let a = render(&d, &sup, &fig(1), "", &opts).map_err(|e| e.message).unwrap();
        println!("lần đầu (kèm dựng định dạng): {:?}", t.elapsed());
        assert!(d.join("fmt").read_dir().unwrap().flatten().any(|e| e.path().extension().map(|x| x == "fmt").unwrap_or(false)), "phải có .fmt");
        let t = Instant::now();
        let b = render(&d, &sup, &fig(2), "", &opts).map_err(|e| e.message).unwrap();
        let fast = t.elapsed();
        println!("hình mới có định dạng: {fast:?}");
        // so với cách cũ: xoá định dạng, đánh dấu hỏng để không dựng lại, dịch đúng hình 2 ở bộ đệm khác
        let d2 = d.join("cu");
        fs::create_dir_all(d2.join("fmt")).unwrap();
        let key = hash64(&[&format!("\\def\\pgfsysdriver{{pgfsys-dvisvgm.def}}\n{}", expanded_or_default(&opts)), &support::rev(), opts.tex_bin.as_deref().unwrap_or(""), "fmt-v1"]);
        fs::write(d2.join("fmt").join(format!("{key}.fail")), b"").unwrap();
        let t = Instant::now();
        let c = render(&d2, &sup, &fig(2), "", &opts).map_err(|e| e.message).unwrap();
        println!("hình mới cách cũ: {:?}", t.elapsed());
        assert_eq!(b.svg, c.svg, "SVG phải giống hệt cách cũ");
        assert!(!a.cached && !b.cached && !c.cached);
        let _ = fs::remove_dir_all(&d);
    }
    fn expanded_or_default(o: &TikzOpts) -> String {
        o.preamble.clone().unwrap_or_else(|| DEFAULT_PREAMBLE.to_string())
    }

    #[test]
    fn lenh_dung_chan_hinh_dang_xep_hang_va_tra_loi_huy() {
        let d = std::env::temp_dir().join(format!("hedu-tikz-cancel-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        let opts = TikzOpts { tex_bin: Some("khong-co-thu-muc-nay".into()), ..Default::default() };
        let before = current_epoch();
        cancel_running();
        assert_eq!(current_epoch(), before + 1);
        // hình đã chụp thế hệ cũ (đang xếp hàng lúc bấm Dừng) bị dừng ngay, không chạy TeX
        let e = render_at(&d, &None, "\\draw (0,0)--(1,1);", "", &opts, before).err().expect("phải bị huỷ");
        assert_eq!(e.stage, "huy");
        // hình mới (thế hệ hiện tại) không bị chặn: tới bước chạy TeX và báo thiếu công cụ chứ không phải "huy"
        let e2 = render_at(&d, &None, "\\draw (0,0)--(2,2);", "", &opts, current_epoch()).err().expect("không có TeX");
        assert_ne!(e2.stage, "huy");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn don_bo_nho_dem_bo_hinh_cu_nhat_va_giu_hinh_moi() {
        let d = std::env::temp_dir().join(format!("hedu-tikz-prune-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        let t0 = SystemTime::now() - std::time::Duration::from_secs(10_000);
        for i in 0..10u64 {
            let p = d.join(format!("h{i}.svg"));
            fs::write(&p, vec![b'x'; 100]).unwrap();
            fs::OpenOptions::new().write(true).open(&p).unwrap().set_modified(t0 + std::time::Duration::from_secs(i * 100)).unwrap();
        }
        let part = d.join("a.1-1.part");
        fs::write(&part, b"dang do").unwrap();
        fs::OpenOptions::new().write(true).open(&part).unwrap().set_modified(t0).unwrap();
        // dưới trần: không xoá hình, chỉ bỏ tệp dở dang quá 1 giờ
        assert_eq!(prune_cache(&d, 10_000, 100).unwrap().0, 1);
        assert!(!part.exists() && d.join("h0.svg").exists());
        // vượt trần 600 byte: giữ ≤ 80% = 480 byte => 4 hình mới nhất
        let (n, freed) = prune_cache(&d, 600, 100).unwrap();
        assert_eq!((n, freed), (6, 600));
        for i in 0..6 {
            assert!(!d.join(format!("h{i}.svg")).exists(), "h{i} phải bị xoá");
        }
        for i in 6..10 {
            assert!(d.join(format!("h{i}.svg")).exists(), "h{i} phải còn");
        }
        // trần theo số tệp
        assert_eq!(prune_cache(&d, 10_000, 3).unwrap().0, 2);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn ma_bam_on_dinh_va_khac_nhau() {
        assert_eq!(hash64(&["a", "b"]), hash64(&["a", "b"]));
        assert_ne!(hash64(&["a", "b"]), hash64(&["ab", ""]));
        assert_ne!(hash64(&["x"]), hash64(&["y"]));
        assert_eq!(hash64(&["a"]).len(), 16);
    }

    #[test]
    fn duong_dan_bo_dich() {
        assert_eq!(prog(&None, "pdflatex"), std::ffi::OsString::from("pdflatex"));
        assert_eq!(prog(&Some("   ".into()), "dvisvgm"), std::ffi::OsString::from("dvisvgm"));
        // thư mục không tồn tại thì quay về tên trần, để PATH lo
        assert_eq!(prog(&Some("/khong/co/dau".into()), "pdflatex"), std::ffi::OsString::from("pdflatex"));
    }

    #[test]
    fn dau_file_mac_dinh_mo_rong_du_goi() {
        let e = expanded_default();
        assert!(!e.contains("\\input{shared-content}"));
        assert!(e.contains("\\usepackage{tkz-tab}") && e.contains("\\usepackage{ex_test}"));
    }

    #[test]
    fn chi_nhan_ba_bo_dich() {
        assert_eq!(engine_name(&Some("lualatex".into())), "lualatex");
        assert_eq!(engine_name(&Some("xelatex".into())), "xelatex");
        assert_eq!(engine_name(&Some("rm -rf /".into())), "pdflatex");
        assert_eq!(engine_name(&None), "pdflatex");
    }

    #[test]
    fn log_cat_dung_cho_loi() {
        let log = "linh tinh\nnữa\n! Undefined control sequence.\nl.12 \\abc\ncòn nữa\n";
        let u = useful_log(log);
        assert!(u.contains("! Undefined control sequence."));
        assert!(u.contains("l.12"));
        assert_eq!(first_error_line(log), "Undefined control sequence.");
    }

    #[test]
    fn log_khong_co_dau_cham_than_thi_lay_cuoi() {
        let log = (1..40).map(|i| format!("dòng {i}")).collect::<Vec<_>>().join("\n");
        let u = useful_log(&log);
        assert!(u.contains("dòng 39"));
        assert!(!u.contains("dòng 1\n"));
        assert!(first_error_line(&log).contains("TeX Live"));
    }
}
