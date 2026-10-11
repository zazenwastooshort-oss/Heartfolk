# demos: playable tests

| File | What |
| --- | --- |
| `miner_demo.template.html` | The click-to-move mining demo: edit this one |
| `miner_demo.html` | Built page with the sprites embedded; never edit, rebuild with `tools/build_demo.py` |
| `miner_3d.template.html` | The same demo in live 3D (three.js r147 from jsDelivr): real shadows, zoom, day/dusk/night with a lantern, and a camera switch (overhead angles, isometric, Follow over the shoulder, OSRS-style 3rd person orbit). Edit this one |
| `miner_3d.html` | Built 3D page with `assets/models/miner.glb` embedded; rebuild with `tools/build_demo_3d.py` |

Published (private to the owner): sprite version https://claude.ai/artifact/M6SNaMagAYSmf8xgkHzWzh, live 3D version https://claude.ai/artifact/FwDrpH7Zbbdgz1o4ZVFXkv. Republish the built file to the same link after rebuilding.

To test locally: the "demos" entry in `.claude/launch.json` serves this folder at http://localhost:8765/miner_demo.html.

Rebuild after changing the miner: sprite version, run `assets-src/sprite_miner_v2_demo.py` in Blender (about 1.5 minutes), then `tools/build_demo.py`; 3D version, run `assets-src/export_miner_glb.py` (seconds), then `tools/build_demo_3d.py`.
