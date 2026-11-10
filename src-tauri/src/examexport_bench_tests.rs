// Đo tốc độ luồng xuất đề với TeX Live THẬT (không chạy trong CI, không có ngưỡng cứng): dịch trước song song như `export_codes`
// rồi lượt kiểm tuần tự từng (mã, bản). Dùng đề mẫu GIẢ LẬP có main-<mã>.tex (không dùng dữ liệu thật).
// Chạy: HEDU_TEX_BIN=<thư mục bin> HEDU_BENCH_DE=<thư mục đề> cargo test --lib --locked do_toc_do_xuat -- --ignored --nocapture
use super::*;
use std::time::Instant;

#[test]
#[ignore]
fn do_toc_do_xuat_de() {
    let (Ok(bin), Ok(src)) = (std::env::var("HEDU_TEX_BIN"), std::env::var("HEDU_BENCH_DE")) else { return };
    let root = crate::testutil::dir("examexport-do-toc-do");
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    let s = crate::examlib::import(&root.join("exam-library"), Path::new(&src), "Đo tốc độ", Some("main.tex")).unwrap();
    let sup = support::prepare(&root);
    let lanes_now = || crate::proc::export_lanes(crate::proc::cpus());
    let mut pairs: Vec<(String, &'static str)> = Vec::new();
    for c in ["101", "102", "103", "104"] {
        pairs.push((c.to_string(), "de"));
        pairs.push((c.to_string(), "loigiai"));
    }
    let proj = projects_dir(&root.join("exam-library")).join(&s.id);
    // vòng 0: lần đầu; vòng 1: sửa một câu ở mỗi mã rồi xuất lại; vòng 2: không đổi gì (dùng lại PDF)
    for round in 0..3 {
        if round == 1 {
            for c in ["101", "102", "103", "104"] {
                let p = proj.join(format!("de-{c}.tex"));
                let t = fs::read_to_string(&p).unwrap();
                fs::write(&p, format!("{t}\n% sửa lần {round}\n")).unwrap();
            }
        }
        let t0 = Instant::now();
        let lanes = lanes_now().min(pairs.len());
        if lanes >= 2 {
            prewarm(&root, &s.id, &pairs, &None, &Some(bin.clone()), Some(180), &sup, &AtomicBool::new(false), lanes);
        }
        let warm = t0.elapsed().as_millis();
        for (c, m) in &pairs {
            let co = CompileOpts { engine: None, timeout_secs: Some(180), runs: Some(2), tex_bin: Some(bin.clone()), force: None, mode: Some((*m).to_string()), main: Some(format!("main-{c}.tex")), wrap: None, wrap_modes: None, lane: None };
            let r = compile(&root, &s.id, &co, &sup).unwrap();
            assert_eq!(r.status, "ok", "{c}/{m}: {} {}", r.message, r.raw_log);
            // HEDU_BENCH_OUT: chép PDF từng vòng ra để so ảnh (vòng 1 chỉ thêm chú thích ⇒ phải giống vòng 0)
            if let Ok(out) = std::env::var("HEDU_BENCH_OUT") {
                let _ = fs::create_dir_all(&out);
                let _ = fs::copy(&r.last_good.as_ref().unwrap().pdf_path, Path::new(&out).join(format!("v{round}-{c}-{m}.pdf")));
            }
        }
        let fmts = fs::read_dir(root.join("cache").join("exam-fmt")).map(|rd| rd.flatten().filter(|e| e.path().extension().map(|x| x == "fmt").unwrap_or(false)).count()).unwrap_or(0);
        eprintln!("vòng {round}: {} làn, dịch trước {warm} ms, tổng {} ms, định dạng dựng sẵn: {fmts}", lanes, t0.elapsed().as_millis());
        std::thread::sleep(std::time::Duration::from_secs(4)); // chờ luồng nền dựng định dạng xong (như giáo viên sửa đề giữa hai lần)
    }
    let _ = fs::remove_dir_all(&root);
}
