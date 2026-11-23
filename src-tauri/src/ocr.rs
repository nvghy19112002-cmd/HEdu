// Đọc đề bằng Gemini (Studio, Đợt 1a): MỖI TRANG MỘT LƯỢT, chạy song song có giới hạn.
// Giao diện tự dựng ảnh trang (pdf.js, ~200 dpi) và gửi base64 + prompt + khuôn JSON; lớp này chỉ lo:
//   - kiểm kích thước/định dạng ảnh, dựng yêu cầu có ảnh (inline_data);
//   - hàng đợi: tối đa `parallel` lượt cùng lúc, cách nhau ít nhất `min_gap_ms` (hạn mức tính theo PROJECT,
//     nhiều khoá cùng project không nhanh hơn ⇒ không xoay khoá);
//   - quá nhịp/quá tải: chờ theo gợi ý của Google rồi thử lại; hết lượt trong NGÀY: dừng cả lượt, giữ trang đã đọc;
//   - huỷ giữa chừng; báo tiến độ qua Channel theo thứ tự.
// Nội dung trang là DỮ LIỆU, không phải lệnh: prompt hệ thống do giao diện gửi phải nói rõ điều này.
use crate::ai::{self, AiError, AiReply};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub const MAX_IMAGE_B64: usize = 7_000_000; // ~5 MB ảnh; trang 200 dpi PNG thường < 2 MB
pub const MAX_PAGES: usize = 300;
const MAX_PARALLEL: usize = 4;
const OCR_RETRIES: u32 = 5;
const OCR_MAX_WAIT_SECS: u64 = 90;

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OcrPage {
    /// mã trang do giao diện đặt (vd "de1.pdf#3"), trả lại nguyên trong sự kiện
    pub id: String,
    /// image/png | image/jpeg | image/webp
    pub mime: String,
    pub data_b64: String,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OcrJob {
    pub job_id: String,
    pub model: String,
    pub system: String,
    /// lời nhắn kèm mỗi trang (đặt SAU ảnh, theo khuyến nghị của Google)
    pub user: String,
    pub schema: Option<Value>,
    pub pages: Vec<OcrPage>,
    #[serde(default)]
    pub thinking_level: Option<String>,
    #[serde(default)]
    pub profile_id: Option<String>,
    /// số lượt cùng lúc (1..4), mặc định 2
    #[serde(default)]
    pub parallel: Option<usize>,
    /// khoảng cách tối thiểu giữa hai lần bắt đầu gọi (ms), mặc định 4000 ≈ 15 lượt/phút
    #[serde(default)]
    pub min_gap_ms: Option<u64>,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum OcrEvent {
    Started { page_id: String },
    Waiting { page_id: String, secs: u64, reason: String },
    Done { page_id: String, reply: AiReply },
    Failed { page_id: String, error: AiError },
    Finished { done: usize, failed: usize, cancelled: bool, stopped_reason: Option<String> },
}

fn err(kind: &str, m: &str) -> AiError { AiError { kind: kind.into(), message: m.into(), retry_after_secs: None } }

pub fn valid_b64(s: &str) -> bool {
    !s.is_empty() && s.len() % 4 == 0
        && s.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'+' || c == b'/' || c == b'=')
}

/// Kiểm cả lượt TRƯỚC khi gọi mạng: sai thì không gửi trang nào.
pub fn validate(job: &OcrJob) -> Result<(), AiError> {
    if job.pages.is_empty() { return Err(err("bad_request", "Chưa có trang nào để đọc.")); }
    if job.pages.len() > MAX_PAGES { return Err(err("too_large", "Quá nhiều trang trong một lượt — hãy chia nhỏ.")); }
    if job.job_id.is_empty() || job.job_id.len() > 64 { return Err(err("bad_request", "Mã lượt không hợp lệ.")); }
    for p in &job.pages {
        if !matches!(p.mime.as_str(), "image/png" | "image/jpeg" | "image/webp") { return Err(err("bad_request", "Chỉ nhận ảnh PNG, JPEG, WebP.")); }
        if p.data_b64.len() > MAX_IMAGE_B64 { return Err(err("too_large", "Ảnh một trang quá lớn — hãy giảm độ phân giải.")); }
        if !valid_b64(&p.data_b64) { return Err(err("bad_request", "Dữ liệu ảnh hỏng.")); }
    }
    Ok(())
}

/// Thân yêu cầu cho MỘT trang: dựng như nhiệm vụ chữ thường rồi chèn ảnh TRƯỚC lời nhắn.
pub fn page_body(job: &OcrJob, page: &OcrPage) -> Result<Value, AiError> {
    let req = ai::AiRequest {
        provider: "gemini".into(), model: job.model.clone(), system: job.system.clone(), user: job.user.clone(),
        schema: job.schema.clone(), max_output_tokens: Some(16_384), timeout_secs: None,
        thinking_level: job.thinking_level.clone(), profile_id: job.profile_id.clone(),
    };
    let mut body = ai::build_body(&req)?;
    let parts = body["contents"][0]["parts"].as_array_mut().ok_or_else(|| err("bad_request", "Yêu cầu hỏng."))?;
    parts.insert(0, json!({ "inline_data": { "mime_type": page.mime, "data": page.data_b64 } }));
    body["generationConfig"]["temperature"] = json!(0);
    Ok(body)
}

/// Đọc trang có thử lại riêng của OCR (chờ lâu hơn nhiệm vụ chữ, vì cả lượt có thể vài chục trang).
pub fn retry_delay(e: &AiError, attempt: u32) -> Option<Duration> {
    if attempt >= OCR_RETRIES || !(e.kind == "rate" || e.kind == "overloaded" || e.kind == "network") { return None; }
    let s = e.retry_after_secs.unwrap_or(4u64 << attempt).clamp(1, OCR_MAX_WAIT_SECS);
    Some(Duration::from_secs(s))
}

/// Hết lượt trong ngày hoặc khoá hỏng ⇒ các trang sau cũng sẽ hỏng: dừng cả lượt.
pub fn stops_job(e: &AiError) -> bool { matches!(e.kind.as_str(), "quota_day" | "bad_key" | "no_key" | "forbidden") }

/// Lượt đang chạy (để huỷ).
#[derive(Default)]
pub struct Jobs(pub Mutex<HashMap<String, Arc<AtomicBool>>>);

pub fn cancel(jobs: &Jobs, id: &str) -> bool {
    jobs.0.lock().map(|m| m.get(id).map(|f| f.store(true, Ordering::SeqCst)).is_some()).unwrap_or(false)
}

/// Chạy cả lượt. `send` gửi một thân yêu cầu (tách ra để kiểm thử không cần mạng).
pub async fn run_job<S, F, E>(job: OcrJob, stop: Arc<AtomicBool>, send: S, emit: E) -> OcrEvent
where
    S: Fn(Value) -> F + Send + Sync + 'static,
    F: std::future::Future<Output = Result<AiReply, AiError>> + Send,
    E: Fn(OcrEvent) + Send + Sync + 'static,
{
    let parallel = job.parallel.unwrap_or(2).clamp(1, MAX_PARALLEL);
    let gap = Duration::from_millis(job.min_gap_ms.unwrap_or(4000).min(60_000));
    let sem = Arc::new(tokio::sync::Semaphore::new(parallel));
    let send = Arc::new(send);
    let emit = Arc::new(emit);
    let stopped: Arc<Mutex<Option<String>>> = Arc::default();
    let (mut done, mut failed) = (0usize, 0usize);
    let mut tasks = Vec::new();
    for (i, page) in job.pages.iter().cloned().enumerate() {
        if stop.load(Ordering::SeqCst) { break; }
        let permit = sem.clone().acquire_owned().await.expect("semaphore");
        if stop.load(Ordering::SeqCst) { break; }
        if i > 0 && !gap.is_zero() { tokio::time::sleep(gap).await; }
        let body = match page_body(&job, &page) { Ok(b) => b, Err(e) => { emit(OcrEvent::Failed { page_id: page.id, error: e }); failed += 1; continue; } };
        let (send, emit, stop, stopped) = (send.clone(), emit.clone(), stop.clone(), stopped.clone());
        tasks.push(tokio::spawn(async move {
            let _permit = permit;
            emit(OcrEvent::Started { page_id: page.id.clone() });
            let mut attempt = 0;
            loop {
                if stop.load(Ordering::SeqCst) { return None; }
                match send(body.clone()).await {
                    Ok(reply) => { emit(OcrEvent::Done { page_id: page.id, reply }); return Some(true); }
                    Err(e) => match retry_delay(&e, attempt) {
                        Some(d) => {
                            emit(OcrEvent::Waiting { page_id: page.id.clone(), secs: d.as_secs(), reason: e.kind.clone() });
                            tokio::time::sleep(d).await;
                            attempt += 1;
                        }
                        None => {
                            if stops_job(&e) {
                                stop.store(true, Ordering::SeqCst);
                                stopped.lock().unwrap().get_or_insert_with(|| e.message.clone());
                            }
                            emit(OcrEvent::Failed { page_id: page.id, error: e });
                            return Some(false);
                        }
                    },
                }
            }
        }));
    }
    for t in tasks {
        match t.await { Ok(Some(true)) => done += 1, Ok(Some(false)) | Err(_) => failed += 1, Ok(None) => {} }
    }
    let stopped_reason = stopped.lock().unwrap().clone();
    OcrEvent::Finished { done, failed, cancelled: stopped_reason.is_none() && stop.load(Ordering::SeqCst), stopped_reason }
}

/// Gửi thật (dùng khoá trong Credential Manager, cùng địa chỉ cố định với ai.rs).
pub async fn send_real(service: String, profile: String, model: String, body: Value) -> Result<AiReply, AiError> {
    ai::send_once(&service, &profile, &model, &body, Duration::from_secs(180)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;

    fn page(id: &str) -> OcrPage { OcrPage { id: id.into(), mime: "image/png".into(), data_b64: "iVBORw0KGgo=".into() } }
    fn job(n: usize) -> OcrJob {
        OcrJob { job_id: "j1".into(), model: "gemini-3.8-flash".into(), system: "S".into(), user: "U".into(), schema: Some(json!({"type":"object"})),
            pages: (0..n).map(|i| page(&format!("p{i}"))).collect(), thinking_level: Some("low".into()), profile_id: None, parallel: Some(2), min_gap_ms: Some(0) }
    }
    fn reply() -> AiReply { AiReply { text: "{}".into(), finish: "STOP".into(), prompt_tokens: 1, output_tokens: 1, model: "m".into() } }

    #[test]
    fn kiem_dau_vao() {
        assert!(validate(&job(3)).is_ok());
        assert_eq!(validate(&job(0)).unwrap_err().kind, "bad_request");
        let mut j = job(1); j.pages[0].mime = "application/pdf".into(); assert_eq!(validate(&j).unwrap_err().kind, "bad_request");
        let mut j = job(1); j.pages[0].data_b64 = "abc".into(); assert_eq!(validate(&j).unwrap_err().kind, "bad_request");
        let mut j = job(1); j.pages[0].data_b64 = "A".repeat(MAX_IMAGE_B64 + 4); assert_eq!(validate(&j).unwrap_err().kind, "too_large");
        assert_eq!(validate(&job(MAX_PAGES + 1)).unwrap_err().kind, "too_large");
    }

    #[test]
    fn than_yeu_cau_co_anh_truoc_loi_nhan() {
        let b = page_body(&job(1), &page("x")).unwrap();
        let parts = b["contents"][0]["parts"].as_array().unwrap();
        assert_eq!(parts[0]["inline_data"]["mime_type"], "image/png");
        assert_eq!(parts[1]["text"], "U");
        assert_eq!(b["generationConfig"]["temperature"], 0);
        assert_eq!(b["generationConfig"]["thinkingConfig"]["thinkingLevel"], "low");
    }

    #[test]
    fn thu_lai_va_dung_ca_luot() {
        let e = |k: &str| err(k, "");
        assert!(retry_delay(&e("rate"), 0).is_some() && retry_delay(&e("network"), 4).is_some() && retry_delay(&e("rate"), 5).is_none());
        assert!(retry_delay(&e("quota_day"), 0).is_none());
        let mut r = e("rate"); r.retry_after_secs = Some(500); assert_eq!(retry_delay(&r, 0), Some(Duration::from_secs(OCR_MAX_WAIT_SECS)));
        assert!(stops_job(&e("quota_day")) && stops_job(&e("bad_key")) && !stops_job(&e("rate")));
    }

    fn collect() -> (Arc<Mutex<Vec<OcrEvent>>>, impl Fn(OcrEvent) + Send + Sync + 'static) {
        let v: Arc<Mutex<Vec<OcrEvent>>> = Arc::default();
        let w = v.clone();
        (v, move |e| w.lock().unwrap().push(e))
    }

    #[tokio::test(start_paused = true)]
    async fn doc_du_trang_va_gioi_han_song_song() {
        let live = Arc::new(AtomicUsize::new(0)); let peak = Arc::new(AtomicUsize::new(0));
        let (l, p) = (live.clone(), peak.clone());
        let send = move |_b: Value| { let (l, p) = (l.clone(), p.clone()); async move {
            let n = l.fetch_add(1, Ordering::SeqCst) + 1; p.fetch_max(n, Ordering::SeqCst);
            tokio::time::sleep(Duration::from_millis(50)).await; l.fetch_sub(1, Ordering::SeqCst); Ok(reply()) } };
        let (ev, emit) = collect();
        let fin = run_job(job(7), Arc::default(), send, emit).await;
        assert_eq!(fin, OcrEvent::Finished { done: 7, failed: 0, cancelled: false, stopped_reason: None });
        assert!(peak.load(Ordering::SeqCst) <= 2, "không vượt số lượt song song");
        assert_eq!(ev.lock().unwrap().iter().filter(|e| matches!(e, OcrEvent::Done { .. })).count(), 7);
    }

    #[tokio::test(start_paused = true)]
    async fn qua_nhip_thi_cho_roi_thu_lai() {
        let calls = Arc::new(AtomicUsize::new(0)); let c = calls.clone();
        let send = move |_b: Value| { let c = c.clone(); async move {
            if c.fetch_add(1, Ordering::SeqCst) == 0 { let mut e = err("rate", "chậm lại"); e.retry_after_secs = Some(30); Err(e) } else { Ok(reply()) } } };
        let (ev, emit) = collect();
        let fin = run_job(job(1), Arc::default(), send, emit).await;
        assert!(matches!(fin, OcrEvent::Finished { done: 1, failed: 0, .. }));
        assert!(ev.lock().unwrap().iter().any(|e| matches!(e, OcrEvent::Waiting { secs: 30, .. })));
    }

    #[tokio::test(start_paused = true)]
    async fn het_luot_ngay_dung_ca_luot_giu_trang_da_doc() {
        let calls = Arc::new(AtomicUsize::new(0)); let c = calls.clone();
        let send = move |_b: Value| { let c = c.clone(); async move {
            if c.fetch_add(1, Ordering::SeqCst) < 2 { Ok(reply()) } else { Err(err("quota_day", "hết lượt")) } } };
        let (_ev, emit) = collect();
        let mut j = job(10); j.parallel = Some(1);
        let fin = run_job(j, Arc::default(), send, emit).await;
        assert_eq!(fin, OcrEvent::Finished { done: 2, failed: 1, cancelled: false, stopped_reason: Some("hết lượt".into()) });
        assert_eq!(calls.load(Ordering::SeqCst), 3, "không gọi thêm sau khi hết lượt");
    }

    #[tokio::test(start_paused = true)]
    async fn huy_giua_chung() {
        let stop: Arc<AtomicBool> = Arc::default(); let s2 = stop.clone();
        let calls = Arc::new(AtomicUsize::new(0)); let c = calls.clone();
        let send = move |_b: Value| { let (c, s) = (c.clone(), s2.clone()); async move {
            if c.fetch_add(1, Ordering::SeqCst) == 1 { s.store(true, Ordering::SeqCst); } Ok(reply()) } };
        let (_ev, emit) = collect();
        let mut j = job(10); j.parallel = Some(1);
        let fin = run_job(j, stop, send, emit).await;
        assert!(matches!(fin, OcrEvent::Finished { cancelled: true, stopped_reason: None, .. }));
        assert!(calls.load(Ordering::SeqCst) < 10);
        let jobs = Jobs::default(); jobs.0.lock().unwrap().insert("a".into(), Arc::default());
        assert!(cancel(&jobs, "a") && !cancel(&jobs, "b"));
    }
}
