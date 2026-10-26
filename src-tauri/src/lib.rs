// Lõi desktop của HEdu: lưu dữ liệu an toàn + cập nhật hai kênh + quay lại bản trước.
// Giao diện (React) chỉ gọi các lệnh dưới đây; mọi việc nặng làm ở đây.
mod ai;
mod db;
mod dbbackup;
mod dbcmd;
mod examcompile;
mod examlib;
mod importfs;
mod jsonmig;
mod proc;
mod storage;
mod support;
mod texfolder;
mod texpkg;
mod tikz;

use serde::Serialize;
use serde_json::Value;
use std::sync::Mutex;
use storage::Paths;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::UpdaterExt;

/// Cấu trúc dữ liệu mà bản app này hiểu. Phải bằng CURRENT_SCHEMA trong src/lib/migrate.ts.
const SUPPORTED_SCHEMA: u32 = 3;

/// "chủ/kho" GitHub, gắn vào lúc build bởi workflow (biến môi trường HEDU_REPO).
const REPO: Option<&str> = option_env!("HEDU_REPO");

/// Khóa để hai lần ghi không chồng nhau.
struct Gate(Mutex<()>);

fn paths(app: &AppHandle) -> Result<Paths, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(Paths::new(dir))
}

fn io_err(e: std::io::Error) -> String {
    e.to_string()
}

/// Dữ liệu hợp lệ = JSON là một object có mảng "questions".
fn looks_valid(bytes: &[u8]) -> bool {
    serde_json::from_slice::<Value>(bytes)
        .map(|v| v.get("questions").map(Value::is_array).unwrap_or(false))
        .unwrap_or(false)
}

fn schema_of(bytes: &[u8]) -> u32 {
    serde_json::from_slice::<Value>(bytes)
        .ok()
        .and_then(|v| v.get("schema").and_then(Value::as_u64))
        .unwrap_or(1) as u32
}

#[derive(Serialize)]
struct LoadOut {
    json: Option<String>,
    recovered: bool,
}

#[tauri::command]
fn load_data(app: AppHandle) -> Result<LoadOut, String> {
    let p = paths(&app)?;
    match storage::read_with_recovery(&p, looks_valid).map_err(io_err)? {
        Some(l) => Ok(LoadOut {
            json: Some(String::from_utf8_lossy(&l.bytes).into_owned()),
            recovered: l.recovered,
        }),
        None => Ok(LoadOut { json: None, recovered: false }),
    }
}

#[tauri::command]
fn save_data(app: AppHandle, gate: State<Gate>, json: String) -> Result<(), String> {
    if dbcmd::sqlite_active(&app) {
        return Err("Đang dùng lưu trữ SQLite — không ghi tệp JSON cũ để tránh hai nơi lệch nhau.".into());
    }
    if !looks_valid(json.as_bytes()) {
        return Err("Dữ liệu không hợp lệ, không ghi để tránh làm hỏng file.".into());
    }
    let _g = gate.0.lock().map_err(|_| "khóa ghi bị lỗi".to_string())?;
    storage::write_atomic(&paths(&app)?, json.as_bytes()).map_err(io_err)
}

/// Tệp phụ hợp lệ = JSON object có số "v" và mảng "recs".
fn sidecar_valid(bytes: &[u8]) -> bool {
    serde_json::from_slice::<Value>(bytes)
        .map(|v| v.get("v").map(Value::is_number).unwrap_or(false) && v.get("recs").map(Value::is_array).unwrap_or(false))
        .unwrap_or(false)
}

/// Quyết định "không trùng / giữ cả hai" của giáo viên. Tệp riêng, không phải schema 3.
#[tauri::command]
fn load_dup_decisions(app: AppHandle) -> Result<Option<String>, String> {
    let p = paths(&app)?;
    Ok(storage::read_sidecar(&p, sidecar_valid)
        .map_err(io_err)?
        .map(|b| String::from_utf8_lossy(&b).into_owned()))
}

#[tauri::command]
fn save_dup_decisions(app: AppHandle, gate: State<Gate>, json: String) -> Result<(), String> {
    if dbcmd::sqlite_active(&app) {
        return Err("Đang dùng lưu trữ SQLite — không ghi tệp JSON cũ để tránh hai nơi lệch nhau.".into());
    }
    if !sidecar_valid(json.as_bytes()) {
        return Err("Dữ liệu quyết định không hợp lệ, không ghi.".into());
    }
    let _g = gate.0.lock().map_err(|_| "khóa ghi bị lỗi".to_string())?;
    storage::write_sidecar(&paths(&app)?, json.as_bytes()).map_err(io_err)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: String,
    repo: String,
    data_dir: String,
    supported_schema: u32,
}

#[tauri::command]
fn app_info(app: AppHandle) -> Result<AppInfo, String> {
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        repo: REPO.unwrap_or("").to_string(),
        data_dir: paths(&app)?.root().display().to_string(),
        supported_schema: SUPPORTED_SCHEMA,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateOut {
    version: String,
    current_version: String,
    notes: String,
    date: Option<String>,
}

/// channel: "stable" | "beta" | "previous".
/// stable/beta: chỉ nhận bản MỚI HƠN. previous: nhận đúng bản đã lưu, dù cũ hơn (để quay lại).
async fn find_update(app: &AppHandle, channel: &str) -> Result<Option<tauri_plugin_updater::Update>, String> {
    let repo = REPO.filter(|r| !r.is_empty()).ok_or_else(|| {
        "Bản này chưa được gắn với kho GitHub nên không cập nhật được. Hãy cài bản do trang phát hành cung cấp.".to_string()
    })?;
    if !matches!(channel, "stable" | "beta" | "previous") {
        return Err(format!("Kênh không hợp lệ: {channel}"));
    }
    let url = format!("https://github.com/{repo}/releases/download/channel-{channel}/latest.json");
    let url: tauri::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;
    let rollback = channel == "previous";
    let updater = app
        .updater_builder()
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?
        .version_comparator(move |current, release| {
            if rollback { release.version != current } else { release.version > current }
        })
        .build()
        .map_err(|e| e.to_string())?;
    updater.check().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn check_update(app: AppHandle, channel: String) -> Result<Option<UpdateOut>, String> {
    Ok(find_update(&app, &channel).await?.map(|u| UpdateOut {
        version: u.version.clone(),
        current_version: u.current_version.clone(),
        notes: u.body.clone().unwrap_or_default(),
        date: u.date.map(|d| d.to_string()),
    }))
}

#[derive(Serialize, Clone)]
struct Progress {
    downloaded: u64,
    total: Option<u64>,
}

/// Thứ tự an toàn: tải xong và kiểm tra chữ ký → sao lưu dữ liệu (thay bản sao lưu cũ) → cài → mở lại.
/// Nếu tải lỗi thì chưa đụng gì tới bản sao lưu đang có.
#[tauri::command]
async fn install_update(app: AppHandle, gate: State<'_, Gate>, channel: String) -> Result<(), String> {
    let update = find_update(&app, &channel)
        .await?
        .ok_or_else(|| "Không có bản nào để cài.".to_string())?;

    let mut got: u64 = 0;
    let handle = app.clone();
    let bytes = update
        .download(
            move |chunk, total| {
                got += chunk as u64;
                let _ = handle.emit("hedu-update-progress", Progress { downloaded: got, total });
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;

    if dbcmd::sqlite_active(&app) {
        // nguồn SQLite: bản chụp nhất quán (VACUUM INTO) đã kiểm tra; không cài nếu không sao lưu được
        let (a, from, to) = (app.clone(), update.current_version.clone(), update.version.clone());
        tauri::async_runtime::spawn_blocking(move || dbcmd::before_update(&a, &from, &to)).await.map_err(|e| e.to_string())??;
    } else {
        let _g = gate.0.lock().map_err(|_| "khóa ghi bị lỗi".to_string())?;
        let p = paths(&app)?;
        if let Some(l) = storage::read_with_recovery(&p, looks_valid).map_err(io_err)? {
            let schema = schema_of(&l.bytes);
            storage::snapshot_before_update(&p, &update.current_version, &update.version, schema)
                .map_err(|e| format!("Không tạo được bản sao lưu nên chưa cài: {e}"))?;
        }
    }

    update.install(bytes).map_err(|e| e.to_string())?;
    app.restart();
}

#[tauri::command]
fn backup_info(app: AppHandle) -> Result<Option<Value>, String> {
    if dbcmd::sqlite_active(&app) {
        return Ok(dbcmd::before_update_info(&app));
    }
    let text = storage::backup_meta_text(&paths(&app)?).map_err(io_err)?;
    Ok(text.and_then(|t| serde_json::from_str(&t).ok()))
}

/// Đổi chỗ dữ liệu hiện tại với bản sao lưu trước cập nhật (làm lại lần nữa là đổi ngược lại).
#[tauri::command]
fn restore_backup(app: AppHandle, gate: State<Gate>) -> Result<String, String> {
    if dbcmd::sqlite_active(&app) {
        return dbcmd::restore_after_update(&app);
    }
    let _g = gate.0.lock().map_err(|_| "khóa ghi bị lỗi".to_string())?;
    let bytes = storage::swap_with_backup(&paths(&app)?).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "Chưa có bản sao lưu nào để khôi phục.".to_string()
        } else {
            e.to_string()
        }
    })?;
    Ok(format!("Đã khôi phục ({} byte).", bytes.len()))
}

/// Tối đa 3 hình dịch cùng lúc; hình còn lại xếp hàng chờ (không làm đứng giao diện).
static RENDER_SLOTS: proc::Slots = proc::Slots::new(3);

/// Dịch một hình TikZ thành SVG (chạy ở luồng riêng để giao diện không bị đứng).
#[tauri::command]
async fn tikz_render(
    app: AppHandle,
    code: String,
    defs: String,
    opts: Option<tikz::TikzOpts>,
) -> Result<tikz::TikzOut, tikz::TikzErr> {
    let err = |m: String| tikz::TikzErr { message: m, log: String::new(), stage: String::from("latex") };
    let root = paths(&app).map_err(err)?;
    let dir = tikz::cache_dir_of(root.root());
    std::fs::create_dir_all(&dir).map_err(|e| err(e.to_string()))?;
    let o = opts.unwrap_or_default();
    let sup = support::prepare(root.root());
    tauri::async_runtime::spawn_blocking(move || {
        let _slot = RENDER_SLOTS.acquire();
        tikz::render(&dir, &sup, &code, &defs, &o)
    })
        .await
        .map_err(|e| err(e.to_string()))?
}

/// Kiểm tra máy đã có TeX Live chưa; trả về dòng phiên bản của pdflatex.
#[tauri::command]
async fn tikz_probe(app: AppHandle, tex_bin: Option<String>) -> Result<String, tikz::TikzErr> {
    let err = |m: String| tikz::TikzErr { message: m, log: String::new(), stage: String::from("latex") };
    let root = paths(&app).map_err(err)?;
    let dir = tikz::cache_dir_of(root.root());
    std::fs::create_dir_all(&dir).map_err(|e| err(e.to_string()))?;
    let sup = support::prepare(root.root());
    tauri::async_runtime::spawn_blocking(move || tikz::probe(&dir, &sup, tex_bin))
        .await
        .map_err(|e| err(e.to_string()))?
}

#[tauri::command]
fn tikz_clear_cache(app: AppHandle) -> Result<usize, String> {
    let dir = tikz::cache_dir_of(paths(&app)?.root());
    tikz::clear_cache(&dir).map_err(io_err)
}

/// Dò các thư mục hay cài TeX Live để người dùng bấm một nút là xong.
#[tauri::command]
async fn tikz_find() -> Vec<String> {
    tauri::async_runtime::spawn_blocking(tikz::find_tex_bins).await.unwrap_or_default()
}

/// Hỏi TeX Live đang chọn xem có từng tệp (.sty, .cls, thư viện tikz…) hay không.
#[tauri::command]
async fn tex_check_files(app: AppHandle, files: Vec<String>, tex_bin: Option<String>) -> Result<Vec<texpkg::FileHit>, tikz::TikzErr> {
    let sup = paths(&app).ok().and_then(|p| support::prepare(p.root()));
    tauri::async_runtime::spawn_blocking(move || texpkg::check_files(&files, &tex_bin, &sup))
        .await
        .map_err(|e| tikz::TikzErr { message: e.to_string(), log: String::new(), stage: String::from("latex") })?
}

/// Tra gói TeX Live chứa một tệp. Chỉ tra cứu; không bao giờ cài.
/// `global` = tra cả kho trên mạng, giao diện chỉ gửi true sau khi người dùng đồng ý.
#[tauri::command]
async fn tex_find_package(file: String, tex_bin: Option<String>, global: bool) -> Result<Vec<texpkg::PkgHit>, tikz::TikzErr> {
    tauri::async_runtime::spawn_blocking(move || texpkg::find_package(&file, &tex_bin, global))
        .await
        .map_err(|e| tikz::TikzErr { message: e.to_string(), log: String::new(), stage: String::from("latex") })?
}

#[tauri::command]
fn tikz_default_preamble() -> String {
    tikz::expanded_default()
}

/// Ghi một file văn bản vào đường dẫn người dùng vừa chọn trong hộp "Lưu thành…" (xuất .tex, sao lưu).
/// Không ghi đè dữ liệu của app; chỉ ghi đúng file được chọn.
#[tauri::command]
fn save_text_file(path: String, text: String) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("Chưa chọn nơi lưu.".into());
    }
    std::fs::write(&path, text.as_bytes()).map_err(|e| format!("Không ghi được file: {e}"))
}

/// Xuất thư mục biên dịch được vào `parent`/`name` (thư mục mới, không ghi đè). Trả về đường dẫn thư mục.
#[tauri::command]
fn export_tex_folder(parent: String, name: String, files: Vec<texfolder::OutFile>) -> Result<String, String> {
    texfolder::write_project(&parent, &name, &files)
}

// ---------- AI dùng chung (ai.rs) ----------
// Tên dịch vụ trong kho mật khẩu = identifier của app ⇒ bản chạy thử (vn.hedu.app.thu) có khoá riêng.
fn ai_service(app: &AppHandle) -> String {
    format!("{}.ai", app.config().identifier)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AiKeyStatus {
    has_key: bool,
}

/// Lưu khoá Gemini của một hồ sơ (legacy | p1..p5) vào Windows Credential Manager. Không bao giờ trả khoá ngược lại giao diện.
#[tauri::command]
fn ai_key_set(app: AppHandle, profile_id: Option<String>, key: String) -> Result<(), ai::AiError> {
    ai::key_set(&ai_service(&app), profile_id.as_deref().unwrap_or(ai::LEGACY_PROFILE), &key)
}

#[tauri::command]
fn ai_key_clear(app: AppHandle, profile_id: Option<String>) -> Result<(), ai::AiError> {
    ai::key_clear(&ai_service(&app), profile_id.as_deref().unwrap_or(ai::LEGACY_PROFILE))
}

#[tauri::command]
fn ai_key_status(app: AppHandle, profile_id: Option<String>) -> Result<AiKeyStatus, ai::AiError> {
    Ok(AiKeyStatus { has_key: ai::key_get(&ai_service(&app), profile_id.as_deref().unwrap_or(ai::LEGACY_PROFILE))?.is_some() })
}

/// Thông tin hồ sơ AI (tên, bật/tắt, hồ sơ đang dùng) — tệp riêng `ai_profiles.json`, KHÔNG chứa khoá, không nằm trong hedu.json/sao lưu.
#[tauri::command]
fn ai_profiles_load(app: AppHandle) -> Result<Option<String>, String> {
    let f = app.path().app_data_dir().map_err(|e| e.to_string())?.join("ai_profiles.json");
    match std::fs::read(&f) {
        Ok(b) if ai::profiles_valid(&b) => Ok(Some(String::from_utf8_lossy(&b).into_owned())),
        Ok(_) => Err("Tệp cấu hình AI không hợp lệ.".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn ai_profiles_save(app: AppHandle, json: String) -> Result<(), String> {
    if !ai::profiles_valid(json.as_bytes()) {
        return Err("Cấu hình AI không hợp lệ, không ghi.".into());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let (f, tmp) = (dir.join("ai_profiles.json"), dir.join("ai_profiles.json.tmp"));
    std::fs::write(&tmp, json.as_bytes()).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &f).map_err(|e| e.to_string())
}

/// Chạy MỘT lượt nhiệm vụ AI (prompt + khuôn JSON do giao diện gửi). Giao diện phải hỏi người dùng trước khi gọi.
#[tauri::command]
async fn ai_run(app: AppHandle, req: ai::AiRequest) -> Result<ai::AiReply, ai::AiError> {
    ai::run(&ai_service(&app), req).await
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(Gate(Mutex::new(())))
        .manage(dbcmd::DbState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            load_data,
            save_data,
            load_dup_decisions,
            save_dup_decisions,
            app_info,
            check_update,
            install_update,
            backup_info,
            restore_backup,
            tikz_render,
            tikz_probe,
            tikz_clear_cache,
            tikz_default_preamble,
            tikz_find,
            tex_check_files,
            tex_find_package,
            save_text_file,
            export_tex_folder,
            ai_key_set,
            ai_key_clear,
            ai_key_status,
            ai_profiles_load,
            ai_profiles_save,
            ai_run,
            dbcmd::storage_status,
            dbcmd::storage_preflight,
            dbcmd::storage_migrate,
            dbcmd::db_load_meta,
            dbcmd::db_load_page,
            dbcmd::db_apply,
            dbcmd::db_sidecar_get,
            dbcmd::db_integrity,
            dbcmd::backup_snapshot,
            dbcmd::backup_point,
            dbcmd::backup_points,
            dbcmd::backup_inspect,
            dbcmd::backup_restore,
            dbcmd::db_export_json,
            importfs::import_scan,
            importfs::import_read,
            examlib::exam_lib_scan,
            examlib::exam_lib_import,
            examlib::exam_lib_create,
            examlib::exam_lib_list,
            examlib::exam_lib_get,
            examlib::exam_lib_verify,
            examcompile::exam_compile,
            examcompile::exam_compile_cancel,
            examcompile::exam_compile_last,
            examcompile::exam_pdf_read,
            examcompile::exam_pdf_export,
            examcompile::exam_pdf_open_external
        ])
        .run(tauri::generate_context!())
        .expect("không khởi động được HEdu");
}
