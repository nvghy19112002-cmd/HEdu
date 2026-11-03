//! Xuất Excel có định dạng (ma trận đề, danh mục xuất trọn gói) và các lệnh phụ của "Xuất trọn gói".
//! Mô hình bảng do giao diện dựng (hàm thuần, có kiểm thử); đây chỉ ghi ra .xlsx bằng gói `zip` sẵn có (không thêm phụ thuộc).
//! Không bao giờ ghi đè tệp có sẵn: trùng tên thì thêm hậu tố -2, -3…

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use crate::examlib::{projects_dir, sha256_file};

/// Kiểu ô (chỉ số trong `cellXfs` của styles.xml dưới đây).
/// 0 thường · 1 tiêu đề lớn · 2 chữ đậm · 3 đầu bảng (nền xanh, viền, giữa) · 4 thân bảng giữa (viền) · 5 thân bảng trái (viền) · 6 dòng cộng (nền xám, đậm, viền, giữa) · 7 dòng cộng trái
const MAX_STYLE: u8 = 7;

#[derive(Deserialize, Debug, Clone, Default)]
pub struct CellIn {
    /// chữ (giữ nguyên "0,5", "ĐSĐS", số 0 đầu)
    #[serde(default)]
    pub v: Option<String>,
    /// số thật (để Excel cộng/sắp xếp được)
    #[serde(default)]
    pub n: Option<f64>,
    #[serde(default)]
    pub s: u8,
}

#[derive(Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct SheetIn {
    pub name: String,
    pub rows: Vec<Vec<CellIn>>,
    /// ô gộp [hàng đầu, cột đầu, hàng cuối, cột cuối], tính từ 0
    #[serde(default)]
    pub merges: Vec<[usize; 4]>,
    /// độ rộng cột (ký tự)
    #[serde(default)]
    pub widths: Vec<f64>,
    /// cố định [số hàng, số cột] ở đầu bảng
    #[serde(default)]
    pub freeze: Option<[usize; 2]>,
    #[serde(default)]
    pub landscape: bool,
}

#[derive(Deserialize, Debug, Clone, Default)]
pub struct Book {
    pub sheets: Vec<SheetIn>,
}

fn esc(s: &str) -> String {
    s.chars()
        .filter(|c| !matches!(*c as u32, 0..=8 | 11 | 12 | 14..=31))
        .map(|c| match c {
            '&' => "&amp;".to_string(),
            '<' => "&lt;".to_string(),
            '>' => "&gt;".to_string(),
            '"' => "&quot;".to_string(),
            c => c.to_string(),
        })
        .collect()
}

fn col(mut i: usize) -> String {
    let mut s = Vec::new();
    loop {
        s.push(b'A' + (i % 26) as u8);
        if i < 26 {
            break;
        }
        i = i / 26 - 1;
    }
    s.reverse();
    String::from_utf8(s).unwrap_or_default()
}

/// Tên trang hợp lệ của Excel (≤31 ký tự, không có []:*?/\), không trùng tên đã dùng.
fn sheet_name(raw: &str, used: &[String]) -> String {
    let base: String = raw.chars().map(|c| if "[]:*?/\\".contains(c) || c.is_control() { ' ' } else { c }).collect::<String>().trim().chars().take(31).collect();
    let base = if base.is_empty() { "Trang".to_string() } else { base };
    let mut name = base.clone();
    let mut n = 2;
    while used.iter().any(|u| u.to_lowercase() == name.to_lowercase()) {
        let suf = format!(" ({n})");
        name = format!("{}{}", base.chars().take(31 - suf.chars().count()).collect::<String>(), suf);
        n += 1;
    }
    name
}

fn sheet_xml(s: &SheetIn) -> String {
    let mut x = String::from(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">"#);
    if s.landscape {
        x.push_str(r#"<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>"#);
    }
    x.push_str("<sheetViews><sheetView workbookViewId=\"0\">");
    if let Some([r, c]) = s.freeze {
        if r > 0 || c > 0 {
            let tl = format!("{}{}", col(c), r + 1);
            let pane = match (r > 0, c > 0) {
                (true, true) => "bottomRight",
                (true, false) => "bottomLeft",
                _ => "topRight",
            };
            x.push_str(&format!(r#"<pane{}{} topLeftCell="{tl}" activePane="{pane}" state="frozen"/>"#, if c > 0 { format!(r#" xSplit="{c}""#) } else { String::new() }, if r > 0 { format!(r#" ySplit="{r}""#) } else { String::new() }));
        }
    }
    x.push_str("</sheetView></sheetViews>");
    if !s.widths.is_empty() {
        x.push_str("<cols>");
        for (i, w) in s.widths.iter().enumerate() {
            x.push_str(&format!(r#"<col min="{0}" max="{0}" width="{1}" customWidth="1"/>"#, i + 1, w.clamp(2.0, 120.0)));
        }
        x.push_str("</cols>");
    }
    x.push_str("<sheetData>");
    for (r, row) in s.rows.iter().enumerate() {
        x.push_str(&format!(r#"<row r="{}">"#, r + 1));
        for (c, cell) in row.iter().enumerate() {
            let st = cell.s.min(MAX_STYLE);
            let sa = if st > 0 { format!(r#" s="{st}""#) } else { String::new() };
            let r1 = format!("{}{}", col(c), r + 1);
            match (&cell.n, &cell.v) {
                (Some(n), _) if n.is_finite() => x.push_str(&format!(r#"<c r="{r1}"{sa}><v>{n}</v></c>"#)),
                (_, Some(v)) if !v.is_empty() => x.push_str(&format!(r#"<c r="{r1}"{sa} t="inlineStr"><is><t xml:space="preserve">{}</t></is></c>"#, esc(v))),
                _ => x.push_str(&format!(r#"<c r="{r1}"{sa}/>"#)),
            }
        }
        x.push_str("</row>");
    }
    x.push_str("</sheetData>");
    let merges: Vec<&[usize; 4]> = s.merges.iter().filter(|m| m[0] <= m[2] && m[1] <= m[3] && (m[0], m[1]) != (m[2], m[3])).collect();
    if !merges.is_empty() {
        x.push_str(&format!(r#"<mergeCells count="{}">"#, merges.len()));
        for m in merges {
            x.push_str(&format!(r#"<mergeCell ref="{}{}:{}{}"/>"#, col(m[1]), m[0] + 1, col(m[3]), m[2] + 1));
        }
        x.push_str("</mergeCells>");
    }
    x.push_str(r#"<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>"#);
    if s.landscape {
        x.push_str(r#"<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>"#);
    }
    x.push_str("</worksheet>");
    x
}

const STYLES: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F5"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF999999"/></left><right style="thin"><color rgb="FF999999"/></right><top style="thin"><color rgb="FF999999"/></top><bottom style="thin"><color rgb="FF999999"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf></cellXfs></styleSheet>"#;

/// Dựng tệp .xlsx (byte) từ mô hình bảng.
pub fn book_xlsx(book: &Book) -> Result<Vec<u8>, String> {
    if book.sheets.is_empty() {
        return Err("Không có trang nào để xuất.".into());
    }
    if book.sheets.len() > 20 {
        return Err("Tối đa 20 trang trong một tệp Excel.".into());
    }
    let mut names: Vec<String> = Vec::new();
    for s in &book.sheets {
        let n = sheet_name(&s.name, &names);
        names.push(n);
    }
    let mut ct = String::from(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>"#);
    let mut wb = String::from(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>"#);
    let mut rels = String::from(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">"#);
    for (i, n) in names.iter().enumerate() {
        ct.push_str(&format!(r#"<Override PartName="/xl/worksheets/sheet{0}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>"#, i + 1));
        wb.push_str(&format!(r#"<sheet name="{}" sheetId="{1}" r:id="rId{1}"/>"#, esc(n), i + 1));
        rels.push_str(&format!(r#"<Relationship Id="rId{0}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{0}.xml"/>"#, i + 1));
    }
    ct.push_str("</Types>");
    wb.push_str("</sheets></workbook>");
    rels.push_str(&format!(r#"<Relationship Id="rId{}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>"#, names.len() + 1));
    let root_rels = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>"#;

    let mut z = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let o = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    let mut put = |name: &str, body: &str| -> Result<(), String> {
        z.start_file(name, o).map_err(|e| format!("Không dựng được tệp Excel: {e}"))?;
        z.write_all(body.as_bytes()).map_err(|e| format!("Không dựng được tệp Excel: {e}"))
    };
    put("[Content_Types].xml", &ct)?;
    put("_rels/.rels", root_rels)?;
    put("xl/workbook.xml", &wb)?;
    put("xl/_rels/workbook.xml.rels", &rels)?;
    put("xl/styles.xml", STYLES)?;
    for (i, s) in book.sheets.iter().enumerate() {
        put(&format!("xl/worksheets/sheet{}.xml", i + 1), &sheet_xml(s))?;
    }
    Ok(z.finish().map_err(|e| format!("Không dựng được tệp Excel: {e}"))?.into_inner())
}

fn plain_dir(p: &Path) -> Result<(), String> {
    let md = fs::symlink_metadata(p).map_err(|e| format!("Thư mục đích không dùng được: {e}"))?;
    if !md.is_dir() || md.file_type().is_symlink() {
        return Err("Thư mục đích không phải thư mục thường.".into());
    }
    Ok(())
}

/// Tên tệp/thư mục an toàn cho Windows (bỏ ký tự cấm, tên thiết bị, dấu chấm/khoảng trắng cuối).
pub fn safe_name(raw: &str, fallback: &str) -> String {
    let s: String = raw.chars().map(|c| if "<>:\"/\\|?*".contains(c) || c.is_control() { '-' } else { c }).collect();
    let s = s.split_whitespace().collect::<Vec<_>>().join(" ");
    let s: String = s.trim().trim_end_matches(['.', ' ']).chars().take(80).collect();
    let stem = s.split('.').next().unwrap_or("").to_lowercase();
    let dev = matches!(stem.as_str(), "con" | "prn" | "aux" | "nul") || (stem.len() == 4 && (stem.starts_with("com") || stem.starts_with("lpt")) && stem.as_bytes()[3].is_ascii_digit() && stem.as_bytes()[3] != b'0');
    if s.is_empty() { fallback.to_string() } else if dev { format!("{s}-de") } else { s }
}

/// Ghi mô hình bảng ra `dest` (.xlsx). Không ghi đè: trùng tên thì thêm -2, -3… Trả về đường dẫn thật.
pub fn save_book(dest: &Path, book: &Book) -> Result<String, String> {
    let bytes = book_xlsx(book)?;
    let dir = dest.parent().ok_or("Đường dẫn tệp Excel không hợp lệ.")?;
    plain_dir(dir)?;
    let stem = dest.file_stem().map(|s| safe_name(&s.to_string_lossy(), "bang")).unwrap_or_else(|| "bang".into());
    for n in 1..1000 {
        let name = if n == 1 { format!("{stem}.xlsx") } else { format!("{stem}-{n}.xlsx") };
        let p = dir.join(&name);
        match fs::OpenOptions::new().write(true).create_new(true).open(&p) {
            Ok(mut f) => {
                if let Err(e) = f.write_all(&bytes).and_then(|_| f.sync_all()) {
                    drop(f);
                    let _ = fs::remove_file(&p);
                    return Err(format!("Không ghi được tệp Excel: {e}"));
                }
                return Ok(p.to_string_lossy().into_owned());
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("Không tạo được tệp Excel: {e}")),
        }
    }
    Err("Thư mục đích đã có quá nhiều tệp cùng tên.".into())
}

/// Tạo thư mục con mới trong `parent` (tên đã được làm sạch); trùng tên thì thêm -2, -3… Trả về đường dẫn.
pub fn make_dir(parent: &Path, name: &str) -> Result<String, String> {
    plain_dir(parent)?;
    let base = safe_name(name, "xuat");
    for n in 1..1000 {
        let p = parent.join(if n == 1 { base.clone() } else { format!("{base}-{n}") });
        match fs::create_dir(&p) {
            Ok(()) => return Ok(p.to_string_lossy().into_owned()),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("Không tạo được thư mục: {e}")),
        }
    }
    Err("Thư mục đích đã có quá nhiều thư mục cùng tên.".into())
}

#[derive(Serialize, Debug, PartialEq)]
pub struct FileInfo {
    pub bytes: u64,
    /// 8 ký tự đầu của SHA-256
    pub sha: String,
}

pub fn file_info(p: &Path) -> Result<FileInfo, String> {
    let md = fs::symlink_metadata(p).map_err(|e| format!("Không đọc được tệp: {e}"))?;
    if !md.is_file() {
        return Err("Không phải tệp thường.".into());
    }
    let h = sha256_file(p).map_err(|e| format!("Không tính được SHA-256: {e}"))?;
    Ok(FileInfo { bytes: md.len(), sha: h.chars().take(8).collect() })
}

fn lib_of(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("exam-library"))
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn xlsx_save(dest: String, book: Book) -> Result<String, String> {
    blocking(move || save_book(Path::new(&dest), &book)).await
}

#[tauri::command]
pub async fn pack_make_dir(parent: String, name: String) -> Result<String, String> {
    blocking(move || make_dir(Path::new(&parent), &name)).await
}

#[tauri::command]
pub async fn pack_file_info(path: String) -> Result<FileInfo, String> {
    blocking(move || file_info(Path::new(&path))).await
}

/// Nội dung `hedu-de.json` của đề (None nếu đề không tạo từ ngân hàng).
#[tauri::command]
pub async fn exam_spec_text(app: AppHandle, id: String) -> Result<Option<String>, String> {
    let lib = lib_of(&app)?;
    blocking(move || {
        if !crate::examlib::valid_id(&id) {
            return Err("Mã dự án không hợp lệ.".into());
        }
        if !projects_dir(&lib).join(&id).join("hedu-de.json").is_file() {
            return Ok(None);
        }
        crate::examexport::read_project_text(&lib, &id, "hedu-de.json", 8 * 1024 * 1024).map(Some)
    })
    .await
}

// ---------- thư mục riêng còn trống (lưu cùng dữ liệu thư viện đề, không phụ thuộc trình duyệt) ----------
const FOLDERS_FILE: &str = "folders.json";
const MAX_FOLDERS: usize = 500;

/// Giữ lại các đường dẫn thư mục hợp lệ (không rỗng, <400 ký tự, không ký tự điều khiển, không '/' đầu/cuối, tối đa 5 cấp), bỏ trùng, tối đa 500.
pub fn clean_folders(x: Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for f in x {
        let ok = !f.is_empty() && f.chars().count() < 400 && !f.chars().any(|c| c.is_control()) && !f.starts_with('/') && !f.ends_with('/') && !f.contains("//") && f.split('/').count() <= 5;
        if ok && !out.contains(&f) {
            out.push(f);
        }
        if out.len() >= MAX_FOLDERS {
            break;
        }
    }
    out
}

pub fn load_folders(lib: &Path) -> Vec<String> {
    match fs::read(lib.join(FOLDERS_FILE)).ok().and_then(|b| serde_json::from_slice::<Vec<String>>(&b).ok()) {
        Some(v) => clean_folders(v),
        None => Vec::new(),
    }
}

pub fn save_folders(lib: &Path, x: Vec<String>) -> Result<(), String> {
    fs::create_dir_all(lib).map_err(|e| format!("Không tạo được thư mục dữ liệu: {e}"))?;
    let json = serde_json::to_vec(&clean_folders(x)).map_err(|e| e.to_string())?;
    crate::examlib::atomic_write(&lib.join(FOLDERS_FILE), &json).map_err(|e| format!("Không ghi được danh sách thư mục: {e}"))
}

#[tauri::command]
pub async fn exam_folders_load(app: AppHandle) -> Result<Vec<String>, String> {
    let lib = lib_of(&app)?;
    blocking(move || Ok(load_folders(&lib))).await
}

#[tauri::command]
pub async fn exam_folders_save(app: AppHandle, folders: Vec<String>) -> Result<(), String> {
    let lib = lib_of(&app)?;
    blocking(move || save_folders(&lib, folders)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    fn tmp(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("hedu-pk-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
    fn demo() -> Book {
        Book {
            sheets: vec![SheetIn {
                name: "Ma trận: đề/1".into(),
                rows: vec![
                    vec![CellIn { v: Some("Tiêu đề <&>".into()), s: 1, ..Default::default() }],
                    vec![CellIn { v: Some("ĐSĐS".into()), s: 3, ..Default::default() }, CellIn { n: Some(2.5), s: 4, ..Default::default() }, CellIn { s: 4, ..Default::default() }],
                ],
                merges: vec![[0, 0, 0, 2], [1, 1, 1, 1], [5, 5, 1, 1]],
                widths: vec![10.0, 20.0],
                freeze: Some([2, 1]),
                landscape: true,
            }],
        }
    }

    #[test]
    fn xlsx_mo_lai_duoc_va_dung_noi_dung() {
        let bytes = book_xlsx(&demo()).unwrap();
        let mut z = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        for n in ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"] {
            assert!(z.by_name(n).is_ok(), "thiếu {n}");
        }
        let mut s = String::new();
        z.by_name("xl/worksheets/sheet1.xml").unwrap().read_to_string(&mut s).unwrap();
        assert!(s.contains("Tiêu đề &lt;&amp;&gt;") && s.contains("ĐSĐS") && s.contains(r#"<c r="B2" s="4"><v>2.5</v></c>"#) && s.contains(r#"<c r="C2" s="4"/>"#));
        assert!(s.contains(r#"<mergeCell ref="A1:C1"/>"#) && s.contains(r#"mergeCells count="1""#), "bỏ ô gộp 1 ô và ô gộp ngược");
        assert!(s.contains(r#"xSplit="1" ySplit="2" topLeftCell="B3" activePane="bottomRight""#) && s.contains(r#"orientation="landscape""#));
        let mut w = String::new();
        z.by_name("xl/workbook.xml").unwrap().read_to_string(&mut w).unwrap();
        assert!(w.contains(r#"name="Ma trận  đề 1""#), "{w}");
        let mut st = String::new();
        z.by_name("xl/styles.xml").unwrap().read_to_string(&mut st).unwrap();
        assert_eq!(st.matches("<xf numFmtId").count(), 8 + 1, "7+1 kiểu ô và 1 kiểu gốc");
    }

    #[test]
    fn ten_trang_khong_trung_va_toi_da_31_ky_tu() {
        let b = Book { sheets: ["Danh mục", "danh mục", &"x".repeat(40)].iter().map(|n| SheetIn { name: n.to_string(), ..Default::default() }).collect() };
        let bytes = book_xlsx(&b).unwrap();
        let mut z = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut w = String::new();
        z.by_name("xl/workbook.xml").unwrap().read_to_string(&mut w).unwrap();
        assert!(w.contains(r#"name="Danh mục""#) && w.contains(r#"name="danh mục (2)""#) && w.contains(&format!(r#"name="{}""#, "x".repeat(31))));
        assert!(book_xlsx(&Book::default()).is_err());
    }

    #[test]
    fn luu_khong_ghi_de_va_tao_thu_muc_khong_trung() {
        let d = tmp("save");
        let a = save_book(&d.join("Ma-tran.xlsx"), &demo()).unwrap();
        let b = save_book(&d.join("Ma-tran.xlsx"), &demo()).unwrap();
        assert!(a.ends_with("Ma-tran.xlsx") && b.ends_with("Ma-tran-2.xlsx"));
        assert!(save_book(&d.join("khong-co/x.xlsx"), &demo()).is_err());
        let m1 = make_dir(&d, "01 Đề: GK1/12").unwrap();
        let m2 = make_dir(&d, "01 Đề: GK1/12").unwrap();
        assert!(m1.ends_with("01 Đề- GK1-12") && m2.ends_with("01 Đề- GK1-12-2"), "{m1} {m2}");
        assert!(Path::new(&m1).is_dir());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn thu_muc_trong_luu_va_doc_lai_va_loc_gia_tri_xau() {
        let d = tmp("folders");
        assert!(load_folders(&d).is_empty(), "chưa có tệp: rỗng");
        save_folders(&d, vec!["A".into(), "A/B".into(), "A".into(), "/x".into(), "y/".into(), "a//b".into(), "".into(), "a/b/c/d/e/f".into(), "t\u{7}".into()]).unwrap();
        assert_eq!(load_folders(&d), vec!["A".to_string(), "A/B".to_string()]);
        fs::write(d.join("folders.json"), b"{hong").unwrap();
        assert!(load_folders(&d).is_empty(), "tệp hỏng: rỗng, không báo lỗi");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn ten_an_toan_va_thong_tin_tep() {
        assert_eq!(safe_name("CON", "x"), "CON-de");
        assert_eq!(safe_name("  a  b. ", "x"), "a b");
        assert_eq!(safe_name("???", "x"), "---");
        assert_eq!(safe_name("", "x"), "x");
        let d = tmp("info");
        fs::write(d.join("a.txt"), b"abc").unwrap();
        let i = file_info(&d.join("a.txt")).unwrap();
        assert_eq!((i.bytes, i.sha.as_str()), (3, "ba7816bf"));
        assert!(file_info(&d).is_err());
        let _ = fs::remove_dir_all(&d);
    }
}
