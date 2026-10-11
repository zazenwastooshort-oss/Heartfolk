# assets: generated output

Everything here comes from a recipe in `assets-src/` (see its README for which). Never edit by hand; change the recipe and re-render.

- `sprites/<name>/`: rendered frames (`frame_XX.png`, transparent), plus `sheet.png` and `preview.gif` where `tools/make_sheet.py` was run, or `retro/` from `tools/retro_post.py`.
- `sprites/miner_v2_demo/`: per-facing frames named `<anim>_<facing>_<frame>.png`, `rock.png` and `meta.json`.
- `models/village.glb`: the placeholder village models (from `assets-src/village_models.py`).
- `models/miner.glb`: the v2 miner and rock as a 3D model with animations, plus `miner.json` (animation timings).
- `video/`: the cinematic (`hearthfolk_cinematic.mp4`) and its per-shot test stills.
- `renders/`: one-off check renders.
