//! Sao lưu / khôi phục cho nguồn SQLite (PR S4). Lõi thuần (không phụ thuộc Tauri) để kiểm thử độc lập.
//!   - bản chụp nhất quán bằng `VACUUM INTO` (kể cả khi app đang mở), LUÔN kiểm tra lại (toàn vẹn + số câu) trước khi coi là xong;
//!   - **điểm khôi phục** tự động trước thao tác dễ mất dữ liệu: giữ tối đa 5 bản mới nhất, tự xoá bản cũ nhất;
//!   - **sao lưu trước cập nhật**: đúng MỘT bản (`backups/before-update/`), dựng ở thư mục tạm rồi mới thay bản cũ;
//!   - khôi phục luôn qua tệp tạm đã kiểm tra, tự chụp "điểm trước khi khôi phục", bấm nhầm quay lại được.
//! Việc đóng/mở lại kết nối đang dùng do `dbcmd.rs` lo; ở đây các hàm đổi tệp yêu cầu nguồn ĐÃ ĐÓNG.
#![allow(dead_code)]

use crate::db::{now_secs, Db, DbError};
use crate::jsonmig::{sha256_hex, utc_stamp};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};

pub const KEEP_POINTS: usize = 5;
/// Lý do được phép (chỉ chữ ASCII — dùng thẳng làm một phần tên tệp, không để giao diện chèn đường dẫn).
pub const REASONS: [&str; 6] = ["nhap-hang-loat", "xoa-hang-loat", "don-sach-thung-rac", "khoi-phuc-tu-tep", "truoc-khoi-phuc", "thu-cong"];

type R<T> = Result<T, DbError>;

fn io(e: std::io::Error) -> DbError {
    DbError::Io(e.to_string())
}

#[derive(Debug, Clone, PartialEq)]
pub struct Manifest {
    pub kind: String,
    pub reason: String,
    pub at: i64,
    pub questions: i64,
    pub sha256: String,
    pub bytes: u64,
    pub app_version: String,
}

impl Manifest {
    fn to_json(&self) -> String {
        json!({ "kind": self.kind, "reason": self.reason, "at": self.at, "questions": self.questions, "sha256": self.sha256, "bytes": self.bytes, "appVersion": self.app_version }).to_string()
    }
    fn from_json(t: &str) -> Option<Manifest> {
        let v: Value = serde_json::from_str(t).ok()?;
        Some(Manifest {
            kind: v.get("kind")?.as_str()?.to_string(),
            reason: v.get("reason").and_then(Value::as_str).unwrap_or("").to_string(),
            at: v.get("at")?.as_i64()?,
            questions: v.get("questions")?.as_i64()?,
            sha256: v.get("sha256")?.as_str()?.to_string(),
            bytes: v.get("bytes")?.as_u64()?,
            app_version: v.get("appVersion").and_then(Value::as_str).unwrap_or("").to_string(),
        })
    }
}

fn with_suffix(p: &Path, suffix: &str) -> PathBuf {
    let mut s = p.as_os_str().to_owned();
    s.push(suffix);
    PathBuf::from(s)
}

fn remove_sidefiles(p: &Path) {
    for s in ["-wal", "-shm", "-journal"] {
        let _ = fs::remove_file(with_suffix(p, s));
    }
}

/// Chụp nguồn đang mở ra `dest` (thay tệp cũ nếu có), kiểm tra bản chụp rồi mới đổi tên. Lỗi ⇒ không để lại tệp dở.
pub fn snapshot_verified(db: &Db, dest: &Path, kind: &str, reason: &str, app_version: &str) -> R<Manifest> {
    if let Some(dir) = dest.parent() {
        fs::create_dir_all(dir).map_err(io)?;
    }
    let tmp = with_suffix(dest, ".part");
    let _ = fs::remove_file(&tmp);
    remove_sidefiles(&tmp);
    let built = (|| -> R<(i64, String, u64)> {
        db.snapshot_to(&tmp)?;
        let s = Db::open(&tmp)?;
        let rep = s.integrity_check()?;
        if rep.damaged {
            return Err(DbError::Corrupt(format!("bản chụp không qua kiểm toàn vẹn: {}", rep.messages.join("; "))));
        }
        let want = db.count()?;
        if rep.questions != want {
            return Err(DbError::Corrupt(format!("bản chụp thiếu câu ({}/{want})", rep.questions)));
        }
        s.close()?;
        let bytes = fs::read(&tmp).map_err(io)?;
        Ok((want, sha256_hex(&bytes), bytes.len() as u64))
    })();
    let (questions, sha, size) = match built {
        Ok(x) => x,
        Err(e) => {
            let _ = fs::remove_file(&tmp);
            remove_sidefiles(&tmp);
            return Err(e);
        }
    };
    remove_sidefiles(&tmp);
    if let Err(e) = fs::rename(&tmp, dest) {
        let _ = fs::remove_file(&tmp);
        return Err(io(e));
    }
    Ok(Manifest { kind: kind.into(), reason: reason.into(), at: now_secs(), questions, sha256: sha, bytes: size, app_version: app_version.into() })
}

// ---------------- điểm khôi phục ----------------

#[derive(Debug, Clone)]
pub struct PointInfo {
    pub file: String,
    pub manifest: Manifest,
}

fn is_point_db(name: &str) -> bool {
    name.starts_with("rp-") && name.ends_with(".db")
}

/// Danh sách điểm khôi phục, mới nhất trước. Điểm thiếu/hỏng tệp mô tả bị bỏ qua (không xoá).
pub fn list_points(dir: &Path) -> Vec<PointInfo> {
    let mut v: Vec<PointInfo> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            if !is_point_db(&name) {
                return None;
            }
            let m = Manifest::from_json(&fs::read_to_string(with_suffix(&e.path(), ".json")).ok()?)?;
            Some(PointInfo { file: name, manifest: m })
        })
        .collect();
    v.sort_by(|a, b| b.manifest.at.cmp(&a.manifest.at).then(b.file.cmp(&a.file)));
    v
}

fn prune(dir: &Path) {
    for old in list_points(dir).into_iter().skip(KEEP_POINTS) {
        let p = dir.join(&old.file);
        let _ = fs::remove_file(with_suffix(&p, ".json"));
        let _ = fs::remove_file(&p);
    }
}

/// Tạo điểm khôi phục. `reason` phải thuộc `REASONS`. Chỉ khi bản chụp đã kiểm tra xong mới xoá điểm cũ vượt mức 5.
pub fn create_restore_point(db: &Db, dir: &Path, reason: &str, app_version: &str) -> R<PointInfo> {
    if !REASONS.contains(&reason) {
        return Err(DbError::Invalid("Lý do điểm khôi phục không hợp lệ.".into()));
    }
    let stamp = utc_stamp(now_secs());
    let mut file = format!("rp-{stamp}-{reason}.db");
    let mut n = 1;
    while dir.join(&file).exists() {
        n += 1;
        file = format!("rp-{stamp}-{reason}-{n}.db");
    }
    let path = dir.join(&file);
    let m = snapshot_verified(db, &path, "restore-point", reason, app_version)?;
    fs::write(with_suffix(&path, ".json"), m.to_json()).map_err(io)?;
    prune(dir);
    Ok(PointInfo { file, manifest: m })
}

// ---------------- sao lưu trước cập nhật (đúng MỘT bản) ----------------

/// Bản duy nhất: dựng ở thư mục tạm; chỉ khi xong và đã kiểm tra mới thay bản cũ (lỗi ⇒ bản cũ còn nguyên).
pub fn snapshot_before_update(db: &Db, backup_dir: &Path, from_version: &str, to_version: &str) -> R<Manifest> {
    let tmp = with_suffix(backup_dir, ".tmp");
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&tmp).map_err(io)?;
    let built = (|| -> R<Manifest> {
        let m = snapshot_verified(db, &tmp.join("hedu.db"), "pre-update", "truoc-cap-nhat", from_version)?;
        let schema: i64 = db.meta_get("schema")?.and_then(|s| s.parse().ok()).unwrap_or(3);
        fs::write(
            tmp.join("meta.json"),
            json!({ "fromVersion": from_version, "toVersion": to_version, "schema": schema, "bytes": m.bytes, "kind": "pre-update", "at": m.at, "storage": "sqlite", "questions": m.questions }).to_string(),
        )
        .map_err(io)?;
        Ok(m)
    })();
    match built {
        Ok(m) => {
            if backup_dir.exists() {
                fs::remove_dir_all(backup_dir).map_err(io)?;
            }
            fs::rename(&tmp, backup_dir).map_err(io)?;
            Ok(m)
        }
        Err(e) => {
            let _ = fs::remove_dir_all(&tmp);
            Err(e)
        }
    }
}

/// Nội dung meta.json của bản sao lưu trước cập nhật dạng SQLite (nếu có và còn đủ tệp).
pub fn before_update_meta(backup_dir: &Path) -> Option<String> {
    if !backup_dir.join("hedu.db").is_file() {
        return None;
    }
    fs::read_to_string(backup_dir.join("meta.json")).ok()
}

// ---------------- kiểm tra / thay tệp (nguồn phải ĐÃ ĐÓNG) ----------------

#[derive(Debug, Clone)]
pub struct Inspect {
    pub questions: i64,
    pub damaged: bool,
    pub messages: Vec<String>,
}

/// Xem một tệp .db (bản chụp, điểm khôi phục, tệp người dùng chọn) KHÔNG đụng tới tệp đó: chép sang `scratch` rồi mở bản chép.
/// Từ chối tệp không phải của HEdu hoặc thuộc định dạng mới hơn.
pub fn inspect_copy(src: &Path, scratch: &Path) -> R<Inspect> {
    if !src.is_file() {
        return Err(DbError::Io("Không tìm thấy tệp.".into()));
    }
    let _ = fs::remove_file(scratch);
    remove_sidefiles(scratch);
    if let Some(d) = scratch.parent() {
        fs::create_dir_all(d).map_err(io)?;
    }
    fs::copy(src, scratch).map_err(io)?;
    let r = (|| -> R<Inspect> {
        let d = Db::open(scratch)?;
        let rep = d.integrity_check()?;
        let out = Inspect { questions: rep.questions, damaged: rep.damaged, messages: rep.messages };
        d.close()?;
        Ok(out)
    })();
    let _ = fs::remove_file(scratch);
    remove_sidefiles(scratch);
    r
}

/// Thay `current` bằng `src` (đã được kiểm tra bằng `inspect_copy`). `current` phải ĐÃ ĐÓNG. Dựng bản chép tạm bên cạnh rồi đổi tên:
/// lỗi ở bất kỳ bước nào ⇒ `current` về nguyên trạng. Trả về đường dẫn tệp cũ đã bị thay (đã xoá) — an toàn nhờ điểm khôi phục chụp trước.
pub fn replace_current(current: &Path, src: &Path) -> R<()> {
    let stage = with_suffix(current, ".restore");
    let old = with_suffix(current, ".old");
    for p in [&stage, &old] {
        let _ = fs::remove_file(p);
    }
    for s in ["-wal", "-shm"] {
        // tệp đã đóng sạch thì không còn WAL; còn sót ⇒ dừng, không thay (tránh mất dữ liệu chưa gộp)
        let w = with_suffix(current, s);
        if w.exists() && fs::metadata(&w).map(|m| m.len() > 0).unwrap_or(false) {
            return Err(DbError::Busy);
        }
        let _ = fs::remove_file(w);
    }
    fs::copy(src, &stage).map_err(io)?;
    if current.exists() {
        fs::rename(current, &old).map_err(io)?;
    }
    if let Err(e) = fs::rename(&stage, current) {
        if old.exists() {
            let _ = fs::rename(&old, current); // trả lại nguyên trạng
        }
        let _ = fs::remove_file(&stage);
        return Err(io(e));
    }
    let _ = fs::remove_file(&old);
    Ok(())
}

/// "Khôi phục sau cập nhật": đổi chỗ nguồn hiện tại với bản sao lưu trước cập nhật (làm lại là đổi ngược). `current` phải ĐÃ ĐÓNG.
pub fn swap_with_before_update(current: &Path, backup_dir: &Path, scratch: &Path) -> R<()> {
    let b = backup_dir.join("hedu.db");
    if !b.is_file() {
        return Err(DbError::Io("Chưa có bản sao lưu nào để khôi phục.".into()));
    }
    let insp = inspect_copy(&b, scratch)?;
    if insp.damaged {
        return Err(DbError::Corrupt("bản sao lưu trước cập nhật không qua kiểm toàn vẹn".into()));
    }
    let hold = with_suffix(current, ".swap");
    let _ = fs::remove_file(&hold);
    if current.exists() {
        fs::copy(current, &hold).map_err(io)?; // giữ nguyên dữ liệu hiện tại để cất vào chỗ bản sao lưu
    }
    replace_current(current, &b)?;
    if hold.exists() {
        fs::rename(&hold, &b).map_err(io)?;
        if let Ok(t) = fs::read_to_string(backup_dir.join("meta.json")) {
            if let Ok(mut v) = serde_json::from_str::<Value>(&t) {
                v["kind"] = "swapped".into();
                v["at"] = now_secs().into();
                let _ = fs::write(backup_dir.join("meta.json"), v.to_string());
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Batch;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("hedu-bk-test-{}-{}", std::process::id(), name));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn q(i: i64, extra: &str) -> String {
        let latex = format!("\\begin{{ex}}%[2D1H1-1]\n Câu {i} $\\dfrac12$ \\immini{{x}}{{\\begin{{tikzpicture}}\\def\\a{{1}}\\end{{tikzpicture}}}} {extra}\n\\end{{ex}}");
        serde_json::json!({ "uid": format!("u{i:06}"), "seq": i, "latex": latex, "type": "tn", "level": "TH", "grade": 12 }).to_string()
    }

    fn make(dir: &Path, name: &str, n: i64) -> Db {
        let mut db = Db::create(&dir.join(name)).unwrap();
        db.apply(&Batch { upserts: (1..=n).map(|i| q(i, "")).collect(), meta: vec![("schema".into(), "3".into()), ("nextSeq".into(), (n + 1).to_string())], sidecar: vec![("dup-decisions".into(), "{\"v\":1,\"recs\":[]}".into())], ..Default::default() }).unwrap();
        db
    }

    #[test]
    fn ban_chup_nhat_quan_giu_nhan_dang_va_noi_dung() {
        let d = tmp("chup");
        let db = make(&d, "a.db", 200);
        let m = snapshot_verified(&db, &d.join("snap.db"), "manual", "thu-cong", "0.1.0").unwrap();
        assert_eq!(m.questions, 200);
        assert_eq!(m.sha256, sha256_hex(&fs::read(d.join("snap.db")).unwrap()));
        assert!(!d.join("snap.db.part").exists());
        let s = Db::open(&d.join("snap.db")).unwrap(); // mở được = đúng application_id + định dạng
        assert_eq!(s.count().unwrap(), 200);
        assert_eq!(s.get_question("u000007").unwrap().unwrap(), q(7, ""), "từng câu giống từng ký tự");
        assert_eq!(s.sidecar_get("dup-decisions").unwrap().as_deref(), Some("{\"v\":1,\"recs\":[]}"));
        assert_eq!(s.meta_get("nextSeq").unwrap().as_deref(), Some("201"));
        assert!(s.integrity_check().unwrap().ok);
        s.close().unwrap();
        // chụp lại đè lên tệp cũ (người dùng đã xác nhận ghi đè trong hộp Lưu thành…)
        assert!(snapshot_verified(&db, &d.join("snap.db"), "manual", "thu-cong", "0.1.0").is_ok());
        // nguồn gốc vẫn dùng bình thường sau khi chụp
        assert_eq!(db.count().unwrap(), 200);
    }

    #[test]
    fn diem_khoi_phuc_giu_toi_da_nam_ban_moi_nhat() {
        let d = tmp("diem");
        let dir = d.join("rp");
        let mut db = make(&d, "a.db", 10);
        let mut names = Vec::new();
        for i in 0..8 {
            db.apply(&Batch { upserts: vec![q(100 + i, "")], ..Default::default() }).unwrap();
            let p = create_restore_point(&db, &dir, REASONS[(i % 5) as usize], "0.1.0").unwrap();
            names.push((p.file.clone(), p.manifest.questions));
            std::thread::sleep(std::time::Duration::from_millis(1100)); // dấu thời gian theo giây
        }
        let l = list_points(&dir);
        assert_eq!(l.len(), KEEP_POINTS, "chỉ giữ 5 bản");
        assert_eq!(l[0].file, names[7].0, "mới nhất đứng đầu");
        assert_eq!(l[0].manifest.questions, 18);
        assert!(l.iter().all(|p| names[3..].iter().any(|n| n.0 == p.file)), "bản cũ nhất bị xoá, 5 bản mới còn");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 10, "mỗi điểm = 1 tệp .db + 1 tệp mô tả, không còn tệp thừa");
        assert!(matches!(create_restore_point(&db, &dir, "../../x", "0.1.0"), Err(DbError::Invalid(_))), "lý do chỉ nhận danh sách có sẵn");
    }

    #[test]
    fn sao_luu_truoc_cap_nhat_dung_mot_ban() {
        let d = tmp("truoc-cn");
        let db = make(&d, "a.db", 30);
        let dir = d.join("before-update");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("hedu.json"), "cu").unwrap(); // bản kiểu JSON cũ
        snapshot_before_update(&db, &dir, "0.1.0-beta.29", "0.1.0-beta.30").unwrap();
        assert!(dir.join("hedu.db").is_file() && dir.join("meta.json").is_file() && !dir.join("hedu.json").exists(), "bản cũ bị thay hoàn toàn bằng MỘT bản mới");
        let meta: Value = serde_json::from_str(&before_update_meta(&dir).unwrap()).unwrap();
        assert_eq!((meta["fromVersion"].as_str(), meta["toVersion"].as_str(), meta["storage"].as_str(), meta["questions"].as_i64()), (Some("0.1.0-beta.29"), Some("0.1.0-beta.30"), Some("sqlite"), Some(30)));
        assert!(!with_suffix(&dir, ".tmp").exists());
        // lần cập nhật sau: vẫn một bản
        let mut db = db;
        db.apply(&Batch { upserts: vec![q(31, "")], ..Default::default() }).unwrap();
        snapshot_before_update(&db, &dir, "0.1.0-beta.30", "0.1.0-beta.31").unwrap();
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 2);
        assert_eq!(Db::open(&dir.join("hedu.db")).unwrap().count().unwrap(), 31);
        assert!(before_update_meta(&d.join("khong-co")).is_none());
    }

    #[test]
    fn kiem_tra_tep_la_hong_hoac_moi_hon_khong_dung_vao_tep_goc() {
        let d = tmp("inspect");
        let db = make(&d, "a.db", 40);
        snapshot_verified(&db, &d.join("ok.db"), "manual", "thu-cong", "x").unwrap();
        let i = inspect_copy(&d.join("ok.db"), &d.join("scratch.db")).unwrap();
        assert_eq!((i.questions, i.damaged), (40, false));
        assert!(!d.join("scratch.db").exists(), "dọn bản chép tạm");
        let before = fs::read(d.join("ok.db")).unwrap();
        assert_eq!(fs::read(d.join("ok.db")).unwrap(), before);
        fs::write(d.join("la.db"), b"day khong phai co so du lieu hedu, chi la chu thuong thoi nhe ban oi").unwrap();
        assert!(inspect_copy(&d.join("la.db"), &d.join("scratch.db")).is_err());
        let mut bad = before.clone();
        let mid = bad.len() / 2;
        let end = (mid + 3000).min(bad.len());
        for b in &mut bad[mid..end] { *b = 0xCD; }
        fs::write(d.join("hong.db"), &bad).unwrap();
        match inspect_copy(&d.join("hong.db"), &d.join("scratch.db")) {
            Err(_) => {}
            Ok(i) => assert!(i.damaged, "tệp ghi rác phải bị báo hỏng"),
        }
        assert!(inspect_copy(&d.join("khong-co.db"), &d.join("scratch.db")).is_err());
    }

    #[test]
    fn khoi_phuc_thay_tep_va_quay_lai_duoc() {
        let d = tmp("thay");
        let cur = d.join("hedu.db");
        // hiện có 50 câu; điểm khôi phục có 20 câu
        let db = make(&d, "x.db", 20);
        snapshot_verified(&db, &d.join("p20.db"), "manual", "thu-cong", "x").unwrap();
        db.close().unwrap();
        fs::remove_file(d.join("x.db")).unwrap();
        make(&d, "hedu.db", 50).close().unwrap();
        let insp = inspect_copy(&d.join("p20.db"), &d.join("scratch.db")).unwrap();
        assert_eq!(insp.questions, 20);
        replace_current(&cur, &d.join("p20.db")).unwrap();
        let after = Db::open(&cur).unwrap();
        assert_eq!(after.count().unwrap(), 20, "đã thay bằng bản 20 câu");
        after.close().unwrap();
        assert!(d.join("p20.db").is_file(), "tệp nguồn khôi phục còn nguyên");
        for ext in [".restore", ".old"] {
            assert!(!with_suffix(&cur, ext).exists(), "không còn tệp tạm {ext}");
        }
        // nguồn đang mở (còn khoá) ⇒ không thay, tệp nguyên trạng
        let open = Db::open(&cur).unwrap();
        assert!(replace_current(&cur, &d.join("p20.db")).is_err() || open.count().is_ok());
        drop(open);
    }

    #[test]
    fn khoi_phuc_sau_cap_nhat_doi_cho_hai_ben() {
        let d = tmp("hoan-doi");
        let cur = d.join("hedu.db");
        make(&d, "hedu.db", 60).close().unwrap(); // sau cập nhật: 60 câu
        let backup = d.join("before-update");
        {
            let old = make(&d, "truoc.db", 25); // trước cập nhật: 25 câu
            snapshot_before_update(&old, &backup, "a", "b").unwrap();
        }
        swap_with_before_update(&cur, &backup, &d.join("scratch.db")).unwrap();
        assert_eq!(Db::open(&cur).unwrap().count().unwrap(), 25, "dữ liệu hiện tại là bản trước cập nhật");
        assert_eq!(Db::open(&backup.join("hedu.db")).unwrap().count().unwrap(), 60, "dữ liệu cũ hiện tại được cất vào chỗ sao lưu (không mất)");
        let meta: Value = serde_json::from_str(&fs::read_to_string(backup.join("meta.json")).unwrap()).unwrap();
        assert_eq!(meta["kind"], "swapped");
        // đổi lần nữa = trở lại như cũ
        swap_with_before_update(&cur, &backup, &d.join("scratch.db")).unwrap();
        assert_eq!(Db::open(&cur).unwrap().count().unwrap(), 60);
        // chưa có bản sao lưu
        assert!(swap_with_before_update(&cur, &d.join("khong-co"), &d.join("scratch.db")).is_err());
    }
}
