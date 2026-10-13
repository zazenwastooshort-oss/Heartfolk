// The camp's places, as everyone reads them (the camp build, 13 Oct 2026): the shelter's door, where he goes in and
// out, and where the storage chest is, furniture in the shelter by its door (the owner, 13 Oct 2026: "maybe chest is
// just furniture in the tent or house"); where he stands to use or build each thing at the camp's spots, which grows
// as each spot's steps get bigger (the stone hearth's and the woodshed's own stands, the wall tent's and the log
// cabin's doors in front of their porches); whether there is a fire to cook at and fish to cook, where the backpack
// can be emptied (the village's banks, the camp's chest at the shelter's door), and whether the fire is his to stoke.
// The checks lived in systems/ (cooking.ts, backpack.ts, fire.ts, which still offer them) and moved down here so that
// what the camp offers can be worked out without the simulation. Headless; changes nothing.
import { begun, canSleep, type GameState } from './state';
import type { Layout, Vec2 } from '../world/layout';
import { doorOf, siteOf } from '../world/layout';
import { reachOf, standsOf, stepPlace, toGround, type StepPlace } from '../world/steps';
import { lineOf, stepShown } from './building';
import { LINES, SHAPES, type LineId } from '../data/building';
import { BUILD_REACH, type MakeId } from '../data/making';
import { COOK } from '../data/cooking';

/** The last step of a spot's line built or begun there: what stands there furthest out (a step is in the way from its
 *  footings on, round the one before it). Null while nothing there is. */
export function outermost(state: GameState, line: LineId): MakeId | null {
  return [...LINES[line]].reverse().find(id => state.built.includes(id) || begun(state, id)) ?? null;
}

/** The shelter's door: where he goes in and out of it (to bed), and stands to use the storage chest in it (D2): the
 *  stand of the shelter step furthest out, built or begun (a new one's footings, round the old one, put its door out in
 *  front of them at once; he sleeps in the old one until the new one is built). Null with nothing at the tent's spot
 *  yet, or no tent's spot (the village). */
export function shelterDoor(state: GameState, layout: Layout): Vec2 | null {
  const step = outermost(state, 'tent');
  return step ? standsOf(layout, step)[0] ?? null : null;
}

/** Whether the storage chest is here: built, in a shelter that stands (never in the village, which has its bank). */
export const chestHere = (state: GameState, layout: Layout) => state.built.includes('chest') && canSleep(state, layout);

/** Where the storage chest sits (or will, while it is built or its marker shows): in the shelter drawn at the tent's
 *  spot (stepShown: the tent until a wall tent is half built), at its `chest` (data/building.ts SHAPES), facing out
 *  of the door as the shelter does. Null with no shelter there, begun or built. */
export function chestPlace(state: GameState, layout: Layout): StepPlace | null {
  const step = stepShown(state, 'tent') ?? outermost(state, 'tent') ?? 'shelter';
  const place = stepPlace(layout, step), at = SHAPES[step]?.chest;
  return place && at ? { pos: toGround(place, at), rot: place.rot } : null;
}

/** Where he stands at something at the camp's spots, and what he faces there: one of `stands` (the nearest he can walk
 *  to), or for something round with none of its own (the campfire, the training dummy) anywhere on `ring` (the side
 *  nearest him first). */
export interface UseSpot { stands: Vec2[]; ring: { pos: Vec2; radius: number } | null; face: Vec2 }

/** How near he counts as at a spot already: a stand, or the ring round something round (metres); and how far from a
 *  stand the open ground nearest it may be, when the stand itself isn't open (never in the camp as laid out:
 *  tests/layout.test.ts and tests/chest.test.ts keep every stand open). */
export const AT_SPOT = { stand: 0.1, ring: 0.3, slip: 0.5 };

/** Where he may end up for `spot`, the likeliest first: its stands, the nearest `from` first, or points round its ring
 *  every 20 degrees, from the side nearest `from` outward both ways. */
export function spotEnds(spot: UseSpot, from: Vec2): Vec2[] {
  const far = (q: Vec2) => Math.hypot(q.x - from.x, q.z - from.z), ring = spot.ring;
  if (spot.stands.length) return [...spot.stands].sort((a, b) => far(a) - far(b));
  if (!ring) return [];
  const base = far(ring.pos) < 1e-4 ? Math.PI : Math.atan2(from.z - ring.pos.z, from.x - ring.pos.x);
  return Array.from({ length: 19 }, (_, k) => {
    const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 9);
    return { x: ring.pos.x + Math.cos(a) * ring.radius, z: ring.pos.z + Math.sin(a) * ring.radius };
  });
}

/** Whether `p` is where he stands for `spot`: at one of its stands, or on its ring. */
export function atSpot(spot: UseSpot, p: Vec2): boolean {
  if (spot.stands.length) return spot.stands.some(s => Math.hypot(s.x - p.x, s.z - p.z) <= AT_SPOT.stand);
  return !!spot.ring && Math.abs(Math.hypot(p.x - spot.ring.pos.x, p.z - spot.ring.pos.z) - spot.ring.radius) < AT_SPOT.ring;
}

/** Where he stands at step `id`: its own stands, or round it on its ring, BUILD_REACH beyond its reach; facing its
 *  middle. */
function stepSpot(layout: Layout, id: MakeId): UseSpot | null {
  const place = stepPlace(layout, id);
  if (!place) return null;
  const stands = standsOf(layout, id);
  return { stands, ring: stands.length ? null : { pos: place.pos, radius: reachOf(id) + BUILD_REACH }, face: place.pos };
}

/** The shelter's door, facing the shelter (its step furthest out). */
function doorSpot(state: GameState, layout: Layout): UseSpot | null {
  const step = outermost(state, 'tent'), door = shelterDoor(state, layout), place = step ? stepPlace(layout, step) : null;
  return door && place ? { stands: [door], ring: null, face: place.pos } : null;
}

/** Where he goes to use `id` at the camp (a visit, by its id): the shelter ('shelter', to bed) and the storage chest in
 *  it ('chest': to empty the backpack, take logs, fish, food or a tool) at the shelter's door, facing in; anything else
 *  built at a spot (the campfire, to stoke it or cook at it; the firewood pile, to take logs from it or stack them on
 *  it) at the step of its spot furthest out, built or begun, facing it: the stone hearth's or the woodshed's own stands
 *  from their footings on, which are in the way of the campfire's ring and the pile's stand (D6: the old step is used
 *  until the new one is built). Null for what isn't standing here: the chest not built, no shelter, something not
 *  built yet, or anything that isn't the camp's (the village's buildings and land). */
export function useSpot(state: GameState, layout: Layout, id: string): UseSpot | null {
  if (id === 'chest') return chestHere(state, layout) ? doorSpot(state, layout) : null;
  if (id === 'shelter') return canSleep(state, layout) ? doorSpot(state, layout) : null;
  const line = lineOf(id);
  if (!line || !state.built.includes(id as MakeId)) return null;
  return stepSpot(layout, outermost(state, line)!);
}

/** Where he stands to build `id` (begun, or about to be): its own stands (in front of its faces, as far out as his
 *  mallet reaches), or round its ring for something round; the storage chest from the shelter's door, facing it (D3).
 *  Null where it has no place here. */
export function buildSpot(state: GameState, layout: Layout, id: MakeId): UseSpot | null {
  if (id !== 'chest') return stepSpot(layout, id);
  const spot = doorSpot(state, layout), chest = chestPlace(state, layout);
  return spot && chest ? { ...spot, face: chest.pos } : spot;
}

/** Whether there is a fire to cook at: the campfire stands at this layout's fire spot (never in the village). */
export const canCook = (state: GameState, layout: Layout) => !!siteOf(layout, 'hearth') && state.built.includes('campfire');

/** Raw fish in the storage chest, where it is (none before it is built). */
export const fishInChest = (state: GameState, layout: Layout) => chestHere(state, layout) ? state.bank[COOK.raw] ?? 0 : 0;

/** Whether he has raw fish to cook, carried or in the chest. */
export const fishToCook = (state: GameState, layout: Layout) => (state.player.backpack[COOK.raw] ?? 0) + fishInChest(state, layout) > 0;

/** The places he can empty his backpack, by id, with where he stands to do it: each bank's door (the village), and
 *  the camp's storage chest once it is built ('chest', the id of what he built), at the shelter's door. */
export function stores(state: GameState, layout: Layout): { id: string; pos: Vec2 }[] {
  const out = layout.buildings.filter(b => b.kind === 'bank').map(b => ({ id: b.id, pos: doorOf(b) }));
  const door = chestHere(state, layout) ? shelterDoor(state, layout) : null;
  if (door) out.push({ id: 'chest', pos: door });
  return out;
}

/** Whether `id` (a building, or something he built) is somewhere to empty the backpack: a bank, or the built chest. */
export const isStore = (state: GameState, layout: Layout, id: string) => stores(state, layout).some(x => x.id === id);

/** Whether the fire is his to stoke: the campfire stands, with the firewood pile or the storage chest to take logs from. */
export const canStoke = (state: GameState, layout: Layout) =>
  canCook(state, layout) && ((!!siteOf(layout, 'woodpile') && state.built.includes('woodpile')) || chestHere(state, layout));
