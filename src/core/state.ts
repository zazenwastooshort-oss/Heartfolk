// Everything that makes up a saved game. Systems change it; the renderer only reads it.
import type { SkillId, ToolId } from '../data/skills';
import { RESOURCES, TOOL_IDS } from '../data/skills';
import type { Layout, Vec2 } from '../world/layout';
import { BOOK, GOALS, type Goal } from '../data/goals';
import { PICKUPS } from '../data/pickups';
import { DAY_SECONDS } from './clock';

export const SAVE_VERSION = 5;

/** gather: working a rock or a tree; progress runs 0..1 through one swing of that skill's tool. `mayMoveOn` is set
 *  when the node runs out while he works it, so he can move on to another; a node that was already down when he got
 *  there (the player tapped a stump) is one he was sent to, so he waits at it.
 *  pickup: standing beside something on the ground (layout.pickups) a moment; at `doneAt` (in-game seconds) it goes
 *  into his backpack. A stone or branch that isn't back yet he waits beside, `doneAt` a moment after it comes back.
 *  Gathering (0.0.14) needs nothing more saved: what he picks up says which group he goes on with (PICKUPS' gather). */
export type Task = { kind: 'idle' } | { kind: 'walk' } | { kind: 'gather'; nodeId: string; progress: number; mayMoveOn?: boolean }
  | { kind: 'pickup'; id: string; doneAt: number };

/** What the player is walking towards: a resource node to work, a place to visit (a building or land), or something
 *  on the ground to pick up. */
export type Pending = { kind: 'node'; id: string } | { kind: 'visit'; id: string } | { kind: 'pickup'; id: string } | null;

/** On the way to the bank to empty a full backpack; afterwards he goes back to work at `nodeId` (or the nearest free
 *  node like it), or (0.0.14) back to gathering things on the ground like `pickupId`. `leaveAt` is set at the bank once
 *  the backpack is empty: he heads back when the clock reaches it. Saved, so a trip carries on after a reload. */
export type Trip = ({ nodeId: string } | { pickupId: string }) & { leaveAt?: number };

export interface PlayerState {
  pos: Vec2;
  heading: number;              // radians; 0 faces +x, positive turns towards -z
  path: Vec2[];                 // waypoints still to walk
  task: Task;
  pending: Pending;
  backpack: Record<string, number>;   // items carried, one per slot (BACKPACK_SLOTS in data/hauling)
  trip: Trip | null;
}

export interface NodeState { id: string; depletedUntil: number }   // 0 when available
export interface ParcelState { claimed: boolean }

export interface GameState {
  version: number;
  time: number;                 // in-game seconds since the save was created
  seed: number;
  player: PlayerState;
  skills: Record<SkillId, number>;   // xp per skill
  bank: Record<string, number>;      // items stored at the bank
  nodes: Record<string, NodeState>;
  parcels: Record<string, ParcelState>;
  /** the tools he owns: without the axe he can't chop, without the pick he can't mine (SWINGS in data/animation) */
  tools: Record<ToolId, boolean>;
  /** whether he has found his book (it washed up with him; it takes no backpack slot) */
  hasBook: boolean;
  /** pickups taken from the ground (layout.pickups, by id): the in-game time one lies there again, or null for never.
   *  Ones lying on the ground aren't listed. */
  taken: Record<string, number | null>;
}

/** How many of something he has, for the goals (data/goals): an item carried or banked, or his book (BOOK), 1 once
 *  he has found it. */
export function owned(state: GameState, id: string): number {
  if (id === BOOK) return state.hasBook ? 1 : 0;
  return (state.player.backpack[id] ?? 0) + (state.bank[id] ?? 0);
}

/** Whether he has everything a goal needs (owned). */
export const goalMet = (state: GameState, goal: Goal) => Object.entries(goal.needs).every(([id, n]) => owned(state, id) >= n);

/** The goal the goal card shows: the first in GOALS whose needs aren't all met, or the last one once all are met
 *  (making it comes in a later update, so the card then says it has everything). */
export const currentGoal = (state: GameState): Goal => GOALS.find(g => !goalMet(state, g)) ?? GOALS.at(-1)!;

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
    player: { pos: { ...layout.start }, heading: Math.PI / 2, path: [], task: { kind: 'idle' }, pending: null, backpack: {}, trip: null },
    skills: { mining: 0, woodcutting: 0 },
    bank: {},
    nodes: Object.fromEntries(layout.nodes.map(n => [n.id, { id: n.id, depletedUntil: 0 }])),
    parcels: Object.fromEntries(layout.parcels.map(p => [p.id, { claimed: false }])),
    tools: Object.fromEntries(TOOL_IDS.map(t => [t, layout.startTools ? layout.startTools.includes(t) : true])) as Record<ToolId, boolean>,
    hasBook: false,
    taken: {},
  };
}
