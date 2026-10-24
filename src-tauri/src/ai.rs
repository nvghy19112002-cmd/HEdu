// Lớp AI DÙNG CHUNG cho mọi tính năng (Gán ID là nhiệm vụ đầu tiên). KHÔNG chứa prompt của tính năng nào:
// giao diện gửi sẵn system/user/khuôn JSON của "nhiệm vụ AI", lớp này chỉ lo phần an toàn khi gọi ra ngoài:
//   - khoá API nằm trong Windows Credential Manager (không vào hedu.json, file sao lưu, log hay giao diện);
//   - chỉ gọi đúng một địa chỉ chính thức của Gemini, khoá gửi qua header (không nằm trên URL);
//   - giới hạn kích thước gửi/nhận, thời gian chờ, thử lại có giới hạn khi bị nghẽn;
//   - phân loại lỗi rõ ràng (sai khoá, hết lượt trong ngày, quá nhịp, quá tải…) để giao diện báo tiếng Việt;
//   - không ghi nội dung câu hỏi hay câu trả lời ra log.
// Phần thuần (dựng yêu cầu, đọc kết quả, phân loại lỗi) tách riêng để kiểm thử không cần mạng.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;

/// Địa chỉ cố định — giao diện chỉ được chọn mã model, không được chọn địa chỉ.
const GEMINI_BASE: &str = "https://generativelanguage.googleapis.com/v1beta/models/";
pub const MAX_PROMPT_BYTES: usize = 200_000;
pub const MAX_RESPONSE_BYTES: usize = 2_000_000;
const MAX_OUTPUT_TOKENS: u32 = 16_384;
const MAX_RETRIES: u32 = 2;
const MAX_WAIT_SECS: u64 = 20;
/// Mục khoá của beta.27 (một khoá duy nhất). KHÔNG đổi tên, KHÔNG tự xoá: hồ sơ "legacy" trỏ thẳng vào đây.
const KEY_USER: &str = "gemini-api-key";
pub const LEGACY_PROFILE: &str = "legacy";
/// Hồ sơ hợp lệ: "legacy" (khoá cũ) hoặc p1..p5. Giao diện chỉ được chọn trong tập này, không tự đặt tên mục kho mật khẩu.
pub fn valid_profile(id: &str) -> bool {
    id == LEGACY_PROFILE || matches!(id, "p1" | "p2" | "p3" | "p4" | "p5")
}
/// Tên mục trong kho mật khẩu của một hồ sơ (cùng một "service"). Hồ sơ legacy giữ NGUYÊN tên mục cũ.
pub fn key_user(profile: &str) -> String {
    if profile == LEGACY_PROFILE { KEY_USER.to_string() } else { format!("gemini-key-{profile}") }
}
/// Tệp thông tin hồ sơ (tên, bật/tắt, đang dùng) chỉ được là JSON nhỏ và KHÔNG được chứa thứ giống khoá API.
pub fn profiles_valid(bytes: &[u8]) -> bool {
    bytes.len() <= 64 * 1024
        && serde_json::from_slice::<Value>(bytes).map(|v| v.is_object()).unwrap_or(false)
        && !String::from_utf8_lossy(bytes).contains("AIza")
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AiRequest {
    /// hiện chỉ "gemini"
    pub provider: String,
    pub model: String,
    pub system: String,
    pub user: String,
    /// khuôn JSON của nhiệm vụ (chuyển nguyên cho Gemini); None ⇒ trả chữ thường
    pub schema: Option<Value>,
    pub max_output_tokens: Option<u32>,
    pub timeout_secs: Option<u64>,
    /// mức "suy nghĩ" trước khi trả lời: minimal | low | medium | high (None ⇒ mặc định của model).
    /// Suy nghĩ ăn vào maxOutputTokens và làm chậm hẳn (đo 24/10/2026: 3.8 Flash mặc định > 120 s cho câu "1+1").
    #[serde(default)]
    pub thinking_level: Option<String>,
    /// hồ sơ khoá dùng cho lượt này (legacy | p1..p5); vắng ⇒ legacy (khoá của beta.27)
    #[serde(default)]
    pub profile_id: Option<String>,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiReply {
    pub text: String,
    pub finish: String,
    pub prompt_tokens: u64,
    pub output_tokens: u64,
    pub model: String,
}

#[derive(Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AiError {
    /// no_key | bad_key | forbidden | quota_day | rate | overloaded | timeout | too_large | network |
    /// bad_request | blocked | bad_response | unsupported
    pub kind: String,
    pub message: String,
    pub retry_after_secs: Option<u64>,
}

fn err(kind: &str, message: impl Into<String>) -> AiError {
    AiError { kind: kind.into(), message: message.into(), retry_after_secs: None }
}

/// Mã model hợp lệ: chữ thường, số, '.', '-' (không có '/', ':' hay khoảng trắng ⇒ không chèn được đường dẫn).
pub fn valid_model(m: &str) -> bool {
    let b = m.as_bytes();
    !b.is_empty() && b.len() <= 64 && b[0].is_ascii_alphanumeric()
        && b.iter().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'.' || *c == b'-')
}

/// Khoá hợp lệ về hình thức (không kiểm với Google): 10–200 ký tự ASCII nhìn thấy được.
pub fn valid_key(k: &str) -> bool {
    (10..=200).contains(&k.len()) && k.bytes().all(|c| c.is_ascii_graphic())
}

pub fn endpoint(model: &str) -> String {
    format!("{GEMINI_BASE}{model}:generateContent")
}

/// Dựng thân yêu cầu generateContent. Không thêm công cụ (tìm web, chạy mã…): chỉ sinh chữ/JSON.
pub fn build_body(req: &AiRequest) -> Result<Value, AiError> {
    if req.provider != "gemini" { return Err(err("unsupported", "Chưa hỗ trợ nhà cung cấp AI này.")); }
    if !valid_model(&req.model) { return Err(err("bad_request", "Mã model không hợp lệ.")); }
    let size = req.system.len() + req.user.len() + req.schema.as_ref().map_or(0, |s| s.to_string().len());
    if size > MAX_PROMPT_BYTES { return Err(err("too_large", "Dữ liệu gửi quá lớn — hãy chia nhỏ lượt.")); }
    let mut gen = json!({ "maxOutputTokens": req.max_output_tokens.unwrap_or(4096).min(MAX_OUTPUT_TOKENS) });
    if let Some(t) = &req.thinking_level {
        if !matches!(t.as_str(), "minimal" | "low" | "medium" | "high") { return Err(err("bad_request", "Mức suy nghĩ không hợp lệ.")); }
        gen["thinkingConfig"] = json!({ "thinkingLevel": t });
    }
    if let Some(s) = &req.schema {
        gen["responseMimeType"] = json!("application/json");
        gen["responseSchema"] = s.clone();
    }
    Ok(json!({
        "systemInstruction": { "parts": [{ "text": req.system }] },
        "contents": [{ "role": "user", "parts": [{ "text": req.user }] }],
        "generationConfig": gen,
    }))
}

/// Giây chờ Google gợi ý: header Retry-After, hoặc RetryInfo.retryDelay ("17s") trong thân lỗi.
fn retry_hint(retry_after: Option<&str>, body: &Value) -> Option<u64> {
    if let Some(s) = retry_after.and_then(|v| v.trim().parse::<u64>().ok()) { return Some(s); }
    body["error"]["details"].as_array()?.iter().find_map(|d| {
        d["retryDelay"].as_str().and_then(|s| s.trim_end_matches('s').split('.').next()?.parse::<u64>().ok())
    })
}

/// Hết hạn mức THEO NGÀY (không thử lại) — khác với quá nhịp theo phút (thử lại được).
fn is_daily_quota(body: &Value) -> bool {
    body["error"]["details"].as_array().is_some_and(|ds| ds.iter().any(|d| {
        d["violations"].as_array().is_some_and(|vs| vs.iter().any(|v| v["quotaId"].as_str().is_some_and(|q| q.contains("PerDay"))))
    }))
}

/// Đọc kết quả HTTP thành câu trả lời hoặc lỗi đã phân loại. Không đưa nội dung thân lỗi thô ra ngoài.
pub fn classify(status: u16, retry_after: Option<&str>, body: &[u8], model: &str) -> Result<AiReply, AiError> {
    if body.len() > MAX_RESPONSE_BYTES { return Err(err("bad_response", "Câu trả lời quá lớn.")); }
    let v: Value = serde_json::from_slice(body).unwrap_or(Value::Null);
    match status {
        200 => {}
        400 => {
            let m = v["error"]["message"].as_str().unwrap_or("");
            return Err(if m.contains("API key") { err("bad_key", "Khoá API không hợp lệ.") } else { err("bad_request", "Google từ chối yêu cầu (sai cấu hình model hoặc khuôn kết quả).") });
        }
        401 => return Err(err("bad_key", "Khoá API không hợp lệ hoặc đã bị thu hồi.")),
        403 => return Err(err("forbidden", "Khoá không có quyền dùng model này (có thể model không thuộc gói miễn phí).")),
        404 => return Err(err("bad_request", "Không tìm thấy model — tên model có thể đã đổi.")),
        429 => {
            let mut e = if is_daily_quota(&v) { err("quota_day", "Đã hết lượt miễn phí hôm nay. Hãy thử lại vào ngày mai.") } else { err("rate", "Gọi AI quá nhanh — đang chờ để thử lại.") };
            e.retry_after_secs = retry_hint(retry_after, &v);
            return Err(e);
        }
        500 | 502 | 503 | 504 => { let mut e = err("overloaded", "Máy chủ AI đang quá tải."); e.retry_after_secs = retry_hint(retry_after, &v); return Err(e); }
        s => return Err(err("bad_response", format!("Máy chủ AI trả mã lỗi {s}."))),
    }
    if let Some(r) = v["promptFeedback"]["blockReason"].as_str() {
        return Err(err("blocked", format!("Google chặn yêu cầu ({r}).")));
    }
    let cand = &v["candidates"][0];
    let finish = cand["finishReason"].as_str().unwrap_or("").to_string();
    let text: String = cand["content"]["parts"].as_array().map(|ps| ps.iter().filter_map(|p| p["text"].as_str()).collect()).unwrap_or_default();
    if text.is_empty() {
        return Err(if finish.is_empty() || finish == "STOP" { err("bad_response", "AI không trả nội dung.") } else { err("blocked", format!("AI dừng mà không trả nội dung ({finish}).")) });
    }
    let u = &v["usageMetadata"];
    Ok(AiReply {
        text,
        finish,
        prompt_tokens: u["promptTokenCount"].as_u64().unwrap_or(0),
        output_tokens: u["candidatesTokenCount"].as_u64().unwrap_or(0),
        model: v["modelVersion"].as_str().unwrap_or(model).to_string(),
    })
}

/// Có thử lại không, sau bao lâu: chỉ quá nhịp / quá tải, tối đa MAX_RETRIES lần, chờ tối đa MAX_WAIT_SECS.
pub fn retry_delay(e: &AiError, attempt: u32) -> Option<Duration> {
    if attempt >= MAX_RETRIES || !(e.kind == "rate" || e.kind == "overloaded") { return None; }
    let s = e.retry_after_secs.unwrap_or(2u64 << attempt).clamp(1, MAX_WAIT_SECS);
    Some(Duration::from_secs(s))
}

// ---------------- khoá API (Windows Credential Manager) ----------------

fn entry(service: &str, profile: &str) -> Result<keyring::Entry, AiError> {
    if !valid_profile(profile) { return Err(err("bad_request", "Cấu hình khoá không hợp lệ.")); }
    keyring::Entry::new(service, &key_user(profile)).map_err(|_| err("no_key", "Không mở được kho mật khẩu của Windows."))
}

pub fn key_set(service: &str, profile: &str, key: &str) -> Result<(), AiError> {
    let k = key.trim();
    if !valid_key(k) { return Err(err("bad_key", "Khoá API không đúng định dạng.")); }
    entry(service, profile)?.set_password(k).map_err(|_| err("no_key", "Không lưu được khoá vào kho mật khẩu của Windows."))
}

pub fn key_clear(service: &str, profile: &str) -> Result<(), AiError> {
    match entry(service, profile)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err(err("no_key", "Không xoá được khoá trong kho mật khẩu của Windows.")),
    }
}

pub fn key_get(service: &str, profile: &str) -> Result<Option<String>, AiError> {
    match entry(service, profile)?.get_password() {
        Ok(k) => Ok(Some(k)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err(err("no_key", "Không đọc được kho mật khẩu của Windows.")),
    }
}

// ---------------- gọi mạng ----------------

pub async fn run(service: &str, req: AiRequest) -> Result<AiReply, AiError> {
    let body = build_body(&req)?;
    let profile = req.profile_id.as_deref().unwrap_or(LEGACY_PROFILE);
    let key = key_get(service, profile)?.ok_or_else(|| err("no_key", "Cấu hình đang dùng chưa có khoá API Gemini (Cài đặt → AI Gemini)."))?;
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let timeout = Duration::from_secs(req.timeout_secs.unwrap_or(90).clamp(5, 300));
    let client = reqwest::Client::builder()
        .timeout(timeout)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| err("network", "Không khởi tạo được kết nối mạng."))?;
    let url = endpoint(&req.model);
    let mut attempt = 0;
    loop {
        let res = client.post(&url).header("x-goog-api-key", &key).json(&body).send().await;
        let out = match res {
            Err(e) if e.is_timeout() => Err(err("timeout", "AI trả lời quá lâu — hãy thử lại với ít câu hơn.")),
            Err(_) => Err(err("network", "Không kết nối được tới máy chủ AI — kiểm tra mạng.")),
            Ok(r) => {
                let status = r.status().as_u16();
                let ra = r.headers().get("retry-after").and_then(|v| v.to_str().ok()).map(str::to_string);
                if r.content_length().is_some_and(|n| n as usize > MAX_RESPONSE_BYTES) {
                    Err(err("bad_response", "Câu trả lời quá lớn."))
                } else {
                    match r.bytes().await {
                        Ok(b) => classify(status, ra.as_deref(), &b, &req.model),
                        Err(_) => Err(err("network", "Mất kết nối khi đang nhận câu trả lời.")),
                    }
                }
            }
        };
        match out {
            Err(e) => match retry_delay(&e, attempt) {
                Some(d) => { tokio::time::sleep(d).await; attempt += 1; }
                None => return Err(e),
            },
            ok => return ok,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req() -> AiRequest {
        AiRequest { provider: "gemini".into(), model: "gemini-3.8-flash".into(), system: "S".into(), user: "U".into(), schema: Some(json!({"type":"object"})), max_output_tokens: None, timeout_secs: None, thinking_level: None, profile_id: None }
    }

    #[test]
    fn ma_model_khong_chen_duong_dan() {
        assert!(valid_model("gemini-3.8-flash") && valid_model("gemini-2.5-pro"));
        for bad in ["", "../x", "a/b", "m:generate", "Gemini", "x y", "https://evil", &"a".repeat(65)] { assert!(!valid_model(bad), "{bad}"); }
        assert_eq!(endpoint("gemini-3.8-flash"), "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
    }

    #[test]
    fn khoa_dung_dinh_dang() {
        assert!(valid_key("AIzaSyA-abcdefghijklmnop_123"));
        assert!(!valid_key("ngan") && !valid_key("co khoang trang 123456") && !valid_key(&"a".repeat(201)) && !valid_key("dấu-tiếng-việt-123"));
    }

    #[test]
    fn dung_than_yeu_cau() {
        let b = build_body(&req()).unwrap();
        assert_eq!(b["systemInstruction"]["parts"][0]["text"], "S");
        assert_eq!(b["contents"][0]["parts"][0]["text"], "U");
        assert_eq!(b["generationConfig"]["responseMimeType"], "application/json");
        assert_eq!(b["generationConfig"]["responseSchema"]["type"], "object");
        assert!(b.get("tools").is_none(), "không bật công cụ nào");
        let mut r = req(); r.schema = None; r.max_output_tokens = Some(999_999);
        let b2 = build_body(&r).unwrap();
        assert!(b2["generationConfig"].get("responseSchema").is_none() && b2["generationConfig"]["maxOutputTokens"] == MAX_OUTPUT_TOKENS);
    }

    #[test]
    fn chan_yeu_cau_sai() {
        let mut r = req(); r.provider = "khac".into(); assert_eq!(build_body(&r).unwrap_err().kind, "unsupported");
        let mut r = req(); r.model = "../../x".into(); assert_eq!(build_body(&r).unwrap_err().kind, "bad_request");
        let mut r = req(); r.user = "x".repeat(MAX_PROMPT_BYTES + 1); assert_eq!(build_body(&r).unwrap_err().kind, "too_large");
        let mut r = req(); r.thinking_level = Some("vo-han".into()); assert_eq!(build_body(&r).unwrap_err().kind, "bad_request");
        let mut r = req(); r.thinking_level = Some("low".into()); assert_eq!(build_body(&r).unwrap()["generationConfig"]["thinkingConfig"]["thinkingLevel"], "low");
        assert!(build_body(&req()).unwrap()["generationConfig"].get("thinkingConfig").is_none(), "không chọn ⇒ để mặc định của model");
    }

    #[test]
    fn doc_ket_qua_thanh_cong() {
        let body = json!({"candidates":[{"content":{"parts":[{"text":"{\"a\":"},{"text":"1}"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":120,"candidatesTokenCount":8},"modelVersion":"gemini-3.8-flash-001"});
        let r = classify(200, None, body.to_string().as_bytes(), "gemini-3.8-flash").unwrap();
        assert_eq!(r, AiReply { text: "{\"a\":1}".into(), finish: "STOP".into(), prompt_tokens: 120, output_tokens: 8, model: "gemini-3.8-flash-001".into() });
    }

    #[test]
    fn phan_loai_loi() {
        let k = |s: u16, b: Value| classify(s, None, b.to_string().as_bytes(), "m").unwrap_err().kind;
        assert_eq!(k(400, json!({"error":{"message":"API key not valid. Please pass a valid API key."}})), "bad_key");
        assert_eq!(k(400, json!({"error":{"message":"Invalid JSON payload"}})), "bad_request");
        assert_eq!(k(401, json!({})), "bad_key");
        assert_eq!(k(403, json!({})), "forbidden");
        assert_eq!(k(404, json!({})), "bad_request");
        assert_eq!(k(503, json!({})), "overloaded");
        assert_eq!(k(200, json!({"promptFeedback":{"blockReason":"SAFETY"}})), "blocked");
        assert_eq!(k(200, json!({"candidates":[{"finishReason":"MAX_TOKENS","content":{"parts":[]}}]})), "blocked");
        assert_eq!(k(200, json!({"candidates":[]})), "bad_response");
        assert_eq!(k(200, json!("không phải json")), "bad_response");
        let big = vec![b' '; MAX_RESPONSE_BYTES + 1];
        assert_eq!(classify(200, None, &big, "m").unwrap_err().kind, "bad_response");
    }

    #[test]
    fn het_luot_ngay_khac_qua_nhip() {
        let day = json!({"error":{"code":429,"details":[{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}]}});
        let minute = json!({"error":{"code":429,"details":[{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"17s"}]}});
        let d = classify(429, None, day.to_string().as_bytes(), "m").unwrap_err();
        let m = classify(429, None, minute.to_string().as_bytes(), "m").unwrap_err();
        assert_eq!(d.kind, "quota_day");
        assert_eq!((m.kind.as_str(), m.retry_after_secs), ("rate", Some(17)));
        assert_eq!(classify(429, Some("5"), b"{}", "m").unwrap_err().retry_after_secs, Some(5));
        assert!(retry_delay(&d, 0).is_none(), "hết lượt ngày ⇒ không thử lại");
    }

    #[test]
    fn thu_lai_co_gioi_han() {
        let mut e = err("rate", ""); e.retry_after_secs = Some(999);
        assert_eq!(retry_delay(&e, 0), Some(Duration::from_secs(MAX_WAIT_SECS)));
        assert_eq!(retry_delay(&err("overloaded", ""), 1), Some(Duration::from_secs(4)));
        assert!(retry_delay(&err("overloaded", ""), MAX_RETRIES).is_none(), "tối đa 2 lần thử lại");
        for k in ["bad_key", "forbidden", "timeout", "blocked", "bad_request"] { assert!(retry_delay(&err(k, ""), 0).is_none(), "{k}"); }
    }

    #[test]
    fn loi_khong_lo_noi_dung_tho() {
        let leak = json!({"error":{"message":"API key not valid AIzaSECRET123"}});
        let e = classify(400, None, leak.to_string().as_bytes(), "m").unwrap_err();
        assert!(!e.message.contains("AIza"), "thông báo lỗi không chép thân lỗi thô của Google");
    }
}

#[cfg(test)]
mod ho_so {
    use super::*;

    #[test]
    fn ten_muc_khoa_cu_khong_doi() {
        assert_eq!(key_user("legacy"), "gemini-api-key", "khoá của beta.27 phải còn đọc được sau khi nâng cấp");
        assert_eq!(key_user("p3"), "gemini-key-p3");
    }

    #[test]
    fn chi_nhan_ho_so_hop_le() {
        for ok in ["legacy", "p1", "p2", "p3", "p4", "p5"] { assert!(valid_profile(ok), "{ok}"); }
        for bad in ["", "p0", "p6", "P1", "p1 ", "../p1", "gemini-api-key", "legacy2"] { assert!(!valid_profile(bad), "{bad}"); }
        assert_eq!(entry("svc", "p6").err().unwrap().kind, "bad_request");
    }

    #[test]
    fn tep_ho_so_khong_chua_khoa() {
        assert!(profiles_valid(br#"{"v":1,"active":"p1","profiles":[{"id":"p1","name":"A","enabled":true}]}"#));
        assert!(!profiles_valid(b"[]"));
        assert!(!profiles_valid(b"khong phai json"));
        assert!(!profiles_valid(br#"{"v":1,"name":"AIzaSyA1234567890abcdefghijklmnopqrstuv"}"#), "chuỗi giống khoá API bị từ chối");
        assert!(!profiles_valid(&vec![b' '; 70_000]));
    }

    #[test]
    fn yeu_cau_cu_khong_co_ho_so_van_doc_duoc() {
        let r: AiRequest = serde_json::from_str(r#"{"provider":"gemini","model":"gemini-3.8-flash","system":"S","user":"U"}"#).unwrap();
        assert!(r.profile_id.is_none(), "bản cũ không gửi profileId ⇒ dùng khoá legacy");
    }
}

#[cfg(test)]
mod kho_khoa_that {
    // Chạy tay trên Windows: cargo test --lib -- --ignored kho_khoa_that  (dùng mục thử riêng, xoá ngay sau khi xong)
    #[test]
    #[ignore]
    fn ghi_doc_xoa_khoa_trong_kho_mat_khau_windows() {
        let svc = "vn.hedu.app.kiemthu.ai";
        for p in ["legacy", "p1"] {
            super::key_clear(svc, p).unwrap();
            assert_eq!(super::key_get(svc, p).unwrap(), None);
        }
        super::key_set(svc, "legacy", "  KHOA-THU-0123456789  ").unwrap();
        super::key_set(svc, "p1", "KHOA-THU-HO-SO-MOT-99").unwrap();
        assert_eq!(super::key_get(svc, "legacy").unwrap().as_deref(), Some("KHOA-THU-0123456789"), "bỏ khoảng trắng hai đầu");
        assert_eq!(super::key_get(svc, "p1").unwrap().as_deref(), Some("KHOA-THU-HO-SO-MOT-99"), "hồ sơ khác nhau không đè nhau");
        assert_eq!(super::key_set(svc, "legacy", "sai").unwrap_err().kind, "bad_key");
        assert_eq!(super::key_get(svc, "p9").unwrap_err().kind, "bad_request");
        super::key_clear(svc, "p1").unwrap();
        assert_eq!(super::key_get(svc, "legacy").unwrap().as_deref(), Some("KHOA-THU-0123456789"), "xoá p1 không đụng khoá cũ");
        for p in ["legacy", "p1"] {
            super::key_clear(svc, p).unwrap();
            assert_eq!(super::key_get(svc, p).unwrap(), None);
            super::key_clear(svc, p).unwrap();
        }
    }
}
