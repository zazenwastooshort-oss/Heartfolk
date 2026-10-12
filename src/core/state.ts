// Everything that makes up a saved game. Systems change it; the renderer only reads it.
import type { SkillId, ToolId } from '../data/skills';
import { RESOURCES, SKILLS, TOOL_IDS } from '../data/skills';
import { HEALTH } from '../data/combat';
import { levelFor } from '../data/xp';
import type { Layout, Vec2 } from '../world/layout';
import { BOOK, GOALS, type Goal } from '../data/goals';
import { PICKUPS } from '../data/pickups';
import { makeDef, type MakeId } from '../data/making';
import { DAY_SECONDS } from './clock';

/** The save format. 10 since 0.0.22: his health, and the combat and food skills. */
export const SAVE_VERSION = 10;

/** gather: working a rock or a tree; progress runs 0..1 through one swing of that skill's tool. `mayMoveOn` is set
 *  when the node runs out while he works it, so he can move on to another; a node that was already down when he got
 *  there (the player tapped a stump) is one he was sent to, so he waits at it.
 *  pickup: standing beside something on the ground (layout.pickups) a moment; at `doneAt` (in-game seconds) it goes
 *  into his backpack. A stone or branch that isn't back yet he waits beside, `doneAt` a moment after it comes back.
 *  Gathering (0.0.14) needs nothing more saved: what he picks up says which group he goes on with (PICKUPS' gather).
 *  make (0.0.15): working at something he makes (data/making.ts, by id), beside its site or where he stands; at
 *  `doneAt` (in-game seconds) its needs are taken and it is made (systems/making).
 *  stoke (0.0.19): stoking the campfire with the logs he carried from the chest (PlayerState.stoke) until `doneAt`. */
export type Task = { kind: 'idle' } | { kind: 'walk' } | { kind: 'gather'; nodeId: string; progress: number; mayMoveOn?: boolean }
  | { kind: 'pickup'; id: string; doneAt: number } | { kind: 'make'; id: MakeId; doneAt: number } | { kind: 'stoke'; doneAt: number };

/** What the player is walking towards: a resource node to work, a place to visit (a building or land), something
 *  on the ground to pick up, or where he makes something (data/making.ts). */
export type Pending = { kind: 'node'; id: string } | { kind: 'visit'; id: string } | { kind: 'pickup'; id: string }
  | { kind: 'make'; id: MakeId } | null;

/** On the way to the bank (or at the camp, since 0.0.19, the storage chest) to empty a full backpack; afterwards he
 *  goes back to work at `nodeId` (or the nearest free node like it), or (0.0.14) back to gathering things on the
 *  ground like `pickupId`. `leaveAt` is set at the bank once the backpack is empty: he heads back when the clock
 *  reaches it. Saved, so a trip carries on after a reload. */
export type Trip = ({ nodeId: string } | { pickupId: string }) & { leaveAt?: number };

/** What he goes back to after stoking the fire (0.0.19): working a node (or the nearest free one like it), gathering
 *  things off the ground like `pickupId` (or picking up that one), making something, or walking on to a spot. */
export type Back = { nodeId: string } | { pickupId: string } | { make: MakeId } | { to: Vec2 };

/** Stoking the fire (0.0.19; systems/fire.ts): at nightfall he left what he was doing (`back`, null for nothing),
 *  walks to where he takes the logs (`from`: the firewood pile since 0.0.21, or the storage chest; null when he took
 *  them from his backpack and goes straight to the fire), takes `logs` there (0 until then; he carries them to the
 *  fire), walks to the fire and stokes it (Task 'stoke'). `empty`: he was on his way to the chest anyway (a full
 *  backpack, or the player tapped it), so he empties his backpack there first. Saved, so stoking carries on after a
 *  reload. */
export interface Stoke { back: Back | null; logs: number; empty: boolean; from: 'woodpile' | 'chest' | null }

export interface PlayerState {
  pos: Vec2;
  heading: number;              // radians; 0 faces +x, positive turns towards -z
  path: Vec2[];                 // waypoints still to walk
  task: Task;
  pending: Pending;
  backpack: Record<string, number>;   // items carried, one per slot (BACKPACK_SLOTS in data/hauling)
  trip: Trip | null;
  /** off to stoke the fire (0.0.19), or null */
  stoke: Stoke | null;
}

export interface NodeState { id: string; depletedUntil: number }   // 0 when available
export interface ParcelState { claimed: boolean }

export interface GameState {
  version: number;
  time: number;                 // in-game seconds since the save was created
  seed: number;
  player: PlayerState;
  skills: Record<SkillId, number>;   // xp per skill
  /** items stored: at the bank in the village, in the storage chest at the camp (since 0.0.19) */
  bank: Record<string, number>;
  nodes: Record<string, NodeState>;
  parcels: Record<string, ParcelState>;
  /** the tools he owns: without the axe he can't chop, without the pick he can't mine (SWINGS in data/animation) */
  tools: Record<ToolId, boolean>;
  /** whether he has found his book (it washed up with him; it takes no backpack slot) */
  hasBook: boolean;
  /** pickups taken from the ground (layout.pickups, by id): the in-game time one lies there again, or null for never.
   *  Ones lying on the ground aren't listed. */
  taken: Record<string, number | null>;
  /** what he has built that stands at its site (data/making.ts, by id), since 0.0.15: the campfire */
  built: MakeId[];
  /** the goals finished (data/goals.ts, by id), since 0.0.15: a goal finished stays finished */
  goalsDone: string[];
  /** the last night (nightOf in core/clock) the fire was seen to at nightfall, since 0.0.19: he set off to stoke it,
   *  found no logs, or the campfire and the chest weren't both standing yet. -1 before the first. */
  stokedNight: number;
  /** the campfire burns low: there were no logs to stoke it at nightfall. Until it is next stoked (0.0.19). */
  fireLow: boolean;
  /** logs stacked in the firewood pile (0.0.21; WOODPILE in data/fire.ts): 0 until it is built, which stacks the 10
   *  it is made from */
  woodpile: number;
  /** the player stopped him on his way to stoke the fire tonight (0.0.21): he sets off again once he has nothing to
   *  do, the same night */
  stokeAgain: boolean;
  /** his health (chapter 2, 0.0.22): up to maxHealth, which grows with Vitality; food heals it (systems/food.ts) */
  health: number;
}

/** His health at most (0.0.22): HEALTH in data/combat.ts, by his Vitality level. */
export const maxHealth = (state: GameState) => HEALTH.base + (levelFor(state.skills.vitality) - 1) * HEALTH.perLevel;

/** How many of something he has, for the goals (data/goals): an item carried or stored (the bank, or the camp's
 *  chest), or his book (BOOK), 1 once he has found it. */
export function owned(state: GameState, id: string): number {
  if (id === BOOK) return state.hasBook ? 1 : 0;
  return (state.player.backpack[id] ?? 0) + (state.bank[id] ?? 0);
}

/** Whether he has everything a goal needs (owned). */
export const goalMet = (state: GameState, goal: Goal) => Object.entries(goal.needs).every(([id, n]) => owned(state, id) >= n);

/** Whether he has made `id` (data/making.ts): a structure that stands built, or a tool he owns. Something not in
 *  MAKES yet can't have been made. */
export function made(state: GameState, id: string): boolean {
  const def = makeDef(id);
  if (!def) return false;
  return def.gives.kind === 'structure' ? state.built.includes(def.id) : state.tools[def.gives.tool];
}

/** Whether a goal is finished: a gathering goal once it has everything it needs, a making goal once its thing is made.
 *  Once finished it is remembered (goalsDone, by systems/goals), so it stays finished whatever is used up later. */
export const goalFinished = (state: GameState, goal: Goal) =>
  state.goalsDone.includes(goal.id) || (goal.makes ? made(state, goal.makes) : goalMet(state, goal));

/** The goal the goal card shows: the first in GOALS not finished, or the last one once all are (the card then says
 *  the camp is set up: allGoalsDone). */
export const currentGoal = (state: GameState): Goal => GOALS.find(g => !goalFinished(state, g)) ?? GOALS.at(-1)!;

/** Whether every goal is finished (since 0.0.19, with the storage chest): the camp is set up. */
export const allGoalsDone = (state: GameState) => GOALS.every(g => goalFinished(state, g));

/** The goal that has enough of `item` (0.0.21): at the camp, the current goal (until the camp is set up) asks for
 *  `item` and he has at least that many, carried or stored. Gathering it stops then, so the backpack doesn't fill up
 *  with more than the goal needs (the owner, 12 Oct 2026). Null when gathering goes on: the village, the camp set up,
 *  or a current goal that doesn't ask for it. */
export function goalHasEnough(state: GameState, layout: Layout, item: string): Goal | null {
  if (!layout.camp || allGoalsDone(state)) return null;
  const goal = currentGoal(state), need = goal.needs[item];
  return need !== undefined && owned(state, item) >= need ? goal : null;
}

/** The goal to finish before `id` (data/making.ts) may be made: the first unfinished goal before the goal that makes
 *  it, or null when there is none. The goals come in order: the campfire waits for the wreck, since its planks are the
 *  wreck's, and using them first would leave the wreck never salvaged. */
export function goalFirst(state: GameState, id: string): Goal | null {
  const i = GOALS.findIndex(g => g.makes === id);
  return i < 0 ? null : GOALS.slice(0, i).find(g => !goalFinished(state, g)) ?? null;
}

/** Whether he may drop an item from his backpack: only something he can find again, from a tree or a rock
 *  (RESOURCES) or lying on the ground again after a while (PICKUPS that come back). The wreck came down only once,
 *  so its planks and its tarp can't be dropped: a goal that needs them can never become impossible. */
export const canDrop = (item: string) => Object.values(RESOURCES).some(r => r.item === item)
  || Object.values(PICKUPS).some(p => p.respawn !== null && p.gives !== 'book' && p.gives.item === item);

export function createState(layout: Layout, seed = 1): GameState {
  return {
    version: SAVE_VERSION,
    time: DAY_SECONDS * 0.32,   // start mid-morning (about 7:40)
    seed,
    player: { pos: { ...layout.start }, heading: Math.PI / 2, path: [], task: { kind: 'idle' }, pending: null, backpack: {}, trip: null, stoke: null },
    skills: Object.fromEntries(Object.keys(SKILLS).map(id => [id, 0])) as Record<SkillId, number>,
    bank: {},
    nodes: Object.fromEntries(layout.nodes.map(n => [n.id, { id: n.id, depletedUntil: 0 }])),
    parcels: Object.fromEntries(layout.parcels.map(p => [p.id, { claimed: false }])),
    tools: Object.fromEntries(TOOL_IDS.map(t => [t, layout.startTools ? layout.startTools.includes(t) : true])) as Record<ToolId, boolean>,
    hasBook: false,
    taken: {},
    built: [],
    goalsDone: [],
    stokedNight: -1,
    fireLow: false,
    woodpile: 0,
    stokeAgain: false,
    health: HEALTH.base,
  };
}
