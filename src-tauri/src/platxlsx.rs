//! Excel đáp án theo bố cục của các nền tảng thi trực tuyến (TNMaker, SmartTest, AZOTA, OLM, YoungMix).
//! Bố cục lấy từ các tệp mẫu mà nền tảng/phần mềm khác đã xuất ra (chỉ quan sát cấu trúc ô để tương thích), HEdu tự viết bộ ghi .xlsx.
//! Chỉ đọc đáp án từ `hedu-de.json` đã đối chiếu (CodeSpec); không đoán: đáp án không đúng dạng thì từ chối, không ghi tệp lệch cột.
use std::collections::HashMap;
use std::io::{Cursor, Write};

use crate::examexport::CodeSpec;
use crate::examxlsx::col;

pub const PLATFORMS: [&str; 5] = ["tnmaker", "smarttest", "azota", "olm", "youngmix"];

/// Tên hiển thị của nền tảng.
pub fn label(p: &str) -> &'static str {
    match p {
        "tnmaker" => "TNMaker",
        "smarttest" => "SmartTest",
        "azota" => "AZOTA",
        "olm" => "OLM",
        "youngmix" => "YoungMix",
        _ => "",
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum Cell {
    /// chữ (giữ nguyên "0,5", "ĐSĐS", số 0 đầu)
    S(String),
    /// số (viết đúng như đưa vào: "1", "0.25")
    N(String),
}

#[derive(Clone, Debug, Default)]
pub struct Sheet {
    pub name: String,
    /// mỗi dòng là danh sách (chỉ số cột từ 0, ô); ô trống không ghi
    pub rows: Vec<Vec<(usize, Cell)>>,
    pub merges: Vec<String>,
    /// đóng băng cột đầu (OLM)
    pub freeze_first_col: bool,
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

/// Tệp .xlsx (byte) từ các trang. Chữ nằm trong bảng chuỗi dùng chung như Excel.
pub fn build(sheets: &[Sheet]) -> Result<Vec<u8>, String> {
    if sheets.is_empty() {
        return Err("Không có trang nào để ghi.".into());
    }
    let mut strings: Vec<String> = Vec::new();
    let mut index: HashMap<String, usize> = HashMap::new();
    let mut sheet_xml: Vec<String> = Vec::new();
    for sh in sheets {
        let mut x = String::from(r#"<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">"#);
        if sh.freeze_first_col {
            x.push_str(r#"<sheetViews><sheetView workbookViewId="0"><pane xSplit="1" ySplit="0" topLeftCell="B1" activePane="topRight" state="frozen"/><selection pane="topRight"/></sheetView></sheetViews>"#);
        }
        x.push_str("<sheetData>");
        for (r, row) in sh.rows.iter().enumerate() {
            if row.is_empty() {
                continue;
            }
            x.push_str(&format!(r#"<row r="{}">"#, r + 1));
            let mut cells = row.clone();
            cells.sort_by_key(|(c, _)| *c);
            for (c, v) in cells {
                let at = format!("{}{}", col(c), r + 1);
                match v {
                    Cell::N(n) => x.push_str(&format!(r#"<c r="{at}" t="n"><v>{}</v></c>"#, esc(&n))),
                    Cell::S(s) => {
                        let i = *index.entry(s.clone()).or_insert_with(|| {
                            strings.push(s.clone());
                            strings.len() - 1
                        });
                        x.push_str(&format!(r#"<c r="{at}" t="s"><v>{i}</v></c>"#));
                    }
                }
            }
            x.push_str("</row>");
        }
        x.push_str("</sheetData>");
        if !sh.merges.is_empty() {
            x.push_str(&format!(r#"<mergeCells count="{}">"#, sh.merges.len()));
            for m in &sh.merges {
                x.push_str(&format!(r#"<mergeCell ref="{m}"/>"#));
            }
            x.push_str("</mergeCells>");
        }
        x.push_str("</worksheet>");
        sheet_xml.push(x);
    }
    let sst = {
        let mut s = format!(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="{0}" uniqueCount="{0}">"#, strings.len());
        for t in &strings {
            s.push_str(&format!(r#"<si><t xml:space="preserve">{}</t></si>"#, esc(t)));
        }
        s.push_str("</sst>");
        s
    };
    let mut content_types = String::from(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>"#);
    let mut wb = String::from(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>"#);
    let mut rels = String::from(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">"#);
    for (i, sh) in sheets.iter().enumerate() {
        let n = i + 1;
        content_types.push_str(&format!(r#"<Override PartName="/xl/worksheets/sheet{n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>"#));
        wb.push_str(&format!(r#"<sheet name="{}" sheetId="{n}" r:id="rId{n}"/>"#, esc(&sh.name)));
        rels.push_str(&format!(r#"<Relationship Id="rId{n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{n}.xml"/>"#));
    }
    let sst_id = sheets.len() + 1;
    content_types.push_str(r#"<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>"#);
    wb.push_str("</sheets></workbook>");
    rels.push_str(&format!(r#"<Relationship Id="rId{sst_id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>"#));
    let root_rels = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>"#;

    let mut z = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let o = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    let mut files: Vec<(String, String)> = vec![
        ("[Content_Types].xml".into(), content_types),
        ("_rels/.rels".into(), root_rels.into()),
        ("xl/workbook.xml".into(), wb),
        ("xl/_rels/workbook.xml.rels".into(), rels),
        ("xl/sharedStrings.xml".into(), sst),
    ];
    for (i, x) in sheet_xml.into_iter().enumerate() {
        files.push((format!("xl/worksheets/sheet{}.xml", i + 1), x));
    }
    for (name, body) in &files {
        z.start_file(name.as_str(), o).map_err(|e| format!("Không dựng được tệp Excel: {e}"))?;
        z.write_all(body.as_bytes()).map_err(|e| format!("Không dựng được tệp Excel: {e}"))?;
    }
    Ok(z.finish().map_err(|e| format!("Không dựng được tệp Excel: {e}"))?.into_inner())
}

fn s(x: &str) -> Cell {
    Cell::S(x.to_string())
}
fn n(x: usize) -> Cell {
    Cell::N(x.to_string())
}

/// Số câu từng phần (I, II, III); các mã phải cùng cấu trúc và đáp án đúng dạng.
fn shape(codes: &[&CodeSpec]) -> Result<[usize; 3], String> {
    let first = codes.first().ok_or("Không có mã đề nào để xuất đáp án.")?;
    let sh = [first.parts[0].len(), first.parts[1].len(), first.parts[2].len()];
    for c in codes {
        if [c.parts[0].len(), c.parts[1].len(), c.parts[2].len()] != sh {
            return Err("Các mã đề không cùng số câu từng phần nên không gộp chung một bảng đáp án được.".into());
        }
        for (_, k) in &c.parts[0] {
            if !matches!(k.as_str(), "A" | "B" | "C" | "D") {
                return Err(format!("Mã {}: đáp án Phần I «{k}» không phải A, B, C hay D.", c.code));
            }
        }
        for (_, k) in &c.parts[1] {
            if k.chars().count() != 4 || !k.chars().all(|ch| ch == 'Đ' || ch == 'S') {
                return Err(format!("Mã {}: đáp án Phần II «{k}» không phải 4 ý Đ/S.", c.code));
            }
        }
        for (_, k) in &c.parts[2] {
            if k.trim().is_empty() || k == "?" {
                return Err(format!("Mã {}: có câu Phần III chưa có đáp số.", c.code));
            }
        }
    }
    Ok(sh)
}

/// Đáp án theo số thứ tự câu liên tục (Phần I, rồi II, rồi III) của một mã.
fn flat(c: &CodeSpec) -> Vec<String> {
    c.parts[..3].iter().flatten().map(|(_, k)| k.clone()).collect()
}

/// TNMaker / SmartTest: một trang "Dữ liệu"; hàng đầu là chữ tiêu đề rồi các mã đề; mỗi hàng sau là một câu (số) và đáp án của từng mã.
fn list_sheet(head: &str, codes: &[&CodeSpec], total: usize) -> Sheet {
    let mut rows: Vec<Vec<(usize, Cell)>> = Vec::new();
    let mut h = vec![(0, s(head))];
    h.extend(codes.iter().enumerate().map(|(i, c)| (i + 1, s(&c.code))));
    rows.push(h);
    let keys: Vec<Vec<String>> = codes.iter().map(|c| flat(c)).collect();
    for q in 0..total {
        let mut r = vec![(0, n(q + 1))];
        r.extend(keys.iter().enumerate().map(|(i, k)| (i + 1, Cell::S(k[q].clone()))));
        rows.push(r);
    }
    Sheet { name: "Dữ liệu".into(), rows, ..Default::default() }
}

/// AZOTA: "Câu hỏi" | "Mã đề thi", hàng 2 là các mã đề (từ cột B), từ hàng 3 mỗi hàng một câu.
fn azota_sheet(codes: &[&CodeSpec], total: usize) -> Sheet {
    let mut rows: Vec<Vec<(usize, Cell)>> = vec![vec![(0, s("Câu hỏi")), (1, s("Mã đề thi"))]];
    rows.push(codes.iter().enumerate().map(|(i, c)| (i + 1, s(&c.code))).collect());
    let keys: Vec<Vec<String>> = codes.iter().map(|c| flat(c)).collect();
    for q in 0..total {
        let mut r = vec![(0, n(q + 1))];
        r.extend(keys.iter().enumerate().map(|(i, k)| (i + 1, Cell::S(k[q].clone()))));
        rows.push(r);
    }
    Sheet { name: "Dữ liệu".into(), rows, ..Default::default() }
}

// Cột cố định của OLM và YoungMix: Phần I B..AO (40 câu), Phần II AP..BU (8 câu × 4 ý a–d), Phần III BV..CA (6 câu).
const P1_AT: usize = 1;
const P1_MAX: usize = 40;
const P2_AT: usize = P1_AT + P1_MAX;
const P2_MAX: usize = 8;
const P3_AT: usize = P2_AT + P2_MAX * 4;
const P3_MAX: usize = 6;

fn grid_ok(sh: [usize; 3]) -> Result<(), String> {
    if sh[0] > P1_MAX || sh[1] > P2_MAX || sh[2] > P3_MAX {
        return Err(format!("Bố cục này chỉ nhận tối đa {P1_MAX} câu Phần I, {P2_MAX} câu Phần II, {P3_MAX} câu Phần III (đề có {}, {}, {}).", sh[0], sh[1], sh[2]));
    }
    Ok(())
}

/// Các ô đáp án của một mã trong lưới OLM/YoungMix (không gồm cột mã đề).
fn grid_cells(c: &CodeSpec) -> Vec<(usize, Cell)> {
    let mut v = Vec::new();
    for (k, (_, key)) in c.parts[0].iter().enumerate() {
        v.push((P1_AT + k, s(key)));
    }
    for (j, (_, key)) in c.parts[1].iter().enumerate() {
        for (i, ch) in key.chars().enumerate() {
            v.push((P2_AT + j * 4 + i, s(&ch.to_string())));
        }
    }
    for (k, (_, key)) in c.parts[2].iter().enumerate() {
        v.push((P3_AT + k, s(key)));
    }
    v
}

fn grid_header() -> Vec<(usize, Cell)> {
    let mut h = Vec::new();
    for k in 0..P1_MAX {
        h.push((P1_AT + k, n(k + 1)));
    }
    for j in 0..P2_MAX {
        for (i, l) in ["a", "b", "c", "d"].iter().enumerate() {
            h.push((P2_AT + j * 4 + i, s(&format!("{}{l}", j + 1))));
        }
    }
    h
}

/// OLM: trang theo tên môn; hàng 1 là ba tiêu đề Phần (ô gộp), hàng 2 là số câu, hàng 3 là điểm từng ô; từ hàng 4 mỗi hàng một mã đề.
fn olm_sheet(subject: &str, codes: &[&CodeSpec], sh: [usize; 3]) -> Sheet {
    let mut rows: Vec<Vec<(usize, Cell)>> = Vec::new();
    rows.push(vec![
        (P1_AT, s("Phần I: Mỗi câu 0.25đ")),
        (P2_AT, s("Phần II: Mỗi câu tối đa 1đ: đúng 1 ý 0.1đ, đúng 2 ý: 0.25đ, đúng 3 ý: 0.5đ, đúng 4 ý: 1đ")),
        (P3_AT, s("Phần III: Toán 0.5đ, các môn khác: 0.25đ")),
    ]);
    let mut h2 = grid_header();
    for k in 0..P3_MAX {
        h2.push((P3_AT + k, s(&format!("Câu {}", k + 1))));
    }
    rows.push(h2);
    let mut sc: Vec<(usize, Cell)> = vec![(0, s("Điểm"))];
    for k in 0..sh[0] {
        sc.push((P1_AT + k, Cell::N("0.25".into())));
    }
    for j in 0..sh[1] {
        for (i, p) in ["0.1", "0.25", "0.5", "1"].iter().enumerate() {
            sc.push((P2_AT + j * 4 + i, Cell::N((*p).into())));
        }
    }
    for k in 0..sh[2] {
        sc.push((P3_AT + k, Cell::N("0.5".into())));
    }
    rows.push(sc);
    for c in codes {
        let mut r = vec![(0, s(&c.code))];
        r.extend(grid_cells(c));
        rows.push(r);
    }
    let name = if subject.trim().is_empty() { "Toán".to_string() } else { subject.trim().chars().take(31).collect() };
    Sheet {
        name,
        rows,
        merges: vec![format!("{}1:{}1", col(P1_AT), col(P1_AT + P1_MAX - 1)), format!("{}1:{}1", col(P2_AT), col(P3_AT - 1)), format!("{}1:{}1", col(P3_AT), col(P3_AT + P3_MAX - 1))],
        freeze_first_col: true,
    }
}

/// YoungMix: một trang "Dữ liệu"; hàng 1 là "Đề\câu" rồi số câu / 1a…8d / 1…6; mỗi hàng sau một mã đề.
fn youngmix_sheet(codes: &[&CodeSpec]) -> Sheet {
    let mut head = vec![(0, s("Đề\\câu"))];
    head.extend(grid_header());
    for k in 0..P3_MAX {
        head.push((P3_AT + k, n(k + 1)));
    }
    let mut rows = vec![head];
    for c in codes {
        let mut r = vec![(0, s(&c.code))];
        r.extend(grid_cells(c));
        rows.push(r);
    }
    Sheet { name: "Dữ liệu".into(), rows, ..Default::default() }
}

/// Tệp .xlsx của một nền tảng cho các mã đề. `subject` chỉ dùng làm tên trang OLM.
pub fn platform_xlsx(platform: &str, subject: &str, codes: &[&CodeSpec]) -> Result<Vec<u8>, String> {
    if !PLATFORMS.contains(&platform) {
        return Err(format!("Nền tảng «{platform}» chưa hỗ trợ."));
    }
    let sh = shape(codes)?;
    let total = sh[0] + sh[1] + sh[2];
    let sheet = match platform {
        "tnmaker" => list_sheet("Câu\\Mã đề", codes, total),
        "smarttest" => list_sheet("Câu\\Mã đề", codes, total),
        "azota" => azota_sheet(codes, total),
        "olm" => {
            grid_ok(sh)?;
            olm_sheet(subject, codes, sh)
        }
        _ => {
            grid_ok(sh)?;
            youngmix_sheet(codes)
        }
    };
    build(&[sheet])
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    fn cs(code: &str, p1: &[&str], p2: &[&str], p3: &[&str]) -> CodeSpec {
        let mk = |v: &[&str], t: &str| v.iter().enumerate().map(|(k, x)| (format!("{t}{k}"), x.to_string())).collect::<Vec<_>>();
        CodeSpec { code: code.into(), parts: [mk(p1, "a"), mk(p2, "b"), mk(p3, "c"), vec![]] }
    }

    /// Đọc lại: (tên trang, bảng chuỗi, xml trang 1)
    fn read(bytes: Vec<u8>) -> (String, Vec<String>, String) {
        let mut z = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut get = |n: &str| {
            let mut s = String::new();
            z.by_name(n).unwrap_or_else(|_| panic!("thiếu {n}")).read_to_string(&mut s).unwrap();
            s
        };
        let wb = get("xl/workbook.xml");
        let name = wb.split("name=\"").nth(1).unwrap().split('"').next().unwrap().to_string();
        let sst = get("xl/sharedStrings.xml");
        let strs: Vec<String> = sst.split("<t xml:space=\"preserve\">").skip(1).map(|x| x.split("</t>").next().unwrap().to_string()).collect();
        (name, strs, get("xl/worksheets/sheet1.xml"))
    }

    /// Giá trị của một ô (chữ hoặc số), None nếu không có ô đó.
    fn cell(xml: &str, strs: &[String], at: &str) -> Option<String> {
        let key = format!("<c r=\"{at}\" ");
        let i = xml.find(&key)?;
        let rest = &xml[i..];
        let end = rest.find("</c>")?;
        let c = &rest[..end];
        let v = c.split("<v>").nth(1)?.split("</v>").next()?;
        Some(if c.contains("t=\"s\"") { strs[v.parse::<usize>().unwrap()].clone() } else { v.to_string() })
    }

    fn two() -> (CodeSpec, CodeSpec) {
        (cs("101", &["A", "B", "C"], &["ĐSĐS", "SSĐĐ"], &["0,5", "-2"]), cs("102", &["D", "C", "B"], &["SĐSĐ", "ĐĐSS"], &["3", "54,6"]))
    }

    #[test]
    fn tnmaker_va_smarttest_cung_bo_cuc() {
        let (a, b) = two();
        for p in ["tnmaker", "smarttest"] {
            let (name, st, x) = read(platform_xlsx(p, "Toán", &[&a, &b]).unwrap());
            assert_eq!(name, "Dữ liệu");
            assert_eq!(cell(&x, &st, "A1").unwrap(), "Câu\\Mã đề");
            assert_eq!((cell(&x, &st, "B1").unwrap(), cell(&x, &st, "C1").unwrap()), ("101".into(), "102".into()));
            assert_eq!(cell(&x, &st, "A2").unwrap(), "1");
            assert!(x.contains("<c r=\"A2\" t=\"n\">"), "số câu là ô số");
            assert_eq!((cell(&x, &st, "B2").unwrap(), cell(&x, &st, "C2").unwrap()), ("A".into(), "D".into()));
            assert_eq!(cell(&x, &st, "B5").unwrap(), "ĐSĐS", "câu 4 là câu Đúng/Sai đầu tiên");
            assert_eq!(cell(&x, &st, "C8").unwrap(), "54,6", "đáp số giữ dấu phẩy");
            assert!(cell(&x, &st, "A9").is_none(), "đúng 7 câu: 3 + 2 + 2");
        }
    }

    #[test]
    fn azota_co_hai_hang_tieu_de() {
        let (a, b) = two();
        let (_, st, x) = read(platform_xlsx("azota", "Toán", &[&a, &b]).unwrap());
        assert_eq!((cell(&x, &st, "A1").unwrap(), cell(&x, &st, "B1").unwrap()), ("Câu hỏi".into(), "Mã đề thi".into()));
        assert_eq!((cell(&x, &st, "B2").unwrap(), cell(&x, &st, "C2").unwrap()), ("101".into(), "102".into()));
        assert!(cell(&x, &st, "A2").is_none());
        assert_eq!((cell(&x, &st, "A3").unwrap(), cell(&x, &st, "B3").unwrap(), cell(&x, &st, "C3").unwrap()), ("1".into(), "A".into(), "D".into()));
        assert_eq!(cell(&x, &st, "C9").unwrap(), "54,6");
    }

    #[test]
    fn olm_luoi_co_dinh_va_diem() {
        let (a, b) = two();
        let (name, st, x) = read(platform_xlsx("olm", "Toán", &[&a, &b]).unwrap());
        assert_eq!(name, "Toán");
        assert!(x.contains("<mergeCell ref=\"B1:AO1\"/>") && x.contains("<mergeCell ref=\"AP1:BU1\"/>") && x.contains("<mergeCell ref=\"BV1:CA1\"/>"));
        assert!(x.contains("state=\"frozen\""));
        assert_eq!(cell(&x, &st, "B1").unwrap(), "Phần I: Mỗi câu 0.25đ");
        assert_eq!((cell(&x, &st, "B2").unwrap(), cell(&x, &st, "AO2").unwrap(), cell(&x, &st, "AP2").unwrap(), cell(&x, &st, "BU2").unwrap(), cell(&x, &st, "BV2").unwrap(), cell(&x, &st, "CA2").unwrap()), ("1".into(), "40".into(), "1a".into(), "8d".into(), "Câu 1".into(), "Câu 6".into()));
        assert_eq!((cell(&x, &st, "A3").unwrap(), cell(&x, &st, "B3").unwrap(), cell(&x, &st, "D3").unwrap(), cell(&x, &st, "E3"), cell(&x, &st, "AP3").unwrap(), cell(&x, &st, "AS3").unwrap(), cell(&x, &st, "AT3").unwrap(), cell(&x, &st, "AW3").unwrap(), cell(&x, &st, "AX3"), cell(&x, &st, "BV3").unwrap()), ("Điểm".into(), "0.25".into(), "0.25".into(), None, "0.1".into(), "1".into(), "0.1".into(), "1".into(), None, "0.5".into()));
        // mã 101: câu 1–3 = A B C; Phần II câu 1 = ĐSĐS ở AP..AS, câu 2 = SSĐĐ ở AT..AW; Phần III ở BV, BW
        assert_eq!((cell(&x, &st, "A4").unwrap(), cell(&x, &st, "B4").unwrap(), cell(&x, &st, "D4").unwrap()), ("101".into(), "A".into(), "C".into()));
        assert_eq!((cell(&x, &st, "AP4").unwrap(), cell(&x, &st, "AQ4").unwrap(), cell(&x, &st, "AR4").unwrap(), cell(&x, &st, "AS4").unwrap(), cell(&x, &st, "AT4").unwrap(), cell(&x, &st, "AW4").unwrap()), ("Đ".into(), "S".into(), "Đ".into(), "S".into(), "S".into(), "Đ".into()));
        assert_eq!((cell(&x, &st, "BV4").unwrap(), cell(&x, &st, "BW4").unwrap(), cell(&x, &st, "BV5").unwrap(), cell(&x, &st, "BW5").unwrap()), ("0,5".into(), "-2".into(), "3".into(), "54,6".into()));
    }

    #[test]
    fn youngmix_cung_luoi_khong_co_hang_diem() {
        let (a, b) = two();
        let (_, st, x) = read(platform_xlsx("youngmix", "", &[&a, &b]).unwrap());
        assert_eq!((cell(&x, &st, "A1").unwrap(), cell(&x, &st, "B1").unwrap(), cell(&x, &st, "AP1").unwrap(), cell(&x, &st, "BV1").unwrap(), cell(&x, &st, "CA1").unwrap()), ("Đề\\câu".into(), "1".into(), "1a".into(), "1".into(), "6".into()));
        assert_eq!((cell(&x, &st, "A2").unwrap(), cell(&x, &st, "B2").unwrap(), cell(&x, &st, "AP2").unwrap(), cell(&x, &st, "BV2").unwrap()), ("101".into(), "A".into(), "Đ".into(), "0,5".into()));
        assert_eq!(cell(&x, &st, "A3").unwrap(), "102");
    }

    #[test]
    fn tu_choi_khi_khong_an_toan() {
        let (a, b) = two();
        let lech = cs("103", &["A"], &["ĐSĐS"], &["1"]);
        assert!(platform_xlsx("azota", "", &[&a, &lech]).is_err(), "khác cấu trúc");
        assert!(platform_xlsx("azota", "", &[]).is_err());
        assert!(platform_xlsx("khong-co", "", &[&a, &b]).is_err());
        let xau = cs("104", &["A", "B", "X"], &["ĐSĐS", "SSĐĐ"], &["1", "2"]);
        assert!(platform_xlsx("tnmaker", "", &[&xau]).is_err(), "đáp án Phần I không hợp lệ");
        let thieu = cs("105", &["A", "B", "C"], &["ĐSĐS", "SSĐĐ"], &["1", "?"]);
        assert!(platform_xlsx("tnmaker", "", &[&thieu]).is_err(), "thiếu đáp số");
        let nhieu = cs("106", &vec!["A"; 41], &[], &[]);
        assert!(platform_xlsx("olm", "", &[&nhieu]).is_err(), "quá 40 câu Phần I cho lưới OLM");
        assert!(platform_xlsx("tnmaker", "", &[&nhieu]).is_ok(), "danh sách TNMaker không giới hạn 40");
    }
}
