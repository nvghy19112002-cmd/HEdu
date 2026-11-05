// Đọc công thức MathType (đối tượng OLE "Equation.DSMT*" nhúng trong .docx) và đổi sang LaTeX.
// Luồng "Equation Native" trong tệp OLE: 28 byte tiêu đề EQNOLEFILEHDR rồi dữ liệu MTEF 5 (định dạng nhị phân của MathType).
// Cách đọc dựa trên MTEF 5 và đã đối chiếu với đề Word thật (xem mtef_tests). Không đọc được thì trả lỗi, không đoán.
use std::collections::BTreeSet;
use std::io::{Cursor, Read};

const HEAD_LEN: usize = 28;

/// Đọc luồng "Equation Native" từ nội dung một tệp OLE (.bin).
pub fn equation_native(ole: &[u8]) -> Result<Vec<u8>, String> {
    let mut cf = cfb::CompoundFile::open(Cursor::new(ole)).map_err(|e| format!("Không mở được đối tượng nhúng: {e}"))?;
    let mut s = cf.open_stream("/Equation Native").map_err(|_| "Đối tượng nhúng không phải công thức MathType.".to_string())?;
    let mut v = Vec::new();
    s.read_to_end(&mut v).map_err(|e| e.to_string())?;
    Ok(v)
}

// ---------------- cây ----------------
#[derive(Debug)]
enum Node {
    Line(Vec<Node>),
    Char { tf: u8, mt: u16, emb: Vec<u8> },
    Tmpl { sel: u8, var: u16, kids: Vec<Node> },
    Pile(Vec<Node>),
    Matrix { rows: usize, cols: usize, kids: Vec<Node> },
}

struct Rd<'a> {
    b: &'a [u8],
    p: usize,
}

impl<'a> Rd<'a> {
    fn more(&self) -> bool {
        self.p < self.b.len()
    }
    fn u8(&mut self) -> Result<u8, String> {
        let v = *self.b.get(self.p).ok_or("Dữ liệu công thức bị cụt.")?;
        self.p += 1;
        Ok(v)
    }
    fn u16(&mut self) -> Result<u16, String> {
        let a = self.u8()? as u16;
        let b = self.u8()? as u16;
        Ok(a | (b << 8))
    }
    fn skip(&mut self, n: usize) -> Result<(), String> {
        if self.p + n > self.b.len() {
            return Err("Dữ liệu công thức bị cụt.".into());
        }
        self.p += n;
        Ok(())
    }
    fn cstr(&mut self) -> Result<(), String> {
        while self.u8()? != 0 {}
        Ok(())
    }
    fn nudge(&mut self) -> Result<(), String> {
        let (a, b) = (self.u8()?, self.u8()?);
        if a == 0x80 && b == 0x80 {
            self.skip(4)?;
        }
        Ok(())
    }
    fn ruler(&mut self) -> Result<(), String> {
        let n = self.u8()?;
        for _ in 0..n {
            self.skip(3)?;
        }
        Ok(())
    }
    /// một mảng kích thước: đếm n mục, mỗi mục là các nibble kết thúc bằng 0xF
    fn dims(&mut self) -> Result<(), String> {
        let n = self.u8()?;
        let mut got = 0;
        while got < n {
            let byte = self.u8()?;
            for x in [byte >> 4, byte & 15] {
                if got < n && x == 15 {
                    got += 1;
                }
            }
        }
        Ok(())
    }
}

fn parse_objs(r: &mut Rd, depth: usize) -> Result<Vec<Node>, String> {
    if depth > 64 {
        return Err("Công thức lồng quá sâu.".into());
    }
    let mut out = Vec::new();
    while r.more() {
        let t = r.u8()?;
        match t {
            0 => return Ok(out),
            1 => {
                let o = r.u8()?;
                if o & 8 != 0 { r.nudge()?; }
                if o & 4 != 0 { r.u8()?; }
                if o & 2 != 0 { r.ruler()?; }
                // cờ 0x01: dòng rỗng (không có danh sách đối tượng và không có bản ghi END)
                out.push(Node::Line(if o & 1 != 0 { Vec::new() } else { parse_objs(r, depth + 1)? }));
            }
            2 => {
                let o = r.u8()?;
                if o & 8 != 0 { r.nudge()?; }
                let tf = r.u8()?;
                let mt = if o & 0x20 == 0 { r.u16()? } else { 0 };
                let c8 = if o & 4 != 0 { Some(r.u8()?) } else { None };
                if o & 0x10 != 0 { r.u16()?; }
                let mut emb = Vec::new();
                if o & 1 != 0 {
                    loop {
                        match r.u8()? {
                            0 => break,
                            15 => { r.u8()?; }
                            6 => {
                                let eo = r.u8()?;
                                if eo & 8 != 0 { r.nudge()?; }
                                emb.push(r.u8()?);
                            }
                            x => return Err(format!("Bản ghi lạ {x} trong dấu của ký tự.")),
                        }
                    }
                }
                out.push(Node::Char { tf, mt: if mt == 0 { c8.map(|c| c as u16).unwrap_or(0) } else { mt }, emb });
            }
            3 => {
                let o = r.u8()?;
                if o & 8 != 0 { r.nudge()?; }
                let sel = r.u8()?;
                let mut var = r.u8()? as u16;
                if var & 0x80 != 0 { var = (var & 0x7F) | ((r.u8()? as u16) << 7); }
                r.u8()?; // template options
                let kids = if o & 4 != 0 { Vec::new() } else { parse_objs(r, depth + 1)? };
                out.push(Node::Tmpl { sel, var, kids });
            }
            4 => {
                let o = r.u8()?;
                if o & 8 != 0 { r.nudge()?; }
                r.u8()?; r.u8()?;
                if o & 2 != 0 { r.ruler()?; }
                out.push(Node::Pile(parse_objs(r, depth + 1)?));
            }
            5 => {
                let o = r.u8()?;
                if o & 8 != 0 { r.nudge()?; }
                r.u8()?; r.u8()?; r.u8()?;
                let rows = r.u8()? as usize;
                let cols = r.u8()? as usize;
                r.skip((2 * (rows + 1) + 7) / 8 + (2 * (cols + 1) + 7) / 8)?;
                out.push(Node::Matrix { rows, cols, kids: parse_objs(r, depth + 1)? });
            }
            6 => { let o = r.u8()?; if o & 8 != 0 { r.nudge()?; } r.u8()?; }
            7 => r.ruler()?,
            8 => { r.u8()?; r.u8()?; }
            9 => {
                let b = r.u8()?;
                match b { 100 => r.skip(3)?, 101 => r.skip(2)?, _ => r.skip(1)? }
            }
            10..=14 => {}
            15 => { r.u8()?; }
            16 => {
                let o = r.u8()?;
                r.skip(if o & 1 != 0 { 8 } else { 6 })?;
                if o & 2 != 0 { r.cstr()?; }
            }
            17 => { r.u8()?; r.cstr()?; }
            18 => {
                r.u8()?;
                r.dims()?;
                r.dims()?;
                let n = r.u8()?;
                for _ in 0..n {
                    if r.u8()? != 0 { r.u8()?; }
                }
            }
            19 => r.cstr()?,
            x => return Err(format!("Bản ghi MathType lạ ({x}) tại byte {}.", r.p - 1)),
        }
    }
    Ok(out)
}

fn parse(eq: &[u8]) -> Result<Vec<Node>, String> {
    if eq.len() <= HEAD_LEN + 6 {
        return Err("Dữ liệu công thức quá ngắn.".into());
    }
    let mut r = Rd { b: eq, p: HEAD_LEN };
    if r.u8()? != 5 {
        return Err("Chỉ đọc được MathType định dạng MTEF 5.".into());
    }
    r.skip(4)?; // nền tảng, sản phẩm, phiên bản
    r.cstr()?; // khoá ứng dụng
    r.u8()?; // tuỳ chọn
    parse_objs(&mut r, 0)
}

// ---------------- LaTeX ----------------
fn greek_lower(m: u16) -> Option<&'static str> {
    Some(match m {
        97 | 945 => "alpha", 98 | 946 => "beta", 99 | 967 => "chi", 100 | 948 => "delta", 101 | 949 | 603 => "varepsilon", 1013 => "epsilon",
        102 | 966 => "varphi", 981 => "phi", 103 | 947 => "gamma", 104 | 951 => "eta", 105 | 953 => "iota", 107 | 954 => "kappa", 108 | 955 => "lambda",
        109 | 956 => "mu", 110 | 957 => "nu", 112 | 960 => "pi", 113 | 952 => "theta", 114 | 961 => "rho", 115 | 963 => "sigma", 116 | 964 => "tau",
        117 | 965 => "upsilon", 119 | 969 => "omega", 120 | 958 => "xi", 121 | 968 => "psi", 122 | 950 => "zeta", 74 | 977 => "vartheta", 86 | 962 => "varsigma", 118 | 982 => "varpi",
        _ => return None,
    })
}
fn greek_upper(m: u16) -> Option<&'static str> {
    Some(match m {
        68 | 916 | 8710 => "Delta", 70 | 934 => "Phi", 71 | 915 => "Gamma", 76 | 923 => "Lambda", 80 | 928 => "Pi", 81 | 920 => "Theta", 83 | 931 => "Sigma",
        87 | 937 => "Omega", 88 | 926 => "Xi", 89 | 936 => "Psi",
        _ => return None,
    })
}
fn symbol(m: u16) -> Option<&'static str> {
    Some(match m {
        34 | 8704 => "\\forall ", 36 | 8707 => "\\exists ", 39 => "\\ni ", 64 | 8773 => "\\cong ", 92 | 8756 => "\\therefore ", 94 | 8869 => "\\perp ",
        163 | 8804 => "\\leq ", 165 | 8734 => "\\infty ", 171 | 8596 => "\\leftrightarrow ", 172 | 8592 => "\\leftarrow ", 173 | 8593 => "\\uparrow ",
        174 | 8594 => "\\rightarrow ", 175 | 8595 => "\\downarrow ", 176 => "^\\circ ", 177 => "\\pm ", 179 | 8805 => "\\geq ", 180 => "\\times ", 181 | 8733 => "\\propto ",
        182 | 8706 => "\\partial ", 183 | 8226 => "\\bullet ", 184 => "\\div ", 185 | 8800 => "\\neq ", 186 | 8801 => "\\equiv ", 187 | 8776 => "\\approx ",
        192 | 8501 => "\\aleph ", 193 | 8465 => "\\Im ", 194 | 8476 => "\\Re ", 196 | 8855 => "\\otimes ", 197 | 8853 => "\\oplus ", 198 | 8709 => "\\emptyset ",
        199 | 8745 => "\\cap ", 200 | 8746 => "\\cup ", 201 | 8835 => "\\supset ", 202 | 8839 => "\\supseteq ", 204 | 8834 => "\\subset ", 205 | 8838 => "\\subseteq ",
        206 | 8712 => "\\in ", 207 | 8713 => "\\notin ", 208 | 8736 => "\\angle ", 209 | 8711 => "\\nabla ", 213 | 8719 => "\\prod ", 215 | 8901 => "\\cdot ",
        216 => "\\neg ", 217 | 8743 => "\\wedge ", 218 | 8744 => "\\vee ", 219 | 8660 => "\\Leftrightarrow ", 220 | 8656 => "\\Leftarrow ", 222 | 8658 => "\\Rightarrow ",
        223 | 8659 => "\\Downarrow ", 225 | 9001 => "\\langle ", 241 | 9002 => "\\rangle ", 229 | 8721 => "\\sum ", 8722 => "-", 8727 => "\\ast ",
        8657 => "\\Uparrow ", 8836 => "\\not\\subset ", 8747 => "\\int ", 8477 => "\\mathbb{R} ", 8450 => "\\mathbb{C} ", 8469 => "\\mathbb{N} ", 8484 => "\\mathbb{Z} ",
        8474 => "\\mathbb{Q} ", 8741 => "\\parallel ", 8723 => "\\mp ", 8728 => "\\circ ", 8943 => "\\cdots ", 8230 => "\\ldots ", 8942 => "\\vdots ", 8944 => "\\ddots ",
        8826 => "\\prec ", 8827 => "\\succ ", 8214 => "\\| ", 8739 => "|", 8764 => "\\sim ", 8771 => "\\simeq ", 8810 => "\\ll ", 8811 => "\\gg ",
        0x2032 => "'", 0x2033 => "''",
        _ => return None,
    })
}
const FUNCS: &[&str] = &["arccos", "arcsin", "arctan", "arg", "cos", "cosh", "cot", "coth", "csc", "deg", "det", "dim", "exp", "gcd", "hom", "inf", "ker", "lim", "liminf", "limsup", "ln", "log", "max", "min", "sec", "sin", "sinh", "sup", "tan", "tanh", "Pr"];

fn esc(c: char) -> String {
    match c {
        '#' | '$' | '%' | '&' | '_' => format!("\\{c}"),
        '{' => "\\{".into(),
        '}' => "\\}".into(),
        '~' => "\\sim ".into(),
        '^' => "\\^{}".into(),
        '\\' => "\\backslash ".into(),
        '\u{a0}' | '\u{2009}' | '\u{200a}' => "\\,".into(),
        _ => c.to_string(),
    }
}

struct Cv {
    warn: BTreeSet<String>,
}

impl Cv {
    fn kind(tf: u8) -> u8 {
        if tf >= 128 { tf - 128 } else { tf }
    }

    fn one_char(&mut self, tf: u8, mt: u16) -> String {
        let k = Self::kind(tf);
        let found = match k {
            4 => greek_lower(mt).map(|g| format!("\\{g} ")),
            5 => greek_upper(mt).map(|g| format!("\\{g} ")).or_else(|| if (65..=90).contains(&mt) { Some(((mt as u8) as char).to_string()) } else { None }),
            11 => match mt {
                58 => Some("\\sim ".to_string()), 59 => Some("\\simeq ".to_string()), 61 => Some("\\ll ".to_string()), 63 => Some("\\gg ".to_string()),
                75 => Some("\\ldots ".to_string()), 76 => Some("\\cdots ".to_string()), 77 => Some("\\vdots ".to_string()), 78 | 79 => Some("\\ddots ".to_string()),
                109 => Some("\\mp ".to_string()), 111 => Some("\\circ ".to_string()),
                _ => symbol(mt).map(String::from),
            },
            6 => symbol(mt).map(String::from).or_else(|| greek_lower(mt).map(|g| format!("\\{g} "))).or_else(|| greek_upper(mt).map(|g| format!("\\{g} "))),
            _ => None,
        };
        if let Some(s) = found {
            return s;
        }
        match mt {
            61186 | 62210 | 60162 => "\\,".into(),
            60164 => "\\;".into(),
            60165 => "\\quad ".into(),
            60160 | 0 => String::new(),
            60161 => "\\/".into(),
            0x2061..=0x2064 | 0x200B => String::new(),
            m if m > 255 && symbol(m).is_some() => symbol(m).unwrap().into(),
            m if m > 255 && greek_lower(m).is_some() => format!("\\{} ", greek_lower(m).unwrap()),
            m if m > 255 && greek_upper(m).is_some() => format!("\\{} ", greek_upper(m).unwrap()),
            m if (0xF000..=0xF0FF).contains(&m) && symbol(m - 0xF000).is_some() => symbol(m - 0xF000).unwrap().into(),
            m => {
                let c = char::from_u32(m as u32).unwrap_or('?');
                if m < 128 || (m < 256 && k != 6) {
                    esc(c)
                } else if c.is_alphabetic() {
                    c.to_string()
                } else {
                    self.warn.insert(format!("ký tự công thức U+{m:04X}"));
                    c.to_string()
                }
            }
        }
    }

    fn content(&mut self, kids: &[Node], in_vec: bool) -> String {
        let mut out: Vec<String> = Vec::new();
        let mut i = 0;
        while i < kids.len() {
            match &kids[i] {
                Node::Char { tf, mt, emb } if Self::kind(*tf) == 2 && *mt < 128 && (*mt as u8 as char).is_ascii_alphabetic() => {
                    // chữ của tên hàm: gom cả dãy
                    let mut name = String::new();
                    let mut j = i;
                    while let Some(Node::Char { tf: t2, mt: m2, .. }) = kids.get(j) {
                        if Self::kind(*t2) == 2 && *m2 < 128 && (*m2 as u8 as char).is_ascii_alphabetic() {
                            name.push(*m2 as u8 as char);
                            j += 1;
                        } else {
                            break;
                        }
                    }
                    let _ = emb;
                    out.push(if FUNCS.contains(&name.as_str()) { format!("\\{name} ") } else { format!("\\mathrm{{{name}}}") });
                    i = j;
                    continue;
                }
                Node::Char { tf, mt, .. } if Self::kind(*tf) == 1 && *mt != 0 => {
                    let mut t = String::new();
                    let mut j = i;
                    while let Some(Node::Char { tf: t2, mt: m2, .. }) = kids.get(j) {
                        if Self::kind(*t2) == 1 && *m2 != 0 {
                            t.push(char::from_u32(*m2 as u32).unwrap_or('?'));
                            j += 1;
                        } else {
                            break;
                        }
                    }
                    let tt: String = t.chars().map(|c| if c == '\u{a0}' { ' ' } else { c }).collect();
                    out.push(if tt.trim().is_empty() { "\\ ".into() } else { format!("\\text{{{}}}", tt.replace('\\', "").replace('{', "\\{").replace('}', "\\}").replace('&', "\\&").replace('%', "\\%").replace('#', "\\#").replace('_', "\\_").replace('$', "\\$")) });
                    i = j;
                    continue;
                }
                Node::Char { tf, mt, emb } => {
                    if *mt == 8407 {
                        // dấu mũi tên véc-tơ rời: áp lên ký tự trước nó (trừ khi đã nằm trong mẫu vectơ)
                        if !in_vec {
                            if let Some(last) = out.pop() {
                                out.push(format!("\\overrightarrow{{{}}}", last.trim()));
                            }
                        }
                    } else {
                        let mut s = self.one_char(*tf, *mt);
                        for e in emb {
                            s = match e {
                                2 => format!("\\dot{{{}}}", s.trim()), 3 => format!("\\ddot{{{}}}", s.trim()), 4 => format!("\\dddot{{{}}}", s.trim()),
                                5 => format!("{}'", s.trim()), 6 => format!("{}''", s.trim()), 18 => format!("{}'''", s.trim()),
                                8 => format!("\\tilde{{{}}}", s.trim()), 9 => format!("\\hat{{{}}}", s.trim()),
                                11 | 14 => format!("\\overrightarrow{{{}}}", s.trim()), 12 | 15 => format!("\\overleftarrow{{{}}}", s.trim()),
                                13 => format!("\\overleftrightarrow{{{}}}", s.trim()), 16 => format!("\\underline{{{}}}", s.trim()), 17 => format!("\\overline{{{}}}", s.trim()),
                                19 => format!("\\widehat{{{}}}", s.trim()), 20 => format!("\\breve{{{}}}", s.trim()),
                                _ => s,
                            };
                        }
                        out.push(s);
                    }
                }
                other => out.push(self.node(other)),
            }
            i += 1;
        }
        out.concat()
    }

    fn of(&mut self, n: &Node) -> String {
        match n {
            Node::Line(k) => self.content(k, false),
            other => self.node(other),
        }
    }

    fn slot(&mut self, kids: &[Node], i: usize) -> String {
        kids.get(i).map(|n| self.of(n)).unwrap_or_default()
    }

    fn first_nonempty(&mut self, kids: &[Node]) -> String {
        for n in kids {
            let s = self.of(n);
            if !s.trim().is_empty() {
                return s;
            }
        }
        String::new()
    }

    fn node(&mut self, n: &Node) -> String {
        match n {
            Node::Line(k) => self.content(k, false),
            Node::Pile(k) => {
                let rows: Vec<String> = k.iter().map(|x| self.of(x)).collect();
                format!("\\begin{{array}}{{l}}{}\\end{{array}}", rows.join(" \\\\ "))
            }
            Node::Matrix { rows, cols, kids } => {
                let cells: Vec<String> = kids.iter().map(|x| self.of(x)).collect();
                let body: Vec<String> = (0..*rows).map(|r| (0..*cols).map(|c| cells.get(r * cols + c).cloned().unwrap_or_default()).collect::<Vec<_>>().join(" & ")).collect();
                format!("\\begin{{matrix}}{}\\end{{matrix}}", body.join(" \\\\ "))
            }
            Node::Char { tf, mt, .. } => self.one_char(*tf, *mt),
            Node::Tmpl { sel, var, kids } => self.tmpl(*sel, *var, kids),
        }
    }

    fn fence(&mut self, var: u16, l: &str, r: &str, kids: &[Node]) -> String {
        let inner = kids.first();
        if let Some(Node::Line(items)) = inner {
            if items.len() == 1 && l == "\\{" && (var & 3) == 1 {
                if let Node::Pile(rows) = &items[0] {
                    let rs: Vec<String> = rows.iter().map(|x| self.of(x)).collect();
                    return format!("\\begin{{cases}}{}\\end{{cases}}", rs.join(" \\\\ "));
                }
            }
        }
        let body = inner.map(|n| self.of(n)).unwrap_or_default();
        let (lf, rt) = match var & 3 { 1 => (l, "."), 2 => (".", r), _ => (l, r) };
        format!("\\left{lf} {body} \\right{rt} ")
    }

    fn tmpl(&mut self, sel: u8, var: u16, kids: &[Node]) -> String {
        match sel {
            0 => self.fence(var, "\\langle", "\\rangle", kids),
            1 => self.fence(var, "(", ")", kids),
            2 => self.fence(var, "\\{", "\\}", kids),
            3 => self.fence(var, "[", "]", kids),
            4 => self.fence(var, "|", "|", kids),
            5 => self.fence(var, "\\|", "\\|", kids),
            6 => self.fence(var, "\\lfloor", "\\rfloor", kids),
            7 => self.fence(var, "\\lceil", "\\rceil", kids),
            10 => if var == 0 { format!("\\sqrt{{{}}}", self.slot(kids, 0)) } else { format!("\\sqrt[{}]{{{}}}", self.slot(kids, 1), self.slot(kids, 0)) },
            11 => format!("\\frac{{{}}}{{{}}}", self.slot(kids, 0), self.slot(kids, 1)),
            12 => format!("\\underline{{{}}}", self.slot(kids, 0)),
            13 => format!("\\overline{{{}}}", self.slot(kids, 0)),
            15..=22 => {
                let op = match sel { 15 | 21 => "\\int", 16 | 22 => "\\sum", 17 => "\\prod", 18 => "\\coprod", 19 => "\\bigcup", _ => "\\bigcap" };
                let op = if sel == 15 { match var { 2 | 6 => "\\iint", 3 => "\\iiint", 4 | 8 | 12 => "\\oint", _ => op } } else { op };
                let (body, lo, hi) = (self.slot(kids, 0), self.slot(kids, 1), self.slot(kids, 2));
                let mut t = op.to_string();
                if !lo.trim().is_empty() { t.push_str(&format!("_{{{lo}}}")); }
                if !hi.trim().is_empty() { t.push_str(&format!("^{{{hi}}}")); }
                format!("{t} {body} ")
            }
            23 => format!("\\mathop{{{}}}\\limits_{{{}}}", self.slot(kids, 0), self.slot(kids, 1)),
            24 | 25 => if var == 0 { format!("\\underbrace{{{}}}_{{{}}}", self.slot(kids, 0), self.slot(kids, 1)) } else { format!("\\overbrace{{{}}}^{{{}}}", self.slot(kids, 0), self.slot(kids, 1)) },
            27 => format!("_{{{}}}", self.first_nonempty(kids)),
            28 => { let s = if kids.len() > 1 { let b = self.slot(kids, 1); if b.trim().is_empty() { self.slot(kids, 0) } else { b } } else { self.slot(kids, 0) }; format!("^{{{s}}}") }
            29 => format!("_{{{}}}^{{{}}}", self.slot(kids, 0), self.slot(kids, 1)),
            31 => format!("\\overrightarrow{{{}}}", self.vec_slot(kids)),
            32 => format!("\\widetilde{{{}}}", self.slot(kids, 0)),
            33 => format!("\\widehat{{{}}}", self.slot(kids, 0)),
            34 => format!("\\overset{{\\frown}}{{{}}}", self.slot(kids, 0)),
            36 | 37 => self.slot(kids, 0),
            _ => {
                self.warn.insert(format!("mẫu công thức {sel}.{var}"));
                let all: Vec<String> = kids.iter().map(|k| self.of(k)).collect();
                all.join(" ")
            }
        }
    }

    fn vec_slot(&mut self, kids: &[Node]) -> String {
        match kids.first() {
            Some(Node::Line(k)) => self.content(k, true),
            Some(n) => self.of(n),
            None => String::new(),
        }
    }
}

/// Chuẩn hoá nhẹ: dấu phẩy thập phân kiểu Việt `3{,}5`, bỏ khoảng trắng thừa.
fn tidy(s: &str) -> String {
    let mut t = s.replace("\\mathrm{,}", ",").replace("\\mathrm{;}", ";").replace("\\mathrm{.}", ".");
    let b: Vec<char> = t.chars().collect();
    let mut out = String::new();
    for (i, &c) in b.iter().enumerate() {
        if c == ',' && i > 0 && i + 1 < b.len() && b[i - 1].is_ascii_digit() && b[i + 1].is_ascii_digit() {
            out.push_str("{,}");
        } else {
            out.push(c);
        }
    }
    t = out;
    while t.contains("  ") {
        t = t.replace("  ", " ");
    }
    t.trim().to_string()
}

/// Từ nội dung luồng "Equation Native" ra LaTeX (không có dấu $). Trả kèm các cảnh báo (ký tự/mẫu chưa hiểu).
pub fn to_latex(eq: &[u8]) -> Result<(String, Vec<String>), String> {
    let objs = parse(eq)?;
    let mut cv = Cv { warn: BTreeSet::new() };
    let body: Vec<String> = objs.iter().map(|o| cv.of(o)).collect();
    Ok((tidy(&body.concat()), cv.warn.into_iter().collect()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(s: &str) -> Vec<u8> {
        s.split_whitespace().map(|x| u8::from_str_radix(x, 16).unwrap()).collect()
    }

    /// Dựng một luồng "Equation Native" tối thiểu quanh phần thân MTEF.
    fn wrap(body: &str) -> Vec<u8> {
        let mut v = vec![0u8; HEAD_LEN];
        v.extend(hex("05 01 00 07 04 44 53 4d 54 37 00 01"));
        v.extend(hex(body));
        v
    }

    #[test]
    fn chu_cai_va_phan_so() {
        // \frac{1}{2}bc: FULL, LINE{ TMPL frac{ LINE{'1'} LINE{'2'} } CHAR b CHAR c }
        let eq = wrap("0a 01 00 03 00 0b 00 00 01 00 02 00 88 31 00 00 01 00 02 00 88 32 00 00 00 02 00 83 62 00 02 00 83 63 00 00 00");
        let (t, w) = to_latex(&eq).unwrap();
        assert_eq!(t, "\\frac{1}{2}bc", "{w:?}");
    }

    #[test]
    fn vecto_mu_va_ngoac() {
        // \overrightarrow{AB}=\left(1;2\right)
        let eq = wrap("0a 01 00 03 00 1f 02 00 01 00 02 00 83 41 00 02 00 83 42 00 00 00 02 00 86 3d 00 03 00 01 03 00 01 00 02 00 88 31 00 02 00 88 3b 00 02 00 88 32 00 00 00 00");
        let (t, _) = to_latex(&eq).unwrap();
        assert!(t.starts_with("\\overrightarrow{AB}="), "{t}");
        assert!(t.contains("\\left( 1;2 \\right)"), "{t}");
    }

    #[test]
    fn mu_chi_so_va_dau_thap_phan() {
        // x^2 và 3,5: CHAR x, TMPL sup{ LINE{} LINE{'2'} }
        let eq = wrap("0a 01 00 02 00 83 78 00 03 00 1c 00 00 01 00 00 01 00 02 00 88 32 00 00 00 00 02 00 88 33 00 02 00 88 2c 00 02 00 88 35 00 00");
        let (t, _) = to_latex(&eq).unwrap();
        assert_eq!(t, "x^{2}3{,}5", "{t}");
    }

    #[test]
    fn dong_rong_co_01_khong_co_ban_ghi_end() {
        // x^{0}: ô chỉ số dưới là LINE rỗng (cờ 0x01, không có END), ô chỉ số trên chứa '0'
        let eq = wrap("0a 01 00 02 00 83 78 00 03 00 1c 00 00 0b 01 01 01 00 02 00 88 30 00 00 00 00");
        let (t, _) = to_latex(&eq).unwrap();
        assert_eq!(t, "x^{0}", "{t}");
    }

    #[test]
    fn du_lieu_hong_khong_gay_panic() {
        assert!(to_latex(&[0u8; 10]).is_err());
        let mut eq = wrap("0a 01 00 03 00");
        eq.truncate(eq.len());
        assert!(to_latex(&eq).is_err());
        assert!(to_latex(&wrap("0a 01 00 63")).is_err(), "bản ghi lạ phải báo lỗi");
    }
}
