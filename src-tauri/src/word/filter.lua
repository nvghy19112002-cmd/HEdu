-- Bộ lọc Pandoc cho xuất Word của HEdu: dựng bố cục đề (khung tên, PHẦN I/II/III, "Câu N.", phương án A–D, ý a)–d), lời giải).
-- Tham số (metadata): solution = "1" kèm lời giải; mark = "1" tô đáp án đúng (bản giáo viên); made = mã đề.
local S = pandoc.utils.stringify
local solution = false
local mark = false
local made = ''
local warned = {}

local function has_class(b, c)
  if b.t ~= 'Div' then return false end
  for _, k in ipairs(b.classes) do if k == c then return true end end
  return false
end

local function div_class(b)
  if b.t ~= 'Div' then return nil end
  return b.classes[1]
end

-- Gỡ dấu \True khỏi một danh sách inline; trả về (inline mới, có dấu đúng không)
local function take_true(inlines)
  local found = false
  local out = pandoc.List()
  for _, il in ipairs(inlines) do
    if il.t == 'Strong' and #il.content == 1 and il.content[1].t == 'Str' and il.content[1].text == '[[T]]' then
      found = true
    elseif il.t == 'Str' and il.text:find('%[%[T%]%]') then
      found = true
      local t = il.text:gsub('%[%[T%]%]', '')
      if t ~= '' then out:insert(pandoc.Str(t)) end
    else
      out:insert(il)
    end
  end
  return out, found
end

local function styled(style, para)
  return pandoc.Div({ para }, pandoc.Attr('', {}, { ['custom-style'] = style }))
end

local function first_inlines(blocks)
  local b = blocks[1]
  if b and (b.t == 'Para' or b.t == 'Plain') then return b.content end
  return nil
end

local function plain_len(blocks)
  return #S(pandoc.Div(blocks))
end

local function sty(name, text)
  return pandoc.Span({ pandoc.Str(text) }, pandoc.Attr('', {}, { ['custom-style'] = name }))
end

local function label_inline(text, correct)
  if mark and correct then return sty('HeduDung', text) end
  return sty('HeduNhan', text)
end

-- Dựng nội dung một ô: "A." + nội dung
local function labelled(text, blocks, correct)
  local out = pandoc.List()
  for i, b in ipairs(blocks) do
    if i == 1 and (b.t == 'Para' or b.t == 'Plain') then
      local c = pandoc.List({ label_inline(text, correct), pandoc.Space() })
      c:extend(b.content)
      out:insert(pandoc.Para(c))
    else
      out:insert(b)
    end
  end
  if #out == 0 then out:insert(pandoc.Para({ label_inline(text, correct) })) end
  return out
end

local function borderless_table(rows, ncols)
  local aligns, widths = {}, {}
  for i = 1, ncols do aligns[i] = pandoc.AlignLeft; widths[i] = 1 / ncols end
  local headers = {}
  for i = 1, ncols do headers[i] = {} end
  local t = pandoc.SimpleTable(pandoc.List(), aligns, widths, headers, rows)
  local tb = pandoc.utils.from_simple_table(t)
  tb.attr = pandoc.Attr('', {}, { ['custom-style'] = 'HeduPlain' })
  -- bỏ hàng tiêu đề rỗng
  tb.head = pandoc.TableHead({})
  return tb
end

local function options_block(opts)
  -- opts: { {text=,blocks=,correct=}, ... } đúng 4 phương án
  local maxlen = 0
  for _, o in ipairs(opts) do maxlen = math.max(maxlen, plain_len(o.blocks)) end
  local cols = 1
  if maxlen <= 16 then cols = 4 elseif maxlen <= 38 then cols = 2 end
  local rows = {}
  local cells = {}
  for _, o in ipairs(opts) do cells[#cells + 1] = labelled(o.text, o.blocks, o.correct) end
  for i = 1, #cells, cols do
    local row = {}
    for j = 0, cols - 1 do row[#row + 1] = cells[i + j] or { pandoc.Plain({}) } end
    rows[#rows + 1] = row
  end
  return borderless_table(rows, cols)
end

local function strip_true_blocks(blocks)
  local out = pandoc.List()
  local found = false
  for i, b in ipairs(blocks) do
    if i == 1 and (b.t == 'Para' or b.t == 'Plain') then
      local c, f = take_true(b.content)
      found = f
      -- bỏ khoảng trắng đầu
      while #c > 0 and (c[1].t == 'Space' or c[1].t == 'SoftBreak') do c:remove(1) end
      out:insert(pandoc.Para(c))
    else
      out:insert(b)
    end
  end
  return out, found
end

local function collect(blocks, acc)
  for _, b in ipairs(blocks) do
    local k = div_class(b)
    if k and k:match('^opt[ABCD]$') then
      local bl, ok = strip_true_blocks(b.content)
      acc.opts[#acc.opts + 1] = { text = k:sub(4) .. '.', blocks = bl, correct = ok }
    elseif k and k:match('^tf[ABCD]$') then
      local bl, ok = strip_true_blocks(b.content)
      local idx = string.byte(k:sub(3)) - string.byte('A') + 1
      acc.tfs[#acc.tfs + 1] = { text = string.char(string.byte('a') + idx - 1) .. ')', blocks = bl, correct = ok }
    elseif k == 'sans' then
      acc.sans = S(pandoc.Div(b.content))
    elseif k == 'lgiai' then
      acc.lg = b.content
    elseif k == 'imm' then
      for _, c in ipairs(b.content) do
        local kk = div_class(c)
        if kk == 'immL' then collect(c.content, acc)
        elseif kk == 'immR' then acc.side = acc.side or pandoc.List(); acc.side:extend(c.content) end
      end
    else
      acc.stem:insert(b)
    end
  end
end

local function stack_options(opts)
  -- mỗi phương án một dòng (dùng khi có hình bên cạnh)
  local out = pandoc.List()
  for _, o in ipairs(opts) do out:extend(labelled(o.text, o.blocks, o.correct)) end
  return out
end


-- enumerate[label=\alph*)] của ex_test: Pandoc không đọc được nhãn, nên đổi danh sách đánh số ở cấp 1 trong câu thành a), b), c)…
local function alpha_lists(blocks, depth)
  return pandoc.List(blocks):map(function(b)
    if b.t == 'OrderedList' then
      local style = depth == 0 and 'LowerAlpha' or 'Decimal'
      local delim = 'OneParen'
      b.listAttributes = pandoc.ListAttributes(b.listAttributes.start or 1, style, delim)
      b.content = b.content:map(function(item) return alpha_lists(item, depth + 1) end)
    elseif b.t == 'BulletList' then
      b.content = b.content:map(function(item) return alpha_lists(item, depth + 1) end)
    elseif b.t == 'Div' then
      b.content = alpha_lists(b.content, depth)
    end
    return b
  end)
end

local function convert_ex(div, num)
  local acc = { stem = pandoc.List(), opts = {}, tfs = {}, sans = nil, lg = nil, side = nil }
  collect(alpha_lists(div.content, 0), acc)
  local stem, opts, tfs, sans, lg = acc.stem, acc.opts, acc.tfs, acc.sans, acc.lg
  local main = pandoc.List()
  local head = pandoc.List({ sty('HeduCauSo', 'Câu ' .. num .. '.'), pandoc.Space() })
  if #stem > 0 and (stem[1].t == 'Para' or stem[1].t == 'Plain') then
    head:extend(stem[1].content)
    main:insert(styled('HeduCau', pandoc.Para(head)))
    for i = 2, #stem do main:insert(stem[i]) end
  else
    main:insert(styled('HeduCau', pandoc.Para(head)))
    main:extend(stem)
  end
  if #opts == 4 then
    if acc.side then main:extend(stack_options(opts)) else main:insert(options_block(opts)) end
  end
  for _, t in ipairs(tfs) do main:extend(labelled(t.text, t.blocks, t.correct)) end
  local out = pandoc.List()
  if acc.side then
    local t = pandoc.SimpleTable(pandoc.List(), { pandoc.AlignLeft, pandoc.AlignCenter }, { 0.62, 0.38 }, { {}, {} }, { { main, acc.side } })
    local tb = pandoc.utils.from_simple_table(t)
    tb.attr = pandoc.Attr('', {}, { ['custom-style'] = 'HeduPlain' })
    tb.head = pandoc.TableHead({})
    out:insert(tb)
  else
    out:extend(main)
  end
  if #tfs > 0 and mark then
    local key = {}
    for _, t in ipairs(tfs) do key[#key + 1] = t.correct and 'Đ' or 'S' end
    out:insert(styled('HeduDapAn', pandoc.Para({ pandoc.Emph({ pandoc.Str('Đáp án: ' .. table.concat(key, ' ')) }) })))
  end
  if sans and mark then
    out:insert(styled('HeduDapAn', pandoc.Para({ pandoc.Emph({ pandoc.Str('Đáp án: ' .. sans) }) })))
  end
  if solution and lg then
    local c = pandoc.List({ sty('HeduLG', 'Lời giải.'), pandoc.Space() })
    if #lg > 0 and (lg[1].t == 'Para' or lg[1].t == 'Plain') then
      c:extend(lg[1].content)
      out:insert(styled('HeduLoiGiai', pandoc.Para(c)))
      for i = 2, #lg do
        if lg[i].t == 'Para' or lg[i].t == 'Plain' then out:insert(styled('HeduLoiGiai', pandoc.Para(lg[i].content))) else out:insert(lg[i]) end
      end
    else
      out:insert(styled('HeduLoiGiai', pandoc.Para(c)))
      out:extend(lg)
    end
    for i, o in ipairs(opts) do
      if o.correct then
        out:insert(styled('HeduLoiGiai', pandoc.Para({ pandoc.Str('Chọn đáp án '), sty('HeduDo', string.char(64 + i)), pandoc.Str('.') })))
        break
      end
    end
  end
  return out
end

local ROMAN = { 'I', 'II', 'III', 'IV', 'V', 'VI' }
local PHAN = {
  lc = function(n) return 'Câu trắc nghiệm nhiều phương án lựa chọn.', ' Thí sinh trả lời từ câu 1 đến câu ' .. n .. '. Mỗi câu hỏi thí sinh chỉ chọn một phương án.' end,
  ds = function(n) return 'Câu trắc nghiệm đúng sai.', ' Thí sinh trả lời từ câu 1 đến câu ' .. n .. '. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.' end,
  kq = function(n) return 'Câu trắc nghiệm trả lời ngắn.', ' Thí sinh trả lời từ câu 1 đến câu ' .. n .. '.' end,
  tl = function(n) return 'Câu tự luận.', ' Thí sinh trình bày lời giải từ câu 1 đến câu ' .. n .. '.' end,
}

local function header_table(div)
  local L, R = pandoc.List(), pandoc.List()
  local title, subject = '', ''
  for _, b in ipairs(div.content) do
    local k = div_class(b)
    if k == 'hdL' or k == 'hdR' then
      for _, p in ipairs(b.content) do
        if (p.t == 'Para' or p.t == 'Plain') and S(p) ~= '' then
          local t = S(p)
          if k == 'hdL' then
            L:insert(styled('HeduTruong', pandoc.Para(p.content)))
          else
            local st = 'HeduNam'
            if title == '' then st = 'HeduTieuDe'; title = t
            elseif t:match('^Môn') or t:match('^MÔN') then st = 'HeduMon'; subject = t:gsub('^[^:]*:%s*', '')
            elseif t:match('^Thời gian') then st = 'HeduTG' end
            R:insert(styled(st, pandoc.Para(p.content)))
          end
        end
      end
    end
  end
  local head = pandoc.text.upper(pandoc.text.sub(title, 1, 1)) .. pandoc.text.lower(pandoc.text.sub(title, 2))
  if subject ~= '' then head = head .. ' – ' .. subject end
  if head ~= '' then io.stderr:write('HEDU-DAU-TRANG ' .. head .. '\n') end
  L:insert(styled('HeduBox', pandoc.Para({ pandoc.Str('ĐỀ KIỂM TRA') })))
  local aligns = { pandoc.AlignCenter, pandoc.AlignCenter }
  local t = pandoc.SimpleTable(pandoc.List(), aligns, { 0.5, 0.5 }, { {}, {} }, { { L, R } })
  local tb = pandoc.utils.from_simple_table(t)
  tb.attr = pandoc.Attr('', {}, { ['custom-style'] = 'HeduPlain' })
  tb.head = pandoc.TableHead({})
  local dots = string.rep('…', 10)
  local who = pandoc.List({ pandoc.Str('Họ và tên thí sinh: ' .. dots .. '  Số báo danh: ' .. dots .. '  ') })
  if made ~= '' then who:insert(sty('HeduMa', ' MÃ ĐỀ ' .. made .. ' ')) end
  return pandoc.List({
    tb,
    styled('HeduHoTen', pandoc.Para(who)),
    styled('HeduKe', pandoc.Para({ pandoc.Str('') })),
  })
end

function Pandoc(doc)
  local m = doc.meta
  solution = m.solution ~= nil and S(m.solution) == '1'
  mark = m.mark ~= nil and S(m.mark) == '1'
  made = m.made and S(m.made) or ''
  -- đếm số câu của từng phần
  local counts, cur, order = {}, 0, {}
  for _, b in ipairs(doc.blocks) do
    if has_class(b, 'phan') then cur = cur + 1; counts[cur] = 0
    elseif has_class(b, 'ex') then
      if cur == 0 then cur = 1; counts[1] = 0 end
      counts[cur] = counts[cur] + 1
    end
  end
  local out = pandoc.List()
  local phan, num = 0, 0
  for _, b in ipairs(doc.blocks) do
    if has_class(b, 'hd') then
      out:extend(header_table(b))
    elseif has_class(b, 'phan') then
      phan = phan + 1; num = 0
      local kind = S(b)
      local f = PHAN[kind] or PHAN.lc
      local title, rest = f(counts[phan] or 0)
      out:insert(styled('HeduPhan', pandoc.Para({ sty('HeduPhanT', 'PHẦN ' .. (ROMAN[phan] or tostring(phan)) .. '. ' .. title), sty('HeduPhanI', rest) })))
    elseif has_class(b, 'ex') then
      num = num + 1
      out:extend(convert_ex(b, num))
    else
      out:insert(b)
    end
  end
  doc.blocks = out
  return doc
end

-- Báo các lệnh LaTeX mà Word không hiểu (bị bỏ khi xuất)
function RawInline(el)
  if el.format == 'latex' or el.format == 'tex' then
    local k = el.text:match('^\\(%a+)')
    if k and not warned[k] then
      warned[k] = true
      io.stderr:write('HEDU-CANH-BAO lệnh \\' .. k .. '\n')
    end
  end
end
