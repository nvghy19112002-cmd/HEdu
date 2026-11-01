//! Màn "Xử lí TeX" — bản nháp DUY NHẤT của bàn nháp, lưu bền trên đĩa (claude/de-xuat-man-xu-li-tex.md mục 10).
//!
//!   <app data>/xu-li-tex/nhap.tex       bản nháp hiện tại (nguyên văn, UTF-8)
//!   <app data>/xu-li-tex/nhap.tex.bak   bản ghi liền trước (phòng mất điện / tệp chính hỏng)
//!
//! Ghi kiểu "tệp tạm → sao .bak → đổi tên" như hedu.json; không đụng ngân hàng, Thư viện đề hay thư mục biên dịch.
//! Giao diện không truyền đường dẫn nào: tên tệp cố định ở đây.
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Giới hạn kích thước bản nháp (byte).
pub const MAX_BYTES: usize = 20 * 1024 * 1024;

pub struct Paths {
    dir: PathBuf,
}

impl Paths {
    pub fn new(app_data: &Path) -> Self {
        Paths { dir: app_data.join("xu-li-tex") }
    }
    fn main(&self) -> PathBuf {
        self.dir.join("nhap.tex")
    }
    fn bak(&self) -> PathBuf {
        self.dir.join("nhap.tex.bak")
    }
    fn tmp(&self) -> PathBuf {
        self.dir.join("nhap.tex.part")
    }
}

/// Ghi bản nháp. Quá giới hạn ⇒ lỗi, không ghi gì.
pub fn save(p: &Paths, text: &str) -> io::Result<()> {
    if text.len() > MAX_BYTES {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, format!("Bản nháp quá lớn (giới hạn {} MB).", MAX_BYTES / 1024 / 1024)));
    }
    fs::create_dir_all(&p.dir)?;
    {
        let mut f = fs::File::create(p.tmp())?;
        f.write_all(text.as_bytes())?;
        f.sync_all()?;
    }
    if p.main().exists() {
        // sao chép (không đổi tên) để tệp chính luôn tồn tại trong suốt quá trình
        fs::copy(p.main(), p.bak())?;
    }
    fs::rename(p.tmp(), p.main())?;
    Ok(())
}

fn read_text(path: &Path) -> io::Result<Option<String>> {
    match fs::read(path) {
        Ok(b) if b.len() <= MAX_BYTES => Ok(String::from_utf8(b).ok()),
        Ok(_) => Ok(None),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Err(e),
        Err(e) => Err(e),
    }
}

/// Kết quả đọc: nội dung (chưa có ⇒ None) và cờ "đã phải lấy từ .bak".
#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LoadOut {
    pub text: Option<String>,
    pub from_backup: bool,
}

/// Đọc bản nháp. Tệp chính hỏng/không phải UTF-8 ⇒ thử .bak; cả hai hỏng ⇒ lỗi (giao diện không được ghi đè lên).
pub fn load(p: &Paths) -> io::Result<LoadOut> {
    let main_exists = p.main().exists();
    match read_text(&p.main()) {
        Ok(Some(t)) => return Ok(LoadOut { text: Some(t), from_backup: false }),
        Ok(None) => {}
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        Err(e) => return Err(e),
    }
    match read_text(&p.bak()) {
        Ok(Some(t)) => Ok(LoadOut { text: Some(t), from_backup: true }),
        Ok(None) => Err(io::Error::new(io::ErrorKind::InvalidData, "Bản nháp và bản dự phòng đều không đọc được.")),
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            if main_exists {
                Err(io::Error::new(io::ErrorKind::InvalidData, "Bản nháp không đọc được và chưa có bản dự phòng."))
            } else {
                Ok(LoadOut { text: None, from_backup: false })
            }
        }
        Err(e) => Err(e),
    }
}

fn paths(app: &AppHandle) -> Result<Paths, String> {
    Ok(Paths::new(&app.path().app_data_dir().map_err(|e| e.to_string())?))
}

#[tauri::command]
pub async fn tex_scratch_load(app: AppHandle) -> Result<LoadOut, String> {
    let p = paths(&app)?;
    tauri::async_runtime::spawn_blocking(move || load(&p)).await.map_err(|e| e.to_string())?.map_err(|e| format!("Không đọc được bản nháp: {e}"))
}

#[tauri::command]
pub async fn tex_scratch_save(app: AppHandle, text: String) -> Result<(), String> {
    let p = paths(&app)?;
    tauri::async_runtime::spawn_blocking(move || save(&p, &text)).await.map_err(|e| e.to_string())?.map_err(|e| format!("Không lưu được bản nháp: {e}"))
}

// ---------- Đợt 1b: biên dịch bàn nháp ra PDF ----------
//
//   <app data>/xu-li-tex/build/   thư mục làm việc, dọn sạch mỗi lần (main.tex, content.tex, khai báo HEdu, tệp phụ TeX)
//   <app data>/xu-li-tex/last.pdf PDF của lần biên dịch THÀNH CÔNG gần nhất (+ last.json)
//
// Giao diện gửi NỘI DUNG các tệp, không gửi đường dẫn: tên tệp phải thuộc danh sách cố định dưới đây.
// An toàn (claude/de-xuat-man-xu-li-tex.md mục 10.2-6): -no-shell-escape, thư mục riêng, Job Object (giết cả cây), giới hạn thời gian/kích thước.

use crate::examcompile::{self, engine_command, first_line, has_severe, needs_rerun, parse_log, parse_pages, read_capped, tail, Diag, JOBNAME, MAX_PDF_VIEW, RAW_LOG_KEEP};
use crate::proc::run_job;
use std::time::{Duration, Instant};

/// Mã đăng ký lần biên dịch (khoá chạy chồng, nút Dừng).
pub const RUN_ID: &str = "xu-li-tex";
/// Tệp được phép ghi vào thư mục làm việc.
pub const ALLOWED: &[&str] = &["main.tex", "content.tex", "khaibaochung.tex", "hedu.sty", "hedu-khaibao.tex", "hedu-goithem.tex"];
const MAX_TOTAL: usize = 25 * 1024 * 1024;
const TIMEOUT_SECS: u64 = 120;
const RUNS: u32 = 2;

#[derive(serde::Deserialize, Debug, Clone)]
pub struct FileIn {
    pub path: String,
    pub text: String,
}

#[derive(serde::Serialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScratchOut {
    /// ok | failed | timeout | cancelled | no-tex
    pub status: String,
    pub message: String,
    pub pages: Option<u32>,
    pub runs: u32,
    pub ms: u64,
    pub tex_version: String,
    pub diagnostics: Vec<Diag>,
    pub error_count: u32,
    pub warning_count: u32,
    pub raw_log: String,
    /// TeX ghi ra PDF nhưng lần chạy có lỗi ⇒ PDF đó bị bỏ
    pub invalid_pdf: bool,
    /// có PDF tốt gần nhất (last.pdf) để xem
    pub has_pdf: bool,
}

impl Paths {
    fn build(&self) -> PathBuf {
        self.dir.join("build")
    }
    fn last_pdf(&self) -> PathBuf {
        self.dir.join("last.pdf")
    }
}

/// Kiểm danh sách tệp gửi vào: chỉ tên trong ALLOWED, không trùng, có main.tex và content.tex, tổng không quá giới hạn.
pub fn check_files(files: &[FileIn]) -> Result<(), String> {
    let mut seen = std::collections::HashSet::new();
    let mut total = 0usize;
    for f in files {
        if !ALLOWED.contains(&f.path.as_str()) {
            return Err(format!("Tệp «{}» không được phép trong bàn nháp.", f.path));
        }
        if !seen.insert(f.path.as_str()) {
            return Err(format!("Tệp «{}» bị gửi hai lần.", f.path));
        }
        total += f.text.len();
    }
    if total > MAX_TOTAL {
        return Err(format!("Nội dung quá lớn để biên dịch (giới hạn {} MB).", MAX_TOTAL / 1024 / 1024));
    }
    for need in ["main.tex", "content.tex"] {
        if !seen.contains(need) {
            return Err(format!("Thiếu {need}."));
        }
    }
    Ok(())
}

fn copy_atomic(src: &Path, dest: &Path) -> io::Result<()> {
    let tmp = dest.with_extension("part");
    fs::copy(src, &tmp)?;
    fs::File::open(&tmp)?.sync_all().ok();
    if fs::rename(&tmp, dest).is_err() {
        let _ = fs::remove_file(dest);
        fs::rename(&tmp, dest)?;
    }
    Ok(())
}

/// Biên dịch bàn nháp. Lỗi biên dịch KHÔNG phải Err (trả status); Err chỉ cho dùng sai/hạ tầng.
pub fn compile(p: &Paths, files: &[FileIn], tex_bin: &Option<String>, support_dir: &Option<PathBuf>) -> Result<ScratchOut, String> {
    check_files(files)?;
    let (_guard, cancel_flag) = examcompile::register(RUN_ID).map_err(|_| "Bàn nháp đang được biên dịch. Hãy chờ hoặc bấm Dừng.".to_string())?;
    let started = Instant::now();
    let limit = Duration::from_secs(TIMEOUT_SECS);
    let engine = "pdflatex";
    let mut out = ScratchOut { has_pdf: p.last_pdf().is_file(), ..Default::default() };

    // thư mục làm việc dọn sạch mỗi lần: không bao giờ nhầm PDF/aux cũ là của lần này
    let work = p.build();
    let _ = fs::remove_dir_all(&work);
    fs::create_dir_all(&work).map_err(|e| format!("Không tạo được thư mục biên dịch: {e}"))?;
    for f in files {
        fs::write(work.join(&f.path), f.text.as_bytes()).map_err(|e| format!("Không ghi được {}: {e}", f.path))?;
    }

    let mut vc = engine_command(tex_bin, engine, support_dir, &work);
    vc.arg("--version");
    out.tex_version = match run_job(&mut vc, Duration::from_secs(20), &cancel_flag) {
        Ok(v) => first_line(&v.stdout),
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            out.status = "no-tex".into();
            out.message = crate::tikz::missing_tool(engine).message;
            return Ok(out);
        }
        Err(e) => return Err(format!("Không chạy được {engine}: {e}")),
    };

    let pdf = work.join(format!("{JOBNAME}.pdf"));
    let logp = work.join(format!("{JOBNAME}.log"));
    let mut last_log = String::new();
    loop {
        out.runs += 1;
        let left = limit.checked_sub(started.elapsed()).unwrap_or(Duration::ZERO);
        if left.is_zero() {
            out.status = "timeout".into();
            break;
        }
        let mut c = engine_command(tex_bin, engine, support_dir, &work);
        c.args(["-interaction=nonstopmode", "-file-line-error", "-no-shell-escape"]).arg(format!("-jobname={JOBNAME}")).arg("main.tex");
        let r = match run_job(&mut c, left, &cancel_flag) {
            Ok(r) => r,
            Err(e) if e.kind() == io::ErrorKind::NotFound => {
                out.status = "no-tex".into();
                out.message = crate::tikz::missing_tool(engine).message;
                return Ok(out);
            }
            Err(e) => return Err(format!("Không chạy được {engine}: {e}")),
        };
        last_log = if logp.is_file() { read_capped(&logp) } else { r.stdout.clone() };
        if r.cancelled {
            out.status = "cancelled".into();
            break;
        }
        if r.timed_out {
            out.status = "timeout".into();
            break;
        }
        if !(r.success && !has_severe(&last_log) && pdf.is_file()) {
            out.status = "failed".into();
            out.invalid_pdf = pdf.is_file();
            break;
        }
        if needs_rerun(&last_log) && out.runs < RUNS {
            continue;
        }
        out.status = "ok".into();
        break;
    }
    out.ms = started.elapsed().as_millis() as u64;
    out.pages = parse_pages(&last_log);
    let work_fwd = work.to_string_lossy().replace('\\', "/");
    let diags = parse_log(&last_log, "", work_fwd.trim_start_matches("//?/"));
    out.error_count = diags.iter().filter(|d| d.severity == "error").count() as u32;
    out.warning_count = diags.iter().filter(|d| d.severity == "warning").count() as u32;
    out.diagnostics = diags;
    out.raw_log = tail(&last_log, RAW_LOG_KEEP);
    if out.status == "ok" {
        copy_atomic(&pdf, &p.last_pdf()).map_err(|e| format!("Không lưu được PDF: {e}"))?;
        out.has_pdf = true;
        out.message = format!("Biên dịch thành công{}.", out.pages.map(|n| format!(" ({n} trang)")).unwrap_or_default());
    } else {
        out.message = match out.status.as_str() {
            "timeout" => format!("Biên dịch quá {TIMEOUT_SECS} giây nên đã dừng (cả cây tiến trình TeX)."),
            "cancelled" => "Đã dừng biên dịch.".into(),
            _ => {
                let first = out.diagnostics.iter().find(|d| d.severity == "error").map(|d| d.message.clone()).unwrap_or_else(|| "TeX báo lỗi khi biên dịch.".into());
                format!("Biên dịch LỖI: {first}{}", if out.invalid_pdf { " (TeX vẫn ghi ra một PDF nhưng PDF đó KHÔNG hợp lệ nên đã bị bỏ)" } else { "" })
            }
        };
        if out.has_pdf {
            out.message.push_str(" PDF của lần thành công trước vẫn được giữ.");
        }
    }
    Ok(out)
}

pub fn read_last_pdf(p: &Paths) -> Result<Vec<u8>, String> {
    let f = p.last_pdf();
    let n = fs::metadata(&f).map_err(|_| "Chưa có PDF nào của bàn nháp.".to_string())?.len();
    if n > MAX_PDF_VIEW {
        return Err("PDF quá lớn để xem trong app.".into());
    }
    fs::read(&f).map_err(|e| format!("Không đọc được PDF: {e}"))
}

#[tauri::command]
pub async fn tex_scratch_compile(app: AppHandle, files: Vec<FileIn>, tex_bin: Option<String>) -> Result<ScratchOut, String> {
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let sup = crate::support::prepare(&root);
    let p = Paths::new(&root);
    tauri::async_runtime::spawn_blocking(move || compile(&p, &files, &tex_bin, &sup)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn tex_scratch_compile_cancel() -> bool {
    examcompile::cancel(RUN_ID)
}

#[tauri::command]
pub fn tex_scratch_pdf(app: AppHandle) -> Result<tauri::ipc::Response, String> {
    read_last_pdf(&paths(&app)?).map(tauri::ipc::Response::new)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fi(path: &str, text: &str) -> FileIn {
        FileIn { path: path.into(), text: text.into() }
    }

    #[test]
    fn chi_nhan_ten_tep_co_dinh() {
        let ok = vec![fi("main.tex", "x"), fi("content.tex", "y"), fi("hedu.sty", "z")];
        assert!(check_files(&ok).is_ok());
        for bad in ["../main.tex", "C:/Windows/x.tex", "build/main.tex", "khac.tex", "main.tex "] {
            assert!(check_files(&[fi("main.tex", ""), fi("content.tex", ""), fi(bad, "")]).is_err(), "{bad}");
        }
        assert!(check_files(&[fi("main.tex", "")]).is_err(), "thiếu content.tex");
        assert!(check_files(&[fi("main.tex", ""), fi("main.tex", ""), fi("content.tex", "")]).is_err(), "trùng tên");
        assert!(check_files(&[fi("main.tex", &"a".repeat(MAX_TOTAL + 1)), fi("content.tex", "")]).is_err(), "quá lớn");
    }

    #[test]
    fn chua_co_pdf_thi_bao_ro() {
        let d = tmp_dir("pdf");
        assert!(read_last_pdf(&Paths::new(&d)).is_err());
    }

    /// Biên dịch thật bằng TeX Live (chạy tay): HEDU_TEX_BIN=<thư mục bin> cargo test --lib --locked scratch_tex_that -- --ignored --nocapture
    #[test]
    #[ignore]
    fn scratch_tex_that() {
        let bin = std::env::var("HEDU_TEX_BIN").ok();
        let d = tmp_dir("tex");
        let p = Paths::new(&d);
        let main = "\\documentclass{article}\n\\usepackage{tikz}\n\\begin{document}\n\\input{content.tex}\n\\end{document}\n";
        // 1) thành công
        let good = "\\newcommand{\\vv}[1]{\\overrightarrow{#1}}\nCâu $\\vv{AB}$.\n\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}\n";
        let o = compile(&p, &[fi("main.tex", main), fi("content.tex", good)], &bin, &None).unwrap();
        assert_eq!(o.status, "ok", "{}\n{}", o.message, o.raw_log);
        assert!(o.has_pdf && read_last_pdf(&p).unwrap().starts_with(b"%PDF"));
        // 2) lỗi ở dòng 3 của content.tex ⇒ chẩn đoán đúng tệp + dòng; PDF cũ vẫn giữ
        let bad = "Dong mot.\nDong hai.\n$\\khonglenhnay$\n";
        let o = compile(&p, &[fi("main.tex", main), fi("content.tex", bad)], &bin, &None).unwrap();
        assert_eq!(o.status, "failed");
        let e = o.diagnostics.iter().find(|x| x.severity == "error").expect("có lỗi");
        assert_eq!((e.file.as_deref(), e.line), (Some("content.tex"), Some(3)), "{e:?}");
        assert!(o.has_pdf, "giữ PDF tốt trước");
        // 3) ghi tệp ra ngoài thư mục làm việc bị TeX chặn (openout_any=p)
        let esc = "\\newwrite\\f\\immediate\\openout\\f=../../ngoai-thu-muc.txt\\immediate\\write\\f{x}\\immediate\\closeout\\f\n";
        let _ = compile(&p, &[fi("main.tex", main), fi("content.tex", esc)], &bin, &None).unwrap();
        assert!(!d.join("ngoai-thu-muc.txt").exists() && !d.parent().unwrap().join("ngoai-thu-muc.txt").exists(), "không ghi được ra ngoài");
        let _ = fs::remove_dir_all(&d);
    }

    fn tmp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("hedu-texscratch-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn chua_co_ban_nhap_thi_rong() {
        let d = tmp_dir("rong");
        assert_eq!(load(&Paths::new(&d)).unwrap(), LoadOut { text: None, from_backup: false });
    }

    #[test]
    fn ghi_roi_doc_lai_nguyen_van_va_giu_ban_truoc() {
        let d = tmp_dir("ghi");
        let p = Paths::new(&d);
        let a = "\\begin{ex}%[0D1N1-1]\r\n\tCâu một\u{00a0}$x^2$ \n\\end{ex}\n";
        save(&p, a).unwrap();
        assert_eq!(load(&p).unwrap().text.as_deref(), Some(a), "không đổi một byte (CRLF, tab, khoảng trắng đặc biệt)");
        save(&p, "bản hai").unwrap();
        assert_eq!(fs::read_to_string(p.bak()).unwrap(), a, "bản trước vào .bak");
        assert!(!p.tmp().exists(), "không để lại tệp tạm");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn tep_chinh_hong_thi_lay_ban_du_phong() {
        let d = tmp_dir("hong");
        let p = Paths::new(&d);
        save(&p, "bản tốt").unwrap();
        save(&p, "bản mới").unwrap();
        fs::write(p.main(), [0xff, 0xfe, 0x00]).unwrap();
        assert_eq!(load(&p).unwrap(), LoadOut { text: Some("bản tốt".into()), from_backup: true });
        fs::write(p.bak(), [0xff]).unwrap();
        assert!(load(&p).is_err(), "cả hai hỏng ⇒ báo lỗi, không coi như trống");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn qua_gioi_han_thi_khong_ghi() {
        let d = tmp_dir("lon");
        let p = Paths::new(&d);
        save(&p, "nhỏ").unwrap();
        let big = "a".repeat(MAX_BYTES + 1);
        assert!(save(&p, &big).is_err());
        assert_eq!(load(&p).unwrap().text.as_deref(), Some("nhỏ"));
        let _ = fs::remove_dir_all(&d);
    }
}
