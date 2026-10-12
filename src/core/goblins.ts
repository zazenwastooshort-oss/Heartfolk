// The goblins in the layout's goblin camp and their chief (chapter 2, holding the camp, its last part): which goblins a
// layout has (their ids, 'goblin1', 'goblin2', 'goblin3', then 'chief'), each one's home spot (the goblins round the
// cold fire ring, the chief at his tent's door), a goblin as it starts and comes back, the chief as he comes out of his
// tent; and saved goblins read back: what matters (health, whether one is down and until when) is kept, and where one
// milled about to while that is still somewhere it could be (else it is home). systems/goblins.ts runs them;
// core/targets.ts makes them something to fight; render/goblins.ts draws them. The village has no goblin camp.
import type { GameState, GoblinState } from './state';
import type { GoblinCampSpot, Layout, Vec2 } from '../world/layout';
import { navFor } from '../world/nav';
import { tentDoor, wayInOf } from '../world/goblincamp';
import { CHIEF, GOBLIN, MILL } from '../data/goblins';
import { facing } from './rats';

/** A goblin, or the chief, in a layout: its id, its camp, which of the camp's goblins it is (the chief comes last),
 *  whether it is the chief, and its home spot. */
export interface GoblinSpot { id: string; camp: GoblinCampSpot; index: number; chief: boolean; home: Vec2 }

/** The goblin chief's id. */
export const CHIEF_ID = 'chief';

/** Where round the camp's middle the goblins' home spots are: `out` metres from it, the first `from` of a turn past the
 *  way in, each `apart` of a turn after the one before, so they stand on the open ground away from the tent and the
 *  totem. */
const HOMES = { out: 1.9, from: 0.415, apart: 0.165 };

const cache = new WeakMap<Layout, GoblinSpot[]>();
/** The goblins a layout has, then their chief (cached); none without a goblin camp. */
export function goblinsOf(layout: Layout): GoblinSpot[] {
  let out = cache.get(layout);
  if (out) return out;
  out = [];
  const camp = layout.goblinCamp;
  if (camp) {
    for (let i = 0; i < camp.goblins; i++) {
      const a = camp.way + 2 * Math.PI * (HOMES.from + i * HOMES.apart);
      out.push({ id: `goblin${i + 1}`, camp, index: i, chief: false, home: { x: camp.pos.x + Math.sin(a) * HOMES.out, z: camp.pos.z + Math.cos(a) * HOMES.out } });
    }
    out.push({ id: CHIEF_ID, camp, index: camp.goblins, chief: true, home: tentDoor(camp) });
  }
  cache.set(layout, out);
  return out;
}

/** The goblin (or chief) `id` in this layout, or null. */
export const goblinSpot = (layout: Layout, id: string): GoblinSpot | null => goblinsOf(layout).find(g => g.id === id) ?? null;

/** A goblin's numbers, or the chief's. */
export const goblinNumbers = (spot: Pick<GoblinSpot, 'chief'>) => spot.chief ? CHIEF : GOBLIN;

/** Whether goblin `id` is up (there, not beaten, or back again); the chief only once he is out of his tent. */
export function goblinUp(state: GameState, layout: Layout, id: string): boolean {
  const g = state.goblins[id], spot = goblinSpot(layout, id);
  return !!g && !!spot && g.downUntil === null && (!spot.chief || state.goblinCamp.chiefOut);
}

/** A goblin as it starts, and comes back: at home, full of health, facing the camp's middle; it first moves a moment
 *  after `time`, each at its own moment. The chief, as he waits in his tent: at its door, unseen. */
export function freshGoblin(spot: GoblinSpot, time: number): GoblinState {
  return {
    health: goblinNumbers(spot).health, downUntil: null, pos: { ...spot.home }, heading: facing(spot.home, spot.camp.pos),
    to: null, restUntil: time + 1 + spot.index * 1.1, swing: null,
  };
}

/** The chief as he comes out of his tent: at its door, full of health, stepping out towards the way in. */
export function chiefOut(spot: GoblinSpot, time: number): GoblinState {
  const door = spot.home, way = wayInOf(spot.camp).pos, d = Math.hypot(way.x - door.x, way.z - door.z) || 1;
  const to = { x: door.x + (way.x - door.x) / d * MILL.out, z: door.z + (way.z - door.z) / d * MILL.out };
  return { ...freshGoblin(spot, time), heading: facing(door, to), to, restUntil: time };
}

/** Every goblin in the layout as it starts, the chief in his tent. */
export const freshGoblins = (layout: Layout, time: number): Record<string, GoblinState> =>
  Object.fromEntries(goblinsOf(layout).map(g => [g.id, freshGoblin(g, time)]));

/** Whether a goblin of `camp` could be at `p`: on ground he can stand on (with `built` standing), within the camp's roam
 *  (and a little more: a walk may end just past it). */
export function goblinCanBe(layout: Layout, built: readonly string[], camp: GoblinCampSpot, p: Vec2): boolean {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return false;
  return Math.hypot(p.x - camp.pos.x, p.z - camp.pos.z) <= camp.roam + MILL.hop[1] && navFor(layout, built).walkable(p);
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const point = (v: unknown): Vec2 | null => isRecord(v) && finite(v.x) && finite(v.z) ? { x: v.x, z: v.z } : null;

/** The goblins in a save (chapter 2), checked against the layout, as rats are (core/rats.ts, savedRats): none once the
 *  camp is cleared (GameState.goblinCamp, read back first); otherwise every goblin the layout has, each from the save
 *  where it makes sense: down until a finite time (at most GOBLIN.back from now), with no health; or up with health
 *  above 0 up to its most (else full); where it is and where it walks to while somewhere it could be (goblinCanBe),
 *  else home and staying put; its swing under way while it is up, within one swing's time. The chief is never down,
 *  and while he is in his tent he is as he waits there (fresh). A goblin the save doesn't have (from before the goblin
 *  camp, 0.0.22 and 0.0.23) is a fresh one; one the layout doesn't have is dropped. */
export function savedGoblins(v: unknown, state: GameState, layout: Layout): Record<string, GoblinState> {
  const out: Record<string, GoblinState> = {};
  if (state.goblinCamp.cleared) return out;
  for (const spot of goblinsOf(layout)) {
    const fresh = freshGoblin(spot, state.time), s = isRecord(v) ? v[spot.id] : undefined, n = goblinNumbers(spot);
    if (!isRecord(s)) { out[spot.id] = fresh; continue; }
    const restUntil = finite(s.restUntil) ? Math.min(s.restUntil, state.time + MILL.rest[1] + 2) : fresh.restUntil;
    if (spot.chief && !state.goblinCamp.chiefOut) { out[spot.id] = { ...fresh, restUntil }; continue; }
    const downUntil = !spot.chief && finite(s.downUntil) ? Math.min(s.downUntil, state.time + GOBLIN.back) : null;
    const health = downUntil !== null ? 0 : finite(s.health) && s.health > 0 ? Math.min(s.health, n.health) : n.health;
    const at = point(s.pos), pos = at && goblinCanBe(layout, state.built, spot.camp, at) ? at : null;
    const to = downUntil === null && pos ? point(s.to) : null;
    out[spot.id] = {
      health, downUntil,
      pos: pos ?? fresh.pos,
      heading: pos && finite(s.heading) ? s.heading : fresh.heading,
      to: to && goblinCanBe(layout, state.built, spot.camp, to) ? to : null,
      restUntil,
      swing: downUntil === null && finite(s.swing) && s.swing >= 0 && s.swing <= n.every ? s.swing : null,
    };
  }
  return out;
}
