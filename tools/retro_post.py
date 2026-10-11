"""Late-90s pre-rendered look: shrink frames, hard-edge the alpha, and share one reduced, dithered palette.

Usage: python tools/retro_post.py assets/sprites/miner_retro [frame_height] [colours] [nodither]
Writes <dir>/retro/frame_XX.png, <dir>/retro/sheet.png, <dir>/retro/preview.gif and preview_frames.png (2x, on dirt).
"""
import sys
from pathlib import Path
from PIL import Image

src = Path(sys.argv[1])
target_h = int(sys.argv[2]) if len(sys.argv) > 2 else 120
colours = int(sys.argv[3]) if len(sys.argv) > 3 else 96
dither = Image.Dither.NONE if len(sys.argv) > 4 and sys.argv[4] == "nodither" else Image.Dither.FLOYDSTEINBERG
out = src / "retro"; out.mkdir(exist_ok=True)

frames = [Image.open(p).convert("RGBA") for p in sorted(src.glob("frame_*.png"))]
box = None
for f in frames:
    b = f.getchannel("A").point(lambda a: 255 if a > 40 else 0).getbbox()
    box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
box = (box[0] - 4, box[1] - 4, box[2] + 4, box[3] + 4)
frames = [f.crop(box) for f in frames]
scale = target_h / frames[0].height
size = (round(frames[0].width * scale), target_h)
small = [f.resize(size, Image.LANCZOS) for f in frames]

# One palette for every frame, so colours don't flicker between frames.
strip = Image.new("RGB", (size[0] * len(small), size[1]), (0, 0, 0))
for i, f in enumerate(small):
    bg = Image.new("RGB", size, (0, 0, 0)); bg.paste(f, mask=f.getchannel("A").point(lambda a: 255 if a > 127 else 0))
    strip.paste(bg, (i * size[0], 0))
opaque = Image.new("RGB", (1, 1))
pal_img = strip.quantize(colors=colours, method=Image.Quantize.MEDIANCUT)

sheet = Image.new("RGBA", strip.size)
dirt = (122, 104, 74)
previews = []
for i, f in enumerate(small):
    mask = f.getchannel("A").point(lambda a: 255 if a > 127 else 0)
    rgb = Image.new("RGB", size, (0, 0, 0)); rgb.paste(f.convert("RGB"), mask=mask)
    q = rgb.quantize(palette=pal_img, dither=dither).convert("RGB")
    fr = q.convert("RGBA"); fr.putalpha(mask)
    fr.save(out / f"frame_{i:02d}.png"); sheet.paste(fr, (i * size[0], 0))
    bg = Image.new("RGBA", size, dirt + (255,)); bg.alpha_composite(fr)
    previews.append(bg.convert("RGB").resize((size[0] * 3, size[1] * 3), Image.NEAREST))
sheet.save(out / "sheet.png")
dur = [90] * len(previews); dur[0] = 180
previews[0].save(out / "preview.gif", save_all=True, append_images=previews[1:], duration=dur, loop=0)
pf = Image.new("RGB", (size[0] * 2 * len(small), size[1] * 2), dirt)
for i, p in enumerate(previews):
    pf.paste(p.resize((size[0] * 2, size[1] * 2), Image.NEAREST), (i * size[0] * 2, 0))
pf.save(out / "preview_frames.png")
print(f"{len(small)} frames at {size[0]}x{size[1]}, {colours} colours -> {out}")
