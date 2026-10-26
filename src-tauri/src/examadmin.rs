//! E4: quản lý thư viện đề: sửa thông tin/thư mục/trạng thái, sao chép (phiên bản mới), Thùng rác đề riêng, sao lưu/khôi phục thư viện đề
//! RIÊNG (không phải hedu.db), xuất/nhập gói dự án. Thiết kế: claude/thiet-ke-de-thi.md (mục 2.3, 2.8).
//! - Mọi tệp đọc qua `open_inside`; mọi thao tác ghi dùng chung cổng với trình soạn (không lưu trong lúc chụp sao lưu).
//! - Sao lưu: chụp nhất quán rồi KIỂM LẠI; có tệp đổi giữa chừng ⇒ huỷ, không báo thành công; bản sao lưu cũ chỉ bị xoá SAU KHI bản mới thành công.
//! - Khôi phục/nhập gói luôn ra dự án MỚI, đối chiếu SHA-256 từng tệp với sổ; sai ⇒ huỷ, không để dự án dở.
//! - Thùng rác đề: chuyển (đổi tên) thư mục, không xoá; xoá vĩnh viễn chỉ áp dụng cho mục ĐÃ ở trong Thùng rác.
#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use crate::examcompile::{files_hash, is_running, last_good};
use crate::examfiles::{list_files, WRITE_GATE};
use crate::examlib::{self, bad_component, copy_scanned, fingerprint, index_remove, index_upsert, is_link, iso_now, new_id, open_inside, projects_dir, read_manifest, sha256_reader, summary_of, valid_id, write_manifest, FileRec, Manifest, Meta, ScanFile, Skip, Source, Summary};

const KEEP_BACKUPS: usize = 5;
const MAX_NAME: usize = 120;

fn trash_dir(lib: &Path) -> PathBuf {
    lib.join("trash")
}
fn backups_dir(lib: &Path) -> PathBuf {
    lib.join("backups")
}

fn real_dir(p: &Path) -> bool {
    fs::symlink_metadata(p).map(|m| !is_link(&m) && m.is_dir()).unwrap_or(false)
}

fn gate() -> std::sync::MutexGuard<'static, ()> {
    WRITE_GATE.lock().unwrap_or_else(|e| e.into_inner())
}

// ---------- thông tin, thư mục, trạng thái ----------

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MetaIn {
    pub name: String,
    pub folder: Option<String>,
    pub grade: Option<u32>,
    pub school_year: Option<String>,
    pub exam_type: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    /// draft | needs_review | finalized
    pub status: String,
}

fn clean(s: &str, max: usize) -> String {
    s.chars().filter(|c| !c.is_control()).collect::<String>().trim().chars().take(max).collect()
}

/// Thư mục ảo: tối đa 4 cấp, mỗi cấp ≤ 60 ký tự, không rỗng, không chứa '/' '\\' ký tự điều khiển.
pub fn check_folder(f: &str) -> Result<String, String> {
    let parts: Vec<String> = f.split('/').map(|p| clean(p, 80)).collect();
    if parts.len() > 4 || parts.iter().any(|p| p.is_empty() || p.chars().count() > 60 || p.contains('\\') || p == "." || p == "..") {
        return Err("Tên thư mục không hợp lệ (tối đa 4 cấp, mỗi cấp 1–60 ký tự, ngăn cấp bằng dấu /).".into());
    }
    Ok(parts.join("/"))
}

pub fn can_finalize(root: &Path, lib: &Path, id: &str, m: &Manifest) -> Result<(), String> {
    let g = last_good(root, id).ok_or("Chưa có PDF biên dịch thành công. Hãy biên dịch và xem PDF trước khi chốt đề.")?;
    let now = files_hash(&m.files.iter().map(|f| (f.rel.clone(), f.sha256.clone())).collect::<Vec<_>>());
    if g.files_hash.is_empty() || g.files_hash != now {
        return Err("Nội dung đề đã đổi kể từ lần biên dịch thành công gần nhất. Hãy biên dịch lại và xem PDF trước khi chốt.".into());
    }
    if !examlib::verify(lib, id)?.ok {
        return Err("Tệp trong thư viện không còn khớp với sổ (đã bị đổi ngoài HEdu). Hãy kiểm tra tệp trước khi chốt.".into());
    }
    Ok(())
}

/// Lưu thông tin đề. Đề đã chốt không đổi trạng thái được nữa (muốn sửa: tạo phiên bản mới); chốt đề cần PDF còn khớp nội dung.
pub fn update_meta(root: &Path, id: &str, inp: &MetaIn) -> Result<Summary, String> {
    let lib = root.join("exam-library");
    let _g = gate();
    let mut m = read_manifest(&lib, id)?;
    let name = clean(&inp.name, MAX_NAME);
    if name.is_empty() {
        return Err("Tên đề không được để trống.".into());
    }
    if let Some(g) = inp.grade {
        if !(1..=12).contains(&g) {
            return Err("Lớp phải từ 1 đến 12.".into());
        }
    }
    if inp.tags.len() > 10 || inp.tags.iter().any(|t| clean(t, 30).is_empty() || t.chars().count() > 30) {
        return Err("Nhãn: tối đa 10 nhãn, mỗi nhãn 1–30 ký tự.".into());
    }
    if !matches!(inp.status.as_str(), "draft" | "needs_review" | "finalized") {
        return Err("Trạng thái không hợp lệ.".into());
    }
    if m.status == "finalized" && inp.status != "finalized" {
        return Err("Đề đã chốt không đổi trạng thái được. Hãy tạo phiên bản mới (Sao chép) để sửa tiếp.".into());
    }
    if m.status != "finalized" && inp.status == "finalized" {
        can_finalize(root, &lib, id, &m)?;
    }
    m.name = name;
    m.folder = match inp.folder.as_deref().map(str::trim).filter(|f| !f.is_empty()) {
        Some(f) => Some(check_folder(f)?),
        None => None,
    };
    m.metadata = Meta {
        grade: inp.grade,
        school_year: inp.school_year.as_deref().map(|s| clean(s, 20)).filter(|s| !s.is_empty()),
        exam_type: inp.exam_type.as_deref().map(|s| clean(s, 30)).filter(|s| !s.is_empty()),
        tags: inp.tags.iter().map(|t| clean(t, 30)).collect(),
    };
    m.status = inp.status.clone();
    m.updated_at = iso_now();
    write_manifest(&projects_dir(&lib).join(id), &m)?;
    let s = summary_of(&m);
    index_upsert(&lib, s.clone());
    Ok(s)
}

// ---------- sao chép (phiên bản mới) ----------

fn unique_new_id(lib: &Path, salt: &str) -> String {
    loop {
        let c = new_id(salt);
        if !projects_dir(lib).join(&c).exists() && !trash_dir(lib).join(&c).exists() {
            return c;
        }
    }
}

fn finish_project(lib: &Path, staging: &Path, id: &str, m: &Manifest) -> Result<Summary, String> {
    if let Err(e) = write_manifest(staging, m) {
        let _ = fs::remove_dir_all(staging);
        return Err(e);
    }
    if let Err(e) = fs::rename(staging, projects_dir(lib).join(id)) {
        let _ = fs::remove_dir_all(staging);
        return Err(format!("Không hoàn tất được dự án: {e}"));
    }
    let s = summary_of(m);
    index_upsert(lib, s.clone());
    Ok(s)
}

/// Sao chép một đề thành dự án mới (trạng thái "đang soạn"); không mang theo bản cũ, bản nháp hay PDF. Đề gốc không đổi.
pub fn duplicate(root: &Path, id: &str, new_name: Option<&str>) -> Result<Summary, String> {
    let lib = root.join("exam-library");
    let _g = gate();
    let old = read_manifest(&lib, id)?;
    let listing = list_files(&lib, id)?;
    let src = projects_dir(&lib).join(id);
    let nid = unique_new_id(&lib, id);
    let staging = projects_dir(&lib).join(format!(".staging-{nid}"));
    fs::create_dir_all(&staging).map_err(|e| format!("Không tạo được thư mục thư viện: {e}"))?;
    let files: Vec<ScanFile> = listing.files.iter().map(|f| ScanFile { rel: f.rel.clone(), bytes: f.bytes }).collect();
    let recs = match copy_scanned(&src, &files, &staging) {
        Ok(r) => r,
        Err(e) => {
            let _ = fs::remove_dir_all(&staging);
            return Err(e);
        }
    };
    // sổ nguồn gốc (UID câu hỏi) đi theo bản sao
    if let Ok(mut h) = open_inside(&src, ".hedu/sources.json") {
        let mut b = Vec::new();
        if h.read_to_end(&mut b).is_ok() {
            let _ = fs::create_dir_all(staging.join(".hedu"));
            let _ = fs::write(staging.join(".hedu/sources.json"), b);
        }
    }
    let now = iso_now();
    let mut skipped = old.skipped.clone();
    skipped.extend(listing.blocked.iter().map(|r| Skip { rel: r.clone(), reason: "liên kết/junction hoặc tên không an toàn: không được sao chép".into() }));
    let m = Manifest {
        manifest_version: 1,
        project_id: nid.clone(),
        name: clean(new_name.unwrap_or(""), MAX_NAME).chars().collect::<String>().trim().to_string().pipe_nonempty().unwrap_or_else(|| clean(&format!("{} (bản sao)", old.name), MAX_NAME)),
        kind: old.kind.clone(),
        main_file: old.main_file.clone(),
        created_at: now.clone(),
        updated_at: now,
        metadata: old.metadata.clone(),
        status: "draft".into(),
        compile: old.compile.clone(),
        source: Source { mode: "duplicated".into(), original_path_display: format!("bản sao của {id}"), fingerprint: fingerprint(&recs) },
        files: recs,
        skipped,
        warnings: old.warnings.clone(),
        folder: old.folder.clone(),
    };
    finish_project(&lib, &staging, &nid, &m)
}

trait PipeNonEmpty {
    fn pipe_nonempty(self) -> Option<String>;
}
impl PipeNonEmpty for String {
    fn pipe_nonempty(self) -> Option<String> {
        if self.is_empty() { None } else { Some(self) }
    }
}

// ---------- Thùng rác đề ----------

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TrashItem {
    pub id: String,
    pub name: String,
    pub deleted_at: String,
    pub file_count: u32,
    pub total_bytes: u64,
}

fn read_manifest_in(dir: &Path, id: &str) -> Result<Manifest, String> {
    if !valid_id(id) || !real_dir(dir) {
        return Err("Không tìm thấy dự án.".into());
    }
    let mut b = Vec::new();
    open_inside(dir, ".hedu/manifest.json")?.take(8 * 1024 * 1024).read_to_end(&mut b).map_err(|e| e.to_string())?;
    serde_json::from_slice(&b).map_err(|e| format!("Manifest hỏng: {e}"))
}

pub fn trash_project(root: &Path, id: &str) -> Result<(), String> {
    let lib = root.join("exam-library");
    if !valid_id(id) {
        return Err("Mã dự án không hợp lệ.".into());
    }
    if is_running(id) {
        return Err("Dự án đang được biên dịch. Hãy dừng biên dịch trước.".into());
    }
    let _g = gate();
    let src = projects_dir(&lib).join(id);
    read_manifest(&lib, id)?;
    let dst = trash_dir(&lib).join(id);
    fs::create_dir_all(trash_dir(&lib)).map_err(|e| format!("Không tạo được Thùng rác đề: {e}"))?;
    if !real_dir(&trash_dir(&lib)) {
        return Err("Thùng rác đề là liên kết nên không dùng (an toàn).".into());
    }
    if dst.exists() {
        return Err("Thùng rác đề đã có mục cùng mã. Hãy xử lý mục đó trước.".into());
    }
    fs::write(src.join(".hedu").join("trashed.json"), serde_json::to_vec(&serde_json::json!({ "at": iso_now() })).unwrap_or_default()).map_err(|e| format!("Không đánh dấu được: {e}"))?;
    fs::rename(&src, &dst).map_err(|e| format!("Không chuyển được vào Thùng rác đề: {e}"))?;
    index_remove(&lib, id);
    Ok(())
}

pub fn trash_list(root: &Path) -> Vec<TrashItem> {
    let lib = root.join("exam-library");
    let mut out = Vec::new();
    if let Ok(rd) = fs::read_dir(trash_dir(&lib)) {
        for e in rd.flatten() {
            let id = e.file_name().to_string_lossy().into_owned();
            let dir = e.path();
            if let Ok(m) = read_manifest_in(&dir, &id) {
                let at = open_inside(&dir, ".hedu/trashed.json").ok().and_then(|mut h| {
                    let mut b = Vec::new();
                    h.read_to_end(&mut b).ok()?;
                    serde_json::from_slice::<serde_json::Value>(&b).ok()?.get("at")?.as_str().map(str::to_string)
                });
                out.push(TrashItem { id, name: m.name, deleted_at: at.unwrap_or_default(), file_count: m.files.len() as u32, total_bytes: m.files.iter().map(|f| f.bytes).sum() });
            }
        }
    }
    out.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at));
    out
}

pub fn trash_restore(root: &Path, id: &str) -> Result<Summary, String> {
    let lib = root.join("exam-library");
    let _g = gate();
    let src = trash_dir(&lib).join(id);
    let m = read_manifest_in(&src, id)?;
    let dst = projects_dir(&lib).join(id);
    if dst.exists() {
        return Err("Đã có dự án cùng mã trong thư viện.".into());
    }
    fs::create_dir_all(projects_dir(&lib)).map_err(|e| e.to_string())?;
    let _ = fs::remove_file(src.join(".hedu").join("trashed.json"));
    fs::rename(&src, &dst).map_err(|e| format!("Không khôi phục được: {e}"))?;
    let s = summary_of(&m);
    index_upsert(&lib, s.clone());
    Ok(s)
}

/// Xoá VĨNH VIỄN một mục đang ở Thùng rác đề (giao diện phải hỏi hai bước). Không bao giờ áp dụng cho dự án còn trong thư viện.
pub fn trash_purge(root: &Path, id: &str) -> Result<(), String> {
    let lib = root.join("exam-library");
    if !valid_id(id) {
        return Err("Mã dự án không hợp lệ.".into());
    }
    let _g = gate();
    let dir = trash_dir(&lib).join(id);
    if !real_dir(&dir) {
        return Err("Mục này không có trong Thùng rác đề.".into());
    }
    fs::remove_dir_all(&dir).map_err(|e| format!("Không xoá được: {e}"))?;
    for sub in ["exam-build", "exam-drafts"] {
        let c = root.join("cache").join(sub).join(id);
        if real_dir(&c) {
            let _ = fs::remove_dir_all(c);
        }
    }
    Ok(())
}

// ---------- gói dự án (xuất/nhập) và khôi phục ----------

/// Nhập một thư mục có sổ `.hedu/manifest.json` (gói xuất hoặc một dự án trong bản sao lưu) thành dự án MỚI. Đối chiếu hash từng tệp trước và sau khi chép.
pub fn restore_from_dir(lib: &Path, src_dir: &Path, label: &str) -> Result<Summary, String> {
    if !real_dir(src_dir) {
        return Err("Nguồn không phải thư mục thường (liên kết/junction không được dùng).".into());
    }
    if let (Ok(a), Ok(b)) = (fs::canonicalize(src_dir), fs::canonicalize(lib.join("projects"))) {
        if a.starts_with(&b) {
            return Err("Nguồn nằm trong thư mục dự án của HEdu. Hãy dùng Sao chép.".into());
        }
    }
    let old = read_manifest_in(src_dir, &read_id_hint(src_dir))?;
    // 1) mọi tệp trong sổ phải có mặt và đúng hash
    for f in &old.files {
        let mut h = open_inside(src_dir, &f.rel).map_err(|e| format!("Gói thiếu/hỏng tệp '{}': {e}", f.rel))?;
        let got = sha256_reader(&mut h).map_err(|e| e.to_string())?;
        if got != f.sha256 {
            return Err(format!("Tệp '{}' trong gói không khớp dấu vân (đã bị sửa hoặc hỏng). Không khôi phục để tránh làm sai đề.", f.rel));
        }
    }
    let _g = gate();
    let nid = unique_new_id(lib, label);
    let staging = projects_dir(lib).join(format!(".staging-{nid}"));
    fs::create_dir_all(&staging).map_err(|e| format!("Không tạo được thư mục thư viện: {e}"))?;
    let files: Vec<ScanFile> = old.files.iter().map(|f| ScanFile { rel: f.rel.clone(), bytes: f.bytes }).collect();
    let recs = match copy_scanned(src_dir, &files, &staging) {
        Ok(r) => r,
        Err(e) => {
            let _ = fs::remove_dir_all(&staging);
            return Err(e);
        }
    };
    if recs.iter().zip(&old.files).any(|(a, b)| a.rel != b.rel || a.sha256 != b.sha256) {
        let _ = fs::remove_dir_all(&staging);
        return Err("Bản chép không khớp sổ của gói. Đã huỷ, không để lại dự án dở.".into());
    }
    if let Ok(mut h) = open_inside(src_dir, ".hedu/sources.json") {
        let mut b = Vec::new();
        if h.read_to_end(&mut b).is_ok() {
            let _ = fs::create_dir_all(staging.join(".hedu"));
            let _ = fs::write(staging.join(".hedu/sources.json"), b);
        }
    }
    let now = iso_now();
    let m = Manifest {
        project_id: nid.clone(),
        name: clean(&format!("{} (khôi phục)", old.name), MAX_NAME),
        created_at: now.clone(),
        updated_at: now,
        status: if old.status == "finalized" { "needs_review".into() } else { old.status.clone() },
        source: Source { mode: "restored".into(), original_path_display: label.to_string(), fingerprint: fingerprint(&recs) },
        files: recs,
        ..old
    };
    finish_project(lib, &staging, &nid, &m)
}

/// Sổ trong thư mục gói không ghi sẵn mã thư mục, nên đọc mã từ chính sổ.
fn read_id_hint(dir: &Path) -> String {
    let mut b = Vec::new();
    if let Ok(mut h) = open_inside(dir, ".hedu/manifest.json") {
        let _ = (&mut h).take(8 * 1024 * 1024).read_to_end(&mut b);
    }
    serde_json::from_slice::<serde_json::Value>(&b).ok().and_then(|v| v.get("projectId")?.as_str().map(str::to_string)).unwrap_or_default()
}

fn unique_dir(parent: &Path, name: &str) -> PathBuf {
    let first = parent.join(name);
    if !first.exists() {
        return first;
    }
    (2..).map(|i| parent.join(format!("{name}-{i}"))).find(|p| !p.exists()).unwrap()
}

/// Xuất một đề thành thư mục gói (tệp nguyên trạng + `.hedu/manifest.json` để nhập lại đủ thông tin). Không ghi đè; không ghi vào trong thư viện.
pub fn export_bundle(root: &Path, id: &str, parent: &Path, name: &str) -> Result<PathBuf, String> {
    let lib = root.join("exam-library");
    if let Some(r) = bad_component(name) {
        return Err(format!("Tên thư mục không hợp lệ: {r}"));
    }
    if !real_dir(parent) {
        return Err("Thư mục đích không tồn tại hoặc là liên kết.".into());
    }
    if let (Ok(a), Ok(b)) = (fs::canonicalize(parent), fs::canonicalize(&lib)) {
        if a.starts_with(&b) {
            return Err("Không xuất vào bên trong thư viện của HEdu. Hãy chọn nơi khác.".into());
        }
    }
    let _g = gate();
    let m = read_manifest(&lib, id)?;
    let listing = list_files(&lib, id)?;
    let dest = unique_dir(parent, name);
    fs::create_dir(&dest).map_err(|e| format!("Không tạo được thư mục: {e}"))?;
    let files: Vec<ScanFile> = listing.files.iter().map(|f| ScanFile { rel: f.rel.clone(), bytes: f.bytes }).collect();
    let r = (|| -> Result<(), String> {
        let recs = copy_scanned(&projects_dir(&lib).join(id), &files, &dest)?;
        let mut out = m.clone();
        out.files = recs;
        write_manifest(&dest, &out)
    })();
    if let Err(e) = r {
        let _ = fs::remove_dir_all(&dest);
        return Err(e);
    }
    Ok(dest)
}

pub fn import_bundle(root: &Path, dir: &Path) -> Result<Summary, String> {
    restore_from_dir(&root.join("exam-library"), dir, &dir.to_string_lossy())
}

// ---------- sao lưu / khôi phục thư viện đề ----------

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupProject {
    pub id: String,
    pub name: String,
    pub files: Vec<FileRec>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupDoc {
    pub version: u32,
    pub created_at: String,
    pub projects: Vec<BackupProject>,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub name: String,
    pub created_at: String,
    pub projects: Vec<(String, String)>,
    pub files: u32,
    pub bytes: u64,
    pub warnings: Vec<String>,
}

fn info_of(name: &str, d: &BackupDoc) -> BackupInfo {
    BackupInfo {
        name: name.to_string(),
        created_at: d.created_at.clone(),
        projects: d.projects.iter().map(|p| (p.id.clone(), p.name.clone())).collect(),
        files: d.projects.iter().map(|p| p.files.len() as u32).sum(),
        bytes: d.projects.iter().flat_map(|p| p.files.iter()).map(|f| f.bytes).sum(),
        warnings: d.warnings.clone(),
    }
}

fn read_backup(lib: &Path, name: &str) -> Result<BackupDoc, String> {
    if bad_component(name).is_some() || name.starts_with('.') {
        return Err("Tên bản sao lưu không hợp lệ.".into());
    }
    let dir = backups_dir(lib).join(name);
    if !real_dir(&dir) {
        return Err("Không tìm thấy bản sao lưu.".into());
    }
    let mut b = Vec::new();
    open_inside(&dir, "backup.json")?.take(64 * 1024 * 1024).read_to_end(&mut b).map_err(|e| e.to_string())?;
    serde_json::from_slice(&b).map_err(|e| format!("Sổ sao lưu hỏng: {e}"))
}

pub fn backup_list(root: &Path) -> Vec<BackupInfo> {
    let lib = root.join("exam-library");
    let mut v: Vec<BackupInfo> = fs::read_dir(backups_dir(&lib))
        .map(|rd| rd.flatten().filter_map(|e| { let n = e.file_name().to_string_lossy().into_owned(); read_backup(&lib, &n).ok().map(|d| info_of(&n, &d)) }).collect())
        .unwrap_or_default();
    v.sort_by(|a, b| b.name.cmp(&a.name));
    v
}

/// Chụp nhất quán toàn bộ thư viện đề vào `backups/<tên>`. `between` chạy sau khi chép xong, trước bước kiểm lại (để kiểm thử chèn thay đổi).
fn backup_create_with(root: &Path, between: impl FnOnce()) -> Result<BackupInfo, String> {
    let lib = root.join("exam-library");
    let _g = gate(); // không ai lưu tệp trong lúc chụp
    fs::create_dir_all(backups_dir(&lib)).map_err(|e| format!("Không tạo được thư mục sao lưu: {e}"))?;
    if !real_dir(&backups_dir(&lib)) {
        return Err("Thư mục sao lưu là liên kết nên không dùng (an toàn).".into());
    }
    // tên tăng dần theo thời gian (đến mili-giây) để thứ tự tên = thứ tự tạo; không tái dùng tên của bản vừa bị dọn trong cùng giây
    let ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.subsec_millis()).unwrap_or(0);
    let stamp = format!("{}{ms:03}", iso_now().replace([':', '-'], "").trim_end_matches('Z'));
    let mut name = stamp.clone();
    let mut n = 2;
    while backups_dir(&lib).join(&name).exists() {
        name = format!("{stamp}-{n}");
        n += 1;
    }
    let staging = backups_dir(&lib).join(format!(".staging-{name}"));
    let _ = fs::remove_dir_all(&staging);
    fs::create_dir_all(staging.join("projects")).map_err(|e| format!("Không tạo được thư mục sao lưu: {e}"))?;
    let fail = |e: String| -> Result<BackupInfo, String> {
        let _ = fs::remove_dir_all(&staging);
        Err(e)
    };
    let mut doc = BackupDoc { version: 1, created_at: iso_now(), projects: vec![], warnings: vec![] };
    let mut snapshot: Vec<(String, Vec<(String, u64)>)> = vec![];
    let ids: Vec<String> = fs::read_dir(projects_dir(&lib)).map(|rd| rd.flatten().map(|e| e.file_name().to_string_lossy().into_owned()).filter(|n| valid_id(n)).collect()).unwrap_or_default();
    for id in ids {
        let m = match read_manifest(&lib, &id) {
            Ok(m) => m,
            Err(e) => {
                doc.warnings.push(format!("Bỏ qua dự án {id} (không đọc được sổ): {e}"));
                continue;
            }
        };
        let listing = match list_files(&lib, &id) {
            Ok(l) => l,
            Err(e) => return fail(e),
        };
        let files: Vec<ScanFile> = listing.files.iter().map(|f| ScanFile { rel: f.rel.clone(), bytes: f.bytes }).collect();
        let dest = staging.join("projects").join(&id);
        let mut recs = match copy_scanned(&projects_dir(&lib).join(&id), &files, &dest) {
            Ok(r) => r,
            Err(e) => return fail(e),
        };
        let mut manifest_copy = m.clone();
        manifest_copy.files = recs.clone();
        if let Err(e) = write_manifest(&dest, &manifest_copy) {
            return fail(e);
        }
        if let Ok(mut h) = open_inside(&projects_dir(&lib).join(&id), ".hedu/sources.json") {
            let mut b = Vec::new();
            if h.read_to_end(&mut b).is_ok() {
                let _ = fs::write(dest.join(".hedu/sources.json"), b);
            }
        }
        if !listing.blocked.is_empty() {
            doc.warnings.push(format!("Dự án “{}”: {} mục là liên kết/junction nên KHÔNG được sao lưu.", m.name, listing.blocked.len()));
        }
        snapshot.push((id.clone(), recs.iter().map(|r| (r.rel.clone(), r.bytes)).collect()));
        recs.sort_by(|a, b| a.rel.cmp(&b.rel));
        doc.projects.push(BackupProject { id, name: m.name, files: recs });
    }
    between();
    // kiểm lại: nguồn hiện tại phải y hệt ảnh chụp (không tệp thêm/bớt/đổi kích thước)
    for (id, was) in &snapshot {
        let now = match list_files(&lib, id) {
            Ok(l) => l,
            Err(e) => return fail(format!("Dự án {id} đổi trong lúc sao lưu: {e}")),
        };
        let mut a: Vec<(String, u64)> = now.files.iter().map(|f| (f.rel.clone(), f.bytes)).collect();
        let mut b = was.clone();
        a.sort();
        b.sort();
        if a != b {
            return fail(format!("Dự án {id} có tệp thay đổi trong lúc sao lưu nên bản sao lưu bị huỷ (không báo thành công giả). Hãy thử lại."));
        }
    }
    let json = match serde_json::to_vec_pretty(&doc) {
        Ok(j) => j,
        Err(e) => return fail(e.to_string()),
    };
    if let Err(e) = examlib::atomic_write(&staging.join("backup.json"), &json) {
        return fail(format!("Không ghi được sổ sao lưu: {e}"));
    }
    if let Err(e) = fs::rename(&staging, backups_dir(&lib).join(&name)) {
        return fail(format!("Không hoàn tất được bản sao lưu: {e}"));
    }
    // chỉ SAU KHI bản mới thành công mới dọn bản cũ
    let mut all = backup_list(root);
    all.sort_by(|a, b| b.name.cmp(&a.name));
    for old in all.iter().skip(KEEP_BACKUPS) {
        if old.name != name {
            // không bao giờ xoá bản vừa tạo, dù thứ tự tên có lệch
            let _ = fs::remove_dir_all(backups_dir(&lib).join(&old.name));
        }
    }
    Ok(info_of(&name, &doc))
}

pub fn backup_create(root: &Path) -> Result<BackupInfo, String> {
    backup_create_with(root, || {})
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupCheck {
    pub ok: bool,
    pub missing: Vec<String>,
    pub changed: Vec<String>,
}

/// Băm lại mọi tệp trong bản sao lưu và so với sổ sao lưu.
pub fn backup_verify(root: &Path, name: &str) -> Result<BackupCheck, String> {
    let lib = root.join("exam-library");
    let doc = read_backup(&lib, name)?;
    let (mut missing, mut changed) = (vec![], vec![]);
    for p in &doc.projects {
        let dir = backups_dir(&lib).join(name).join("projects").join(&p.id);
        for f in &p.files {
            match open_inside(&dir, &f.rel) {
                Ok(mut h) => {
                    if sha256_reader(&mut h).map(|x| x != f.sha256).unwrap_or(true) {
                        changed.push(format!("{}/{}", p.id, f.rel));
                    }
                }
                Err(_) => missing.push(format!("{}/{}", p.id, f.rel)),
            }
        }
    }
    Ok(BackupCheck { ok: missing.is_empty() && changed.is_empty(), missing, changed })
}

/// Khôi phục các dự án đã chọn từ một bản sao lưu thành dự án MỚI (không ghi đè dự án hiện có).
pub fn backup_restore(root: &Path, name: &str, ids: &[String]) -> Result<Vec<Summary>, String> {
    let lib = root.join("exam-library");
    let doc = read_backup(&lib, name)?;
    let mut out = Vec::new();
    for id in ids {
        if !doc.projects.iter().any(|p| &p.id == id) || !valid_id(id) {
            return Err(format!("Bản sao lưu không có dự án {id}."));
        }
        let dir = backups_dir(&lib).join(name).join("projects").join(id);
        out.push(restore_from_dir(&lib, &dir, &format!("sao lưu {name}"))?);
    }
    Ok(out)
}

/// Mở thư mục dự án trong Explorer.
pub fn reveal(root: &Path, id: &str) -> Result<(), String> {
    let lib = root.join("exam-library");
    read_manifest(&lib, id)?;
    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe").arg(projects_dir(&lib).join(id)).spawn().map(|_| ()).map_err(|e| format!("Không mở được Explorer: {e}"))
    }
    #[cfg(not(windows))]
    Err("Chỉ hỗ trợ trên Windows.".into())
}

// ---------- lệnh Tauri ----------

use tauri::{AppHandle, Manager};

fn root_of(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn exam_meta_update(app: AppHandle, id: String, meta: MetaIn) -> Result<Summary, String> {
    let r = root_of(&app)?;
    blocking(move || update_meta(&r, &id, &meta)).await
}
#[tauri::command]
pub async fn exam_duplicate(app: AppHandle, id: String, name: Option<String>) -> Result<Summary, String> {
    let r = root_of(&app)?;
    blocking(move || duplicate(&r, &id, name.as_deref())).await
}
#[tauri::command]
pub async fn exam_trash(app: AppHandle, id: String) -> Result<(), String> {
    let r = root_of(&app)?;
    blocking(move || trash_project(&r, &id)).await
}
#[tauri::command]
pub async fn exam_trash_list(app: AppHandle) -> Result<Vec<TrashItem>, String> {
    let r = root_of(&app)?;
    blocking(move || Ok(trash_list(&r))).await
}
#[tauri::command]
pub async fn exam_trash_restore(app: AppHandle, id: String) -> Result<Summary, String> {
    let r = root_of(&app)?;
    blocking(move || trash_restore(&r, &id)).await
}
#[tauri::command]
pub async fn exam_trash_purge(app: AppHandle, id: String) -> Result<(), String> {
    let r = root_of(&app)?;
    blocking(move || trash_purge(&r, &id)).await
}
#[tauri::command]
pub async fn exam_bundle_export(app: AppHandle, id: String, parent: String, name: String) -> Result<String, String> {
    let r = root_of(&app)?;
    blocking(move || export_bundle(&r, &id, Path::new(&parent), &name).map(|p| p.to_string_lossy().into_owned())).await
}
#[tauri::command]
pub async fn exam_bundle_import(app: AppHandle, path: String) -> Result<Summary, String> {
    let r = root_of(&app)?;
    blocking(move || import_bundle(&r, Path::new(&path))).await
}
#[tauri::command]
pub async fn exam_backup_create(app: AppHandle) -> Result<BackupInfo, String> {
    let r = root_of(&app)?;
    blocking(move || backup_create(&r)).await
}
#[tauri::command]
pub async fn exam_backup_list(app: AppHandle) -> Result<Vec<BackupInfo>, String> {
    let r = root_of(&app)?;
    blocking(move || Ok(backup_list(&r))).await
}
#[tauri::command]
pub async fn exam_backup_verify(app: AppHandle, name: String) -> Result<BackupCheck, String> {
    let r = root_of(&app)?;
    blocking(move || backup_verify(&r, &name)).await
}
#[tauri::command]
pub async fn exam_backup_restore(app: AppHandle, name: String, ids: Vec<String>) -> Result<Vec<Summary>, String> {
    let r = root_of(&app)?;
    blocking(move || backup_restore(&r, &name, &ids)).await
}
#[tauri::command]
pub fn exam_reveal(app: AppHandle, id: String) -> Result<(), String> {
    reveal(&root_of(&app)?, &id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::examcompile::{publish, GoodInfo, MODE_RAW};

    fn tmp(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("hedu-ea-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
    fn put(d: &Path, rel: &str, b: &[u8]) {
        let p = d.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, b).unwrap();
    }
    /// (thư mục tạm, root dữ liệu, id)
    fn proj(tag: &str, name: &str, files: &[(&str, &[u8])]) -> (PathBuf, PathBuf, String) {
        let d = tmp(tag);
        for (r, b) in files {
            put(&d, &format!("src/{r}"), b);
        }
        let root = d.join("root");
        let s = examlib::import(&root.join("exam-library"), &d.join("src"), name, Some("main.tex")).unwrap();
        (d, root, s.id)
    }
    fn add(root: &Path, name: &str, files: &[(&str, &[u8])], d: &Path) -> String {
        let t = d.join(format!("src-{name}"));
        for (r, b) in files {
            put(&t, r, b);
        }
        examlib::import(&root.join("exam-library"), &t, name, Some("main.tex")).unwrap().id
    }
    fn meta(name: &str, status: &str) -> MetaIn {
        MetaIn { name: name.into(), folder: None, grade: None, school_year: None, exam_type: None, tags: vec![], status: status.into() }
    }
    fn on_disk(root: &Path, id: &str, rel: &str) -> Vec<u8> {
        fs::read(projects_dir(&root.join("exam-library")).join(id).join(rel)).unwrap()
    }
    #[cfg(windows)]
    fn mk_junction(link: &Path, target: &Path) -> bool {
        let fix = |p: &Path| p.to_string_lossy().replace('/', "\\");
        std::process::Command::new("cmd").args(["/C", "mklink", "/J", &fix(link), &fix(target)]).output().map(|o| o.status.success()).unwrap_or(false)
    }
    /// ghi một PDF giả "biên dịch thành công" khớp nội dung hiện tại của dự án
    fn fake_good_pdf(root: &Path, id: &str) {
        let lib = root.join("exam-library");
        let m = read_manifest(&lib, id).unwrap();
        let h = files_hash(&m.files.iter().map(|f| (f.rel.clone(), f.sha256.clone())).collect::<Vec<_>>());
        let src = root.join("tam.pdf");
        fs::write(&src, b"%PDF-1.5\nx\n%%EOF\n").unwrap();
        let info = GoodInfo { fingerprint: "f".into(), engine: "pdflatex".into(), mode: MODE_RAW.into(), tex_version: "t".into(), pages: Some(1), bytes: 0, at: iso_now(), pdf_path: String::new(), files_hash: h };
        publish(root, id, &src, &info).unwrap();
    }

    #[test]
    fn sua_thong_tin_kiem_tra_va_cap_nhat_chi_muc() {
        let (d, root, id) = proj("meta", "Đề A", &[("main.tex", b"a\n")]);
        let mut m = meta("  Đề HKI Toán 12  ", "needs_review");
        m.folder = Some("Lớp 12/Học kỳ 1".into());
        m.grade = Some(12);
        m.school_year = Some("2026-2027".into());
        m.tags = vec!["thi thử".into()];
        let s = update_meta(&root, &id, &m).unwrap();
        assert_eq!((s.name.as_str(), s.folder.as_deref(), s.metadata.grade, s.status.as_str()), ("Đề HKI Toán 12", Some("Lớp 12/Học kỳ 1"), Some(12), "needs_review"));
        assert_eq!(examlib::list(&root.join("exam-library"))[0].folder.as_deref(), Some("Lớp 12/Học kỳ 1"));
        for bad in [meta("", "draft"), meta("x", "khac"), MetaIn { grade: Some(13), ..meta("x", "draft") }, MetaIn { folder: Some("a/../b".into()), ..meta("x", "draft") }, MetaIn { folder: Some("a//b".into()), ..meta("x", "draft") }, MetaIn { folder: Some("1/2/3/4/5".into()), ..meta("x", "draft") }, MetaIn { tags: vec!["".into()], ..meta("x", "draft") }, MetaIn { tags: (0..11).map(|i| format!("t{i}")).collect(), ..meta("x", "draft") }] {
            assert!(update_meta(&root, &id, &bad).is_err(), "{bad:?}");
        }
        assert_eq!(read_manifest(&root.join("exam-library"), &id).unwrap().name, "Đề HKI Toán 12", "lỗi không làm đổi gì");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn chot_de_can_pdf_con_khop_va_khong_hoan_tac_duoc() {
        let (d, root, id) = proj("final", "Đề", &[("main.tex", b"a\n")]);
        let lib = root.join("exam-library");
        assert!(update_meta(&root, &id, &meta("Đề", "finalized")).is_err(), "chưa có PDF");
        fake_good_pdf(&root, &id);
        // nội dung đổi sau khi có PDF ⇒ không chốt được
        let f = crate::examfiles::read_text_file(&lib, &id, "main.tex").unwrap();
        crate::examfiles::write_text_file(&lib, &id, "main.tex", "b\n", "lf", false, &f.sha256).unwrap();
        assert!(update_meta(&root, &id, &meta("Đề", "finalized")).unwrap_err().contains("đã đổi"));
        fake_good_pdf(&root, &id);
        let s = update_meta(&root, &id, &meta("Đề", "finalized")).unwrap();
        assert_eq!(s.status, "finalized");
        assert!(update_meta(&root, &id, &meta("Đề", "draft")).is_err(), "không mở chốt");
        assert!(update_meta(&root, &id, &meta("Đề đổi tên", "finalized")).is_ok(), "đổi tên khi đã chốt thì được, vẫn chốt");
        // sao chép từ đề đã chốt ⇒ bản mới là đang soạn
        let dup = duplicate(&root, &id, None).unwrap();
        assert_eq!(dup.status, "draft");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn sao_chep_tao_ban_moi_nguyen_byte_va_khong_dung_ban_goc() {
        let raw = b"\xEF\xBB\xBFA\r\nB\r\n";
        let (d, root, id) = proj("dup", "Đề gốc", &[("main.tex", raw), ("images/h.png", &[1, 2, 3])]);
        let lib = root.join("exam-library");
        put(&projects_dir(&lib).join(&id), ".hedu/sources.json", b"{\"uids\":[\"u1\"]}");
        let d2 = duplicate(&root, &id, None).unwrap();
        assert_ne!(d2.id, id);
        assert_eq!(d2.name, "Đề gốc (bản sao)");
        assert_eq!(on_disk(&root, &d2.id, "main.tex"), raw);
        assert_eq!(on_disk(&root, &d2.id, "images/h.png"), vec![1, 2, 3]);
        assert_eq!(on_disk(&root, &d2.id, ".hedu/sources.json"), b"{\"uids\":[\"u1\"]}", "nguồn gốc câu hỏi đi theo bản sao");
        assert!(examlib::verify(&lib, &d2.id).unwrap().ok && examlib::verify(&lib, &id).unwrap().ok);
        assert_eq!(read_manifest(&lib, &d2.id).unwrap().source.mode, "duplicated");
        assert_eq!(duplicate(&root, &id, Some("  Phiên bản 2 ")).unwrap().name, "Phiên bản 2");
        assert_eq!(examlib::list(&lib).len(), 3);
        let _ = fs::remove_dir_all(&d);
    }

    #[cfg(windows)]
    #[test]
    fn sao_chep_va_sao_luu_khong_di_theo_junction_trong_thu_vien() {
        let (d, root, id) = proj("dupjunc", "Đề", &[("main.tex", b"a\n"), ("s/x.tex", b"trong\n")]);
        let lib = root.join("exam-library");
        put(&d, "ngoai/bi-mat.tex", b"BI-MAT");
        let pd = projects_dir(&lib).join(&id);
        fs::remove_dir_all(pd.join("s")).unwrap();
        assert!(mk_junction(&pd.join("s"), &d.join("ngoai")), "phải tạo được junction để kiểm");
        let dup = duplicate(&root, &id, None).unwrap();
        assert!(!projects_dir(&lib).join(&dup.id).join("s").exists() && dup.skipped_count >= 1, "không chép nội dung ngoài, có ghi lại");
        let b = backup_create(&root).unwrap();
        assert!(b.warnings.iter().any(|w| w.contains("liên kết")), "{:?}", b.warnings);
        let bd = backups_dir(&lib).join(&b.name).join("projects").join(&id);
        assert!(!bd.join("s").exists() && !bd.join("s/bi-mat.tex").exists());
        let _ = fs::remove_dir(pd.join("s"));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn thung_rac_de_chuyen_khoi_phuc_va_xoa_hai_buoc_chi_voi_muc_trong_thung() {
        let (d, root, id) = proj("trash", "Đề", &[("main.tex", b"a\n")]);
        let lib = root.join("exam-library");
        let other = add(&root, "Khác", &[("main.tex", b"b\n")], &d);
        assert!(trash_purge(&root, &id).is_err(), "không xoá vĩnh viễn dự án còn trong thư viện");
        assert!(projects_dir(&lib).join(&id).exists());
        trash_project(&root, &id).unwrap();
        assert!(!projects_dir(&lib).join(&id).exists() && trash_dir(&lib).join(&id).exists());
        assert_eq!(examlib::list(&lib).iter().map(|s| s.id.clone()).collect::<Vec<_>>(), vec![other.clone()]);
        let tl = trash_list(&root);
        assert_eq!((tl.len(), tl[0].name.as_str(), tl[0].file_count), (1, "Đề", 1));
        assert!(!tl[0].deleted_at.is_empty());
        let back = trash_restore(&root, &id).unwrap();
        assert_eq!(back.id, id);
        assert_eq!(on_disk(&root, &id, "main.tex"), b"a\n");
        assert!(!projects_dir(&lib).join(&id).join(".hedu/trashed.json").exists());
        assert_eq!(examlib::list(&lib).len(), 2);
        trash_project(&root, &id).unwrap();
        put(&root, &format!("cache/exam-build/{id}/x.txt"), b"1");
        trash_purge(&root, &id).unwrap();
        assert!(trash_list(&root).is_empty() && !root.join("cache/exam-build").join(&id).exists());
        assert!(trash_purge(&root, "../..").is_err());
        assert!(trash_restore(&root, &id).is_err());
        assert!(read_manifest(&lib, &other).is_ok(), "dự án khác không bị đụng");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn khong_chuyen_thung_rac_khi_dang_bien_dich() {
        let (d, root, id) = proj("trashrun", "Đề", &[("main.tex", b"a\n")]);
        let (_g, _f) = crate::examcompile::register(&id).unwrap();
        assert!(trash_project(&root, &id).is_err());
        assert!(projects_dir(&root.join("exam-library")).join(&id).exists());
        drop(_g);
        assert!(trash_project(&root, &id).is_ok());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn sao_luu_doc_lap_kiem_tra_va_khoi_phuc_ra_du_an_moi() {
        let (d, root, id) = proj("backup", "Đề A", &[("main.tex", b"A\r\n"), ("images/h.png", &[9, 9])]);
        let lib = root.join("exam-library");
        let id2 = add(&root, "Đề B", &[("main.tex", b"B\n")], &d);
        let b = backup_create(&root).unwrap();
        assert_eq!((b.projects.len(), b.files), (2, 3));
        assert!(backup_verify(&root, &b.name).unwrap().ok);
        assert!(!lib.join("backups").join(&b.name).join("projects").join(&id).join("ghi-de.tmp").exists());
        // sửa/xoá dự án sau khi sao lưu: bản sao lưu vẫn nguyên
        put(&projects_dir(&lib).join(&id), "main.tex", b"DA SUA\n");
        trash_project(&root, &id2).unwrap();
        assert!(backup_verify(&root, &b.name).unwrap().ok);
        // khôi phục ra dự án MỚI, đúng byte, dự án hiện có không bị ghi đè
        let r = backup_restore(&root, &b.name, &[id.clone(), id2.clone()]).unwrap();
        assert_eq!(r.len(), 2);
        assert!(r.iter().all(|s| s.id != id && s.id != id2 && s.name.ends_with("(khôi phục)")));
        let ra = r.iter().find(|s| s.name.starts_with("Đề A")).unwrap();
        assert_eq!(on_disk(&root, &ra.id, "main.tex"), b"A\r\n");
        assert_eq!(on_disk(&root, &id, "main.tex"), b"DA SUA\n", "dự án hiện có không bị ghi đè");
        assert!(examlib::verify(&lib, &ra.id).unwrap().ok);
        assert!(backup_restore(&root, &b.name, &["11111111-2222-4333-a444-555555555555".into()]).is_err());
        assert!(backup_restore(&root, "../x", &[id.clone()]).is_err());
        // hỏng một tệp trong bản sao lưu ⇒ kiểm tra báo, khôi phục từ chối
        put(&lib, &format!("backups/{}/projects/{}/images/h.png", b.name, id), &[0, 0]);
        let c = backup_verify(&root, &b.name).unwrap();
        assert!(!c.ok && c.changed.iter().any(|x| x.ends_with("images/h.png")), "{c:?}");
        assert!(backup_restore(&root, &b.name, &[id.clone()]).is_err());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn sao_luu_bi_huy_neu_tep_doi_giua_chung_va_giu_ban_tot_cu() {
        let (d, root, id) = proj("backupfail", "Đề", &[("main.tex", b"A\n")]);
        let lib = root.join("exam-library");
        let good = backup_create(&root).unwrap();
        // tệp bị thêm vào trong lúc đang sao lưu
        let r = backup_create_with(&root, || put(&projects_dir(&lib).join(&id), "them-giua-chung.tex", b"moi"));
        assert!(r.is_err(), "không được báo thành công giả");
        let names: Vec<String> = backup_list(&root).into_iter().map(|b| b.name).collect();
        assert_eq!(names, vec![good.name.clone()], "bản tốt cũ vẫn còn, không để lại bản dở");
        assert!(fs::read_dir(backups_dir(&lib)).unwrap().flatten().all(|e| !e.file_name().to_string_lossy().starts_with(".staging")));
        // tệp bị đổi kích thước trong lúc sao lưu
        let r = backup_create_with(&root, || put(&projects_dir(&lib).join(&id), "main.tex", b"DA SUA DAI HON\n"));
        assert!(r.is_err());
        assert!(backup_verify(&root, &good.name).unwrap().ok);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn giu_toi_da_5_ban_sao_luu_chi_don_sau_khi_ban_moi_thanh_cong() {
        let (d, root, _id) = proj("keep", "Đề", &[("main.tex", b"A\n")]);
        let mut names = vec![];
        for _ in 0..7 {
            names.push(backup_create(&root).unwrap().name);
        }
        let left: Vec<String> = backup_list(&root).into_iter().map(|b| b.name).collect();
        assert_eq!(left.len(), KEEP_BACKUPS);
        assert!(left.contains(names.last().unwrap()) && !left.contains(&names[0]), "names={names:?} left={left:?}");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn xuat_va_nhap_goi_giu_thong_tin_va_tu_choi_goi_bi_sua() {
        let (d, root, id) = proj("bundle", "Đề gói", &[("main.tex", b"A\n"), ("chapters/c1.tex", b"C\n")]);
        let lib = root.join("exam-library");
        let mut m = meta("Đề gói", "needs_review");
        m.folder = Some("Lớp 11".into());
        m.grade = Some(11);
        update_meta(&root, &id, &m).unwrap();
        let out = d.join("ra");
        fs::create_dir_all(&out).unwrap();
        let dest = export_bundle(&root, &id, &out, "goi-de").unwrap();
        assert_eq!(fs::read(dest.join("chapters/c1.tex")).unwrap(), b"C\n");
        assert!(dest.join(".hedu/manifest.json").is_file());
        assert!(export_bundle(&root, &id, &out, "CON").is_err());
        assert!(export_bundle(&root, &id, &lib, "x").is_err(), "không xuất vào trong thư viện");
        assert_ne!(export_bundle(&root, &id, &out, "goi-de").unwrap(), dest, "không ghi đè");
        let s = import_bundle(&root, &dest).unwrap();
        assert_ne!(s.id, id);
        assert_eq!((s.folder.as_deref(), s.metadata.grade, s.status.as_str()), (Some("Lớp 11"), Some(11), "needs_review"));
        assert_eq!(on_disk(&root, &s.id, "chapters/c1.tex"), b"C\n");
        assert!(examlib::verify(&lib, &s.id).unwrap().ok);
        // sửa một tệp trong gói ⇒ nhập bị từ chối, không để lại dự án
        let before = examlib::list(&lib).len();
        fs::write(dest.join("main.tex"), b"BI SUA\n").unwrap();
        assert!(import_bundle(&root, &dest).is_err());
        assert_eq!(examlib::list(&lib).len(), before);
        assert!(fs::read_dir(projects_dir(&lib)).unwrap().flatten().all(|e| !e.file_name().to_string_lossy().starts_with(".staging")));
        // gói đã chốt khi nhập về thành "cần rà soát" (chưa có PDF mới)
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn nhap_goi_khong_nhan_thu_muc_trong_thu_vien_va_nguon_khong_phai_thu_muc_thuong() {
        let (d, root, id) = proj("bundle2", "Đề", &[("main.tex", b"A\n")]);
        let lib = root.join("exam-library");
        assert!(import_bundle(&root, &projects_dir(&lib).join(&id)).is_err());
        assert!(import_bundle(&root, &d.join("khong-co")).is_err());
        assert!(import_bundle(&root, &d.join("src")).is_err(), "thư mục không có sổ");
        let _ = fs::remove_dir_all(&d);
    }
}
