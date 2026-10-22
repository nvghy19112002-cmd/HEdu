"""Tạo bộ icon cho app (chạy khi muốn đổi logo): python3 scripts/make-icons.py
Logo tạm: nền bảng đen, dấu căn màu đỏ bút chấm bài. Thay bằng logo thật sau."""
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'src-tauri', 'icons')
os.makedirs(OUT, exist_ok=True)
S = 1024
INK = (26, 34, 48, 255)
CREAM = (244, 241, 234, 255)
RED = (200, 64, 42, 255)

img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([64, 64, S - 64, S - 64], radius=210, fill=INK)

# dấu căn: nét ngắn đi xuống, nét dài đi lên, thanh ngang phía trên
w = 66
pts = [(250, 560), (340, 520), (450, 760), (640, 250), (800, 250)]
d.line(pts, fill=CREAM, width=w, joint='curve')
for p in (pts[0], pts[-1], pts[1], pts[2], pts[3]):
    d.ellipse([p[0] - w // 2, p[1] - w // 2, p[0] + w // 2, p[1] + w // 2], fill=CREAM)
# chấm đỏ như nét bút chấm bài
d.ellipse([700, 600, 800, 700], fill=RED)

def save(size, name):
    img.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name))

save(32, '32x32.png')
save(128, '128x128.png')
save(256, '128x128@2x.png')
save(512, 'icon.png')
img.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, 'icon.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('icons ->', os.path.abspath(OUT))
