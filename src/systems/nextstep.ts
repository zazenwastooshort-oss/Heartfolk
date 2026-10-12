// "Go do it" (the survival book): a tap on the goal card, or on his thought over his head, sends him off on the current
// goal's next step, the same as tapping the right thing in the world would: make the goal's thing once everything it
// needs is there; cook raw fish when the goal wants cooked ones (catching some first when there are none); otherwise
// gather what is still missing from the nearest source (something on the ground, a tree, a rock or a fishing spot he
// has the tool for, a rat for its hide, a goblin or their chief for the map); for a goal that asks for levels, practise
// on the training dummy while it can still teach a skill the goal asks for, else fight the rats. When he is already
// doing what the goal needs, or there is nothing to do yet (stones and branches not back), he says so and carries on.
// Headless: commands.ts applies what this picks, as the queued 'next' command.
import { allGoalsDone, currentGoal, made, owned, type GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Layout, Vec2 } from '../world/layout';
import type { Command } from './commands';
import { ratUp, ratsOf } from '../core/rats';
import { CHIEF_ID, goblinsOf } from '../core/goblins';
import { targetOf } from '../core/targets';
import { makeDef, type MakeId } from '../data/making';
import { PICKUPS } from '../data/pickups';
import { RESOURCES, type SkillId } from '../data/skills';
import { SWINGS } from '../data/animation';
import { STYLES, type CombatStyle } from '../data/combat';
import { RAT } from '../data/rats';
import { CHIEF } from '../data/goblins';
import { COOK } from '../data/cooking';
import { BOOK } from '../data/goals';
import { levelFor } from '../data/xp';
import { fishToCook } from './cooking';

/** What a tap on the goal card does: these commands, or nothing because he is already on it ('busy'), because there
 *  is nothing to do yet ('wait', with what he waits for: stones not back yet), or because every goal is done. */
export type Step = { commands: Command[] } | { busy: true } | { wait: string | null } | { done: true };

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const levelOf = (state: GameState, skill: SkillId) => levelFor(state.skills[skill] ?? 0);
const isStyle = (s: string): s is CombatStyle => (STYLES as string[]).includes(s);

/** What a resource node gives, or null. */
const nodeGives = (layout: Layout, id: string) => { const n = layout.nodes.find(x => x.id === id); return (n && RESOURCES[n.resource]?.item) ?? null; };
/** What a pickup gives (BOOK for his book), or null. */
const pickupGives = (layout: Layout, id: string) => {
  const spot = layout.pickups?.find(x => x.id === id), gives = spot && PICKUPS[spot.kind].gives;
  return !gives ? null : gives === 'book' ? BOOK : gives.item;
};

/** What the goal still asks for: items short (how many more), the thing to make once all is there, whether to cook,
 *  and the skills still short of the levels it asks. */
interface Wants { items: Record<string, number>; make: MakeId | null; cook: boolean; styles: CombatStyle[]; skills: SkillId[] }

function wantsOf(state: GameState, layout: Layout): Wants {
  const goal = currentGoal(state), def = goal.makes ? makeDef(goal.makes) : null, items: Record<string, number> = {};
  for (const [id, n] of Object.entries(def?.needs ?? goal.needs)) { const short = n - owned(state, id); if (short > 0) items[id] = short; }
  const make = def && !made(state, def.id) && !Object.keys(items).length ? def.id : null;
  const short = Object.entries(goal.levels ?? {}).filter(([id, n]) => levelOf(state, id as SkillId) < n!).map(([id]) => id as SkillId);
  let cook = false;
  const cooked = items[COOK.cooked] ?? 0;
  if (cooked > 0) {
    const p = state.player, raw = owned(state, COOK.raw), want = Math.ceil(cooked * COOK.rawPer);
    const fishing = (p.task.kind === 'gather' && nodeGives(layout, p.task.nodeId) === COOK.raw) || (p.pending?.kind === 'node' && nodeGives(layout, p.pending.id) === COOK.raw);
    delete items[COOK.cooked];
    if (p.cook) cook = true;
    else if (fishing && raw < want) items[COOK.raw] = want - raw;     // finishing a catch first
    else if (fishToCook(state, layout)) cook = true;
    else items[COOK.raw] = want;
  }
  return { items, make, cook, styles: short.filter(isStyle), skills: short.filter(s => !isStyle(s)) };
}

/** Whether what he is doing already serves the goal, so a tap leaves him to it. */
function busy(state: GameState, layout: Layout, w: Wants): boolean {
  const p = state.player, task = p.task, pending = p.pending, trip = p.trip;
  const item = (id: string | null) => !!id && (w.items[id] ?? 0) > 0;
  const fights = (id: string) => {
    const t = targetOf(state, layout, id);
    if (!t) return false;
    if (!t.foe) return w.styles.length > 0 || w.skills.includes('vitality');
    if (t.foe.kind === 'rat') return item(RAT.drop.item) || w.styles.length > 0;
    return item(CHIEF.drop);
  };
  if (p.cook) return w.cook;
  if (w.make) return (task.kind === 'make' && task.id === w.make) || (pending?.kind === 'make' && pending.id === w.make);
  if (trip) return 'nodeId' in trip ? item(nodeGives(layout, trip.nodeId)) : 'pickupId' in trip ? item(pickupGives(layout, trip.pickupId)) : fights(trip.fight);
  if (task.kind === 'gather') { const r = RESOURCES[layout.nodes.find(n => n.id === task.nodeId)?.resource ?? '']; return !!r && (item(r.item) || w.skills.includes(r.skill)); }
  if (task.kind === 'pickup') return item(pickupGives(layout, task.id));
  if (task.kind === 'fight') return fights(task.target);
  if (pending?.kind === 'node') return item(nodeGives(layout, pending.id));
  if (pending?.kind === 'pickup') return item(pickupGives(layout, pending.id));
  if (pending?.kind === 'fight') return fights(pending.id);
  return false;
}

/** The nearest of `xs` to `at`, with how far. */
function nearest<T>(xs: T[], pos: (x: T) => Vec2, at: Vec2): { x: T; d: number } | null {
  return xs.reduce<{ x: T; d: number } | null>((b, x) => { const d = dist(pos(x), at); return !b || d < b.d ? { x, d } : b; }, null);
}

/** The nearest source of `item`, as a tap in the world: something lying on the ground (a berry bush picked bare only
 *  when none is ripe: he waits beside it), a node he has the tool and level for (a standing one first), a rat for its
 *  hide (one that is up first; else one down, by whose nest he waits), for the map the chief once he is out, else a
 *  goblin (one up first). Null when there is none to tap yet. */
function sourceOf(state: GameState, layout: Layout, item: string): { command: Command; d: number } | null {
  const at = state.player.pos;
  const spots = (layout.pickups ?? []).filter(x => pickupGivesKind(x.kind) === item);
  if (spots.length) {
    const lying = spots.filter(x => !(x.id in state.taken));
    const bare = spots.filter(x => PICKUPS[x.kind].plant && typeof state.taken[x.id] === 'number');
    const pick = nearest(lying.length ? lying : bare, x => x.pos, at);
    if (pick) return { command: { type: 'pickup', id: pick.x.id }, d: pick.d };
  }
  const nodes = layout.nodes.filter(n => {
    const r = RESOURCES[n.resource];
    return !!r && r.item === item && state.tools[SWINGS[r.skill].tool] && levelOf(state, r.skill) >= r.level && (!n.parcel || !!state.parcels[n.parcel]?.claimed);
  });
  if (nodes.length) {
    const standing = nodes.filter(n => !state.nodes[n.id]?.depletedUntil);
    const pick = nearest(standing.length ? standing : nodes, n => n.pos, at);
    if (pick) return { command: { type: 'work', nodeId: pick.x.id }, d: pick.d };
  }
  if (item === RAT.drop.item) {
    const rats = ratsOf(layout).filter(r => state.rats[r.id]), up = rats.filter(r => ratUp(state, r.id));
    const pick = nearest(up.length ? up : rats, r => state.rats[r.id]!.pos, at);
    if (pick) return { command: { type: 'fight', target: pick.x.id }, d: pick.d };
  }
  if (item === CHIEF.drop && !state.goblinCamp.cleared) {
    if (state.goblinCamp.chiefOut && targetOf(state, layout, CHIEF_ID)) return { command: { type: 'fight', target: CHIEF_ID }, d: dist(state.goblins[CHIEF_ID]!.pos, at) };
    const goblins = goblinsOf(layout).filter(g => !g.chief && state.goblins[g.id]), up = goblins.filter(g => state.goblins[g.id]!.downUntil === null);
    const pick = nearest(up.length ? up : goblins, g => state.goblins[g.id]!.pos, at);
    if (pick) return { command: { type: 'fight', target: pick.x.id }, d: pick.d };
  }
  return null;
}

/** What a kind of pickup gives (BOOK for the book). */
const pickupGivesKind = (kind: keyof typeof PICKUPS) => { const g = PICKUPS[kind].gives; return g === 'book' ? BOOK : g.item; };

/** For a goal asking for combat levels: the style to train (the one he trains if still wanted, else the first wanted
 *  that the dummy can teach, else the first wanted) and where: the dummy while it can teach it, else the nearest rat. */
function training(state: GameState, layout: Layout, styles: CombatStyle[]): Command[] {
  const dummy = targetOf(state, layout, 'dummy');
  const teaches = (s: CombatStyle) => !!dummy && levelOf(state, s) < dummy.maxLevel;
  const style = styles.includes(state.combatStyle) && (teaches(state.combatStyle) || !styles.some(teaches)) ? state.combatStyle
    : styles.find(teaches) ?? styles[0]!;
  const out: Command[] = style !== state.combatStyle ? [{ type: 'style', style }] : [];
  if (dummy && teaches(style) && state.equipment.weapon) return [...out, { type: 'fight', target: 'dummy' }];
  const rats = ratsOf(layout).filter(r => state.rats[r.id]), up = rats.filter(r => ratUp(state, r.id));
  const pick = nearest(up.length ? up : rats, r => state.rats[r.id]!.pos, state.player.pos);
  return pick ? [...out, { type: 'fight', target: pick.x.id }] : out;
}

/** The current goal's next step (Step): what to send him to do, or why nothing. */
export function nextStep(state: GameState, layout: Layout): Step {
  if (!layout.camp || allGoalsDone(state)) return { done: true };
  const w = wantsOf(state, layout);
  if (busy(state, layout, w)) return { busy: true };
  if (w.make) return { commands: [{ type: 'make', id: w.make }] };
  if (w.cook) return { commands: [{ type: 'cook' }] };
  let best: { command: Command; d: number } | null = null;
  for (const item of Object.keys(w.items)) {
    const found = sourceOf(state, layout, item);
    if (found && (!best || found.d < best.d)) best = found;
  }
  if (best) return { commands: [best.command] };
  if (w.styles.length) { const commands = training(state, layout, w.styles); if (commands.some(c => c.type === 'fight')) return { commands }; }
  if (w.skills.includes('vitality')) { const commands = training(state, layout, [state.combatStyle]); if (commands.length) return { commands }; }
  for (const skill of w.skills) {
    const at = state.player.pos, nodes = layout.nodes.filter(n => {
      const r = RESOURCES[n.resource];
      return !!r && r.skill === skill && state.tools[SWINGS[r.skill].tool] && levelOf(state, skill) >= r.level;
    });
    const pick = nearest(nodes, n => n.pos, at);
    if (pick) return { commands: [{ type: 'work', nodeId: pick.x.id }] };
  }
  // nothing to tap yet: stones or branches all taken and not back, say
  return { wait: Object.keys(w.items)[0] ?? null };
}

/** The 'next' command (commands.ts): the commands to apply for the goal's next step, saying so (onIt, nothingYet)
 *  when there are none. */
export function nextCommands(state: GameState, layout: Layout, events: EventBus): Command[] {
  const step = nextStep(state, layout);
  if ('commands' in step) return step.commands;
  if ('busy' in step) events.emit({ type: 'onIt' });
  else if ('wait' in step) events.emit({ type: 'nothingYet', item: step.wait });
  return [];
}
