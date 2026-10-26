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
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use crate::proc::run_capture;
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

/// Dịch một hình. `cache_dir` là nơi giữ các .svg đã dịch.
pub fn render(cache_dir: &Path, support_dir: &Option<PathBuf>, code: &str, defs: &str, opts: &TikzOpts) -> Result<TikzOut, TikzErr> {
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
            return Ok(TikzOut { svg: s, cached: true, ms: started.elapsed().as_millis() as u64 });
        }
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

    let mut c = Command::new(prog(&opts.tex_bin, tex_prog));
    c.current_dir(&work)
        .arg("-interaction=nonstopmode")
        .arg("-halt-on-error")
        .arg("-no-shell-escape")
        .arg("hinh.tex");
    support::apply(&mut c, support_dir);
    hide_console(&mut c);

    let res = match run_capture(&mut c, limit) {
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
    let svg = match run_capture(&mut d, limit) {
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
    Ok(TikzOut { svg, cached: false, ms: started.elapsed().as_millis() as u64 })
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
