//! E5: hai chế độ biên dịch xác định rõ — "Đề" (không lời giải) và "Lời giải" — từ CÙNG một nguồn, KHÔNG sửa tệp nguồn.
//! Chỉ nhận diện khi CHẮC: đúng MỘT lệnh `\usepackage[...]{ex_test}` đang hoạt động (không nằm sau dấu %) trong cả dự án.
//! Không nhận diện chắc (không thấy, thấy nhiều, nạp chung với gói khác, `\PassOptionsToPackage`, tệp không phải UTF-8) ⇒ KHÔNG có chế độ
//! Đề/Lời giải: HEdu không bao giờ xuất một PDF có thể chứa lời giải dưới tên "Đề". Bản dẫn xuất chỉ được ghi trong thư mục build.
//! - Chế độ Đề: tuỳ chọn của ex_test = giữ nguyên các tuỳ chọn khác, bỏ `loigiai`, đặt `dethi`.
//! - Chế độ Lời giải: bỏ `dethi`, đặt `loigiai`; dòng `\anloigiai` đang bật (ẩn lời giải) bị tắt (thêm %) trong bản dẫn xuất.
#![allow(dead_code)]

use serde::Serialize;
use std::fs;
use std::io::Read;
use std::path::Path;

use crate::examlib::open_inside;

pub const MODE_DE: &str = "de";
pub const MODE_LOIGIAI: &str = "loigiai";
const MAX_SCAN_BYTES: u64 = 5 * 1024 * 1024;

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    pub file: String,
    pub line: u32,
    pub before: String,
    pub after: String,
}

#[derive(Serialize, Debug, Clone, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProfileInfo {
    /// có thể biên dịch riêng "Đề" và "Lời giải" từ nguồn này
    pub available: bool,
    /// lý do khi chưa dùng được
    pub reason: Option<String>,
    /// vị trí lệnh \usepackage[...]{ex_test} duy nhất
    pub file: Option<String>,
    pub line: Option<u32>,
    pub options: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
struct Usage {
    line: u32,
    /// vị trí chèn/thay tuỳ chọn trong tệp: [from, to) là phần BÊN TRONG dấu [ ] (hoặc rỗng tại điểm chèn khi chưa có dấu [ ])
    from: usize,
    to: usize,
    had_brackets: bool,
    opts: Vec<String>,
    /// ex_test nằm chung một lệnh với gói khác
    shared: bool,
}

/// Phần mã của một dòng: bỏ từ dấu % đầu tiên không bị escape (`\%`).
pub fn code_part(line: &str) -> &str {
    let b = line.as_bytes();
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'\\' => i += 2,
            b'%' => return &line[..i],
            _ => i += 1,
        }
    }
    line
}

fn skip_ws(s: &str, mut i: usize) -> usize {
    let b = s.as_bytes();
    while i < b.len() && (b[i] == b' ' || b[i] == b'\t') {
        i += 1;
    }
    i
}

fn find_usages(text: &str) -> (Vec<Usage>, bool) {
    let mut out = Vec::new();
    let mut pass_options = false;
    let mut off = 0usize;
    for (ln, raw) in text.split('\n').enumerate() {
        let code = code_part(raw);
        if code.contains("\\PassOptionsToPackage") && code.contains("ex_test") {
            pass_options = true;
        }
        let mut from = 0;
        while let Some(p) = code[from..].find("\\usepackage") {
            let start = from + p;
            let mut i = skip_ws(code, start + "\\usepackage".len());
            let (mut ob, mut oe, mut brackets) = (i, i, false);
            let mut opts_s = String::new();
            if code.as_bytes().get(i) == Some(&b'[') {
                if let Some(close) = code[i..].find(']') {
                    ob = i + 1;
                    oe = i + close;
                    opts_s = code[ob..oe].to_string();
                    brackets = true;
                    i = skip_ws(code, oe + 1);
                } else {
                    from = start + 1;
                    continue;
                }
            }
            if code.as_bytes().get(i) == Some(&b'{') {
                if let Some(close) = code[i..].find('}') {
                    let pk: Vec<&str> = code[i + 1..i + close].split(',').map(str::trim).collect();
                    if pk.contains(&"ex_test") {
                        out.push(Usage {
                            line: ln as u32 + 1,
                            from: off + if brackets { ob } else { i },
                            to: off + if brackets { oe } else { i },
                            had_brackets: brackets,
                            opts: opts_s.split(',').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect(),
                            shared: pk.len() > 1,
                        });
                    }
                }
            }
            from = start + 1;
        }
        off += raw.len() + 1;
    }
    (out, pass_options)
}

/// Tuỳ chọn mới cho chế độ `mode`: bỏ cả `loigiai` và `dethi`, giữ các tuỳ chọn khác theo thứ tự, thêm đúng một chế độ ở cuối.
pub fn mode_options(old: &[String], mode: &str) -> Vec<String> {
    let mut v: Vec<String> = old.iter().filter(|o| *o != "loigiai" && *o != "dethi").cloned().collect();
    v.push(if mode == MODE_LOIGIAI { "loigiai" } else { "dethi" }.to_string());
    v
}

fn is_tex_like(rel: &str) -> bool {
    let l = rel.to_lowercase();
    l.ends_with(".tex") || l.ends_with(".sty") || l.ends_with(".cls") || l.ends_with(".def") || l.ends_with(".cfg")
}

struct Found {
    file: String,
    text: String,
    usage: Usage,
}

fn read_text(dir: &Path, rel: &str) -> Option<String> {
    let mut b = Vec::new();
    let h = open_inside(dir, rel).ok()?;
    if h.metadata().ok()?.len() > MAX_SCAN_BYTES {
        return None;
    }
    h.take(MAX_SCAN_BYTES).read_to_end(&mut b).ok()?;
    String::from_utf8(b).ok()
}

/// Quét các tệp TeX của dự án (trong thư mục `dir`, danh sách `rels`). Trả về nơi dùng duy nhất hoặc lý do không chắc.
fn locate(dir: &Path, rels: &[String]) -> Result<Found, String> {
    let mut all: Vec<Found> = Vec::new();
    let mut shared = false;
    let mut pass = false;
    for rel in rels.iter().filter(|r| is_tex_like(r)) {
        let Some(text) = read_text(dir, rel) else {
            // không đọc được/không phải UTF-8: có thể che một lệnh nạp gói ⇒ không dám khẳng định
            if open_inside(dir, rel).map(|h| h.metadata().map(|m| m.len() > 0).unwrap_or(true)).unwrap_or(true) {
                return Err(format!("Tệp '{rel}' không đọc được dạng UTF-8 (hoặc quá lớn) nên HEdu không chắc cách bật/tắt lời giải."));
            }
            continue;
        };
        let (us, p) = find_usages(&text);
        pass |= p;
        for u in us {
            shared |= u.shared;
            all.push(Found { file: rel.clone(), text: text.clone(), usage: u });
        }
    }
    if pass {
        return Err("Dự án dùng \\PassOptionsToPackage cho ex_test nên HEdu không chắc cách bật/tắt lời giải.".into());
    }
    match all.len() {
        0 => Err("Không thấy lệnh \\usepackage[...]{ex_test} đang hoạt động trong dự án nên HEdu không biết cách bật/tắt lời giải.".into()),
        1 if shared => Err("ex_test được nạp chung với gói khác trong một lệnh \\usepackage nên HEdu không tự đổi tuỳ chọn.".into()),
        1 => Ok(all.pop().unwrap()),
        n => Err(format!("Có {n} lệnh \\usepackage nạp ex_test đang hoạt động ({}); HEdu không đoán lệnh nào là đúng.", all.iter().map(|f| format!("{}:{}", f.file, f.usage.line)).collect::<Vec<_>>().join(", "))),
    }
}

pub fn detect(dir: &Path, rels: &[String]) -> ProfileInfo {
    match locate(dir, rels) {
        Ok(f) => ProfileInfo { available: true, reason: None, file: Some(f.file), line: Some(f.usage.line), options: f.usage.opts },
        Err(r) => ProfileInfo { available: false, reason: Some(r), ..Default::default() },
    }
}

pub struct Derived {
    /// (đường dẫn tương đối, nội dung mới) — chỉ để ghi trong thư mục build
    pub files: Vec<(String, String)>,
    pub changes: Vec<Change>,
}

/// Dựng bản dẫn xuất cho `mode` ("de" hoặc "loigiai"). Không ghi gì ra đĩa.
pub fn derive(dir: &Path, rels: &[String], mode: &str) -> Result<Derived, String> {
    if mode != MODE_DE && mode != MODE_LOIGIAI {
        return Err("Chế độ không hợp lệ.".into());
    }
    let f = locate(dir, rels)?;
    let u = &f.usage;
    let new_opts = mode_options(&u.opts, mode).join(",");
    let mut text = f.text.clone();
    let before = text[line_start(&text, u.from)..line_end(&text, u.to)].trim_end_matches('\r').to_string();
    let insert = if u.had_brackets { new_opts.clone() } else { format!("[{new_opts}]") };
    text.replace_range(u.from..u.to, &insert);
    let after_line = {
        let s = line_start(&text, u.from);
        text[s..line_end(&text, s)].trim_end_matches('\r').to_string()
    };
    let mut changes = vec![Change { file: f.file.clone(), line: u.line, before, after: after_line }];
    let mut files = vec![(f.file.clone(), text)];
    if mode == MODE_LOIGIAI {
        // bật \anloigiai ẩn lời giải ⇒ tắt trong bản dẫn xuất
        for rel in rels.iter().filter(|r| is_tex_like(r)) {
            let cur = files.iter().find(|(r, _)| r == rel).map(|(_, t)| t.clone()).or_else(|| read_text(dir, rel));
            let Some(cur) = cur else { continue };
            let mut out = String::with_capacity(cur.len() + 4);
            let mut touched = false;
            for (ln, raw) in cur.split_inclusive('\n').enumerate() {
                if code_part(raw).trim() == "\\anloigiai" {
                    out.push('%');
                    touched = true;
                    changes.push(Change { file: rel.clone(), line: ln as u32 + 1, before: raw.trim_end().to_string(), after: format!("%{}", raw.trim_end()) });
                }
                out.push_str(raw);
            }
            if touched {
                files.retain(|(r, _)| r != rel);
                files.push((rel.clone(), out));
            }
        }
    }
    Ok(Derived { files, changes })
}

fn line_start(t: &str, pos: usize) -> usize {
    t[..pos].rfind('\n').map(|i| i + 1).unwrap_or(0)
}
fn line_end(t: &str, pos: usize) -> usize {
    t[pos..].find('\n').map(|i| pos + i).unwrap_or(t.len())
}

/// Ghi bản dẫn xuất vào thư mục build (ghi tạm rồi đổi tên). Chỉ dùng cho thư mục build, KHÔNG BAO GIỜ cho thư mục nguồn.
pub fn write_derived(work: &Path, d: &Derived) -> Result<(), String> {
    for (rel, text) in &d.files {
        let dest = work.join(rel);
        let part = dest.with_extension("hedu-derive");
        fs::write(&part, text.as_bytes()).map_err(|e| format!("Không ghi được bản dẫn xuất {rel}: {e}"))?;
        if fs::rename(&part, &dest).is_err() {
            let _ = fs::remove_file(&dest);
            fs::rename(&part, &dest).map_err(|e| format!("Không ghi được bản dẫn xuất {rel}: {e}"))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(tag: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("hedu-ep-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
    fn proj(tag: &str, files: &[(&str, &str)]) -> (std::path::PathBuf, Vec<String>) {
        let d = tmp(tag);
        for (r, t) in files {
            let p = d.join(r);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(p, t).unwrap();
        }
        (d, files.iter().map(|(r, _)| r.to_string()).collect())
    }

    #[test]
    fn bo_phan_chu_thich_nhung_giu_percent_da_escape() {
        assert_eq!(code_part("\\usepackage{a} % chu thich"), "\\usepackage{a} ");
        assert_eq!(code_part("giam 50\\% rồi % x"), "giam 50\\% rồi ");
        assert_eq!(code_part("%\\usepackage[dethi]{ex_test}"), "");
        assert_eq!(code_part("khong co"), "khong co");
    }

    #[test]
    fn nhan_dien_mau_cua_hedu_dong_dang_hoat_dong_duy_nhat() {
        // đúng như khaibaochung.tex do HEdu xuất: một dòng [loigiai] bật, một dòng [dethi] đang bị chú thích
        let (d, rels) = proj("hedu", &[("main.tex", "\\documentclass{book}\n\\input{khaibaochung}\n%\\anloigiai\n\\begin{document}\n\\end{document}\n"), ("khaibaochung.tex", "\\usepackage{amsmath}\n\\usepackage[loigiai]{ex_test}\n%\\usepackage[dethi]{ex_test}\n")]);
        let p = detect(&d, &rels);
        assert_eq!((p.available, p.file.as_deref(), p.line, p.options.clone()), (true, Some("khaibaochung.tex"), Some(2), vec!["loigiai".to_string()]), "{p:?}");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn nhan_dien_cau_truc_hedu_sty() {
        // từ 10/2026: khaibaochung.tex chỉ \usepackage{hedu}; hedu.sty \input hedu-khaibao.tex (nơi có dòng ex_test)
        let (d, rels) = proj("hedusty", &[
            ("main.tex", "\\documentclass{book}\n\\input{khaibaochung}\n%\\anloigiai\n\\begin{document}\n\\end{document}\n"),
            ("khaibaochung.tex", "% nap goi\n\\usepackage{hedu}\n"),
            ("hedu.sty", "\\ProvidesPackage{hedu}\n\\makeatother\n\\input{hedu-khaibao.tex}\n\\makeatletter\n\\IfFileExists{hedu-goithem.tex}{\\input{hedu-goithem.tex}}{}\n"),
            ("hedu-khaibao.tex", "\\usepackage{amsmath}\n\\usepackage[loigiai]{ex_test}\n%\\usepackage[dethi]{ex_test}\n"),
            ("hedu-goithem.tex", "\\makeatletter\n\\@ifpackageloaded{siunitx}{}{\\usepackage{siunitx}}\n\\makeatother\n"),
        ]);
        let p = detect(&d, &rels);
        assert_eq!((p.available, p.file.as_deref(), p.line), (true, Some("hedu-khaibao.tex"), Some(2)), "{p:?}");
        let de = derive(&d, &rels, MODE_DE).unwrap();
        assert_eq!(de.files.len(), 1);
        assert_eq!(de.files[0].0, "hedu-khaibao.tex");
        assert!(de.files[0].1.contains("\\usepackage[dethi]{ex_test}") && !de.files[0].1.contains("[loigiai]{ex_test}"));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn che_do_de_va_loi_giai_chi_doi_dung_mot_cho_va_khong_dung_nguon() {
        let src = "\\documentclass{book}\r\n\\usepackage[book, loigiai ,color]{ex_test}\r\n\\begin{document}\r\nX\r\n\\end{document}\r\n";
        let (d, rels) = proj("modes", &[("main.tex", src)]);
        let de = derive(&d, &rels, MODE_DE).unwrap();
        assert_eq!(de.files.len(), 1);
        assert_eq!(de.files[0].1, "\\documentclass{book}\r\n\\usepackage[book,color,dethi]{ex_test}\r\n\\begin{document}\r\nX\r\n\\end{document}\r\n", "giữ CRLF và phần còn lại nguyên văn");
        assert_eq!((de.changes[0].line, de.changes[0].before.as_str(), de.changes[0].after.as_str()), (2, "\\usepackage[book, loigiai ,color]{ex_test}", "\\usepackage[book,color,dethi]{ex_test}"));
        let lg = derive(&d, &rels, MODE_LOIGIAI).unwrap();
        assert!(lg.files[0].1.contains("\\usepackage[book,color,loigiai]{ex_test}") && !lg.files[0].1.contains("dethi"));
        assert_eq!(fs::read_to_string(d.join("main.tex")).unwrap(), src, "tệp nguồn không bị sửa");
        assert!(derive(&d, &rels, "nguyen-van").is_err());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn chua_co_ngoac_vuong_thi_them_tuy_chon() {
        let (d, rels) = proj("nobr", &[("a.tex", "\\usepackage{ex_test}\n")]);
        assert_eq!(derive(&d, &rels, MODE_DE).unwrap().files[0].1, "\\usepackage[dethi]{ex_test}\n");
        assert_eq!(derive(&d, &rels, MODE_LOIGIAI).unwrap().files[0].1, "\\usepackage[loigiai]{ex_test}\n");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn che_do_loi_giai_tat_anloigiai_dang_bat_o_tep_khac() {
        let (d, rels) = proj("an", &[("main.tex", "\\input{kb}\n\\anloigiai\n\\begin{document}\n\\end{document}\n"), ("kb.tex", "\\usepackage[loigiai]{ex_test}\n")]);
        let lg = derive(&d, &rels, MODE_LOIGIAI).unwrap();
        let main = lg.files.iter().find(|(r, _)| r == "main.tex").unwrap();
        assert!(main.1.contains("%\\anloigiai\n"), "{}", main.1);
        assert!(lg.changes.iter().any(|c| c.file == "main.tex" && c.line == 2));
        let de = derive(&d, &rels, MODE_DE).unwrap();
        assert!(de.files.iter().all(|(r, _)| r != "main.tex"), "chế độ Đề không đụng \\anloigiai");
        assert_eq!(fs::read_to_string(d.join("main.tex")).unwrap(), "\\input{kb}\n\\anloigiai\n\\begin{document}\n\\end{document}\n");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn khong_chac_thi_khong_cho_xuat_de() {
        let cases: &[(&str, &[(&str, &str)])] = &[
            ("không thấy", &[("main.tex", "\\documentclass{book}\n% \\usepackage[dethi]{ex_test}\n")]),
            ("hai lệnh", &[("a.tex", "\\usepackage[loigiai]{ex_test}\n"), ("b.tex", "\\usepackage[dethi]{ex_test}\n")]),
            ("hai lệnh cùng tệp", &[("a.tex", "\\usepackage[loigiai]{ex_test}\n\\usepackage{ex_test}\n")]),
            ("nạp chung", &[("a.tex", "\\usepackage[loigiai]{amsmath,ex_test}\n")]),
            ("pass options", &[("a.tex", "\\PassOptionsToPackage{loigiai}{ex_test}\n\\usepackage{ex_test}\n")]),
        ];
        for (tag, files) in cases {
            let (d, rels) = proj(&format!("unsure-{}", tag.len()), files);
            let p = detect(&d, &rels);
            assert!(!p.available && p.reason.is_some(), "{tag}: {p:?}");
            assert!(derive(&d, &rels, MODE_DE).is_err() && derive(&d, &rels, MODE_LOIGIAI).is_err(), "{tag}");
            let _ = fs::remove_dir_all(&d);
        }
        // tệp không phải UTF-8 có thể che lệnh nạp gói ⇒ không dám khẳng định
        let d = tmp("nonutf8");
        fs::write(d.join("a.tex"), b"\\usepackage[loigiai]{ex_test}\n").unwrap();
        fs::write(d.join("b.tex"), b"\xE0\xE1 khong phai utf8").unwrap();
        let p = detect(&d, &["a.tex".to_string(), "b.tex".to_string()]);
        assert!(!p.available, "{p:?}");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn ghi_ban_dan_xuat_chi_vao_thu_muc_build() {
        let (src, rels) = proj("wsrc", &[("main.tex", "\\usepackage[loigiai]{ex_test}\n")]);
        let work = tmp("wwork");
        fs::write(work.join("main.tex"), "\\usepackage[loigiai]{ex_test}\n").unwrap();
        let d = derive(&src, &rels, MODE_DE).unwrap();
        write_derived(&work, &d).unwrap();
        assert_eq!(fs::read_to_string(work.join("main.tex")).unwrap(), "\\usepackage[dethi]{ex_test}\n");
        assert_eq!(fs::read_to_string(src.join("main.tex")).unwrap(), "\\usepackage[loigiai]{ex_test}\n");
        assert!(!work.join("main.hedu-derive").exists());
        let _ = fs::remove_dir_all(&src);
        let _ = fs::remove_dir_all(&work);
    }
}
