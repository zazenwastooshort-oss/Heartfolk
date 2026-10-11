# assets-src: recipes

Every picture and model is made by a script here; regenerate rather than editing output by hand. Run from the project folder:

```
A:\Blender\blender-5.2.2-windows-x64\blender.exe -b --factory-startup -P assets-src/<recipe>.py
```

| Recipe | Makes | Output | Status |
| --- | --- | --- | --- |
| `sprite_miner_v2.py` | The miner in shaped OSRS-like low-poly (faceted head, tapered limbs), 12-frame mining loop | `assets/sprites/miner_v2/` | Current direction; the owner likes it, not formally approved |
| `sprite_miner_v2_demo.py` | v2 miner walk (8 frames), idle (1) and mine (12) in 8 facings, the rock alone, and `meta.json` (anchors, where to stand to mine) | `assets/sprites/miner_v2_demo/` | Feeds `demos/miner_demo.html` |
| `village_models.py` | Placeholder village models: buildings (Bank, CityHall, Forge, Stall, StallBlue, Inn, House, HouseTall, HouseLong, Barn), props (Hearth, Lantern, Well, NoticeBoard, Bench, Crates, Garden, Fence) and nature (TreeBirch, TreeOak, TreePine, Bush), each a named root, front facing south; glowing parts use the materials window_glass, lamp_glass, forge_glow, flame | `assets/models/village.glb` | Used by the game |
| `preview_village_models.py` | A check render of every village model side by side | `assets/renders/village_models.png` | Check |
| `export_miner_glb.py` | v2 miner with a small skeleton (root, hips, head, arms, hip joints), Idle/Walk/Mine animations, a `PickTip` marker, and the rock as a separate `Rock` node, exported as glTF; `miner.json` holds animation timings | `assets/models/miner.glb` | Feeds `demos/miner_3d.html` |
| `cinematic.py` | ~42 s showcase video of the game's own `miner.glb`: clearing with trees, two rocks, day to dusk to night with a lantern, eight camera shots, title and fade (EEVEE, 1280x720, 30 fps). Run with `-- test` (a still per shot, about 20 s) or `-- full` (the MP4) | `assets/video/` | Showcase |
| `sprite_miner.py` | First sprite test: boxy low-poly miner | `assets/sprites/miner/` | Superseded by v2 (looked too much like Minecraft) |
| `sprite_miner_retro.py` | Same loop, gritty late-90s pre-rendered look | `assets/sprites/miner_retro/` | Rejected comparison |
| `sprite_miner_clean.py` | Same loop, smooth forms, no grit | `assets/sprites/miner_clean/` | Rejected comparison |
| `human_miner.py` | Realistic MakeHuman miner (MPFB, rigged, IK hands). Run with `-- still` or `-- anim` (needs `-b -P`, not `--factory-startup`, so MPFB loads) | `assets/sprites/miner_human/` | Rejected comparison |
| `smoke_test_rock.py` | One low-poly rock, to check Blender works | `assets/renders/` | Pipeline check |

The v2 demo recipe reuses the character code from `sprite_miner_v2.py` (everything above its `# Copper rock` line), so change the character there.
