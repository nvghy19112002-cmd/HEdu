// Bổ sung tệp chính từng mã cho đề cũ (D4): chỉ thêm tệp mới, từ bản chụp đã lưu, từ chối khi không khớp, không ghi đè.
use super::*;
use crate::examsources::{create_project, FileIn};
use std::sync::atomic::AtomicUsize;

static N: AtomicUsize = AtomicUsize::new(0);

fn tmp(tag: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("hedu-bf-{tag}-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
}

const DE: &str = "\\def\\made{101}\n\\begin{name}{a}{b}{c}{d}{e}{f}{g}{h}\n\\end{name}\n\n\\caulc\n\n\\begin{ex}%[x]\n A \\choice{\\True 1}{2}{3}{4}\n\\end{ex}\n\n\\begin{ex}\n B \\choice{1}{\\True 2}{3}{4}\n\\end{ex}\n\n\\cauds\n\n\\begin{ex}\n C \\choiceTF{\\True a}{b}{\\True c}{d}\n\\end{ex}\n\n\\caukq\n\n\\begin{ex}\n D \\shortans{3}\n\\end{ex}\n\n\\zlabel{\\made-lastpage}\n";

const SPEC: &str = r#"{"v":1,"thongTin":{"title":"Thi thử"},"hatGiong":7,"maDe":[
  {"ma":"101","phan":{"p1":[{"uid":"a","dapAn":"A"},{"uid":"b","dapAn":"B"}],"p2":[{"uid":"c","dapAn":"ĐSĐS"}],"p3":[{"uid":"d","dapAn":"3"}],"p4":[]}},
  {"ma":"102","phan":{"p1":[{"uid":"a","dapAn":"A"},{"uid":"b","dapAn":"B"}],"p2":[{"uid":"c","dapAn":"ĐSĐS"}],"p3":[{"uid":"d","dapAn":"3"}],"p4":[]}}]}"#;

const OLD_MAIN: &str = "\\documentclass[12pt,a4paper,twoside]{book}\n\\input{khaibaochung}\n%\\anloigiai\n\\begin{document}\n\\input{de-101}\n\\newpage\n\\input{de-102}\n\\newpage\n\\input{dapan}\n\\end{document}\n";

fn old_project(lib: &Path, de102: &str) -> String {
    let files = vec![
        FileIn { path: "main.tex".into(), text: OLD_MAIN.into() },
        FileIn { path: "khaibaochung.tex".into(), text: "% kbc\n".into() },
        FileIn { path: "de-101.tex".into(), text: DE.into() },
        FileIn { path: "de-102.tex".into(), text: de102.into() },
        FileIn { path: "dapan.tex".into(), text: "% dap an\n".into() },
        FileIn { path: "hedu-de.json".into(), text: SPEC.into() },
    ];
    create_project(lib, "De cu", &files, "main.tex", "", &[]).unwrap().id
}

fn file(lib: &Path, id: &str, rel: &str) -> PathBuf {
    projects_dir(lib).join(id).join(rel)
}

#[test]
fn bo_sung_tep_chinh_cho_de_cu_an_toan() {
    let root = tmp("ok");
    let lib = root.join("exam-library");
    let id = old_project(&lib, &DE.replace("\\def\\made{101}", "\\def\\made{102}"));
    let info = codes_info(&lib, &id).unwrap();
    assert!(info.has_spec && info.can_backfill && info.codes.iter().all(|c| !c.has_main), "đề cũ: có dữ liệu, chưa có tệp chính từng mã");
    // chạy thử: chỉ liệt kê, không ghi
    let dry = backfill(&lib, &id, false).unwrap();
    assert_eq!(dry.will_create, ["main-101.tex", "main-102.tex"]);
    assert!(!dry.applied && !file(&lib, &id, "main-101.tex").exists(), "chạy thử không ghi gì");
    // ghi thật: chỉ THÊM tệp mới
    let before_main = fs::read(file(&lib, &id, "main.tex")).unwrap();
    let before_de = fs::read(file(&lib, &id, "de-101.tex")).unwrap();
    let done = backfill(&lib, &id, true).unwrap();
    assert!(done.applied);
    assert_eq!(fs::read(file(&lib, &id, "main.tex")).unwrap(), before_main, "main.tex gốc không đổi");
    assert_eq!(fs::read(file(&lib, &id, "de-101.tex")).unwrap(), before_de, "de-<mã> không đổi");
    let m101 = fs::read_to_string(file(&lib, &id, "main-101.tex")).unwrap();
    assert!(m101.contains("\\input{de-101}") && !m101.contains("dapan") && !m101.contains("de-102"), "main từng mã không chèn bảng đáp án: {m101}");
    let after = codes_info(&lib, &id).unwrap();
    assert!(after.codes.iter().all(|c| c.has_main && c.problem.is_none()), "{:?}", after.codes);
    // lần hai: không còn gì để làm
    let again = backfill(&lib, &id, true).unwrap();
    assert!(!again.applied && again.will_create.is_empty());
    // tệp chính từng mã bị chỉnh tay: bị báo không khớp, và bổ sung không ghi đè
    let edited = format!("{m101}% chinh tay\n");
    fs::write(file(&lib, &id, "main-101.tex"), &edited).unwrap();
    assert!(codes_info(&lib, &id).unwrap().codes.iter().any(|c| c.code == "101" && c.problem.is_some()) || backfill(&lib, &id, true).is_err());
    assert_eq!(fs::read_to_string(file(&lib, &id, "main-101.tex")).unwrap(), edited, "không ghi đè tệp đã chỉnh tay");
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn bo_sung_tu_choi_khi_khong_khop_va_khong_tao_gi() {
    let root = tmp("loi");
    let lib = root.join("exam-library");
    // de-102 khai báo \made là 101 ⇒ không khớp bản chụp đã lưu
    let id = old_project(&lib, DE);
    let e = backfill(&lib, &id, true).unwrap_err();
    assert!(e.contains("không khớp"), "{e}");
    assert!(!file(&lib, &id, "main-101.tex").exists() && !file(&lib, &id, "main-102.tex").exists(), "từ chối thì không tạo tệp nào, kể cả mã đầu");
    // số câu khác hedu-de.json
    let id2 = old_project(&lib, &DE.replace("\\def\\made{101}", "\\def\\made{102}").replace("\\begin{ex}\n B", "% \n B"));
    assert!(backfill(&lib, &id2, true).is_err());
    // đề nhập tay (không có hedu-de.json)
    let files = vec![FileIn { path: "main.tex".into(), text: OLD_MAIN.into() }];
    let s = create_project(&lib, "Nhap tay", &files, "main.tex", "", &[]).unwrap();
    let i3 = codes_info(&lib, &s.id).unwrap();
    assert!(!i3.has_spec && !i3.can_backfill && i3.problems[0].contains("hedu-de.json"));
    assert!(backfill(&lib, &s.id, true).is_err());
    let _ = fs::remove_dir_all(&root);
}
