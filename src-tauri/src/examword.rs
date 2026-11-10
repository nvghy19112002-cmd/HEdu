// Xuất đề ra Word (.docx) bằng Pandoc: mã LaTeX ex_test của một mã đề → .docx có công thức là Equation của Word (OMML).
// Cách làm: Pandoc đọc LaTeX, các lệnh ex_test (\choice, \loigiai, …) được khai báo sẵn ở word/pre.tex nên Pandoc tự mở rộng;
// word/filter.lua dựng bố cục đề (khung tên, PHẦN I/II/III, "Câu N.", phương án A–D, ý a)–d), lời giải); word/reference.docx là mẫu kiểu chữ/lề.
// Hình TikZ do giao diện dịch sẵn thành PNG rồi gửi sang (Pandoc không đọc được TikZ).
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

use crate::examlib::{projects_dir, read_manifest};

const PRE: &str = include_str!("word/pre.tex");
const FILTER: &str = include_str!("word/filter.lua");
const REFERENCE: &[u8] = include_bytes!("word/reference.docx");

#[derive(Deserialize)]
pub struct Fig {
    pub name: String,
    pub b64: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordIn {
    pub code: String,
    pub dest_dir: String,
    pub solution: bool,
    pub mark: bool,
    /// bản in đen trắng (không màu, không nền)
    #[serde(default)]
    pub print: bool,
    /// hậu tố tên tệp (vd. "-day-du"); rỗng thì suy từ solution/mark
    #[serde(default)]
    pub suffix: String,
    /// nội dung de-<mã>.tex đã thay hình TikZ bằng \includegraphics
    pub body: String,
    pub figures: Vec<Fig>,
    /// Word theo mẫu in HyMath (ảnh trang trí đã có trong `figures`): màu, lề, đầu/chân trang
    #[serde(default)]
    pub theme: Option<WordTheme>,
}

/// Ảnh trang trí: tên tệp trong `figures` + kích thước thật (cm).
#[derive(Deserialize, Clone)]
pub struct DecorImg {
    pub name: String,
    pub w: f64,
    pub h: f64,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WordTheme {
    /// màu nhấn RRGGBB
    pub accent: String,
    /// mã đề in ở chân trang
    #[serde(default)]
    pub code: String,
    /// khung tiêu đề (rộng cm) và các dải PHẦN (rộng cm, theo thứ tự)
    #[serde(default)]
    pub title_w: Option<f64>,
    #[serde(default)]
    pub parts_w: Vec<f64>,
    /// phần bên trái của đầu trang / chân trang
    #[serde(default)]
    pub head: Option<DecorImg>,
    #[serde(default)]
    pub foot: Option<DecorImg>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WordOut {
    pub path: String,
    pub bytes: u64,
    /// các lệnh LaTeX mà Word không hiểu (bị bỏ khi xuất)
    pub warnings: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PandocInfo {
    pub found: bool,
    pub path: String,
    pub version: String,
}

fn b64_decode(s: &str) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(s.len() / 4 * 3);
    let (mut acc, mut bits) = (0u32, 0u32);
    for c in s.bytes() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            b'=' | b'\n' | b'\r' | b' ' => continue,
            _ => return Err("Dữ liệu hình không hợp lệ.".into()),
        } as u32;
        acc = (acc << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    Ok(out)
}

fn safe_name(s: &str) -> String {
    let t: String = s.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').take(40).collect();
    if t.is_empty() { "de".into() } else { t }
}

fn unique_path(dir: &Path, stem: &str, ext: &str) -> PathBuf {
    let first = dir.join(format!("{stem}.{ext}"));
    if !first.exists() {
        return first;
    }
    for n in 2..1000 {
        let p = dir.join(format!("{stem}-{n}.{ext}"));
        if !p.exists() {
            return p;
        }
    }
    dir.join(format!("{stem}-{}.{ext}", std::process::id()))
}

fn warnings_of(stderr: &str) -> Vec<String> {
    let mut v: Vec<String> = stderr.lines().filter_map(|l| l.strip_prefix("HEDU-CANH-BAO ").map(|s| s.trim().to_string())).collect();
    v.sort();
    v.dedup();
    v
}

fn candidates(root: &Path) -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Ok(p) = std::env::var("HEDU_PANDOC") {
        v.push(PathBuf::from(p));
    }
    v.push(root.join("tools").join("pandoc").join("pandoc.exe"));
    if let Ok(exe) = std::env::current_exe() {
        if let Some(d) = exe.parent() {
            v.push(d.join("pandoc").join("pandoc.exe"));
        }
    }
    v.push(PathBuf::from(r"D:\HEdu-tools\pandoc\pandoc.exe"));
    v.push(PathBuf::from("pandoc"));
    v
}

fn run_version(p: &Path) -> Option<String> {
    let mut c = Command::new(p);
    c.arg("--version").stdout(Stdio::piped()).stderr(Stdio::null());
    crate::tikz::hide_console(&mut c);
    let out = c.output().ok()?;
    if !out.status.success() {
        return None;
    }
    String::from_utf8_lossy(&out.stdout).lines().next().map(|s| s.trim().to_string())
}

pub fn find_pandoc(root: &Path) -> Option<(PathBuf, String)> {
    candidates(root).into_iter().find_map(|p| run_version(&p).map(|v| (p, v)))
}

const MISSING: &str = "Chưa có Pandoc để xuất Word. Giải nén Pandoc vào D:\\HEdu-tools\\pandoc (hoặc thư mục tools\\pandoc trong dữ liệu HEdu) rồi thử lại.";

pub fn export_word(root: &Path, lib: &Path, id: &str, inp: &WordIn) -> Result<WordOut, String> {
    read_manifest(lib, id)?;
    let proj = projects_dir(lib).join(id);
    run_export(root, &proj, &[], inp)
}

/// Xuất Word cho đề chưa lưu (màn Tạo đề): không có thư mục dự án; ảnh câu hỏi chép từ kho ảnh vào thư mục tạm.
pub fn export_word_draft(root: &Path, imgs: &[crate::qimg::ImgRef], inp: &WordIn) -> Result<WordOut, String> {
    let none = root.join("tmp-word-khong-co-du-an");
    run_export(root, &none, imgs, inp)
}

fn run_export(root: &Path, proj: &Path, imgs: &[crate::qimg::ImgRef], inp: &WordIn) -> Result<WordOut, String> {
    let (pandoc, _) = find_pandoc(root).ok_or_else(|| MISSING.to_string())?;
    let dest = PathBuf::from(&inp.dest_dir);
    if !dest.is_dir() {
        return Err("Thư mục đích không tồn tại.".into());
    }
    let work = root.join(format!("tmp-word-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)));
    fs::create_dir_all(&work).map_err(|e| format!("Không tạo được thư mục tạm: {e}"))?;
    let r = (|| -> Result<WordOut, String> {
        fs::write(work.join("in.tex"), format!("{PRE}{}\n\\end{{document}}\n", inp.body)).map_err(|e| e.to_string())?;
        fs::write(work.join("filter.lua"), FILTER).map_err(|e| e.to_string())?;
        fs::write(work.join("reference.docx"), REFERENCE).map_err(|e| e.to_string())?;
        if !imgs.is_empty() {
            crate::qimg::materialize(&crate::qimg::dir_of(root), &work, imgs)?;
        }
        for f in &inp.figures {
            if f.name.is_empty() || f.name.contains(['/', '\\', ':']) {
                return Err("Tên hình không hợp lệ.".into());
            }
            fs::write(work.join(&f.name), b64_decode(&f.b64)?).map_err(|e| e.to_string())?;
        }
        let mut c = Command::new(&pandoc);
        c.current_dir(&work)
            .args(["-f", "latex", "-t", "docx", "in.tex", "-o", "out.docx", "--lua-filter", "filter.lua", "--reference-doc", "reference.docx", "--wrap=none"])
            .arg(format!("--resource-path={};{}", work.display(), proj.display()))
            .arg("-M").arg(format!("made={}", safe_name(&inp.code)))
            .arg("-M").arg(format!("solution={}", if inp.solution { 1 } else { 0 }))
            .arg("-M").arg(format!("mark={}", if inp.mark { 1 } else { 0 }))
            .arg("-M").arg(format!("print={}", if inp.print { 1 } else { 0 }));
        if let Some(t) = &inp.theme {
            c.arg("-M").arg("decor=1");
            if let Some(w) = t.title_w {
                c.arg("-M").arg(format!("dtitle={w:.3}"));
            }
            if !t.parts_w.is_empty() {
                c.arg("-M").arg(format!("dparts={}", t.parts_w.iter().map(|w| format!("{w:.3}")).collect::<Vec<_>>().join(",")));
            }
        }
        c.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped());
        crate::tikz::hide_console(&mut c);
        let mut child = c.spawn().map_err(|e| format!("Không chạy được Pandoc: {e}"))?;
        let start = Instant::now();
        let mut stderr = String::new();
        loop {
            match child.try_wait() {
                Ok(Some(_)) => break,
                Ok(None) if start.elapsed() > Duration::from_secs(180) => {
                    let _ = child.kill();
                    return Err("Pandoc chạy quá lâu, đã dừng.".into());
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(60)),
                Err(e) => return Err(e.to_string()),
            }
        }
        if let Some(mut e) = child.stderr.take() {
            use std::io::Read;
            let _ = e.read_to_string(&mut stderr);
        }
        let out = work.join("out.docx");
        if !out.is_file() {
            let msg: String = stderr.lines().filter(|l| !l.starts_with("HEDU-CANH-BAO")).take(4).collect::<Vec<_>>().join(" ");
            return Err(format!("Pandoc không tạo được tệp Word. {msg}"));
        }
        let head = stderr.lines().find_map(|l| l.strip_prefix("HEDU-DAU-TRANG ")).unwrap_or("").trim().to_string();
        match &inp.theme {
            Some(t) => apply_theme(&out, &work, t).map_err(|e| format!("Không áp được mẫu in vào tệp Word: {e}"))?,
            None => fill_header(&out, &head, &safe_name(&inp.code)).map_err(|e| format!("Không ghi được đầu/chân trang: {e}"))?,
        }
        let suffix = if inp.suffix.is_empty() { (if inp.mark { "-dap-an" } else if inp.solution { "-loi-giai" } else { "" }).to_string() } else { safe_name(&inp.suffix.replace('-', "_")).replace('_', "-") };
        let stem = format!("de-{}{}", safe_name(&inp.code), suffix);
        let target = unique_path(&dest, &stem, "docx");
        fs::copy(&out, &target).map_err(|e| format!("Không ghi được tệp Word: {e}"))?;
        let bytes = fs::metadata(&target).map(|m| m.len()).unwrap_or(0);
        Ok(WordOut { path: target.to_string_lossy().into_owned(), bytes, warnings: warnings_of(&stderr) })
    })();
    let _ = fs::remove_dir_all(&work);
    r
}

/// Điền chữ vào đầu trang / chân trang của tệp Word vừa dựng (mẫu có chỗ giữ @@DAUTRANG@@ và @@MA@@).
fn fill_header(docx: &Path, head: &str, code: &str) -> Result<(), String> {
    use std::io::{Read, Write};
    let esc = |t: &str| t.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;");
    let mut zin = zip::ZipArchive::new(fs::File::open(docx).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let tmp = docx.with_extension("tmp");
    let mut zout = zip::ZipWriter::new(fs::File::create(&tmp).map_err(|e| e.to_string())?);
    let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for i in 0..zin.len() {
        let mut f = zin.by_index(i).map_err(|e| e.to_string())?;
        let name = f.name().to_string();
        let mut buf = Vec::new();
        f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        if name.starts_with("word/header") || name.starts_with("word/footer") {
            let t = String::from_utf8_lossy(&buf).replace("@@DAUTRANG@@", &esc(head)).replace("@@MA@@", &esc(&if code.is_empty() { String::new() } else { format!("Mã đề {code}") }));
            buf = t.into_bytes();
        }
        zout.start_file(name, opts).map_err(|e| e.to_string())?;
        zout.write_all(&buf).map_err(|e| e.to_string())?;
    }
    zout.finish().map_err(|e| e.to_string())?;
    fs::rename(&tmp, docx).map_err(|e| e.to_string())
}

// ---------- Word theo mẫu in HyMath ----------
// Lề giống geometry của lõi HyMath: margin=17mm, top=24mm, bottom=22mm (đơn vị twip = 1/1440 inch).
const MM: f64 = 1440.0 / 25.4;
const PAGE_W: f64 = 11906.0;
const EMU_CM: f64 = 360000.0;

fn twip(mm: f64) -> i64 {
    (mm * MM).round() as i64
}

fn hex6(s: &str) -> String {
    let t: String = s.chars().filter(|c| c.is_ascii_hexdigit()).take(6).collect::<String>().to_uppercase();
    if t.len() == 6 { t } else { "1F55A4".into() }
}

/// Pha màu với trắng (như `màu!p` của xcolor, p = phần màu).
fn tint(hex: &str, p: f64) -> String {
    let v = |i: usize| u8::from_str_radix(&hex[i..i + 2], 16).unwrap_or(0) as f64;
    let m = |c: f64| (c * p + 255.0 * (1.0 - p)).round().clamp(0.0, 255.0) as u8;
    format!("{:02X}{:02X}{:02X}", m(v(0)), m(v(2)), m(v(4)))
}

fn xml_esc(t: &str) -> String {
    t.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

const NS: &str = r#"xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture""#;

/// Ảnh nằm trong dòng (đầu/chân trang).
fn inline_pic(rid: &str, img: &DecorImg, id: u32) -> String {
    let (cx, cy) = ((img.w * EMU_CM).round() as i64, (img.h * EMU_CM).round() as i64);
    format!(r#"<w:r><w:rPr><w:position w:val="-4"/></w:rPr><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{cx}" cy="{cy}"/><wp:docPr id="{id}" name="hedu-decor-{id}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="{id}" name="{name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>"#, name = xml_esc(&img.name))
}

fn field(code: &str, rpr: &str) -> String {
    format!(r#"<w:r>{rpr}<w:fldChar w:fldCharType="begin"/></w:r><w:r>{rpr}<w:instrText xml:space="preserve"> {code} </w:instrText></w:r><w:r>{rpr}<w:fldChar w:fldCharType="separate"/></w:r><w:r>{rpr}<w:t>1</w:t></w:r><w:r>{rpr}<w:fldChar w:fldCharType="end"/></w:r>"#)
}

fn text_run(t: &str, rpr: &str) -> String {
    format!(r#"<w:r>{rpr}<w:t xml:space="preserve">{}</w:t></w:r>"#, xml_esc(t))
}

/// Đầu trang: ảnh bên trái (vạch + tên kỳ thi của mẫu), bên phải ô "Trang N" tô màu nhấn; kẻ dưới màu nhạt.
fn header_xml(t: &WordTheme, accent: &str) -> String {
    let tab = (PAGE_W - 2.0 * twip(17.0) as f64).round() as i64;
    let pic = t.head.as_ref().map(|h| inline_pic("rIdHeduDecorHead", h, 9101)).unwrap_or_default();
    let rpr = format!(r#"<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="19"/><w:shd w:val="clear" w:color="auto" w:fill="{accent}"/></w:rPr>"#);
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr {NS}><w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="{line}"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="{tab}"/></w:tabs><w:spacing w:before="0" w:after="0"/></w:pPr>{pic}<w:r><w:tab/></w:r>{a}{f}{b}</w:p></w:hdr>"#,
        line = tint(accent, 0.55),
        a = text_run(" Trang ", &rpr),
        f = field("PAGE", &rpr),
        b = text_run(" ", &rpr),
    )
}

/// Chân trang: ảnh bên trái (tên giáo viên theo mẫu, nếu có), bên phải "Mã đề … • trang/tổng"; kẻ trên màu nhạt.
fn footer_xml(t: &WordTheme, accent: &str) -> String {
    let tab = (PAGE_W - 2.0 * twip(17.0) as f64).round() as i64;
    let pic = t.foot.as_ref().map(|h| inline_pic("rIdHeduDecorFoot", h, 9102)).unwrap_or_default();
    let rpr = format!(r#"<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:color w:val="{accent}"/><w:sz w:val="18"/></w:rPr>"#);
    let code = t.code.trim();
    let lead = if code.is_empty() { String::new() } else { text_run(&format!("Mã đề {code}  •  "), &rpr) };
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr {NS}><w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="6" w:space="4" w:color="{line}"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="{tab}"/></w:tabs><w:spacing w:before="0" w:after="0"/></w:pPr>{pic}<w:r><w:tab/></w:r>{lead}{p}{s}{n}</w:p></w:ftr>"#,
        line = tint(accent, 0.55),
        p = field("PAGE", &rpr),
        s = text_run("/", &rpr),
        n = field("NUMPAGES", &rpr),
    )
}

fn rels_xml(rid: &str, target: &str) -> String {
    format!(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="{target}"/></Relationships>"#)
}

/// Thay khối <w:pgMar …/> bằng lề của mẫu.
fn set_margins(doc: &str) -> String {
    let mar = format!(r#"<w:pgMar w:top="{}" w:right="{m}" w:bottom="{}" w:left="{m}" w:header="{}" w:footer="{}" w:gutter="0"/>"#, twip(24.0), twip(22.0), twip(9.0), twip(10.0), m = twip(17.0));
    let mut out = String::with_capacity(doc.len());
    let mut rest = doc;
    while let Some(i) = rest.find("<w:pgMar ") {
        out.push_str(&rest[..i]);
        match rest[i..].find("/>") {
            Some(j) => { out.push_str(&mar); rest = &rest[i + j + 2..]; }
            None => { rest = &rest[i..]; break; }
        }
    }
    out.push_str(rest);
    out
}

/// Thay (hoặc thêm) một kiểu trong styles.xml.
fn put_style(xml: &str, id: &str, def: &str) -> String {
    let key = format!(r#"w:styleId="{id}""#);
    if let Some(k) = xml.find(&key) {
        if let (Some(a), Some(e)) = (xml[..k].rfind("<w:style "), xml[k..].find("</w:style>")) {
            return format!("{}{}{}", &xml[..a], def, &xml[k + e + "</w:style>".len()..]);
        }
    }
    xml.replacen("</w:styles>", &format!("{def}</w:styles>"), 1)
}

/// Kiểu riêng của Word theo mẫu: đoạn ảnh trang trí sát lề, dòng "Lời giải." căn giữa, lời giải không viền/nền (như ex_test).
fn theme_styles(xml: &str, accent: &str) -> String {
    let decor = r#"<w:style w:type="paragraph" w:customStyle="1" w:styleId="HeduDecor"><w:name w:val="HeduDecor"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="100" w:line="240" w:lineRule="auto"/><w:ind w:left="0" w:firstLine="0"/><w:jc w:val="center"/></w:pPr></w:style>"#;
    let lgt = format!(r#"<w:style w:type="paragraph" w:customStyle="1" w:styleId="HeduLGTieuDe"><w:name w:val="HeduLGTieuDe"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="120" w:after="40"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:color w:val="{accent}"/></w:rPr></w:style>"#);
    let lg = r#"<w:style w:type="paragraph" w:customStyle="1" w:styleId="HeduLoiGiai"><w:name w:val="HeduLoiGiai"/><w:basedOn w:val="BodyText"/><w:qFormat/><w:pPr><w:spacing w:before="20" w:after="40"/></w:pPr></w:style>"#;
    put_style(&put_style(&put_style(xml, "HeduDecor", decor), "HeduLGTieuDe", &lgt), "HeduLoiGiai", lg)
}

/// Bảng phương án A–D / ý a)–d) (ô đầu bắt đầu bằng nhãn) thụt vào như ex_test.
fn indent_choices(doc: &str) -> String {
    const OLD: &str = r#"<w:tblW w:type="pct" w:w="5000" />"#;
    let new = format!(r#"<w:tblW w:type="pct" w:w="4740" /><w:tblInd w:w="{}" w:type="dxa" />"#, twip(9.0));
    let mut out = String::with_capacity(doc.len() + 1024);
    let mut rest = doc;
    while let Some(i) = rest.find("<w:tbl>") {
        out.push_str(&rest[..i]);
        let t = &rest[i..];
        let cell_end = t.find("</w:tc>").unwrap_or(t.len());
        let first = &t[..cell_end];
        let is_choice = first.contains(r#"w:val="HeduNhan"#) || first.contains(r#"w:val="HeduDung"#);
        match t.find(OLD) {
            Some(j) if is_choice && j < cell_end => {
                out.push_str(&t[..j]);
                out.push_str(&new);
                rest = &t[j + OLD.len()..];
            }
            _ => {
                out.push_str("<w:tbl>");
                rest = &t["<w:tbl>".len()..];
            }
        }
    }
    out.push_str(rest);
    out
}

/// Áp mẫu in vào tệp Word Pandoc vừa dựng: màu nhấn, lề, đầu/chân trang (kèm ảnh).
fn apply_theme(docx: &Path, work: &Path, t: &WordTheme) -> Result<(), String> {
    use std::io::{Read, Write};
    let accent = hex6(&t.accent);
    let mut zin = zip::ZipArchive::new(fs::File::open(docx).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let tmp = docx.with_extension("tmp");
    let mut zout = zip::ZipWriter::new(fs::File::create(&tmp).map_err(|e| e.to_string())?);
    let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let put = |z: &mut zip::ZipWriter<fs::File>, name: &str, buf: &[u8]| -> Result<(), String> {
        z.start_file(name, opts).map_err(|e| e.to_string())?;
        z.write_all(buf).map_err(|e| e.to_string())
    };
    let mut seen_head = None::<String>;
    let mut seen_foot = None::<String>;
    for i in 0..zin.len() {
        let mut f = zin.by_index(i).map_err(|e| e.to_string())?;
        let name = f.name().to_string();
        let mut buf = Vec::new();
        f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        let is = |p: &str| name.starts_with(p) && name.ends_with(".xml") && !name.contains("_rels");
        if is("word/header") {
            buf = header_xml(t, &accent).into_bytes();
            seen_head = Some(name.trim_start_matches("word/").to_string());
        } else if is("word/footer") {
            buf = footer_xml(t, &accent).into_bytes();
            seen_foot = Some(name.trim_start_matches("word/").to_string());
        } else if name == "word/styles.xml" {
            buf = theme_styles(&String::from_utf8_lossy(&buf).replace("14286B", &accent), &accent).into_bytes();
        } else if name == "word/document.xml" {
            buf = indent_choices(&set_margins(&String::from_utf8_lossy(&buf))).into_bytes();
        } else if name == "[Content_Types].xml" {
            let s = String::from_utf8_lossy(&buf).into_owned();
            buf = if s.contains(r#"Extension="png""#) { s } else { s.replacen("<Default ", r#"<Default Extension="png" ContentType="image/png"/><Default "#, 1) }.into_bytes();
        } else if name.starts_with("word/_rels/header") || name.starts_with("word/_rels/footer") {
            continue; // viết lại bên dưới
        }
        put(&mut zout, &name, &buf)?;
    }
    for (seen, img, rid, media) in [(seen_head, &t.head, "rIdHeduDecorHead", "hedu-decor-head.png"), (seen_foot, &t.foot, "rIdHeduDecorFoot", "hedu-decor-foot.png")] {
        if let (Some(part), Some(img)) = (seen, img) {
            let bytes = fs::read(work.join(&img.name)).map_err(|e| format!("Thiếu ảnh trang trí {}: {e}", img.name))?;
            put(&mut zout, &format!("word/media/{media}"), &bytes)?;
            put(&mut zout, &format!("word/_rels/{part}.rels"), rels_xml(rid, &format!("media/{media}")).as_bytes())?;
        }
    }
    zout.finish().map_err(|e| e.to_string())?;
    fs::rename(&tmp, docx).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct DecorFile {
    pub path: String,
    pub text: String,
}

/// Trình dịch được phép: pdflatex (mặc định của HEdu) hoặc xelatex (mẫu cần phông hệ thống).
fn engine_of(e: &Option<String>) -> Result<&'static str, String> {
    match e.as_deref().map(str::trim) {
        None | Some("") | Some("xelatex") => Ok("xelatex"),
        Some("pdflatex") => Ok("pdflatex"),
        Some(x) => Err(format!("Trình dịch không hỗ trợ: {x}")),
    }
}

/// Biên dịch một bộ tệp .tex nhỏ (phần trang trí của mẫu in, bộ trình chiếu) trong thư mục tạm, trả về PDF.
pub fn decor_pdf(work_root: &Path, tex_bin: &Option<String>, support: &Option<PathBuf>, files: &[DecorFile], main: &str, engine: &str) -> Result<Vec<u8>, String> {
    let ok = |p: &str| !p.is_empty() && !p.contains(['/', '\\', ':']) && !p.starts_with('.') && p.len() < 80;
    if !ok(main) || files.iter().any(|f| !ok(&f.path)) || !files.iter().any(|f| f.path == main) {
        return Err("Tệp trang trí không hợp lệ.".into());
    }
    let work = work_root.join(format!("tmp-decor-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)));
    fs::create_dir_all(&work).map_err(|e| format!("Không tạo được thư mục tạm: {e}"))?;
    let r = (|| -> Result<Vec<u8>, String> {
        for f in files {
            fs::write(work.join(&f.path), &f.text).map_err(|e| e.to_string())?;
        }
        let never = std::sync::atomic::AtomicBool::new(false);
        let mut c = crate::examcompile::engine_command(tex_bin, engine, support, &work);
        c.args(["-interaction=nonstopmode", "-halt-on-error", "-no-shell-escape", main]);
        let stem = main.trim_end_matches(".tex");
        match crate::proc::run_job(&mut c, Duration::from_secs(240), &never) {
            Ok(o) if o.timed_out => return Err("Dịch quá 240 giây nên đã dừng.".into()),
            Ok(o) if !o.success => {
                let log = fs::read_to_string(work.join(format!("{stem}.log"))).unwrap_or_default();
                let first = log.lines().find(|l| l.starts_with('!')).unwrap_or("TeX báo lỗi.");
                return Err(format!("TeX báo lỗi khi dịch: {first}"));
            }
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Err(crate::tikz::missing_tool(engine).message),
            Err(e) => return Err(format!("Không chạy được {engine}: {e}")),
        }
        fs::read(work.join(format!("{stem}.pdf"))).map_err(|_| "TeX không tạo được PDF.".to_string())
    })();
    let _ = fs::remove_dir_all(&work);
    r
}

#[tauri::command]
pub async fn word_decor_pdf(app: AppHandle, files: Vec<DecorFile>, main: String, tex_bin: Option<String>, engine: Option<String>) -> Result<tauri::ipc::Response, String> {
    let root = root_of(&app)?;
    let sup = crate::support::prepare(&root);
    let work_root = root.join("cache");
    fs::create_dir_all(&work_root).map_err(|e| e.to_string())?;
    let tex_bin = tex_bin.filter(|s| !s.trim().is_empty());
    let eng = engine_of(&engine)?;
    tauri::async_runtime::spawn_blocking(move || decor_pdf(&work_root, &tex_bin, &sup, &files, &main, eng)).await.map_err(|e| e.to_string())?.map(tauri::ipc::Response::new)
}

/// Dịch một bộ tệp .tex (vd bộ trình chiếu) rồi lưu PDF vào thư mục người dùng chọn, không ghi đè tệp có sẵn. Trả về đường dẫn tệp.
#[tauri::command]
pub async fn tex_pdf_to_dir(app: AppHandle, files: Vec<DecorFile>, main: String, tex_bin: Option<String>, engine: Option<String>, dest_dir: String, base: String) -> Result<String, String> {
    let root = root_of(&app)?;
    let sup = crate::support::prepare(&root);
    let work_root = root.join("cache");
    fs::create_dir_all(&work_root).map_err(|e| e.to_string())?;
    let tex_bin = tex_bin.filter(|s| !s.trim().is_empty());
    let eng = engine_of(&engine)?;
    let dest = PathBuf::from(&dest_dir);
    if !dest.is_dir() {
        return Err("Thư mục đích không tồn tại.".into());
    }
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let pdf = decor_pdf(&work_root, &tex_bin, &sup, &files, &main, eng)?;
        let target = unique_path(&dest, &safe_name(&base), "pdf");
        fs::write(&target, pdf).map_err(|e| format!("Không ghi được PDF: {e}"))?;
        Ok(target.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn root_of(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn exam_word_info(app: AppHandle) -> Result<PandocInfo, String> {
    let root = root_of(&app)?;
    tauri::async_runtime::spawn_blocking(move || match find_pandoc(&root) {
        Some((p, v)) => PandocInfo { found: true, path: p.to_string_lossy().into_owned(), version: v },
        None => PandocInfo { found: false, path: String::new(), version: String::new() },
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn exam_word_export(app: AppHandle, id: String, input: WordIn) -> Result<WordOut, String> {
    let root = root_of(&app)?;
    let lib = root.join("exam-library");
    tauri::async_runtime::spawn_blocking(move || export_word(&root, &lib, &id, &input)).await.map_err(|e| e.to_string())?
}

/// Xuất Word thẳng từ màn Tạo đề (đề chưa lưu vào Thư viện).
#[tauri::command]
pub async fn exam_word_export_draft(app: AppHandle, input: WordIn, images: Vec<crate::qimg::ImgRef>) -> Result<WordOut, String> {
    let root = root_of(&app)?;
    tauri::async_runtime::spawn_blocking(move || export_word_draft(&root, &images, &input)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn giai_ma_base64() {
        assert_eq!(b64_decode("aGVsbG8=").unwrap(), b"hello");
        assert_eq!(b64_decode("aGVs\nbG8h").unwrap(), b"hello!");
        assert!(b64_decode("a$b").is_err());
    }

    #[test]
    fn ten_tep_an_toan_va_khong_ghi_de() {
        assert_eq!(safe_name("../101"), "101");
        assert_eq!(safe_name("???"), "de");
        let d = std::env::temp_dir().join(format!("hedu-word-test-{}", std::process::id()));
        fs::create_dir_all(&d).unwrap();
        let a = unique_path(&d, "de-101", "docx");
        fs::write(&a, b"x").unwrap();
        let b = unique_path(&d, "de-101", "docx");
        assert_ne!(a, b);
        assert!(b.to_string_lossy().ends_with("de-101-2.docx"));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn doc_canh_bao_tu_stderr() {
        let w = warnings_of("x\nHEDU-CANH-BAO lệnh \\foo\nHEDU-CANH-BAO lệnh \\foo\nHEDU-CANH-BAO lệnh \\bar\n");
        assert_eq!(w, vec!["lệnh \\bar".to_string(), "lệnh \\foo".to_string()]);
    }

    #[test]
    fn chon_trinh_dich() {
        assert_eq!(engine_of(&None).unwrap(), "xelatex");
        assert_eq!(engine_of(&Some("pdflatex".into())).unwrap(), "pdflatex");
        assert!(engine_of(&Some("lualatex --shell-escape".into())).is_err());
    }

    #[test]
    fn mau_in_mau_le_va_dau_trang() {
        assert_eq!(hex6("#1f55a4"), "1F55A4");
        assert_eq!(hex6("xx"), "1F55A4");
        assert_eq!(tint("000000", 0.5), "808080");
        assert_eq!(tint("1F55A4", 1.0), "1F55A4");
        let d = set_margins(r#"<w:sectPr><w:pgMar w:top="1" w:right="2"/></w:sectPr><w:pgMar w:top="9"/>"#);
        assert_eq!(d.matches("<w:pgMar ").count(), 2);
        assert!(d.contains(&format!(r#"w:left="{}""#, twip(17.0))) && !d.contains(r#"w:top="9""#));
        let t = WordTheme { accent: "1F55A4".into(), code: "04".into(), title_w: Some(17.6), parts_w: vec![], head: Some(DecorImg { name: "decor-head.png".into(), w: 4.7, h: 0.56 }), foot: None };
        let h = header_xml(&t, "1F55A4");
        assert!(h.contains("rIdHeduDecorHead") && h.contains(" PAGE ") && h.contains(r#"w:fill="1F55A4""#));
        let st = theme_styles(r#"<w:styles><w:style w:type="paragraph" w:styleId="HeduLoiGiai"><w:pBdr/></w:style></w:styles>"#, "1F55A4");
        assert!(st.contains("HeduDecor") && st.contains("HeduLGTieuDe") && !st.contains("<w:pBdr/>") && st.matches(r#"w:styleId="HeduLoiGiai""#).count() == 1);
        let tb = r#"<w:tbl><w:tblPr><w:tblW w:type="pct" w:w="5000" /></w:tblPr><w:tr><w:tc><w:r><w:rStyle w:val="HeduNhan" /></w:r></w:tc></w:tr></w:tbl><w:tbl><w:tblPr><w:tblW w:type="pct" w:w="5000" /></w:tblPr><w:tr><w:tc><w:r><w:rStyle w:val="HeduCauSo" /></w:r></w:tc></w:tr></w:tbl>"#;
        let ti = indent_choices(tb);
        assert_eq!(ti.matches("w:tblInd").count(), 1);
        assert_eq!(ti.matches(r#"w:w="5000""#).count(), 1);
        let f = footer_xml(&t, "1F55A4");
        assert!(f.contains("Mã đề 04") && f.contains(" NUMPAGES ") && !f.contains("rIdHeduDecorFoot"));
    }

    /// Thử tay với Pandoc thật: HEDU_WORD_TEST=<thư mục có de.tex, theme.json, ảnh decor-*.png> cargo test --lib word_theo_mau_that -- --ignored
    #[test]
    #[ignore]
    fn word_theo_mau_that() {
        let dir = PathBuf::from(std::env::var("HEDU_WORD_TEST").expect("HEDU_WORD_TEST"));
        let enc = |b: &[u8]| -> String {
            const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
            let mut s = String::new();
            for c in b.chunks(3) {
                let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
                for k in 0..4 {
                    s.push(if k <= c.len() { T[(n >> (18 - 6 * k) & 63) as usize] as char } else { '=' });
                }
            }
            s
        };
        let j: serde_json::Value = serde_json::from_str(&fs::read_to_string(dir.join("theme.json")).unwrap()).unwrap();
        let theme: WordTheme = serde_json::from_value(j["theme"].clone()).unwrap();
        let figures: Vec<Fig> = j["figures"].as_array().unwrap().iter().map(|n| { let n = n.as_str().unwrap(); Fig { name: n.into(), b64: enc(&fs::read(dir.join(n)).unwrap()) } }).collect();
        let out_dir = dir.join("out");
        fs::create_dir_all(&out_dir).unwrap();
        for (sol, mark, sfx) in [(false, false, ""), (true, true, "-day-du")] {
            let inp = WordIn { code: "04".into(), dest_dir: out_dir.to_string_lossy().into(), solution: sol, mark, print: false, suffix: sfx.into(), body: fs::read_to_string(dir.join("de.tex")).unwrap(), figures: figures_clone(&figures), theme: Some(theme.clone()) };
            let o = export_word_draft(&dir, &[], &inp).unwrap();
            println!("{} {} {:?}", o.path, o.bytes, o.warnings);
        }
    }

    fn figures_clone(f: &[Fig]) -> Vec<Fig> {
        f.iter().map(|x| Fig { name: x.name.clone(), b64: x.b64.clone() }).collect()
    }
}
