//! PR 4B: câu đã dùng. DẪN XUẤT từ các đề đang hoạt động trong Thư viện, không có kho riêng, chỉ đọc (không ghi gì, không đụng ngân hàng/UID/ID6/LaTeX).
//! Chỉ tin UID trong `hedu-de.json` (đề sinh bằng Tạo đề) và `.hedu/sources.json` (đề lưu từ Ngân hàng). Không đối sánh gần đúng với đề `.tex` nhập tay (D6):
//! đề không có hai tệp này được báo `source = none` để giao diện nói "chưa thể đối chiếu đầy đủ", không coi là chưa từng dùng.
//! Đề trong Thùng rác nằm ở thư mục khác nên không được quét; khôi phục thì quét lại tự nhiên.
#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::io::Read;
use std::path::Path;

use crate::examlib::{self, open_inside, projects_dir};
use crate::examsources;

const MAX_DOC: u64 = 20 * 1024 * 1024;

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UsageProject {
    pub id: String,
    pub name: String,
    pub folder: Option<String>,
    pub school_year: Option<String>,
    pub exam_type: Option<String>,
    pub updated_at: String,
    /// spec | sources | both | none
    pub source: String,
    /// UID đã dùng (đã bỏ trùng)
    pub uids: Vec<String>,
    /// số câu ghi trong sổ nguồn nhưng không còn thấy trong tệp đề (vẫn tính là đã dùng, thận trọng)
    pub missing: u32,
    /// lý do khi một trong hai tệp hỏng/không đọc được
    pub note: Option<String>,
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct UsageScan {
    pub projects: Vec<UsageProject>,
}

#[derive(Deserialize)]
struct SrcDoc {
    items: Vec<SrcItem>,
}
#[derive(Deserialize)]
struct SrcItem {
    uid: String,
}

/// Đọc một tệp JSON trong dự án (không đi qua liên kết). Ok(None) = không có tệp.
fn read_json(dir: &Path, rel: &str) -> Result<Option<Vec<u8>>, String> {
    match open_inside(dir, rel) {
        Ok(h) => {
            if h.metadata().map(|m| m.len() > MAX_DOC).unwrap_or(true) {
                return Err(format!("{rel} quá lớn hoặc không đọc được."));
            }
            let mut b = Vec::new();
            h.take(MAX_DOC).read_to_end(&mut b).map_err(|e| format!("{rel}: {e}"))?;
            Ok(Some(b))
        }
        Err(_) => match std::fs::symlink_metadata(dir.join(rel)) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            _ => Err(format!("{rel} không đọc an toàn được (liên kết hoặc lỗi).")),
        },
    }
}

/// UID trong `hedu-de.json`: mọi câu của mọi mã. Cấu trúc sai ⇒ Err (không đoán).
pub fn spec_uids(bytes: &[u8]) -> Result<BTreeSet<String>, String> {
    let v: serde_json::Value = serde_json::from_slice(bytes).map_err(|e| format!("hedu-de.json không đọc được: {e}"))?;
    if v.get("v").and_then(|x| x.as_u64()) != Some(1) {
        return Err("hedu-de.json không phải phiên bản 1.".into());
    }
    let ma = v.get("maDe").and_then(|x| x.as_array()).ok_or("hedu-de.json thiếu danh sách mã đề.")?;
    let mut out = BTreeSet::new();
    for m in ma {
        let code = m.get("ma").and_then(|x| x.as_str()).unwrap_or("?");
        if !m.get("phan").map(|x| x.is_object()).unwrap_or(false) {
            return Err(format!("hedu-de.json: mã đề {code} thiếu cấu trúc «phan», không dùng làm bằng chứng."));
        }
        for p in ["p1", "p2", "p3", "p4"] {
            let arr = m.pointer(&format!("/phan/{p}")).and_then(|x| x.as_array()).ok_or_else(|| format!("hedu-de.json: mã đề {code} thiếu phần {p}, không dùng làm bằng chứng."))?;
            for it in arr {
                let uid = it.get("uid").and_then(|x| x.as_str()).filter(|u| !u.is_empty()).ok_or("Có câu thiếu UID trong hedu-de.json.")?;
                out.insert(uid.to_string());
            }
        }
    }
    if out.is_empty() {
        return Err("hedu-de.json không có câu nào (cấu trúc không đủ làm bằng chứng).".into());
    }
    Ok(out)
}

/// UID trong `.hedu/sources.json`: thiếu `items` hoặc có UID rỗng ⇒ Err (không coi là "không có câu nào").
pub fn source_uids(bytes: &[u8]) -> Result<Vec<String>, String> {
    let d: SrcDoc = serde_json::from_slice(bytes).map_err(|e| format!("Sổ nguồn câu hỏi thiếu cấu trúc hoặc hỏng: {e}"))?;
    if d.items.iter().any(|i| i.uid.is_empty()) {
        return Err("Sổ nguồn câu hỏi có mục thiếu UID, không dùng làm bằng chứng.".into());
    }
    Ok(d.items.into_iter().map(|i| i.uid).collect())
}

fn project_usage(lib: &Path, s: &examlib::Summary) -> UsageProject {
    let dir = projects_dir(lib).join(&s.id);
    let mut uids = BTreeSet::new();
    let (mut spec_ok, mut src_ok) = (false, false);
    let mut missing = 0u32;
    let mut notes: Vec<String> = Vec::new();
    match read_json(&dir, "hedu-de.json").and_then(|o| o.map(|b| spec_uids(&b)).transpose()) {
        Ok(Some(u)) => {
            spec_ok = true;
            uids.extend(u);
        }
        Ok(None) => {}
        Err(e) => notes.push(e),
    }
    match read_json(&dir, ".hedu/sources.json").and_then(|o| o.map(|b| source_uids(&b)).transpose()) {
        Ok(Some(u)) => {
            src_ok = true;
            uids.extend(u);
            match examsources::sources_status(lib, &s.id) {
                Ok(st) => missing = st.iter().filter(|x| x.state == "missing").count() as u32,
                Err(e) => notes.push(format!("Không kiểm được trạng thái sổ nguồn: {e}")),
            }
        }
        Ok(None) => {}
        Err(e) => notes.push(e),
    }
    let source = match (spec_ok, src_ok) {
        (true, true) => "both",
        (true, false) => "spec",
        (false, true) => "sources",
        _ => "none",
    };
    UsageProject {
        id: s.id.clone(),
        name: s.name.clone(),
        folder: s.folder.clone(),
        school_year: s.metadata.school_year.clone(),
        exam_type: s.metadata.exam_type.clone(),
        updated_at: s.updated_at.clone(),
        source: source.into(),
        uids: uids.into_iter().collect(),
        missing,
        note: if notes.is_empty() { None } else { Some(notes.join(" · ")) },
    }
}

/// Quét các đề đang hoạt động (không gồm Thùng rác). Một đề hỏng không làm hỏng cả lượt quét: nó được trả về với `source = none` kèm lý do.
pub fn scan(lib: &Path) -> UsageScan {
    let mut projects: Vec<UsageProject> = examlib::list(lib)
        .iter()
        .filter(|s| projects_dir(lib).join(&s.id).is_dir())
        .map(|s| project_usage(lib, s))
        .collect();
    projects.sort_by(|a, b| a.id.cmp(&b.id));
    UsageScan { projects }
}

#[tauri::command]
pub async fn exam_usage_scan(app: tauri::AppHandle) -> Result<UsageScan, String> {
    use tauri::Manager;
    let lib = app.path().app_data_dir().map(|d| d.join("exam-library")).map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || Ok(scan(&lib))).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::examsources::{create_project, FileIn, SourceIn};
    use std::fs;
    use std::path::PathBuf;

    fn tmp(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("hedu-eu-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
    fn fi(p: &str, t: &str) -> FileIn {
        FileIn { path: p.into(), text: t.into() }
    }
    fn si(uid: &str, latex: &str) -> SourceIn {
        SourceIn { uid: uid.into(), label: "L".into(), latex: latex.into() }
    }
    const Q1: &str = "\\begin{ex}\nCâu một.\n\\end{ex}";
    const Q2: &str = "\\begin{ex}\nCâu hai.\n\\end{ex}";
    fn spec(uids_by_code: &[&[&str]]) -> String {
        let ma: Vec<serde_json::Value> = uids_by_code
            .iter()
            .enumerate()
            .map(|(i, us)| serde_json::json!({ "ma": format!("10{}", i + 1), "phan": { "p1": us.iter().map(|u| serde_json::json!({ "uid": u, "dapAn": "A" })).collect::<Vec<_>>(), "p2": [], "p3": [], "p4": [] } }))
            .collect();
        serde_json::json!({ "v": 1, "hatGiong": 1, "maDe": ma }).to_string()
    }
    fn mk(lib: &Path, name: &str, files: Vec<FileIn>, src: Vec<SourceIn>) -> String {
        let main = files[0].path.clone();
        create_project(lib, name, &files, &main, if src.is_empty() { &main } else { "cauhoi.tex" }, &src).unwrap().id
    }

    #[test]
    fn spec_lay_uid_moi_ma_va_bo_trung() {
        let u = spec_uids(spec(&[&["a", "b"], &["b", "a"]]).as_bytes()).unwrap();
        assert_eq!(u.into_iter().collect::<Vec<_>>(), vec!["a", "b"]);
        assert!(spec_uids(b"{}").is_err());
        assert!(spec_uids(br#"{"v":1,"maDe":[{"ma":"1","phan":{"p1":[{"dapAn":"A"}]}}]}"#).is_err(), "câu thiếu UID không đoán");
        assert!(spec_uids(b"khong phai json").is_err());
        assert!(spec_uids(br#"{"v":1,"maDe":[{"ma":"1"}]}"#).is_err(), "thiếu phan không phải bằng chứng chưa dùng");
        assert!(spec_uids(br#"{"v":1,"maDe":[{"ma":"1","phan":{"p1":[{"uid":"a"}]}}]}"#).is_err(), "thiếu p2..p4");
        assert!(spec_uids(br#"{"v":1,"maDe":[]}"#).is_err() && spec_uids(br#"{"v":1,"maDe":[{"ma":"1","phan":{"p1":[],"p2":[],"p3":[],"p4":[]}}]}"#).is_err(), "rỗng không phải bằng chứng");
        assert!(source_uids(b"{}").is_err() && source_uids(br#"{"items":[{"uid":""}]}"#).is_err() && source_uids(br#"{"items":[]}"#).unwrap().is_empty());
    }

    #[test]
    fn nguon_spec_sources_none_va_de_hong_khong_lam_hong_luot_quet() {
        let d = tmp("scan");
        let lib = d.join("exam-library");
        let a = mk(&lib, "Đề Tạo đề", vec![fi("main.tex", "x\n"), fi("hedu-de.json", &spec(&[&["u1", "u2"]]))], vec![]);
        let b = mk(&lib, "Đề từ ngân hàng", vec![fi("main.tex", "x\n"), fi("cauhoi.tex", &format!("{Q1}\n\n{Q2}\n"))], vec![si("u2", Q1), si("u3", Q2)]);
        let c = mk(&lib, "Đề tay", vec![fi("main.tex", "x\n")], vec![]);
        let g = mk(&lib, "Đề thiếu phan", vec![fi("main.tex", "x
"), fi("hedu-de.json", r#"{"v":1,"maDe":[{"ma":"101"}]}"#)], vec![]);
        fs::write(projects_dir(&lib).join(&c).join(".hedu/sources.json"), "{}").unwrap();
        let e = mk(&lib, "Đề hỏng", vec![fi("main.tex", "x\n"), fi("hedu-de.json", "{hong")], vec![]);
        let s = scan(&lib);
        let get = |id: &str| s.projects.iter().find(|p| p.id == id).unwrap();
        assert_eq!((get(&a).source.as_str(), get(&a).uids.clone()), ("spec", vec!["u1".to_string(), "u2".into()]));
        assert_eq!((get(&b).source.as_str(), get(&b).uids.clone()), ("sources", vec!["u2".to_string(), "u3".into()]));
        assert_eq!((get(&c).source.as_str(), get(&c).uids.len()), ("none", 0), "không UID đáng tin ⇒ none, không coi là chưa dùng");
        assert!(get(&e).source == "none" && get(&e).note.is_some(), "đề hỏng báo lý do, không sập");
        assert!(get(&c).source == "none" && get(&c).note.is_some(), "sổ nguồn thiếu items: không phải bằng chứng chưa dùng");
        assert!(get(&g).source == "none" && get(&g).note.is_some(), "thiếu cấu trúc phan: không đối chiếu được, không phải 'chưa dùng'");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn de_trong_thung_rac_khong_tinh_khoi_phuc_thi_tinh_lai() {
        let d = tmp("trash");
        let lib = d.join("exam-library");
        let a = mk(&lib, "Đề", vec![fi("main.tex", "x\n"), fi("hedu-de.json", &spec(&[&["u1"]]))], vec![]);
        assert_eq!(scan(&lib).projects.len(), 1);
        crate::examadmin::trash_project(&d, &a).unwrap();
        assert!(scan(&lib).projects.is_empty(), "đã vào Thùng rác thì không tính");
        crate::examadmin::trash_restore(&d, &a).unwrap();
        let s = scan(&lib);
        assert_eq!(s.projects.len(), 1);
        assert_eq!(s.projects[0].uids, vec!["u1".to_string()], "khôi phục thì tính lại");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn de_sua_tay_cau_bi_xoa_van_tinh_da_dung_va_bao_missing() {
        let d = tmp("missing");
        let lib = d.join("exam-library");
        let b = mk(&lib, "Đề", vec![fi("main.tex", "x\n"), fi("cauhoi.tex", &format!("{Q1}\n\n{Q2}\n"))], vec![si("u1", Q1), si("u2", Q2)]);
        fs::write(projects_dir(&lib).join(&b).join("cauhoi.tex"), format!("{Q1}\n")).unwrap();
        let p = scan(&lib).projects.remove(0);
        assert_eq!(p.uids, vec!["u1".to_string(), "u2".into()], "thận trọng: vẫn tính đã dùng");
        assert_eq!(p.missing, 1);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn quet_nhieu_de_van_nhanh_va_khong_ghi_gi() {
        let d = tmp("many");
        let lib = d.join("exam-library");
        for i in 0..1500 {
            mk(&lib, &format!("Đề {i}"), vec![fi("main.tex", "x\n"), fi("hedu-de.json", &spec(&[&["a", "b", "c"], &["c", "b", "a"]]))], vec![]);
        }
        let before = fs::read_dir(projects_dir(&lib)).unwrap().count();
        let t = std::time::Instant::now();
        let s = scan(&lib);
        let ms = t.elapsed().as_millis();
        assert_eq!(s.projects.len(), 1500);
        assert_eq!(fs::read_dir(projects_dir(&lib)).unwrap().count(), before);
        eprintln!("quet 1500 de: {ms} ms (so do kiem thu, khong phai bao dam hieu nang)");
        assert!(ms < 60_000);
        let _ = fs::remove_dir_all(&d);
    }
}
