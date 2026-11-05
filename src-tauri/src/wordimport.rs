// Nhập tệp Word (.docx, hoặc .doc cũ qua Word) sang LaTeX thô: công thức MathType nhúng được đổi bằng mtef.rs, phần còn lại do Pandoc làm.
// Đầu ra là LaTeX "thô" (đoạn văn, danh sách, bảng, công thức $…$); TypeScript (wordimport.ts) tách thành các khối ex_test.
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOut {
    pub latex: String,
    pub equations: usize,
    pub failed: usize,
    pub images: Vec<String>,
    pub warnings: Vec<String>,
    /// thư mục chứa ảnh đã tách (tạm), có thể trống
    pub media_dir: String,
}

const TOKEN_OPEN: &str = "@@MT";
const TOKEN_CLOSE: &str = "@@";

/// Thay mỗi đối tượng nhúng công thức (w:object / w:pict có o:OLEObject) bằng một dấu hiệu văn bản @@MTn@@; trả về danh sách rId theo thứ tự.
fn tokenize(doc: &str) -> (String, Vec<String>) {
    let mut out = String::with_capacity(doc.len());
    let mut ids: Vec<String> = Vec::new();
    let mut pos = 0;
    while let Some(rel) = doc[pos..].find("<o:OLEObject") {
        let at = pos + rel;
        let tag_end = doc[at..].find('>').map(|e| at + e + 1).unwrap_or(doc.len());
        let tag = &doc[at..tag_end];
        // phần bao ngoài: <w:object …> … </w:object> hoặc <w:pict> … </w:pict> gần nhất phía trước
        let (open_a, close_tag) = {
            let a = doc[pos..at].rfind("<w:object").map(|x| (pos + x, "</w:object>"));
            let b = doc[pos..at].rfind("<w:pict").map(|x| (pos + x, "</w:pict>"));
            match (a, b) { (Some(x), Some(y)) => if x.0 > y.0 { x } else { y }, (Some(x), None) => x, (None, Some(y)) => y, _ => (at, "") }
        };
        let is_eq = tag.contains("ProgID=\"Equation");
        let rid = tag.find("r:id=\"").map(|i| { let s = i + 6; tag[s..].split('"').next().unwrap_or("").to_string() });
        let close_end = if close_tag.is_empty() { None } else { doc[tag_end..].find(close_tag).map(|e| tag_end + e + close_tag.len()) };
        match (is_eq, rid, close_end) {
            (true, Some(r), Some(ce)) if open_a >= pos => {
                out.push_str(&doc[pos..open_a]);
                ids.push(r);
                out.push_str(&format!("<w:t xml:space=\"preserve\">{TOKEN_OPEN}{}{TOKEN_CLOSE}</w:t>", ids.len() - 1));
                pos = ce;
            }
            _ => {
                out.push_str(&doc[pos..tag_end]);
                pos = tag_end;
            }
        }
    }
    out.push_str(&doc[pos..]);
    (out, ids)
}

fn rels_map(rels: &str) -> HashMap<String, String> {
    let mut m = HashMap::new();
    for part in rels.split("<Relationship ").skip(1) {
        let end = part.find('>').unwrap_or(part.len());
        let p = &part[..end];
        let get = |k: &str| p.find(&format!("{k}=\"")).map(|i| { let s = i + k.len() + 2; p[s..].split('"').next().unwrap_or("").to_string() });
        if let (Some(id), Some(t)) = (get("Id"), get("Target")) {
            m.insert(id, t);
        }
    }
    m
}

fn pandoc_path(root: &Path) -> Option<PathBuf> {
    crate::examword::find_pandoc(root).map(|x| x.0)
}

fn doc_to_docx(src: &Path, dst: &Path) -> Result<(), String> {
    let ps = format!(
        "$ErrorActionPreference='Stop'; $w = New-Object -ComObject Word.Application; $w.Visible = $false; $w.DisplayAlerts = 0; try {{ $d = $w.Documents.Open('{}', $false, $true); $d.SaveAs2('{}', 16); $d.Close($false) }} finally {{ $w.Quit() }}",
        src.display().to_string().replace('/', "\\").replace('\'', "''"),
        dst.display().to_string().replace('/', "\\").replace('\'', "''")
    );
    let mut c = Command::new("powershell");
    c.args(["-NoProfile", "-NonInteractive", "-Command", &ps]).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped());
    crate::tikz::hide_console(&mut c);
    let mut child = c.spawn().map_err(|e| format!("Không chạy được PowerShell: {e}"))?;
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if start.elapsed() > Duration::from_secs(120) => {
                let _ = child.kill();
                return Err("Word chạy quá lâu khi đổi .doc sang .docx.".into());
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(100)),
            Err(e) => return Err(e.to_string()),
        }
    }
    if dst.is_file() {
        return Ok(());
    }
    let mut err = String::new();
    if let Some(mut e) = child.stderr.take() {
        let _ = e.read_to_string(&mut err);
    }
    let why: String = err.lines().filter(|l| !l.trim().is_empty()).take(2).collect::<Vec<_>>().join(" ");
    Err(format!("Không đổi được .doc sang .docx (cần cài Microsoft Word). Hãy mở tệp trong Word, lưu thành .docx rồi nhập lại. {why}"))
}

pub fn import_docx(root: &Path, src: &Path, fmt: &str) -> Result<ImportOut, String> {
    let pandoc = pandoc_path(root).ok_or("Chưa có Pandoc: giải nén vào D:\\HEdu-tools\\pandoc rồi thử lại.")?;
    let work = root.join(format!("tmp-wordin-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)));
    fs::create_dir_all(&work).map_err(|e| format!("Không tạo được thư mục tạm: {e}"))?;
    let r = run(&pandoc, src, &work, fmt);
    if r.is_err() {
        let _ = fs::remove_dir_all(&work);
    }
    r
}

fn run(pandoc: &Path, src: &Path, work: &Path, fmt: &str) -> Result<ImportOut, String> {
    let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    let docx: PathBuf = match ext.as_str() {
        "docx" => src.to_path_buf(),
        "doc" => {
            let d = work.join("from-doc.docx");
            doc_to_docx(src, &d)?;
            d
        }
        _ => return Err("Chỉ nhập được tệp .docx hoặc .doc.".into()),
    };
    let bytes = fs::read(&docx).map_err(|e| format!("Không đọc được tệp: {e}"))?;
    let mut zin = zip::ZipArchive::new(Cursor::new(&bytes)).map_err(|e| format!("Không mở được tệp Word: {e}"))?;
    let read = |z: &mut zip::ZipArchive<Cursor<&Vec<u8>>>, name: &str| -> Option<Vec<u8>> {
        let mut f = z.by_name(name).ok()?;
        let mut v = Vec::new();
        f.read_to_end(&mut v).ok()?;
        Some(v)
    };
    let doc = String::from_utf8(read(&mut zin, "word/document.xml").ok_or("Tệp Word không có nội dung (document.xml).")?).map_err(|_| "Nội dung Word không phải UTF-8.")?;
    let rels = rels_map(&String::from_utf8_lossy(&read(&mut zin, "word/_rels/document.xml.rels").unwrap_or_default()));
    let (tok_doc, ids) = tokenize(&doc);

    let mut latex_of: Vec<Option<String>> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();
    let mut failed = 0usize;
    for (n, rid) in ids.iter().enumerate() {
        let res = rels.get(rid).and_then(|t| read(&mut zin, &format!("word/{t}"))).ok_or_else(|| "không thấy dữ liệu công thức".to_string()).and_then(|ole| crate::mtef::equation_native(&ole)).and_then(|eq| crate::mtef::to_latex(&eq));
        match res {
            Ok((tex, w)) => {
                for x in w { let m = format!("Công thức {}: {x}", n + 1); if !warnings.contains(&m) { warnings.push(m); } }
                latex_of.push(Some(tex));
            }
            Err(e) => {
                failed += 1;
                warnings.push(format!("Công thức {} không đọc được: {e}", n + 1));
                latex_of.push(None);
            }
        }
    }

    // ghi tệp docx đã thay công thức bằng dấu hiệu (nén kiểu lưu trữ, Pandoc đọc được)
    let modp = work.join("mod.docx");
    {
        let mut zout = zip::ZipWriter::new(fs::File::create(&modp).map_err(|e| e.to_string())?);
        let opt = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        for i in 0..zin.len() {
            let mut f = zin.by_index(i).map_err(|e| e.to_string())?;
            if f.is_dir() { continue; }
            let name = f.name().to_string();
            let mut data = Vec::new();
            f.read_to_end(&mut data).map_err(|e| e.to_string())?;
            zout.start_file(name.clone(), opt).map_err(|e| e.to_string())?;
            if name == "word/document.xml" { zout.write_all(tok_doc.as_bytes()).map_err(|e| e.to_string())?; } else { zout.write_all(&data).map_err(|e| e.to_string())?; }
        }
        zout.finish().map_err(|e| e.to_string())?;
    }

    let mut c = Command::new(pandoc);
    c.current_dir(work).args(["-f", "docx", "-t", fmt, "--wrap=none", "--extract-media=media", "mod.docx", "-o", "out.tex"]).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped());
    crate::tikz::hide_console(&mut c);
    let mut child = c.spawn().map_err(|e| format!("Không chạy được Pandoc: {e}"))?;
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if start.elapsed() > Duration::from_secs(180) => { let _ = child.kill(); return Err("Pandoc chạy quá lâu, đã dừng.".into()); }
            Ok(None) => std::thread::sleep(Duration::from_millis(60)),
            Err(e) => return Err(e.to_string()),
        }
    }
    let mut err = String::new();
    if let Some(mut e) = child.stderr.take() { let _ = e.read_to_string(&mut err); }
    let mut tex = fs::read_to_string(work.join("out.tex")).map_err(|_| format!("Pandoc không đọc được tệp Word. {}", err.lines().take(3).collect::<Vec<_>>().join(" ")))?;

    // đưa công thức vào; chèn khoảng trắng khi dấu hiệu dính liền chữ ("vectơ$…$" → "vectơ $…$")
    for (n, l) in latex_of.iter().enumerate().filter(|_| fmt == "latex") {
        let tok = format!("{TOKEN_OPEN}{n}{TOKEN_CLOSE}");
        let rep = match l { Some(t) if !t.is_empty() => format!("${t}$"), Some(_) => String::new(), None => "[CÔNG THỨC LỖI]".to_string() };
        let mut out = String::with_capacity(tex.len());
        let mut rest = tex.as_str();
        while let Some(i) = rest.find(&tok) {
            let before = &rest[..i];
            let after = &rest[i + tok.len()..];
            out.push_str(before);
            let prev = out.chars().last();
            if prev.map(|c| c.is_alphanumeric()).unwrap_or(false) { out.push(' '); }
            out.push_str(&rep);
            if after.chars().next().map(|c| c.is_alphanumeric()).unwrap_or(false) { out.push(' '); }
            rest = after;
        }
        out.push_str(rest);
        tex = out;
    }
    let mut images = Vec::new();
    let md = work.join("media");
    fn walk(d: &Path, out: &mut Vec<String>) {
        if let Ok(rd) = fs::read_dir(d) {
            for e in rd.flatten() {
                let p = e.path();
                if p.is_dir() { walk(&p, out); } else { out.push(p.to_string_lossy().into_owned()); }
            }
        }
    }
    walk(&md, &mut images);
    let n_eq = ids.len();
    Ok(ImportOut { latex: tex, equations: n_eq, failed, images, warnings, media_dir: if md.is_dir() { md.to_string_lossy().into_owned() } else { String::new() } })
}

fn root_of(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn word_import(app: AppHandle, path: String) -> Result<ImportOut, String> {
    let root = root_of(&app)?;
    tauri::async_runtime::spawn_blocking(move || import_docx(&root, Path::new(&path), "latex")).await.map_err(|e| e.to_string())?
}

/// Như word_import nhưng trả cây Pandoc (JSON) để đọc bảng đáp án: `latex` chứa chuỗi JSON.
#[tauri::command]
pub async fn word_import_json(app: AppHandle, path: String) -> Result<ImportOut, String> {
    let root = root_of(&app)?;
    tauri::async_runtime::spawn_blocking(move || import_docx(&root, Path::new(&path), "json")).await.map_err(|e| e.to_string())?
}

/// Xoá thư mục tạm của lần nhập (gọi sau khi đã dùng xong ảnh).
#[tauri::command]
pub async fn word_import_cleanup(app: AppHandle, media_dir: String) -> Result<(), String> {
    let root = root_of(&app)?;
    let p = PathBuf::from(&media_dir);
    if let Some(parent) = p.parent() {
        if parent.starts_with(&root) && parent.file_name().map(|n| n.to_string_lossy().starts_with("tmp-wordin-")).unwrap_or(false) {
            let _ = fs::remove_dir_all(parent);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thay_doi_tuong_cong_thuc_bang_dau_hieu() {
        let doc = "<w:p><w:r><w:t>Cho </w:t></w:r><w:r><w:object w:dxaOrig=\"1\"><v:shape><v:imagedata r:id=\"rId6\"/></v:shape><o:OLEObject Type=\"Embed\" ProgID=\"Equation.DSMT4\" ShapeID=\"x\" r:id=\"rId7\"/></w:object></w:r><w:r><w:t> và</w:t></w:r></w:p>";
        let (t, ids) = tokenize(doc);
        assert_eq!(ids, vec!["rId7".to_string()]);
        assert!(t.contains("@@MT0@@") && !t.contains("OLEObject") && t.contains("<w:t> và</w:t>"), "{t}");
    }

    #[test]
    fn doi_tuong_khong_phai_cong_thuc_duoc_giu() {
        let doc = "<w:r><w:object><o:OLEObject Type=\"Embed\" ProgID=\"Excel.Sheet.12\" r:id=\"rId9\"/></w:object></w:r>";
        let (t, ids) = tokenize(doc);
        assert!(ids.is_empty()); assert_eq!(t, doc);
    }

    #[test]
    fn doc_lien_ket_quan_he() {
        let m = rels_map("<Relationships><Relationship Id=\"rId7\" Type=\"x\" Target=\"embeddings/oleObject1.bin\"/><Relationship Target=\"a.png\" Id=\"rId8\"/></Relationships>");
        assert_eq!(m.get("rId7").map(String::as_str), Some("embeddings/oleObject1.bin"));
        assert_eq!(m.get("rId8").map(String::as_str), Some("a.png"));
    }
}
