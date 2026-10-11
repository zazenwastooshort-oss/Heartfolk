"""Write demos/miner_3d.html: the live-3D miner demo with assets/models/miner.glb embedded.

Usage: python tools/build_demo_3d.py   (any Python 3; no extra packages)
Rebuild the model first with assets-src/export_miner_glb.py when the miner changes.
"""
import base64, json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
glb = (ROOT / "assets" / "models" / "miner.glb").read_bytes()
meta = json.loads((ROOT / "assets" / "models" / "miner.json").read_text())
html = (ROOT / "demos" / "miner_3d.template.html").read_text(encoding="utf-8")
html = html.replace("/*META*/null", json.dumps(meta)).replace("__GLB__", base64.b64encode(glb).decode())
out = ROOT / "demos" / "miner_3d.html"
out.write_text(html, encoding="utf-8")
print(f"model {len(glb) // 1024} KB, page {out.stat().st_size // 1024} KB -> {out}")
