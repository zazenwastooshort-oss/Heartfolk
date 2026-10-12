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
// everything else's luck is as it was. The goblin camp (systems/goblins.ts) fights the same way and shares what is
// here: hitting back on a timer (attackHim), pottering about (potter), setting off with food, being knocked out and
// waking at camp.
import { maxHealth, type GameState, type RatState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Rng } from '../core/rng';
import type { Layout, NestSpot, Vec2 } from '../world/layout';
import { siteOf } from '../world/layout';
import { navFor } from '../world/nav';
import { placedRects } from '../core/building';
import { facing, freshRat, ratsOf, ratSpot, type RatSpot } from '../core/rats';
import { targetOf } from '../core/targets';
import { goVisit } from '../actors/player';
import { BITE_LANDS, FIGHT_FOOD, KNOCKED_OUT, POTTER, RAT } from '../data/rats';
import { FOOD } from '../data/food';
import { BACKPACK_SLOTS } from '../data/hauling';
import { defenceRollOf, goFight, hitChance, roll, strikeReach } from './combat';
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

/** Out of food mid-fight (0.0.25, the owner's pick): fighting something that hits back (a rat, a goblin), hurt below
 *  FIGHT_FOOD.below with nothing left to eat and food in the chest, he leaves it for the chest (a trip { fight }) and
 *  comes back to it with more (stockUp). */
export function restockIfOut(state: GameState, layout: Layout, events: EventBus): void {
  const p = state.player, task = p.task;
  if (task.kind !== 'fight' || p.trip || state.health >= maxHealth(state) * FIGHT_FOOD.below || carriesFood(state)) return;
  if (!targetOf(state, layout, task.target)?.foe || chestFood(state, layout) <= 0) return;
  const id = task.target;
  if (!goVisit(state, layout, 'chest')) return;
  p.trip = { fight: id };
  events.emit({ type: 'fetchFood' });
}

/** At the chest on his way to fight (a trip { fight }): a full backpack is emptied into it first (any backpack when the
 *  player tapped the chest on the way: `store`, Trip in core/state.ts; a few meals stay on him: deposit); then he takes
 *  food until he carries FIGHT_FOOD.take, the food that heals most first, as much as fits. */
export function stockUp(state: GameState, events: EventBus, store = false): void {
  if (store || backpackFull(state)) deposit(state, events);
  const pack = state.player.backpack, items: Record<string, number> = {};
  const carried = BEST_FIRST.reduce((a, f) => a + (pack[f] ?? 0), 0);
  let room = Math.min(FIGHT_FOOD.take - carried, BACKPACK_SLOTS - backpackCount(state));
  if (room <= 0) return;
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
  const nav = navFor(layout, state.built, placedRects(state)), fire = siteOf(layout, 'hearth'), tent = siteOf(layout, 'tent');
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

/** He slumps, knocked out by `by` (a rat; a goblin or the chief, `foe`: systems/goblins.ts sees to them): whatever he
 *  was doing stops, and a rat heals back. */
export function knockOut(state: GameState, by: string, events: EventBus, foe?: 'goblin' | 'chief'): void {
  const p = state.player, r = state.rats[by];
  state.health = 0;
  p.task = { kind: 'knockedOut', wakeAt: state.time + KNOCKED_OUT.slump, by };
  p.path = []; p.pending = null; p.trip = null; p.cook = null;
  if (r) { r.health = RAT.health; r.bite = null; }
  events.emit(foe ? { type: 'knockedOut', by, foe } : { type: 'knockedOut', by });
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

/** How a creature that fights back attacks him: its attack level and bonus, the most an attack does, seconds from one
 *  attack to the next (`every`), how long after he starts fighting it its first attack begins (`first`), and how far
 *  into an attack it lands (`lands`): a rat's bite (RAT, BITE_LANDS), a goblin's swing (data/goblins.ts). */
export interface Attacker { attack: number; attackBonus: number; maxHit: number; every: number; first: number; lands: number }

/** A rat's bite. */
const RAT_BITE: Attacker = { ...RAT, lands: BITE_LANDS };

/** A creature `by` he fights attacks on its own timer (`timer`: the seconds since its attack under way began; null
 *  before the first, which begins a moment after he starts: `first`); where an attack lands (`lands` into it) its roll
 *  against his defence says whether it hurts him, 0 to its max hit. Then, hurt below a share of his most, he eats; an
 *  attack that takes him to 0 knocks him out (one that does nothing never does; `foe`: a goblin or the chief, for what
 *  is said). Returns the timer after `dt`, or null when he was knocked out. */
export function attackHim(state: GameState, by: string, timer: number | null, a: Attacker, dt: number, rng: Rng, events: EventBus, foe?: 'goblin' | 'chief'): number | null {
  let t = timer === null ? a.every - a.first : timer;
  const before = t;
  t += dt;
  if (t >= a.every) t -= a.every;                             // the next attack begins
  const lands = before < a.lands ? t >= a.lands || t < before : t < before && t >= a.lands;
  if (!lands) return t;
  const attack = roll(a.attack + 9, a.attackBonus);
  // his defence roll: his Defence level (the defensive style) and the armour he wears (systems/combat.ts)
  const defence = defenceRollOf(state);
  const rolled = rng.next() < hitChance(attack, defence) ? Math.floor(rng.next() * (a.maxHit + 1)) : 0;
  const damage = Math.min(rolled, Math.max(0, state.health));
  state.health -= damage;
  events.emit({ type: 'bitten', by, damage });
  if (damage > 0 && state.health <= 0) { knockOut(state, by, events, foe); return null; }
  if (state.health < maxHealth(state) * FIGHT_FOOD.below) eatBest(state, events);
  return t;
}

/** A rat he fights bites on its timer (RatState.bite): attackHim. */
function bite(state: GameState, spot: RatSpot, r: RatState, dt: number, rng: Rng, events: EventBus): void {
  r.bite = attackHim(state, spot.id, r.bite, RAT_BITE, dt, rng, events);
}

/** Where a creature potters about: round `pos` (a rat's nest, the goblin camp's middle), never within `radius` + 0.4 of
 *  it, and never further than `roam`. */
export interface Ground { pos: Vec2; radius: number; roam: number }
/** How it potters: moves of `hop` metres (shortest, longest) at `speed` metres a second, then it stays put for `rest`
 *  seconds (shortest, longest), keeping `apart` metres from the others (POTTER for the rats, MILL for the goblins). */
export interface Pace { hop: readonly [number, number]; speed: number; rest: readonly [number, number]; apart: number }
/** A creature that potters about (a rat, a goblin): where it is, where it is going (or null while it stays put until
 *  `restUntil`), and which way it faces. */
export interface Potterer { pos: Vec2; to: Vec2 | null; restUntil: number; heading: number }

/** Somewhere new to move to, a short way from where it is: within its ground's roam, off its middle, on open ground in
 *  a straight line from it, and apart from the others (`others()`: where they are and where they move to); or null
 *  when no such spot comes up just now. `index` sets its moves apart from the others'. */
function nextSpot(state: GameState, layout: Layout, ground: Ground, index: number, r: Potterer, others: () => readonly Potterer[], pace: Pace): Vec2 | null {
  const nav = navFor(layout, state.built, placedRects(state));
  for (let k = 0; k < 6; k++) {
    const a = noise(index + 1, state.time + k * 0.37) * Math.PI * 2;
    const len = pace.hop[0] + noise(state.time + 0.5, index + k + 1) * (pace.hop[1] - pace.hop[0]);
    let to = { x: r.pos.x + Math.cos(a) * len, z: r.pos.z + Math.sin(a) * len };
    const out = dist(to, ground.pos);
    if (out > ground.roam) to = { x: ground.pos.x + (to.x - ground.pos.x) / out * ground.roam, z: ground.pos.z + (to.z - ground.pos.z) / out * ground.roam };
    if (dist(to, ground.pos) < ground.radius + 0.4 || dist(to, r.pos) < pace.hop[0] * 0.5) continue;
    if (!nav.walkable(to) || !nav.lineOfSight(r.pos, to)) continue;
    if (others().some(s => dist(s.pos, to) < pace.apart || (!!s.to && dist(s.to, to) < pace.apart))) continue;
    return to;
  }
  return null;
}

/** A creature nobody fights potters about its ground: on with its move, or once it has stayed put long enough, off on
 *  another (nextSpot). It draws nothing from the shared randomness, so it is the same every time it is played. */
export function potter(state: GameState, layout: Layout, ground: Ground, index: number, r: Potterer, others: () => readonly Potterer[], pace: Pace, dt: number): void {
  if (!r.to) {
    if (state.time < r.restUntil) return;
    r.to = nextSpot(state, layout, ground, index, r, others, pace);
    if (!r.to) { r.restUntil = state.time + 1; return; }    // nowhere free just now: it looks again in a moment
    r.heading = facing(r.pos, r.to);
  }
  const d = dist(r.pos, r.to), step = pace.speed * dt;
  if (d <= step) {
    r.pos = { ...r.to }; r.to = null;
    r.restUntil = state.time + pace.rest[0] + noise(state.time, index + 7) * (pace.rest[1] - pace.rest[0]);
  } else r.pos = { x: r.pos.x + (r.to.x - r.pos.x) / d * step, z: r.pos.z + (r.to.z - r.pos.z) / d * step };
}

/** The other rats up at a rat's nest, for keeping apart from. */
const otherRats = (state: GameState, layout: Layout, spot: RatSpot) => () =>
  ratsOf(layout).flatMap(o => { const s = state.rats[o.id]; return o.id !== spot.id && o.nest === spot.nest && s && s.downUntil === null ? [s] : []; });

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

/** Off to fight `id` (or wait by its nest or in its camp, when it is down); with no way there he stops and says so. */
export function chase(state: GameState, layout: Layout, id: string, events: EventBus): void {
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

/** A hurt creature nobody fights gets 1 health back every `every` seconds of play, never past `most`. */
export function heal(state: GameState, r: { health: number }, most: number, every: number, dt: number): void {
  if (r.health < most && Math.floor(state.time / every) > Math.floor((state.time - dt) / every)) r.health = Math.min(most, r.health + 1);
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
      potter(state, layout, spot.nest, spot.index, r, otherRats(state, layout, spot), POTTER, dt);
      heal(state, r, RAT.health, RAT.regen, dt);
    }
    if (fights) bite(state, spot, r, dt, rng, events); else r.bite = null;
  }
}
