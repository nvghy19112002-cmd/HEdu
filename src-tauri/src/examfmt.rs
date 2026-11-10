// Định dạng dựng sẵn (.fmt, gói mylatexformat) cho PHẦN ĐẦU đề dịch bằng pdfLaTeX: nạp gói một lần, mỗi lần biên dịch sau chỉ
// còn dịch phần thân (đo: 2,3 s → 1,15 s mỗi lượt; PDF giống từng điểm ảnh). Cùng cách tikz.rs đã dùng cho hình từ beta.57.
//
// An toàn:
//  - Khoá gồm phần đầu tệp chính, phiên bản TeX, gói đi kèm, danh sách tệp TeX của đề (để \IfFileExists thấy tệp mới).
//  - Định dạng dựng trong BẢN SAO các tệp TeX dạng chữ của đề (thư mục riêng, chạy nền); `-recorder` ghi mọi tệp phần đầu đã đọc.
//    Mỗi lần dùng đều kiểm lại: tệp của đề so mã băm nội dung, tệp TeX Live so cỡ + thời điểm sửa. Khác ⇒ không dùng, dựng lại.
//  - Chưa có định dạng ⇒ biên dịch như cũ ngay, dựng định dạng ở luồng nền cho lần sau (lần đầu không chậm hơn).
//  - Dịch bằng định dạng mà lỗi, dịch lại kiểu cũ lại được ⇒ bỏ định dạng đó và không dựng lại cho phần đầu này (`discard`).
//  - Không dùng khi phần đầu có \jobname, \endofdump, dòng %& (khó đoán khi nạp sẵn).
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::examlib::sha256_file;
use crate::proc::run_job;
use crate::support;

const VERSION: &str = "exam-fmt-v1";
/// Giữ tối đa bấy nhiêu định dạng (~11 MB mỗi tệp), bỏ tệp lâu không dùng nhất.
const KEEP: usize = 8;
const JOB: &str = "hedu-fmt";
/// Tệp chép sang thư mục dựng định dạng và tính vào danh sách tệp của đề: tệp TeX dạng chữ (phần đầu không đọc ảnh).
const TEXT_EXT: &[&str] = &["tex", "sty", "cls", "cfg", "def", "clo", "fd", "ldf", "ltx", "code"];
const MAX_FILES: usize = 4000;

pub fn cache_dir(root: &Path) -> PathBuf {
    root.join("cache").join("exam-fmt")
}

/// Phần mã của một dòng trước dấu % chú thích (bỏ qua \%).
fn code_part(line: &str) -> &str {
    let b = line.as_bytes();
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'\\' {
            i += 2;
            continue;
        }
        if b[i] == b'%' {
            return &line[..i];
        }
        i += 1;
    }
    line
}

/// Phần đầu của tệp chính: mọi thứ trước \begin{document} đầu tiên (không tính chú thích).
/// None nếu không có \documentclass ở phần đầu hoặc phần đầu có thứ không nạp sẵn an toàn được.
pub fn preamble_of(text: &str) -> Option<&str> {
    if text.starts_with("%&") {
        return None;
    }
    let mut off = 0;
    let mut has_class = false;
    for line in text.split_inclusive('\n') {
        let code = code_part(line);
        if let Some(i) = code.find("\\begin{document}") {
            let pre = &text[..off + i];
            has_class |= code[..i].contains("\\documentclass");
            let risky = ["\\jobname", "\\endofdump", "\\dump"].iter().any(|k| pre.contains(k));
            return (has_class && !risky).then_some(pre);
        }
        has_class |= code.contains("\\documentclass");
        off += line.len();
    }
    None
}

fn is_text_tex(rel: &str) -> bool {
    let name = rel.rsplit('/').next().unwrap_or(rel);
    if name.starts_with("hedu-out.") || name.starts_with("hedu-fmt.") {
        return false;
    }
    name.rsplit_once('.').map(|(_, x)| TEXT_EXT.contains(&x.to_ascii_lowercase().as_str())).unwrap_or(false)
}

/// Các tệp TeX dạng chữ trong thư mục biên dịch (đường dẫn tương đối, có thứ tự).
pub fn tex_files(cwd: &Path) -> Vec<String> {
    let (mut all, mut blocked) = (Vec::new(), Vec::new());
    super::collect(cwd, "", 1, &mut all, &mut blocked);
    let mut out: Vec<String> = all.into_iter().filter(|r| is_text_tex(r)).take(MAX_FILES).collect();
    out.sort();
    out
}

fn hex16(h: Sha256) -> String {
    h.finalize().iter().take(8).map(|b| format!("{b:02x}")).collect()
}

/// Khoá định dạng: phần đầu, phiên bản TeX, gói đi kèm, danh sách tệp TeX của đề. Không gồm tên tệp chính: các mã đề cùng phần đầu dùng chung.
pub fn prekey(preamble: &str, ver: &str, names: &[String]) -> String {
    let mut h = Sha256::new();
    for p in [VERSION, ver, &support::rev(), preamble] {
        h.update(p.as_bytes());
        h.update([0]);
    }
    for n in names {
        h.update(n.as_bytes());
        h.update([1]);
    }
    hex16(h)
}

#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct Manifest {
    /// (tệp, dấu): "rel:<đường dẫn trong đề>" ↦ mã băm nội dung; "abs:<đường dẫn>" ↦ "cỡ:thời điểm sửa"
    pub deps: Vec<(String, String)>,
}

fn stat_sig(p: &Path) -> Option<String> {
    let m = fs::metadata(p).ok()?;
    let t = m.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_nanos();
    Some(format!("{}:{t}", m.len()))
}

/// Mọi tệp định dạng đã đọc vẫn y như lúc dựng (tệp của đề đối chiếu trong `cwd`).
pub fn deps_ok(m: &Manifest, cwd: &Path) -> bool {
    m.deps.iter().all(|(k, v)| {
        if let Some(rel) = k.strip_prefix("rel:") {
            sha256_file(&cwd.join(rel)).map(|s| &s == v).unwrap_or(false)
        } else if let Some(abs) = k.strip_prefix("abs:") {
            stat_sig(Path::new(abs)).as_deref() == Some(v.as_str())
        } else {
            false
        }
    })
}

fn norm(p: &str) -> String {
    p.replace('\\', "/").trim_start_matches("//?/").to_lowercase()
}

/// Đọc tệp .fls của `-recorder`: các tệp INPUT, chia thành tệp trong `work` (đường dẫn tương đối) và tệp ngoài (tuyệt đối).
pub fn parse_fls(fls: &str, work: &Path) -> (Vec<String>, Vec<PathBuf>) {
    let mut pwd = work.to_path_buf();
    let (mut inside, mut outside) = (Vec::new(), Vec::new());
    let mut seen = HashSet::new();
    let base = norm(&work.to_string_lossy());
    let base = base.trim_end_matches('/').to_string();
    for line in fls.lines() {
        if let Some(p) = line.strip_prefix("PWD ") {
            pwd = PathBuf::from(p.trim());
            continue;
        }
        let Some(p) = line.strip_prefix("INPUT ") else { continue };
        let mut p = p.trim();
        while let Some(rest) = p.strip_prefix("./").or_else(|| p.strip_prefix(".\\")) {
            p = rest;
        }
        let full = if Path::new(p).is_absolute() || p.get(1..2) == Some(":") { PathBuf::from(p) } else { pwd.join(p) };
        let n = norm(&full.to_string_lossy());
        if !seen.insert(n.clone()) {
            continue;
        }
        if n.starts_with(&format!("{base}/")) {
            // giữ chữ hoa/thường gốc: bỏ đúng số KÝ TỰ của thư mục gốc (an toàn với tên tiếng Việt)
            let orig = full.to_string_lossy().replace('\\', "/");
            let orig = orig.trim_start_matches("//?/");
            let rel_orig: String = orig.chars().skip(base.chars().count() + 1).collect();
            inside.push(rel_orig.trim_start_matches("./").to_string());
        } else {
            outside.push(full);
        }
    }
    (inside, outside)
}

static BUILDING: Mutex<Option<HashSet<String>>> = Mutex::new(None);
static NEVER: AtomicBool = AtomicBool::new(false);

fn manifests(dir: &Path, key: &str) -> Vec<PathBuf> {
    let Ok(rd) = fs::read_dir(dir) else { return vec![] };
    let mut v: Vec<PathBuf> = rd.flatten().map(|e| e.path()).filter(|p| p.extension().map(|x| x == "json").unwrap_or(false) && p.file_stem().map(|s| s.to_string_lossy().starts_with(&format!("{key}-"))).unwrap_or(false)).collect();
    v.sort();
    v
}

fn touch(p: &Path) {
    if let Ok(f) = fs::OpenOptions::new().append(true).open(p) {
        let _ = f.set_modified(SystemTime::now());
    }
}

/// Định dạng dùng được ngay cho phần đầu này (đã kiểm lại mọi tệp phụ thuộc), nếu có.
pub fn lookup(dir: &Path, key: &str, cwd: &Path) -> Option<PathBuf> {
    for mf in manifests(dir, key) {
        let fmt = mf.with_extension("fmt");
        let Ok(text) = fs::read_to_string(&mf) else { continue };
        let Ok(m) = serde_json::from_str::<Manifest>(&text) else { continue };
        if fmt.is_file() && deps_ok(&m, cwd) {
            touch(&fmt);
            return Some(fmt);
        }
    }
    None
}

/// Có định dạng hợp lệ thì trả về; chưa có thì bắt đầu dựng ở luồng nền (cho lần biên dịch sau) và trả None.
pub fn ensure(root: &Path, cwd: &Path, main_name: &str, tex_bin: &Option<String>, support_dir: &Option<PathBuf>, ver: &str) -> Option<PathBuf> {
    let text = fs::read(cwd.join(main_name)).ok().map(|b| String::from_utf8_lossy(&b).into_owned())?;
    let pre = preamble_of(&text)?;
    let names = tex_files(cwd);
    let key = prekey(pre, ver, &names);
    let dir = cache_dir(root);
    if let Some(f) = lookup(&dir, &key, cwd) {
        return Some(f);
    }
    if dir.join(format!("{key}.fail")).exists() {
        return None;
    }
    {
        let mut g = BUILDING.lock().unwrap_or_else(|e| e.into_inner());
        if !g.get_or_insert_with(HashSet::new).insert(key.clone()) {
            return None; // đang dựng
        }
    }
    let (cwd, main_name, tex_bin, support_dir) = (cwd.to_path_buf(), main_name.to_string(), tex_bin.clone(), support_dir.clone());
    std::thread::spawn(move || {
        let _ = build(&dir, &key, &cwd, &names, &main_name, &tex_bin, &support_dir);
        if let Some(s) = BUILDING.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
            s.remove(&key);
        }
    });
    None
}

/// Dựng định dạng cho khoá `key` từ bản sao các tệp TeX của `cwd`. Ok(true) = đã có định dạng mới.
pub fn build(dir: &Path, key: &str, cwd: &Path, names: &[String], main_name: &str, tex_bin: &Option<String>, support_dir: &Option<PathBuf>) -> Result<bool, String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let work = dir.join(format!("tmp-{key}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&work);
    let res = (|| -> Result<bool, String> {
        for n in names {
            let dest = work.join(n);
            if let Some(p) = dest.parent() {
                fs::create_dir_all(p).map_err(|e| e.to_string())?;
            }
            fs::copy(cwd.join(n), &dest).map_err(|e| e.to_string())?;
        }
        if !work.join(main_name).is_file() {
            return Ok(false);
        }
        let mut c = super::engine_command(tex_bin, "pdflatex", support_dir, &work);
        c.args(["-ini", "-interaction=nonstopmode", "-halt-on-error", "-no-shell-escape", "-recorder"]).arg(format!("-jobname={JOB}")).args(["&pdflatex", "mylatexformat.ltx"]).arg(main_name);
        let r = run_job(&mut c, Duration::from_secs(120), &NEVER).map_err(|e| e.to_string())?;
        let built = work.join(format!("{JOB}.fmt"));
        if !r.success || r.timed_out || !built.is_file() {
            let _ = fs::write(dir.join(format!("{key}.fail")), b"");
            return Ok(false);
        }
        let fls = fs::read_to_string(work.join(format!("{JOB}.fls"))).unwrap_or_default();
        let (inside, outside) = parse_fls(&fls, &work);
        let mut deps = Vec::new();
        for rel in inside {
            if rel.eq_ignore_ascii_case(main_name) || rel.starts_with(&format!("{JOB}.")) {
                continue; // tệp chính: phần đầu đã nằm trong khoá; phần thân đổi thoải mái
            }
            let sha = sha256_file(&work.join(&rel)).map_err(|e| e.to_string())?;
            deps.push((format!("rel:{rel}"), sha));
        }
        for abs in outside {
            if let Some(s) = stat_sig(&abs) {
                deps.push((format!("abs:{}", abs.to_string_lossy()), s));
            }
        }
        let n = (0..100).find(|i| !dir.join(format!("{key}-{i}.json")).exists()).unwrap_or(99);
        let stem = dir.join(format!("{key}-{n}"));
        fs::rename(&built, stem.with_extension("fmt")).map_err(|e| e.to_string())?;
        let part = stem.with_extension("json.part");
        fs::write(&part, serde_json::to_vec(&Manifest { deps }).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        fs::rename(&part, stem.with_extension("json")).map_err(|e| e.to_string())?;
        Ok(true)
    })();
    let _ = fs::remove_dir_all(&work);
    prune(dir, KEEP);
    res
}

/// Định dạng `fmt` làm hỏng lần dịch (dịch kiểu cũ thì được): bỏ nó và đánh dấu không dựng lại cho khoá này.
pub fn discard(fmt: &Path) {
    let _ = fs::remove_file(fmt);
    let _ = fs::remove_file(fmt.with_extension("json"));
    if let (Some(dir), Some(stem)) = (fmt.parent(), fmt.file_stem()) {
        let key = stem.to_string_lossy();
        let key = key.rsplit_once('-').map(|(k, _)| k).unwrap_or(&key);
        let _ = fs::write(dir.join(format!("{key}.fail")), b"");
    }
}

/// Giữ `keep` định dạng dùng gần nhất.
pub fn prune(dir: &Path, keep: usize) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    let mut v: Vec<(SystemTime, PathBuf)> = rd.flatten().map(|e| e.path()).filter(|p| p.extension().map(|x| x == "fmt").unwrap_or(false)).map(|p| (fs::metadata(&p).and_then(|m| m.modified()).unwrap_or(UNIX_EPOCH), p)).collect();
    if v.len() <= keep {
        return;
    }
    v.sort_by_key(|x| std::cmp::Reverse(x.0));
    for (_, p) in v.into_iter().skip(keep) {
        let _ = fs::remove_file(&p);
        let _ = fs::remove_file(p.with_extension("json"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn phan_dau_chi_lay_truoc_begin_document_that() {
        let t = "\\documentclass{book}\n\\input{khaibaochung}\n%\\begin{document} trong chú thích\n\\begin{document}\nThân\n\\end{document}\n";
        assert_eq!(preamble_of(t), Some("\\documentclass{book}\n\\input{khaibaochung}\n%\\begin{document} trong chú thích\n"));
        assert_eq!(preamble_of("\\documentclass{x}\\begin{document}a"), Some("\\documentclass{x}"));
        assert_eq!(preamble_of("% \\documentclass{x}\n\\begin{document}"), None, "documentclass bị chú thích");
        assert_eq!(preamble_of("\\begin{ex}x\\end{ex}"), None, "tệp chỉ có dữ liệu");
        assert_eq!(preamble_of("\\documentclass{x}\n\\typeout{\\jobname}\n\\begin{document}"), None);
        assert_eq!(preamble_of("%&pre\n\\documentclass{x}\n\\begin{document}"), None);
        assert_eq!(preamble_of("\\documentclass{x}\n50\\% lãi\n\\begin{document}"), Some("\\documentclass{x}\n50\\% lãi\n"));
    }

    #[test]
    fn khoa_doi_khi_phan_dau_ten_tep_hay_phien_ban_doi() {
        let n = vec!["khaibaochung.tex".to_string(), "main.tex".to_string()];
        let k = prekey("\\documentclass{x}", "TeX 1", &n);
        assert_eq!(k, prekey("\\documentclass{x}", "TeX 1", &n));
        assert_ne!(k, prekey("\\documentclass{y}", "TeX 1", &n));
        assert_ne!(k, prekey("\\documentclass{x}", "TeX 2", &n));
        let mut n2 = n.clone();
        n2.push("hedu-goithem.tex".into());
        assert_ne!(k, prekey("\\documentclass{x}", "TeX 1", &n2), "thêm tệp (\\IfFileExists) ⇒ khoá khác");
    }

    #[test]
    fn chi_dem_tep_tex_dang_chu_khong_dem_tep_ket_qua() {
        let d = crate::testutil::dir("examfmt-tep");
        let _ = fs::remove_dir_all(&d);
        for f in ["main.tex", "hedu.sty", "a/b.tex", "hedu-out.aux", "hedu-out.log", "hinh.png", "hedu-fmt.fls", "x.cls"] {
            let p = d.join(f);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(p, b"x").unwrap();
        }
        assert_eq!(tex_files(&d), vec!["a/b.tex", "hedu.sty", "main.tex", "x.cls"]);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn doc_fls_tach_tep_trong_de_va_tep_tex_live() {
        let work = Path::new("D:/x/cache/exam-fmt/tmp-k-1");
        let fls = "PWD D:/x/cache/exam-fmt/tmp-k-1\nINPUT d:/texlive/2026/texmf-dist/tex/latex/base/book.cls\nINPUT ./khaibaochung.tex\nINPUT khaibaochung.tex\nINPUT D:\\x\\cache\\exam-fmt\\tmp-k-1\\Sub\\Hedu.sty\nOUTPUT hedu-fmt.log\nINPUT ./main.tex\n";
        let (inside, outside) = parse_fls(fls, work);
        assert_eq!(inside, vec!["khaibaochung.tex", "Sub/Hedu.sty", "main.tex"]);
        assert_eq!(outside, vec![PathBuf::from("d:/texlive/2026/texmf-dist/tex/latex/base/book.cls")]);
    }

    #[test]
    fn tep_phu_thuoc_doi_thi_khong_dung_dinh_dang() {
        let d = crate::testutil::dir("examfmt-deps");
        let _ = fs::remove_dir_all(&d);
        let (cwd, cache) = (d.join("work"), d.join("cache"));
        fs::create_dir_all(&cwd).unwrap();
        fs::create_dir_all(&cache).unwrap();
        fs::write(cwd.join("khaibaochung.tex"), b"\\usepackage{a}").unwrap();
        let sys = d.join("he-thong.sty");
        fs::write(&sys, b"he thong").unwrap();
        let m = Manifest { deps: vec![("rel:khaibaochung.tex".into(), sha256_file(&cwd.join("khaibaochung.tex")).unwrap()), (format!("abs:{}", sys.to_string_lossy()), stat_sig(&sys).unwrap())] };
        fs::write(cache.join("k-0.json"), serde_json::to_vec(&m).unwrap()).unwrap();
        fs::write(cache.join("k-0.fmt"), b"fmt").unwrap();
        assert_eq!(lookup(&cache, "k", &cwd), Some(cache.join("k-0.fmt")));
        assert_eq!(lookup(&cache, "khac", &cwd), None);
        fs::write(cwd.join("khaibaochung.tex"), b"\\usepackage{b}").unwrap();
        assert_eq!(lookup(&cache, "k", &cwd), None, "tệp của đề đổi ⇒ không dùng");
        fs::write(cwd.join("khaibaochung.tex"), b"\\usepackage{a}").unwrap();
        assert!(lookup(&cache, "k", &cwd).is_some());
        fs::write(&sys, b"he thong da cap nhat").unwrap();
        assert_eq!(lookup(&cache, "k", &cwd), None, "gói TeX Live đổi ⇒ không dùng");
        discard(&cache.join("k-0.fmt"));
        assert!(!cache.join("k-0.fmt").exists() && cache.join("k.fail").exists());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn don_bot_giu_dinh_dang_moi_nhat() {
        let d = crate::testutil::dir("examfmt-prune");
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        for i in 0..5 {
            let p = d.join(format!("k{i}-0.fmt"));
            fs::write(&p, b"f").unwrap();
            fs::write(p.with_extension("json"), b"{}").unwrap();
            fs::File::options().append(true).open(&p).unwrap().set_modified(UNIX_EPOCH + Duration::from_secs(1000 + i)).unwrap();
        }
        prune(&d, 2);
        let mut left: Vec<String> = fs::read_dir(&d).unwrap().flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect();
        left.sort();
        assert_eq!(left, vec!["k3-0.fmt", "k3-0.json", "k4-0.fmt", "k4-0.json"]);
        let _ = fs::remove_dir_all(&d);
    }
}
