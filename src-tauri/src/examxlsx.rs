//! Bảng đáp án Excel (.xlsx) cho gói giáo viên. Tự dựng SpreadsheetML tối thiểu bằng gói `zip` sẵn có (không thêm phụ thuộc).
//! Hai trang: "Theo mã đề" (mỗi mã một dòng, mỗi câu một cột — dạng phổ biến để nhập vào phần mềm chấm) và
//! "Theo câu" (mỗi câu một dòng, mỗi mã một cột — để giáo viên dò). Mọi ô là chữ (giữ nguyên "0,5", "ĐSĐS", số 0 đầu).
//! Chỉ đọc từ `hedu-de.json` đã đối chiếu; không đọc ngân hàng.

use std::io::{Cursor, Write};

use crate::examexport::CodeSpec;

const PART_ROMAN: [&str; 4] = ["I", "II", "III", "IV"];

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

/// Tên cột Excel: 0 → A, 25 → Z, 26 → AA.
pub fn col(mut i: usize) -> String {
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

fn sheet(rows: &[Vec<String>]) -> String {
    let mut x = String::from(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" xSplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><sheetData>"#);
    for (r, row) in rows.iter().enumerate() {
        x.push_str(&format!(r#"<row r="{}">"#, r + 1));
        for (c, v) in row.iter().enumerate() {
            let style = if r == 0 { r#" s="1""# } else { "" };
            x.push_str(&format!(r#"<c r="{}{}" t="inlineStr"{style}><is><t xml:space="preserve">{}</t></is></c>"#, col(c), r + 1, esc(v)));
        }
        x.push_str("</row>");
    }
    x.push_str("</sheetData></worksheet>");
    x
}

/// Nhãn câu theo thứ tự trong đề: I.1, I.2, …, II.1, …
fn labels(c: &CodeSpec) -> Vec<String> {
    c.parts.iter().enumerate().flat_map(|(i, p)| (1..=p.len()).map(move |k| format!("{}.{k}", PART_ROMAN[i]))).collect()
}

/// Hai bảng (theo mã đề, theo câu). Các mã phải cùng cấu trúc (cùng số câu từng phần) — đúng với đề sinh từ một ma trận.
pub fn tables(codes: &[&CodeSpec]) -> Result<(Vec<Vec<String>>, Vec<Vec<String>>), String> {
    let first = codes.first().ok_or("Không có mã đề nào để xuất đáp án.")?;
    let shape: Vec<usize> = first.parts.iter().map(|p| p.len()).collect();
    if codes.iter().any(|c| c.parts.iter().map(|p| p.len()).collect::<Vec<_>>() != shape) {
        return Err("Các mã đề không cùng số câu từng phần nên không gộp chung một bảng đáp án được.".into());
    }
    let heads = labels(first);
    let keys = |c: &CodeSpec| -> Vec<String> { c.parts.iter().flatten().map(|(_, k)| k.clone()).collect() };
    let mut by_code = vec![std::iter::once("Mã đề".to_string()).chain(heads.iter().cloned()).collect::<Vec<_>>()];
    for c in codes {
        by_code.push(std::iter::once(c.code.clone()).chain(keys(c)).collect());
    }
    let mut by_q = vec![std::iter::once("Câu".to_string()).chain(codes.iter().map(|c| format!("Mã {}", c.code))).collect::<Vec<_>>()];
    let all: Vec<Vec<String>> = codes.iter().map(|c| keys(c)).collect();
    for (k, h) in heads.iter().enumerate() {
        by_q.push(std::iter::once(h.clone()).chain(all.iter().map(|ks| ks[k].clone())).collect());
    }
    Ok((by_code, by_q))
}

/// Tệp .xlsx (byte) cho các mã đề.
pub fn answers_xlsx(codes: &[&CodeSpec]) -> Result<Vec<u8>, String> {
    let (a, b) = tables(codes)?;
    let mut z = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let o = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    let files: [(&str, String); 7] = [
        ("[Content_Types].xml", r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>"#.into()),
        ("_rels/.rels", r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>"#.into()),
        ("xl/workbook.xml", r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Theo mã đề" sheetId="1" r:id="rId1"/><sheet name="Theo câu" sheetId="2" r:id="rId2"/></sheets></workbook>"#.into()),
        ("xl/_rels/workbook.xml.rels", r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>"#.into()),
        ("xl/styles.xml", r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>"#.into()),
        ("xl/worksheets/sheet1.xml", sheet(&a)),
        ("xl/worksheets/sheet2.xml", sheet(&b)),
    ];
    for (name, body) in files.iter() {
        z.start_file(*name, o).map_err(|e| format!("Không dựng được tệp Excel: {e}"))?;
        z.write_all(body.as_bytes()).map_err(|e| format!("Không dựng được tệp Excel: {e}"))?;
    }
    Ok(z.finish().map_err(|e| format!("Không dựng được tệp Excel: {e}"))?.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    fn cs(code: &str, keys: [&[&str]; 4]) -> CodeSpec {
        let mut parts: [Vec<(String, String)>; 4] = Default::default();
        for (i, ks) in keys.iter().enumerate() {
            parts[i] = ks.iter().enumerate().map(|(k, v)| (format!("u{i}{k}"), v.to_string())).collect();
        }
        CodeSpec { code: code.into(), parts }
    }

    #[test]
    fn cot_excel() {
        assert_eq!((col(0).as_str(), col(25).as_str(), col(26).as_str(), col(27).as_str(), col(701).as_str(), col(702).as_str()), ("A", "Z", "AA", "AB", "ZZ", "AAA"));
    }

    #[test]
    fn hai_bang_dung_thu_tu_va_giu_nguyen_chu() {
        let a = cs("101", [&["A", "B"], &["ĐSĐS"], &["0,5"], &[]]);
        let b = cs("102", [&["C", "D"], &["SSĐĐ"], &["-2"], &[]]);
        let (by_code, by_q) = tables(&[&a, &b]).unwrap();
        assert_eq!(by_code[0], vec!["Mã đề", "I.1", "I.2", "II.1", "III.1"]);
        assert_eq!(by_code[1], vec!["101", "A", "B", "ĐSĐS", "0,5"]);
        assert_eq!(by_code[2], vec!["102", "C", "D", "SSĐĐ", "-2"]);
        assert_eq!(by_q[0], vec!["Câu", "Mã 101", "Mã 102"]);
        assert_eq!(by_q[3], vec!["II.1", "ĐSĐS", "SSĐĐ"]);
        let lech = cs("103", [&["A"], &["ĐSĐS"], &["1"], &[]]);
        assert!(tables(&[&a, &lech]).is_err(), "khác cấu trúc thì từ chối, không lệch cột");
        assert!(tables(&[]).is_err());
    }

    #[test]
    fn tep_xlsx_mo_lai_duoc_va_dung_noi_dung() {
        let a = cs("101", [&["A", "B"], &["ĐSĐS"], &["0,5"], &[]]);
        let b = cs("102", [&["<&>", "D"], &["SSĐĐ"], &["1"], &[]]);
        let bytes = answers_xlsx(&[&a, &b]).unwrap();
        let mut z = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        for n in ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"] {
            assert!(z.by_name(n).is_ok(), "thiếu {n}");
        }
        let mut s1 = String::new();
        z.by_name("xl/worksheets/sheet1.xml").unwrap().read_to_string(&mut s1).unwrap();
        assert!(s1.contains(r#"<c r="A2" t="inlineStr"><is><t xml:space="preserve">101</t></is></c>"#));
        assert!(s1.contains("ĐSĐS") && s1.contains("0,5") && s1.contains("&lt;&amp;&gt;"), "giữ nguyên chữ, thoát ký tự XML");
        let mut wb = String::new();
        z.by_name("xl/workbook.xml").unwrap().read_to_string(&mut wb).unwrap();
        assert!(wb.contains("Theo mã đề") && wb.contains("Theo câu"));
    }
}
