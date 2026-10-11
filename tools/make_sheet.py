"""Turn rendered frames into a sprite sheet and a preview GIF.

Usage: python tools/make_sheet.py assets/sprites/miner [ms_per_frame]
Writes <dir>/sheet.png (frames in one row, transparent), <dir>/preview.gif (on grass) and <dir>/preview_frames.png.
Needs Pillow (the ComfyUI python at A:\\ComfyUI\\ComfyUI_windows_portable\\python_embeded has it).
"""
import sys
from pathlib import Path
from PIL import Image

src = Path(sys.argv[1])
ms = int(sys.argv[2]) if len(sys.argv) > 2 else 90
frames = [Image.open(p).convert("RGBA") for p in sorted(src.glob("frame_*.png"))]
w, h = frames[0].size

# Trim every frame to the same box: the union of all frames' visible pixels.
box = None
for f in frames:
    b = f.getchannel("A").point(lambda a: 255 if a > 40 else 0).getbbox()
    if b:
        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
pad = 6
box = (max(0, box[0] - pad), max(0, box[1] - pad), min(w, box[2] + pad), min(h, box[3] + pad))
frames = [f.crop(box) for f in frames]
fw, fh = frames[0].size

sheet = Image.new("RGBA", (fw * len(frames), fh))
for i, f in enumerate(frames):
    sheet.paste(f, (i * fw, 0))
sheet.save(src / "sheet.png")

grass = (92, 160, 74, 255)   # summer grass, docs/PLAN.md palette
on_grass = []
for f in frames:
    bg = Image.new("RGBA", f.size, grass); bg.alpha_composite(f); on_grass.append(bg.convert("RGB"))
big = [im.resize((fw * 2, fh * 2), Image.LANCZOS) for im in on_grass]
durations = [ms] * len(big)
durations[0] = ms * 2
big[0].save(src / "preview.gif", save_all=True, append_images=big[1:], duration=durations, loop=0)

strip = Image.new("RGB", (fw * len(frames), fh), grass[:3])
for i, im in enumerate(on_grass):
    strip.paste(im, (i * fw, 0))
strip.save(src / "preview_frames.png")
print(f"{len(frames)} frames, {fw}x{fh} each -> sheet.png, preview.gif, preview_frames.png")
