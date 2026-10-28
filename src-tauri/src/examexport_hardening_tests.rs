// Gia cố sau rà soát #138: (A) mọi đường lỗi/huỷ của build_package đều dọn tệp tạm, không ZIP giả, không đè bản cũ;
// (B) bổ sung tệp chính cho đề cũ an toàn cấp lô: kiểm hết trước, tất cả hoặc không, đối chiếu dấu vân và đáp án, nói rõ giới hạn.
use super::*;
use crate::examsources::{create_project, FileIn, SourceIn};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::AtomicUsize;

static N: AtomicUsize = AtomicUsize::new(0);

fn tmp(tag: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("hedu-gc-{tag}-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
}
fn listing(d: &Path) -> Vec<String> {
    let mut v: Vec<String> = fs::read_dir(d).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
    v.sort();
    v
}

// ---------------- A. dọn tệp tạm ----------------
fn spec() -> Spec {
    let c = |code: &str| CodeSpec { code: code.into(), parts: [vec![("u1".into(), "A".into())], vec![], vec![], vec![]] };
    Spec { title: "Thi thử".into(), seed: 42, codes: vec![c("101"), c("102")] }
}
fn pdf(tag: &str) -> PdfOut {
    PdfOut { bytes: format!("%PDF-1.5\n% {tag}\n").into_bytes(), pages: Some(1), fingerprint: format!("fp-{tag}"), cached: false, tex_version: "t".into() }
}
fn plan<'a>(spec: &'a Spec, kind: Kind, eid: &str) -> Plan<'a> {
    Plan {
        project_id: "p1", project_name: "Đề", slug: slug(&spec.title), kind, spec, codes: vec!["101".into(), "102".into()], with_solution: false,
        sources: (0..40).map(|i| SourceFile { path: format!("t{i}.tex"), bytes: vec![b'x'; 100] }).collect(),
        export_id: eid.into(), now: "2026-10-28T00:00:00Z".into(), hedu_version: "0.0.0", max_bytes: MAX_PACKAGE_BYTES, hook: None,
    }
}
fn ok_provider(c: &str, _m: &str) -> Result<PdfOut, Fail> {
    Ok(pdf(c))
}
fn no_progress(_: Progress) {}

#[test]
fn loi_o_moi_giai_doan_ghi_deu_don_tep_tam_va_khong_de_ban_cu() {
    let s = spec();
    for phase in ["nguon", "manifest", "dong", "kiem", "cong-bo"] {
        let dest = tmp(&format!("loi-{phase}"));
        // một bản xuất tốt có sẵn: phải còn NGUYÊN sau lần lỗi
        let mut prov = ok_provider;
        let good = build_package(&plan(&s, Kind::Teacher, "egood"), &dest, &mut prov, &no_progress, &AtomicBool::new(false)).unwrap();
        let old = PathBuf::from(good.zip_path.unwrap());
        let old_bytes = fs::read(&old).unwrap();
        let before = listing(&dest);
        let fail = |p: &str| -> Result<(), String> { if p == phase { Err(format!("lỗi ép ở giai đoạn {p}")) } else { Ok(()) } };
        let mut p = plan(&s, Kind::Teacher, "ebad");
        p.hook = Some(&fail);
        let r = build_package(&p, &dest, &mut ok_provider, &no_progress, &AtomicBool::new(false));
        assert!(r.is_err(), "giai đoạn {phase}: phải báo lỗi");
        assert_eq!(listing(&dest), before, "giai đoạn {phase}: không để lại .part hay tệp lạ");
        assert_eq!(fs::read(&old).unwrap(), old_bytes, "giai đoạn {phase}: bản xuất cũ giữ nguyên từng byte");
        // xuất lại ngay sau lỗi (cùng định danh lượt xuất) vẫn được và ra ZIP mới
        let again = build_package(&plan(&s, Kind::Teacher, "ebad"), &dest, &mut ok_provider, &no_progress, &AtomicBool::new(false)).unwrap();
        assert!(again.ok && listing(&dest).len() == before.len() + 1 && listing(&dest).iter().all(|n| !n.ends_with(".part")), "giai đoạn {phase}: xuất lại thành công");
        let _ = fs::remove_dir_all(&dest);
    }
}

#[test]
fn huy_o_moi_giai_doan_ghi_khong_tao_zip_gia() {
    let s = spec();
    for phase in ["nguon", "manifest", "kiem", "cong-bo"] {
        let dest = tmp(&format!("huy-{phase}"));
        let flag = AtomicBool::new(false);
        let cancel_at = |p: &str| -> Result<(), String> { if p == phase { flag.store(true, Ordering::SeqCst); } Ok(()) };
        let mut p = plan(&s, Kind::Teacher, "ehuy");
        p.hook = Some(&cancel_at);
        let out = build_package(&p, &dest, &mut ok_provider, &no_progress, &flag).unwrap();
        assert!(out.cancelled && !out.ok && out.zip_path.is_none(), "huỷ ở {phase}: {out:?}");
        assert_eq!(fs::read_dir(&dest).unwrap().count(), 0, "huỷ ở {phase}: không ZIP, không .part, không chỗ giữ tên");
        // xuất lại sau khi huỷ
        let again = build_package(&plan(&s, Kind::Teacher, "ehuy"), &dest, &mut ok_provider, &no_progress, &AtomicBool::new(false)).unwrap();
        assert!(again.ok, "xuất lại sau khi huỷ ở {phase}");
        assert_eq!(listing(&dest).len(), 1);
        let _ = fs::remove_dir_all(&dest);
    }
    // gói học sinh (không có giai đoạn nguồn/manifest): huỷ khi kiểm và trước khi công bố
    for phase in ["kiem", "cong-bo"] {
        let dest = tmp(&format!("huy-hs-{phase}"));
        let flag = AtomicBool::new(false);
        let cancel_at = |p: &str| -> Result<(), String> { if p == phase { flag.store(true, Ordering::SeqCst); } Ok(()) };
        let mut p = plan(&s, Kind::Student, "ehs");
        p.hook = Some(&cancel_at);
        let out = build_package(&p, &dest, &mut ok_provider, &no_progress, &flag).unwrap();
        assert!(out.cancelled && fs::read_dir(&dest).unwrap().count() == 0, "gói học sinh huỷ ở {phase}");
        let _ = fs::remove_dir_all(&dest);
    }
}

#[test]
fn vuot_gioi_han_dung_luong_khong_de_lai_gi() {
    let s = spec();
    // vượt khi ghi PDF
    let dest = tmp("gh1");
    let mut p = plan(&s, Kind::Teacher, "egh1");
    p.max_bytes = 10;
    assert!(build_package(&p, &dest, &mut ok_provider, &no_progress, &AtomicBool::new(false)).is_err());
    assert_eq!(fs::read_dir(&dest).unwrap().count(), 0, "vượt giới hạn ở PDF/CSV: sạch");
    // vượt khi ghi nguồn (PDF và CSV còn lọt, nguồn thì không)
    let dest2 = tmp("gh2");
    let mut p2 = plan(&s, Kind::Teacher, "egh2");
    p2.max_bytes = 1500;
    let e = build_package(&p2, &dest2, &mut ok_provider, &no_progress, &AtomicBool::new(false)).unwrap_err();
    assert!(e.contains("giới hạn"), "{e}");
    assert_eq!(fs::read_dir(&dest2).unwrap().count(), 0, "vượt giới hạn ở nguồn: sạch");
    // đủ chỗ thì ra gói
    let mut p3 = plan(&s, Kind::Teacher, "egh3");
    p3.max_bytes = 1_000_000;
    assert!(build_package(&p3, &dest2, &mut ok_provider, &no_progress, &AtomicBool::new(false)).unwrap().ok);
    let _ = fs::remove_dir_all(&dest);
    let _ = fs::remove_dir_all(&dest2);
}

#[test]
fn panic_giua_chung_van_don_tep_tam() {
    let s = spec();
    let dest = tmp("panic");
    let r = catch_unwind(AssertUnwindSafe(|| {
        let mut prov = |c: &str, _m: &str| -> Result<PdfOut, Fail> { if c == "102" { panic!("lỗi bất ngờ") } else { Ok(pdf(c)) } };
        let _ = build_package(&plan(&s, Kind::Teacher, "epanic"), &dest, &mut prov, &no_progress, &AtomicBool::new(false));
    }));
    assert!(r.is_err());
    assert_eq!(fs::read_dir(&dest).unwrap().count(), 0, "panic cũng không để lại .part (dọn theo phạm vi, không dựa từng nhánh lỗi)");
    let _ = fs::remove_dir_all(&dest);
}

// ---------------- B. bổ sung tệp chính cho đề cũ ----------------
const OLD_MAIN: &str = "\\documentclass[12pt,a4paper,twoside]{book}\n\\input{khaibaochung}\n%\\anloigiai\n\\begin{document}\n\\input{de-101}\n\\newpage\n\\input{de-102}\n\\newpage\n\\input{de-103}\n\\newpage\n\\input{dapan}\n\\end{document}\n";
const Q1: &str = "\\begin{ex}%[x]\n A \\choice{\\True 1}{2}{3}{4}\n\\end{ex}";
fn de(code: &str) -> String {
    format!("\\def\\made{{{code}}}\n\\begin{{name}}{{a}}{{b}}{{c}}{{d}}{{e}}{{f}}{{g}}{{h}}\n\\end{{name}}\n\n\\caulc\n\n{Q1}\n\n\\begin{{ex}}\n B \\choice{{1}}{{\\True 2}}{{3}}{{4}}\n\\end{{ex}}\n\n\\zlabel{{\\made-lastpage}}\n")
}
fn spec_json(extra: &str, key2: &str) -> String {
    let c = |code: &str| format!(r#"{{"ma":"{code}","phan":{{"p1":[{{"uid":"a","dapAn":"A"}},{{"uid":"b","dapAn":"{key2}"}}],"p2":[],"p3":[],"p4":[]}}}}"#);
    format!(r#"{{"v":1,"thongTin":{{"title":"Thi thử"}},"hatGiong":7,{extra}"maDe":[{},{},{}]}}"#, c("101"), c("102"), c("103"))
}
fn proj(lib: &Path, extra: &str, key2: &str, sources: &[SourceIn]) -> String {
    let files = vec![
        FileIn { path: "main.tex".into(), text: OLD_MAIN.into() },
        FileIn { path: "khaibaochung.tex".into(), text: "% kbc\n".into() },
        FileIn { path: "de-101.tex".into(), text: de("101") },
        FileIn { path: "de-102.tex".into(), text: de("102") },
        FileIn { path: "de-103.tex".into(), text: de("103") },
        FileIn { path: "dapan.tex".into(), text: "% dap an\n".into() },
        FileIn { path: "hedu-de.json".into(), text: spec_json(extra, key2) },
    ];
    create_project(lib, "De cu 3 ma", &files, "main.tex", if sources.is_empty() { "" } else { "de-101.tex" }, sources).unwrap().id
}
fn pdir(lib: &Path, id: &str) -> PathBuf {
    projects_dir(lib).join(id)
}
fn snapshot(lib: &Path, id: &str) -> (Vec<String>, Vec<(String, String)>) {
    let m = read_manifest(lib, id).unwrap();
    let mut files: Vec<(String, String)> = m.files.iter().map(|f| (f.rel.clone(), f.sha256.clone())).collect();
    files.sort();
    (listing(&pdir(lib, id)), files)
}

#[test]
fn loi_giua_lo_hoan_tac_het_tep_moi_va_giu_tep_vong_co() {
    for fail_at in [0usize, 1, 2] {
        let root = tmp(&format!("lo{fail_at}"));
        let lib = root.join("exam-library");
        let id = proj(&lib, "", "B", &[]);
        let before = snapshot(&lib, &id);
        let fault = |i: usize| -> Result<(), String> { if i == fail_at { Err(format!("lỗi ép ở tệp thứ {}", i + 1)) } else { Ok(()) } };
        let e = backfill_with(&lib, &id, true, Some(&fault)).unwrap_err();
        assert!(e.contains("hoàn tác"), "{e}");
        assert_eq!(snapshot(&lib, &id), before, "lỗi ở tệp thứ {}: thư mục và sổ y nguyên, không còn tệp mới nào", fail_at + 1);
        // sau lỗi, chạy lại thành công và đủ 3 tệp
        let done = backfill(&lib, &id, true).unwrap();
        assert!(done.applied && done.will_create.len() == 3, "chạy lại sau lỗi");
        let _ = fs::remove_dir_all(&root);
    }
}

#[test]
fn tep_vong_co_khong_bi_xoa_khi_hoan_tac() {
    let root = tmp("giu");
    let lib = root.join("exam-library");
    let id = proj(&lib, "", "B", &[]);
    // main-101.tex vốn đã có (đúng nội dung)
    let want = derive_main(OLD_MAIN, "101").unwrap();
    crate::examfiles::create_text_file(&lib, &id, "main-101.tex", &want).unwrap();
    let before = snapshot(&lib, &id);
    let fault = |i: usize| -> Result<(), String> { if i == 1 { Err("lỗi ép ở tệp cuối".into()) } else { Ok(()) } };
    assert!(backfill_with(&lib, &id, true, Some(&fault)).is_err());
    assert_eq!(snapshot(&lib, &id), before, "hoàn tác chỉ xoá tệp vừa tạo; main-101.tex có từ trước còn nguyên");
    assert_eq!(fs::read_to_string(pdir(&lib, &id).join("main-101.tex")).unwrap(), want);
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn tep_trung_ten_hoac_chan_ghi_thi_kiem_truoc_va_khong_tao_gi() {
    let root = tmp("chan");
    let lib = root.join("exam-library");
    let id = proj(&lib, "", "B", &[]);
    // một thư mục trùng tên tệp sắp tạo (mô phỏng chỗ không ghi được): phát hiện TRƯỚC khi ghi tệp đầu tiên
    fs::create_dir(pdir(&lib, &id).join("main-102.tex")).unwrap();
    let before = listing(&pdir(&lib, &id));
    let e = backfill(&lib, &id, true).unwrap_err();
    assert!(e.contains("main-102.tex") && !pdir(&lib, &id).join("main-101.tex").exists(), "{e}");
    assert_eq!(listing(&pdir(&lib, &id)), before, "không tạo tệp nào (kể cả main-101.tex đứng trước)");
    // thực tế: tạo hàng loạt cũng từ chối khi có tệp trùng
    let r = crate::examfiles::create_text_files_batch(&lib, &id, &[("main-101.tex".into(), "x".into()), ("main-102.tex".into(), "y".into())], None);
    assert!(r.is_err() && !pdir(&lib, &id).join("main-101.tex").exists());
    // đề đã chốt
    let mut m = read_manifest(&lib, &id).unwrap();
    m.status = "finalized".into();
    crate::examlib::write_manifest(&pdir(&lib, &id), &m).unwrap();
    fs::remove_dir(pdir(&lib, &id).join("main-102.tex")).unwrap();
    assert!(backfill(&lib, &id, true).unwrap_err().contains("chốt"));
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn tep_da_chinh_tay_hoac_khong_khop_so_thi_tu_choi() {
    let root = tmp("khop");
    let lib = root.join("exam-library");
    // 1) tệp trên đĩa đổi ngoài HEdu (sổ không biết)
    let id = proj(&lib, "", "B", &[]);
    fs::write(pdir(&lib, &id).join("de-102.tex"), format!("{}% sửa ngoài\n", de("102"))).unwrap();
    let e = backfill(&lib, &id, true).unwrap_err();
    assert!(e.contains("dấu vân") && !pdir(&lib, &id).join("main-101.tex").exists(), "{e}");
    // 2) đáp án trong hedu-de.json khác \True trong tệp
    let id2 = proj(&lib, "", "C", &[]);
    let e2 = backfill(&lib, &id2, true).unwrap_err();
    assert!(e2.contains("đáp án") && !pdir(&lib, &id2).join("main-101.tex").exists(), "{e2}");
    // 3) main-<mã>.tex đã có nhưng chỉnh tay
    let id3 = proj(&lib, "", "B", &[]);
    crate::examfiles::create_text_file(&lib, &id3, "main-102.tex", "% chinh tay\n").unwrap();
    let e3 = backfill(&lib, &id3, true).unwrap_err();
    assert!(e3.contains("main-102.tex") && !pdir(&lib, &id3).join("main-101.tex").exists(), "{e3}");
    // 4) mã đề khai báo trong tệp khác mã trong dữ liệu
    let id4 = proj(&lib, "", "B", &[]);
    crate::examfiles::write_text_file(&lib, &id4, "de-103.tex", &de("999"), "lf", false, &read_manifest(&lib, &id4).unwrap().files.iter().find(|f| f.rel == "de-103.tex").unwrap().sha256).unwrap();
    assert!(backfill(&lib, &id4, true).is_err() && !pdir(&lib, &id4).join("main-101.tex").exists());
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn dau_van_tung_tep_neu_co_phai_khop() {
    let root = tmp("dv");
    let lib = root.join("exam-library");
    let h = |code: &str| sha_hex(de(code).as_bytes());
    let good = format!(r#""dauVanTep":{{"de-101.tex":"{}","de-102.tex":"{}","de-103.tex":"{}","main.tex":"{}"}},"#, h("101"), h("102"), h("103"), sha_hex(OLD_MAIN.as_bytes()));
    let id = proj(&lib, &good, "B", &[]);
    let ok = backfill(&lib, &id, false).unwrap();
    assert!(ok.verified.iter().any(|v| v.contains("từng tệp nguồn khớp")) && !ok.limits.iter().any(|l| l.contains("không có dấu vân")), "{:?}", ok.limits);
    let bad = format!(r#""dauVanTep":{{"de-102.tex":"{}"}},"#, "0".repeat(64));
    let id2 = proj(&lib, &bad, "B", &[]);
    let e = backfill(&lib, &id2, true).unwrap_err();
    assert!(e.contains("de-102.tex") && e.contains("đã đổi"), "{e}");
    // đường dẫn lạ trong metadata không bao giờ được đọc
    let evil = format!(r#""dauVanTep":{{"../../x":"{}","de-101.tex":"{}"}},"#, "1".repeat(64), h("101"));
    let id3 = proj(&lib, &evil, "B", &[]);
    assert!(backfill(&lib, &id3, false).is_ok(), "đường dẫn lạ bị bỏ qua, không đọc, không làm hỏng");
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn so_nguon_uid_khong_khop_thi_tu_choi_va_neu_ro_gioi_han() {
    let root = tmp("nguon");
    let lib = root.join("exam-library");
    // có sổ nguồn, còn nguyên văn ⇒ qua, và vẫn nói rõ giới hạn
    let src = [SourceIn { uid: "a".into(), label: "x".into(), latex: Q1.into() }];
    let id = proj(&lib, "", "B", &src);
    let r = backfill(&lib, &id, false).unwrap();
    assert!(r.verified.iter().any(|v| v.contains("sổ nguồn")), "{:?}", r.verified);
    assert!(r.limits.iter().any(|l| l.contains("MÃ ĐẦU")) && r.limits.iter().any(|l| l.contains("KHÔNG chứng minh")), "{:?}", r.limits);
    assert!(r.message.contains("tất cả hoặc không"));
    // câu nguồn bị sửa sau khi lưu (qua trình soạn nên sổ tệp vẫn khớp) ⇒ từ chối
    let sha = read_manifest(&lib, &id).unwrap().files.iter().find(|f| f.rel == "de-101.tex").unwrap().sha256.clone();
    crate::examfiles::write_text_file(&lib, &id, "de-101.tex", &de("101").replace("A \\choice", "A' \\choice"), "lf", false, &sha).unwrap();
    let e = backfill(&lib, &id, true).unwrap_err();
    assert!(e.contains("không còn nguyên văn") && !pdir(&lib, &id).join("main-101.tex").exists(), "{e}");
    // không có sổ nguồn ⇒ nói thẳng là không đối chiếu được
    let id2 = proj(&lib, "", "B", &[]);
    let r2 = backfill(&lib, &id2, false).unwrap();
    assert!(r2.limits.iter().any(|l| l.contains("sổ nguồn UID")) && r2.limits.iter().any(|l| l.contains("lưu bằng bản trước")), "{:?}", r2.limits);
    assert!(!r2.verified.iter().any(|v| v.contains("sổ nguồn")), "không khẳng định đã đối chiếu nguồn khi không có sổ");
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn khong_sua_tep_nao_dang_co() {
    let root = tmp("bat-bien");
    let lib = root.join("exam-library");
    let id = proj(&lib, "", "B", &[]);
    let hashes = |l: &Path| -> Vec<(String, String)> {
        let mut v: Vec<(String, String)> = fs::read_dir(pdir(l, &id)).unwrap().filter_map(|e| { let e = e.unwrap(); e.path().is_file().then(|| (e.file_name().to_string_lossy().into_owned(), sha_hex(&fs::read(e.path()).unwrap()))) }).collect();
        v.sort();
        v
    };
    let before = hashes(&lib);
    assert!(backfill(&lib, &id, true).unwrap().applied);
    let after = hashes(&lib);
    for (n, h) in &before {
        assert_eq!(after.iter().find(|x| &x.0 == n).map(|x| &x.1), Some(h), "{n} (main.tex, de-<mã>.tex, hedu-de.json, khaibaochung…) không được đổi");
    }
    assert_eq!(after.len(), before.len() + 3);
    let m = read_manifest(&lib, &id).unwrap();
    assert!(["main-101.tex", "main-102.tex", "main-103.tex"].iter().all(|r| m.files.iter().any(|f| &f.rel == r)), "sổ có đủ 3 tệp mới");
    let _ = fs::remove_dir_all(&root);
}
