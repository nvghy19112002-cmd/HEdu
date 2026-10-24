//! Lệnh Tauri cho lưu trữ SQLite (PR S3): mở nguồn đang dùng, đề nghị nâng cấp từ `hedu.json`, nạp theo trang, ghi theo lô, tệp phụ.
//! Giao diện chỉ gọi các lệnh có tên rõ ràng dưới đây — KHÔNG có đường chạy SQL tuỳ ý.
//! Vị trí tạm thời (S5 sẽ thay bằng hồ sơ/nguồn trong workspace.json nhưng GIỮ NGUYÊN đường dẫn này):
//!   %APPDATA%\vn.hedu.app\profiles\default\sources\main\hedu.db
//! Dữ liệu cũ `data\hedu.json` KHÔNG bị đổi hay xoá; chỉ chuyển khi người dùng bấm xác nhận.

use crate::db::{Batch, Db, DbError};
use crate::jsonmig::{self, SourceFiles};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

pub struct DbState(pub Mutex<Option<Db>>);

pub fn db_path_in(root: &Path) -> PathBuf {
    root.join("profiles").join("default").join("sources").join("main").join("hedu.db")
}

pub fn legacy_in(root: &Path) -> SourceFiles {
    SourceFiles::in_data_dir(&root.join("data"))
}

#[derive(Debug, PartialEq)]
pub enum Detected {
    /// đã có `hedu.db` ⇒ dùng SQLite
    Sqlite,
    /// chưa có `hedu.db` nhưng còn dữ liệu JSON cũ ⇒ phải hỏi người dùng có nâng cấp không
    Legacy,
    /// máy mới, chưa có gì ⇒ tạo SQLite trống
    Fresh,
}

pub fn detect(root: &Path) -> Detected {
    if db_path_in(root).is_file() {
        return Detected::Sqlite;
    }
    let l = legacy_in(root);
    if l.json.is_file() || l.json_bak.is_file() {
        return Detected::Legacy;
    }
    Detected::Fresh
}

fn root_of(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

/// Đang dùng SQLite? (các lệnh JSON cũ phải từ chối để không ghi tệp cũ song song).
pub fn sqlite_active(app: &AppHandle) -> bool {
    app.state::<DbState>().0.lock().map(|g| g.is_some()).unwrap_or(false)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusOut {
    /// sqlite | legacy | error
    mode: String,
    message: Option<String>,
    fresh: bool,
}

fn status(mode: &str, message: Option<String>, fresh: bool) -> StatusOut {
    StatusOut { mode: mode.into(), message, fresh }
}

/// Xác định chế độ lưu trữ khi khởi động và mở nguồn SQLite nếu có/mới. Chạy trước khi nạp ngân hàng.
#[tauri::command]
pub fn storage_status(app: AppHandle, st: State<DbState>) -> StatusOut {
    let root = match root_of(&app) {
        Ok(r) => r,
        Err(e) => return status("error", Some(e), false),
    };
    let mut g = match st.0.lock() {
        Ok(g) => g,
        Err(_) => return status("error", Some("khóa dữ liệu bị lỗi".into()), false),
    };
    if g.is_some() {
        return status("sqlite", None, false);
    }
    let p = db_path_in(&root);
    match detect(&root) {
        Detected::Sqlite => match Db::open(&p) {
            Ok(db) => {
                *g = Some(db);
                status("sqlite", None, false)
            }
            Err(e) => status("error", Some(e.to_string()), false),
        },
        Detected::Legacy => status("legacy", None, false),
        Detected::Fresh => match Db::create(&p) {
            Ok(db) => {
                *g = Some(db);
                status("sqlite", None, true)
            }
            Err(e) => status("error", Some(e.to_string()), false),
        },
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreflightOut {
    questions: usize,
    schema: u64,
    trash: usize,
    decisions: usize,
    gold: usize,
    warnings: Vec<String>,
}

/// Kiểm tra dữ liệu JSON cũ trước khi nâng cấp (không ghi gì) — để hiện hộp xác nhận.
#[tauri::command]
pub async fn storage_preflight(app: AppHandle) -> Result<PreflightOut, String> {
    let root = root_of(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        jsonmig::preflight(&legacy_in(&root)).map(|p| PreflightOut { questions: p.questions, schema: p.schema, trash: p.trash, decisions: p.decisions, gold: p.gold, warnings: p.warnings }).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateOut {
    questions: usize,
    backup_dir: String,
    millis: u128,
    warnings: Vec<String>,
}

/// Nâng cấp: chuyển JSON cũ sang SQLite (chụp nguyên trạng → tệp tạm → đối chiếu → đổi tên) rồi mở nguồn mới. Chỉ gọi khi người dùng đã bấm xác nhận.
#[tauri::command]
pub async fn storage_migrate(app: AppHandle) -> Result<MigrateOut, String> {
    let root = root_of(&app)?;
    let a = app.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<MigrateOut, String> {
        let st = a.state::<DbState>();
        let mut g = st.0.lock().map_err(|_| "khóa dữ liệu bị lỗi".to_string())?;
        if g.is_some() {
            return Err("Đang dùng lưu trữ SQLite rồi, không cần nâng cấp.".into());
        }
        let target = db_path_in(&root);
        let rep = jsonmig::migrate(&legacy_in(&root), &target, &root.join("backups")).map_err(|e| e.to_string())?;
        let db = Db::open(&target).map_err(|e| e.to_string())?;
        *g = Some(db);
        Ok(MigrateOut { questions: rep.pre.questions, backup_dir: rep.backup_dir.display().to_string(), millis: rep.millis, warnings: rep.pre.warnings })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Chạy một việc trên nguồn đang mở, ở luồng riêng để giao diện không đứng.
async fn blocking<T: Send + 'static>(app: AppHandle, f: impl FnOnce(&mut Db) -> Result<T, DbError> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let st = app.state::<DbState>();
        let mut g = st.0.lock().map_err(|_| "khóa dữ liệu bị lỗi".to_string())?;
        let db = g.as_mut().ok_or_else(|| "Chưa mở nguồn dữ liệu SQLite.".to_string())?;
        f(db).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetaOut {
    schema: Option<String>,
    next_seq: Option<String>,
    taxonomy: Option<String>,
    count: i64,
}

#[tauri::command]
pub async fn db_load_meta(app: AppHandle) -> Result<MetaOut, String> {
    blocking(app, |db| Ok(MetaOut { schema: db.meta_get("schema")?, next_seq: db.meta_get("nextSeq")?, taxonomy: db.meta_get("taxonomy")?, count: db.count()? })).await
}

#[derive(Serialize)]
pub struct RowOut {
    seq: i64,
    uid: String,
    json: String,
}

#[tauri::command]
pub async fn db_load_page(app: AppHandle, after_seq: Option<i64>, after_uid: Option<String>, limit: usize) -> Result<Vec<RowOut>, String> {
    blocking(app, move |db| {
        let after = match (after_seq, after_uid.as_deref()) {
            (Some(s), Some(u)) => Some((s, u)),
            _ => None,
        };
        Ok(db.page(after, limit)?.into_iter().map(|r| RowOut { seq: r.seq, uid: r.uid, json: r.json }).collect())
    })
    .await
}

/// Ghi MỘT lô thay đổi trong một giao dịch (xoá → thêm/sửa câu → meta → tệp phụ). Lỗi ⇒ không ghi gì.
#[tauri::command]
pub async fn db_apply(app: AppHandle, upserts: Vec<String>, deletes: Vec<String>, meta: Vec<(String, String)>, sidecar: Vec<(String, String)>) -> Result<(), String> {
    blocking(app, move |db| db.apply(&Batch { upserts, deletes, meta, sidecar })).await
}

#[tauri::command]
pub async fn db_sidecar_get(app: AppHandle, key: String) -> Result<Option<String>, String> {
    blocking(app, move |db| db.sidecar_get(&key)).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrityOut {
    ok: bool,
    damaged: bool,
    messages: Vec<String>,
    questions: i64,
    duplicate_seq: i64,
}

#[tauri::command]
pub async fn db_integrity(app: AppHandle) -> Result<IntegrityOut, String> {
    blocking(app, |db| {
        let r = db.integrity_check()?;
        Ok(IntegrityOut { ok: r.ok, damaged: r.damaged, messages: r.messages, questions: r.questions, duplicate_seq: r.duplicate_seq })
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn root(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("hedu-cmd-test-{}-{}", std::process::id(), name));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn nhan_dien_che_do_luu_tru() {
        let r = root("detect");
        assert_eq!(detect(&r), Detected::Fresh, "máy mới");
        fs::create_dir_all(r.join("data")).unwrap();
        fs::write(r.join("data").join("hedu.json"), "{}").unwrap();
        assert_eq!(detect(&r), Detected::Legacy, "còn JSON cũ, chưa có hedu.db ⇒ phải hỏi nâng cấp");
        let r2 = root("detect2");
        fs::create_dir_all(r2.join("data")).unwrap();
        fs::write(r2.join("data").join("hedu.json.bak"), "{}").unwrap();
        assert_eq!(detect(&r2), Detected::Legacy, "chỉ còn .bak vẫn tính là có dữ liệu cũ");
        let p = db_path_in(&r);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(&p, "x").unwrap();
        assert_eq!(detect(&r), Detected::Sqlite, "đã có hedu.db ⇒ SQLite, không bao giờ quay lại hỏi nâng cấp");
        assert!(p.ends_with("profiles/default/sources/main/hedu.db") || p.ends_with("profiles\\default\\sources\\main\\hedu.db"));
    }
}
