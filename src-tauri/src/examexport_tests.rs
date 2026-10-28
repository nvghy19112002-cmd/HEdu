use super::*;
use std::sync::atomic::AtomicUsize;

static N: AtomicUsize = AtomicUsize::new(0);

fn tmp(tag: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("hedu-xuat-{tag}-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
}

fn spec2() -> Spec {
    let code = |c: &str| CodeSpec {
        code: c.into(),
        parts: [
            vec![("u1".into(), "A".into()), ("u2".into(), "C".into())],
            vec![("u3".into(), "ĐSĐS".into())],
            vec![("u4".into(), "3,5".into())],
            vec![],
        ],
    };
    Spec { title: "Kiểm tra học kì I".into(), seed: 4_000_000_123, codes: vec![code("101"), code("102"), code("103")] }
}

fn pdf(tag: &str) -> PdfOut {
    PdfOut { bytes: format!("%PDF-1.5\n% {tag}\n").into_bytes(), pages: Some(2), fingerprint: format!("fp-{tag}"), cached: false, tex_version: "TeX test".into() }
}

fn plan<'a>(spec: &'a Spec, kind: Kind, codes: &[&str], sol: bool, eid: &str) -> Plan<'a> {
    Plan {
        project_id: "p1",
        project_name: "Đề thử",
        slug: slug(&spec.title),
        kind,
        spec,
        codes: codes.iter().map(|c| c.to_string()).collect(),
        with_solution: sol,
        sources: vec![
            SourceFile { path: "khaibaochung.tex".into(), bytes: b"% khai bao".to_vec() },
            SourceFile { path: "hinh/Hình đồ thị.png".into(), bytes: vec![1, 2, 3, 0, 255] },
            SourceFile { path: "de-101.tex".into(), bytes: "\\begin{ex}\\choice{\\True 1}{2}{3}{4}\\end{ex}".as_bytes().to_vec() },
        ],
        export_id: eid.into(),
        now: "2026-10-28T00:00:00Z".into(),
        hedu_version: "0.0.0-test",
        max_bytes: MAX_PACKAGE_BYTES,
        hook: None,
    }
}

fn names(z: &Path) -> Vec<String> {
    let mut a = zip::ZipArchive::new(fs::File::open(z).unwrap()).unwrap();
    let mut v: Vec<String> = (0..a.len()).map(|i| a.by_index(i).unwrap().name().to_string()).collect();
    v.sort();
    v
}

fn no_progress(_: Progress) {}

#[test]
fn ten_tep_an_toan_va_khong_trung() {
    assert_eq!(slug("Kiểm tra cuối học kì I"), "kiem-tra-cuoi-hoc-ki-i");
    assert_eq!(slug("  Đề: Toán 12 / HK1 *?\"<>|  "), "de-toan-12-hk1");
    assert_eq!(slug("con"), "de-con");
    assert_eq!(slug("!!!"), "de");
    assert!(slug(&"a".repeat(200)).len() <= 40);
    let a = export_id();
    let b = export_id();
    assert_ne!(a, b, "hai lượt xuất liên tiếp phải có định danh khác nhau");
    assert!(a.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()), "định danh lượt xuất chỉ gồm chữ thường và số");
    let n = zip_name("de-thi", 4_000_000_123, &a, Kind::Student);
    assert!(n.ends_with("-hocsinh.zip") && n.contains("ee6b2d4b") || n.contains(&format!("{:08x}", 4_000_000_123u64 & 0xffff_ffff)));
    assert!(n.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.'), "tên ZIP chỉ có ký tự an toàn trên Windows: {n}");
    assert_ne!(zip_name("x", 1, "e1", Kind::Teacher), zip_name("x", 1, "e1", Kind::Student), "gói giáo viên và học sinh không trùng tên");
}

#[test]
fn csv_dap_an_rieng_tung_ma() {
    let s = spec2();
    let csv = answers_csv(&s.codes[1]);
    assert!(csv.starts_with('\u{feff}') && csv.contains("\r\n"));
    assert!(csv.contains("102,Phần I,1,u1,A") && csv.contains("102,Phần II,1,u3,ĐSĐS") && csv.contains("102,Phần III,1,u4,\"3,5\""), "{csv}");
    assert!(!csv.contains("Phần IV,"), "phần rỗng không có dòng");
    assert_eq!(csv.lines().count(), 1 + 4);
}

const DE: &str = "\\def\\made{101}\n\\begin{name}{a}{b}{c}{d}{e}{f}{g}{h}\n\\end{name}\n\n\\caulc\n\n\\begin{ex}%[x]\n A \\choice{\\True 1}{2}{3}{4}\n\\end{ex}\n\n\\begin{ex}\n B \\choice{1}{2}{\\True 3}{4}\n\\end{ex}\n\n\\cauds\n\n\\begin{ex}\n C \\choiceTF{\\True a}{b}{\\True c}{d}\n\\end{ex}\n\n\\caukq\n\n\\begin{ex}\n D \\shortans{3,5}\n\\end{ex}\n\n\\zlabel{\\made-lastpage}\n";
const MAIN: &str = "\\documentclass[12pt]{book}\n\\input{khaibaochung}\n%\\anloigiai\n\\begin{document}\n\\input{de-101}\n\\end{document}\n";

#[test]
fn doi_chieu_nguon_tung_ma() {
    assert_eq!(tex_part_counts(DE), [2, 1, 1, 0]);
    let c = &spec2().codes[0];
    assert!(check_code_files(c, MAIN, DE).is_ok());
    let leak = MAIN.replace("\\end{document}", "\\input{dapan}\n\\end{document}");
    assert!(check_code_files(c, &leak, DE).unwrap_err().contains("đáp án"), "main chèn bảng đáp án bị từ chối");
    let sol = MAIN.replace("%\\anloigiai", "\\anloigiai");
    assert!(check_code_files(c, &sol, DE).is_err(), "main bật lời giải bị từ chối");
    assert!(main_has_answers("\\input{dapan-giaovien}") && !main_has_answers("% \\input{dapan}"));
    let other = DE.replace("\\def\\made{101}", "\\def\\made{999}");
    assert!(check_code_files(c, MAIN, &other).is_err(), "mã khai báo khác mã dự kiến");
    let short = DE.replace("\\begin{ex}\n B", "% \n B");
    assert!(check_code_files(c, MAIN, &short).unwrap_err().contains("hedu-de.json"), "thiếu câu so với dữ liệu đã lưu");
    assert!(check_code_files(c, "\\documentclass{book}\\begin{document}\\end{document}", DE).is_err(), "main không gọi de-<mã>");
}

#[test]
fn dung_main_tu_main_goc_khong_them_dap_an() {
    let old = "\\documentclass[12pt]{book}\n\\input{khaibaochung}\n%\\anloigiai\n\\begin{document}\n\\input{de-101}\n\\newpage\n\\input{de-102}\n\\newpage\n\\input{dapan}\n\\end{document}\n";
    let m = derive_main(old, "102").unwrap();
    assert!(m.contains("\\input{de-102}") && !m.contains("de-101") && !m.contains("dapan") && m.contains("\\input{khaibaochung}") && m.ends_with("\\end{document}\n"));
    assert!(derive_main("khong co khung", "1").is_err());
}

#[test]
fn doc_hedu_de_json() {
    let ok = r#"{"v":1,"thongTin":{"title":"Thi thử"},"hatGiong":42,"maDe":[{"ma":"101","phan":{"p1":[{"uid":"a","dapAn":"B","tron":false}],"p2":[],"p3":[],"p4":[]}}]}"#;
    let s = parse_spec(ok).unwrap();
    assert_eq!((s.seed, s.codes.len(), s.codes[0].parts[0][0].1.as_str()), (42, 1, "B"));
    assert!(parse_spec("{").is_err() && parse_spec(r#"{"v":2}"#).is_err());
    assert!(parse_spec(&ok.replace("\"101\"", "\"../x\"")).is_err(), "mã đề không hợp lệ bị từ chối (không đưa vào tên tệp)");
    assert!(parse_spec(&ok.replace("\"dapAn\":\"B\",", "")).is_err(), "thiếu đáp án bị từ chối, không đoán");
    assert!(parse_spec(r#"{"v":1,"hatGiong":1,"maDe":[]}"#).is_err());
}

#[test]
fn goi_giao_vien_day_du_va_doc_lai_khop() {
    let s = spec2();
    let dest = tmp("gv");
    let mut calls = Vec::new();
    let mut prov = |c: &str, m: &str| -> Result<PdfOut, Fail> {
        calls.push(format!("{c}:{m}"));
        Ok(pdf(&format!("{c}{m}")))
    };
    let out = build_package(&plan(&s, Kind::Teacher, &["101", "102"], true, "eabc"), &dest, &mut prov, &no_progress, &AtomicBool::new(false)).unwrap();
    assert!(out.ok && out.results.iter().all(|r| r.status == "ok"), "{:?}", out.message);
    assert_eq!(calls, ["101:de", "101:loigiai", "102:de", "102:loigiai"]);
    let z = PathBuf::from(out.zip_path.clone().unwrap());
    let n = names(&z);
    for want in [
        "de/kiem-tra-hoc-ki-i-101-de.pdf", "loigiai/kiem-tra-hoc-ki-i-102-loigiai.pdf", "dapan/kiem-tra-hoc-ki-i-dapan-101.csv", "dapan/kiem-tra-hoc-ki-i-dapan-102.csv", "dapan/kiem-tra-hoc-ki-i-dap-an.xlsx",
        "manifest.json", "nguon/khaibaochung.tex", "nguon/hinh/Hình đồ thị.png", "nguon/de-101.tex",
    ] {
        assert!(n.iter().any(|x| x == want), "thiếu {want} trong {n:?}");
    }
    assert!(!n.iter().any(|x| x.contains("103")), "chỉ các mã đã chọn");
    // Excel đáp án: một tệp chung, chỉ các mã đã chọn, mở lại được
    {
        let mut a = zip::ZipArchive::new(fs::File::open(&z).unwrap()).unwrap();
        let mut xb = Vec::new();
        a.by_name("dapan/kiem-tra-hoc-ki-i-dap-an.xlsx").unwrap().read_to_end(&mut xb).unwrap();
        let mut x = zip::ZipArchive::new(std::io::Cursor::new(xb)).unwrap();
        let mut s1 = String::new();
        x.by_name("xl/worksheets/sheet1.xml").unwrap().read_to_string(&mut s1).unwrap();
        assert!(s1.contains(">101<") && s1.contains(">102<") && !s1.contains(">103<"), "Excel chỉ có mã đã chọn");
    }
    // manifest: truy nguyên, seed đầy đủ, SHA-256 từng tệp khớp nội dung thật
    let mut a = zip::ZipArchive::new(fs::File::open(&z).unwrap()).unwrap();
    let mut mt = String::new();
    a.by_name("manifest.json").unwrap().read_to_string(&mut mt).unwrap();
    let m: serde_json::Value = serde_json::from_str(&mt).unwrap();
    assert_eq!(m["hatGiong"], 4_000_000_123u64);
    assert_eq!(m["luotXuat"], "eabc");
    assert_eq!(m["maDe"].as_array().unwrap().len(), 2);
    for f in m["tep"].as_array().unwrap() {
        let mut b = Vec::new();
        a.by_name(f["tep"].as_str().unwrap()).unwrap().read_to_end(&mut b).unwrap();
        assert_eq!(sha_hex(&b), f["sha256"].as_str().unwrap(), "SHA-256 của {} phải khớp", f["tep"]);
    }
    assert!(fs::read_dir(&dest).unwrap().all(|e| !e.unwrap().file_name().to_string_lossy().ends_with(".part")), "không để lại tệp tạm");
    let _ = fs::remove_dir_all(&dest);
}

#[test]
fn goi_hoc_sinh_chi_co_pdf_de() {
    let s = spec2();
    let dest = tmp("hs");
    let mut prov = |c: &str, m: &str| -> Result<PdfOut, Fail> { Ok(pdf(&format!("{c}{m}"))) };
    // dù yêu cầu kèm lời giải, gói học sinh vẫn chỉ có PDF đề
    let out = build_package(&plan(&s, Kind::Student, &["101", "103"], true, "ehs"), &dest, &mut prov, &no_progress, &AtomicBool::new(false)).unwrap();
    assert!(out.ok);
    let n = names(&PathBuf::from(out.zip_path.unwrap()));
    assert_eq!(n, ["kiem-tra-hoc-ki-i-101-de.pdf", "kiem-tra-hoc-ki-i-103-de.pdf"], "gói học sinh: chỉ PDF đề, không CSV, manifest, nguồn hay lời giải");
    let _ = fs::remove_dir_all(&dest);
}

#[test]
fn loi_o_ma_giua_khong_tao_zip() {
    let s = spec2();
    let dest = tmp("loi");
    let mut prov = |c: &str, _m: &str| -> Result<PdfOut, Fail> { if c == "102" { Err(Fail::Msg("TeX báo lỗi".into())) } else { Ok(pdf(c)) } };
    let out = build_package(&plan(&s, Kind::Teacher, &["101", "102", "103"], false, "eloi"), &dest, &mut prov, &no_progress, &AtomicBool::new(false)).unwrap();
    assert!(!out.ok && out.zip_path.is_none());
    let st: Vec<_> = out.results.iter().map(|r| (r.code.as_str(), r.status.as_str())).collect();
    assert_eq!(st, [("101", "ok"), ("102", "failed"), ("103", "ok")], "báo rõ mã nào lỗi, vẫn dịch các mã còn lại để giữ bộ đệm");
    assert_eq!(fs::read_dir(&dest).unwrap().count(), 0, "không có ZIP, không có tệp tạm");
    let _ = fs::remove_dir_all(&dest);
}

#[test]
fn huy_giua_chung_khong_tao_zip() {
    let s = spec2();
    let dest = tmp("huy");
    let flag = AtomicBool::new(false);
    let mut prov = |c: &str, _m: &str| -> Result<PdfOut, Fail> {
        if c == "102" {
            flag.store(true, Ordering::SeqCst);
            Err(Fail::Cancelled)
        } else {
            Ok(pdf(c))
        }
    };
    let out = build_package(&plan(&s, Kind::Teacher, &["101", "102", "103"], false, "ehuy"), &dest, &mut prov, &no_progress, &flag).unwrap();
    assert!(out.cancelled && !out.ok && out.zip_path.is_none());
    assert_eq!(out.results.iter().find(|r| r.code == "103").unwrap().status, "cancelled", "mã sau khi huỷ không được dịch tiếp");
    assert_eq!(fs::read_dir(&dest).unwrap().count(), 0);
    let _ = fs::remove_dir_all(&dest);
}

#[test]
fn khong_ghi_de_ban_xuat_cu_va_khong_trung_ten() {
    let s = spec2();
    let dest = tmp("trung");
    let mut prov = |c: &str, _m: &str| -> Result<PdfOut, Fail> { Ok(pdf(c)) };
    // cùng ngày, cùng seed, cùng định danh lượt xuất (tình huống xấu nhất)
    let a = build_package(&plan(&s, Kind::Teacher, &["101"], false, "esame"), &dest, &mut prov, &no_progress, &AtomicBool::new(false)).unwrap();
    let before = fs::read(a.zip_path.as_ref().unwrap()).unwrap();
    let b = build_package(&plan(&s, Kind::Teacher, &["101"], false, "esame"), &dest, &mut prov, &no_progress, &AtomicBool::new(false)).unwrap();
    assert_ne!(a.zip_path, b.zip_path, "lần xuất sau phải có tên khác");
    assert_eq!(fs::read(a.zip_path.as_ref().unwrap()).unwrap(), before, "bản xuất cũ giữ nguyên từng byte");
    let _ = fs::remove_dir_all(&dest);
}

#[test]
fn pdf_hong_khong_dong_goi() {
    let s = spec2();
    let dest = tmp("hong");
    let mut prov = |_c: &str, _m: &str| -> Result<PdfOut, Fail> { Ok(PdfOut { bytes: b"khong phai pdf".to_vec(), ..pdf("x") }) };
    let out = build_package(&plan(&s, Kind::Student, &["101"], false, "ehong"), &dest, &mut prov, &no_progress, &AtomicBool::new(false)).unwrap();
    assert!(!out.ok && out.results[0].status == "failed" && fs::read_dir(&dest).unwrap().count() == 0);
    let _ = fs::remove_dir_all(&dest);
}

#[test]
fn gioi_han_so_ma_va_thu_muc_dich() {
    let s = spec2();
    let dest = tmp("gh");
    let mut prov = |c: &str, _m: &str| -> Result<PdfOut, Fail> { Ok(pdf(c)) };
    let many: Vec<String> = (0..25).map(|i| format!("{}", 100 + i)).collect();
    let mut p = plan(&s, Kind::Student, &[], false, "egh");
    p.codes = many;
    assert!(build_package(&p, &dest, &mut prov, &no_progress, &AtomicBool::new(false)).is_err(), "quá 24 mã bị từ chối");
    assert!(build_package(&plan(&s, Kind::Student, &["101"], false, "egh"), &dest.join("khong-co"), &mut prov, &no_progress, &AtomicBool::new(false)).is_err());
    let _ = fs::remove_dir_all(&dest);
}

/// ZIP phải đọc được bằng bộ đọc ĐỘC LẬP (.NET của Windows), có tên tiếng Việt và nội dung nhị phân đúng.
#[cfg(windows)]
#[test]
fn zip_doc_duoc_bang_bo_doc_doc_lap_cua_windows() {
    let s = spec2();
    let dest = tmp("net");
    let mut prov = |c: &str, m: &str| -> Result<PdfOut, Fail> { Ok(pdf(&format!("{c}{m}"))) };
    let out = build_package(&plan(&s, Kind::Teacher, &["101"], false, "enet"), &dest, &mut prov, &no_progress, &AtomicBool::new(false)).unwrap();
    let z = out.zip_path.unwrap();
    let script = format!(
        "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead('{}'); $sha=[Security.Cryptography.SHA256]::Create(); foreach($e in $z.Entries){{ $st=$e.Open(); $h=($sha.ComputeHash($st)|ForEach-Object{{$_.ToString('x2')}}) -join ''; $st.Close(); Write-Output ($e.FullName+'|'+$e.Length+'|'+$h) }}; $z.Dispose()",
        z.replace('\'', "''")
    );
    let o = std::process::Command::new("powershell.exe").args(["-NoProfile", "-NonInteractive", "-Command", &script]).output().unwrap();
    assert!(o.status.success(), "{}", String::from_utf8_lossy(&o.stderr));
    let text = String::from_utf8_lossy(&o.stdout).to_string();
    let mut a = zip::ZipArchive::new(fs::File::open(&z).unwrap()).unwrap();
    let mut seen = 0;
    for i in 0..a.len() {
        let mut e = a.by_index(i).unwrap();
        let mut b = Vec::new();
        e.read_to_end(&mut b).unwrap();
        let line = format!("{}|{}|{}", e.name(), b.len(), sha_hex(&b));
        assert!(text.lines().any(|l| l.trim() == line), "bộ đọc độc lập không thấy/không khớp mục: {line}\n{text}");
        seen += 1;
    }
    assert!(seen >= 6 && text.contains("Hình đồ thị.png"), "tên tiếng Việt đọc đúng: {text}");
    let _ = fs::remove_dir_all(&dest);
}

// ----- bộ đệm tách theo tệp chính (examcompile) -----

fn info(mode: &str, main: &str, fp: &str, bytes: u64) -> examcompile::GoodInfo {
    examcompile::GoodInfo { fingerprint: fp.into(), engine: "pdflatex".into(), mode: mode.into(), tex_version: "t".into(), pages: Some(1), bytes, at: "x".into(), pdf_path: String::new(), files_hash: String::new(), main: main.into() }
}

#[test]
fn ban_tot_cua_cac_tep_chinh_khong_ghi_de_nhau() {
    let root = tmp("slot");
    let id = "00000000-0000-4000-8000-000000000001";
    let (s1, s2) = (slot_of("main-101.tex"), slot_of("main-102.tex"));
    assert_ne!(s1, s2);
    assert!(s1.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'), "khoá tệp chính an toàn làm tên tệp: {s1}");
    assert_ne!(slot_of("a/b.tex"), slot_of("a-b.tex"), "đường dẫn khác nhau không trùng khoá dù cùng dạng chữ");
    let p = root.join("x.pdf");
    let mk = |tag: &str, mode: &str, slot: &str| {
        let body = format!("%PDF-1.5 {tag}");
        fs::write(&p, &body).unwrap();
        examcompile::publish(&root, id, &p, &info(mode, slot, &format!("fp-{tag}"), 0)).unwrap();
        body
    };
    mk("mac-dinh", "de", "");
    mk("m101", "de", &s1);
    mk("m102", "de", &s2);
    mk("m101-lg", "loigiai", &s1);
    assert_eq!(examcompile::last_good_slot(&root, id, "de", "").unwrap().fingerprint, "fp-mac-dinh", "bản của tệp chính mặc định không bị ghi đè");
    assert_eq!(examcompile::last_good_slot(&root, id, "de", &s1).unwrap().fingerprint, "fp-m101");
    assert_eq!(examcompile::last_good_slot(&root, id, "de", &s2).unwrap().fingerprint, "fp-m102");
    assert_eq!(examcompile::last_good_slot(&root, id, "loigiai", &s1).unwrap().fingerprint, "fp-m101-lg");
    assert!(examcompile::last_good_slot(&root, id, "loigiai", &s2).is_none(), "mã 102 chưa có bản lời giải");
    assert_eq!(examcompile::read_good_slot(&root, id, "de", &s1).unwrap().0, b"%PDF-1.5 m101");
    // sổ bị đổi tay sang khoá khác ⇒ không tin
    let jn = root.join(format!("cache/exam-build/{id}/out/last-good-de@{s1}.json"));
    let t = fs::read_to_string(&jn).unwrap().replace(&format!("\"main\":\"{s1}\""), &format!("\"main\":\"{s2}\""));
    fs::write(&jn, t).unwrap();
    assert!(examcompile::last_good_slot(&root, id, "de", &s1).is_none());
    assert!(examcompile::last_good_slot(&root, id, "de", "../x").is_none(), "khoá có ký tự lạ bị từ chối");
    let _ = fs::remove_dir_all(&root);
}
