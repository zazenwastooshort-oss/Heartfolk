# tools: scripts that turn renders into usable files

These need Pillow; the ComfyUI python has it: `A:\ComfyUI\ComfyUI_windows_portable\python_embeded\python.exe -I tools/<script>.py ...`

| Script | Does | Usage |
| --- | --- | --- |
| `web_page.mjs` | Turns the web build (`dist-web/index.html`) into `dist-web/hearthfolk-camp.html` for the camp game's artifact link (removes the outer html/head/body tags the host supplies, puts the title first) and `dist-web/preview.html` for local testing. Plain Node, no packages | Run by `npm run build:web` |
| `build_demo.py` | Packs `assets/sprites/miner_v2_demo/` into one WebP atlas and writes `demos/miner_demo.html` from the template | `tools/build_demo.py` |
| `build_demo_3d.py` | Embeds `assets/models/miner.glb` in `demos/miner_3d.template.html`, writing `demos/miner_3d.html` (plain Python, no Pillow needed) | `tools/build_demo_3d.py` |
| `make_sheet.py` | Frames to a transparent sprite sheet plus a preview GIF on grass | `tools/make_sheet.py assets/sprites/<dir> [ms_per_frame]` |
| `retro_post.py` | Shrinks frames and reduces them to one shared palette (optionally dithered) | `tools/retro_post.py assets/sprites/<dir> [height] [colours] [nodither]` |
