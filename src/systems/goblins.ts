// The goblin camp (chapter 2, holding the camp, its last part; numbers in data/goblins.ts). Three goblins mill about
// inside their palisade where the river leaves the valley (world/camp.ts, core/goblins.ts), their chief waiting in his
// tent. Like the rats (systems/rats.ts, whose hitting back, pottering about, food and knock-outs are shared here) they
// never go for him: tapped (the fight command), he sets off to fight one with his weapon; it stays put for him, facing
// him, and once he is at it, it swings its club on its own timer, its roll against his defence. They are tougher than
// rats and hit harder. A goblin his strikes take to 0 topples over and is up again GOBLIN.back seconds later; after a
// moment he goes on to the next goblin up. Once all three are down at the same time the chief comes out of his tent,
// and he goes on to fight him. Beaten, the chief leaves a torn map in his backpack and the camp is cleared for good:
// the goblins are gone, and its gate stands open. Knocked out (by anything), he wakes at the camp as with the rats; a
// goblin that did it heals back, and the chief, if he was out, goes back into his tent and heals, while beaten goblins
// stay down until their time. Food from the chest when he sets off with none, eating when hurt, a full backpack's trip
// to the chest and back, stoking the fire at nightfall and going back: all as with the rats (systems/rats.ts,
// systems/hauling.ts, systems/fire.ts). It runs every step, so catching up (away time) fights as playing does; their
// milling about draws nothing from the shared randomness.
import type { GameState, GoblinState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Rng } from '../core/rng';
import type { Layout, Vec2 } from '../world/layout';
import { facing } from '../core/rats';
import { CHIEF_ID, chiefOut, freshGoblin, goblinNumbers, goblinSpot, goblinsOf, goblinUp, type GoblinSpot } from '../core/goblins';
import { CHIEF, GOBLIN, GOBLIN_SWING, MILL } from '../data/goblins';
import { strikeReach } from './combat';
import { addToBackpack } from './backpack';
import { attackHim, chase, heal, potter, type Attacker, type Ground, type Potterer } from './rats';

/** How far past his striking reach a goblin he fights may be before he walks up to it again (metres). */
const REACH_SLACK = 0.35;

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

/** A goblin's swing, or the chief's. */
const swingOf = (spot: GoblinSpot): Attacker => ({ ...goblinNumbers(spot), lands: GOBLIN_SWING.lands });

/** Where the goblins mill about: round the camp's middle, off the fire ring there, within the camp's roam. */
const groundOf = (spot: GoblinSpot): Ground => ({ pos: spot.camp.pos, radius: spot.camp.fire.radius + 0.1, roam: spot.camp.roam });

/** What a goblin keeps apart from as it mills about: the others that are up, and him. */
const othersOf = (state: GameState, layout: Layout, spot: GoblinSpot) => (): Potterer[] => [
  ...goblinsOf(layout).flatMap(o => o.id !== spot.id && goblinUp(state, layout, o.id) ? [state.goblins[o.id]!] : []),
  { pos: state.player.pos, to: null, restUntil: 0, heading: 0 },
];

/** The chief goes (back) into his tent and heals: he waits at its door, unseen, until all three goblins are down at
 *  once again. */
function chiefIn(state: GameState, layout: Layout): void {
  const spot = goblinSpot(layout, CHIEF_ID), g = state.goblins[CHIEF_ID];
  state.goblinCamp.chiefOut = false;
  if (spot && g) Object.assign(g, freshGoblin(spot, state.time));
}

/** His strikes took a goblin's last health (systems/combat.ts): it topples over, and is up again GOBLIN.back seconds
 *  later. With all three goblins down at once, the chief comes out of his tent. */
function beaten(state: GameState, layout: Layout, spot: GoblinSpot, g: GoblinState, events: EventBus): void {
  g.health = 0; g.downUntil = state.time + GOBLIN.back; g.to = null; g.swing = null;
  events.emit({ type: 'beaten', target: spot.id, item: null, foe: 'goblin' });
  const all = goblinsOf(layout), chief = all.find(o => o.chief), c = chief && state.goblins[chief.id];
  if (!chief || !c || state.goblinCamp.chiefOut || !all.every(o => o.chief || state.goblins[o.id]?.downUntil !== null)) return;
  Object.assign(c, chiefOut(chief, state.time));
  state.goblinCamp.chiefOut = true;
  events.emit({ type: 'chiefOut' });
}

/** The chief is beaten: he leaves his torn map in his backpack (in the chest, should there be no room: it is never
 *  lost), and the camp is cleared for good: the goblins are gone, its gate stands open. */
function cleared(state: GameState, events: EventBus): void {
  if (!addToBackpack(state, CHIEF.drop)) state.bank[CHIEF.drop] = (state.bank[CHIEF.drop] ?? 0) + 1;
  events.emit({ type: 'beaten', target: CHIEF_ID, item: CHIEF.drop, foe: 'chief' });
  state.goblins = {};
  state.goblinCamp = { chiefOut: false, cleared: true };
  events.emit({ type: 'campCleared' });
}

/** The one to fight next: the chief while he is out, else the goblin up nearest `at`; null when none is. */
function nextUp(state: GameState, layout: Layout, at: Vec2): string | null {
  if (goblinUp(state, layout, CHIEF_ID)) return CHIEF_ID;
  let best: { id: string; d: number } | null = null;
  for (const o of goblinsOf(layout)) {
    if (o.chief || !goblinUp(state, layout, o.id)) continue;
    const d = dist(state.goblins[o.id]!.pos, at);
    if (!best || d < best.d) best = { id: o.id, d };
  }
  return best?.id ?? null;
}

/** His side of fighting the goblins: a goblin he fights that is down (he beat it) he leaves after a moment for the
 *  chief, if he is out, or the nearest goblin up, or with none up he waits in the camp; one that is up but out of his
 *  reach (it came back while he waited, the chief stepping out) he walks up to. */
function onward(state: GameState, layout: Layout, events: EventBus): void {
  const p = state.player, task = p.task;
  if (task.kind !== 'fight') return;
  const spot = goblinSpot(layout, task.target), g = spot && state.goblins[task.target];
  if (!spot || !g) return;
  if (g.downUntil === null) {
    if (dist(p.pos, g.pos) > strikeReach(goblinNumbers(spot)) + REACH_SLACK) chase(state, layout, spot.id, events);
    return;
  }
  if (state.time - (g.downUntil - GOBLIN.back) < MILL.moveOnAfter) return;      // he watches it topple
  const next = nextUp(state, layout, p.pos);
  if (next) chase(state, layout, next, events);
  else if (dist(p.pos, spot.camp.pos) > spot.camp.roam + 1.5) chase(state, layout, spot.id, events);
}

/** After systems/rats.ts in each step: knocked out, the chief (if he is out) goes back into his tent; goblins his
 *  strikes beat topple over (the chief's beating clears the camp), and beaten goblins whose time is up are back; he
 *  goes on to the next or walks up to his; then each one up fights him if he is at it, stays put facing him if he is on
 *  his way to it, or mills about, its health coming back while it is hurt. Nothing once the camp is cleared. */
export function updateGoblins(state: GameState, layout: Layout, dt: number, rng: Rng, events: EventBus): void {
  const goblins = goblinsOf(layout), p = state.player;
  if (!goblins.length || state.goblinCamp.cleared) return;
  if (p.task.kind === 'knockedOut' && state.goblinCamp.chiefOut) chiefIn(state, layout);
  for (const spot of goblins) {
    const g = state.goblins[spot.id];
    if (!g) continue;
    if (spot.chief) { if (state.goblinCamp.chiefOut && g.health <= 0) { cleared(state, events); return; } continue; }
    if (g.downUntil === null && g.health <= 0) beaten(state, layout, spot, g, events);
    else if (g.downUntil !== null && state.time >= g.downUntil) { Object.assign(g, freshGoblin(spot, state.time)); events.emit({ type: 'goblinBack', id: spot.id }); }
  }
  onward(state, layout, events);
  for (const spot of goblins) {
    const g = state.goblins[spot.id];
    if (!g || !goblinUp(state, layout, spot.id)) continue;
    const n = goblinNumbers(spot), task = p.task, near = dist(p.pos, g.pos) <= strikeReach(n) + REACH_SLACK;
    const fights = task.kind === 'fight' && task.target === spot.id && near;
    const awaits = fights || (p.pending?.kind === 'fight' && p.pending.id === spot.id);
    if (awaits) { g.to = null; g.heading = facing(g.pos, p.pos); }
    else {
      potter(state, layout, groundOf(spot), spot.index + 10, g, othersOf(state, layout, spot), MILL, dt);
      heal(state, g, n.health, n.regen, dt);
    }
    if (!fights) { g.swing = null; continue; }
    const kind = spot.chief ? 'chief' : 'goblin', swung = attackHim(state, spot.id, g.swing, swingOf(spot), dt, rng, events, kind);
    if (swung !== null) { g.swing = swung; continue; }
    // he was knocked out: this one heals back, and the chief goes back into his tent
    g.health = n.health; g.swing = null;
    if (state.goblinCamp.chiefOut) chiefIn(state, layout);
  }
}
