//! Kho hình TikZ (giai đoạn 1: lưu trữ và nạp). Tệp riêng `<dữ liệu app>/kho-hinh/kho-hinh.db`.
//! KHÔNG đụng hedu.db, schema 3, ID6, UID. Kho này chỉ nằm trên máy (nguồn MathHub), không đóng vào bản cài và không đưa vào repo.
//! Nạp = đọc CHỈ ĐỌC một tệp kho MathHub (`tikz_nodes`, `tikz_items`), chép sang CSDL riêng theo lô; nạp lại không ghi đè hình đã có.
#![allow(dead_code)]

use rusqlite::types::Value;
use rusqlite::{params, params_from_iter, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

pub const FORMAT: &str = "1";
const BATCH: usize = 1000;
const MAX_CODE: usize = 200_000;
const MAX_LIMIT: i64 = 200;

/// Chỉ một lượt nạp tại một thời điểm.
static NAP_GATE: Mutex<()> = Mutex::new(());

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS node(id TEXT PRIMARY KEY, parent_id TEXT, name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS item(
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  title TEXT NOT NULL,
  code TEXT NOT NULL,
  extra_preamble TEXT NOT NULL DEFAULT '',
  grades TEXT NOT NULL DEFAULT '',
  topics TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'khac',
  source_key TEXT NOT NULL DEFAULT '',
  code_hash TEXT NOT NULL,
  search TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'chua',
  err TEXT NOT NULL DEFAULT '',
  edited INTEGER NOT NULL DEFAULT 0,
  nguon TEXT NOT NULL DEFAULT 'mathhub',
  da_xoa INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS item_xoa ON item(da_xoa);
CREATE UNIQUE INDEX IF NOT EXISTS item_hash ON item(code_hash);
CREATE INDEX IF NOT EXISTS item_node ON item(node_id);
CREATE INDEX IF NOT EXISTS item_kind ON item(kind);
";

pub fn now_secs() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

// ---------- chữ không dấu (tìm kiếm) ----------

const VN: &[(&str, char)] = &[
    ("àáạảãâầấậẩẫăằắặẳẵ", 'a'),
    ("èéẹẻẽêềếệểễ", 'e'),
    ("ìíịỉĩ", 'i'),
    ("òóọỏõôồốộổỗơờớợởỡ", 'o'),
    ("ùúụủũưừứựửữ", 'u'),
    ("ỳýỵỷỹ", 'y'),
    ("đ", 'd'),
];

/// Chữ thường, bỏ dấu tiếng Việt (cả dạng dựng sẵn lẫn dấu rời), gom khoảng trắng.
pub fn fold(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut sp = true;
    for c in s.chars().flat_map(|c| c.to_lowercase()) {
        if ('\u{0300}'..='\u{036f}').contains(&c) {
            continue;
        }
        let c = VN.iter().find(|(set, _)| set.contains(c)).map(|(_, b)| *b).unwrap_or(c);
        if c.is_whitespace() {
            if !sp {
                out.push(' ');
            }
            sp = true;
        } else {
            out.push(c);
            sp = false;
        }
    }
    while out.ends_with(' ') {
        out.pop();
    }
    out
}

// ---------- phân loại và dấu vân ----------

/// Loại hình theo mã (cùng quy tắc với bản quét kho): bbt, 3d, do-thi, tkz-euclide, khac.
pub fn kind_of(code: &str) -> &'static str {
    if code.contains("tkzTab") {
        return "bbt";
    }
    if code.contains("tdplot") || code.contains("canvas is") {
        return "3d";
    }
    if code.contains("\\begin{axis}") || code.contains("\\addplot") || code.contains("plot[") || code.contains("domain=") || has_plot_call(code) {
        return "do-thi";
    }
    if code.contains("\\tkz") {
        return "tkz-euclide";
    }
    "khac"
}

fn has_plot_call(code: &str) -> bool {
    let mut from = 0;
    while let Some(p) = code[from..].find("plot") {
        let i = from + p + 4;
        if code[i..].trim_start().starts_with('(') {
            return true;
        }
        from = i;
    }
    false
}

/// Dấu vân mã: bỏ chú thích `%` (không thoát) và mọi khoảng trắng, nên hai bản chỉ khác khoảng trắng/chú thích là một.
pub fn code_hash(code: &str) -> String {
    let mut h = Sha256::new();
    for line in code.lines() {
        let mut esc = false;
        for ch in line.chars() {
            if esc {
                esc = false;
                if !ch.is_whitespace() {
                    let mut b = [0u8; 4];
                    h.update(ch.encode_utf8(&mut b).as_bytes());
                }
                continue;
            }
            if ch == '\\' {
                esc = true;
                h.update(b"\\");
                continue;
            }
            if ch == '%' {
                break;
            }
            if !ch.is_whitespace() {
                let mut b = [0u8; 4];
                h.update(ch.encode_utf8(&mut b).as_bytes());
            }
        }
    }
    format!("{:x}", h.finalize())
}

// ---------- mở CSDL ----------

pub fn open(dest: &Path) -> Result<Connection, String> {
    if let Some(dir) = dest.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("Không tạo được thư mục kho hình: {e}"))?;
    }
    let c = Connection::open(dest).map_err(|e| format!("Không mở được kho hình: {e}"))?;
    c.busy_timeout(std::time::Duration::from_secs(5)).ok();
    c.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;").map_err(|e| e.to_string())?;
    c.execute_batch(SCHEMA).map_err(|e| format!("Không tạo được bảng kho hình: {e}"))?;
    c.execute("INSERT OR IGNORE INTO meta(key,value) VALUES('format',?1)", params![FORMAT]).map_err(|e| e.to_string())?;
    Ok(c)
}

fn open_existing(dest: &Path) -> Result<Option<Connection>, String> {
    if !dest.is_file() {
        return Ok(None);
    }
    open(dest).map(Some)
}

// ---------- nạp từ kho MathHub ----------

#[derive(Serialize, Debug, Default, Clone, PartialEq)]
pub struct NapOut {
    pub tong: usize,
    pub moi: usize,
    pub da_co: usize,
    pub trung: usize,
    pub loi: usize,
    pub nut: usize,
    pub ms: u64,
}

fn path_key(p: &Path) -> String {
    std::fs::canonicalize(p).map(|c| c.to_string_lossy().to_lowercase()).unwrap_or_else(|_| p.to_string_lossy().to_lowercase())
}

/// Đọc CHỈ ĐỌC `src` (tệp kho MathHub) và chép vào `dest` theo lô. `progress(đã_xử_lý, tổng)` gọi sau mỗi lô.
pub fn nap(dest: &Path, src: &Path, mut progress: impl FnMut(usize, usize)) -> Result<NapOut, String> {
    let t0 = Instant::now();
    if !src.is_file() {
        return Err("Không thấy tệp kho hình để nạp.".into());
    }
    if dest.is_file() && path_key(dest) == path_key(src) {
        return Err("Không thể nạp kho hình từ chính tệp kho của HEdu.".into());
    }
    let s = Connection::open_with_flags(src, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX)
        .map_err(|e| format!("Không mở được tệp kho hình nguồn: {e}"))?;
    let total: i64 = s
        .query_row("SELECT COUNT(*) FROM tikz_items", [], |r| r.get(0))
        .map_err(|_| "Tệp này không phải kho hình MathHub (thiếu bảng tikz_items).".to_string())?;
    let mut nodes: Vec<(String, Option<String>, String, i64)> = Vec::new();
    {
        let mut q = s.prepare("SELECT id, parent_id, name, sort_order FROM tikz_nodes").map_err(|_| "Tệp này không phải kho hình MathHub (thiếu bảng tikz_nodes).".to_string())?;
        let it = q.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))).map_err(|e| e.to_string())?;
        for x in it {
            nodes.push(x.map_err(|e| e.to_string())?);
        }
    }
    let by_id: HashMap<&str, (&Option<String>, &str)> = nodes.iter().map(|(id, p, n, _)| (id.as_str(), (p, n.as_str()))).collect();
    let trail = |id: &str| -> String {
        let mut parts: Vec<&str> = Vec::new();
        let mut cur = Some(id);
        let mut guard = 0;
        while let Some(c) = cur {
            guard += 1;
            if guard > 16 {
                break;
            }
            match by_id.get(c) {
                Some((p, n)) => {
                    parts.push(n);
                    cur = p.as_deref();
                }
                None => break,
            }
        }
        parts.reverse();
        parts.join(" ")
    };

    let mut d = open(dest)?;
    let mut out = NapOut { tong: total as usize, nut: nodes.len(), ..Default::default() };
    {
        let tx = d.transaction().map_err(|e| e.to_string())?;
        for (id, p, n, o) in &nodes {
            tx.execute("INSERT OR REPLACE INTO node(id,parent_id,name,sort) VALUES(?1,?2,?3,?4)", params![id, p, n, o]).map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
    }

    let mut q = s
        .prepare("SELECT id, node_id, title, code, extra_preamble, grades, topics, source_key, created_at, updated_at FROM tikz_items ORDER BY rowid")
        .map_err(|e| e.to_string())?;
    let mut rows = q.query([]).map_err(|e| e.to_string())?;
    let mut done = 0usize;
    let mut tx = d.transaction().map_err(|e| e.to_string())?;
    let mut in_batch = 0usize;
    while let Some(r) = rows.next().map_err(|e| e.to_string())? {
        done += 1;
        let id: String = r.get(0).map_err(|e| e.to_string())?;
        let node_id: String = r.get(1).map_err(|e| e.to_string())?;
        let title: String = r.get(2).map_err(|e| e.to_string())?;
        let code_raw: String = r.get(3).map_err(|e| e.to_string())?;
        let extra: String = r.get(4).map_err(|e| e.to_string())?;
        let grades: String = r.get(5).map_err(|e| e.to_string())?;
        let topics: String = r.get(6).map_err(|e| e.to_string())?;
        let source_key: String = r.get(7).map_err(|e| e.to_string())?;
        let created: String = r.get(8).unwrap_or_default();
        let updated: String = r.get(9).unwrap_or_default();
        let code = code_raw.replace("\r\n", "\n").replace('\r', "\n");
        if code.trim().is_empty() || code.len() > MAX_CODE {
            out.loi += 1;
        } else {
            let exists: bool = tx.query_row("SELECT 1 FROM item WHERE id=?1", params![id], |_| Ok(true)).unwrap_or(false);
            if exists {
                out.da_co += 1;
            } else {
                let search = fold(&format!("{} {} {}", title, topics, trail(&node_id)));
                let n = tx
                    .execute(
                        "INSERT OR IGNORE INTO item(id,node_id,title,code,extra_preamble,grades,topics,kind,source_key,code_hash,search,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
                        params![id, node_id, title, code, extra, grades, topics, kind_of(&code), source_key, code_hash(&code), search, created, updated],
                    )
                    .map_err(|e| e.to_string())?;
                if n == 1 {
                    out.moi += 1;
                } else {
                    out.trung += 1;
                }
            }
        }
        in_batch += 1;
        if in_batch >= BATCH {
            tx.commit().map_err(|e| e.to_string())?;
            tx = d.transaction().map_err(|e| e.to_string())?;
            in_batch = 0;
            progress(done, total as usize);
        }
    }
    tx.execute("INSERT OR REPLACE INTO meta(key,value) VALUES('nguon','mathhub')", []).map_err(|e| e.to_string())?;
    tx.execute("INSERT OR REPLACE INTO meta(key,value) VALUES('nap_luc',?1)", params![now_secs().to_string()]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    progress(done, total as usize);
    out.ms = t0.elapsed().as_millis() as u64;
    Ok(out)
}

// ---------- đọc ----------

#[derive(Serialize, Debug, Default, Clone, PartialEq)]
pub struct TrangThai {
    pub co: bool,
    pub hinh: i64,
    /// số hình đã xoá (còn khôi phục được)
    pub thung_rac: i64,
    pub nut: i64,
    pub nap_luc: Option<i64>,
    pub kich_thuoc: u64,
}

pub fn trang_thai(dest: &Path) -> Result<TrangThai, String> {
    let Some(c) = open_existing(dest)? else { return Ok(TrangThai::default()) };
    let hinh: i64 = c.query_row("SELECT COUNT(*) FROM item WHERE da_xoa=0", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    let thung_rac: i64 = c.query_row("SELECT COUNT(*) FROM item WHERE da_xoa=1", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    let nut: i64 = c.query_row("SELECT COUNT(*) FROM node", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    let nap_luc: Option<i64> = c.query_row("SELECT value FROM meta WHERE key='nap_luc'", [], |r| r.get::<_, String>(0)).ok().and_then(|v| v.parse().ok());
    let kich_thuoc = std::fs::metadata(dest).map(|m| m.len()).unwrap_or(0);
    Ok(TrangThai { co: hinh > 0 || nut > 0 || thung_rac > 0, hinh, thung_rac, nut, nap_luc, kich_thuoc })
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Nut {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub sort: i64,
    /// số hình trong cả nhánh (kể cả các mục con)
    pub dem: i64,
}

pub fn cay(dest: &Path) -> Result<Vec<Nut>, String> {
    let Some(c) = open_existing(dest)? else { return Ok(vec![]) };
    let mut own: HashMap<String, i64> = HashMap::new();
    {
        let mut q = c.prepare("SELECT node_id, COUNT(*) FROM item WHERE da_xoa=0 GROUP BY node_id").map_err(|e| e.to_string())?;
        let it = q.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))).map_err(|e| e.to_string())?;
        for x in it {
            let (k, v) = x.map_err(|e| e.to_string())?;
            own.insert(k, v);
        }
    }
    let mut ns: Vec<Nut> = Vec::new();
    {
        let mut q = c.prepare("SELECT id, parent_id, name, sort FROM node ORDER BY sort, name").map_err(|e| e.to_string())?;
        let it = q.query_map([], |r| Ok(Nut { id: r.get(0)?, parent_id: r.get(1)?, name: r.get(2)?, sort: r.get(3)?, dem: 0 })).map_err(|e| e.to_string())?;
        for x in it {
            ns.push(x.map_err(|e| e.to_string())?);
        }
    }
    let parent: HashMap<String, Option<String>> = ns.iter().map(|n| (n.id.clone(), n.parent_id.clone())).collect();
    let mut total: HashMap<String, i64> = HashMap::new();
    for (id, k) in &own {
        let mut cur = Some(id.clone());
        let mut guard = 0;
        while let Some(x) = cur {
            guard += 1;
            if guard > 32 {
                break;
            }
            *total.entry(x.clone()).or_insert(0) += k;
            cur = parent.get(&x).cloned().flatten();
        }
    }
    for n in &mut ns {
        n.dem = total.get(&n.id).copied().unwrap_or(0);
    }
    Ok(ns)
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Muc {
    pub id: String,
    pub title: String,
    pub node_id: String,
    pub grades: String,
    pub kind: String,
    pub status: String,
    pub code_len: i64,
}

#[derive(Serialize, Debug, Default, Clone, PartialEq)]
pub struct KetQua {
    pub tong: i64,
    pub muc: Vec<Muc>,
}

fn like_escape(t: &str) -> String {
    t.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")
}

/// Tìm theo chữ (không dấu, mọi từ phải khớp), mục cây (cả nhánh con), loại, lớp, trạng thái dịch.
pub fn tim(dest: &Path, q: &str, node: Option<&str>, kind: Option<&str>, lop: Option<&str>, status: Option<&str>, thung_rac: bool, offset: i64, limit: i64) -> Result<KetQua, String> {
    let Some(c) = open_existing(dest)? else { return Ok(KetQua::default()) };
    let mut wh: Vec<String> = vec![format!("i.da_xoa = {}", if thung_rac { 1 } else { 0 })];
    let mut ps: Vec<Value> = Vec::new();
    for term in fold(q).split_whitespace() {
        ps.push(Value::Text(format!("%{}%", like_escape(term))));
        wh.push(format!("i.search LIKE ?{} ESCAPE '\\'", ps.len()));
    }
    let mut cte = String::new();
    if let Some(n) = node.filter(|s| !s.is_empty()) {
        ps.push(Value::Text(n.to_string()));
        cte = format!("WITH RECURSIVE sub(id) AS (SELECT ?{k} UNION ALL SELECT n.id FROM node n JOIN sub s ON n.parent_id = s.id) ", k = ps.len());
        wh.push("i.node_id IN (SELECT id FROM sub)".into());
    }
    if let Some(k) = kind.filter(|s| !s.is_empty()) {
        ps.push(Value::Text(k.to_string()));
        wh.push(format!("i.kind = ?{}", ps.len()));
    }
    if let Some(l) = lop.filter(|s| !s.is_empty()) {
        ps.push(Value::Text(format!("%,{},%", like_escape(l))));
        wh.push(format!("(',' || REPLACE(i.grades, ' ', '') || ',') LIKE ?{} ESCAPE '\\'", ps.len()));
    }
    if let Some(s) = status.filter(|s| !s.is_empty()) {
        ps.push(Value::Text(s.to_string()));
        wh.push(format!("i.status = ?{}", ps.len()));
    }
    let where_sql = if wh.is_empty() { String::new() } else { format!(" WHERE {}", wh.join(" AND ")) };
    let tong: i64 = c.query_row(&format!("{cte}SELECT COUNT(*) FROM item i{where_sql}"), params_from_iter(ps.iter()), |r| r.get(0)).map_err(|e| e.to_string())?;
    let lim = limit.clamp(1, MAX_LIMIT);
    let off = offset.max(0);
    let sql = format!("{cte}SELECT i.id, i.title, i.node_id, i.grades, i.kind, i.status, LENGTH(i.code) FROM item i{where_sql} ORDER BY i.node_id, i.title, i.id LIMIT {lim} OFFSET {off}");
    let mut st = c.prepare(&sql).map_err(|e| e.to_string())?;
    let it = st
        .query_map(params_from_iter(ps.iter()), |r| Ok(Muc { id: r.get(0)?, title: r.get(1)?, node_id: r.get(2)?, grades: r.get(3)?, kind: r.get(4)?, status: r.get(5)?, code_len: r.get(6)? }))
        .map_err(|e| e.to_string())?;
    let mut muc = Vec::new();
    for x in it {
        muc.push(x.map_err(|e| e.to_string())?);
    }
    Ok(KetQua { tong, muc })
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Hinh {
    pub id: String,
    pub node_id: String,
    pub title: String,
    pub code: String,
    pub extra_preamble: String,
    pub grades: String,
    pub topics: String,
    pub kind: String,
    pub source_key: String,
    pub status: String,
    pub err: String,
    pub nguon: String,
    pub edited: bool,
    pub da_xoa: bool,
}

pub fn lay(dest: &Path, id: &str) -> Result<Option<Hinh>, String> {
    let Some(c) = open_existing(dest)? else { return Ok(None) };
    let mut st = c.prepare("SELECT id,node_id,title,code,extra_preamble,grades,topics,kind,source_key,status,err,nguon,edited,da_xoa FROM item WHERE id=?1").map_err(|e| e.to_string())?;
    let mut it = st
        .query_map(params![id], |r| {
            Ok(Hinh {
                id: r.get(0)?,
                node_id: r.get(1)?,
                title: r.get(2)?,
                code: r.get(3)?,
                extra_preamble: r.get(4)?,
                grades: r.get(5)?,
                topics: r.get(6)?,
                kind: r.get(7)?,
                source_key: r.get(8)?,
                status: r.get(9)?,
                err: r.get(10)?,
                nguon: r.get(11)?,
                edited: r.get::<_, i64>(12)? != 0,
                da_xoa: r.get::<_, i64>(13)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;
    match it.next() {
        Some(x) => Ok(Some(x.map_err(|e| e.to_string())?)),
        None => Ok(None),
    }
}

// ---------- thêm, sửa, bớt, tuỳ biến ----------
// Kho là của giáo viên: thêm hình mới, sửa mã/tên/chủ đề/lớp/loại, chuyển mục, xoá vào thùng rác (khôi phục được),
// thêm/đổi tên/chuyển/xoá mục cây. Hình đã sửa hoặc đã xoá KHÔNG bị nạp lại ghi đè hay làm sống lại (nạp bỏ qua id đã có).

pub const KINDS: &[&str] = &["bbt", "3d", "do-thi", "tkz-euclide", "khac"];
const MAX_NAME: usize = 120;
const MAX_TITLE: usize = 200;
const MAX_TEXT: usize = 2000;

static SEQ: AtomicU64 = AtomicU64::new(0);

fn new_id(prefix: &str) -> String {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    format!("{prefix}-{nanos:x}-{:x}", SEQ.fetch_add(1, Ordering::Relaxed))
}

#[derive(Deserialize, Debug, Clone)]
pub struct HinhMoi {
    pub node_id: String,
    pub title: String,
    pub code: String,
    #[serde(default)]
    pub extra_preamble: String,
    #[serde(default)]
    pub grades: String,
    #[serde(default)]
    pub topics: String,
    pub kind: Option<String>,
}

/// Trường nào là Some thì đổi trường đó; None giữ nguyên.
#[derive(Deserialize, Debug, Clone, Default)]
pub struct HinhSua {
    pub node_id: Option<String>,
    pub title: Option<String>,
    pub code: Option<String>,
    pub extra_preamble: Option<String>,
    pub grades: Option<String>,
    pub topics: Option<String>,
    pub kind: Option<String>,
}

fn clean_text(s: &str, max: usize, what: &str) -> Result<String, String> {
    let t = s.trim().to_string();
    if t.chars().count() > max {
        return Err(format!("{what} quá dài (tối đa {max} ký tự)."));
    }
    Ok(t)
}

fn clean_title(s: &str) -> Result<String, String> {
    let t = clean_text(&s.split_whitespace().collect::<Vec<_>>().join(" "), MAX_TITLE, "Tên hình")?;
    if t.is_empty() {
        return Err("Tên hình không được để trống.".into());
    }
    Ok(t)
}

fn clean_code(s: &str) -> Result<String, String> {
    let code = s.replace("\r\n", "\n").replace('\r', "\n");
    if code.trim().is_empty() {
        return Err("Mã hình không được để trống.".into());
    }
    if code.len() > MAX_CODE {
        return Err("Mã hình quá dài.".into());
    }
    Ok(code)
}

fn check_kind(k: &str) -> Result<String, String> {
    if KINDS.contains(&k) {
        Ok(k.to_string())
    } else {
        Err(format!("Loại hình không hợp lệ (chọn một trong: {}).", KINDS.join(", ")))
    }
}

fn node_exists(c: &Connection, id: &str) -> bool {
    c.query_row("SELECT 1 FROM node WHERE id=?1", params![id], |_| Ok(true)).unwrap_or(false)
}

fn trail_of(c: &Connection, id: &str) -> String {
    let mut parts: Vec<String> = Vec::new();
    let mut cur = Some(id.to_string());
    let mut guard = 0;
    while let Some(x) = cur {
        guard += 1;
        if guard > 16 {
            break;
        }
        match c.query_row("SELECT parent_id, name FROM node WHERE id=?1", params![x], |r| Ok((r.get::<_, Option<String>>(0)?, r.get::<_, String>(1)?))) {
            Ok((p, n)) => {
                parts.push(n);
                cur = p;
            }
            Err(_) => break,
        }
    }
    parts.reverse();
    parts.join(" ")
}

fn search_of(c: &Connection, title: &str, topics: &str, node_id: &str) -> String {
    fold(&format!("{} {} {}", title, topics, trail_of(c, node_id)))
}

fn is_unique_violation(e: &rusqlite::Error) -> bool {
    matches!(e.sqlite_error_code(), Some(rusqlite::ErrorCode::ConstraintViolation))
}

/// Thêm một hình do giáo viên tự thêm. Trả về id. Mã trùng một hình đã có (kể cả trong thùng rác) thì báo, không thêm.
pub fn them(dest: &Path, h: &HinhMoi) -> Result<String, String> {
    let title = clean_title(&h.title)?;
    let code = clean_code(&h.code)?;
    let topics = clean_text(&h.topics, MAX_TEXT, "Chủ đề")?;
    let grades = clean_text(&h.grades, 40, "Lớp")?;
    let extra = h.extra_preamble.replace("\r\n", "\n");
    let kind = match h.kind.as_deref().filter(|s| !s.is_empty()) {
        Some(k) => check_kind(k)?,
        None => kind_of(&code).to_string(),
    };
    let c = open(dest)?;
    if !node_exists(&c, &h.node_id) {
        return Err("Mục chứa hình không còn trong kho.".into());
    }
    let hash = code_hash(&code);
    if let Ok((t, x)) = c.query_row("SELECT title, da_xoa FROM item WHERE code_hash=?1", params![hash], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))) {
        return Err(format!("Hình này đã có trong kho: “{t}”{}.", if x == 1 { " (đang ở thùng rác, hãy khôi phục)" } else { "" }));
    }
    let id = new_id("u");
    let now = now_secs().to_string();
    let search = search_of(&c, &title, &topics, &h.node_id);
    c.execute(
        "INSERT INTO item(id,node_id,title,code,extra_preamble,grades,topics,kind,source_key,code_hash,search,nguon,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,'',?9,?10,'nguoi-dung',?11,?11)",
        params![id, h.node_id, title, code, extra, grades, topics, kind, hash, search, now],
    )
    .map_err(|e| if is_unique_violation(&e) { "Hình này đã có trong kho.".to_string() } else { e.to_string() })?;
    Ok(id)
}

/// Sửa một hình. Đổi mã thì tính lại loại, dấu vân và đưa trạng thái dịch về "chưa dịch".
pub fn sua(dest: &Path, id: &str, s: &HinhSua) -> Result<(), String> {
    let c = open(dest)?;
    let cur = lay(dest, id)?.ok_or_else(|| "Không thấy hình này trong kho.".to_string())?;
    let node_id = s.node_id.clone().unwrap_or_else(|| cur.node_id.clone());
    if !node_exists(&c, &node_id) {
        return Err("Mục chứa hình không còn trong kho.".into());
    }
    let title = match &s.title {
        Some(t) => clean_title(t)?,
        None => cur.title.clone(),
    };
    let topics = match &s.topics {
        Some(t) => clean_text(t, MAX_TEXT, "Chủ đề")?,
        None => cur.topics.clone(),
    };
    let grades = match &s.grades {
        Some(g) => clean_text(g, 40, "Lớp")?,
        None => cur.grades.clone(),
    };
    let extra = s.extra_preamble.as_ref().map(|e| e.replace("\r\n", "\n")).unwrap_or_else(|| cur.extra_preamble.clone());
    let code_changed = s.code.as_ref().map(|x| clean_code(x)).transpose()?;
    let (code, hash, mut kind, status, err) = match &code_changed {
        Some(code) if *code != cur.code => (code.clone(), code_hash(code), kind_of(code).to_string(), "chua".to_string(), String::new()),
        _ => (cur.code.clone(), code_hash(&cur.code), cur.kind.clone(), cur.status.clone(), cur.err.clone()),
    };
    if let Some(k) = s.kind.as_deref().filter(|x| !x.is_empty()) {
        kind = check_kind(k)?;
    }
    let search = search_of(&c, &title, &topics, &node_id);
    c.execute(
        "UPDATE item SET node_id=?2,title=?3,code=?4,extra_preamble=?5,grades=?6,topics=?7,kind=?8,code_hash=?9,search=?10,status=?11,err=?12,edited=1,updated_at=?13 WHERE id=?1",
        params![id, node_id, title, code, extra, grades, topics, kind, hash, search, status, err, now_secs().to_string()],
    )
    .map_err(|e| if is_unique_violation(&e) { "Mã hình này trùng với một hình khác trong kho.".to_string() } else { e.to_string() })?;
    Ok(())
}

/// Xoá vào thùng rác (`xoa = true`) hoặc khôi phục (`false`). Trả về số hình đã đổi.
pub fn xoa(dest: &Path, ids: &[String], xoa: bool) -> Result<usize, String> {
    let mut c = open(dest)?;
    let tx = c.transaction().map_err(|e| e.to_string())?;
    let mut n = 0;
    for id in ids {
        n += tx
            .execute("UPDATE item SET da_xoa=?2, updated_at=?3 WHERE id=?1 AND da_xoa<>?2", params![id, if xoa { 1 } else { 0 }, now_secs().to_string()])
            .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(n)
}

/// Các mục thuộc nhánh `root` (kể cả chính nó).
fn subtree(c: &Connection, root: &str) -> Result<Vec<String>, String> {
    let mut st = c
        .prepare("WITH RECURSIVE sub(id) AS (SELECT ?1 UNION ALL SELECT n.id FROM node n JOIN sub s ON n.parent_id = s.id) SELECT id FROM sub")
        .map_err(|e| e.to_string())?;
    let it = st.query_map(params![root], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
    let mut v = Vec::new();
    for x in it {
        v.push(x.map_err(|e| e.to_string())?);
    }
    Ok(v)
}

/// Tên/vị trí mục đổi thì chữ tìm kiếm của mọi hình trong nhánh phải tính lại.
fn lam_moi_search(c: &Connection, root: &str) -> Result<(), String> {
    for nid in subtree(c, root)? {
        let mut st = c.prepare("SELECT id, title, topics FROM item WHERE node_id=?1").map_err(|e| e.to_string())?;
        let rows: Vec<(String, String, String)> = st
            .query_map(params![nid], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<_, _>>()
            .map_err(|e: rusqlite::Error| e.to_string())?;
        for (id, title, topics) in rows {
            let s = search_of(c, &title, &topics, &nid);
            c.execute("UPDATE item SET search=?2 WHERE id=?1", params![id, s]).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn next_sort(c: &Connection, parent: Option<&str>) -> i64 {
    c.query_row("SELECT COALESCE(MAX(sort), -1) + 1 FROM node WHERE parent_id IS ?1", params![parent], |r| r.get(0)).unwrap_or(0)
}

pub fn nut_them(dest: &Path, parent: Option<&str>, name: &str) -> Result<String, String> {
    let name = clean_text(&name.split_whitespace().collect::<Vec<_>>().join(" "), MAX_NAME, "Tên mục")?;
    if name.is_empty() {
        return Err("Tên mục không được để trống.".into());
    }
    let c = open(dest)?;
    if let Some(p) = parent {
        if !node_exists(&c, p) {
            return Err("Mục cha không còn trong kho.".into());
        }
    }
    let id = new_id("un");
    c.execute("INSERT INTO node(id,parent_id,name,sort) VALUES(?1,?2,?3,?4)", params![id, parent, name, next_sort(&c, parent)]).map_err(|e| e.to_string())?;
    Ok(id)
}

pub fn nut_doi_ten(dest: &Path, id: &str, name: &str) -> Result<(), String> {
    let name = clean_text(&name.split_whitespace().collect::<Vec<_>>().join(" "), MAX_NAME, "Tên mục")?;
    if name.is_empty() {
        return Err("Tên mục không được để trống.".into());
    }
    let c = open(dest)?;
    if !node_exists(&c, id) {
        return Err("Không thấy mục này trong kho.".into());
    }
    c.execute("UPDATE node SET name=?2 WHERE id=?1", params![id, name]).map_err(|e| e.to_string())?;
    lam_moi_search(&c, id)
}

/// Chuyển mục `id` (cả nhánh con) vào `moi_cha` (None = gốc). Không cho chuyển vào chính nó hoặc nhánh con của nó.
pub fn nut_chuyen(dest: &Path, id: &str, moi_cha: Option<&str>) -> Result<(), String> {
    let c = open(dest)?;
    if !node_exists(&c, id) {
        return Err("Không thấy mục này trong kho.".into());
    }
    if let Some(p) = moi_cha {
        if !node_exists(&c, p) {
            return Err("Mục đích không còn trong kho.".into());
        }
        if subtree(&c, id)?.iter().any(|x| x == p) {
            return Err("Không thể chuyển một mục vào chính nó hoặc vào mục con của nó.".into());
        }
    }
    c.execute("UPDATE node SET parent_id=?2, sort=?3 WHERE id=?1", params![id, moi_cha, next_sort(&c, moi_cha)]).map_err(|e| e.to_string())?;
    lam_moi_search(&c, id)
}

/// Xoá một mục trống (không còn mục con, không còn hình nào kể cả trong thùng rác). Mục còn nội dung: báo, không xoá.
pub fn nut_xoa(dest: &Path, id: &str) -> Result<(), String> {
    let c = open(dest)?;
    let con: i64 = c.query_row("SELECT COUNT(*) FROM node WHERE parent_id=?1", params![id], |r| r.get(0)).map_err(|e| e.to_string())?;
    let hinh: i64 = c.query_row("SELECT COUNT(*) FROM item WHERE node_id=?1", params![id], |r| r.get(0)).map_err(|e| e.to_string())?;
    if con > 0 || hinh > 0 {
        return Err(format!("Mục còn {con} mục con và {hinh} hình (kể cả trong thùng rác). Hãy chuyển chúng sang mục khác trước khi xoá."));
    }
    let n = c.execute("DELETE FROM node WHERE id=?1", params![id]).map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("Không thấy mục này trong kho.".into());
    }
    Ok(())
}

// ---------- lệnh Tauri ----------

fn dest_of(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map(|d| d.join("kho-hinh").join("kho-hinh.db")).map_err(|e| e.to_string())
}

#[derive(Serialize, Clone)]
struct Tien {
    da: usize,
    tong: usize,
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn kho_hinh_trang_thai(app: AppHandle) -> Result<TrangThai, String> {
    let d = dest_of(&app)?;
    blocking(move || trang_thai(&d)).await
}

/// Nạp kho hình từ một tệp kho MathHub. Phát sự kiện `kho-hinh:tien-do` {da, tong} sau mỗi lô.
#[tauri::command]
pub async fn kho_hinh_nap(app: AppHandle, path: String) -> Result<NapOut, String> {
    let d = dest_of(&app)?;
    let app2 = app.clone();
    blocking(move || {
        let _g = NAP_GATE.try_lock().map_err(|_| "Đang nạp kho hình, hãy chờ lượt này xong.".to_string())?;
        nap(&d, Path::new(&path), |da, tong| {
            let _ = app2.emit("kho-hinh:tien-do", Tien { da, tong });
        })
    })
    .await
}

#[tauri::command]
pub async fn kho_hinh_cay(app: AppHandle) -> Result<Vec<Nut>, String> {
    let d = dest_of(&app)?;
    blocking(move || cay(&d)).await
}

#[tauri::command]
pub async fn kho_hinh_tim(app: AppHandle, q: Option<String>, node: Option<String>, kind: Option<String>, lop: Option<String>, status: Option<String>, thung_rac: Option<bool>, offset: Option<i64>, limit: Option<i64>) -> Result<KetQua, String> {
    let d = dest_of(&app)?;
    blocking(move || tim(&d, q.as_deref().unwrap_or(""), node.as_deref(), kind.as_deref(), lop.as_deref(), status.as_deref(), thung_rac.unwrap_or(false), offset.unwrap_or(0), limit.unwrap_or(60))).await
}

#[tauri::command]
pub async fn kho_hinh_lay(app: AppHandle, id: String) -> Result<Option<Hinh>, String> {
    let d = dest_of(&app)?;
    blocking(move || lay(&d, &id)).await
}

#[tauri::command]
pub async fn kho_hinh_them(app: AppHandle, hinh: HinhMoi) -> Result<String, String> {
    let d = dest_of(&app)?;
    blocking(move || them(&d, &hinh)).await
}

#[tauri::command]
pub async fn kho_hinh_sua(app: AppHandle, id: String, sua_doi: HinhSua) -> Result<(), String> {
    let d = dest_of(&app)?;
    blocking(move || sua(&d, &id, &sua_doi)).await
}

/// Xoá vào thùng rác (`xoa` = true) hoặc khôi phục (false).
#[tauri::command]
pub async fn kho_hinh_xoa(app: AppHandle, ids: Vec<String>, xoa_di: bool) -> Result<usize, String> {
    let d = dest_of(&app)?;
    blocking(move || xoa(&d, &ids, xoa_di)).await
}

#[tauri::command]
pub async fn kho_hinh_nut_them(app: AppHandle, parent: Option<String>, name: String) -> Result<String, String> {
    let d = dest_of(&app)?;
    blocking(move || nut_them(&d, parent.as_deref(), &name)).await
}

#[tauri::command]
pub async fn kho_hinh_nut_doi_ten(app: AppHandle, id: String, name: String) -> Result<(), String> {
    let d = dest_of(&app)?;
    blocking(move || nut_doi_ten(&d, &id, &name)).await
}

#[tauri::command]
pub async fn kho_hinh_nut_chuyen(app: AppHandle, id: String, moi_cha: Option<String>) -> Result<(), String> {
    let d = dest_of(&app)?;
    blocking(move || nut_chuyen(&d, &id, moi_cha.as_deref())).await
}

#[tauri::command]
pub async fn kho_hinh_nut_xoa(app: AppHandle, id: String) -> Result<(), String> {
    let d = dest_of(&app)?;
    blocking(move || nut_xoa(&d, &id)).await
}

// ---------- kiểm thử ----------

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("hedu-kho-hinh-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    /// Tạo một kho "MathHub" nhỏ đúng lược đồ thật.
    fn make_src(path: &Path, items: &[(&str, &str, &str, &str, &str)]) {
        let c = Connection::open(path).unwrap();
        c.execute_batch(
            "CREATE TABLE tikz_nodes(id TEXT PRIMARY KEY, parent_id TEXT, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, is_builtin INTEGER NOT NULL DEFAULT 0);
             CREATE TABLE tikz_items(id TEXT PRIMARY KEY, node_id TEXT NOT NULL, title TEXT NOT NULL, code TEXT NOT NULL, extra_preamble TEXT NOT NULL DEFAULT '', grades TEXT NOT NULL DEFAULT '', topics TEXT NOT NULL DEFAULT '', source_key TEXT NOT NULL DEFAULT '', is_builtin INTEGER NOT NULL DEFAULT 0, user_moved INTEGER NOT NULL DEFAULT 0, width REAL NOT NULL DEFAULT 0, height REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
             INSERT INTO tikz_nodes(id,parent_id,name,sort_order) VALUES('root',NULL,'Thư viện',0),('g12','root','Lớp 12',1),('g12-c1','g12','Chương 1. Ứng dụng đạo hàm',1),('g10','root','Lớp 10',0);",
        )
        .unwrap();
        for (id, node, title, code, grades) in items {
            c.execute("INSERT INTO tikz_items(id,node_id,title,code,grades,topics,source_key,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,'đạo hàm','bank:x#1','2026-01-01','2026-01-01')", params![id, node, title, code, grades]).unwrap();
        }
    }

    #[test]
    fn fold_bo_dau_va_gom_khoang_trang() {
        assert_eq!(fold("  Bảng BIẾN  thiên Đồ thị "), "bang bien thien do thi");
        assert_eq!(fold("Cực trị của hàm số"), "cuc tri cua ham so");
        assert_eq!(fold("a\u{0300}b"), "ab", "dấu rời cũng bỏ");
    }

    #[test]
    fn kind_va_hash() {
        assert_eq!(kind_of("\\tkzTabInit{...}"), "bbt");
        assert_eq!(kind_of("\\begin{tikzpicture}[tdplot_main_coords]"), "3d");
        assert_eq!(kind_of("\\draw plot (\\x,{\\x*\\x});"), "do-thi");
        assert_eq!(kind_of("\\tkzDefPoints{0/0/A}"), "tkz-euclide");
        assert_eq!(kind_of("\\draw (0,0)--(1,1);"), "khac");
        // chỉ khác khoảng trắng, xuống dòng và chú thích ⇒ cùng dấu vân; khác nét vẽ ⇒ khác
        assert_eq!(code_hash("\\draw (0,0)--(1,1); % ghi chú\n"), code_hash("\\draw   (0,0)--(1,1);\r\n"));
        assert_ne!(code_hash("\\draw (0,0)--(1,1);"), code_hash("\\draw (0,0)--(1,2);"));
        assert_ne!(code_hash("50\\% a"), code_hash("50"), "\\% là ký tự thật, không phải chú thích");
    }

    #[test]
    fn nap_tim_cay_va_nap_lai() {
        let d = tmp("nap");
        let (src, dest) = (d.join("mathhub.db"), d.join("kho-hinh").join("kho-hinh.db"));
        make_src(
            &src,
            &[
                ("a", "g12-c1", "Cực trị của hàm số — hình 1", "\\begin{tikzpicture}\r\n\\tkzTabInit{x}\r\n\\end{tikzpicture}", "12"),
                ("b", "g12-c1", "Đồ thị bậc ba", "\\begin{tikzpicture}\\draw plot (\\x,\\x);\\end{tikzpicture}", "11, 12"),
                ("c", "g10", "Tam giác", "\\begin{tikzpicture}\\draw (0,0)--(1,0)--(0,1)--cycle;\\end{tikzpicture}", "10"),
                ("d", "g10", "Tam giác (bản trùng)", "\\begin{tikzpicture} \\draw (0,0)--(1,0)--(0,1)--cycle; % trùng\n\\end{tikzpicture}", "10"),
                ("e", "g10", "Trống", "   ", "10"),
            ],
        );
        let mut tiens = Vec::new();
        let o = nap(&dest, &src, |da, tong| tiens.push((da, tong))).unwrap();
        assert_eq!((o.tong, o.moi, o.trung, o.loi, o.da_co, o.nut), (5, 3, 1, 1, 0, 4));
        assert_eq!(tiens.last(), Some(&(5, 5)), "báo tiến độ cuối cùng");

        let t = trang_thai(&dest).unwrap();
        assert!(t.co && t.hinh == 3 && t.nut == 4 && t.nap_luc.is_some());

        // tìm không dấu, mọi từ phải khớp; tìm theo tên mục cha ("Chương 1")
        assert_eq!(tim(&dest, "cuc tri", None, None, None, None, false, 0, 50).unwrap().tong, 1);
        assert_eq!(tim(&dest, "ung dung dao ham", None, None, None, None, false, 0, 50).unwrap().tong, 2, "khớp theo tên chương");
        assert_eq!(tim(&dest, "do thi bac ba", None, None, None, None, false, 0, 50).unwrap().muc[0].id, "b");
        assert_eq!(tim(&dest, "100%", None, None, None, None, false, 0, 50).unwrap().tong, 0, "% không phải ký tự đại diện");
        // lọc cây (cả nhánh con), loại, lớp
        assert_eq!(tim(&dest, "", Some("g12"), None, None, None, false, 0, 50).unwrap().tong, 2);
        assert_eq!(tim(&dest, "", Some("root"), None, None, None, false, 0, 50).unwrap().tong, 3);
        assert_eq!(tim(&dest, "", None, Some("bbt"), None, None, false, 0, 50).unwrap().tong, 1);
        assert_eq!(tim(&dest, "", None, None, Some("11"), None, false, 0, 50).unwrap().tong, 1, "lớp tách theo dấu phẩy");
        assert_eq!(tim(&dest, "", None, None, Some("1"), None, false, 0, 50).unwrap().tong, 0, "lớp 1 không khớp nhầm lớp 10/11/12");
        assert_eq!(tim(&dest, "", None, None, None, Some("loi"), false, 0, 50).unwrap().tong, 0);
        let p = tim(&dest, "", None, None, None, None, false, 1, 1).unwrap();
        assert_eq!((p.tong, p.muc.len()), (3, 1), "phân trang");

        // cây có đếm theo nhánh
        let c = cay(&dest).unwrap();
        let dem = |id: &str| c.iter().find(|n| n.id == id).unwrap().dem;
        assert_eq!((dem("root"), dem("g12"), dem("g12-c1"), dem("g10")), (3, 2, 2, 1));

        // lấy một hình: xuống dòng đã chuẩn hoá về \n
        let h = lay(&dest, "a").unwrap().unwrap();
        assert!(h.code.contains("\\tkzTabInit") && !h.code.contains('\r') && h.kind == "bbt" && h.status == "chua");
        assert!(lay(&dest, "khong-co").unwrap().is_none());

        // nạp lại: hình đã có KHÔNG bị ghi đè hay nhân đôi; hình giáo viên sửa được giữ
        Connection::open(&dest).unwrap().execute("UPDATE item SET title='Tên đã sửa', edited=1 WHERE id='a'", []).unwrap();
        let o2 = nap(&dest, &src, |_, _| {}).unwrap();
        assert_eq!((o2.moi, o2.da_co, o2.trung, o2.loi), (0, 3, 1, 1));
        assert_eq!(lay(&dest, "a").unwrap().unwrap().title, "Tên đã sửa");
        assert_eq!(trang_thai(&dest).unwrap().hinh, 3);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn them_sua_xoa_va_tuy_bien() {
        let d = tmp("sua");
        let (src, dest) = (d.join("mathhub.db"), d.join("kho-hinh.db"));
        make_src(&src, &[("a", "g12-c1", "Cực trị hàm số", "\\begin{tikzpicture}\\tkzTabInit{x}\\end{tikzpicture}", "12"), ("b", "g10", "Tam giác", "\\draw (0,0)--(1,0)--(0,1)--cycle;", "10")]);
        nap(&dest, &src, |_, _| {}).unwrap();

        // thêm hình của riêng giáo viên: tìm được, ghi nguồn "nguoi-dung", loại tự nhận
        let id = them(&dest, &HinhMoi { node_id: "g10".into(), title: "  Hình  thang cân ".into(), code: "\\draw (0,0)--(2,0)--(1.5,1)--(0.5,1)--cycle;\r\n".into(), extra_preamble: String::new(), grades: "10".into(), topics: "hình thang".into(), kind: None }).unwrap();
        let h = lay(&dest, &id).unwrap().unwrap();
        assert_eq!((h.title.as_str(), h.nguon.as_str(), h.kind.as_str(), h.edited, h.da_xoa), ("Hình thang cân", "nguoi-dung", "khac", false, false));
        assert!(!h.code.contains('\r'));
        assert_eq!(tim(&dest, "hinh thang", None, None, None, None, false, 0, 50).unwrap().tong, 1);
        // thêm trùng mã (chỉ khác khoảng trắng) hoặc vào mục không có ⇒ báo, không thêm
        let e = them(&dest, &HinhMoi { node_id: "g10".into(), title: "Bản sao".into(), code: "\\draw(0,0)--(2,0)--(1.5,1)--(0.5,1)--cycle;".into(), extra_preamble: String::new(), grades: String::new(), topics: String::new(), kind: None }).unwrap_err();
        assert!(e.contains("đã có trong kho") && e.contains("Hình thang cân"), "{e}");
        assert!(them(&dest, &HinhMoi { node_id: "khong-co".into(), title: "x".into(), code: "\\draw;".into(), extra_preamble: String::new(), grades: String::new(), topics: String::new(), kind: None }).unwrap_err().contains("Mục chứa hình"));
        assert!(them(&dest, &HinhMoi { node_id: "g10".into(), title: "  ".into(), code: "\\draw;".into(), extra_preamble: String::new(), grades: String::new(), topics: String::new(), kind: None }).unwrap_err().contains("Tên hình"));
        assert!(them(&dest, &HinhMoi { node_id: "g10".into(), title: "x".into(), code: "\\draw;".into(), extra_preamble: String::new(), grades: String::new(), topics: String::new(), kind: Some("la".into()) }).unwrap_err().contains("Loại hình"));

        // sửa: đổi tên + chủ đề + mục + loại tay; chữ tìm kiếm cập nhật; đổi mã thì tính lại loại và đưa trạng thái về "chưa dịch"
        sua(&dest, &id, &HinhSua { title: Some("Hình thang vuông".into()), topics: Some("tứ giác đặc biệt".into()), node_id: Some("g12-c1".into()), kind: Some("tkz-euclide".into()), ..Default::default() }).unwrap();
        let h = lay(&dest, &id).unwrap().unwrap();
        assert_eq!((h.title.as_str(), h.node_id.as_str(), h.kind.as_str(), h.edited), ("Hình thang vuông", "g12-c1", "tkz-euclide", true));
        assert_eq!(tim(&dest, "tu giac dac biet", None, None, None, None, false, 0, 50).unwrap().tong, 1);
        assert_eq!(tim(&dest, "hinh thang can", None, None, None, None, false, 0, 50).unwrap().tong, 0, "tên cũ không còn khớp");
        Connection::open(&dest).unwrap().execute("UPDATE item SET status='ok' WHERE id='b'", []).unwrap();
        sua(&dest, "b", &HinhSua { code: Some("\\begin{axis}\\addplot{x};\\end{axis}".into()), ..Default::default() }).unwrap();
        let b = lay(&dest, "b").unwrap().unwrap();
        assert_eq!((b.kind.as_str(), b.status.as_str()), ("do-thi", "chua"));
        // sửa thành mã trùng hình khác ⇒ báo, hình giữ nguyên
        assert!(sua(&dest, "b", &HinhSua { code: Some("\\begin{tikzpicture}\\tkzTabInit{x}\\end{tikzpicture}".into()), ..Default::default() }).unwrap_err().contains("trùng"));
        assert_eq!(lay(&dest, "b").unwrap().unwrap().kind, "do-thi");
        assert!(sua(&dest, "khong-co", &HinhSua::default()).unwrap_err().contains("Không thấy"));

        // xoá vào thùng rác: ẩn khỏi tìm/cây/đếm, xem được trong thùng rác, khôi phục được; nạp lại KHÔNG làm sống lại
        assert_eq!(xoa(&dest, &["a".to_string(), "khong-co".to_string()], true).unwrap(), 1);
        assert_eq!(tim(&dest, "cuc tri", None, None, None, None, false, 0, 50).unwrap().tong, 0);
        assert_eq!(tim(&dest, "cuc tri", None, None, None, None, true, 0, 50).unwrap().tong, 1);
        let t = trang_thai(&dest).unwrap();
        assert_eq!((t.hinh, t.thung_rac), (2, 1));
        assert_eq!(cay(&dest).unwrap().iter().find(|n| n.id == "g12-c1").unwrap().dem, 1, "chỉ còn hình thang trong mục này");
        let o = nap(&dest, &src, |_, _| {}).unwrap();
        assert_eq!((o.moi, o.da_co), (0, 2), "nạp lại bỏ qua hình đã có, kể cả đã xoá");
        assert_eq!(tim(&dest, "cuc tri", None, None, None, None, false, 0, 50).unwrap().tong, 0, "vẫn đang ở thùng rác");
        assert!(them(&dest, &HinhMoi { node_id: "g10".into(), title: "x".into(), code: "\\begin{tikzpicture}\\tkzTabInit{x}\\end{tikzpicture}".into(), extra_preamble: String::new(), grades: String::new(), topics: String::new(), kind: None }).unwrap_err().contains("thùng rác"));
        assert_eq!(xoa(&dest, &["a".to_string()], false).unwrap(), 1);
        assert_eq!(tim(&dest, "cuc tri", None, None, None, None, false, 0, 50).unwrap().tong, 1);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn quan_ly_muc_cay() {
        let d = tmp("muc");
        let (src, dest) = (d.join("mathhub.db"), d.join("kho-hinh.db"));
        make_src(&src, &[("a", "g12-c1", "Cực trị", "\\draw (0,0);", "12")]);
        nap(&dest, &src, |_, _| {}).unwrap();

        let moi = nut_them(&dest, Some("g12"), "  Chương 2.   Mũ và logarit ").unwrap();
        assert!(cay(&dest).unwrap().iter().any(|n| n.id == moi && n.name == "Chương 2. Mũ và logarit" && n.parent_id.as_deref() == Some("g12")));
        assert!(nut_them(&dest, Some("khong-co"), "x").unwrap_err().contains("Mục cha"));
        assert!(nut_them(&dest, None, "   ").unwrap_err().contains("Tên mục"));
        // đổi tên mục cha ⇒ hình trong nhánh tìm được theo tên mới
        nut_doi_ten(&dest, "g12", "Khối 12").unwrap();
        assert_eq!(tim(&dest, "khoi 12", None, None, None, None, false, 0, 50).unwrap().tong, 1);
        assert_eq!(tim(&dest, "lop 12", None, None, None, None, false, 0, 50).unwrap().tong, 0);
        // chuyển mục: sang chỗ khác OK; vào chính nó / con của nó bị chặn
        assert!(nut_chuyen(&dest, "g12", Some("g12-c1")).unwrap_err().contains("chính nó"));
        assert!(nut_chuyen(&dest, "g12", Some("g12")).unwrap_err().contains("chính nó"));
        nut_chuyen(&dest, "g12-c1", Some("g10")).unwrap();
        assert_eq!(tim(&dest, "", Some("g10"), None, None, None, false, 0, 50).unwrap().tong, 1, "hình đi theo mục");
        assert_eq!(tim(&dest, "lop 10 chuong 1", None, None, None, None, false, 0, 50).unwrap().tong, 1, "chữ tìm kiếm theo vị trí mới");
        // xoá mục: còn con/hình thì báo; trống thì xoá
        assert!(nut_xoa(&dest, "g10").unwrap_err().contains("còn"));
        assert!(nut_xoa(&dest, "g12-c1").unwrap_err().contains("1 hình"));
        nut_xoa(&dest, &moi).unwrap();
        assert!(!cay(&dest).unwrap().iter().any(|n| n.id == moi));
        assert!(nut_xoa(&dest, &moi).unwrap_err().contains("Không thấy"));
        let _ = std::fs::remove_dir_all(&d);
    }

    /// Chạy tay trên kho MathHub thật: HEDU_KHO_NGUON=<kho.db> HEDU_KHO_DICH=<tệp thử> cargo test --lib khohinh::tests::nap_kho_that -- --ignored --nocapture
    #[test]
    #[ignore]
    fn nap_kho_that() {
        let (Ok(src), Ok(dest)) = (std::env::var("HEDU_KHO_NGUON"), std::env::var("HEDU_KHO_DICH")) else { return };
        let o = nap(Path::new(&dest), Path::new(&src), |da, tong| {
            if da % 5000 == 0 || da == tong {
                println!("  tiến độ {da}/{tong}");
            }
        })
        .unwrap();
        println!("nạp lần 1: {o:?}");
        let o2 = nap(Path::new(&dest), Path::new(&src), |_, _| {}).unwrap();
        println!("nạp lần 2: {o2:?}");
        assert_eq!(o2.moi, 0);
        let t = trang_thai(Path::new(&dest)).unwrap();
        println!("trạng thái: {t:?}");
        let t0 = Instant::now();
        let k = tim(Path::new(&dest), "bang bien thien cuc tri", None, None, Some("12"), None, false, 0, 60).unwrap();
        println!("tìm 'bang bien thien cuc tri' lớp 12: {} kết quả, {} ms", k.tong, t0.elapsed().as_millis());
        let t1 = Instant::now();
        let k2 = tim(Path::new(&dest), "", Some("bank:g12-c1"), Some("bbt"), None, None, false, 0, 60).unwrap();
        println!("lọc nhánh g12-c1 loại bbt: {} kết quả, {} ms", k2.tong, t1.elapsed().as_millis());
        let c = cay(Path::new(&dest)).unwrap();
        println!("cây: {} mục, gốc có {} hình", c.len(), c.iter().find(|n| n.parent_id.is_none()).map(|n| n.dem).unwrap_or(0));
    }

    #[test]
    fn nap_tu_tep_sai_hoac_chinh_no() {
        let d = tmp("sai");
        let dest = d.join("kho-hinh.db");
        assert!(nap(&dest, &d.join("khong-co.db"), |_, _| {}).unwrap_err().contains("Không thấy"));
        let lung = d.join("lung.db");
        Connection::open(&lung).unwrap().execute_batch("CREATE TABLE khac(x)").unwrap();
        assert!(nap(&dest, &lung, |_, _| {}).unwrap_err().contains("không phải kho hình MathHub"));
        make_src(&dest, &[("a", "g10", "T", "\\draw (0,0);", "10")]);
        assert!(nap(&dest, &dest, |_, _| {}).unwrap_err().contains("chính tệp kho"));
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn chua_nap_thi_rong() {
        let d = tmp("rong");
        let dest = d.join("kho-hinh.db");
        assert_eq!(trang_thai(&dest).unwrap(), TrangThai::default());
        assert!(cay(&dest).unwrap().is_empty());
        assert_eq!(tim(&dest, "x", None, None, None, None, false, 0, 10).unwrap().tong, 0);
        assert!(!dest.exists(), "đọc không được tạo tệp");
        let _ = std::fs::remove_dir_all(&d);
    }
}
