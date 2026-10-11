"""Pack the miner demo renders into one sprite atlas and write a self-contained demo page.

Usage (Pillow needed; the ComfyUI python has it):
  A:\\ComfyUI\\ComfyUI_windows_portable\\python_embeded\\python.exe -I tools/build_demo.py
Reads assets/sprites/miner_v2_demo/ (from assets-src/sprite_miner_v2_demo.py) and demos/miner_demo.template.html,
writes demos/miner_demo.html with the atlas, the rock and their layout data embedded.
"""
import base64, io, json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "sprites" / "miner_v2_demo"
SCALE = 0.62                                   # render pixels -> demo pixels

meta = json.loads((SRC / "meta.json").read_text())
anims = meta["anims"]                          # {"idle": 1, "walk": 8, "mine": 12}
facings = len(meta["facings"])
names = [(a, f, i) for f in range(facings) for a in anims for i in range(anims[a])]
frames = {k: Image.open(SRC / f"{k[0]}_{k[1]}_{k[2]}.png").convert("RGBA") for k in names}

# One crop box for every character frame keeps the feet anchor in the same place.
box = None
for im in frames.values():
    b = im.getchannel("A").point(lambda a: 255 if a > 10 else 0).getbbox()
    if b:
        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
box = (box[0] - 2, box[1] - 2, box[2] + 2, box[3] + 2)
fw, fh = round((box[2] - box[0]) * SCALE), round((box[3] - box[1]) * SCALE)
cols = max(anims.values())
rows = [(a, f) for f in range(facings) for a in anims]
atlas = Image.new("RGBA", (cols * fw, len(rows) * fh))
for r, (a, f) in enumerate(rows):
    for i in range(anims[a]):
        im = frames[(a, f, i)].crop(box).resize((fw, fh), Image.LANCZOS)
        atlas.paste(im, (i * fw, r * fh))

def to_px(p):                                  # render pixel -> frame pixel
    return [(p[0] - box[0]) * SCALE, (p[1] - box[1]) * SCALE]

rock = Image.open(SRC / "rock.png").convert("RGBA")
rb = rock.getchannel("A").point(lambda a: 255 if a > 10 else 0).getbbox()
rb = (rb[0] - 2, rb[1] - 2, rb[2] + 2, rb[3] + 2)
rock = rock.crop(rb)
rock = rock.resize((round(rock.width * SCALE), round(rock.height * SCALE)), Image.LANCZOS)

def data_uri(im):
    buf = io.BytesIO(); im.save(buf, "WEBP", quality=88, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()

layout = {
    "frame": [fw, fh], "anchor": to_px(meta["anchor"]), "impactFrame": meta["impact_frame"],
    "rows": [f"{a}_{f}" for a, f in rows], "anims": anims,
    "facings": [{"dir": fc["screen_dir"], "stand": [fc["stand_offset"][0] * SCALE, fc["stand_offset"][1] * SCALE],
                 "impact": to_px(fc["impact_px"])} for fc in meta["facings"]],
    "rock": {"size": [rock.width, rock.height],
             "anchor": [(meta["rock_anchor"][0] - rb[0]) * SCALE, (meta["rock_anchor"][1] - rb[1]) * SCALE]},
}
html = (ROOT / "demos" / "miner_demo.template.html").read_text(encoding="utf-8")
html = html.replace("/*LAYOUT*/null", json.dumps(layout))
html = html.replace("__ATLAS__", data_uri(atlas)).replace("__ROCK__", data_uri(rock))
out = ROOT / "demos" / "miner_demo.html"
out.write_text(html, encoding="utf-8")
print(f"atlas {atlas.width}x{atlas.height}, frame {fw}x{fh}, page {out.stat().st_size // 1024} KB -> {out}")
