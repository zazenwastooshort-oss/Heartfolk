# Camp build: final implementation plan

This plan was made read-only: nothing in `A:\Hearthfolk` was changed. It was checked against main **b79fa08**, which is game 0.0.30 with the needs build merged at 03:35. On that commit the typecheck is clean with both configs, and 748 tests in 35 files pass (outputs: `...\scratchpad\campplan\typecheck_030.txt`, `vitest_030.txt`). The `wt/camp` worktree already exists on branch `camp` at b79fa08 and is clean. Line numbers move as work lands, so builders work from the stage 0 greps, not from the numbers in this plan.

## For the owner's question: how long, and will it be done by 06:00?

**No, it won't be done by 06:00.** It should finish around early to mid afternoon. The reasons:

- **Start.** The needs build went into main at 03:35 and main is green, so the camp build can start at about 04:00. That leaves a few minutes to send the owner the questions at the end of this plan.
- **Size.** This is the largest build so far. It is one worktree, worked stage after stage. It touches about 40 source files and about 20 test files. It also needs a set of old saves taken from five released versions and checks in the game at six screen sizes.

| Stage | Estimate |
|---|---|
| 0. Setup, and old saves frozen from the release tags | 30–45 min |
| 1. Ground work: data, world, core, saves | 75–105 min |
| 2. Everything built in stages | 70–100 min |
| 3. The chest at the shelter's door | 60–80 min |
| 4. Drawing | 80–110 min |
| 5. Build tab, menu, taps | 70–90 min |
| 6. Whole-camp check in the game | 45–60 min |
| 7. Docs, version, pacing | 25–35 min |
| Reviews from several angles, then fixes | 1.5–2 h |

- **Total.** About 9 to 12½ hours, so it finishes around 13:00 to 16:30. If the owner says yes to Q1 or Q2 below, add about 1 to 1½ hours.
- **At 06:00.** Stage 0 will be done and stage 1 most of the way through. That is headless work only, so there is nothing new to see in the game yet.
- **First look.** A rough look on the local preview comes after stage 2, around 07:30–08:30, with placeholder boxes. The real models come after stage 4, late morning.
- **No rushing.** The owner said "timing is irrelevant… no rushing", so the estimate gets no cuts.
- **Publishing.** This follows the owner's 13 Oct rule. A finished build goes to the game link without asking. Finished means: the full check and the bot pass, it has been looked at in the game, it has a version bump and "What's new" notes, and an "in / not in / open questions" list goes on the plan board and in chat.
- **Sent to the owner now.** PLAN.md's 13 Oct rule says the "not included" list goes to the owner before the team starts. So Q1 and Q2, plus the lead's defaults list (D4, D8, D11–D14, the woodpile spot move, save format 12), go to the owner with this answer. Neither question holds up stages 0 to 5.

## What the critique changed

**Taken in** (details are in the stages):

- **Timing.** The arithmetic was corrected, and the publishing rule is the 13 Oct one.
- **Layers.**
  - The menu's checks move down into core: `canCook`, `fishToCook`, `stores`, `isStore` and `canStoke`. Systems re-export them.
- **Following the brief's own words** (so there is nothing to ask the owner):
  - **D9:** after a ground tap he also comes back, after a short wait. The hold flag is gone.
  - **D10:** a day tap on the shelter always opens the chest once it stands.
  - **Spit:** the hearth keeps its spit with fish.
- **Other fixes.**
  - `canSleep` counts any shelter step.
  - `updateBuilding` uses `def.needs[def.pile]`.
  - The survival book's Making pages count a begun building as paid.
  - Each make can say where it stands (`MAKE_WHERE`), for the chest.
  - `SHAPES.turn` is added for the hearth.
  - `PLACE.water` is kept as `LAYOUT_GAP`.
  - `SOURCES` gets lines for stones and logs (T9.2).
  - The chest becomes furniture only in stage 3.
  - Stage 2 gets stopgaps: the ring fill and the outline hiding.
  - The `render/cooking.ts` spit follows the hearth.
  - The woodshed's axe is dropped.
  - A "Store everything" button is added.
  - The Build tab gets empty states.
  - Long press gets feedback, entries at least 44 px tall, and a rule for right-button drags.
  - A test checks the old step against the new one for clipping.
  - Work stands come from the strike's reach.
  - The door gets slack.
  - The playthrough checks positions against `walkGrid`.
  - Beginning a build while standing inside its footprint is covered.
  - The resume rule backs off after a failed path.
  - Away catch-up, T4.3, T7.4, T8.6, T8.7, T9.2 and T11.3 now have stages.
  - The camera orbit and the 44 px marker check are in the game checks.
- **Saves.**
  - Fixtures are frozen from the release tags.
  - The migration never throws on a missing field.
  - A save that can't be read is kept under a backup key.
  - The load nudge keeps sleep and building.
  - Every camp visit is re-pathed on load.
  - A damaged save keeps one build under way.
- **Process.** D1–D26 go into the decision log marked as the lead's defaults. Reviewer 5 looks only for clearly broken visuals. The test line numbers are replaced by greps.

**Rejected:**

1. **"Deleting `PlacedRect`/`placedRects` breaks compilation in 16 test files."** Only `tests/building.test.ts` imports `placedRects`. The other tests call `navFor(layout, built)` with two arguments, and that still compiles once the third parameter becomes `begun`. What does break is assertions about the old chest spot and old sizes, and stage 3 lists those.
2. **"The campfire's blocked radius shrinks from 1.2 to 0.62, unflagged; campfire visits keep stale paths."** The camp's hearth site already has radius 0.62 (`world/camp.ts`), so nothing changes. Only the woodpile moves.
3. **"The needs branch is still mid-merge, so start later."** That has been overtaken: it merged at 03:35 and main is green.
4. **"Keyboard and TV have no way to open the menu."** The Build tab's rows are buttons and cover Upgrade and Carry on. Look in is the Backpack window. The TV is an ambient screen. No keyboard menu in this build; the report says so.
5. **Routing `core/rats.ts` and `core/goblins.ts` through `walkGrid`** (the first draft's idea). They keep today's exemption instead: creatures never come near the camp's spots, and T11.1 now checks that the largest steps stay clear of every nest's roam area and the goblin camp. This needs no signature changes.
6. **"Send D9, D10, the spit fish and D4 to the owner before the build."** D9, D10 and the spit now follow the brief's words, so nothing is left to ask. D4 is today's rule (upgrades after the chest, since 0.0.27). It is one data value and goes on the defaults list, not as a question that holds up the build.

## The shape of the solution

1. **One table of steps.** `data/building.ts` gains:
   - **`LINES`:**
     - `hearth: ['campfire','stone_hearth']`
     - `tent: ['shelter','wall_tent','log_cabin']`
     - `woodpile: ['woodpile','woodshed']`
     - `dummy: ['dummy']`
   - **`SHAPES[id]`**, in the spot's own frame (+z faces the fire):
     - `at`: offset along the facing;
     - `turn`: radians added to the facing (the stone hearth uses 0.35; the hearth spot's own facing is 0);
     - `blocks`: boxes and rings;
     - `reach` and `tall`: for the ring and the tap area;
     - `stands`: work and use points;
     - shelters: `chest` (where the chest sits);
     - the stone hearth: `spit` (where the cooking stick goes);
     - the chest: `furniture: true` from stage 3.
2. **Nested footprints.** Every step's footprint lies inside the next step's (T11.5). Walking blocks every built or begun id by its own shape: `navFor(layout, built, begun)`, used through `walkGrid(state, layout)`.
3. **One headless place for camp places: `core/camp.ts`.** It holds:
   - `outermost`, `shelterDoor`, `chestHere`, `useSpot`, `tapBoxOf`, `campActions`, `campTap`;
   - the predicates moved down from systems: `canCook`, `fishInChest`, `fishToCook`, `stores`, `isStore`, `canStoke`. Systems re-export them, so callers don't change.

   Render and UI only read core. `CampAction` is core's own type; the UI maps it to a `Command` (a type-only import from systems).
4. **`'chest'` stays** as the MakeId, the visit id, the store id and `Stoke.from`, but it no longer has a site. Visits to `'chest'` and to `'shelter'` both end at `shelterDoor`. A visit to `'shelter'` never stores.
5. **A begun goal building counts as paid.** `goalPaid(state, goal)` is used by:
   - `goalLines`, `goalHasEnough`, `forGoal`, `wantsOf`;
   - the goal card, the bot's `plan()`;
   - the survival book's Making pages (`core/survival.ts`).
6. **Commitment.**
   - Needs are taken at the press (D7).
   - One build is under way at a time (D8).
   - He goes back after anything that sent him elsewhere, once that thing ends by itself (D9). A plain walk ends on arrival and is followed by `RESUME.wait`.
   - `GameState.resumeAt` handles the wait and the back-off after a failed path. It is read back as 0, and there is no hold flag.
7. **`canSleep`** is true when any `SHELTERS` step stands at the tent spot.
8. **Save format 11 becomes 12** with one guarded migration (D13). A save that can't be read is kept under a backup key before a new game would overwrite it.
9. **The placing code is removed** (D17).
10. **Starting layout numbers** (rough, then tuned by the stage 1 layout tests):
    - **Tent:** stays at its spot.
    - **Wall tent:** `at -0.7`; door at about (-0.08, 4.74).
    - **Log cabin:** `at -1.0`, stand `[0.5, 3.15]`; door at about (-0.13, 4.16), so the door moves 0.5 m sideways from the others.
    - **Woodpile spot:** moves 0.9 m out along its line, from (4.6, 2.2) to about (5.45, 1.89).
    - **Stone hearth:** `turn` 0.35.
    - **Stone pickup at (-3.8, 7.6):** moves to about (-5.0, 8.2). It keeps its id `stone5` and its `taken` entry.
    - **Door clearance:** the wall tent and cabin doors clear the blocked edge by only about 0.10 m. T11.6 asks for 0.25 m of slack, so the stands get tuned outward.

## Stage 0. Setup (main is merged and green)

**Steps:**

1. **Worktree.** Check that `wt/camp` is clean on `camp` at b79fa08. Otherwise run `git worktree add wt/camp -b camp main`.
2. **Preview.** Add a `web-camp` entry, serving `wt/camp/dist-web` on port 8776, to the session's own `launch.json`. The preview tool reads the session folder, not `A:\Hearthfolk\.claude`.
3. **Baseline:**
   - `npm run typecheck`, `vitest run`, the bot;
   - `HEARTHFOLK_PACING=1 HEARTHFOLK_SEEDS=20 npx vitest run tests/playthrough.test.ts`. This is the first pacing run with the needs build's bedtime, so keep it for stage 7.
4. **Greps.** Save the line notes to scratch:

   ```
   grep -rn "'chest'\|'shelter'\|siteOf([a-zA-Z.]*, *'chest')\|camp\.chest\|CHEST_SPOT\|siteOf([a-zA-Z.]*, *'tent')\|canSleep\|hasShelter\|besideChest\|chestStands\|canStoke\|inChest\|stores(\|isStore\|placedRects\|navFor(\|PLACE\.\|SITE_WHERE\|log_bench\|workbench\|lean_to\|log_hut" src tests
   ```

5. **Freeze old saves from the tags.**
   - For each tag (camp-0.0.22, 0.0.24, 0.0.27, 0.0.29, 0.0.30), make a temporary detached worktree `wt/freeze-<v>`. Node finds `A:\Hearthfolk\node_modules` from there, so no install is needed.
   - In each, a throwaway `tests/freeze.test.ts` uses that tag's own `createState` and `serialize`. It is gated by `HEARTHFOLK_FREEZE=1` and writes `wt/camp/tests/fixtures/saves/<v>-<case>.json`. Then `git worktree remove`.
   - If a tag can't produce a case, hand-write it in that version's shape and mark the file name `-hand`.
   - **The fixtures:**
     - **0.0.22 and 0.0.24 (format 10):**
       - each base-building combination, with a chest full of items;
       - a stoke from the chest;
       - a trip to the chest.
     - **0.0.27 and 0.0.29 (format 11, no `needs`, no `toolsInChest`):**
       - lean-to begun at stages 0, 1 and 2, and built;
       - log hut begun, and built;
       - bench and workbench, each placed and begun, placed and built, and both together;
       - a bench begun and a lean-to begun in the same save;
       - `raise`, pending `raise` and `stoke.back {raise}` for each removed id;
       - a cooking fetch;
       - a rats trip with `store`;
       - asleep, standing at the back of the tent.
     - **0.0.30 (needs era):**
       - `toolsInChest`;
       - `needs.meal.back {raise}`;
       - `needs.bed.back {raise: 'lean_to'}`;
       - `needs.later {build: 'log_bench', at, turn}`;
       - `needs.later {make: 'campfire'}`;
       - asleep in a lean-to.

**Gate.** The fixtures are committed on `camp` as "Camp build 0/7: old saves frozen", and the grep notes are in scratch.

## Stage 1. Ground work: remove the old, add the tables, footprints, save format 12

**Goal:**
- The bench, workbench, lean-to, log hut and placing are gone.
- The four upgrades exist as staged builds (not drawn yet).
- Walking blocks by shape.
- Saves migrate without ever throwing.
- The base five still use `make`, and the chest keeps its old site and its blocking until stage 3, so every gate stays green.

**`data/making.ts`**
- `MakeId`: drop the 4 old ids; add `wall_tent`, `log_cabin`, `stone_hearth`, `woodshed`.
- New rows:
  - wall tent: 12 birch logs and 8 fibre, 120 s, at `tent`;
  - log cabin: 30 logs, 10 clay and 12 stones, 240 s, at `tent`;
  - stone hearth: 12 stones and 4 clay, 90 s, at `hearth`;
  - woodshed: 10 logs and 6 bark, 90 s, at `woodpile`.
- `at` loses `'placed'`.
- The shelter's `name` becomes "Tent", with done text "Your tent is up…". The goal title stays "A shelter".

**`data/building.ts`**
- `StagedDef = { blurb; upgrades?; rest? }`. `STAGED` gets the 4 upgrades.
- `SHELTERS = ['shelter','wall_tent','log_cabin']`, with rest 0.25 / 0.35 / 0.5.
- New tables and values:
  - `LINES` and `SHAPES` (all nine steps plus the chest; `furniture` stays off until stage 3);
  - `UPGRADES_AFTER = 'chest'` (D4);
  - `CARPENTRY.speed = 0.01`, and `CARPENTRY.reach` (D11);
  - `DOOR = { near: 0.5, slack: 0.25 }`;
  - `RESUME = { wait: 5, retry: 10 }`;
  - `MARKER`;
  - `LAYOUT_GAP = { gap, water }`, taken from `PLACE` before it is deleted.
- Delete `PLACE`.
- `SOURCES`:
  - bark: "Peeled now and then while chopping birch, once the storage chest stands, while something you can build needs it" (review bug 27);
  - new lines for birch logs and stones (T9.2).

**SHAPES starting values** (step frame):
- **Tent:**
  - box 1.9 × 2.4;
  - stands `[[0, 1.95]]`;
  - chest `[0, 0.95]`, just inside the open front and within the strike's reach of the door (tuned in stage 3).
- **Wall tent** (`at -0.7`):
  - boxes x ±1.75, z −1.6..1.5; porch x ±1.3, z 1.5..2.4;
  - stand `[[0, 2.85]]`;
  - chest `[-0.62, 1.95]`.
- **Cabin** (`at -1.0`):
  - boxes x ±2.02, z −1.8..1.65; chimney x −2.8..−1.84, z −1.05..−0.05; porch x ±1.85, z 1.65..2.7;
  - stand `[[0.5, 3.15]]`;
  - chest `[0.95, 2.25]`.
- **Campfire:** ring r 0.62 (today's value).
- **Stone hearth:**
  - `turn 0.35`;
  - ring r 1.15, plus the seats and the stump from `stoneHearth()`;
  - `reach` 1.8;
  - stands at the open spit ends `[[-1.6, 0], [1.6, 0.25]]`;
  - `spit` at the design's posts.
- **Woodpile:** box 1.2 × 0.6; stand `[[0, 0.9]]`.
- **Woodshed:** box x ±0.9, z −0.67..0.70, plus the block ring at (1.18, 0.3); stands `[[0, 1.3], [-1.5, 0]]`.
- **Dummy:** ring r 0.5.

**World**
- `world/camp.ts`: move the woodpile spot and stone 5.
- `world/steps.ts` (new, headless): `stepPlace(layout, id)` (from `siteOf(def.at)` plus `at` along the facing, plus `turn`), `blocksOf`, `standsOf`, `reachOf`.
- `world/nav.ts`:
  - `NavGrid(area, layout, built, begun)`;
  - `navFor(layout, built = [], begun = [])` with cache key `built|begun`;
  - delete `PlacedRect` and `blockedBy`.

  For the base five (and the chest, still at its own site), `blocksOf` must block exactly what today's code blocks. T11.8 checks this.

**Core**
- `core/camp.ts` (new): the moved predicates, still reading the chest's site. They switch to the door in stage 3.
- `core/building.ts`:
  - delete the placing code;
  - add `begunIds`;
  - `walkGrid = navFor(layout, state.built, begunIds(state))`, plus `openOnceBuilt(state, layout, id)` for `goMake`'s "ground open once it stands";
  - `buildSite` becomes `stepPlace`; `stepShown` (D6); `bestShelter` and `restBonus`; `unlocked`; `BuildRow` (with no `levelOk`).
  - `savedBuilding`:
    - only `underway` is kept, and unknown ids are dropped;
    - **at most one build under way:** keep the one his task or pending is on, else the furthest along, and refund the rest into `bank`.
- `core/state.ts`:
  - remove `placed`;
  - add `resumeAt: 0`;
  - `SAVE_VERSION = 12`;
  - `canSleep` = any `SHELTERS` step built and a tent site.
- `core/save.ts`:
  - **`migrations[11] = campBuildSave`** (also exported). Every field is read with checks; a pre-needs save has no `needs` or `toolsInChest`, and that must never throw.
    - `built`:
      - `lean_to` becomes `wall_tent`;
      - `log_hut` becomes `wall_tent` plus `log_cabin`;
      - `log_bench` and `workbench` are dropped, refunded to `bank` (bench: 4 birch logs and 2 branches; workbench: 6 birch logs and 4 fibre).
    - `underway`:
      - a lean-to becomes a wall tent at `worked/90*120`;
      - a log hut becomes a log cabin at `worked/180*240`;
      - a begun bench or workbench is refunded and dropped.
    - Delete `placed`.
    - Map or drop `raise` in `task`, `pending`, `stoke.back`, `needs.meal.back` and `needs.bed.back`.
    - `needs.later`:
      - a bench or workbench build becomes null;
      - `lean_to` and `log_hut` are renamed;
      - `at` and `turn` are stripped.
    - A chest with no shelter adds `'shelter'`.
  - **`readSave`:**
    - `delete data.placed`;
    - `resumeAt` is read as 0;
    - **load nudge:** a player standing on blocked ground moves to `walkGrid().nearestWalkable(pos)` when that is within 4 m. He keeps his task (sleep, raise, knocked out, idle), and a pending keeps going with a path rebuilt to its old end point, or is dropped if that point is blocked. Only the far fallback goes back to `layout.start` and resets.
  - **`load()`:** when reading throws, copy the raw save to `SAVE_KEY + '.unread'` (only if that key is empty), then return null.
- `core/needs.ts`: a `Later` build keeps only `id`.
- `core/events.ts`: `cantBuild.reason` becomes `'locked'`; drop `'level'`, `'fit'` and `Misfit`.

**Systems and actors**
- `systems/building.ts`: no level gate and no placing. `lacking` exempts the current goal's own make (T2.7).
- These calls route through `walkGrid` or `openOnceBuilt`: `systems/rats.ts` (both `navFor(…placedRects)` calls) and `actors/player.ts` (`goMake`'s grid; `goBuild` uses `stepPlace`).

**Render, UI and words**
- `render/building.ts`: delete the old models and the ghost. Placeholders for the 4 new ids: `footings()` at stage 0, then a translucent box that grows.
- Remove placing from `ui/build.ts`, `ui/input.ts` (`PlacingHooks`), `main.ts` and `index.html` (`#placeBar` and its CSS).
- `data/survival.ts`:
  - `MAKE_NOTES` for the 4 new steps;
  - `SITE_WHERE` drops `placed`;
  - new `MAKE_WHERE` (a per-make override, used for the chest in stage 3).

**Tests:**
- **`building.test.ts`** (near rewrite):
  - T9.1, T3.1, SHAPES sanity;
  - T6.1, T6.2, T6.4;
  - `buildRows`/`unlocked` for upgrades, T4.1, T4.2, T7.4;
  - delete the placing tests and the `navFor` 3-argument scan.
- **New `tests/saves.test.ts`:**
  - T12.1 matrix with the T12.2 invariants;
  - T12.3: every fixture with random fields deleted or garbled never throws, and an unreadable raw save is kept under the backup key;
  - T12.4: an old sleeper behind the tent loads asleep, nudged, with `needs.bed` kept;
  - T12.5: a damaged save with two builds under way keeps one and refunds the other.
- **New `tests/layout.test.ts`:**
  - T11.1 at the largest steps, with the `LAYOUT_GAP` water gap and clear of every nest's roam area plus hop and of the goblin camp;
  - T11.2, T11.4, T11.5;
  - T11.8: the base five block exactly as before.
- **R0.3 scan** (in `architecture.test.ts`): no `navFor(` in src outside `world/`, `core/building.ts`, `core/rats.ts` and `core/goblins.ts`.
- T9.2, T10.1, T10.2.

**In the game** (`build:web`, then `web-camp?fresh=N`; set a test save from a missing page on the same port first):
- A new game plays as before.
- The 0.0.29 log hut plus bench fixture shows `wall_tent` and `log_cabin` built, with the bench's logs and branches in the Chest section.
- The 0.0.29 "asleep behind the tent" fixture loads still asleep, beside the tent, not at the river.

**Gate.** Typecheck (both configs), all tests and the bot pass. The removed-id grep is clean. Commit "Camp build 1/7".

## Stage 2. Everything built in stages

**Goal:**
- All nine buildings use `raise`, with times, Carpentry XP and the speed-up.
- `make` never builds a structure.
- The goal order, the "paid" rule, one build at a time, the resume rule, `nextstep`, the goal card, the book and the bot all work.

**Data**
- `data/making.ts` times: campfire 20 s, woodpile 25, shelter 60, chest 45, dummy 40.
- `STAGED`: the base five and their blurbs.
- `data/goals.ts` ready texts: "Tap Build, or tap the marker…".

**Core**
- `core/state.ts`:
  - `begun`;
  - `goalPaid` (finished, or `goal.makes` begun);
  - `goalHasEnough` treats a paid goal as having enough (T2.8).
- `core/book.ts`: `goalLines` ticks every line when the goal is paid.
- `core/survival.ts`: a begun thing's Making page shows every line ticked (T2.15).
- `core/building.ts`:
  - `forGoal` returns 0 when the goal's thing is begun;
  - `unlocked` for the base five;
  - `markerShown` (the chest also needs the shelter);
  - `buildSpeed` and `buildTime`.

**`systems/building.ts`**
- **`startBuild` refuses in this order:**
  1. knocked out: `'down'`;
  2. this thing already begun: carry on;
  3. another thing begun: `'busy'` with `other`;
  4. the goal order: `goalFirst`;
  5. not unlocked: `'locked'`;
  6. missing items: `missing`.

  Then `useUp`, `underway = 0`, `resumeAt = 0`, emit `begun`, `goBuild`.
- **`updateBuilding`:**
  - scales `dt` by `buildSpeed`, with XP per knock of time worked;
  - on finishing, `if (def.pile) state.woodpile = min(WOODPILE.max, woodpile + def.needs[def.pile])`.
- **`resumeBuild`.** When all of the following hold, he goes back with `goBuild`:
  - something is under way, at the camp;
  - `time >= resumeAt`;
  - he is idle (no pending, path, trip, stoke or cook);
  - there is no `needs.meal` or `needs.bed`;
  - he is not asleep or knocked out;
  - `!stokeAgain`.

  If that fails, `resumeAt = time + RESUME.retry` and `noPath` is emitted once (not again until a path is found).
- **`wantsBark`:** drop the `carpentry > 0` test.

**Other systems and wiring**
- `actors/player.ts`:
  - arriving at the end of a plain walk (no pending) sets `resumeAt = time + RESUME.wait`;
  - `goMake` is only for `here`.
- `systems/making.ts`: `canMake` only for `at: 'here'`; the pile and structure branches go.
- `systems/commands.ts`:
  - `make` for a staged id goes through `startBuild`;
  - `build` while knocked out gives a notice.
- `systems/nextstep.ts`:
  - a begun goal thing means `items {}`, and the next step is to carry on;
  - `busy` counts `raise`;
  - staged things are sent as `{type:'build', id}`;
  - with another build under way, the next step is to carry on with that one.
- `sim.ts`: `resumeBuild` at the end of the step.
- `core/save.ts`: `makeable` excludes staged ids. Old `make` tasks, pendings and `Back {make}` for structures become idle or null; nothing was taken, so nothing is lost.

**Goal card and bot**
- **Goal card** (`ui/hud.ts`, pure):
  - building means a `raise` task; going means a pending `raise`;
  - the line reads "Building the campfire… 40%";
  - the button says "Carry on with the X" or "Build the X".
- **Bot:**
  - `plan()` uses `goalPaid`; `next()` sends `build`; `useful()` counts `raise`;
  - `SENDS` adds `'build'`; `NOTICES` adds `'cantBuild'`.

**Stage 2 stopgaps in `render/structures.ts`**
- The ring also fills from `raise` progress.
- A site's outline, ring and tap area show only while `markerShown` or begun. The real markers come in stage 4.

**Tests:**
- **`making.test`:** structure cases move to `building.test`; T2.4.
- **`building.test`:**
  - T2.1, T2.2, T2.3 (24/32/80/60/52/160/320/120/120 XP), T2.7, T2.8, T2.9, T2.10;
  - T3.2, T4.3 (Carpentry shows in Skills once it has XP), T4.4;
  - T1.1–T1.5 (`markerShown`; nothing in the village);
  - T2.15.
- **T2.6 interruptions:**
  - nightfall: he stokes, then comes back;
  - a meal at the chest: he comes back;
  - bedtime: he comes back after waking;
  - a tree tapped while he sleeps: he chops until the goal has enough, then comes back;
  - a ground tap: he walks there, waits `RESUME.wait`, then comes back;
  - a rat: no return while he fights;
  - knocked out: he comes back after waking.
- **T2.12 the resume rule:**
  - the back-off after a failed path;
  - `noPath` told once;
  - between two walks back, at least `RESUME.wait` passes.
- **T2.13:** away catch-up finishes a begun build, and `AwaySummary.made` includes it.
- **T2.14:** begun while he stands inside its footprint (the tent's door as the wall tent begins; the campfire's stand as the hearth begins): on walkable ground within 1 s, and never inside after that.
- **T2.5 seeded fuzz:** 200 command sequences.
  - At most one build under way; `underway` never drops; nothing is refunded; no NaN.
  - Never idle with a build under way for longer than `RESUME.wait + RESUME.retry` while nothing holds him.
- **Playthrough:** positions are checked against `walkGrid(state, CAMP)` (begun counts), allowing T2.14's first second.
- **Tests that `make` a structure** switch to a `finishBuild(state, id)` helper. Find them with:

  ```
  grep -rnE "type: 'make', id: '(campfire|woodpile|shelter|chest|dummy)'" tests
  ```

  Today that finds away, book, combat, fire, making, nextstep and windows.

**In the game** (new game at 1280×800):
- Build the campfire from the goal card: he walks there, the ring fills over about 20 s, and Carpentry XP shows in the strip.
- Tap a tree mid-build: he stays chopping. When the goal has enough, he comes back.
- Tap the ground mid-build: he goes there, waits about 5 s, then comes back.
- Nightfall during the tent: he stokes, then comes back.

**Gate:**
- All green.
- The bot is within `CHAPTER_LIMITS`.
- The 20-seed pacing table is saved to scratch.
- Commit "2/7".

## Stage 3. The chest at the shelter's door; work points at bigger buildings

**World and data**
- Delete `camp.chest`, `CHEST`, the `'chest'` SiteId and its `siteOf` line. Update `Layout.camp`.
- Chest `at: 'tent'`. `SHAPES.chest.furniture = true` (from now on it blocks nothing).
- `MAKE_WHERE.chest`: "Kept inside the shelter, by the door."
- Tune the chest positions so the door is within `CARPENTRY.reach` of the chest at every step (D3, T8.6).

**`core/camp.ts`**
- `outermost`; `shelterDoor` (the stand of the outermost built-or-begun shelter step); `chestHere` (`built.includes('chest') && canSleep`).
- `useSpot(state, layout, id)` returns stands or a ring, plus a facing.
- The moved predicates switch over:
  - `canStoke`, `fishInChest`/`fishToCook` and the chest checks use `chestHere`;
  - `stores()` puts the chest at the door.
- No words "window", "document" or "requestAnimationFrame", even in `/** */` comments.

**Chest checks switched to `chestHere`**
- `core/tools.ts` (`chestStands`).
- `core/needs.ts` (`hasShelter` becomes `canSleep`; `savedNeeds` `toChest`).
- `systems/fire.ts`, `systems/cooking.ts`, `systems/rats.ts` (`chestFood`, `stockUp`).
- `core/save.ts` (`savedStoke`, `savedCook`, so a saved stoke's logs aren't lost).

**Door and visits**
- `systems/tools.ts`:
  - `besideChest` = within `DOOR.near` of `shelterDoor`;
  - `updateTools` also puts tools away when he reaches `'shelter'`.
- `actors/player.ts`:
  - `goVisit` for `'chest'`/`'shelter'` paths to the door and faces the shelter;
  - other ids use the nearest walkable stand, or the ring;
  - `goBuild` uses the step's stands, and the chest's build uses the door;
  - `builtSite` is replaced by `useSpot`.
- `systems/rats.ts` `wakeSpot`: the door.
- **`core/save.ts` re-path on load.** A pending visit or raise to any camp place whose path doesn't end at its current use point is re-pathed (`useSpot` plus `walkGrid().findPath`), or dropped. This covers the chest, the shelter, and the moved woodpile.

**UI and words**
- `ui/backpack.ts`:
  - the Chest row shows when `chestHere`;
  - a **"Store everything"** button (D22) sends `visit chest`, shown while the backpack isn't empty.
- `ui/sleep.ts`: the "z" rises at `stepPlace(shown shelter)`.
- "In the shelter" wording: the chest goal's page and ready text, `MAKE_NOTES.chest`, `data/thoughts.ts` (chest line), `ui/needs.ts`.

**Tests:**
- **Every test using the old chest site.** Find them with:

  ```
  grep -rn "camp\.chest\|CHEST_SPOT\|siteOf([a-zA-Z.]*, *'chest')" tests
  ```

  Today that finds berries, building, camp, combat, cooking, fire, making and rats.
- **T8.1–T8.4** at each shelter step.
- **T8.6 (headless):** the chest build ends at the door, facing in, within reach of the chest.
- **T8.7:** no data string says the chest is "beside" the shelter; the chest goal's page and ready text and `MAKE_WHERE.chest` say "in the shelter".
- **T8.8:** the Store everything button's command.
- **Door invariant for every combination** (tent; tent with a wall tent begun at stages 0–2; wall tent; wall tent with a cabin begun; cabin):
  - walkable;
  - outside every footprint;
  - reachable from the start and from the fire's stands;
  - **T11.6** 0.25 m of slack sideways and outward.
- **T6.3**, and the knock-out wake spot is walkable at each step.
- **T7.1–T7.3** at the hearth and shed stands, including stacking and stoking while the woodshed is under way.
- **`tools.test` and `needs.test`:**
  - give the chest a shelter;
  - replace the `log_bench` mid-build bedtime test;
  - re-path the rats test away from the old chest spot.

**In the game:**
- At each shelter step, a full backpack goes to the door.
- At nightfall he takes logs from the chest at the door.
- At bedtime he goes in at the door.
- Store everything works from the Backpack window.

**Gate:**
- All green.
- `grep -rn "siteOf([a-zA-Z.]*, *'chest')\|camp\.chest\|builtSite" src` finds nothing.
- The bot passes.
- Commit "3/7".

## Stage 4. Drawing

**`render/campmodels.ts` (new)**
- `wallTent`, `logCabin`, `stoneHearth` and `woodshed` come from `wt/designs/designs/models.ts`, with a `stage` argument. Parts are tagged by stage, per D6.
- Changes to the designs:
  - the woodshed's logs follow `state.woodpile`, and the axe in the chopping block is dropped (D21);
  - the hearth keeps its spit fish, hidden while `render/cooking.ts` draws his fish (D20);
  - the wall tent's stump and the cabin's porch logs are dropped where the chest sits.
- The base five split into stages (the tent and campfire from the glb protos).
- `markerModel`, `malletModel`. Everything goes through `mergeByMaterial`.

**Clipping between the old step and the new one (D6)**
- The old step is drawn until the new step's stage 2.
- The old step's guy ropes and stakes hide once the next step is begun.
- Any part of the new step's stages 0–1 that cuts the old step's parts above 0.3 m moves to stage 2 (T6.6).

**`render/structures.ts` becomes `CampView`**
- Built after `village.glb` loads. It absorbs `render/building.ts` (deleted) and `view.ts`'s eager `BuildingView`.
- Per spot:
  - stage groups are built lazily and cached;
  - the old step shows until the new step's stage 2;
  - the marker shows while `markerShown`;
  - the ring follows `reachOf`;
  - one tap box comes from `tapBoxOf` (core, T11.3), hit radius plus 0.15;
  - the hearth's flames, light and smoke are shared by both fire steps;
  - the chest stages sit at the shown shelter step's `chest`;
  - the dummy wobble is kept.

**`render/cooking.ts`**
- The stick goes at the shown fire step's `spit` (`SHAPES`), not at `SPIT.from` off the site's centre. That stops the stick base sitting inside the hearth's stones.

**Mallet**
- `render/arms.ts`: `toolInHand` is true for `raise`.
- `render/view.ts`:
  - `'mallet'` is a prop on `pick_head`'s parent, outside the carried-tools check;
  - the Mine clip time is driven from `underway[id] % CARPENTRY.knock` (a strike in the first `mine_cycle_s`, then the armed idle), because `timeScale = 0`;
  - the bow stays for `make` and `stoke`.
- If the strike lands short, lengthen the mallet's handle instead of moving stands into the margin.

**Tests:**
- **`tests/campmodels.test.ts`:**
  - T6.5: stages 0–3 non-empty and different, within budgets, on the ground, inside the step's blocks plus eaves;
  - T6.6: the overlap check above;
  - the chest's stage position equals the shelter step's `chest` (T8.6, drawing part).
- `arms.test` (`raise`), T2.11 `heldTool`, T11.3 `tapBoxOf`.

**In the game** (1280×800 and 390×844):
- A new game shows nothing until salvage. Then only the campfire marker shows; hover gives "Build|Campfire".
- At 390×844 the marker's tap area is at least 44 px at the default zoom.
- Watch all nine go up (the upgrades from fixtures). The swing lands on the build.
- The chest shows inside the tent front and on each porch.
- Cook at the hearth at night: the fish is on the hearth's spit.
- The woodshed's logs follow the count.
- Orbit the camera round the cabin's door.
- Screenshots go to scratch.

**Gate.** All green, `build:web` works, and the checks pass. Commit "4/7".

## Stage 5. Build tab, menu, taps and words

**`core/camp.ts`**
- **`campActions`:** Look in, Store, Sleep, Upgrade, Carry on, Build chest, Cook, Stack, Practise, Build.
  - They use only core predicates.
  - Practise is enabled when the dummy stands; its refusals come from the fight command's own notices (D25).
- **`campTap`, the default tap** (D10, D15):
  - **Shelter by day:**
    - the marker shows: Build;
    - the chest goal is current: Build or Carry on the chest;
    - the chest stands: Look in (with an upgrade under way too);
    - otherwise: today's "He isn't tired yet", with the hover "Tent" (the step's name).
  - **Shelter at night:** Sleep.
  - **Fire or pile with its upgrade under way:** Carry on.

**Input and menu**
- `data/input.ts`: `LONG_PRESS = { ms: 500, slop: 8, cue: 150 }`.
- **`ui/gesture.ts`** (pure): the press classifier.
  - **Right button:**
    - a click opens the menu and is never a tap;
    - a drag turns the camera, as today.
  - **Touch:**
    - held 500 ms within 8 px opens the menu, and the release sends nothing;
    - two pointers pinch, never a menu;
    - Android's `contextmenu` after a long press is ignored.
- **`ui/campmenu.ts`:**
  - the rustic menu, with entries at least 44 px tall;
  - `menuSpot()` keeps it on screen and clear of the goal card;
  - `commandOf`;
  - it closes on Esc, a tap outside, a choice, or a drag or pinch;
  - entries refresh, and a stale choice is refused with a notice.
- **`ui/input.ts`:**
  - target `{kind:'camp', spot}`;
  - hover words from `campTap`;
  - Look in calls `openChest`;
  - `contextmenu` `preventDefault` on the canvas;
  - while held, a small ring fills at the finger from 150 ms.

**Windows**
- **`ui/build.ts`.** Sections: Under way (first), Build now, Upgrades. Each row shows:
  - have/need, what's missing, and "N kept for your goal";
  - source lines and `buildTime`;
  - the stage and %;
  - the button, disabled with its reason.

  New notices: `busy` ("Finish the X first"), `down`, `noShelter`. Empty states: "Nothing to build right now. Next: {goal}" and "Everything at the camp is built."
- `ui/backpack.ts`: `showChest()`; the pile heading follows the step.
- `ui/sleep.ts`: `cantSleep` wording.

**Page and wiring**
- `index.html`:
  - the Build sections and `#campMenu`;
  - canvas `-webkit-touch-callout: none` and `user-select: none`;
  - rustic tokens.
- `main.ts`: `bindInput(view, layout, queue, state, {hover, openChest, menu})`.
- `data/survival.ts`: the `tip:hold` tip (D18).

**Tests:**
- T5.1–T5.7, T1.6, T8.5.
- T5.8: the Build tab's empty states.
- A hover-word table, including the day hover before the chest stands.
- Rail: the Build button can be reached at 360 and 375 px (in the row or in More).

**In the game:**
- **Desktop:**
  - right-click the shelter by day and at night, then the fire, the pile, the dummy and a marker;
  - right-drag still turns the camera;
  - no browser menu appears.
- **Phone, in the mobile mode at 390×844 and 360×740:**
  - long-press the same targets;
  - the ring cue shows; the menu stays on screen;
  - a drag still turns the camera and pinch still zooms;
  - a long press doesn't walk him.
- **Build tab:** pressing a row walks him there; check the empty states.
- **A day tap on the shelter** opens the Chest section, including during an upgrade.

**Gate.** All green and the checks pass. Commit "5/7".

## Stage 6. The whole camp, in the game

- **A fixture with every building at its largest step:** walk round the camp. Nothing clips, and everything can be tapped.
- **New games:** by hand to the end of chapter 1 at 390×844 and 1280×800, and the bot to the end of chapter 2.
- **Old saves:**
  - 0.0.24;
  - 0.0.27 and 0.0.29, which have no needs (the log hut plus bench, and asleep behind the tent);
  - 0.0.30 (needs era).
- **Unreadable save:** paste a broken save. A new game starts, and the raw save is kept under the backup key.
- **Screen sizes:** 360×740, 375×812, 844×390 and 1920×1080.
- **Hot swap.** The village is untouched.
- **Fixes:** any problem gets a fix plus a test. Tune numbers only in `SHAPES` and `world/camp.ts`, then re-run the T11 tests.
- **6b (only if the owner said yes to Q2):** add the chosen materials: the item, its pickup or node, a source line, an icon, and a need on an upgrade. This adds about 1 to 1½ hours.

**Gate.** The edge-case checklist is ticked, with screenshots in scratch. Commit "6/7".

## Stage 7. Docs, version and pacing

- **Version:** the next patch after main's (0.0.31). A `src/data/changelog.ts` entry in players' words.
- **Changelog and plan:**
  - `docs/CHANGELOG.md`;
  - the PLAN.md decision log: D1–D26, marked "lead's default, owner to confirm", plus the owner's answers to Q1 and Q2.
- **CLAUDE.md:**
  - line 37: the last sentence about the faint outline;
  - line 44:
    - the 0.0.27 placing sentence;
    - "Every walking grid for him must include placed things… (a test flags calls without it)" becomes "every grid via `walkGrid`; a test flags raw `navFor`";
  - a camp build status line.
- **`src/README.md`:**
  - add `core/camp.ts` (including the moved predicates), `world/steps.ts`, `render/campmodels.ts`, `CampView`, `ui/campmenu.ts`, `ui/gesture.ts`, `data/input.ts`;
  - remove `render/building.ts`;
  - fix the nav and layout text about the chest spot and placing.
- **Q1:** if the owner said yes to slower tool-making, change the `MAKES` times here, then re-run the bot and pacing.
- **Pacing:**
  - add a real-minutes column: play time minus sleep × (1 − 1/20);
  - compare 20 seeds against the stage 0 baseline (the 6:29 chapter 1 figure was measured before the needs build);
  - in a new game, nightfall comes at 6:10 of play and the default bedtime at 8:40.
- **Report:** clause by clause, from the checklist below, with what was done differently and why.

**Gate:**
- `npm run check`, `npm run build:web` and the bot pass.
- Commit "7/7".
- Once finished, publish to the game link (13 Oct rule), with the in / not in / open questions list on the board and in chat.

## Review and fix

**Reviewers.** Read-only, in parallel, one per angle:

1. The owner's words against what was delivered, using the checklist below.
2. Saves and migration, including fuzzed broken saves and the pre-needs fixtures.
3. Sim correctness and interruptions, including the resume rule.
4. Input and UI on phone and desktop.
5. Visuals: only what is clearly broken (clipping, a swing in the air, the chest missing). That is the placeholder-art rule.
6. Architecture and leftovers: layers, numbers in data, dead code.
7. Performance: draw calls and the walking-grid cache (begun ids multiply the cache keys).

**Fixes** go into the same worktree. Then the full check, then the lead merges into main, then the build is published as finished.

## Risks and how to avoid them

- **A migration crash wipes saves.** The loader starts a new game and the next autosave overwrites the old one.
  - Every field read in `campBuildSave` is guarded.
  - Pre-needs fixtures come from the tags.
  - T12.3 fuzzes the fixtures.
  - The raw save is kept under a backup key.
- **Removing the chest's site silently disables meals, tools, stoking, cooking and saves.** It is removed only in stage 3, after every caller uses `chestHere` or the door, and the stage 3 grep must find nothing.
- **Layer rules.** Core can't import systems, and the UI imports only types from systems. The menu's checks live in core, systems re-export them, and `CampAction` maps to `Command` in the UI.
- **The headless check trips on words.** No "window", "document" or "requestAnimationFrame" in the headless layers, even in `/** */` comments.
- **Old ids are dropped before they are mapped.** All mapping happens in migration 11→12, and the fixtures include "no second refund".
- **`placed` gets re-saved forever.** `readSave` deletes it.
- **The goal's count goes backwards after a build begins.** `goalPaid` is used everywhere, including the book's Making pages (T2.7, T2.8, T2.15, the bot).
- **He stands inside a footprint.** This can happen on begin (T2.14), on load (the nudge, T12.4) or at a door (the door invariant and T11.6). The playthrough uses `walkGrid`.
- **The door is too tight.** The 0.25 m slack test catches re-tunes that break it.
- **The resume rule fights the player or loops.** It only acts when he is idle, after `RESUME.wait`, and backs off on `noPath`. The fuzz test checks it.
- **Old and new steps clip during an upgrade.** T6.6, and parts are moved to stage 2.
- **The swing stays frozen or misses.** The view drives the Mine clip's time, the stands come from `CARPENTRY.reach`, and the game checks confirm it.
- **The camp view needs the glb.** Build `CampView` after `village.glb` loads.
- **Draw calls.** Merge by material, and build stages lazily.
- **Long press fights drag and pinch.** The classifier's tests, the canvas CSS and the phone checks cover it.
- **Pacing.** Nightfall and bedtime now fall inside chapter 1. The bot's limits stay; minutes of play and real minutes are reported.
- **Test churn.** Each stage changes the tests for what it changes, found by grep, so every gate is green.

---

## (1) Checklist: the owner's words and the In items, by stage and test

| Owner's words (or In item) | Stage | Tests and checks |
|---|---|---|
| "too shallow, we need to expand on any possible way" | all | all items below |
| "anything from adding materials" | 1 (fibre, bark, clay and stones all used by the upgrades); 6b if yes | T9.1, T9.2; **Q2** |
| "being able to upgrade your tent into something sturdier" | 1, 2, 4, 5 | T6.1–T6.6; game checks in stage 4 |
| "adding sleep by clicking the tent" | 3, 5 | T6.3, T8.5, T5.4; night tap in stage 5 |
| "is it possible to do placement yourself?" | answered "sure, fixed location"; placing removed in stage 1 | T10.2 |
| "even if its fixed position that its not visible until you put it down to build" | 2 (`markerShown`), 4 (markers) | T1.1–T1.6; new-game check in stage 4 |
| "as you build you see it progress into that structure" | 4 | T2.2, T6.5, T6.6; watch all nine |
| "this is the carpentry skill" | 2 | T2.3, T4.3 |
| "that should also take time" | 2 | T3.1, T3.2; tent about 60 s |
| "any skill and action should take time, because that's the grind" | 2 (building); 7 if Q1 is yes (tools) | T3.x; **Q1** |
| "sure, fixed location" | 1 (spots fixed; one-off moves for room, reported) | T11.1, T11.4 |
| "later… object which player can place" | Not in | none |
| "The build section… good overview" | 5 | T5.1, T5.2, T5.8 |
| "pressing it make the character walk to the building to start upgrading" | 2, 5 | T5.3; Build tab check in stage 5 |
| "nothing shows until it's needed" | 2, 4 | T1.1–T1.3 |
| "player is committed to building it" | 2 | T2.1, T2.5, T2.6, T2.9, T2.12 |
| "a nice building animation movement, with a hammer or something" | 4 | T2.11, arms.test; the swing lands |
| "oversee others building… blueprint" | Not in | none |
| "upgrade by the building tab, and or right clicking the object" | 5 | T5.1, T5.4, T5.5; desktop and phone checks |
| "upgrade is chosen from the build tab" | 5 | T5.1, T5.3 |
| "the size will change and so should the aesthetics… Bigger, more sections" | 1, 4 | T6.4, T6.5, T11.1–T11.5 |
| "design options before we commit" | done (`docs/designs`, the owner's pick) | none |
| "carpentry is now just another skill" | 1 (level gates removed), 2 | T4.1–T4.4 |
| "any building effort gives xp" | 2 | T2.3 |
| "consider how long it takes to build something" | 2, 7 | T3.1–T3.3; pacing |
| "chest is just 'furniture' in the tent or house" | 3, 4 | T8.1–T8.8 |
| "wall tent and the log cabin… the rest are good upgrades (minus the storage chest visual)" | 1, 4 (no storage shed) | T6.5; stage 4 checks |
| "remove the bench and workbench" | 1 | T10.1, T12.1, T12.2 (refunds) |
| "timing is irrelevant… no rushing… done properly. High priority" | gates, reviews | the edge-case checklist; 7 reviewers |
| Tools in the chest, mandatory bedtime, no Jobs tab | 3 (door), 2 (resume) | T8.4, T6.3, T2.6 |
| **In 1:** nothing shows until its goal | 2, 4 | T1.1–T1.6 |
| **In 2:** stages, XP, mallet, committed, comes back | 2, 4 | T2.1–T2.15 |
| **In 3:** build times | 2 | T3.1–T3.3 |
| **In 4:** Carpentry just a skill | 1, 2 | T4.1–T4.4 |
| **In 5:** Build tab and menu (Upgrade, Sleep, Store), the goal card | 2, 5 | T5.1–T5.8, T1.6 |
| **In 6:** tent, wall tent, log cabin; rest 0.25/0.35/0.5 | 1, 2, 4 | T6.1–T6.6 |
| **In 7:** stone hearth (spit with fish), woodshed; cook and stoke there | 1, 3, 4 | T7.1–T7.4; hearth and shed checks |
| **In 8:** chest furniture; all at the door; day tap opens it, night tap is bed | 3, 5 | T8.1–T8.8, T5.4 |
| **In 9:** materials | 1 | T9.1, T9.2 |
| **In 10:** remove bench, workbench, lean-to, log hut | 1 | T10.1, T10.2 |
| **In 11:** layout room; walking, taps and rings by size; chest spot gone | 1, 3, 4 | T11.1–T11.8 |
| **In 12:** saves (0.0.22 to latest, nothing lost) | 0, 1, 3 | T12.1–T12.5; old-save checks in stage 6 |

## (2) Open decisions, with the default the builder takes

- **D1 Marker.** Stakes and string at the step-1 corners, a cloth flag, a soft glint and a tap area. For the chest, a chalked square just inside the tent front.
- **D2 Reaching the chest.** One door point: the stand of the outermost built-or-begun shelter step. `'chest'` and `'shelter'` visits both end there. The chest blocks nothing.
- **D3 Building the chest.** From the door, facing in. The chest's position at each step is within `CARPENTRY.reach` of the door.
- **D4 Build tab contents.**
  - Base buildings show from their goal on.
  - Upgrades show once the thing they upgrade stands and the chest stands. This has been the game's rule since 0.0.27 and is one data value (`UPGRADES_AFTER`).
  - The next step shows only once the step before stands.
  - Empty states are as in stage 5.
- **D5 Carpentry speed.** +1% per level above 1, with a fixed XP per building.
- **D6 Stages and the old step.**
  - Four stages per step.
  - The old step is drawn until the new step's stage 2 and can be used until the new one is built.
  - Guy ropes hide when the next step begins, and any new part that cuts the old step moves to stage 2.
- **D7 Begun at the press.** Needs are taken then.
- **D8 One build at a time.** "Finish the X first."
- **D9 Going back (the brief's words).** After stoking, a meal, bed or a player's tap, he goes back once that thing ends by itself.
  - A ground walk ends on arrival, and he goes back after `RESUME.wait`.
  - Work that doesn't end by itself has no "after" while it runs.
- **D10 Taps with an upgrade under way.**
  - The shelter by day, once the chest stands: Look in.
  - The fire or pile: Carry on.
  - The other actions are in the menu.
- **D11 Mallet.** A prop on the Mine clip, not a `ToolId`. Stands sit `CARPENTRY.reach` from the face being built. If the strike falls short, lengthen the handle.
- **D12 Begun lean-to or log hut.** Progress is kept as the same fraction of the new time, with no top-up. Reported.
- **D13 Saves.** Format 12, one guarded migration, unreadable saves kept under a backup key.
- **D14 Upgrade benefits.** Rest 0.35 / 0.5. The hearth and shed work the same as before; the woodshed holds 30.
- **D15 Hover words.**
  - "Build|Campfire".
  - "Carry on|Wall tent".
  - The shelter by day: "Look in|Chest" once the chest stands, "Tent" before.
  - At night: "Sleep in|Wall tent".
  - "Cook at|Stone hearth".
  - "Stack logs on|Woodshed".
- **D16 Footprint anchors.** The door line faces the fire. Bigger steps grow back and to the sides. `turn` is per step.
- **D17 Placing code.** Removed; it stays in git at 0.0.29.
- **D18 Long-press tip.** A Tips page comes unstuck with the first available upgrade.
- **D19 Resume timings.** `RESUME.wait` 5 s, `RESUME.retry` 10 s.
- **D20 Hearth spit fish.** Kept as in the design, hidden while his own fish cook on that spit.
- **D21 Woodshed axe.** Dropped from the chopping block, since tools live in the chest.
- **D22 Storing by hand.** "Store everything" in the Chest section, plus Store in the menu.
- **D23 Load safety.**
  - A nudge of up to 4 m keeps what he was doing.
  - Camp visits are re-pathed.
  - A damaged save keeps one build under way and refunds the others.
- **D24 Gestures.**
  - A right-drag turns the camera; a right click opens the menu.
  - A long press is 500 ms within 8 px, with a ring cue.
  - No keyboard menu; the Build tab covers it.
- **D25 Practise entry.** Enabled when the dummy stands. Refusals use the existing notices.
- **D26 Walking-grid exemptions.** Rats and goblins keep their own grids. T11.1 keeps the camp's largest steps clear of them.

## (3) Questions for the owner before building

These come from the owner's own words and aren't on the brief's Not in list. Neither holds up stages 0 to 5. The lead's defaults list in (2) goes with them, for information.

- **Q1.** "Any skill and action should take time": making the stone axe, pickaxe, club, rod and hide armour still takes 3 to 4 seconds and gives no XP. Should these take real time too, which makes chapters 1 and 2 longer? If so, should they train a skill (Carpentry, or a new one)?
  - **Default:** unchanged.
  - **If yes to longer times:** it's a data change in stage 7 (about 15 minutes).
  - **If a new skill:** that is a build of its own.
- **Q2.** "Anything from adding materials": 0.0.27 added fibre, bark and clay, and this build puts all three (plus stones) to use in the upgrades. It adds nothing new. Earlier, flint, resin, bones, leather, bronze, herbs and mushrooms were offered, and none were built.
  - **Default:** none in this build; reported as not in.
  - **If the owner picks one or two:** they go in at stage 6b, adding about 1 to 1½ hours.