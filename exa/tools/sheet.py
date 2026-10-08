"""Contact sheet of preview stills: python3 tools/sheet.py out/prev out/sheet.png [cols]"""
import os, sys
from PIL import Image, ImageDraw
d, outp = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 4
fs = sorted(f for f in os.listdir(d) if f.startswith('f') and f.endswith('.png'))
ims = [Image.open(os.path.join(d, f)).convert('RGB') for f in fs]
w, h = ims[0].size
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w, rows * (h + 14)), (40, 40, 40))
dr = ImageDraw.Draw(sheet)
for i, (f, im) in enumerate(zip(fs, ims)):
    x, y = (i % cols) * w, (i // cols) * (h + 14)
    sheet.paste(im, (x, y + 14))
    dr.text((x + 3, y + 1), f"{int(f[1:6]) / 30:.2f}s", fill=(255, 255, 255))
sheet.save(outp)
