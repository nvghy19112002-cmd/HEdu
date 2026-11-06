//! Mã QR đáp án cho nền tảng thi (TNMaker, SmartTest, YoungMix): nội dung QR là đáp án mọi mã đề dạng JSON,
//! quan sát từ ảnh QR mà phần mềm khác đã xuất (chỉ cấu trúc nội dung); HEdu tự dựng mã QR và tệp PNG.
use crate::examexport::CodeSpec;
use qrcode::{Color, EcLevel, QrCode};

pub const QR_PLATFORMS: [&str; 3] = ["tnmaker", "smarttest", "youngmix"];

fn json_str(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| "\"\"".into())
}

/// Nội dung chữ của mã QR.
/// TNMaker: `{"<mã>":"<Phần I liền><Phần II liền>#<đáp số>#<đáp số>…", …,"success":true,"type":0}`.
/// SmartTest / YoungMix: mảng các hàng `[mã, từng đáp án Phần I, từng ý Đúng/Sai Phần II, từng đáp số Phần III]`.
pub fn payload(platform: &str, codes: &[&CodeSpec]) -> Result<String, String> {
    if codes.is_empty() {
        return Err("Đề chưa có mã đề nào.".into());
    }
    match platform {
        "tnmaker" => {
            let mut out = String::from("{");
            for c in codes {
                let mut v: String = c.parts[0].iter().map(|(_, k)| k.as_str()).collect();
                v.extend(c.parts[1].iter().map(|(_, k)| k.as_str()));
                for (_, k) in &c.parts[2] {
                    v.push('#');
                    v.push_str(k);
                }
                out.push_str(&format!("{}:{},", json_str(&c.code), json_str(&v)));
            }
            out.push_str("\"success\":true,\"type\":0}");
            Ok(out)
        }
        "smarttest" | "youngmix" => {
            let rows: Vec<Vec<String>> = codes
                .iter()
                .map(|c| {
                    let mut r = vec![c.code.clone()];
                    r.extend(c.parts[0].iter().map(|(_, k)| k.clone()));
                    for (_, k) in &c.parts[1] {
                        r.extend(k.chars().map(|ch| ch.to_string()));
                    }
                    r.extend(c.parts[2].iter().map(|(_, k)| k.clone()));
                    r
                })
                .collect();
            serde_json::to_string(&rows).map_err(|e| e.to_string())
        }
        _ => Err(format!("Nền tảng «{platform}» chưa có mã QR đáp án.")),
    }
}

/// Ảnh PNG của mã QR (đen trắng, vùng trắng quanh 4 ô, mỗi ô vuông `scale` điểm ảnh).
pub fn png_of(text: &str) -> Result<Vec<u8>, String> {
    let code = QrCode::with_error_correction_level(text.as_bytes(), EcLevel::L).map_err(|_| "Nội dung đáp án quá dài để đưa vào một mã QR.".to_string())?;
    let n = code.width();
    let quiet = 4usize;
    let total = n + 2 * quiet;
    let scale = (480 / total).max(4);
    let side = total * scale;
    let mut px = vec![255u8; side * side];
    let cells = code.to_colors();
    for y in 0..n {
        for x in 0..n {
            if cells[y * n + x] == Color::Dark {
                for dy in 0..scale {
                    let row = ((y + quiet) * scale + dy) * side + (x + quiet) * scale;
                    px[row..row + scale].fill(0);
                }
            }
        }
    }
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, side as u32, side as u32);
        enc.set_color(png::ColorType::Grayscale);
        enc.set_depth(png::BitDepth::Eight);
        let mut w = enc.write_header().map_err(|e| e.to_string())?;
        w.write_image_data(&px).map_err(|e| e.to_string())?;
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cs(code: &str, p1: &[&str], p2: &[&str], p3: &[&str]) -> CodeSpec {
        let mk = |v: &[&str], t: &str| v.iter().enumerate().map(|(k, x)| (format!("{t}{k}"), x.to_string())).collect::<Vec<_>>();
        CodeSpec { code: code.into(), parts: [mk(p1, "a"), mk(p2, "b"), mk(p3, "c"), vec![]] }
    }

    #[test]
    fn tnmaker_giong_mau_da_quan_sat() {
        let a = cs("1011", &["C", "A"], &["SSĐS"], &["3", "11"]);
        let b = cs("1012", &["A", "B"], &["ĐSSĐ"], &["11", "3"]);
        let p = payload("tnmaker", &[&a, &b]).unwrap();
        assert_eq!(p, r##"{"1011":"CASSĐS#3#11","1012":"ABĐSSĐ#11#3","success":true,"type":0}"##);
        let v: serde_json::Value = serde_json::from_str(&p).unwrap();
        assert_eq!(v["success"], true);
    }

    #[test]
    fn smarttest_la_mang_tung_o() {
        let a = cs("1011", &["C", "A"], &["SSĐS"], &["3", "11"]);
        let p = payload("smarttest", &[&a]).unwrap();
        assert_eq!(p, r#"[["1011","C","A","S","S","Đ","S","3","11"]]"#);
        assert_eq!(payload("youngmix", &[&a]).unwrap(), p);
    }

    #[test]
    fn nen_tang_khac_va_de_rong_bi_tu_choi() {
        let a = cs("1", &["A"], &[], &[]);
        assert!(payload("azota", &[&a]).is_err());
        assert!(payload("tnmaker", &[]).is_err());
    }

    #[test]
    fn png_hop_le_va_doc_lai_duoc() {
        let a = cs("1011", &["C", "A", "B", "D"], &["SSĐS"], &["3", "11"]);
        let text = payload("smarttest", &[&a]).unwrap();
        let bytes = png_of(&text).unwrap();
        assert_eq!(&bytes[..8], &[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]);
        let dec = png::Decoder::new(std::io::Cursor::new(&bytes));
        let mut r = dec.read_info().unwrap();
        let mut buf = vec![0u8; r.output_buffer_size().unwrap()];
        let info = r.next_frame(&mut buf).unwrap();
        assert!(info.width >= 200 && info.width == info.height);
        assert!(buf.contains(&0) && buf.contains(&255));
    }
}
