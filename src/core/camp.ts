// The camp's places, as everyone reads them (the camp build, 13 Oct 2026): the shelter's door, where he goes in and
// out, and where the storage chest is, furniture in the shelter by its door (the owner, 13 Oct 2026: "maybe chest is
// just furniture in the tent or house"); where he stands to use or build each thing at the camp's spots, which grows
// as each spot's steps get bigger (the stone hearth's and the woodshed's own stands, the wall tent's and the log
// cabin's doors in front of their porches); whether there is a fire to cook at and fish to cook, where the backpack
// can be emptied (the village's banks, the camp's chest at the shelter's door), and whether the fire is his to stoke;
// the tap area at each spot, which grows with each step there; and what can be done at each spot (its menu, opened by
// a right click or a long press) and what a plain tap there does, with the words over it under the mouse.
// The checks lived in systems/ (cooking.ts, backpack.ts, fire.ts, which still offer them) and moved down here so that
// what the camp offers can be worked out without the simulation. Headless; changes nothing.
import { begun, canSleep, owned, type GameState } from './state';
import type { Layout, Vec2 } from '../world/layout';
import { doorOf, siteOf } from '../world/layout';
import { buildStandsOf, reachOf, standsOf, stepPlace, toGround, type StepPlace } from '../world/steps';
import { bestShelter, buildWhy, builtStep, lineOf, markerShown, stepShown, unlocked, type BuildWhy } from './building';
import { fightLabel } from './targets';
import { LINES, MARKER, SHAPES, TAP, type LineId } from '../data/building';
import { BUILD_REACH, MAKES, type MakeId } from '../data/making';
import { COOK } from '../data/cooking';
import { FOOD } from '../data/food';
import { KEEP_FOOD } from '../data/hauling';
import { STOKE, WOODPILE } from '../data/fire';

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
 *  of the door as the shelter does, standing on its floor (`floor` metres up). Null with no shelter there, begun or
 *  built (a new game; the village), where there is nothing for it to stand in. */
export function chestPlace(state: GameState, layout: Layout): (StepPlace & { floor: number }) | null {
  const step = stepShown(state, 'tent') ?? outermost(state, 'tent');
  if (!step) return null;
  const place = stepPlace(layout, step), shape = SHAPES[step], at = shape?.chest;
  return place && at ? { pos: toGround(place, at), rot: place.rot, floor: shape.floor ?? 0 } : null;
}

/** The tap area at a spot of the camp (In 11): a cylinder round its middle, `radius` round and `tall` high, and the
 *  step it is round. */
export interface TapBox { step: MakeId; pos: Vec2; radius: number; tall: number }

/** The tap area at `line`'s spot (T11.3): round the step there furthest out, built or begun (its footings are in the way
 *  already, so a tap there is on it), or the first step while its marker shows, TAP.pad beyond its reach (and at
 *  least MARKER.tap round) and as tall as it is; so it grows with each step. The storage chest has none of its own:
 *  it is in the shelter, and the shelter's covers it. Null while nothing shows there (the start of a new game, the
 *  village). */
export function tapBoxOf(state: GameState, layout: Layout, line: LineId): TapBox | null {
  const first = LINES[line][0]!, step = outermost(state, line) ?? (markerShown(state, layout, first) ? first : null);
  const place = step ? stepPlace(layout, step) : null, shape = step ? SHAPES[step] : null;
  if (!step || !place || !shape) return null;
  return { step, pos: place.pos, radius: Math.max(reachOf(step) + TAP.pad, MARKER.tap), tall: shape.tall };
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

/** Where he stands at step `id`: its own stands (to build it, its build stands where it has them), or round it on its
 *  ring, BUILD_REACH beyond its reach; facing its middle. */
function stepSpot(layout: Layout, id: MakeId, build = false): UseSpot | null {
  const place = stepPlace(layout, id);
  if (!place) return null;
  const stands = build ? buildStandsOf(layout, id) : standsOf(layout, id);
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
 *  mallet reaches; its build stands where it has them, SHAPES' builds), or round its ring for something round; the
 *  storage chest from the shelter's door, facing it (D3: the point on it his strikes are aimed at, SHAPES' aim, its
 *  right end, where his head stays outside the tent). Null where it has no place here. */
export function buildSpot(state: GameState, layout: Layout, id: MakeId): UseSpot | null {
  if (id !== 'chest') return stepSpot(layout, id, true);
  const spot = doorSpot(state, layout), chest = chestPlace(state, layout), aim = SHAPES.chest?.aim;
  return spot && chest ? { ...spot, face: aim ? toGround(chest, aim) : chest.pos } : spot;
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

// What can be done at the camp's spots (the camp build's stage 5; the owner, 13 Oct 2026: "you upgrade by the building
// tab, and or right clicking the object"; In 5, In 8): the menu a right click or a long press opens on a building
// (campActions) and what a plain tap on it does (campTap). Worked out here, headless, from the same checks the
// simulation makes, so the menu never offers what the game would refuse without saying why.

/** Something to do at one of the camp's spots. The UI turns each into the command it sends (ui/campmenu.ts), except
 *  Look in, which opens the Backpack at the chest's section and sends nothing (he goes nowhere).
 *  look: see what is in the storage chest. store: put everything he carries into it (the old tap on the chest).
 *  sleep: in `shelter`, the best shelter that stands, which is never chosen: he sleeps at his bedtime, and the entry
 *  only says when (the owner, 13 Oct 2026, of a tap on the tent sending him to bed early: "not needed"); null while it
 *  isn't the one drawn there (a bigger one half built round it), so the words say "the shelter" instead. build: begin `id` ('build':
 *  a marker's thing, the chest in the shelter; 'upgrade': the next step at a spot) or carry on with it ('carry').
 *  cook: his raw fish at the fire, `at` the campfire or the stone hearth. stack: the logs he carries, on the firewood
 *  pile or the woodshed (`at`). practise: on the training dummy. */
export type CampAction =
  | { kind: 'look' }
  | { kind: 'store' }
  | { kind: 'sleep'; shelter: MakeId | null }
  | { kind: 'build'; id: MakeId; how: 'build' | 'upgrade' | 'carry' }
  | { kind: 'cook'; at: MakeId }
  | { kind: 'stack'; at: MakeId }
  | { kind: 'practise' };

/** Why an entry can't be chosen now (BuildWhy for building, and): sleep, ever: he sleeps at his `hour` ('bedtime'),
 *  or is asleep ('asleep');
 *  store with nothing to store ('empty'); cook with no raw fish anywhere ('noFish'); stack with no logs on him
 *  ('noLogs') or the pile full ('full'), `at` the firewood pile or the woodshed; cook or practise while at it already
 *  ('at'). Knocked out, everything but Look in waits ('down'). */
export type CampWhy = BuildWhy | { kind: 'bedtime'; hour: number } | { kind: 'asleep' } | { kind: 'empty' } | { kind: 'noFish' }
  | { kind: 'noLogs'; at: MakeId } | { kind: 'full'; at: MakeId };

/** An entry of a spot's menu: what it does, and why it can't be chosen now (null: it can). */
export interface CampEntry { action: CampAction; why: CampWhy | null }

/** What a plain tap on a spot does, and the words over it under the mouse ("Build|Campfire": the verb, then the
 *  thing; just the thing where a tap only walks him over or says he isn't tired yet). */
export interface CampTap { action: CampAction; hover: string }

/** An action's key, the same for the same action (the menu finds a choice again by it, and marks the tap's). */
export const actionKey = (a: CampAction): string =>
  a.kind === 'build' ? `build:${a.id}:${a.how}` : a.kind === 'sleep' ? `sleep:${a.shelter ?? 'shelter'}` : a.kind === 'cook' || a.kind === 'stack' ? `${a.kind}:${a.at}` : a.kind;

/** Whether he carries anything to put in the storage chest: more than the few meals every trip there leaves on him
 *  (KEEP_FOOD). */
export function hasToStore(state: GameState): boolean {
  const pack = state.player.backpack, all = Object.values(pack).reduce((a, n) => a + n, 0);
  const meals = Object.keys(FOOD).reduce((a, f) => a + (pack[f] ?? 0), 0);
  return all > Math.min(KEEP_FOOD, meals);
}

/** The words over a spot under the mouse for `action` (D15): "Look in|Chest", "Sleep in|Wall tent" ("Sleep in|Shelter"
 *  while a bigger one is drawn round it), "Carry on|Wall tent", "Upgrade to|Log cabin", "Cook at|Stone hearth", "Stack
 *  logs on|Woodshed", "Build|Campfire". */
export function hoverOf(layout: Layout, action: CampAction): string {
  const name = (id: MakeId) => MAKES[id].name;
  switch (action.kind) {
    case 'look': return 'Look in|Chest';
    case 'store': return 'Store in|Chest';
    case 'sleep': return `Sleep in|${action.shelter ? name(action.shelter) : 'Shelter'}`;
    case 'build': return `${action.how === 'carry' ? 'Carry on' : action.how === 'upgrade' ? 'Upgrade to' : MAKES[action.id].verb}|${name(action.id)}`;
    case 'cook': return `Cook at|${name(action.at)}`;
    case 'stack': return `Stack logs on|${name(action.at)}`;
    case 'practise': return fightLabel(layout, 'dummy') ?? `Practise on|${name('dummy')}`;
  }
}

/** The shelter he sleeps in, as the words name it: the best that stands while it is the one drawn at the tent's spot;
 *  null (the shelter) from when a bigger one is half built round it, which is drawn there instead (D6). */
function sleepIn(state: GameState): MakeId | null {
  const best = bestShelter(state);
  return best && stepShown(state, 'tent') === best ? best : null;
}

/** Why logs can't be stacked `at` the firewood pile or the woodshed now: none on him, or it is full (null: they can). */
function stackWhy(state: GameState, at: MakeId): CampWhy | null {
  return (state.player.backpack[STOKE.item] ?? 0) <= 0 ? { kind: 'noLogs', at } : state.woodpile >= WOODPILE.max ? { kind: 'full', at } : null;
}

/** What is going on at `line`'s spot: the last step built there and the step under way there (begun, not built). */
function spotNow(state: GameState, line: LineId): { built: MakeId | null; under: MakeId | null } {
  return { built: builtStep(state, line), under: LINES[line].find(id => begun(state, id)) ?? null };
}

/** The menu at `line`'s spot (In 5; T5.4): what can be done there, each entry with why it can't be now (or null). In
 *  order: at a spot with nothing built, its marker's thing (Build) or the first step begun (Carry on); otherwise what
 *  it is for (at the shelter: Look in and Store once the chest stands in it, Sleep, and the chest itself while its goal
 *  is up: Build or Carry on; at the fire Cook; at the pile Stack logs; at the dummy Practise, D25: its refusals are the
 *  fight command's own), then its next step: Carry on while under way, or Upgrade once it can be built (D4). Empty
 *  where nothing shows (a new game, the village). Knocked out, all but Look in wait. */
export function campActions(state: GameState, layout: Layout, line: LineId): CampEntry[] {
  if (!tapBoxOf(state, layout, line)) return [];
  const { built, under } = spotNow(state, line), task = state.player.task, down = task.kind === 'knockedOut';
  const build = (id: MakeId, how: 'build' | 'upgrade' | 'carry'): CampEntry => ({ action: { kind: 'build', id, how }, why: buildWhy(state, id) });
  const use = (action: CampAction, why: CampWhy | null): CampEntry => ({ action, why: down && action.kind !== 'look' ? { kind: 'down' } : why });
  const first = LINES[line][0]!;
  if (!built) return under ? [build(under, 'carry')] : markerShown(state, layout, first) ? [build(first, 'build')] : [];
  const out: CampEntry[] = [];
  if (line === 'tent') {
    if (chestHere(state, layout)) out.push(use({ kind: 'look' }, null), use({ kind: 'store' }, hasToStore(state) ? null : { kind: 'empty' }));
    if (bestShelter(state) && canSleep(state, layout)) out.push(use({ kind: 'sleep', shelter: sleepIn(state) }, task.kind === 'sleep' ? { kind: 'asleep' } : { kind: 'bedtime', hour: state.needs.bedtime }));
    if (begun(state, 'chest')) out.push(build('chest', 'carry'));
    else if (markerShown(state, layout, 'chest')) out.push(build('chest', 'build'));
  } else if (line === 'hearth') {
    out.push(use({ kind: 'cook', at: built }, state.player.cook ? { kind: 'at' } : fishToCook(state, layout) ? null : { kind: 'noFish' }));
  } else if (line === 'woodpile') {
    out.push(use({ kind: 'stack', at: built }, stackWhy(state, built)));
  } else {
    const p = state.player, at = (p.task.kind === 'fight' && p.task.target === 'dummy') || (p.pending?.kind === 'fight' && p.pending.id === 'dummy');
    out.push(use({ kind: 'practise' }, at ? { kind: 'at' } : null));
  }
  const next = LINES[line][LINES[line].indexOf(built) + 1];
  if (under) out.push(build(under, 'carry'));
  else if (next && unlocked(state, layout, next)) out.push(build(next, 'upgrade'));
  return out;
}

/** Why a plain tap on `line`'s spot does nothing now, as its entry in the menu says, faded: Stack logs at the firewood
 *  pile or the woodshed with no logs on him, or it full; Sleep, always (when he sleeps there, or that he is asleep).
 *  Null when the tap goes ahead (every other tap's command says itself why it can't be done, without walking him
 *  anywhere: no fish to cook, still needs something). The UI says so instead of walking him over to say it, or saying
 *  nothing. */
export function tapRefused(state: GameState, layout: Layout, line: LineId): CampWhy | null {
  const tap = campTap(state, layout, line);
  if (tap?.action.kind !== 'stack' && tap?.action.kind !== 'sleep') return null;
  const key = actionKey(tap.action), why = campActions(state, layout, line).find(e => actionKey(e.action) === key)?.why ?? null;
  return why;
}

/** What a plain tap on `line`'s spot does (D10, D15; T5.4), with its words under the mouse: its marker's thing, Build;
 *  something begun there, Carry on (D10: building comes first; the fire is still cooked at and the pile stacked from
 *  the menu); at the shelter, day or night, the chest while its goal is up (Build, or Carry on), then once it stands
 *  Look in (with an upgrade under way too), and before it Sleep, which only says when he sleeps there, its words just
 *  the shelter's name; the fire Cook ("Cook at" once he has a rod or fish, else just its name: the cook
 *  command walks him beside it), the pile Stack logs, the dummy Practise. Null where nothing shows. */
export function campTap(state: GameState, layout: Layout, line: LineId): CampTap | null {
  if (!tapBoxOf(state, layout, line)) return null;
  const { built, under } = spotNow(state, line), first = LINES[line][0]!;
  const go = (action: CampAction): CampTap => ({ action, hover: hoverOf(layout, action) });
  if (!built) return under ? go({ kind: 'build', id: under, how: 'carry' }) : markerShown(state, layout, first) ? go({ kind: 'build', id: first, how: 'build' }) : null;
  if (line === 'tent') {
    if (begun(state, 'chest')) return go({ kind: 'build', id: 'chest', how: 'carry' });
    if (markerShown(state, layout, 'chest')) return go({ kind: 'build', id: 'chest', how: 'build' });
    if (chestHere(state, layout)) return go({ kind: 'look' });
    return { action: { kind: 'sleep', shelter: sleepIn(state) }, hover: MAKES[stepShown(state, 'tent') ?? built].name };
  }
  if (under) return go({ kind: 'build', id: under, how: 'carry' });
  if (line === 'hearth') {
    const action: CampAction = { kind: 'cook', at: built };
    return { action, hover: state.tools.rod || owned(state, COOK.raw) > 0 ? hoverOf(layout, action) : MAKES[built].name };
  }
  // (no logs on him or the pile full, just its name: the tap only says why)
  if (line === 'woodpile') return { action: { kind: 'stack', at: built }, hover: stackWhy(state, built) ? MAKES[built].name : hoverOf(layout, { kind: 'stack', at: built }) };
  return go({ kind: 'practise' });
}
