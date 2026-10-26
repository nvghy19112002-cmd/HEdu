//! E5: nguồn gốc câu hỏi trong đề (provenance). Khi câu được chép NGUYÊN VĂN từ Ngân hàng câu hỏi vào một đề, HEdu ghi vào sổ riêng của dự án
//! (`.hedu/sources.json`): UID, nhãn ID để tham khảo, đoạn LaTeX lúc chép, dấu vân SHA-256 và tệp chứa nó. KHÔNG chèn dấu hiệu lạ vào LaTeX.
//! Không tự đồng bộ: ngân hàng đổi sau đó thì đề giữ nguyên; giao diện chỉ báo "Có thể đã đổi" và cho so sánh/thay thủ công.
//! Không đụng schema 3, ID6, UID, hedu.db.
#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use crate::examfiles::WRITE_GATE;
use crate::examlib::{atomic_write, bad_rel, copy_scanned, fingerprint, index_upsert, is_link, iso_now, new_id, open_inside, projects_dir, read_manifest, summary_of, write_manifest, Compile, FileRec, Manifest, Meta, ScanFile, Source, Summary};

const MAX_ITEMS: usize = 5000;
const MAX_LATEX: usize = 200 * 1024;
const MAX_DOC: u64 = 20 * 1024 * 1024;
const MAX_FILE: usize = 20 * 1024 * 1024;
const MAX_TOTAL: usize = 100 * 1024 * 1024;

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SourceIn {
    pub uid: String,
    /// ID (mã CT 2018) lúc chép, chỉ để hiển thị tham khảo
    pub label: String,
    pub latex: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SourceItem {
    pub uid: String,
    pub label: String,
    pub rel: String,
    pub sha256: String,
    pub latex: String,
    pub added_at: String,
}

#[derive(Serialize, Deserialize, Debug, Default)]
struct Doc {
    version: u32,
    items: Vec<SourceItem>,
}

fn sha_hex(b: &[u8]) -> String {
    Sha256::digest(b).iter().map(|x| format!("{x:02x}")).collect()
}

/// Chuẩn hoá xuống dòng để so khớp (tệp có thể là CRLF còn đoạn chép từ ngân hàng là LF).
fn norm(s: &str) -> String {
    s.replace("\r\n", "\n")
}

fn read_doc(dir: &Path) -> Result<Doc, String> {
    let mut b = Vec::new();
    match open_inside(dir, ".hedu/sources.json") {
        Ok(h) => {
            if h.metadata().map(|m| m.len() > MAX_DOC).unwrap_or(true) {
                return Err("Sổ nguồn câu hỏi quá lớn hoặc không đọc được.".into());
            }
            h.take(MAX_DOC).read_to_end(&mut b).map_err(|e| e.to_string())?;
        }
        Err(_) => {
            return match fs::symlink_metadata(dir.join(".hedu/sources.json")) {
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Doc { version: 1, items: vec![] }),
                _ => Err("Sổ nguồn câu hỏi không đọc an toàn được (liên kết hoặc lỗi).".into()),
            };
        }
    }
    serde_json::from_slice(&b).map_err(|e| format!("Sổ nguồn câu hỏi hỏng: {e}"))
}

fn write_doc(dir: &Path, d: &Doc) -> Result<(), String> {
    let hd = dir.join(".hedu");
    fs::create_dir_all(&hd).map_err(|e| e.to_string())?;
    if fs::symlink_metadata(&hd).map(|m| is_link(&m)).unwrap_or(true) {
        return Err("Thư mục .hedu là liên kết nên không ghi (an toàn).".into());
    }
    atomic_write(&hd.join("sources.json"), &serde_json::to_vec_pretty(d).map_err(|e| e.to_string())?).map_err(|e| format!("Không ghi được sổ nguồn: {e}"))
}

fn check_in(rel: &str, items: &[SourceIn]) -> Result<(), String> {
    if let Some(r) = bad_rel(rel) {
        return Err(format!("Đường dẫn không hợp lệ: {r}"));
    }
    for i in items {
        if i.uid.trim().is_empty() || i.uid.len() > 200 || i.label.len() > 100 || i.latex.is_empty() || i.latex.len() > MAX_LATEX {
            return Err("Một câu có UID/nhãn/LaTeX không hợp lệ hoặc quá lớn.".into());
        }
    }
    Ok(())
}

fn merge(doc: &mut Doc, rel: &str, items: &[SourceIn]) -> Result<usize, String> {
    let mut added = 0;
    for i in items {
        let sha = sha_hex(norm(&i.latex).as_bytes());
        if doc.items.iter().any(|x| x.uid == i.uid && x.rel == rel && x.sha256 == sha) {
            continue; // cùng câu, cùng nội dung, cùng tệp: không ghi lặp
        }
        if doc.items.len() >= MAX_ITEMS {
            return Err(format!("Sổ nguồn đã đạt {MAX_ITEMS} mục."));
        }
        doc.items.push(SourceItem { uid: i.uid.clone(), label: i.label.clone(), rel: rel.to_string(), sha256: sha, latex: norm(&i.latex), added_at: iso_now() });
        added += 1;
    }
    Ok(added)
}

/// Ghi nhận các câu vừa được chép nguyên văn vào tệp `rel` của đề. Chỉ ghi sổ, KHÔNG sửa tệp.
pub fn sources_add(lib: &Path, id: &str, rel: &str, items: &[SourceIn]) -> Result<usize, String> {
    check_in(rel, items)?;
    let _g = WRITE_GATE.lock().unwrap_or_else(|e| e.into_inner());
    read_manifest(lib, id)?;
    let dir = projects_dir(lib).join(id);
    let mut doc = read_doc(&dir)?;
    let n = merge(&mut doc, rel, items)?;
    if n > 0 {
        write_doc(&dir, &doc)?;
    }
    Ok(n)
}

pub fn sources_list(lib: &Path, id: &str) -> Result<Vec<SourceItem>, String> {
    read_manifest(lib, id)?;
    Ok(read_doc(&projects_dir(lib).join(id))?.items)
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SourceStatus {
    pub item: SourceItem,
    /// verbatim = còn y nguyên trong tệp · changed = có vẻ đã bị sửa (còn dòng đầu) · missing = không còn thấy (đã xoá/đổi nhiều/tệp mất)
    pub state: String,
}

/// Tối đa 6 dòng đặc trưng của đoạn (bỏ dòng mở/đóng môi trường vì mọi câu đều có), để nhận ra câu bị sửa một phần.
fn distinct_lines(latex: &str) -> Vec<&str> {
    latex.lines().map(str::trim).filter(|l| l.len() >= 4 && !l.starts_with("\\begin{") && !l.starts_with("\\end{")).take(6).collect()
}

/// Đoạn chép từ ngân hàng còn nguyên văn trong tệp không? Chỉ đọc.
pub fn sources_status(lib: &Path, id: &str) -> Result<Vec<SourceStatus>, String> {
    read_manifest(lib, id)?;
    let dir = projects_dir(lib).join(id);
    let doc = read_doc(&dir)?;
    let mut cache: std::collections::HashMap<String, Option<String>> = std::collections::HashMap::new();
    let mut out = Vec::new();
    for item in doc.items {
        let text = cache
            .entry(item.rel.clone())
            .or_insert_with(|| {
                let mut b = Vec::new();
                open_inside(&dir, &item.rel).ok().and_then(|h| h.take(MAX_DOC).read_to_end(&mut b).ok()).and_then(|_| String::from_utf8(b).ok()).map(|t| norm(&t))
            })
            .clone();
        let state = match text {
            None => "missing",
            Some(t) if t.contains(&item.latex) => "verbatim",
            Some(t) => {
                // còn ít nhất một nửa số dòng đặc trưng ⇒ nhiều khả năng là câu này đã bị sửa; ít hơn ⇒ coi như đã mất
                let d = distinct_lines(&item.latex);
                let found = d.iter().filter(|l| t.contains(**l)).count();
                if !d.is_empty() && found * 2 >= d.len() && found > 0 { "changed" } else { "missing" }
            }
        };
        out.push(SourceStatus { item, state: state.into() });
    }
    Ok(out)
}

/// Bỏ một liên kết nguồn (đề không đổi). Dùng khi giáo viên chủ động bỏ câu ra khỏi đề.
pub fn sources_forget(lib: &Path, id: &str, uid: &str, rel: &str, sha256: &str) -> Result<usize, String> {
    let _g = WRITE_GATE.lock().unwrap_or_else(|e| e.into_inner());
    read_manifest(lib, id)?;
    let dir = projects_dir(lib).join(id);
    let mut doc = read_doc(&dir)?;
    let before = doc.items.len();
    doc.items.retain(|x| !(x.uid == uid && x.rel == rel && x.sha256 == sha256));
    let n = before - doc.items.len();
    if n > 0 {
        write_doc(&dir, &doc)?;
    }
    Ok(n)
}

#[derive(Deserialize, Debug, Clone)]
pub struct FileIn {
    pub path: String,
    pub text: String,
}

/// Tạo một đề MỚI trong thư viện từ các tệp cho trước (vd. main.tex + khaibaochung.tex + cauhoi.tex do HEdu dựng từ các câu đã chọn)
/// và ghi sổ nguồn cho `sources_rel`. Câu hỏi được chép NGUYÊN VĂN do phía gọi cung cấp; ở đây không phân tích lại LaTeX.
pub fn create_project(lib: &Path, name: &str, files: &[FileIn], main: &str, sources_rel: &str, sources: &[SourceIn]) -> Result<Summary, String> {
    if files.is_empty() || files.iter().map(|f| f.text.len()).sum::<usize>() > MAX_TOTAL || files.iter().any(|f| f.text.len() > MAX_FILE) {
        return Err("Danh sách tệp rỗng hoặc quá lớn.".into());
    }
    let mut seen = std::collections::HashSet::new();
    for f in files {
        if let Some(r) = bad_rel(&f.path) {
            return Err(format!("Tên tệp '{}' không hợp lệ: {r}", f.path));
        }
        if f.path.split('/').next() == Some(".hedu") || !seen.insert(f.path.to_lowercase()) {
            return Err(format!("Tên tệp '{}' trùng hoặc dành riêng.", f.path));
        }
    }
    if !files.iter().any(|f| f.path == main) || !main.to_lowercase().ends_with(".tex") {
        return Err("Tệp chính phải là một tệp .tex trong danh sách.".into());
    }
    if !sources.is_empty() {
        check_in(sources_rel, sources)?;
    }
    let _g = WRITE_GATE.lock().unwrap_or_else(|e| e.into_inner());
    let id = loop {
        let c = new_id(name);
        if !projects_dir(lib).join(&c).exists() {
            break c;
        }
    };
    let staging = projects_dir(lib).join(format!(".staging-{id}"));
    let result = (|| -> Result<Manifest, String> {
        fs::create_dir_all(&staging).map_err(|e| format!("Không tạo được thư mục thư viện: {e}"))?;
        let mut recs: Vec<FileRec> = Vec::new();
        for f in files {
            let dest = staging.join(&f.path);
            if let Some(p) = dest.parent() {
                fs::create_dir_all(p).map_err(|e| e.to_string())?;
            }
            fs::write(&dest, f.text.as_bytes()).map_err(|e| format!("Không ghi được {}: {e}", f.path))?;
            recs.push(FileRec { rel: f.path.clone(), bytes: f.text.len() as u64, sha256: sha_hex(f.text.as_bytes()) });
        }
        if !sources.is_empty() {
            let mut doc = Doc { version: 1, items: vec![] };
            merge(&mut doc, sources_rel, sources)?;
            write_doc(&staging, &doc)?;
        }
        let now = iso_now();
        let nm: String = name.chars().filter(|c| !c.is_control()).collect::<String>().trim().chars().take(120).collect();
        Ok(Manifest {
            manifest_version: 1,
            project_id: id.clone(),
            name: if nm.is_empty() { "Đề từ ngân hàng câu hỏi".into() } else { nm },
            kind: if files.len() > 1 { "multi".into() } else { "single".into() },
            main_file: Some(main.to_string()),
            created_at: now.clone(),
            updated_at: now,
            metadata: Meta::default(),
            status: "draft".into(),
            compile: Compile { engine: "pdflatex".into(), timeout_secs: 120, runs: 2 },
            source: Source { mode: "created".into(), original_path_display: String::new(), fingerprint: fingerprint(&recs) },
            files: recs,
            skipped: vec![],
            warnings: vec![],
            folder: None,
        })
    })();
    let m = match result {
        Ok(m) => m,
        Err(e) => {
            let _ = fs::remove_dir_all(&staging);
            return Err(e);
        }
    };
    if let Err(e) = write_manifest(&staging, &m) {
        let _ = fs::remove_dir_all(&staging);
        return Err(e);
    }
    if let Err(e) = fs::rename(&staging, projects_dir(lib).join(&id)) {
        let _ = fs::remove_dir_all(&staging);
        return Err(format!("Không hoàn tất được dự án: {e}"));
    }
    let s = summary_of(&m);
    index_upsert(lib, s.clone());
    Ok(s)
}

// ---------- lệnh Tauri ----------

use tauri::{AppHandle, Manager};

fn lib_of(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map(|d| d.join("exam-library")).map_err(|e| e.to_string())
}
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn exam_sources_add(app: AppHandle, id: String, rel: String, items: Vec<SourceIn>) -> Result<usize, String> {
    let lib = lib_of(&app)?;
    blocking(move || sources_add(&lib, &id, &rel, &items)).await
}
#[tauri::command]
pub async fn exam_sources_status(app: AppHandle, id: String) -> Result<Vec<SourceStatus>, String> {
    let lib = lib_of(&app)?;
    blocking(move || sources_status(&lib, &id)).await
}
#[tauri::command]
pub async fn exam_sources_forget(app: AppHandle, id: String, uid: String, rel: String, sha256: String) -> Result<usize, String> {
    let lib = lib_of(&app)?;
    blocking(move || sources_forget(&lib, &id, &uid, &rel, &sha256)).await
}
#[tauri::command]
pub async fn exam_lib_create_files(app: AppHandle, name: String, files: Vec<FileIn>, main: String, sources_rel: String, sources: Vec<SourceIn>) -> Result<Summary, String> {
    let lib = lib_of(&app)?;
    blocking(move || create_project(&lib, &name, &files, &main, &sources_rel, &sources)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::examlib;

    fn tmp(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("hedu-es-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
    fn si(uid: &str, latex: &str) -> SourceIn {
        SourceIn { uid: uid.into(), label: "2D1H1-1".into(), latex: latex.into() }
    }
    fn fi(p: &str, t: &str) -> FileIn {
        FileIn { path: p.into(), text: t.into() }
    }
    const Q1: &str = "\\begin{ex}\nCho $x^2$.\n\\choice{1}{\\True 2}{3}{4}\n\\loigiai{x}\n\\end{ex}";
    const Q2: &str = "\\begin{ex}\nCâu hai.\n\\end{ex}";

    #[test]
    fn tao_de_tu_cac_cau_nguyen_van_va_ghi_so_nguon() {
        let d = tmp("create");
        let lib = d.join("lib");
        let cauhoi = format!("{Q1}\n\n{Q2}\n");
        let s = create_project(&lib, "Đề từ ngân hàng", &[fi("main.tex", "\\input{cauhoi}\n"), fi("cauhoi.tex", &cauhoi)], "main.tex", "cauhoi.tex", &[si("u1", Q1), si("u2", Q2)]).unwrap();
        assert_eq!((s.kind.as_str(), s.main_file.as_deref(), s.file_count, s.status.as_str()), ("multi", Some("main.tex"), 2, "draft"));
        assert_eq!(fs::read_to_string(projects_dir(&lib).join(&s.id).join("cauhoi.tex")).unwrap(), cauhoi, "chép nguyên văn");
        assert!(examlib::verify(&lib, &s.id).unwrap().ok);
        let st = sources_status(&lib, &s.id).unwrap();
        assert_eq!(st.len(), 2);
        assert!(st.iter().all(|x| x.state == "verbatim" && x.item.rel == "cauhoi.tex"));
        assert!(!cauhoi.contains("uid") && !cauhoi.contains("u1"), "không chèn dấu hiệu lạ vào LaTeX");
        assert_eq!(examlib::list(&lib).len(), 1);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn tu_choi_tep_xau_va_khong_de_lai_du_an_do() {
        let d = tmp("bad");
        let lib = d.join("lib");
        for files in [vec![], vec![fi("../x.tex", "a")], vec![fi("main.tex", "a"), fi("MAIN.tex", "b")], vec![fi(".hedu/x.tex", "a")], vec![fi("CON.tex", "a")], vec![fi("a.tex", "a")]] {
            assert!(create_project(&lib, "x", &files, "main.tex", "main.tex", &[]).is_err());
        }
        assert!(create_project(&lib, "x", &[fi("main.tex", "a")], "main.tex", "main.tex", &[si("", "x")]).is_err(), "UID rỗng");
        assert!(create_project(&lib, "x", &[fi("main.tex", "a")], "main.tex", "../x", &[si("u", "x")]).is_err());
        assert!(!projects_dir(&lib).exists() || fs::read_dir(projects_dir(&lib)).unwrap().count() == 0, "không để lại thư mục dở");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn nguon_phat_hien_cau_bi_sua_hoac_mat_khong_tu_dong_bo() {
        let d = tmp("status");
        let lib = d.join("lib");
        let s = create_project(&lib, "Đề", &[fi("main.tex", "x\n"), fi("cauhoi.tex", &format!("{Q1}\n\n{Q2}\n"))], "main.tex", "cauhoi.tex", &[si("u1", Q1), si("u2", Q2)]).unwrap();
        let p = projects_dir(&lib).join(&s.id).join("cauhoi.tex");
        // sửa câu 1 (còn dòng đầu), xoá hẳn câu 2
        fs::write(&p, format!("{}\n", Q1.replace("Cho $x^2$.", "Cho $x^3$."))).unwrap();
        let st = sources_status(&lib, &s.id).unwrap();
        assert_eq!(st.iter().map(|x| (x.item.uid.as_str(), x.state.as_str())).collect::<Vec<_>>(), vec![("u1", "changed"), ("u2", "missing")]);
        // CRLF không làm báo nhầm
        fs::write(&p, format!("{Q1}\n\n{Q2}\n").replace('\n', "\r\n")).unwrap();
        assert!(sources_status(&lib, &s.id).unwrap().iter().all(|x| x.state == "verbatim"));
        // tệp mất
        fs::remove_file(&p).unwrap();
        assert!(sources_status(&lib, &s.id).unwrap().iter().all(|x| x.state == "missing"));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn them_nguon_khong_ghi_lap_va_bo_lien_ket() {
        let d = tmp("add");
        let lib = d.join("lib");
        let s = create_project(&lib, "Đề", &[fi("main.tex", "x\n")], "main.tex", "main.tex", &[]).unwrap();
        assert_eq!(sources_add(&lib, &s.id, "main.tex", &[si("u1", Q1)]).unwrap(), 1);
        assert_eq!(sources_add(&lib, &s.id, "main.tex", &[si("u1", Q1), si("u3", Q2)]).unwrap(), 1, "u1 cùng nội dung không ghi lặp");
        assert_eq!(sources_add(&lib, &s.id, "main.tex", &[si("u1", &format!("{Q1}\n%sửa"))]).unwrap(), 1, "cùng UID nhưng nội dung khác là một lần chép khác");
        let l = sources_list(&lib, &s.id).unwrap();
        assert_eq!(l.len(), 3);
        assert_eq!(sources_forget(&lib, &s.id, "u3", "main.tex", &l.iter().find(|x| x.uid == "u3").unwrap().sha256).unwrap(), 1);
        assert_eq!(sources_list(&lib, &s.id).unwrap().len(), 2);
        assert!(sources_add(&lib, &s.id, "../x", &[si("u", "x")]).is_err());
        assert!(sources_add(&lib, "../..", "main.tex", &[si("u", "x")]).is_err());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn so_nguon_hong_khong_bi_ghi_de_am_tham() {
        let d = tmp("corrupt");
        let lib = d.join("lib");
        let s = create_project(&lib, "Đề", &[fi("main.tex", "x\n")], "main.tex", "main.tex", &[si("u1", Q1)]).unwrap();
        let sp = projects_dir(&lib).join(&s.id).join(".hedu/sources.json");
        fs::write(&sp, b"{hong").unwrap();
        assert!(sources_status(&lib, &s.id).is_err());
        assert!(sources_add(&lib, &s.id, "main.tex", &[si("u2", Q2)]).is_err(), "sổ hỏng thì không ghi thêm, tránh mất dữ liệu");
        assert_eq!(fs::read(&sp).unwrap(), b"{hong");
        let _ = fs::remove_dir_all(&d);
    }

    #[cfg(windows)]
    #[test]
    fn so_nguon_la_junction_thi_khong_doc_khong_ghi() {
        let d = tmp("junc");
        let lib = d.join("lib");
        let s = create_project(&lib, "Đề", &[fi("main.tex", "x\n")], "main.tex", "main.tex", &[si("u1", Q1)]).unwrap();
        let hedu = projects_dir(&lib).join(&s.id).join(".hedu");
        let ngoai = d.join("ngoai");
        fs::create_dir_all(&ngoai).unwrap();
        fs::write(ngoai.join("sources.json"), b"{\"version\":1,\"items\":[]}").unwrap();
        // thay cả .hedu bằng junction ra ngoài
        fs::remove_dir_all(&hedu).unwrap();
        let fix = |p: &Path| p.to_string_lossy().replace('/', "\\");
        let ok = std::process::Command::new("cmd").args(["/C", "mklink", "/J", &fix(&hedu), &fix(&ngoai)]).output().map(|o| o.status.success()).unwrap_or(false);
        assert!(ok, "phải tạo được junction để kiểm");
        assert!(sources_list(&lib, &s.id).is_err());
        assert!(sources_add(&lib, &s.id, "main.tex", &[si("u2", Q2)]).is_err());
        assert_eq!(fs::read(ngoai.join("sources.json")).unwrap(), b"{\"version\":1,\"items\":[]}", "tệp ngoài không bị ghi");
        let _ = fs::remove_dir(&hedu);
        let _ = fs::remove_dir_all(&d);
    }
}

#[allow(dead_code)]
fn _unused(_: ScanFile) {
    let _ = copy_scanned;
}
