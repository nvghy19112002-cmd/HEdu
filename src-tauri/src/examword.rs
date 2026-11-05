// Xuất đề ra Word (.docx) bằng Pandoc: mã LaTeX ex_test của một mã đề → .docx có công thức là Equation của Word (OMML).
// Cách làm: Pandoc đọc LaTeX, các lệnh ex_test (\choice, \loigiai, …) được khai báo sẵn ở word/pre.tex nên Pandoc tự mở rộng;
// word/filter.lua dựng bố cục đề (khung tên, PHẦN I/II/III, "Câu N.", phương án A–D, ý a)–d), lời giải); word/reference.docx là mẫu kiểu chữ/lề.
// Hình TikZ do giao diện dịch sẵn thành PNG rồi gửi sang (Pandoc không đọc được TikZ).
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

use crate::examlib::{projects_dir, read_manifest};

const PRE: &str = include_str!("word/pre.tex");
const FILTER: &str = include_str!("word/filter.lua");
const REFERENCE: &[u8] = include_bytes!("word/reference.docx");

#[derive(Deserialize)]
pub struct Fig {
    pub name: String,
    pub b64: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordIn {
    pub code: String,
    pub dest_dir: String,
    pub solution: bool,
    pub mark: bool,
    /// nội dung de-<mã>.tex đã thay hình TikZ bằng \includegraphics
    pub body: String,
    pub figures: Vec<Fig>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WordOut {
    pub path: String,
    pub bytes: u64,
    /// các lệnh LaTeX mà Word không hiểu (bị bỏ khi xuất)
    pub warnings: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PandocInfo {
    pub found: bool,
    pub path: String,
    pub version: String,
}

fn b64_decode(s: &str) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(s.len() / 4 * 3);
    let (mut acc, mut bits) = (0u32, 0u32);
    for c in s.bytes() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            b'=' | b'\n' | b'\r' | b' ' => continue,
            _ => return Err("Dữ liệu hình không hợp lệ.".into()),
        } as u32;
        acc = (acc << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    Ok(out)
}

fn safe_name(s: &str) -> String {
    let t: String = s.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').take(40).collect();
    if t.is_empty() { "de".into() } else { t }
}

fn unique_path(dir: &Path, stem: &str, ext: &str) -> PathBuf {
    let first = dir.join(format!("{stem}.{ext}"));
    if !first.exists() {
        return first;
    }
    for n in 2..1000 {
        let p = dir.join(format!("{stem}-{n}.{ext}"));
        if !p.exists() {
            return p;
        }
    }
    dir.join(format!("{stem}-{}.{ext}", std::process::id()))
}

fn warnings_of(stderr: &str) -> Vec<String> {
    let mut v: Vec<String> = stderr.lines().filter_map(|l| l.strip_prefix("HEDU-CANH-BAO ").map(|s| s.trim().to_string())).collect();
    v.sort();
    v.dedup();
    v
}

fn candidates(root: &Path) -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Ok(p) = std::env::var("HEDU_PANDOC") {
        v.push(PathBuf::from(p));
    }
    v.push(root.join("tools").join("pandoc").join("pandoc.exe"));
    if let Ok(exe) = std::env::current_exe() {
        if let Some(d) = exe.parent() {
            v.push(d.join("pandoc").join("pandoc.exe"));
        }
    }
    v.push(PathBuf::from(r"D:\HEdu-tools\pandoc\pandoc.exe"));
    v.push(PathBuf::from("pandoc"));
    v
}

fn run_version(p: &Path) -> Option<String> {
    let mut c = Command::new(p);
    c.arg("--version").stdout(Stdio::piped()).stderr(Stdio::null());
    crate::tikz::hide_console(&mut c);
    let out = c.output().ok()?;
    if !out.status.success() {
        return None;
    }
    String::from_utf8_lossy(&out.stdout).lines().next().map(|s| s.trim().to_string())
}

pub fn find_pandoc(root: &Path) -> Option<(PathBuf, String)> {
    candidates(root).into_iter().find_map(|p| run_version(&p).map(|v| (p, v)))
}

const MISSING: &str = "Chưa có Pandoc để xuất Word. Giải nén Pandoc vào D:\\HEdu-tools\\pandoc (hoặc thư mục tools\\pandoc trong dữ liệu HEdu) rồi thử lại.";

pub fn export_word(root: &Path, lib: &Path, id: &str, inp: &WordIn) -> Result<WordOut, String> {
    let (pandoc, _) = find_pandoc(root).ok_or_else(|| MISSING.to_string())?;
    read_manifest(lib, id)?;
    let proj = projects_dir(lib).join(id);
    let dest = PathBuf::from(&inp.dest_dir);
    if !dest.is_dir() {
        return Err("Thư mục đích không tồn tại.".into());
    }
    let work = root.join(format!("tmp-word-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)));
    fs::create_dir_all(&work).map_err(|e| format!("Không tạo được thư mục tạm: {e}"))?;
    let r = (|| -> Result<WordOut, String> {
        fs::write(work.join("in.tex"), format!("{PRE}{}\n\\end{{document}}\n", inp.body)).map_err(|e| e.to_string())?;
        fs::write(work.join("filter.lua"), FILTER).map_err(|e| e.to_string())?;
        fs::write(work.join("reference.docx"), REFERENCE).map_err(|e| e.to_string())?;
        for f in &inp.figures {
            if f.name.is_empty() || f.name.contains(['/', '\\', ':']) {
                return Err("Tên hình không hợp lệ.".into());
            }
            fs::write(work.join(&f.name), b64_decode(&f.b64)?).map_err(|e| e.to_string())?;
        }
        let mut c = Command::new(&pandoc);
        c.current_dir(&work)
            .args(["-f", "latex", "-t", "docx", "in.tex", "-o", "out.docx", "--lua-filter", "filter.lua", "--reference-doc", "reference.docx", "--wrap=none"])
            .arg(format!("--resource-path={};{}", work.display(), proj.display()))
            .arg("-M").arg(format!("made={}", safe_name(&inp.code)))
            .arg("-M").arg(format!("solution={}", if inp.solution { 1 } else { 0 }))
            .arg("-M").arg(format!("mark={}", if inp.mark { 1 } else { 0 }))
            .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped());
        crate::tikz::hide_console(&mut c);
        let mut child = c.spawn().map_err(|e| format!("Không chạy được Pandoc: {e}"))?;
        let start = Instant::now();
        let mut stderr = String::new();
        loop {
            match child.try_wait() {
                Ok(Some(_)) => break,
                Ok(None) if start.elapsed() > Duration::from_secs(180) => {
                    let _ = child.kill();
                    return Err("Pandoc chạy quá lâu, đã dừng.".into());
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(60)),
                Err(e) => return Err(e.to_string()),
            }
        }
        if let Some(mut e) = child.stderr.take() {
            use std::io::Read;
            let _ = e.read_to_string(&mut stderr);
        }
        let out = work.join("out.docx");
        if !out.is_file() {
            let msg: String = stderr.lines().filter(|l| !l.starts_with("HEDU-CANH-BAO")).take(4).collect::<Vec<_>>().join(" ");
            return Err(format!("Pandoc không tạo được tệp Word. {msg}"));
        }
        let stem = format!("de-{}{}", safe_name(&inp.code), if inp.mark { "-dap-an" } else if inp.solution { "-loi-giai" } else { "" });
        let target = unique_path(&dest, &stem, "docx");
        fs::copy(&out, &target).map_err(|e| format!("Không ghi được tệp Word: {e}"))?;
        let bytes = fs::metadata(&target).map(|m| m.len()).unwrap_or(0);
        Ok(WordOut { path: target.to_string_lossy().into_owned(), bytes, warnings: warnings_of(&stderr) })
    })();
    let _ = fs::remove_dir_all(&work);
    r
}

fn root_of(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn exam_word_info(app: AppHandle) -> Result<PandocInfo, String> {
    let root = root_of(&app)?;
    tauri::async_runtime::spawn_blocking(move || match find_pandoc(&root) {
        Some((p, v)) => PandocInfo { found: true, path: p.to_string_lossy().into_owned(), version: v },
        None => PandocInfo { found: false, path: String::new(), version: String::new() },
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn exam_word_export(app: AppHandle, id: String, input: WordIn) -> Result<WordOut, String> {
    let root = root_of(&app)?;
    let lib = root.join("exam-library");
    tauri::async_runtime::spawn_blocking(move || export_word(&root, &lib, &id, &input)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn giai_ma_base64() {
        assert_eq!(b64_decode("aGVsbG8=").unwrap(), b"hello");
        assert_eq!(b64_decode("aGVs\nbG8h").unwrap(), b"hello!");
        assert!(b64_decode("a$b").is_err());
    }

    #[test]
    fn ten_tep_an_toan_va_khong_ghi_de() {
        assert_eq!(safe_name("../101"), "101");
        assert_eq!(safe_name("???"), "de");
        let d = std::env::temp_dir().join(format!("hedu-word-test-{}", std::process::id()));
        fs::create_dir_all(&d).unwrap();
        let a = unique_path(&d, "de-101", "docx");
        fs::write(&a, b"x").unwrap();
        let b = unique_path(&d, "de-101", "docx");
        assert_ne!(a, b);
        assert!(b.to_string_lossy().ends_with("de-101-2.docx"));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn doc_canh_bao_tu_stderr() {
        let w = warnings_of("x\nHEDU-CANH-BAO lệnh \\foo\nHEDU-CANH-BAO lệnh \\foo\nHEDU-CANH-BAO lệnh \\bar\n");
        assert_eq!(w, vec!["lệnh \\bar".to_string(), "lệnh \\foo".to_string()]);
    }
}
