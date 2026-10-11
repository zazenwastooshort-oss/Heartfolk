# src: the game

TypeScript, built by Vite into one file, `dist/index.html`. Rules from `CLAUDE.md`: systems change state, rendering only reads it, the UI only sends commands, modules announce events.

| Folder or file | Holds |
| --- | --- |
| `core/` | `state.ts` (the saved game), `loop.ts` (fixed 1/30 s step), `events.ts` (event bus), `rng.ts` (seeded randomness), `clock.ts` (time of day, 12-minute days), `save.ts` (versioned saves with migrations) |
| `data/` | Tables only: `skills.ts` (skills, resources and their models, items, from the Wanderskill prototype), `xp.ts` (the 1-99 curve), `animation.ts` (each skill's swing: clip, tool, timings and standing distance, from `assets/models/miner.json`), `hauling.ts` (backpack size), `changelog.ts` (what changed in each version, in players' words, for the "What's new" note) |
| `world/layout.ts` | The village (VILLAGE), in rings from the square: buildings (each kind has a ring in `RING`), props, gardens, rocks and trees to work (nodes), scenery trees, lanterns, river, roads and lanes, the land under fog |
| `world/nav.ts` | Walking: a grid of where a person can stand, A* paths and straight-line smoothing; everything that blocks goes here |
| `actors/player.ts` | Walking to a tap, to a rock or tree (stand within the tool's reach), to a building's door or the edge of unclaimed land |
| `systems/` | `gathering.ts` (swings, yields into the backpack, rocks and trees running out and growing back, moving on), `backpack.ts` (the backpack and the bank), `hauling.ts` (a full backpack walked to the bank and back to work; tapping the bank), `skills.ts` (XP, level-ups), `commands.ts` (the UI's only way in) |
| `sim.ts` | One simulation step; headless, used by the game and the tests |
| `render/` | three.js: `view.ts` (the character and his tools, the click cross), `arms.ts` (whether the tool is in his hands or on his back, and keeps his hands on the handle when clips crossfade), `nodes.ts` (rocks and trees: running out, falling, stumps, growing back, chips and leaves), `world.ts` (ground, paths, river), `village.ts` (buildings, trees, lanterns, hearth, night glow, merged per material), `fog.ts` (mist over unclaimed land), `lighting.ts` (day and night), `camera.ts` (third-person orbit) |
| `ui/` | `input.ts` (tap, drag, pinch, keys), `hud.ts` (panels, floating numbers), `news.ts` ("What's new" after an update; the version button) |
| `main.ts` | Wires it all together; `window.hearthfolk` exposes state and view for checking in the browser console |

Tests are in `tests/`; the long headless run in `tests/play.test.ts` is the start of the plan's multi-day simulation check. `tests/architecture.test.ts` enforces the module boundaries: each folder may only import from the layers listed there, the simulation layers may not touch three.js or the page, and `render/` and `ui/` may not assign to game state. If it fails, move the code to the right layer rather than loosening the rule.
