// Building it yourself (the owner, 12 Oct 2026: "any skill and action should take time, because that's the grind:
// seeing your village grow"; the camp build, 13 Oct 2026), as tables only. Everything built at the camp's spots (MAKES
// in data/making.ts) goes up in stages over time, training Carpentry as he works (systems/building.ts): the campfire,
// the firewood pile, the tent, the storage chest and the training dummy, each when its goal comes up, and the camp's
// upgrades, each built at its fixed spot in place of the step before it, and bigger: the tent becomes a wall tent, then
// a log cabin; the campfire a stone hearth; the firewood pile a woodshed (LINES). Each step has its own shape at its
// spot (SHAPES): where it stands, what of it is in the way, where he works at it. Materials: birch logs, stones, fibre
// cut from the reeds along the river bank and clay dug there (data/pickups.ts), and bark peeled now and then while
// chopping birch (BARK).
import type { MakeId } from './making';

/** How building in stages goes: every `knock` seconds of work is a knock of his mallet, worth `xp` Carpentry XP (so a
 *  thing's XP is its time in knocks: the wall tent's 2 minutes are 40 knocks, 160 XP), about what chopping birch gives
 *  for the time; it goes up in `stages` stages (footings, frame, half built, then built), each seen at its spot. A new
 *  step is drawn in place of the one before it from stage `shown` on (half built; until then the old one stands inside
 *  the new one's stakes and frame), and the old one is used (slept in, stoked, stacked) until the new one is built.
 *  `speed`: each Carpentry level above 1 makes the work this much quicker (+1%, D5), like the other skills: the same
 *  knocks and XP in less time (a knock is `knock` seconds of the work at level 1). `reach`: how far from the face he
 *  builds he stands, so his mallet lands on it (his stands in SHAPES). */
export const CARPENTRY = { knock: 3, xp: 4, stages: 3, shown: 2, speed: 0.01, reach: 0.65 };

/** What each stage looks like, for the Build list and the notices: the stage he has reached (0 to `stages`). */
export const STAGE_NAMES = ['Footings', 'Frame', 'Half built', 'Built'] as const;

/** A thing built in stages (data/making.ts has its needs, time and words):
 *  upgrades: the step before it in its line (LINES), which must stand before it can be begun, and which it takes the
 *  place of (the wall tent the tent, the log cabin the wall tent, the stone hearth the campfire, the woodshed the
 *  firewood pile). One without (the camp's first five) can be begun once its goal comes up (data/goals.ts `makes`),
 *  and until then nothing of it shows (the owner, 13 Oct 2026: "not visible until you put it down to build").
 *  inside: (the storage chest) it stands in what is built at that spot (the shelter), so it can be begun only once
 *  something stands there.
 *  rest: (a shelter) how much more often gathering yields after a night's sleep in it, instead of SLEEP.bonus.
 *  blurb: one plain line for the Build list. */
export interface StagedDef {
  blurb: string;
  upgrades?: MakeId;
  inside?: LineId;
  rest?: number;
}

/** Everything built in stages, in the Build list's order: the camp's first five in the order their goals come, then
 *  the upgrades. */
export const STAGED: Partial<Record<MakeId, StagedDef>> = {
  campfire: { blurb: 'A ring of stones round planks leaned together. It lights up the camp at night.' },
  woodpile: { blurb: 'Logs stacked on two bearers beside the fire, to stoke it from at night.' },
  shelter: { blurb: 'The torn tarp over a frame of logs, with planks for a floor. Somewhere dry to sleep.' },
  chest: { inside: 'tent', blurb: 'A box of split logs with copper straps, to keep everything he owns safe.' },
  dummy: { blurb: 'A post and crossbar of logs with a stuffed sack. Somewhere safe to learn to fight.' },
  wall_tent: { upgrades: 'shelter', rest: 0.35, blurb: 'A squared timber frame round the old canvas, a plank floor and a porch. He sleeps better in it.' },
  log_cabin: { upgrades: 'wall_tent', rest: 0.5, blurb: 'Round logs notched at the corners, a loft and a stone chimney. He sleeps best of all here.' },
  stone_hearth: { upgrades: 'campfire', blurb: 'A raised ring of stones round the fire, a spit over it and logs to sit on.' },
  woodshed: { upgrades: 'woodpile', blurb: 'A bark roof over the firewood, the logs stacked end on, and a chopping block.' },
};

/** The shelters he sleeps in, worst to best: each a structure in MAKES, the tent's line. */
export const SHELTERS: MakeId[] = ['shelter', 'wall_tent', 'log_cabin'];

/** The camp's spots, each with what is built there, first to last: the first step, then its upgrades. The storage
 *  chest is in none (it is furniture in the shelter: the camp build's stage 3). */
export type LineId = 'hearth' | 'tent' | 'woodpile' | 'dummy';
export const LINES: Record<LineId, MakeId[]> = {
  hearth: ['campfire', 'stone_hearth'],
  tent: ['shelter', 'wall_tent', 'log_cabin'],
  woodpile: ['woodpile', 'woodshed'],
  dummy: ['dummy'],
};

/** Upgrades come once the camp is set up: the Build list has one only once this stands, as well as the step before it
 *  (since 0.0.27; D4). */
export const UPGRADES_AFTER: MakeId = 'chest';

/** A point in a step's own frame, in metres: x across (to his right, looking at its front), z towards the fire (its
 *  front, door and porch face the fire). */
export type StepPoint = readonly [number, number];

/** Something of a step in the way of walking, in its own frame: a box from x0 to x1 across and z0 to z1 along, or a
 *  ring round a middle (x, z) of radius r. Walking keeps clear of each as of a building (world/nav.ts). */
export type Block = { box: readonly [x0: number, x1: number, z0: number, z1: number] } | { ring: readonly [x: number, z: number, r: number] };

/** A step's shape at its spot (world/steps.ts places it):
 *  at: how far its middle is from the spot's, along the way the spot faces (towards the fire: + nearer it; a bigger
 *  step grows back and to the sides, so the front stays about where it was). turn: radians it is turned beyond the
 *  spot's facing.
 *  blocks: what of it is in the way, every step's inside the next one's (nested).
 *  reach: how far round its middle its ring (and its tap area) reaches. tall: how high its tap area goes.
 *  stands: where he stands to build it and use it (CARPENTRY.reach in front of a face), on walkable ground.
 *  chest: (a shelter) where the storage chest sits in it. spit: (a fire) the spit's two posts and its height, where
 *  the cooking stick goes. furniture: (the chest, from the camp build's stage 3) it stands inside the shelter and
 *  blocks nothing of its own. */
export interface Shape {
  at?: number;
  turn?: number;
  blocks: readonly Block[];
  reach: number;
  tall: number;
  stands?: readonly StepPoint[];
  chest?: StepPoint;
  spit?: { posts: readonly [StepPoint, StepPoint]; height: number };
  furniture?: boolean;
}

/** Each structure's shape at its spot, step by step (the designs the owner picked, 13 Oct 2026: docs/designs/; models
 *  in wt/designs/designs/models.ts). The first five block exactly as their spots did before (world/camp.ts). */
export const SHAPES: Partial<Record<MakeId, Shape>> = {
  // the fire spot: a ring of stones round the fire; then (turned a little, so its seats clear the woodshed) a raised
  // ring of stones with a spit across it, a split log on stumps behind, a plain log in front and a stump stool
  campfire: { blocks: [{ ring: [0, 0, 0.62] }], reach: 0.62, tall: 0.8 },
  stone_hearth: {
    turn: 0.35,
    blocks: [
      { ring: [0, 0, 1.15] },
      { ring: [-0.93, -1.45, 0.2] }, { ring: [-0.19, -1.54, 0.2] }, { ring: [0.56, -1.63, 0.2] },
      { ring: [-1.08, 1.2, 0.2] }, { ring: [-0.51, 1.41, 0.2] }, { ring: [0.05, 1.61, 0.2] },
      { ring: [1.24, -0.76, 0.22] },
    ],
    reach: 1.95, tall: 1.0,
    stands: [[-1.8, 0], [1.8, 0.25]],
    spit: { posts: [[-0.95, 0], [0.95, 0]], height: 0.86 },
  },
  // the tent's spot: the tent (the tarp over a log frame, its door to the fire); the wall tent round it, its guy-rope
  // stakes out to the sides and its porch to the front; the log cabin round that, with its chimney up the left side
  shelter: { blocks: [{ box: [-0.95, 0.95, -1.2, 1.2] }], reach: 1.55, tall: 1.6, stands: [[0, 1.85]], chest: [0, 0.95] },
  wall_tent: {
    at: -0.7,
    blocks: [{ box: [-1.75, 1.75, -1.6, 1.5] }, { box: [-1.3, 1.3, 1.5, 2.4] }],
    reach: 2.75, tall: 2.9, stands: [[0, 3.05]], chest: [-0.62, 1.95],
  },
  log_cabin: {
    at: -1.0,
    blocks: [{ box: [-2.02, 2.02, -1.8, 1.65] }, { box: [-2.8, -1.84, -1.05, -0.05] }, { box: [-1.85, 1.85, 1.65, 2.7] }],
    reach: 3.3, tall: 4.2, stands: [[0.5, 3.35]], chest: [0.95, 2.25],
  },
  // beside the fire: logs on two bearers; then a woodshed over them, its chopping block at its right
  woodpile: { blocks: [{ box: [-0.6, 0.6, -0.3, 0.3] }], reach: 0.75, tall: 0.9, stands: [[0, 0.95]] },
  woodshed: {
    blocks: [{ box: [-0.9, 0.9, -0.67, 0.7] }, { ring: [1.18, 0.3, 0.25] }],
    reach: 1.5, tall: 1.7, stands: [[0, 1.35], [-1.55, 0]],
  },
  dummy: { blocks: [{ ring: [0, 0, 0.5] }], reach: 0.5, tall: 1.7 },
  // the storage chest, at its own spot beside the tent until it becomes furniture inside the shelter (stage 3)
  chest: { blocks: [{ box: [-0.45, 0.45, -0.28, 0.28] }], reach: 0.6, tall: 0.9 },
};

/** Going in and out of the shelter (the camp build's stage 3): he is at its door within `near` metres of it, and the
 *  door keeps `slack` metres of open ground round it, so a re-tune can't squeeze it shut. */
export const DOOR = { near: 0.5, slack: 0.25 };

/** Going back to something half built by himself (the owner, 13 Oct 2026: "player is committed to building it"; D9,
 *  D19): once nothing else has him (stoking the fire, a meal, bed, a tap that ends by itself), he goes back to it at
 *  once, or `wait` seconds after a walk he was sent on ends (a tap on the ground); when there was no way there, he
 *  looks again `retry` seconds later. Work that doesn't end by itself (chopping, a fight) keeps him until it does. */
export const RESUME = { wait: 5, retry: 10 };

/** The marker a spot shows while its goal asks for what is built there (the camp build, D1; drawn in stage 4): stakes
 *  `stake` metres high at the corners of the first step's footprint with a string between them, a cloth flag `flag`
 *  metres up, a soft glint `glint` across like a pickup's, and a tap area at least `tap` metres round. */
export const MARKER = { stake: 0.32, flag: 0.62, glint: 0.12, tap: 0.6 };

/** A save opened with him standing where something now stands (a bigger step than when it was saved: one from before
 *  the camp build, saved with him behind the shelter, may have a wall tent there now) moves him out to the nearest open
 *  ground, if that is within `nudge` metres, and he carries on with what he was doing (core/save.ts); only further off
 *  does he start again where a new game starts. */
export const LOAD = { nudge: 4 };

/** The room each spot keeps at its largest step (tests/layout.test.ts): `gap` metres from everything else in the camp
 *  (trees, rocks, bushes, things on the ground, the other spots) and `water` from the water's edge. */
export const LAYOUT_GAP = { gap: 0.25, water: 0.6 };

/** Bark peeled while chopping birch (systems/building.ts): a `chance` per log from `tree`, once the storage chest
 *  stands (`after`), while something he can build still needs more of it than he has (so the backpack never fills with
 *  bark nothing needs). A full backpack has no room for it. */
export const BARK = { tree: 'birch_tree', item: 'bark', chance: 0.3, after: 'chest' as MakeId };

/** Where each material the upgrades use comes from, one plain line shown in the Build list under a thing that is short
 *  of it. */
export const SOURCES: Record<string, string> = {
  birch_logs: 'Birch logs: chop the birch trees round the clearing.',
  stone: 'Stones: pick them up round the clearing and along the bank. They come back after a while.',
  fibre: 'Fibre: cut it from the reeds along the river bank.',
  bark: 'Bark: peeled now and then while chopping birch, once the storage chest stands, while something you can build needs it.',
  clay: 'Clay: dig it from the patches on the river bank.',
};
