//! Chuyển dữ liệu `hedu.json` (+ tệp phụ) sang SQLite và xuất ngược ra JSON (PR S2 — CHƯA nối vào giao diện; nối ở S3).
//!
//! Nguyên tắc (xem claude/thiet-ke-sqlite.md, mục 3 và 4):
//!   - KHÔNG BAO GIỜ sửa hay xoá tệp gốc: chỉ đọc, chép sang bản chụp nguyên trạng, tính SHA-256 trước và sau;
//!   - mỗi câu được giữ NGUYÊN VĂN (từng ký tự của JSON gốc), không dựng lại;
//!   - dựng tệp tạm → đối chiếu từng câu với dữ liệu gốc → chỉ khi đạt mới đổi tên thành `hedu.db`;
//!   - lỗi ở bất kỳ bước nào ⇒ xoá tệp tạm, không để lại gì, tệp gốc vẫn nguyên;
//!   - không bao giờ ghi đè một `hedu.db` có sẵn.
#![allow(dead_code)] // sẽ được các lệnh Tauri dùng ở PR S3

use crate::db::{question_key, Batch, Db, DbError};
use serde_json::value::RawValue;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

pub const SIDECAR_KEY: &str = "dup-decisions";
const SUPPORTED_SCHEMA: u64 = 3;
const KNOWN_TOP: [&str; 4] = ["schema", "questions", "nextSeq", "taxonomy"];
const IMPORT_BATCH: usize = 2000;

#[derive(Debug)]
pub enum MigError {
    /// dữ liệu nguồn không đọc được / không hợp lệ (kèm lý do dễ hiểu)
    Source(String),
    /// có uid trùng trong nguồn — không chuyển (sẽ làm mất câu)
    Duplicate(Vec<String>),
    /// nguồn thuộc cấu trúc mới hơn bản app này
    Newer(u64),
    /// đối chiếu sau khi dựng tệp tạm không đạt
    Verify(String),
    /// tệp gốc bị thay đổi trong lúc chuyển (app khác đang ghi?)
    SourceChanged,
    /// đã có tệp đích — không ghi đè
    TargetExists(PathBuf),
    Db(DbError),
    Io(String),
}

impl fmt::Display for MigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            MigError::Source(m) => write!(f, "Không đọc được dữ liệu cũ: {m} (dữ liệu cũ vẫn nguyên, chưa chuyển gì)."),
            MigError::Duplicate(v) => write!(f, "Dữ liệu cũ có mã nội bộ (uid) bị trùng: {}. Chưa chuyển để không làm mất câu.", v.join(", ")),
            MigError::Newer(v) => write!(f, "Dữ liệu cũ thuộc cấu trúc {v}, mới hơn bản HEdu này. Hãy cập nhật HEdu; chưa chuyển gì."),
            MigError::Verify(m) => write!(f, "Đối chiếu sau khi chuyển không đạt nên đã huỷ, dữ liệu cũ vẫn nguyên: {m}"),
            MigError::SourceChanged => write!(f, "Dữ liệu cũ bị thay đổi trong lúc đang chuyển nên đã huỷ để an toàn. Hãy đóng các cửa sổ HEdu khác rồi thử lại."),
            MigError::TargetExists(p) => write!(f, "Đã có tệp {} — không ghi đè.", p.display()),
            MigError::Db(e) => write!(f, "{e}"),
            MigError::Io(m) => write!(f, "Lỗi đọc/ghi tệp: {m}"),
        }
    }
}
impl From<DbError> for MigError {
    fn from(e: DbError) -> Self {
        MigError::Db(e)
    }
}
impl From<std::io::Error> for MigError {
    fn from(e: std::io::Error) -> Self {
        MigError::Io(e.to_string())
    }
}
type R<T> = Result<T, MigError>;

pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

/// Các tệp dữ liệu cũ (thư mục `data` của app).
#[derive(Clone, Debug)]
pub struct SourceFiles {
    pub json: PathBuf,
    pub json_bak: PathBuf,
    pub sidecar: PathBuf,
    pub sidecar_bak: PathBuf,
}
impl SourceFiles {
    pub fn in_data_dir(dir: &Path) -> Self {
        SourceFiles { json: dir.join("hedu.json"), json_bak: dir.join("hedu.json.bak"), sidecar: dir.join("dup-decisions.json"), sidecar_bak: dir.join("dup-decisions.json.bak") }
    }
    fn all(&self) -> [&PathBuf; 4] {
        [&self.json, &self.json_bak, &self.sidecar, &self.sidecar_bak]
    }
}

/// Dữ liệu cũ đã đọc và kiểm tra, còn giữ nguyên văn từng câu.
struct Source {
    schema: u64,
    questions: Vec<String>,
    next_seq: String,
    taxonomy: String,
    /// các khoá cấp cao khác ngoài schema/questions/nextSeq/taxonomy (giữ để xuất ngược không mất)
    extra: Vec<(String, String)>,
    sidecar: Option<String>,
    used_json_bak: bool,
    used_sidecar_bak: bool,
}

#[derive(Debug, Clone)]
pub struct Preflight {
    pub questions: usize,
    pub schema: u64,
    pub trash: usize,
    pub decisions: usize,
    pub gold: usize,
    pub duplicate_seq_rows: usize,
    pub sha_json: String,
    pub sha_sidecar: Option<String>,
    pub used_json_bak: bool,
    pub warnings: Vec<String>,
}

fn parse_main(text: &str) -> Result<(u64, Vec<String>, String, String, Vec<(String, String)>), String> {
    let top: HashMap<String, Box<RawValue>> = serde_json::from_str(text).map_err(|_| "tệp không phải JSON hợp lệ".to_string())?;
    let q = top.get("questions").ok_or("thiếu danh sách câu hỏi")?;
    let arr: Vec<Box<RawValue>> = serde_json::from_str(q.get()).map_err(|_| "danh sách câu hỏi không đúng dạng".to_string())?;
    let schema = match top.get("schema") {
        Some(s) => serde_json::from_str::<u64>(s.get()).map_err(|_| "số phiên bản cấu trúc không hợp lệ".to_string())?,
        None => 1, // bản đầu tiên chưa ghi schema
    };
    let next_seq = top.get("nextSeq").map(|v| v.get().to_string()).unwrap_or_else(|| "null".into());
    let taxonomy = top.get("taxonomy").map(|v| v.get().to_string()).unwrap_or_else(|| "null".into());
    let mut extra: Vec<(String, String)> = top.iter().filter(|(k, _)| !KNOWN_TOP.contains(&k.as_str())).map(|(k, v)| (k.clone(), v.get().to_string())).collect();
    extra.sort();
    Ok((schema, arr.iter().map(|r| r.get().to_string()).collect(), next_seq, taxonomy, extra))
}

fn sidecar_ok(text: &str) -> bool {
    serde_json::from_str::<Value>(text).map(|v| v.get("v").map(Value::is_number).unwrap_or(false) && v.get("recs").map(Value::is_array).unwrap_or(false)).unwrap_or(false)
}

fn read_text(p: &Path) -> R<Option<String>> {
    match fs::read(p) {
        Ok(b) => Ok(Some(String::from_utf8(b).map_err(|_| MigError::Source(format!("{} không phải văn bản UTF-8", p.display())))?)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}

fn read_source(f: &SourceFiles) -> R<Source> {
    let main = read_text(&f.json)?;
    let bak = read_text(&f.json_bak)?;
    let (parsed, used_bak) = match main.as_deref().map(parse_main) {
        Some(Ok(p)) => (p, false),
        first => match bak.as_deref().map(parse_main) {
            Some(Ok(p)) => (p, true),
            _ => {
                let why = match first {
                    Some(Err(e)) => e,
                    None => "chưa có tệp dữ liệu".into(),
                    Some(Ok(_)) => unreachable!(),
                };
                return Err(MigError::Source(why));
            }
        },
    };
    let (schema, questions, next_seq, taxonomy, extra) = parsed;
    if schema > SUPPORTED_SCHEMA {
        return Err(MigError::Newer(schema));
    }
    // tệp phụ: có mà đọc không được (cả bản .bak) ⇒ DỪNG, không âm thầm bỏ quyết định/Thùng rác của giáo viên
    let sc = read_text(&f.sidecar)?;
    let sc_bak = read_text(&f.sidecar_bak)?;
    let (sidecar, used_sidecar_bak) = match (&sc, &sc_bak) {
        (Some(t), _) if sidecar_ok(t) => (Some(t.clone()), false),
        (_, Some(t)) if sidecar_ok(t) => (Some(t.clone()), true),
        (None, None) => (None, false),
        _ => return Err(MigError::Source("tệp quyết định trùng / Thùng rác hiện có nhưng không đọc được".into())),
    };
    Ok(Source { schema, questions, next_seq, taxonomy, extra, sidecar, used_json_bak: used_bak, used_sidecar_bak })
}

fn count_in(sidecar: &Option<String>, key: &str) -> usize {
    sidecar.as_ref().and_then(|t| serde_json::from_str::<Value>(t).ok()).and_then(|v| v.get(key).and_then(Value::as_array).map(Vec::len)).unwrap_or(0)
}

fn preflight_of(src: &Source, files: &SourceFiles) -> R<Preflight> {
    let mut seen = HashSet::new();
    let mut dup = Vec::new();
    let mut seqs: HashMap<i64, usize> = HashMap::new();
    for (i, q) in src.questions.iter().enumerate() {
        let (uid, seq) = question_key(q).map_err(|e| MigError::Source(format!("câu thứ {} không hợp lệ ({e})", i + 1)))?;
        if !seen.insert(uid.clone()) && dup.len() < 5 {
            dup.push(uid);
        } else if dup.len() >= 5 {
            // đủ mẫu
        }
        *seqs.entry(seq).or_default() += 1;
    }
    if !dup.is_empty() || seen.len() != src.questions.len() {
        if dup.is_empty() {
            dup.push("(nhiều câu)".into());
        }
        return Err(MigError::Duplicate(dup));
    }
    let dup_rows: usize = seqs.values().filter(|&&c| c > 1).sum();
    let mut warnings = Vec::new();
    if src.used_json_bak {
        warnings.push("Tệp dữ liệu chính bị hỏng nên đã lấy từ bản dự phòng (.bak).".to_string());
    }
    if src.used_sidecar_bak {
        warnings.push("Tệp quyết định trùng chính bị hỏng nên đã lấy từ bản dự phòng (.bak).".to_string());
    }
    if dup_rows > 0 {
        warnings.push(format!("{dup_rows} câu có số thứ tự trùng nhau — vẫn chuyển đủ, chỉ báo để biết."));
    }
    let main_path = if src.used_json_bak { &files.json_bak } else { &files.json };
    let sha_json = sha256_hex(&fs::read(main_path)?);
    let sc_path = if src.used_sidecar_bak { &files.sidecar_bak } else { &files.sidecar };
    let sha_sidecar = if src.sidecar.is_some() { Some(sha256_hex(&fs::read(sc_path)?)) } else { None };
    Ok(Preflight {
        questions: src.questions.len(),
        schema: src.schema,
        trash: count_in(&src.sidecar, "trash"),
        decisions: count_in(&src.sidecar, "recs"),
        gold: count_in(&src.sidecar, "gold"),
        duplicate_seq_rows: dup_rows,
        sha_json,
        sha_sidecar,
        used_json_bak: src.used_json_bak,
        warnings,
    })
}

/// Bước 1: kiểm tra trước, KHÔNG ghi gì (dùng để hiện hộp xác nhận "Nâng cấp lưu trữ").
pub fn preflight(files: &SourceFiles) -> R<Preflight> {
    let src = read_source(files)?;
    preflight_of(&src, files)
}

/// Dấu thời gian UTC dạng 20261024-153012 (không cần thư viện ngày giờ).
pub fn utc_stamp(secs: i64) -> String {
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}{m:02}{d:02}-{:02}{:02}{:02}", rem / 3600, rem % 3600 / 60, rem % 60)
}

#[derive(Debug)]
pub struct MigrationReport {
    pub pre: Preflight,
    pub db_path: PathBuf,
    pub backup_dir: PathBuf,
    pub source_id: String,
    pub millis: u128,
}

/// Chỗ chèn lỗi để kiểm thử (mặc định không làm gì).
#[derive(Default)]
pub struct Hooks<'a> {
    /// gọi sau khi dựng và mở lại tệp tạm, TRƯỚC khi đối chiếu
    pub before_verify: Option<&'a mut dyn FnMut(&mut Db)>,
    /// gọi sau khi đối chiếu đạt, TRƯỚC khi kiểm tệp gốc còn nguyên và đổi tên
    pub before_rename: Option<&'a mut dyn FnMut()>,
}

pub fn migrate(files: &SourceFiles, target_db: &Path, backup_root: &Path) -> R<MigrationReport> {
    migrate_with(files, target_db, backup_root, &mut Hooks::default())
}

fn remove_tmp(tmp: &Path) {
    for ext in ["", "-wal", "-shm", "-journal"] {
        let mut s = tmp.as_os_str().to_owned();
        s.push(ext);
        let _ = fs::remove_file(PathBuf::from(s));
    }
}

pub fn migrate_with(files: &SourceFiles, target_db: &Path, backup_root: &Path, hooks: &mut Hooks) -> R<MigrationReport> {
    let t0 = Instant::now();
    if target_db.exists() {
        return Err(MigError::TargetExists(target_db.to_path_buf()));
    }
    // 1. kiểm tra trước
    let src = read_source(files)?;
    let pre = preflight_of(&src, files)?;
    // 2. chụp nguyên trạng (chỉ đọc tệp gốc)
    let stamp = utc_stamp(crate::db::now_secs());
    let mut backup_dir = backup_root.join(format!("migration-{stamp}"));
    let mut n = 1;
    while backup_dir.exists() {
        n += 1;
        backup_dir = backup_root.join(format!("migration-{stamp}-{n}"));
    }
    fs::create_dir_all(&backup_dir)?;
    for p in files.all() {
        if p.is_file() {
            let name = p.file_name().ok_or_else(|| MigError::Io("tên tệp không hợp lệ".into()))?;
            let to = backup_dir.join(name);
            fs::copy(p, &to)?;
            if sha256_hex(&fs::read(p)?) != sha256_hex(&fs::read(&to)?) {
                return Err(MigError::Verify(format!("bản chụp {} không giống tệp gốc", name.to_string_lossy())));
            }
        }
    }
    // 3–4. dựng tệp tạm + đối chiếu
    let tmp = target_db.with_file_name(format!("{}.tmp", target_db.file_name().and_then(|s| s.to_str()).unwrap_or("hedu.db")));
    remove_tmp(&tmp); // tệp tạm sót lại từ lần chuyển dở trước (chỉ là tệp tạm của chính HEdu)
    if let Some(dir) = target_db.parent() {
        fs::create_dir_all(dir)?;
    }
    let source_id = sha256_hex(format!("{}-{}-{}", crate::db::now_secs(), std::process::id(), target_db.display()).as_bytes())[..16].to_string();
    let built = (|| -> R<()> {
        let mut db = Db::create(&tmp)?;
        for (i, chunk) in src.questions.chunks(IMPORT_BATCH).enumerate() {
            let mut b = Batch { upserts: chunk.to_vec(), ..Default::default() };
            if i == 0 {
                b.meta.push(("schema".into(), src.schema.to_string()));
                b.meta.push(("nextSeq".into(), src.next_seq.clone()));
                b.meta.push(("taxonomy".into(), src.taxonomy.clone()));
                b.meta.push(("source_id".into(), source_id.clone()));
                b.meta.push(("migrated_from".into(), pre.sha_json.clone()));
                b.meta.push(("migrated_at".into(), crate::db::now_secs().to_string()));
                for (k, v) in &src.extra {
                    b.meta.push((format!("extra_top:{k}"), v.clone()));
                }
                if let Some(sc) = &src.sidecar {
                    b.sidecar.push((SIDECAR_KEY.into(), sc.clone()));
                }
            }
            db.apply(&b)?;
        }
        if src.questions.is_empty() {
            // ngân hàng trống vẫn phải ghi meta/tệp phụ
            let mut b = Batch::default();
            b.meta.push(("schema".into(), src.schema.to_string()));
            b.meta.push(("nextSeq".into(), src.next_seq.clone()));
            b.meta.push(("taxonomy".into(), src.taxonomy.clone()));
            b.meta.push(("source_id".into(), source_id.clone()));
            b.meta.push(("migrated_from".into(), pre.sha_json.clone()));
            b.meta.push(("migrated_at".into(), crate::db::now_secs().to_string()));
            for (k, v) in &src.extra {
                b.meta.push((format!("extra_top:{k}"), v.clone()));
            }
            if let Some(sc) = &src.sidecar {
                b.sidecar.push((SIDECAR_KEY.into(), sc.clone()));
            }
            db.apply(&b)?;
        }
        db.journal_add("migrate", &format!("chuyển {} câu từ hedu.json (sha256 {})", pre.questions, &pre.sha_json[..16]))?;
        db.close()?;
        let mut db = Db::open(&tmp)?;
        if let Some(h) = hooks.before_verify.as_mut() {
            h(&mut db);
        }
        verify_against(&db, &src)?;
        db.close()?;
        Ok(())
    })();
    if let Err(e) = built {
        remove_tmp(&tmp);
        return Err(e);
    }
    if let Some(h) = hooks.before_rename.as_mut() {
        h();
    }
    // 5. tệp gốc không được thay đổi trong lúc chuyển
    let unchanged = (|| -> R<bool> {
        let main_path = if src.used_json_bak { &files.json_bak } else { &files.json };
        if sha256_hex(&fs::read(main_path)?) != pre.sha_json {
            return Ok(false);
        }
        if let Some(want) = &pre.sha_sidecar {
            let sc_path = if src.used_sidecar_bak { &files.sidecar_bak } else { &files.sidecar };
            if &sha256_hex(&fs::read(sc_path)?) != want {
                return Ok(false);
            }
        }
        Ok(true)
    })();
    match unchanged {
        Ok(true) => {}
        Ok(false) => {
            remove_tmp(&tmp);
            return Err(MigError::SourceChanged);
        }
        Err(e) => {
            remove_tmp(&tmp);
            return Err(e);
        }
    }
    if target_db.exists() {
        remove_tmp(&tmp);
        return Err(MigError::TargetExists(target_db.to_path_buf()));
    }
    if let Err(e) = fs::rename(&tmp, target_db) {
        remove_tmp(&tmp);
        return Err(e.into());
    }
    Ok(MigrationReport { pre, db_path: target_db.to_path_buf(), backup_dir, source_id, millis: t0.elapsed().as_millis() })
}

/// Đối chiếu tệp SQLite với dữ liệu gốc: số câu, tập uid, TỪNG CÂU giống từng ký tự, meta, tệp phụ, toàn vẹn.
fn verify_against(db: &Db, src: &Source) -> R<()> {
    let rep = db.integrity_check()?;
    if rep.damaged {
        return Err(MigError::Verify(format!("tệp mới không qua kiểm toàn vẹn: {}", rep.messages.join("; "))));
    }
    let n = db.count()?;
    if n as usize != src.questions.len() {
        return Err(MigError::Verify(format!("số câu khác nhau (gốc {}, mới {n})", src.questions.len())));
    }
    let mut want: HashMap<String, &str> = HashMap::with_capacity(src.questions.len());
    for q in &src.questions {
        let (uid, _) = question_key(q)?;
        want.insert(uid, q.as_str());
    }
    let mut seen = 0usize;
    let mut after: Option<(i64, String)> = None;
    loop {
        let page = db.page(after.as_ref().map(|(s, u)| (*s, u.as_str())), 2000)?;
        if page.is_empty() {
            break;
        }
        for r in &page {
            match want.get(&r.uid) {
                Some(orig) if *orig == r.json => seen += 1,
                Some(_) => return Err(MigError::Verify(format!("câu {} khác bản gốc", r.uid))),
                None => return Err(MigError::Verify(format!("câu {} không có trong dữ liệu gốc", r.uid))),
            }
        }
        let l = page.last().unwrap();
        after = Some((l.seq, l.uid.clone()));
    }
    if seen != src.questions.len() {
        return Err(MigError::Verify("thiếu câu sau khi chuyển".into()));
    }
    let check = |k: &str, v: &str| -> R<()> {
        if db.meta_get(k)?.as_deref() != Some(v) {
            return Err(MigError::Verify(format!("thông tin chung '{k}' khác bản gốc")));
        }
        Ok(())
    };
    check("schema", &src.schema.to_string())?;
    check("nextSeq", &src.next_seq)?;
    check("taxonomy", &src.taxonomy)?;
    for (k, v) in &src.extra {
        check(&format!("extra_top:{k}"), v)?;
    }
    if db.sidecar_get(SIDECAR_KEY)? != src.sidecar {
        return Err(MigError::Verify("tệp phụ (quyết định trùng, Thùng rác, nhãn chuẩn) khác bản gốc".into()));
    }
    Ok(())
}

#[derive(Debug)]
pub struct ExportReport {
    pub json_path: PathBuf,
    pub sidecar_path: Option<PathBuf>,
    pub questions: usize,
    pub sha_json: String,
}

/// Xuất nguồn SQLite ra `hedu.json` (cấu trúc 3 như app hiện nay) + `dup-decisions.json` vào thư mục `out_dir`.
/// Không ghi đè tệp có sẵn; ghi xong đọc lại và đối chiếu với tệp SQLite.
pub fn export_json(db: &Db, out_dir: &Path) -> R<ExportReport> {
    let json_path = out_dir.join("hedu.json");
    let sidecar_path = out_dir.join("dup-decisions.json");
    let sidecar = db.sidecar_get(SIDECAR_KEY)?;
    if json_path.exists() {
        return Err(MigError::TargetExists(json_path));
    }
    if sidecar.is_some() && sidecar_path.exists() {
        return Err(MigError::TargetExists(sidecar_path));
    }
    let mut qs: Vec<String> = Vec::new();
    let mut after: Option<(i64, String)> = None;
    loop {
        let page = db.page(after.as_ref().map(|(s, u)| (*s, u.as_str())), 2000)?;
        if page.is_empty() {
            break;
        }
        let l = page.last().unwrap();
        after = Some((l.seq, l.uid.clone()));
        qs.extend(page.into_iter().map(|r| r.json));
    }
    let schema = db.meta_get("schema")?.unwrap_or_else(|| SUPPORTED_SCHEMA.to_string());
    let next_seq = db.meta_get("nextSeq")?.unwrap_or_else(|| "null".into());
    let taxonomy = db.meta_get("taxonomy")?.unwrap_or_else(|| "null".into());
    let mut text = format!("{{\"schema\":{schema},\"questions\":[{}],\"nextSeq\":{next_seq},\"taxonomy\":{taxonomy}", qs.join(","));
    // khoá cấp cao lạ (nếu nguồn có) được giữ lại
    let extras = db.meta_prefix("extra_top:")?;
    for (k, v) in extras {
        text.push_str(&format!(",{}:{v}", serde_json::to_string(&k).unwrap_or_else(|_| "\"\"".into())));
    }
    text.push('}');
    fs::create_dir_all(out_dir)?;
    let write_new = |p: &Path, body: &str| -> R<()> {
        let tmp = p.with_extension("json.tmp");
        {
            use std::io::Write;
            let mut f = fs::File::create(&tmp)?;
            f.write_all(body.as_bytes())?;
            f.sync_all()?;
        }
        fs::rename(&tmp, p)?;
        Ok(())
    };
    write_new(&json_path, &text)?;
    if let Some(sc) = &sidecar {
        write_new(&sidecar_path, sc)?;
    }
    // đọc lại tệp vừa xuất và đối chiếu với SQLite
    let files = SourceFiles::in_data_dir(out_dir);
    let back = read_source(&files).and_then(|s| {
        if s.used_json_bak || s.used_sidecar_bak {
            return Err(MigError::Verify("tệp xuất ra không đọc được".into()));
        }
        verify_against(db, &s)
    });
    if let Err(e) = back {
        let _ = fs::remove_file(&json_path);
        let _ = fs::remove_file(&sidecar_path);
        return Err(e);
    }
    Ok(ExportReport { json_path, sidecar_path: sidecar.map(|_| sidecar_path), questions: qs.len(), sha_json: sha256_hex(text.as_bytes()) })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    fn dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("hedu-mig-test-{}-{}", std::process::id(), name));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(d.join("data")).unwrap();
        d
    }

    /// Câu có ký tự khó (gạch chéo ngược, ngoặc, Unicode, tikz, \immini…), sinh giống cách JSON.stringify của app (gọn, một dòng).
    fn q(i: i64) -> String {
        let latex = format!("\\begin{{ex}}%[2D1H1-1]\n  Câu {i}: $\\dfrac{{1}}{{2}}$ \\immini{{x}}{{\\begin{{tikzpicture}}\\def\\a{{1}}\\draw (0,0)--(1,1);\\end{{tikzpicture}}}}\n  \\loigiai{{ý \"kép\" \\\\ ✓}}\n\\end{{ex}}");
        serde_json::json!({ "uid": format!("u{i:08}"), "seq": i, "latex": latex, "type": "tn", "level": "TH", "tags": ["a"], "createdAt": 1, "updatedAt": 2, "grade": 12, "chapterId": "c2D1", "lessonId": "l2D11", "formId": "f2D111", "review": "approved" }).to_string()
    }

    fn app_json(n: i64) -> String {
        format!("{{\"schema\":3,\"questions\":[{}],\"nextSeq\":{},\"taxonomy\":null}}", (1..=n).map(q).collect::<Vec<_>>().join(","), n + 1)
    }

    const SIDE: &str = "{\"v\":1,\"recs\":[{\"a\":\"x\",\"b\":\"y\",\"d\":\"not_duplicate\"}],\"trash\":[{\"q\":{\"uid\":\"t1\",\"seq\":9,\"latex\":\"\\\\begin{ex}x\\\\end{ex}\"},\"at\":5}],\"gold\":[]}";

    fn setup(name: &str, n: i64, sidecar: bool) -> (PathBuf, SourceFiles) {
        let d = dir(name);
        let f = SourceFiles::in_data_dir(&d.join("data"));
        fs::write(&f.json, app_json(n)).unwrap();
        if sidecar {
            fs::write(&f.sidecar, SIDE).unwrap();
        }
        (d, f)
    }

    fn hashes(f: &SourceFiles) -> Vec<Option<String>> {
        f.all().iter().map(|p| fs::read(p).ok().map(|b| sha256_hex(&b))).collect()
    }

    fn no_leftovers(d: &Path) {
        for e in fs::read_dir(d.join("db")).into_iter().flatten().flatten() {
            let n = e.file_name().to_string_lossy().to_string();
            assert!(!n.contains(".tmp") && !n.ends_with("-wal") && !n.ends_with("-shm"), "còn tệp thừa: {n}");
        }
    }

    #[test]
    fn dau_thoi_gian_utc() {
        assert_eq!(utc_stamp(0), "19700101-000000");
        assert_eq!(utc_stamp(1_761_319_800), "20251024-153000");
        assert_eq!(utc_stamp(951_782_400), "20000229-000000");
    }

    #[test]
    fn chuyen_dung_nguyen_van_va_khong_dung_vao_tep_goc() {
        let (d, f) = setup("ok", 300, true);
        let before = hashes(&f);
        let pre = preflight(&f).unwrap();
        assert_eq!((pre.questions, pre.schema, pre.trash, pre.decisions, pre.gold), (300, 3, 1, 1, 0));
        let target = d.join("db").join("hedu.db");
        let rep = migrate(&f, &target, &d.join("backups")).unwrap();
        assert!(target.is_file());
        assert_eq!(hashes(&f), before, "tệp gốc không đổi một byte");
        // bản chụp nguyên trạng giống hệt
        for p in [&f.json, &f.sidecar] {
            let copy = rep.backup_dir.join(p.file_name().unwrap());
            assert_eq!(fs::read(&copy).unwrap(), fs::read(p).unwrap());
        }
        no_leftovers(&d);
        let db = Db::open(&target).unwrap();
        assert_eq!(db.count().unwrap(), 300);
        assert_eq!(db.get_question("u00000007").unwrap().unwrap(), q(7), "từng câu giống từng ký tự");
        assert_eq!(db.sidecar_get(SIDECAR_KEY).unwrap().as_deref(), Some(SIDE));
        assert_eq!(db.meta_get("nextSeq").unwrap().as_deref(), Some("301"));
        assert_eq!(db.meta_get("migrated_from").unwrap().as_deref(), Some(pre.sha_json.as_str()));
        assert_eq!(db.journal_count().unwrap(), 1);
        assert!(db.integrity_check().unwrap().ok);
    }

    #[test]
    fn xuat_nguoc_ra_json_giong_tung_byte() {
        let (d, f) = setup("xuat", 120, true);
        let target = d.join("db").join("hedu.db");
        migrate(&f, &target, &d.join("backups")).unwrap();
        let db = Db::open(&target).unwrap();
        let out = d.join("xuat");
        let rep = export_json(&db, &out).unwrap();
        assert_eq!(rep.questions, 120);
        assert_eq!(fs::read(out.join("hedu.json")).unwrap(), fs::read(&f.json).unwrap(), "hedu.json xuất ra giống tệp gốc từng byte");
        assert_eq!(fs::read(out.join("dup-decisions.json")).unwrap(), fs::read(&f.sidecar).unwrap());
        // không ghi đè
        assert!(matches!(export_json(&db, &out), Err(MigError::TargetExists(_))));
        // mở được lại bằng chính bộ đọc (như bản app cũ sẽ đọc)
        assert!(preflight(&SourceFiles::in_data_dir(&out)).is_ok());
    }

    #[test]
    fn tep_in_dep_va_khoa_la_van_giu_nguyen() {
        let d = dir("pretty");
        let f = SourceFiles::in_data_dir(&d.join("data"));
        let text = format!("{{\n  \"schema\": 3,\n  \"questions\": [\n    {},\n    {}\n  ],\n  \"nextSeq\": 3,\n  \"taxonomy\": null,\n  \"khoaLa\": {{\"x\": [1, 2]}}\n}}", q(1), q(2));
        fs::write(&f.json, &text).unwrap();
        let target = d.join("db").join("hedu.db");
        migrate(&f, &target, &d.join("backups")).unwrap();
        let db = Db::open(&target).unwrap();
        assert_eq!(db.get_question("u00000001").unwrap().unwrap(), q(1));
        let rep = export_json(&db, &d.join("xuat")).unwrap();
        let a: Value = serde_json::from_str(&text).unwrap();
        let b: Value = serde_json::from_slice(&fs::read(rep.json_path).unwrap()).unwrap();
        assert_eq!(a, b, "xuất ra tương đương về nội dung (kể cả khoá lạ), dù khác khoảng trắng");
    }

    #[test]
    fn thieu_tep_phu_va_nguon_cu_van_chuyen_duoc() {
        let (d, f) = setup("khong-phu", 5, false);
        let rep = migrate(&f, &d.join("db").join("hedu.db"), &d.join("backups")).unwrap();
        assert_eq!((rep.pre.trash, rep.pre.decisions), (0, 0));
        let db = Db::open(&rep.db_path).unwrap();
        assert_eq!(db.sidecar_get(SIDECAR_KEY).unwrap(), None);
        // bản đầu tiên chưa ghi schema ⇒ schema 1 giữ nguyên (giao diện nâng cấp khi nạp)
        let d2 = dir("v1");
        let f2 = SourceFiles::in_data_dir(&d2.join("data"));
        fs::write(&f2.json, format!("{{\"questions\":[{}]}}", q(1))).unwrap();
        let rep2 = migrate(&f2, &d2.join("db").join("hedu.db"), &d2.join("backups")).unwrap();
        assert_eq!(rep2.pre.schema, 1);
        assert_eq!(Db::open(&rep2.db_path).unwrap().meta_get("schema").unwrap().as_deref(), Some("1"));
        // ngân hàng trống
        let d3 = dir("trong");
        let f3 = SourceFiles::in_data_dir(&d3.join("data"));
        fs::write(&f3.json, app_json(0)).unwrap();
        let rep3 = migrate(&f3, &d3.join("db").join("hedu.db"), &d3.join("backups")).unwrap();
        assert_eq!(rep3.pre.questions, 0);
        assert!(Db::open(&rep3.db_path).unwrap().integrity_check().unwrap().ok);
    }

    #[test]
    fn dung_lai_khi_du_lieu_cu_co_van_de() {
        // không phải JSON và không có .bak
        let d = dir("hong");
        let f = SourceFiles::in_data_dir(&d.join("data"));
        fs::write(&f.json, "không phải json").unwrap();
        let t = d.join("db").join("hedu.db");
        assert!(matches!(migrate(&f, &t, &d.join("backups")), Err(MigError::Source(_))));
        assert!(!t.exists());
        assert!(!d.join("backups").exists() || fs::read_dir(d.join("backups")).unwrap().next().is_none(), "lỗi ở bước kiểm tra thì chưa tạo bản chụp");
        // chính hỏng nhưng .bak tốt ⇒ dùng .bak và báo
        fs::write(&f.json_bak, app_json(4)).unwrap();
        let rep = migrate(&f, &t, &d.join("backups")).unwrap();
        assert!(rep.pre.used_json_bak && rep.pre.warnings.iter().any(|w| w.contains(".bak")));
        // uid trùng
        let d2 = dir("trung-uid");
        let f2 = SourceFiles::in_data_dir(&d2.join("data"));
        fs::write(&f2.json, format!("{{\"schema\":3,\"questions\":[{},{}],\"nextSeq\":3,\"taxonomy\":null}}", q(1), q(1))).unwrap();
        assert!(matches!(migrate(&f2, &d2.join("db").join("hedu.db"), &d2.join("backups")), Err(MigError::Duplicate(_))));
        // seq trùng chỉ cảnh báo, vẫn chuyển đủ
        let d3 = dir("trung-seq");
        let f3 = SourceFiles::in_data_dir(&d3.join("data"));
        let mut b: Value = serde_json::from_str(&q(2)).unwrap();
        b["seq"] = 1.into();
        fs::write(&f3.json, format!("{{\"schema\":3,\"questions\":[{},{}],\"nextSeq\":3,\"taxonomy\":null}}", q(1), b)).unwrap();
        let rep3 = migrate(&f3, &d3.join("db").join("hedu.db"), &d3.join("backups")).unwrap();
        assert_eq!((rep3.pre.questions, rep3.pre.duplicate_seq_rows), (2, 2));
        // schema mới hơn
        let d4 = dir("moi-hon");
        let f4 = SourceFiles::in_data_dir(&d4.join("data"));
        fs::write(&f4.json, "{\"schema\":4,\"questions\":[],\"nextSeq\":1,\"taxonomy\":null}").unwrap();
        assert!(matches!(migrate(&f4, &d4.join("db").join("hedu.db"), &d4.join("backups")), Err(MigError::Newer(4))));
        // danh sách câu sai dạng, câu thiếu uid
        let d5 = dir("sai-dang");
        let f5 = SourceFiles::in_data_dir(&d5.join("data"));
        fs::write(&f5.json, "{\"schema\":3,\"questions\":{},\"nextSeq\":1}").unwrap();
        assert!(matches!(preflight(&f5), Err(MigError::Source(_))));
        fs::write(&f5.json, "{\"schema\":3,\"questions\":[{\"seq\":1}],\"nextSeq\":2}").unwrap();
        assert!(matches!(preflight(&f5), Err(MigError::Source(_))));
        // tệp phụ có mà hỏng ⇒ không chuyển (không bỏ quyết định của giáo viên)
        let (d6, f6) = setup("phu-hong", 3, false);
        fs::write(&f6.sidecar, "hỏng").unwrap();
        assert!(matches!(migrate(&f6, &d6.join("db").join("hedu.db"), &d6.join("backups")), Err(MigError::Source(_))));
    }

    #[test]
    fn khong_ghi_de_tep_dich_co_san() {
        let (d, f) = setup("dich-co-san", 3, true);
        fs::create_dir_all(d.join("db")).unwrap();
        let t = d.join("db").join("hedu.db");
        fs::write(&t, b"tep co san").unwrap();
        assert!(matches!(migrate(&f, &t, &d.join("backups")), Err(MigError::TargetExists(_))));
        assert_eq!(fs::read(&t).unwrap(), b"tep co san");
    }

    #[test]
    fn nguon_bi_doi_giua_chung_thi_huy() {
        let (d, f) = setup("doi", 10, true);
        let before = hashes(&f);
        let t = d.join("db").join("hedu.db");
        let json = f.json.clone();
        let mut change = || fs::write(&json, app_json(11)).unwrap();
        let mut h = Hooks { before_rename: Some(&mut change), ..Default::default() };
        let r = migrate_with(&f, &t, &d.join("backups"), &mut h);
        assert!(matches!(r, Err(MigError::SourceChanged)));
        assert!(!t.exists());
        no_leftovers(&d);
        assert_ne!(hashes(&f), before, "(tệp bị bên ngoài đổi — HEdu không phải người sửa)");
    }

    #[test]
    fn doi_chieu_bat_duoc_tep_moi_bi_sai() {
        let (d, f) = setup("sai", 50, true);
        let before = hashes(&f);
        let t = d.join("db").join("hedu.db");
        let mut tamper = |db: &mut Db| {
            let mut a: Value = serde_json::from_str(&q(9)).unwrap();
            a["latex"] = "\\begin{ex}bị sửa ngầm\\end{ex}".into();
            db.apply(&Batch { upserts: vec![a.to_string()], ..Default::default() }).unwrap();
        };
        let mut h = Hooks { before_verify: Some(&mut tamper), ..Default::default() };
        let r = migrate_with(&f, &t, &d.join("backups"), &mut h);
        assert!(matches!(r, Err(MigError::Verify(_))), "{r:?}");
        assert!(!t.exists(), "không đổi tên khi đối chiếu không đạt");
        no_leftovers(&d);
        assert_eq!(hashes(&f), before);
        // thiếu một câu
        let mut drop_one = |db: &mut Db| db.apply(&Batch { deletes: vec!["u00000003".into()], ..Default::default() }).unwrap();
        let mut h2 = Hooks { before_verify: Some(&mut drop_one), ..Default::default() };
        assert!(matches!(migrate_with(&f, &t, &d.join("backups"), &mut h2), Err(MigError::Verify(_))));
        // tệp phụ bị đổi
        let mut side = |db: &mut Db| db.apply(&Batch { sidecar: vec![(SIDECAR_KEY.into(), "{\"v\":1,\"recs\":[]}".into())], ..Default::default() }).unwrap();
        let mut h3 = Hooks { before_verify: Some(&mut side), ..Default::default() };
        assert!(matches!(migrate_with(&f, &t, &d.join("backups"), &mut h3), Err(MigError::Verify(_))));
        assert!(!t.exists());
        no_leftovers(&d);
    }

    #[test]
    fn don_tep_tam_sot_lai_tu_lan_truoc() {
        let (d, f) = setup("tam-sot", 5, false);
        fs::create_dir_all(d.join("db")).unwrap();
        fs::write(d.join("db").join("hedu.db.tmp"), b"du lieu do dang").unwrap();
        let rep = migrate(&f, &d.join("db").join("hedu.db"), &d.join("backups")).unwrap();
        assert!(rep.db_path.is_file());
        no_leftovers(&d);
    }

    #[test]
    fn hai_lan_chuyen_cung_luc_dung_ten_ban_chup_khac_nhau() {
        let (d, f) = setup("hai-lan", 3, false);
        let a = migrate(&f, &d.join("db").join("a.db"), &d.join("backups")).unwrap();
        let b = migrate(&f, &d.join("db").join("b.db"), &d.join("backups")).unwrap();
        assert_ne!(a.backup_dir, b.backup_dir, "bản chụp không đè lên nhau");
    }

    #[test]
    fn hai_muoi_nghin_cau() {
        let (d, f) = setup("20k", 20_000, true);
        let t0 = Instant::now();
        let rep = migrate(&f, &d.join("db").join("hedu.db"), &d.join("backups")).unwrap();
        let t1 = t0.elapsed();
        let db = Db::open(&rep.db_path).unwrap();
        let out = export_json(&db, &d.join("xuat")).unwrap();
        println!("20.000 câu: chuyển+đối chiếu {t1:?}, xuất+đối chiếu {:?}", t0.elapsed() - t1);
        assert_eq!(fs::read(out.json_path).unwrap(), fs::read(&f.json).unwrap());
    }

    /// Chạy tay: cargo test --lib -- --ignored sau_muoi_nghin --nocapture
    #[test]
    #[ignore]
    fn sau_muoi_nghin_cau() {
        let (d, f) = setup("60k", 60_000, true);
        let t0 = Instant::now();
        let rep = migrate(&f, &d.join("db").join("hedu.db"), &d.join("backups")).unwrap();
        println!("60.000 câu: chuyển+đối chiếu {:?} (báo cáo {} ms)", t0.elapsed(), rep.millis);
    }
}
