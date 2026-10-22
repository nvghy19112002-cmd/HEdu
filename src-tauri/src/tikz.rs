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
use std::time::{Duration, Instant};

/// Đầu file mặc định. Người dùng đổi được trong mục Hệ thống nếu TeX Live của họ
/// thiếu gói nào đó, hoặc cần thêm gói riêng.
pub const DEFAULT_PREAMBLE: &str = r"\documentclass[border=3pt,varwidth=16cm]{standalone}
\usepackage[utf8]{inputenc}
\usepackage[T5]{fontenc}
\usepackage{lmodern}
\usepackage{amsmath,amssymb}
\usepackage{tikz,tikz-3dplot}
\usepackage{tkz-tab,tkz-euclide}
\usepackage{pgfplots}
\pgfplotsset{compat=1.18}
\usetikzlibrary{calc,arrows.meta,decorations.pathmorphing,patterns,shapes.geometric,intersections,angles,quotes,positioning,through,backgrounds,fit,matrix,babel}";

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

fn run(cmd: &mut Command, limit: Duration) -> io::Result<(bool, String)> {
    // Chạy và chờ; nếu quá giờ thì kết thúc tiến trình.
    let mut child = cmd.spawn()?;
    let start = Instant::now();
    loop {
        match child.try_wait()? {
            Some(status) => {
                let mut out = String::new();
                if let Some(mut o) = child.stdout.take() {
                    use std::io::Read;
                    let _ = o.read_to_string(&mut out);
                }
                return Ok((status.success(), out));
            }
            None => {
                if start.elapsed() > limit {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Ok((false, String::from("__QUA_LAU__")));
                }
                std::thread::sleep(Duration::from_millis(60));
            }
        }
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

fn missing_tool(name: &str) -> TikzErr {
    TikzErr {
        message: format!(
            "Không tìm thấy {name}. Hãy cài TeX Live (hoặc MiKTeX) và mở lại HEdu; nếu đã cài thì kiểm tra xem thư mục bin của nó có trong PATH chưa."
        ),
        log: String::new(),
        stage: String::from("thieu-texlive"),
    }
}

/// Dịch một hình. `cache_dir` là nơi giữ các .svg đã dịch.
pub fn render(cache_dir: &Path, code: &str, defs: &str, opts: &TikzOpts) -> Result<TikzOut, TikzErr> {
    let started = Instant::now();
    let preamble = opts.preamble.clone().unwrap_or_else(|| DEFAULT_PREAMBLE.to_string());
    let engine = engine_name(&opts.engine);
    let key = hash64(&[&preamble, defs, code, engine]);

    let svg_path = cache_dir.join(format!("{key}.svg"));
    if let Ok(s) = fs::read_to_string(&svg_path) {
        if !s.is_empty() {
            return Ok(TikzOut { svg: s, cached: true, ms: started.elapsed().as_millis() as u64 });
        }
    }

    let work = cache_dir.join(format!("tmp-{key}"));
    let _ = fs::remove_dir_all(&work);
    fs::create_dir_all(&work).map_err(|e| TikzErr {
        message: format!("Không tạo được thư mục tạm: {e}"),
        log: String::new(),
        stage: String::from("latex"),
    })?;

    let tex = format!("{preamble}\n\\begin{{document}}\n{defs}\n{code}\n\\end{{document}}\n");
    let tex_path = work.join("hinh.tex");
    fs::write(&tex_path, tex).map_err(|e| TikzErr {
        message: format!("Không ghi được file tạm: {e}"),
        log: String::new(),
        stage: String::from("latex"),
    })?;

    let limit = Duration::from_secs(opts.timeout_secs.unwrap_or(40).clamp(5, 180));

    let mut c = Command::new(engine);
    c.current_dir(&work)
        .arg("-interaction=nonstopmode")
        .arg("-halt-on-error")
        .arg("-no-shell-escape")
        .arg("hinh.tex")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null());
    hide_console(&mut c);

    let (ok, out) = match run(&mut c, limit) {
        Ok(v) => v,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Err(missing_tool(engine)),
        Err(e) => {
            return Err(TikzErr { message: format!("Không chạy được {engine}: {e}"), log: String::new(), stage: String::from("latex") })
        }
    };
    let log = fs::read_to_string(work.join("hinh.log")).unwrap_or(out.clone());
    if out == "__QUA_LAU__" {
        let _ = fs::remove_dir_all(&work);
        return Err(TikzErr {
            message: format!("Dịch hình quá {} giây nên đã dừng. Hình có thể quá nặng, hoặc đang chờ nhập gì đó.", limit.as_secs()),
            log: useful_log(&log),
            stage: String::from("qua-lau"),
        });
    }
    let pdf = work.join("hinh.pdf");
    if !ok || !pdf.exists() {
        let e = TikzErr { message: first_error_line(&log), log: useful_log(&log), stage: String::from("latex") };
        let _ = fs::remove_dir_all(&work);
        return Err(e);
    }

    let mut d = Command::new("dvisvgm");
    d.current_dir(&work)
        .arg("--pdf")
        .arg("--no-fonts")
        .arg("--exact-bbox")
        .arg("--output=hinh.svg")
        .arg("hinh.pdf")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    hide_console(&mut d);
    let dres = d.output();
    let svg = match dres {
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            let _ = fs::remove_dir_all(&work);
            return Err(missing_tool("dvisvgm"));
        }
        Err(e) => {
            let _ = fs::remove_dir_all(&work);
            return Err(TikzErr { message: format!("Không chạy được dvisvgm: {e}"), log: String::new(), stage: String::from("svg") });
        }
        Ok(o) => {
            let made = work.join("hinh.svg");
            if !o.status.success() || !made.exists() {
                let err = String::from_utf8_lossy(&o.stderr).to_string();
                let _ = fs::remove_dir_all(&work);
                return Err(TikzErr {
                    message: String::from("Dịch ra PDF được nhưng chuyển sang SVG thì lỗi."),
                    log: err.chars().take(1200).collect(),
                    stage: String::from("svg"),
                });
            }
            fs::read_to_string(made).unwrap_or_default()
        }
    };

    let _ = fs::write(&svg_path, &svg);
    let _ = fs::remove_dir_all(&work);
    Ok(TikzOut { svg, cached: false, ms: started.elapsed().as_millis() as u64 })
}

/// Thử dịch một hình bé xíu để biết máy đã có TeX Live chưa.
pub fn probe(cache_dir: &Path) -> Result<String, TikzErr> {
    let opts = TikzOpts { preamble: None, engine: None, timeout_secs: Some(60) };
    render(cache_dir, r"\begin{tikzpicture}\draw(0,0)--(1,1);\end{tikzpicture}", "", &opts)?;
    let mut c = Command::new("pdflatex");
    c.arg("--version").stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::null());
    hide_console(&mut c);
    let v = c.output().ok().map(|o| String::from_utf8_lossy(&o.stdout).lines().next().unwrap_or("").to_string());
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
fn hide_console(c: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    c.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_console(_c: &mut Command) {}

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
