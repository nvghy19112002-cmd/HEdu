// Hỏi TeX Live của máy: "tệp .sty/.cls/… này có không?" và "gói nào chứa tệp này?".
// Chỉ ĐỌC và TRA CỨU. Tuyệt đối không chạy `tlmgr install` hay sửa gì trong TeX Live (Issue #1).
use std::process::Command;
use std::time::Duration;

use crate::proc::{run_capture, Slots};
use crate::tikz::{hide_console, prog, TikzErr};

/// Số lần gọi kpsewhich chạy song song.
static KPSE_SLOTS: Slots = Slots::new(4);

#[cfg_attr(not(test), derive(serde::Serialize))]
#[cfg_attr(not(test), serde(rename_all = "camelCase"))]
pub struct FileHit {
    pub file: String,
    /// đường dẫn tìm thấy; None = TeX Live hiện chọn không có tệp này
    pub path: Option<String>,
}

#[cfg_attr(not(test), derive(serde::Serialize))]
#[cfg_attr(not(test), serde(rename_all = "camelCase"))]
pub struct PkgHit {
    /// tên gói trong TeX Live (dùng cho `tlmgr install <tên>`)
    pub package: String,
    /// đường dẫn tệp trong gói
    pub file: String,
}

fn err(stage: &str, m: impl Into<String>) -> TikzErr {
    TikzErr { message: m.into(), log: String::new(), stage: stage.to_string() }
}

/// Tên tệp hợp lệ để tra: chữ, số và . _ + - / \ — không cho ký tự lạ, không cho bắt đầu bằng '-'
/// (khỏi bị hiểu thành tuỳ chọn của chương trình), không có "..".
pub fn valid_file(f: &str) -> bool {
    let t = f.trim();
    !t.is_empty()
        && t.len() <= 200
        && !t.starts_with('-')
        && !t.contains("..")
        && t.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '+' | '-' | '/' | '\\' | ' '))
}

fn missing_kpse() -> TikzErr {
    err(
        "thieu-texlive",
        "Không chạy được kpsewhich của TeX Live. Hãy điền thư mục bin của TeX Live ở mục Hệ thống (ví dụ D:\\texlive\\texlive\\2026\\bin\\windows) hoặc bấm Tìm tự động.",
    )
}

/// Tra một tệp. Ok(None) = không có; Err = không chạy được kpsewhich.
fn kpse_one(file: &str, tex_bin: &Option<String>) -> Result<Option<String>, TikzErr> {
    let mut c = Command::new(prog(tex_bin, "kpsewhich"));
    c.arg(file.trim());
    hide_console(&mut c);
    match run_capture(&mut c, Duration::from_secs(15)) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Err(missing_kpse()),
        Err(e) => Err(err("latex", format!("Không chạy được kpsewhich: {e}"))),
        Ok(o) if o.timed_out => Err(err("qua-lau", "kpsewhich chạy quá 15 giây nên đã dừng.")),
        Ok(o) => {
            let line = o.stdout.lines().next().unwrap_or("").trim().to_string();
            Ok(if o.success && !line.is_empty() { Some(line) } else { None })
        }
    }
}

/// Tra nhiều tệp (bỏ trùng, giữ thứ tự). Một tệp có tên không hợp lệ bị coi là không tìm thấy.
pub fn check_files(files: &[String], tex_bin: &Option<String>) -> Result<Vec<FileHit>, TikzErr> {
    let mut uniq: Vec<&String> = Vec::new();
    for f in files.iter().take(400) {
        if !uniq.contains(&f) {
            uniq.push(f);
        }
    }
    // thử một tệp đầu để biết có kpsewhich không, khỏi báo lỗi lặp cho từng tệp
    let mut out: Vec<Option<Result<Option<String>, TikzErr>>> = (0..uniq.len()).map(|_| None).collect();
    if let Some(first) = uniq.iter().position(|f| valid_file(f)) {
        let r = kpse_one(uniq[first], tex_bin)?;
        out[first] = Some(Ok(r));
    }
    std::thread::scope(|sc| {
        let hs: Vec<_> = out
            .iter()
            .enumerate()
            .filter(|(i, o)| o.is_none() && valid_file(uniq[*i]))
            .map(|(i, _)| {
                let f = uniq[i].clone();
                let bin = tex_bin.clone();
                (i, sc.spawn(move || {
                    let _p = KPSE_SLOTS.acquire();
                    kpse_one(&f, &bin)
                }))
            })
            .collect();
        for (i, h) in hs {
            out[i] = Some(h.join().unwrap_or_else(|_| Err(err("latex", "luồng tra cứu bị lỗi"))));
        }
    });
    let mut res = Vec::new();
    for (i, f) in uniq.iter().enumerate() {
        let path = match out[i].take() {
            Some(Ok(p)) => p,
            Some(Err(e)) => return Err(e),
            None => None,
        };
        res.push(FileHit { file: (*f).clone(), path });
    }
    Ok(res)
}

/// Biến tên tệp thành mẫu tìm cho tlmgr: chỉ khớp đúng tên tệp ở cuối đường dẫn.
pub fn tlmgr_pattern(file: &str) -> String {
    let esc: String = file
        .trim()
        .chars()
        .flat_map(|c| if matches!(c, '.' | '+') { vec!['\\', c] } else { vec![c] })
        .collect();
    format!("/{esc}$")
}

/// Đọc kết quả `tlmgr search --file`: dòng "tên-gói:" rồi các dòng thụt vào là đường dẫn tệp.
/// Chỉ nhận đường dẫn có tên tệp đúng bằng `file`, để không đề xuất gói chỉ vì trùng một phần tên.
pub fn parse_tlmgr(out: &str, file: &str) -> Vec<PkgHit> {
    let want = file.trim().replace('\\', "/");
    let want = want.rsplit('/').next().unwrap_or("").to_ascii_lowercase();
    let mut res: Vec<PkgHit> = Vec::new();
    let mut cur: Option<String> = None;
    for line in out.lines() {
        if line.trim().is_empty() {
            continue;
        }
        if !line.starts_with(char::is_whitespace) {
            let t = line.trim_end();
            cur = t.strip_suffix(':').map(|s| s.trim().to_string()).filter(|s| !s.is_empty() && !s.contains(' '));
        } else if let Some(pkg) = &cur {
            let path = line.trim();
            let base = path.rsplit('/').next().unwrap_or("").to_ascii_lowercase();
            if base == want && !res.iter().any(|r| &r.package == pkg) {
                res.push(PkgHit { package: pkg.clone(), file: path.to_string() });
            }
        }
    }
    res
}

/// Hỏi tlmgr gói nào chứa `file`. `global` = tra cả kho trên mạng (chỉ khi người dùng đồng ý).
pub fn find_package(file: &str, tex_bin: &Option<String>, global: bool) -> Result<Vec<PkgHit>, TikzErr> {
    if !valid_file(file) {
        return Err(err("latex", "Tên tệp không hợp lệ."));
    }
    let mut c = Command::new(prog(tex_bin, "tlmgr"));
    c.arg("search").arg("--file");
    if global {
        c.arg("--global");
    }
    c.arg(tlmgr_pattern(file));
    hide_console(&mut c);
    let limit = Duration::from_secs(if global { 90 } else { 30 });
    match run_capture(&mut c, limit) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Err(err(
            "thieu-texlive",
            "Máy không có lệnh tlmgr (TeX Live Manager) nên chưa tra được tên gói. Bạn có thể mở TeX Live Manager bằng tay và tìm tên tệp.",
        )),
        Err(e) => Err(err("latex", format!("Không chạy được tlmgr: {e}"))),
        Ok(o) if o.timed_out => Err(err("qua-lau", format!("tlmgr chạy quá {} giây nên đã dừng (mạng chậm?).", limit.as_secs()))),
        Ok(o) if !o.success && o.stdout.trim().is_empty() => Err(TikzErr {
            message: String::from("tlmgr báo lỗi khi tra cứu."),
            log: o.stderr.lines().rev().take(8).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n"),
            stage: String::from("latex"),
        }),
        Ok(o) => Ok(parse_tlmgr(&o.stdout, file)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ten_tep_hop_le() {
        assert!(valid_file("tikz-3dplot.sty"));
        assert!(valid_file("tikzlibrarycalc.code.tex"));
        assert!(valid_file("hinh/h1.tex"));
        assert!(!valid_file("-version"));
        assert!(!valid_file("../../etc/passwd"));
        assert!(!valid_file("a;b"));
        assert!(!valid_file("a&b.sty"));
        assert!(!valid_file("a$b"));
        assert!(!valid_file(""));
        assert!(!valid_file(&"a".repeat(201)));
    }

    #[test]
    fn mau_tlmgr_thoat_ky_tu_dac_biet() {
        assert_eq!(tlmgr_pattern("tikz-3dplot.sty"), "/tikz-3dplot\\.sty$");
        assert_eq!(tlmgr_pattern("a+b.sty"), "/a\\+b\\.sty$");
    }

    #[test]
    fn doc_ket_qua_tlmgr() {
        let out = "tikz-3dplot:\n\ttexmf-dist/tex/latex/tikz-3dplot/tikz-3dplot.sty\nother:\n\ttexmf-dist/doc/x/tikz-3dplot.sty.bak\n";
        let r = parse_tlmgr(out, "tikz-3dplot.sty");
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].package, "tikz-3dplot");
        assert!(r[0].file.ends_with("tikz-3dplot.sty"));
    }

    #[test]
    fn tlmgr_khong_ket_qua() {
        assert!(parse_tlmgr("", "x.sty").is_empty());
        assert!(parse_tlmgr("tlmgr: package repository ...\n", "x.sty").is_empty());
    }

    #[test]
    fn tlmgr_khong_phan_biet_hoa_thuong_va_bo_trung() {
        let out = "pkg:\n\ta/b/Foo.sty\n\ta/c/foo.sty\n";
        let r = parse_tlmgr(out, "foo.sty");
        assert_eq!(r.len(), 1);
    }

    #[test]
    fn khong_co_kpsewhich_thi_bao_thieu_texlive() {
        let r = check_files(&["a.sty".to_string()], &Some("/khong/co/dau".into()));
        // trên máy dev có thể có sẵn kpsewhich; chỉ kiểm tra khi thiếu
        if let Err(e) = r {
            assert_eq!(e.stage, "thieu-texlive");
        }
    }
}
