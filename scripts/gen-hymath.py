# Sinh src/lib/hymath.template.ts từ bộ HyMath của chủ dự án. Chạy lại khi bộ mẫu đổi:
#   python scripts/gen-hymath.py <thư mục HyMath có Caidat/ và Themes/>
import re, os, json, sys
SRC = sys.argv[1] if len(sys.argv) > 1 else 'F:/HyMath-Gon/HyMath-Gon'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'lib', 'hymath.template.ts')

def rd(p):
    return open(os.path.join(SRC, p), encoding='utf-8').read().replace('\r\n', '\n')

def fix(t):
    t = t.replace('Path=fonts/,', '').replace('[Path=fonts/]', '')
    t = re.sub(r'\\IfFileExists\{fonts/([^}]+\.otf)\}', r'\\IfFontExistsTF{\1}', t)
    t = t.replace('\\input{Caidat/theme.tex}', '\\input{hymath-core.tex}')
    # unicode-math đã định nghĩa các ký hiệu AMS (\\square, \\eth, ...); ex_test.sty của HEdu nạp amssymb sau đó sẽ báo "already defined".
    # Đánh dấu amssymb/amsfonts là đã có (cùng cách với gói vietnam) để ex_test không nạp lại.
    t = t.replace('\\usepackage{ex_test}', '\\makeatletter\n\\@namedef{ver@amssymb.sty}{2013/01/14 v3.01 provided by unicode-math}\n\\@namedef{ver@amsfonts.sty}{2013/01/14 v3.01 provided by unicode-math}\n\\makeatother\n\\usepackage{ex_test}')
    t = t.replace('\\input{Caidat/theme-adapter.tex}', '\\input{hymath-adapter.tex}')
    t = t.replace('\\IfFileExists{Themes/\\ThemeFile}{\\input{Themes/\\ThemeFile}}', '\\IfFileExists{\\ThemeFile}{\\input{\\ThemeFile}}')
    return t

core = {
    'hymath-caidat.tex': fix(rd('Caidat/caidat.tex')),
    'hymath-core.tex': fix(rd('Caidat/theme-core.tex')),
    'hymath-adapter.tex': fix(rd('Caidat/theme-adapter.tex')),
    'hymath-hopgiaidap.tex': fix(rd('Themes/macro-hop-giai-dap.tex')),
}
themes = []
for f in sorted(os.listdir(os.path.join(SRC, 'Themes'))):
    if not f.startswith('theme-'):
        continue
    t = fix(rd('Themes/' + f))
    first = t.split('\n', 1)[0]
    m = re.match(r'%\s*([^—\-]+?)\s*(—|-|$)', first)
    name = (m.group(1).strip() if m else f).title()
    themes.append((f, name, t))

for k, v in list(core.items()) + [(f, t) for f, _, t in themes]:
    assert '`' not in v and '${' not in v, k
    code = '\n'.join(re.sub(r'(?<!\\)%.*', '', l) for l in v.split('\n'))
    assert 'fonts/' not in code and 'Caidat/' not in code and 'Themes/' not in code, k

L = ['// Bộ mẫu in HyMath của chủ dự án (Nguyễn Vương Gia Hy), đưa vào HEdu 02/11/2026 — SINH TỰ ĐỘNG bằng scripts/gen-hymath.py, đừng sửa tay.',
     '// Đã sửa cho HEdu: bỏ đường dẫn Caidat/, Themes/, fonts/ (phông lấy từ TeX Live: \\IfFontExistsTF thay \\IfFileExists). Dịch bằng XeLaTeX.',
     '// Lõi: hymath-caidat.tex → hymath-core.tex (fontspec, ex_test, chế độ màu/in/lời giải) → mẫu \\ThemeFile → hymath-adapter.tex (\\TieuDeDeSo, \\TieuDeDeThi → khung tiêu đề của mẫu).',
     '/* eslint-disable */', '']
L.append('export const HYMATH_CORE: Readonly<Record<string, string>> = {')
for k, v in core.items():
    L.append(f'  {json.dumps(k)}: String.raw`{v}`,')
L.append('};')
L.append('')
L.append('export interface HyTheme { file: string; name: string; tex: string }')
L.append('export const HYMATH_THEMES: readonly HyTheme[] = [')
for f, name, t in themes:
    L.append(f'  {{ file: {json.dumps(f)}, name: {json.dumps(name, ensure_ascii=False)}, tex: String.raw`{t}` }},')
L.append('];')
open(OUT, 'w', encoding='utf-8', newline='\n').write('\n'.join(L) + '\n')
print([ (f, n) for f, n, _ in themes ])
