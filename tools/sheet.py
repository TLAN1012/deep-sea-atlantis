"""Contact sheet of processed assets on a blue background (to check cut-outs). sheet.py out.png [names...]"""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
man = json.loads((ROOT / "assets/manifest.json").read_text())
names = sys.argv[2:] or list(man)
cell = 256
cols = min(6, len(names))
rows = (len(names) + cols - 1) // cols
sheet = Image.new("RGB", (cols * cell, rows * (cell + 18)), (22, 70, 120))
d = ImageDraw.Draw(sheet)
for i, n in enumerate(names):
    im = Image.open(ROOT / man[n]["file"]).convert("RGBA")
    im.thumbnail((cell - 8, cell - 8))
    x, y = (i % cols) * cell, (i // cols) * (cell + 18)
    sheet.paste(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2), im)
    d.text((x + 4, y + cell + 2), n, fill=(255, 255, 255))
sheet.save(sys.argv[1])
