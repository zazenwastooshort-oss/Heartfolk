// Building it yourself (the owner, 12 Oct 2026: "any skill and action should take time, because that's the grind:
// seeing your village grow"), as tables only. Some things in MAKES (data/making.ts) go up in stages over time, training
// Carpentry as he works (systems/building.ts): the small things he places himself (the Build list's see-through copy,
// turned and set down on a half-metre grid: core/building.ts says where it fits), and the shelter's upgrades, built in
// place at the tent's spot: the tent becomes a lean-to, then a log hut. Each is built once. New materials for them:
// fibre cut from the reeds along the river bank and clay dug there (data/pickups.ts), and bark peeled now and then while
// chopping birch (BARK).
import type { MakeId } from './making';

/** How building in stages goes: every `knock` seconds of work is a knock of his mallet, worth `xp` Carpentry XP (so a
 *  thing's XP is its time in knocks: the log bench's 30 seconds are 10 knocks, 40 XP), about what chopping birch gives
 *  for the time; it goes up in `stages` stages (footings, frame, half built, then done), each seen at its site. */
export const CARPENTRY = { knock: 3, xp: 4, stages: 3 };

/** What each stage looks like, for the Build list and the notices: the stage he has reached (0 to `stages`). */
export const STAGE_NAMES = ['Footings', 'Frame', 'Half built', 'Built'] as const;

/** A thing built in stages (data/making.ts has its needs, time and words):
 *  level: the Carpentry level it needs.
 *  after: what must stand first (GameState.built) before the Build list has it.
 *  size: for a thing he places himself (MAKES' at 'placed'), its width across and depth along the way it faces, in
 *  metres; it is in the way like the chest (world/nav.ts). None for the shelter's upgrades, which take the tent's spot.
 *  upgrades: the shelter it replaces once he starts on it (the lean-to the tent, the log hut the lean-to).
 *  rest: (a shelter) how much more often gathering yields after a night's sleep in it, instead of SLEEP.bonus.
 *  blurb: one plain line for the Build list. */
export interface StagedDef {
  level: number;
  after: MakeId[];
  size?: { w: number; d: number };
  upgrades?: MakeId;
  rest?: number;
  blurb: string;
}

export const STAGED: Partial<Record<MakeId, StagedDef>> = {
  log_bench: { level: 1, after: ['campfire', 'chest'], size: { w: 1.4, d: 0.5 }, blurb: 'A split log on two stumps. Somewhere to sit by the fire.' },
  workbench: { level: 1, after: ['chest'], size: { w: 1.4, d: 0.8 }, blurb: 'A sturdy bench to work at. Carpentry will be done here one day.' },
  lean_to: { level: 2, after: ['shelter', 'chest'], upgrades: 'shelter', rest: 0.35, blurb: 'A roof of bark on a log frame, in place of the tent. He sleeps better in it.' },
  log_hut: { level: 3, after: ['lean_to'], upgrades: 'lean_to', rest: 0.5, blurb: 'Log walls sealed with clay, and a proper roof. He sleeps best of all here.' },
};

/** The shelters he sleeps in, worst to best: each a structure in MAKES. */
export const SHELTERS: MakeId[] = ['shelter', 'lean_to', 'log_hut'];

/** Bark peeled while chopping birch (systems/building.ts): a `chance` per log from `tree`, once the storage chest
 *  stands (`after`) and he has taken up Carpentry, while something he can build still needs more of it than he has (so
 *  the backpack never fills with bark nothing needs). A full backpack has no room for it. */
export const BARK = { tree: 'birch_tree', item: 'bark', chance: 0.3, after: 'chest' as MakeId };

/** Where each new material comes from, one plain line shown in the Build list under a thing that is short of it. */
export const SOURCES: Record<string, string> = {
  fibre: 'Fibre: cut it from the reeds along the river bank.',
  bark: 'Bark: birch logs sometimes give a strip as he chops, once he has done some carpentry.',
  clay: 'Clay: dig it from the patches on the river bank.',
};

/** Placing something (core/building.ts): the grid it snaps to (metres); how much room it keeps from anything else
 *  (`gap`: other structures and their spots, trees, rocks, things on the ground; `water`: the water's edge; `him`: where
 *  he stands); how far it keeps from the rats' nest beyond where they potter (`nest`) and from the goblin camp's
 *  palisade (`goblins`); how much open ground it may leave cut off from him (`pocket`, in walking-grid cells: a sliver
 *  between it and a tree is fine, a whole stretch of the camp isn't); how far from him a new copy starts (`ahead`), and
 *  how much ground on the camera's side of it is looked over for something standing that would hide it (`sight`), each
 *  thing standing taken as this much wider than its spot (`eaves`: a roof's overhang, the hut's chimney). */
export const PLACE = { grid: 0.5, gap: 0.25, water: 0.6, him: 0.6, nest: 0.8, goblins: 1.5, pocket: 6, ahead: 2.5, sight: 3, eaves: 0.5 };
