// The rats in the woods (chapter 2, holding the camp, part 2; numbers in data/rats.ts). Rats live round a nest
// downriver from the camp (world/camp.ts, core/rats.ts). While nobody fights them they potter about near it: a short
// scurry, then a while sniffing about; they never go for him. Tapped (the fight command), he sets off to fight one with
// his weapon (systems/combat.ts strikes it, as at the training dummy): it stays put for him, facing him, and once he is
// at it, it bites back on its own timer, its attack roll against his Defence level and his gear's defence (OSRS), 0 to
// its max hit when a bite lands. A rat his strikes take to 0 topples over, about half the time leaving a rat hide in his
// backpack, and comes back at its nest a minute later; after a moment he goes on to the nearest rat that's up, or with
// none up he waits by the nest: an idle activity, until he is sent elsewhere. Below a share of his health he eats from
// his backpack each time a bite comes, the food that heals most first. Setting off to fight with no food on him but some
// in the chest, he goes by the chest for some first; a full backpack is emptied there and he comes back to the rats
// (systems/hauling.ts). At 0 health he is knocked out: he slumps a moment and wakes at the camp by the shelter with half
// his health back, keeping everything he carries and wears; the rat he fought heals back. It runs every step, so
// catching up (away time) fights as playing does; the rats' pottering draws nothing from the shared randomness, so
// everything else's luck is as it was.
import { maxHealth, type GameState, type RatState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Rng } from '../core/rng';
import type { Layout, NestSpot, Vec2 } from '../world/layout';
import { siteOf } from '../world/layout';
import { navFor } from '../world/nav';
import { facing, freshRat, ratsOf, ratSpot, type RatSpot } from '../core/rats';
import { targetOf } from '../core/targets';
import { goVisit } from '../actors/player';
import { BITE_LANDS, FIGHT_FOOD, KNOCKED_OUT, POTTER, RAT } from '../data/rats';
import { FOOD } from '../data/food';
import { BACKPACK_SLOTS } from '../data/hauling';
import { effectiveLevel, gearBonus, goFight, hitChance, roll, strikeReach } from './combat';
import { addToBackpack, backpackCount, backpackFull, deposit } from './backpack';
import { levelOf } from './skills';
import { eat } from './food';

/** How far past his striking reach a rat he fights may be before he walks up to it again (metres). */
const REACH_SLACK = 0.35;

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

/** A number in [0, 1) that depends only on `a` and `b`, for the rats' pottering: the same every time it is played (away
 *  time included), without drawing on the shared randomness. */
function noise(a: number, b: number): number { const h = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return h - Math.floor(h); }

/** The foods, the one that heals most first. */
const BEST_FIRST = Object.keys(FOOD).sort((a, b) => FOOD[b]!.heals - FOOD[a]!.heals);

/** Whether he carries any food. */
export const carriesFood = (state: GameState) => BEST_FIRST.some(f => (state.player.backpack[f] ?? 0) > 0);

/** Food in the storage chest, where it stands (none before it is built). */
export const chestFood = (state: GameState, layout: Layout) =>
  !!siteOf(layout, 'chest') && state.built.includes('chest') ? BEST_FIRST.reduce((a, f) => a + (state.bank[f] ?? 0), 0) : 0;

/** Set off to fight `id` (core/targets.ts): straight there, or for a creature that hits back (a rat) with no food in his
 *  backpack but some in the chest, by way of the chest for some first (a trip { fight }, systems/hauling.ts); with no
 *  way to the chest, straight there. Returns false, with him as he was, when there is no way there. */
export function setOffToFight(state: GameState, layout: Layout, id: string, events: EventBus): boolean {
  const p = state.player, target = targetOf(state, layout, id);
  if (!target) return false;
  if (target.foe && !carriesFood(state) && chestFood(state, layout) > 0 && goVisit(state, layout, 'chest')) {
    p.trip = { fight: id };
    events.emit({ type: 'fetchFood' });
    return true;
  }
  if (!goFight(state, layout, id)) return false;
  p.trip = null;
  return true;
}

/** At the chest on his way to fight (a trip { fight }): a full backpack is emptied into it first (any backpack when the
 *  player tapped the chest on the way: `store`, Trip in core/state.ts); then, carrying no food, he takes up to
 *  FIGHT_FOOD.take of the food in it, the food that heals most first, as much as fits. */
export function stockUp(state: GameState, events: EventBus, store = false): void {
  if (store || backpackFull(state)) deposit(state, events);
  if (carriesFood(state)) return;
  const pack = state.player.backpack, items: Record<string, number> = {};
  let room = Math.min(FIGHT_FOOD.take, BACKPACK_SLOTS - backpackCount(state));
  for (const food of BEST_FIRST) {
    const n = Math.min(room, state.bank[food] ?? 0);
    if (n <= 0) continue;
    if (n === state.bank[food]) delete state.bank[food]; else state.bank[food]! -= n;
    pack[food] = (pack[food] ?? 0) + n;
    items[food] = n; room -= n;
  }
  if (Object.keys(items).length) events.emit({ type: 'tookFood', items });
}

/** Where he wakes after being knocked out: in front of the shelter, facing the fire; with no shelter, beside the fire,
 *  facing it; with neither, where a new game starts. */
export function wakeSpot(state: GameState, layout: Layout): { pos: Vec2; heading: number } {
  const nav = navFor(layout, state.built), fire = siteOf(layout, 'hearth'), tent = siteOf(layout, 'tent');
  const lit = !!fire && state.built.includes('campfire');
  const beside = (site: { pos: Vec2; radius: number }, towards: Vec2, gap: number) => {
    const d = dist(site.pos, towards) || 1;
    return nav.nearestWalkable({ x: site.pos.x + (towards.x - site.pos.x) / d * (site.radius + gap), z: site.pos.z + (towards.z - site.pos.z) / d * (site.radius + gap) });
  };
  if (tent && state.built.includes('shelter')) {
    const towards = lit ? fire!.pos : layout.start, pos = beside(tent, towards, 0.5);
    return { pos, heading: facing(pos, towards) };
  }
  if (lit) { const pos = beside(fire!, layout.start, 1); return { pos, heading: facing(pos, fire!.pos) }; }
  return { pos: { ...layout.start }, heading: Math.PI / 2 };
}

/** He slumps, knocked out by `by`: whatever he was doing stops, and the rat heals back. */
function knockOut(state: GameState, by: string, events: EventBus): void {
  const p = state.player, r = state.rats[by];
  state.health = 0;
  p.task = { kind: 'knockedOut', wakeAt: state.time + KNOCKED_OUT.slump, by };
  p.path = []; p.pending = null; p.trip = null; p.cook = null;
  if (r) { r.health = RAT.health; r.bite = null; }
  events.emit({ type: 'knockedOut', by });
}

/** Knocked out, at `wakeAt` he wakes at the camp (wakeSpot) with half his health back. */
function wake(state: GameState, layout: Layout, events: EventBus): void {
  const p = state.player, task = p.task;
  if (task.kind !== 'knockedOut' || state.time < task.wakeAt) return;
  const at = wakeSpot(state, layout);
  p.pos = at.pos; p.heading = at.heading; p.task = { kind: 'idle' }; p.path = []; p.pending = null;
  state.health = Math.max(state.health, Math.ceil(maxHealth(state) * KNOCKED_OUT.health));
  events.emit({ type: 'wokeUp', by: task.by });
}

/** Eat one of the food in his backpack that heals most, if he carries any. */
function eatBest(state: GameState, events: EventBus): void {
  const food = BEST_FIRST.find(f => (state.player.backpack[f] ?? 0) > 0);
  if (food) eat(state, food, events);
}

/** A rat he fights bites on its timer (RatState.bite, from a moment after he starts: RAT.first); where a bite lands
 *  (BITE_LANDS into it) its roll against his defence says whether it hurts him, 0 to its max hit. Then, hurt below a
 *  share of his most, he eats; a bite that takes him to 0 knocks him out (one that does nothing never does). */
function bite(state: GameState, spot: RatSpot, r: RatState, dt: number, rng: Rng, events: EventBus): void {
  if (r.bite === null) r.bite = RAT.every - RAT.first;
  const before = r.bite;
  r.bite += dt;
  if (r.bite >= RAT.every) r.bite -= RAT.every;               // the next bite begins
  const lands = before < BITE_LANDS ? r.bite >= BITE_LANDS || r.bite < before : r.bite < before && r.bite >= BITE_LANDS;
  if (!lands) return;
  const attack = roll(RAT.attack + 9, RAT.attackBonus);
  const defence = roll(effectiveLevel(levelOf(state, 'defence'), state.combatStyle === 'defence'), gearBonus(state, 'defence'));
  const rolled = rng.next() < hitChance(attack, defence) ? Math.floor(rng.next() * (RAT.maxHit + 1)) : 0;
  const damage = Math.min(rolled, Math.max(0, state.health));
  state.health -= damage;
  events.emit({ type: 'bitten', by: spot.id, damage });
  if (damage > 0 && state.health <= 0) { knockOut(state, spot.id, events); return; }
  if (state.health < maxHealth(state) * FIGHT_FOOD.below) eatBest(state, events);
}

/** Somewhere new to scurry to, a short way from where the rat is: within its nest's roam, off the nest, on open ground in
 *  a straight line from it, and apart from the other rats (where they are and where they scurry to); or null when no
 *  such spot comes up just now. */
function nextSpot(state: GameState, layout: Layout, spot: RatSpot, r: RatState): Vec2 | null {
  const nest = spot.nest, nav = navFor(layout, state.built), others = ratsOf(layout).filter(o => o.id !== spot.id && o.nest === nest);
  for (let k = 0; k < 6; k++) {
    const a = noise(spot.index + 1, state.time + k * 0.37) * Math.PI * 2;
    const len = POTTER.hop[0] + noise(state.time + 0.5, spot.index + k + 1) * (POTTER.hop[1] - POTTER.hop[0]);
    let to = { x: r.pos.x + Math.cos(a) * len, z: r.pos.z + Math.sin(a) * len };
    const out = dist(to, nest.pos);
    if (out > nest.roam) to = { x: nest.pos.x + (to.x - nest.pos.x) / out * nest.roam, z: nest.pos.z + (to.z - nest.pos.z) / out * nest.roam };
    if (dist(to, nest.pos) < nest.radius + 0.4 || dist(to, r.pos) < POTTER.hop[0] * 0.5) continue;
    if (!nav.walkable(to) || !nav.lineOfSight(r.pos, to)) continue;
    if (others.some(o => { const s = state.rats[o.id]; return !!s && s.downUntil === null && (dist(s.pos, to) < POTTER.apart || (!!s.to && dist(s.to, to) < POTTER.apart)); })) continue;
    return to;
  }
  return null;
}

/** A rat nobody fights potters about: on with its scurry, or once it has stayed put long enough, off on another. */
function potter(state: GameState, layout: Layout, spot: RatSpot, r: RatState, dt: number): void {
  if (!r.to) {
    if (state.time < r.restUntil) return;
    r.to = nextSpot(state, layout, spot, r);
    if (!r.to) { r.restUntil = state.time + 1; return; }    // nowhere free just now: it looks again in a moment
    r.heading = facing(r.pos, r.to);
  }
  const d = dist(r.pos, r.to), step = POTTER.speed * dt;
  if (d <= step) {
    r.pos = { ...r.to }; r.to = null;
    r.restUntil = state.time + POTTER.rest[0] + noise(state.time, spot.index + 7) * (POTTER.rest[1] - POTTER.rest[0]);
  } else r.pos = { x: r.pos.x + (r.to.x - r.pos.x) / d * step, z: r.pos.z + (r.to.z - r.pos.z) / d * step };
}

/** His strikes took a rat's last health (systems/combat.ts): it topples over, maybe leaving a rat hide in his backpack
 *  (when there is room), and comes back at its nest RAT.back seconds later. */
function beaten(state: GameState, spot: RatSpot, r: RatState, rng: Rng, events: EventBus): void {
  r.health = 0; r.downUntil = state.time + RAT.back; r.to = null; r.bite = null;
  const item = rng.next() < RAT.drop.chance && addToBackpack(state, RAT.drop.item) ? RAT.drop.item : null;
  events.emit({ type: 'beaten', target: spot.id, item });
}

/** The rat up at `nest` nearest `at`, or null when none is. */
function nearestUp(state: GameState, layout: Layout, nest: NestSpot, at: Vec2): string | null {
  let best: { id: string; d: number } | null = null;
  for (const o of ratsOf(layout)) {
    const s = state.rats[o.id];
    if (o.nest !== nest || !s || s.downUntil !== null) continue;
    const d = dist(s.pos, at);
    if (!best || d < best.d) best = { id: o.id, d };
  }
  return best?.id ?? null;
}

/** Off to fight `id` (or wait by its nest, when it is down); with no way there he stops and says so. */
function chase(state: GameState, layout: Layout, id: string, events: EventBus): void {
  if (goFight(state, layout, id)) return;
  state.player.task = { kind: 'idle' };
  events.emit({ type: 'noPath' });
}

/** His side of fighting the rats: a rat he fights that is down (he beat it) he leaves after a moment for the nearest rat
 *  up at its nest, or with none up he waits by the nest, going over to it if he is away from it; a rat he fights that is
 *  up but out of his reach (it came back while he waited) he walks up to. */
function onward(state: GameState, layout: Layout, events: EventBus): void {
  const p = state.player, task = p.task;
  if (task.kind !== 'fight') return;
  const spot = ratSpot(layout, task.target), r = spot && state.rats[task.target];
  if (!spot || !r) return;
  if (r.downUntil === null) {
    if (dist(p.pos, r.pos) > strikeReach(RAT) + REACH_SLACK) chase(state, layout, spot.id, events);
    return;
  }
  if (state.time - (r.downUntil - RAT.back) < POTTER.moveOnAfter) return;      // he watches it topple
  const next = nearestUp(state, layout, spot.nest, p.pos);
  if (next) chase(state, layout, next, events);
  else if (dist(p.pos, spot.nest.pos) > spot.nest.roam + 1.5) chase(state, layout, spot.id, events);
}

/** After systems/combat.ts in each step: he wakes if he was knocked out and it is time; rats his strikes beat topple
 *  over, and beaten rats whose time is up come back; he goes on to the next rat or walks up to his; then each rat that is
 *  up fights him if he is at it, stays put facing him if he is on his way to it, or potters about, its health coming back
 *  while it is hurt. */
export function updateRats(state: GameState, layout: Layout, dt: number, rng: Rng, events: EventBus): void {
  wake(state, layout, events);
  const rats = ratsOf(layout);
  if (!rats.length) return;
  for (const spot of rats) {
    const r = state.rats[spot.id];
    if (!r) continue;
    if (r.downUntil === null && r.health <= 0) beaten(state, spot, r, rng, events);
    else if (r.downUntil !== null && state.time >= r.downUntil) { Object.assign(r, freshRat(spot, state.time)); events.emit({ type: 'ratBack', id: spot.id }); }
  }
  onward(state, layout, events);
  const p = state.player;
  for (const spot of rats) {
    const r = state.rats[spot.id];
    if (!r || r.downUntil !== null) continue;
    const task = p.task, near = dist(p.pos, r.pos) <= strikeReach(RAT) + REACH_SLACK;
    const fights = task.kind === 'fight' && task.target === spot.id && near;
    const awaits = fights || (p.pending?.kind === 'fight' && p.pending.id === spot.id);
    if (awaits) { r.to = null; r.heading = facing(r.pos, p.pos); }
    else {
      potter(state, layout, spot, r, dt);
      if (r.health < RAT.health && Math.floor(state.time / RAT.regen) > Math.floor((state.time - dt) / RAT.regen)) r.health = Math.min(RAT.health, r.health + 1);
    }
    if (fights) bite(state, spot, r, dt, rng, events); else r.bite = null;
  }
}
