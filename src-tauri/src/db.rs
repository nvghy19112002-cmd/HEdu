//! Lớp lưu trữ SQLite của HEdu (PR S1 — CHƯA nối vào giao diện, CHƯA đụng dữ liệu người dùng; nối ở S3).
//!
//! Một tệp `hedu.db` = MỘT nguồn dữ liệu (ngân hàng câu hỏi + cây chương trình + tệp phụ). Nguyên tắc (xem claude/thiet-ke-sqlite.md):
//!   - mỗi câu lưu NGUYÊN VĂN JSON (cột `json`) ⇒ LaTeX và trường lạ không bao giờ bị đổi/mất; các cột khác chỉ để lập chỉ mục;
//!   - mọi lần ghi là MỘT giao dịch (hoặc ghi hết, hoặc không ghi gì); chế độ WAL + `synchronous=FULL` ⇒ mất điện không hỏng tệp;
//!   - khoá độc quyền: không mở cùng một tệp ở hai nơi; tệp lạ (không phải HEdu) hoặc của bản mới hơn bị TỪ CHỐI, không ghi gì vào chúng;
//!   - seq trùng KHÔNG làm lỗi lúc ghi (không bao giờ từ chối lưu câu của giáo viên); chỉ báo trong kiểm tra toàn vẹn.
//! Chỉ dùng được từ Rust: giao diện không chạy SQL tuỳ ý.
#![allow(dead_code)] // sẽ được các lệnh Tauri dùng ở PR S3

use rusqlite::{params, Connection, ErrorCode, OptionalExtension, TransactionBehavior};
use serde_json::Value;
use std::fmt;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// Nhận diện tệp của HEdu ("HEDU").
pub const APPLICATION_ID: i32 = 0x4845_4455;
/// Định dạng lưu (không phải schema logic của câu hỏi, vốn là 3 và nằm trong `meta`).
pub const FORMAT_VERSION: i32 = 1;
const MAX_JSON_BYTES: usize = 2_000_000;
const MAX_BATCH_QUESTIONS: usize = 200_000;

#[derive(Debug, PartialEq)]
pub enum DbError {
    /// tệp đang được mở ở nơi khác (hoặc bị khoá)
    Busy,
    /// không phải tệp của HEdu — không ghi gì vào tệp này
    NotHedu,
    /// tệp thuộc định dạng mới hơn bản app này
    Newer(i32),
    /// tệp hỏng hoặc không đọc được như cơ sở dữ liệu
    Corrupt(String),
    /// yêu cầu sai (JSON câu hỏi thiếu uid/seq, quá lớn…) — không ghi gì
    Invalid(String),
    /// tệp đã tồn tại / không tồn tại, lỗi đĩa…
    Io(String),
}

impl fmt::Display for DbError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DbError::Busy => write!(f, "Nguồn dữ liệu này đang được mở ở nơi khác (hoặc bị khoá). Hãy đóng nơi kia rồi thử lại."),
            DbError::NotHedu => write!(f, "Đây không phải tệp dữ liệu của HEdu nên không mở."),
            DbError::Newer(v) => write!(f, "Tệp dữ liệu thuộc định dạng {v}, mới hơn bản HEdu này. Hãy cập nhật HEdu; tệp không bị sửa."),
            DbError::Corrupt(m) => write!(f, "Tệp dữ liệu bị hỏng hoặc không đọc được: {m}"),
            DbError::Invalid(m) => write!(f, "Dữ liệu không hợp lệ, chưa ghi gì: {m}"),
            DbError::Io(m) => write!(f, "Lỗi đọc/ghi tệp: {m}"),
        }
    }
}

impl From<rusqlite::Error> for DbError {
    fn from(e: rusqlite::Error) -> Self {
        match e.sqlite_error_code() {
            Some(ErrorCode::DatabaseBusy) | Some(ErrorCode::DatabaseLocked) => DbError::Busy,
            Some(ErrorCode::NotADatabase) | Some(ErrorCode::DatabaseCorrupt) => DbError::Corrupt(e.to_string()),
            _ => DbError::Io(e.to_string()),
        }
    }
}

type R<T> = Result<T, DbError>;

pub fn now_secs() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

/// Một lô thay đổi, ghi trong MỘT giao dịch: xoá trước, rồi thêm/sửa câu, rồi `meta` và `sidecar`.
#[derive(Default, Debug)]
pub struct Batch {
    /// JSON nguyên văn của từng câu (phải có `uid` chuỗi và `seq` số nguyên)
    pub upserts: Vec<String>,
    pub deletes: Vec<String>,
    pub meta: Vec<(String, String)>,
    pub sidecar: Vec<(String, String)>,
}

#[derive(Debug, PartialEq)]
pub struct QuestionRow {
    pub seq: i64,
    pub uid: String,
    pub json: String,
}

#[derive(Debug)]
pub struct IntegrityReport {
    pub ok: bool,
    pub messages: Vec<String>,
    pub questions: i64,
    /// số câu có seq trùng với câu khác (không làm hỏng dữ liệu, nhưng cần báo)
    pub duplicate_seq: i64,
    /// tệp thật sự bị hỏng (cấu trúc SQLite hoặc JSON câu không đọc được) — khác với seq trùng, vốn chỉ là cảnh báo
    pub damaged: bool,
}

pub struct Db {
    conn: Connection,
}

impl Db {
    /// Tạo tệp MỚI. Từ chối nếu tệp đã có (không bao giờ ghi đè).
    pub fn create(path: &Path) -> R<Db> {
        if path.exists() {
            return Err(DbError::Io("Tệp đã tồn tại, không ghi đè.".into()));
        }
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| DbError::Io(e.to_string()))?;
        }
        let conn = Connection::open(path)?;
        let mut db = Db { conn };
        if let Err(e) = db.init_new() {
            drop(db);
            let _ = std::fs::remove_file(path); // tệp mới dở dang: bỏ đi, không để lại tệp hỏng
            let _ = std::fs::remove_file(path.with_extension("db-wal"));
            let _ = std::fs::remove_file(path.with_extension("db-shm"));
            return Err(e);
        }
        Ok(db)
    }

    /// Mở tệp CÓ SẴN. Kiểm nhận diện + phiên bản TRƯỚC khi đổi bất cứ cài đặt nào của tệp.
    pub fn open(path: &Path) -> R<Db> {
        if !path.is_file() {
            return Err(DbError::Io("Không tìm thấy tệp dữ liệu.".into()));
        }
        let conn = Connection::open(path)?;
        let app_id: i32 = conn.query_row("PRAGMA application_id", [], |r| r.get(0)).map_err(map_open)?;
        let ver: i32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).map_err(map_open)?;
        if app_id != APPLICATION_ID {
            return Err(DbError::NotHedu);
        }
        if ver > FORMAT_VERSION {
            return Err(DbError::Newer(ver));
        }
        let db = Db { conn };
        db.configure()?;
        let q: String = db.conn.query_row("PRAGMA quick_check", [], |r| r.get(0))?;
        if q != "ok" {
            return Err(DbError::Corrupt(q));
        }
        Ok(db)
    }

    fn configure(&self) -> R<()> {
        // khoá độc quyền TRƯỚC khi vào WAL (WAL độc quyền không cần bộ nhớ chung giữa các tiến trình)
        self.conn.query_row("PRAGMA locking_mode=EXCLUSIVE", [], |_| Ok(()))?;
        self.conn.query_row("PRAGMA journal_mode=WAL", [], |_| Ok(()))?;
        self.conn.execute_batch("PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;")?;
        Ok(())
    }

    fn init_new(&mut self) -> R<()> {
        self.configure()?;
        let tx = self.conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        tx.execute_batch(&format!(
            "PRAGMA application_id={APPLICATION_ID};
             PRAGMA user_version={FORMAT_VERSION};
             CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
             CREATE TABLE questions(
               id INTEGER PRIMARY KEY,
               uid TEXT NOT NULL UNIQUE,
               seq INTEGER NOT NULL,
               grade INTEGER, chapter_id TEXT, lesson_id TEXT, form_id TEXT,
               level TEXT, type TEXT, review TEXT, updated_at INTEGER,
               json TEXT NOT NULL);
             CREATE INDEX questions_seq ON questions(seq, uid);
             CREATE INDEX questions_loc ON questions(grade, chapter_id, lesson_id, form_id);
             CREATE TABLE sidecar(key TEXT PRIMARY KEY, json TEXT NOT NULL) WITHOUT ROWID;
             CREATE TABLE journal(id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, kind TEXT NOT NULL, detail TEXT NOT NULL);"
        ))?;
        tx.execute("INSERT INTO meta(key,value) VALUES('format_version', ?1), ('created_at', ?2)", params![FORMAT_VERSION.to_string(), now_secs().to_string()])?;
        tx.commit()?;
        Ok(())
    }

    /// Ghi MỘT lô trong một giao dịch. Lỗi ở bất kỳ phần nào ⇒ KHÔNG ghi gì cả.
    pub fn apply(&mut self, b: &Batch) -> R<()> {
        if b.upserts.len() > MAX_BATCH_QUESTIONS || b.deletes.len() > MAX_BATCH_QUESTIONS {
            return Err(DbError::Invalid("Lô thay đổi quá lớn.".into()));
        }
        // kiểm hết trước khi mở giao dịch: dữ liệu sai không bao giờ chạm tới tệp
        let mut rows = Vec::with_capacity(b.upserts.len());
        for j in &b.upserts {
            rows.push(parse_row(j)?);
        }
        for (k, v) in b.meta.iter().chain(b.sidecar.iter()) {
            if k.is_empty() || k.len() > 100 || v.len() > 64_000_000 {
                return Err(DbError::Invalid("Khoá hoặc giá trị meta/tệp phụ không hợp lệ.".into()));
            }
        }
        let tx = self.conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        {
            let mut del = tx.prepare_cached("DELETE FROM questions WHERE uid=?1")?;
            for u in &b.deletes {
                del.execute(params![u])?;
            }
            let mut up = tx.prepare_cached(
                "INSERT INTO questions(uid,seq,grade,chapter_id,lesson_id,form_id,level,type,review,updated_at,json)
                 VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
                 ON CONFLICT(uid) DO UPDATE SET seq=?2,grade=?3,chapter_id=?4,lesson_id=?5,form_id=?6,level=?7,type=?8,review=?9,updated_at=?10,json=?11",
            )?;
            for r in &rows {
                up.execute(params![r.uid, r.seq, r.grade, r.chapter_id, r.lesson_id, r.form_id, r.level, r.qtype, r.review, r.updated_at, r.json])?;
            }
            let mut m = tx.prepare_cached("INSERT INTO meta(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=?2")?;
            for (k, v) in &b.meta {
                m.execute(params![k, v])?;
            }
            let mut s = tx.prepare_cached("INSERT INTO sidecar(key,json) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET json=?2")?;
            for (k, v) in &b.sidecar {
                s.execute(params![k, v])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    pub fn count(&self) -> R<i64> {
        Ok(self.conn.query_row("SELECT COUNT(*) FROM questions", [], |r| r.get(0))?)
    }

    /// Đọc một trang câu theo thứ tự (seq, uid); `after` = (seq, uid) của câu cuối trang trước. Không dùng OFFSET nên trang nào cũng nhanh.
    pub fn page(&self, after: Option<(i64, &str)>, limit: usize) -> R<Vec<QuestionRow>> {
        let limit = limit.clamp(1, 20_000) as i64;
        let map = |r: &rusqlite::Row<'_>| Ok(QuestionRow { seq: r.get(0)?, uid: r.get(1)?, json: r.get(2)? });
        let rows = match after {
            None => {
                let mut st = self.conn.prepare_cached("SELECT seq,uid,json FROM questions ORDER BY seq,uid LIMIT ?1")?;
                let v = st.query_map(params![limit], map)?.collect::<Result<Vec<_>, _>>()?;
                v
            }
            Some((s, u)) => {
                let mut st = self.conn.prepare_cached("SELECT seq,uid,json FROM questions WHERE (seq,uid) > (?1,?2) ORDER BY seq,uid LIMIT ?3")?;
                let v = st.query_map(params![s, u, limit], map)?.collect::<Result<Vec<_>, _>>()?;
                v
            }
        };
        Ok(rows)
    }

    pub fn get_question(&self, uid: &str) -> R<Option<String>> {
        Ok(self.conn.query_row("SELECT json FROM questions WHERE uid=?1", params![uid], |r| r.get(0)).optional()?)
    }

    pub fn meta_get(&self, key: &str) -> R<Option<String>> {
        Ok(self.conn.query_row("SELECT value FROM meta WHERE key=?1", params![key], |r| r.get(0)).optional()?)
    }

    /// Các dòng meta có khoá bắt đầu bằng `prefix` (trả về khoá đã bỏ tiền tố), xếp theo khoá.
    pub fn meta_prefix(&self, prefix: &str) -> R<Vec<(String, String)>> {
        let mut st = self.conn.prepare("SELECT key,value FROM meta WHERE substr(key,1,?1)=?2 ORDER BY key")?;
        let n = prefix.chars().count() as i64;
        let rows = st.query_map(params![n, prefix], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?.collect::<Result<Vec<_>, _>>()?;
        Ok(rows.into_iter().map(|(k, v)| (k[prefix.len()..].to_string(), v)).collect())
    }

    pub fn sidecar_get(&self, key: &str) -> R<Option<String>> {
        Ok(self.conn.query_row("SELECT json FROM sidecar WHERE key=?1", params![key], |r| r.get(0)).optional()?)
    }

    /// Nhật ký ngắn (chuyển dữ liệu, sao lưu, khôi phục…). KHÔNG ghi nội dung câu hỏi hay khoá API vào đây.
    pub fn journal_add(&mut self, kind: &str, detail: &str) -> R<()> {
        let d: String = detail.chars().take(500).collect();
        self.conn.execute("INSERT INTO journal(at,kind,detail) VALUES(?1,?2,?3)", params![now_secs(), kind, d])?;
        Ok(())
    }

    pub fn journal_count(&self) -> R<i64> {
        Ok(self.conn.query_row("SELECT COUNT(*) FROM journal", [], |r| r.get(0))?)
    }

    /// Kiểm toàn vẹn ĐẦY ĐỦ (chậm hơn `quick_check`): cấu trúc tệp, JSON từng câu đọc được và khớp uid/seq, seq trùng.
    pub fn integrity_check(&self) -> R<IntegrityReport> {
        let mut messages = Vec::new();
        let mut damaged = false;
        let mut st = self.conn.prepare("PRAGMA integrity_check")?;
        let lines = st.query_map([], |r| r.get::<_, String>(0))?.collect::<Result<Vec<_>, _>>()?;
        if !(lines.len() == 1 && lines[0] == "ok") {
            damaged = true;
            messages.extend(lines);
        }
        let questions = self.count()?;
        let duplicate_seq: i64 = self.conn.query_row(
            "SELECT COALESCE(SUM(c),0) FROM (SELECT COUNT(*) AS c FROM questions GROUP BY seq HAVING COUNT(*) > 1)",
            [],
            |r| r.get(0),
        )?;
        if duplicate_seq > 0 {
            messages.push(format!("{duplicate_seq} câu có số thứ tự trùng với câu khác."));
        }
        let mut bad = 0;
        let mut after: Option<(i64, String)> = None;
        loop {
            let page = self.page(after.as_ref().map(|(s, u)| (*s, u.as_str())), 2000)?;
            if page.is_empty() {
                break;
            }
            for r in &page {
                match parse_row(&r.json) {
                    Ok(p) if p.uid == r.uid && p.seq == r.seq => {}
                    _ => bad += 1,
                }
            }
            let last = page.last().unwrap();
            after = Some((last.seq, last.uid.clone()));
        }
        if bad > 0 {
            damaged = true;
            messages.push(format!("{bad} câu có nội dung lưu không đọc được hoặc không khớp mã."));
        }
        Ok(IntegrityReport { ok: messages.is_empty(), messages, questions, duplicate_seq, damaged })
    }

    /// Chụp một bản nhất quán (gọn, không kèm WAL) ra `dest` bằng `VACUUM INTO` — dùng được khi nguồn đang mở. `dest` phải chưa tồn tại.
    pub fn snapshot_to(&self, dest: &Path) -> R<()> {
        self.conn.execute("VACUUM INTO ?1", params![dest.to_string_lossy().to_string()])?;
        Ok(())
    }

    /// Đóng sạch: gộp nhật ký WAL vào tệp chính (không bắt buộc, chỉ để tệp gọn khi sao chép).
    pub fn close(self) -> R<()> {
        let _ = self.conn.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |_| Ok(()));
        self.conn.close().map_err(|(_, e)| DbError::from(e))
    }
}

/// (uid, seq) của một câu theo đúng luật của lớp lưu trữ; dùng khi kiểm tra dữ liệu nguồn trước khi chuyển.
pub fn question_key(json: &str) -> R<(String, i64)> {
    let p = parse_row(json)?;
    Ok((p.uid, p.seq))
}

fn map_open(e: rusqlite::Error) -> DbError {
    match e.sqlite_error_code() {
        Some(ErrorCode::DatabaseBusy) | Some(ErrorCode::DatabaseLocked) => DbError::Busy,
        // tệp không phải SQLite (hoặc hỏng ngay phần đầu): không biết là tệp gì ⇒ coi là không phải tệp HEdu
        Some(ErrorCode::NotADatabase) => DbError::NotHedu,
        Some(ErrorCode::DatabaseCorrupt) => DbError::Corrupt(e.to_string()),
        _ => DbError::Io(e.to_string()),
    }
}

struct Parsed {
    uid: String,
    seq: i64,
    grade: Option<i64>,
    chapter_id: Option<String>,
    lesson_id: Option<String>,
    form_id: Option<String>,
    level: Option<String>,
    qtype: Option<String>,
    review: Option<String>,
    updated_at: Option<i64>,
    json: String,
}

/// Đọc các cột lập chỉ mục từ JSON của câu; JSON gốc được giữ NGUYÊN VĂN (không dựng lại).
fn parse_row(json: &str) -> R<Parsed> {
    if json.len() > MAX_JSON_BYTES {
        return Err(DbError::Invalid("Một câu quá lớn.".into()));
    }
    let v: Value = serde_json::from_str(json).map_err(|_| DbError::Invalid("JSON của câu không đọc được.".into()))?;
    let o = v.as_object().ok_or_else(|| DbError::Invalid("Câu phải là một đối tượng JSON.".into()))?;
    let uid = o.get("uid").and_then(Value::as_str).filter(|s| !s.is_empty() && s.len() <= 200).ok_or_else(|| DbError::Invalid("Câu thiếu uid hợp lệ.".into()))?;
    let seq = o.get("seq").and_then(Value::as_i64).ok_or_else(|| DbError::Invalid("Câu thiếu số thứ tự (seq).".into()))?;
    let s = |k: &str| o.get(k).and_then(Value::as_str).map(str::to_string);
    Ok(Parsed {
        uid: uid.to_string(),
        seq,
        grade: o.get("grade").and_then(Value::as_i64),
        chapter_id: s("chapterId"),
        lesson_id: s("lessonId"),
        form_id: s("formId"),
        level: s("level"),
        qtype: s("type"),
        review: s("review"),
        updated_at: o.get("updatedAt").and_then(Value::as_i64),
        json: json.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::Instant;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("hedu-db-test-{}-{}", std::process::id(), name));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d.join("hedu.db")
    }

    /// Câu có đủ ký tự khó: gạch chéo ngược, ngoặc, Unicode tiếng Việt, \immini, tikz, % …
    fn q(i: i64, extra: &str) -> String {
        let latex = format!("\\begin{{ex}}%[2D1H1-1]\n  Câu {i}: $\\dfrac{{1}}{{2}}$ \\immini{{x}}{{\\begin{{tikzpicture}}\\def\\a{{1}}\\draw (0,0)--(1,1);\\end{{tikzpicture}}}} {extra}\n  \\loigiai{{ý \"kép\" \\\\ ✓}}\n\\end{{ex}}");
        serde_json::json!({ "uid": format!("u{i:08}"), "seq": i, "latex": latex, "type": "tn", "level": "TH", "tags": ["a", "b"], "createdAt": 1, "updatedAt": 2, "grade": 12, "chapterId": "c2D1", "lessonId": "l2D11", "formId": "f2D111", "review": "needs_fix", "trườngMới": {"x": [1, 2, null]} }).to_string()
    }

    fn batch(from: i64, to: i64) -> Batch {
        Batch { upserts: (from..to).map(|i| q(i, "")).collect(), ..Default::default() }
    }

    #[test]
    fn tao_ghi_doc_lai_nguyen_van() {
        let p = tmp("nguyen-van");
        let mut db = Db::create(&p).unwrap();
        let mut b = batch(1, 51);
        b.meta.push(("nextSeq".into(), "51".into()));
        b.sidecar.push(("dup-decisions".into(), "{\"v\":1,\"recs\":[]}".into()));
        db.apply(&b).unwrap();
        db.close().unwrap();
        let db = Db::open(&p).unwrap();
        assert_eq!(db.count().unwrap(), 50);
        let rows = db.page(None, 100).unwrap();
        assert_eq!(rows.len(), 50);
        for (i, r) in rows.iter().enumerate() {
            assert_eq!(r.json, q(i as i64 + 1, ""), "từng câu phải giống từng ký tự (LaTeX, trường lạ, Unicode)");
        }
        assert_eq!(db.meta_get("nextSeq").unwrap().as_deref(), Some("51"));
        assert_eq!(db.sidecar_get("dup-decisions").unwrap().as_deref(), Some("{\"v\":1,\"recs\":[]}"));
        assert_eq!(db.meta_get("khong-co").unwrap(), None);
        assert!(db.integrity_check().unwrap().ok);
    }

    #[test]
    fn doc_theo_trang_khong_sot_khong_lap() {
        let p = tmp("trang");
        let mut db = Db::create(&p).unwrap();
        db.apply(&batch(1, 5001)).unwrap();
        let mut got = Vec::new();
        let mut after: Option<(i64, String)> = None;
        loop {
            let page = db.page(after.as_ref().map(|(s, u)| (*s, u.as_str())), 700).unwrap();
            if page.is_empty() { break; }
            let l = page.last().unwrap();
            after = Some((l.seq, l.uid.clone()));
            got.extend(page.into_iter().map(|r| r.seq));
        }
        assert_eq!(got.len(), 5000);
        assert!(got.windows(2).all(|w| w[0] < w[1]), "đúng thứ tự seq, không lặp");
        assert_eq!(got[0], 1);
        assert_eq!(*got.last().unwrap(), 5000);
    }

    #[test]
    fn sua_xoa_va_thay_the() {
        let p = tmp("sua-xoa");
        let mut db = Db::create(&p).unwrap();
        db.apply(&batch(1, 11)).unwrap();
        let mut b = Batch::default();
        b.upserts.push(q(3, "ĐÃ SỬA"));
        b.deletes.push("u00000005".into());
        db.apply(&b).unwrap();
        assert_eq!(db.count().unwrap(), 9);
        assert!(db.get_question("u00000003").unwrap().unwrap().contains("ĐÃ SỬA"));
        assert_eq!(db.get_question("u00000005").unwrap(), None);
        db.apply(&Batch { deletes: vec!["khong-co".into()], ..Default::default() }).unwrap(); // xoá cái không có: không lỗi
        assert_eq!(db.count().unwrap(), 9);
    }

    #[test]
    fn loi_giua_lo_khong_ghi_gi_ca() {
        let p = tmp("nguyen-tu");
        let mut db = Db::create(&p).unwrap();
        db.apply(&batch(1, 6)).unwrap();
        // câu thứ 3 trong lô thiếu seq ⇒ cả lô bị từ chối, câu 1–2 của lô cũng không được ghi
        let mut b = batch(100, 102);
        b.upserts.push("{\"uid\":\"hong\"}".into());
        b.deletes.push("u00000001".into());
        b.meta.push(("nextSeq".into(), "999".into()));
        assert!(matches!(db.apply(&b), Err(DbError::Invalid(_))));
        assert_eq!(db.count().unwrap(), 5, "không ghi, không xoá gì");
        assert!(db.get_question("u00000001").unwrap().is_some());
        assert_eq!(db.meta_get("nextSeq").unwrap(), None);
        for bad in ["không phải json", "[1]", "{\"uid\":\"\",\"seq\":1}", "{\"uid\":\"a\",\"seq\":\"1\"}", "{\"seq\":1}"] {
            assert!(db.apply(&Batch { upserts: vec![bad.into()], ..Default::default() }).is_err(), "{bad}");
        }
        assert_eq!(db.count().unwrap(), 5);
    }

    #[test]
    fn seq_trung_khong_lam_mat_cau() {
        let p = tmp("seq-trung");
        let mut db = Db::create(&p).unwrap();
        let mut a: Value = serde_json::from_str(&q(7, "")).unwrap();
        a["uid"] = "u-khac".into();
        db.apply(&Batch { upserts: vec![q(7, ""), a.to_string()], ..Default::default() }).unwrap();
        assert_eq!(db.count().unwrap(), 2, "vẫn lưu cả hai câu");
        let rep = db.integrity_check().unwrap();
        assert!(!rep.ok && rep.duplicate_seq == 2, "chỉ báo trong kiểm tra toàn vẹn");
    }

    #[test]
    fn mo_lai_giu_du_lieu_va_nhat_ky() {
        let p = tmp("nhat-ky");
        {
            let mut db = Db::create(&p).unwrap();
            db.apply(&batch(1, 4)).unwrap();
            db.journal_add("thu", "đã ghi 3 câu").unwrap();
            // KHÔNG close: giống tắt app đột ngột sau khi đã commit
        }
        let db = Db::open(&p).unwrap();
        assert_eq!(db.count().unwrap(), 3);
        assert_eq!(db.journal_count().unwrap(), 1);
    }

    #[test]
    fn khong_mo_cung_mot_tep_hai_noi() {
        let p = tmp("khoa");
        let db = Db::create(&p).unwrap();
        assert_eq!(Db::open(&p).err(), Some(DbError::Busy), "đang mở ở nơi khác ⇒ từ chối, không ghi");
        assert!(Db::create(&p).is_err(), "không tạo đè lên tệp có sẵn");
        db.close().unwrap();
        assert!(Db::open(&p).is_ok(), "đóng rồi thì mở lại được");
    }

    #[test]
    fn tu_choi_tep_la_va_ban_moi_hon_ma_khong_ghi_gi() {
        // tệp SQLite thường (không phải HEdu)
        let p = tmp("la");
        {
            let c = Connection::open(&p).unwrap();
            c.execute_batch("CREATE TABLE x(a); INSERT INTO x VALUES(1);").unwrap();
        }
        let before = std::fs::read(&p).unwrap();
        assert_eq!(Db::open(&p).err(), Some(DbError::NotHedu));
        assert_eq!(std::fs::read(&p).unwrap(), before, "tệp lạ không bị đổi một byte");
        assert!(!p.with_extension("db-wal").exists());
        // tệp văn bản
        let t = tmp("van-ban");
        std::fs::write(&t, b"day khong phai co so du lieu, chi la mot tep van ban dai hon muoi sau byte").unwrap();
        assert!(matches!(Db::open(&t).err(), Some(DbError::NotHedu) | Some(DbError::Corrupt(_))));
        // định dạng mới hơn
        let n = tmp("moi-hon");
        {
            let c = Connection::open(&n).unwrap();
            c.execute_batch(&format!("PRAGMA application_id={APPLICATION_ID}; PRAGMA user_version={}; CREATE TABLE x(a);", FORMAT_VERSION + 1)).unwrap();
        }
        assert_eq!(Db::open(&n).err(), Some(DbError::Newer(FORMAT_VERSION + 1)));
        // không có tệp
        assert!(matches!(Db::open(&tmp("khong-co")).err(), Some(DbError::Io(_))));
    }

    #[test]
    fn phat_hien_tep_bi_cat_hoac_hong() {
        let p = tmp("hong");
        {
            let mut db = Db::create(&p).unwrap();
            db.apply(&batch(1, 3001)).unwrap();
            db.close().unwrap();
        }
        let full = std::fs::read(&p).unwrap();
        // cắt bớt giữa tệp
        std::fs::write(&p, &full[..full.len() / 2]).unwrap();
        match Db::open(&p) {
            Err(_) => {}
            Ok(db) => assert!(!db.integrity_check().map(|r| r.ok).unwrap_or(false), "tệp bị cắt phải bị phát hiện"),
        }
        // ghi đè một đoạn giữa bằng rác
        let mut bad = full.clone();
        let mid = bad.len() / 2;
        for b in &mut bad[mid..mid + 4096] { *b = 0xAB; }
        std::fs::write(&p, &bad).unwrap();
        match Db::open(&p) {
            Err(_) => {}
            Ok(db) => assert!(!db.integrity_check().map(|r| r.ok).unwrap_or(false), "tệp bị ghi rác phải bị phát hiện"),
        }
    }

    #[test]
    fn hieu_nang_muoi_nghin_cau() {
        let p = tmp("tai");
        let mut db = Db::create(&p).unwrap();
        let t0 = Instant::now();
        for k in 0..10 {
            db.apply(&batch(k * 1000 + 1, (k + 1) * 1000 + 1)).unwrap();
        }
        let ghi = t0.elapsed();
        // sửa MỘT câu: phải nhanh, không phụ thuộc cỡ ngân hàng
        let t1 = Instant::now();
        db.apply(&Batch { upserts: vec![q(5000, "sửa")], ..Default::default() }).unwrap();
        let mot = t1.elapsed();
        let t2 = Instant::now();
        let mut n = 0;
        let mut after: Option<(i64, String)> = None;
        loop {
            let page = db.page(after.as_ref().map(|(s, u)| (*s, u.as_str())), 2000).unwrap();
            if page.is_empty() { break; }
            let l = page.last().unwrap();
            after = Some((l.seq, l.uid.clone()));
            n += page.len();
        }
        let doc = t2.elapsed();
        println!("10.000 câu: ghi {ghi:?}, sửa một câu {mot:?}, đọc hết {doc:?}");
        assert_eq!(n, 10_000);
        assert!(mot.as_millis() < 1500, "sửa một câu quá chậm: {mot:?}");
        assert!(doc.as_secs() < 10);
        assert!(db.integrity_check().unwrap().ok);
    }

    // ---- "Tắt đột ngột": tiến trình con ghi từng lô rồi bị giết; tiến trình cha mở lại kiểm tra ----

    const BATCH: i64 = 40;

    /// Chỉ chạy khi được tiến trình cha gọi (có biến môi trường); bình thường bỏ qua.
    #[test]
    #[ignore]
    fn tien_trinh_con_ghi_lien_tuc() {
        let Ok(path) = std::env::var("HEDU_DB_CHILD") else { return };
        let path = PathBuf::from(path);
        let progress = path.with_file_name("progress.txt");
        let mut db = Db::create(&path).unwrap();
        let big = "x".repeat(20_000);
        for b in 0..100_000i64 {
            let mut batch = Batch { upserts: (0..BATCH).map(|i| q(b * BATCH + i + 1, &big)).collect(), ..Default::default() };
            batch.meta.push(("last_batch".into(), b.to_string()));
            db.apply(&batch).unwrap();
            std::fs::write(&progress, b.to_string()).unwrap();
        }
    }

    #[test]
    fn tat_dot_ngot_giua_luc_ghi_khong_hong_khong_ghi_nua_lo() {
        for round in 0..3u64 {
            let p = tmp(&format!("kill-{round}"));
            let progress = p.with_file_name("progress.txt");
            let mut child = std::process::Command::new(std::env::current_exe().unwrap())
                .args(["--ignored", "--exact", "db::tests::tien_trinh_con_ghi_lien_tuc", "--nocapture", "--test-threads=1"])
                .env("HEDU_DB_CHILD", &p)
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn()
                .unwrap();
            let start = Instant::now();
            loop {
                let done = std::fs::read_to_string(&progress).ok().and_then(|s| s.trim().parse::<i64>().ok()).unwrap_or(-1);
                if done >= 6 + round as i64 * 3 { break; }
                assert!(start.elapsed().as_secs() < 60, "tiến trình con không ghi được");
                std::thread::sleep(std::time::Duration::from_millis(5));
            }
            std::thread::sleep(std::time::Duration::from_millis(7 * (round + 1))); // giết ở lúc khác nhau, thường giữa một lô
            child.kill().unwrap();
            let _ = child.wait();
            let db = Db::open(&p).expect("sau khi bị giết phải mở lại được");
            let last: i64 = db.meta_get("last_batch").unwrap().expect("đã có lô được ghi").parse().unwrap();
            let count = db.count().unwrap();
            assert_eq!(count, (last + 1) * BATCH, "chỉ có các lô ĐÃ ghi trọn; không có lô ghi dở (vòng {round})");
            let rep = db.integrity_check().unwrap();
            assert!(rep.ok, "{:?}", rep.messages);
        }
    }
}
