// Everything that makes up a saved game. Systems change it; the renderer only reads it.
import type { SkillId, ToolId } from '../data/skills';
import { RESOURCES, SKILLS, TOOL_IDS } from '../data/skills';
import { HEALTH, SLOTS, type CombatStyle, type GearId, type Slot } from '../data/combat';
import { levelFor } from '../data/xp';
import { siteOf, type Layout, type Vec2 } from '../world/layout';
import { BOOK, GOALS, type Goal } from '../data/goals';
import { PICKUPS } from '../data/pickups';
import { makeDef, type MakeId } from '../data/making';
import { SHELTERS } from '../data/building';
import { DAY_SECONDS } from './clock';
import { freshRats } from './rats';
import { freshGoblins } from './goblins';
import { CHIEF } from '../data/goblins';
import type { Thoughts } from './thoughts';
import { COOK } from '../data/cooking';
import { freshNeeds, type Needs } from './needs';

/** The save format. 10 since 0.0.22: his health, and the combat and food skills. 11 since 0.0.25: "Ready for the
 *  goblins" came in before the goblin camp. 12 since the camp build (13 Oct 2026): what was built in stages before it
 *  became the camp's new upgrades or was given back to the chest, nothing is placed any more, and at most one thing is
 *  under way (core/save.ts, migrations[11]). */
export const SAVE_VERSION = 12;

/** gather: working a rock or a tree; progress runs 0..1 through one swing of that skill's tool. `mayMoveOn` is set
 *  when the node runs out while he works it, so he can move on to another; a node that was already down when he got
 *  there (the player tapped a stump) is one he was sent to, so he waits at it.
 *  pickup: standing beside something on the ground (layout.pickups) a moment; at `doneAt` (in-game seconds) it goes
 *  into his backpack. A stone or branch that isn't back yet he waits beside, `doneAt` a moment after it comes back.
 *  Gathering (0.0.14) needs nothing more saved: what he picks up says which group he goes on with (PICKUPS' gather).
 *  make (0.0.15): working at something he makes (data/making.ts, by id), beside its site or where he stands; at
 *  `doneAt` (in-game seconds) its needs are taken and it is made (systems/making).
 *  stoke (0.0.19): stoking the campfire with the logs he carried from the chest (PlayerState.stoke) until `doneAt`.
 *  cook (chapter 2): cooking a raw fish over the campfire until `doneAt` (PlayerState.cook; systems/cooking.ts).
 *  fight (0.0.22): striking `target` (core/targets.ts: the training dummy, by id) with his weapon, over and over until
 *  sent elsewhere; progress runs 0..1 from one strike to the next (systems/combat.ts). Since chapter 2's rats a target
 *  can be a rat: while it is down (beaten, until it comes back) he waits by its nest, then goes on to the next; since
 *  the goblin camp, a goblin (he waits in the camp) or the goblin chief.
 *  knockedOut (chapter 2's rats): `by` (a rat, by id; or a goblin, the chief) took his health to 0; he lies slumped until
 *  `wakeAt` (in-game seconds), then wakes at the camp (systems/rats.ts). */
export type Task = { kind: 'idle' } | { kind: 'walk' } | { kind: 'gather'; nodeId: string; progress: number; mayMoveOn?: boolean }
  | { kind: 'pickup'; id: string; doneAt: number } | { kind: 'make'; id: MakeId; doneAt: number } | { kind: 'stoke'; doneAt: number }
  | { kind: 'cook'; doneAt: number } | { kind: 'fight'; target: string; progress: number }
  | { kind: 'knockedOut'; wakeAt: number; by: string }
  /** asleep in the shelter until dawn (systems/sleep.ts) */
  | { kind: 'sleep' }
  /** building something in stages beside it (data/building.ts, systems/building.ts): how far along it is, is
   *  GameState.underway, so it stays when he is sent elsewhere */
  | { kind: 'raise'; id: MakeId };

/** What the player is walking towards: a resource node to work, a place to visit (a building or land), something
 *  on the ground to pick up, where he makes something (data/making.ts), or (0.0.22) something to fight. */
export type Pending = { kind: 'node'; id: string } | { kind: 'visit'; id: string } | { kind: 'pickup'; id: string }
  | { kind: 'make'; id: MakeId } | { kind: 'fight'; id: string }
  /** on his way to build something in stages (systems/building.ts) */
  | { kind: 'raise'; id: MakeId } | null;

/** On the way to the bank (or at the camp, since 0.0.19, the storage chest) to empty a full backpack; afterwards he
 *  goes back to work at `nodeId` (or the nearest free node like it), or (0.0.14) back to gathering things on the
 *  ground like `pickupId`, or (chapter 2's rats) back to fighting the rat `fight` (or the next one up at its nest): on
 *  his way there to fight, he also stops at the chest for food when he carries none (systems/rats.ts), and `store` says
 *  the player tapped the chest meanwhile, so he stores what he carries there too. `leaveAt` is set at the bank once the
 *  backpack is empty: he heads back when the clock reaches it. Saved, so a trip carries on after a reload. `tool`
 *  (13 Oct 2026): he goes to the chest for the tool `nodeId` needs, kept there (systems/tools.ts). */
export type Trip = ({ nodeId: string; tool?: true } | { pickupId: string } | { fight: string; store?: boolean }) & { leaveAt?: number };

/** What he goes back to after stoking the fire (0.0.19): working a node (or the nearest free one like it), gathering
 *  things off the ground like `pickupId` (or picking up that one), making something, walking on to a spot, or (chapter
 *  2, 0.0.22) cooking at the campfire or fighting something (practising on the training dummy). */
export type Back = { nodeId: string } | { pickupId: string } | { make: MakeId } | { to: Vec2 } | { cook: true } | { fight: string }
  | { raise: MakeId };

/** Stoking the fire (0.0.19; systems/fire.ts): at nightfall he left what he was doing (`back`, null for nothing),
 *  walks to where he takes the logs (`from`: the firewood pile since 0.0.21, or the storage chest; null when he took
 *  them from his backpack and goes straight to the fire), takes `logs` there (0 until then; he carries them to the
 *  fire), walks to the fire and stokes it (Task 'stoke'). `empty`: he was on his way to the chest anyway (a full
 *  backpack, or the player tapped it), so he empties his backpack there first. Saved, so stoking carries on after a
 *  reload. */
export interface Stoke { back: Back | null; logs: number; empty: boolean; from: 'woodpile' | 'chest' | null }

/** Cooking at the campfire (chapter 2; systems/cooking.ts): he cooks the raw fish in his backpack one after another
 *  (Task 'cook'); with none left there but some in the chest, he walks to the chest for them (`fetch`), then back to
 *  the fire. Saved, so cooking carries on after a reload. */
export interface Cook { fetch: boolean }

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
  /** cooking at the campfire (chapter 2), or null */
  cook: Cook | null;
}

export interface NodeState { id: string; depletedUntil: number }   // 0 when available
export interface ParcelState { claimed: boolean }

/** A rat living round its nest (chapter 2; core/rats.ts, systems/rats.ts). health: up to RAT.health, 0 while it is
 *  down. downUntil: once beaten, the in-game time it comes back at its nest; null while it is up. pos, heading: where
 *  it is and which way it faces (as the character's heading). to: where it is scurrying to, or null while it stays put
 *  until `restUntil` (in-game seconds). bite: while it fights him, the seconds since its bite under way began, or null.
 *  Its health and when it comes back matter; where it pottered to is kept only while it is still somewhere it could be
 *  (core/rats.ts, savedRats). */
export interface RatState { health: number; downUntil: number | null; pos: Vec2; heading: number; to: Vec2 | null; restUntil: number; bite: number | null }

/** A goblin in the goblin camp, or its chief (chapter 2, its last part; core/goblins.ts, systems/goblins.ts): as a rat
 *  (RatState), with `swing` for the seconds since its swing under way began while it fights him. The chief is never
 *  down: in his tent (GoblinCamp.chiefOut false) he waits at its door, unseen; beaten, the camp is cleared and the
 *  goblins are gone from the game. */
export interface GoblinState { health: number; downUntil: number | null; pos: Vec2; heading: number; to: Vec2 | null; restUntil: number; swing: number | null }

/** The goblin camp as a whole (chapter 2): whether the chief has come out of his tent (all three goblins were down at
 *  once), and whether the camp is cleared for good (the chief beaten: no goblins, its gate standing open). */
export interface GoblinCamp { chiefOut: boolean; cleared: boolean }

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
  /** what he wears (0.0.22): the gear in each slot (GEAR in data/combat.ts), or null; making gear puts it on */
  equipment: Record<Slot, GearId | null>;
  /** what fighting trains (0.0.22): Attack, Strength or Defence, chosen in the panel */
  combatStyle: CombatStyle;
  /** (chapter 2) the rats round the layout's nests, by id (core/rats.ts): none in the village */
  rats: Record<string, RatState>;
  /** (chapter 2) the goblins in the layout's goblin camp and their chief, by id (core/goblins.ts): none in the village,
   *  and none once the camp is cleared */
  goblins: Record<string, GoblinState>;
  /** (chapter 2) the goblin camp: the chief out of his tent, the camp cleared */
  goblinCamp: GoblinCamp;
  /** the in-game time he stays well rested until, after a full night's sleep in the shelter (systems/sleep.ts); 0 for
   *  not rested */
  restedUntil: number;
  /** the in-game time he stays well fed until, after a cooked meal (systems/food.ts): the XP he gains comes a little
   *  quicker (FED in data/food.ts); 0 for not */
  fedUntil: number;
  /** (chapter 2) rats beaten since the last one left a hide: the next one always does once RAT.drop.atLeast - 1 have
   *  gone by without (systems/rats.ts) */
  ratsSinceHide: number;
  /** (chapter 2, the survival book) his thoughts so far, the journal in his book, and the book's pages come unstuck
   *  (core/thoughts.ts, systems/thoughts.ts); none in the village */
  thoughts: Thoughts;
  /** things built in stages that he has begun but not finished (by id): the seconds he has worked at each so far. What
   *  each needs was taken when he began. Once finished it is in `built` instead. At most one at a time (D8) */
  underway: Partial<Record<MakeId, number>>;
  /** (the camp build) the in-game time from which he may go back by himself to something half built (the camp build's
   *  stage 2: RESUME in data/building.ts); 0 for at once. Read back as saved when it is within RESUME.wait or
   *  RESUME.retry (the longer) of the save's time (core/save.ts readSave), else 0 */
  resumeAt: number;
  /** (the camp build) his way back to something half built was last found blocked, and he said so (noPath): he says it
   *  once, not again until a way is found (systems/building.ts). Saved, so a game opened again doesn't say it again */
  lostWay: boolean;
  /** (13 Oct 2026) his needs at the camp: how full he is, a meal trip or bed under way, his bedtime, a tap waiting for
   *  him to wake (core/needs.ts, systems/needs.ts) */
  needs: Needs;
  /** (13 Oct 2026) the tools he owns that are kept in the storage chest, not carried (core/tools.ts, systems/tools.ts):
   *  none before the chest stands, and none in an old save (its tools are carried) */
  toolsInChest: ToolId[];
}

/** Whether there is a shelter to sleep in (systems/sleep.ts): any of the shelters (the tent, the wall tent, the log
 *  cabin) built at this layout's tent spot (never in the village). */
export const canSleep = (state: GameState, layout: Layout) => !!siteOf(layout, 'tent') && SHELTERS.some(id => state.built.includes(id));

/** His health at most (0.0.22): HEALTH in data/combat.ts, by his Vitality level. */
export const maxHealth = (state: GameState) => HEALTH.base + (levelFor(state.skills.vitality) - 1) * HEALTH.perLevel;

/** How many of something he has, for the goals (data/goals): an item carried or stored (the bank, or the camp's
 *  chest), or his book (BOOK), 1 once he has found it. */
export function owned(state: GameState, id: string): number {
  if (id === BOOK) return state.hasBook ? 1 : 0;
  return (state.player.backpack[id] ?? 0) + (state.bank[id] ?? 0);
}

/** Whether he has everything a goal needs (owned), and (0.0.22) every level it asks for. */
export const goalMet = (state: GameState, goal: Goal) => Object.entries(goal.needs).every(([id, n]) => owned(state, id) >= n)
  && Object.entries(goal.levels ?? {}).every(([id, n]) => levelFor(state.skills[id as SkillId] ?? 0) >= n!);

/** Whether he has made `id` (data/making.ts): a structure that stands built, a tool he owns, or (0.0.22) gear he wears.
 *  Something not in MAKES yet can't have been made. */
export function made(state: GameState, id: string): boolean {
  const def = makeDef(id);
  if (!def) return false;
  const gives = def.gives;
  return gives.kind === 'structure' ? state.built.includes(def.id) : gives.kind === 'gear' ? SLOTS.some(s => state.equipment[s] === gives.gear) : state.tools[gives.tool];
}

/** Whether a goal is finished: a gathering goal once it has everything it needs, a making goal once its thing is made.
 *  Once finished it is remembered (goalsDone, by systems/goals), so it stays finished whatever is used up later. */
export const goalFinished = (state: GameState, goal: Goal) =>
  state.goalsDone.includes(goal.id) || (goal.makes ? made(state, goal.makes) : goalMet(state, goal));

/** Whether he has begun building `id` in stages and not finished it (data/building.ts): what it needed was taken. */
export const begun = (state: GameState, id: string) => Object.hasOwn(state.underway, id) && state.underway[id as MakeId] !== undefined;

/** Whether a goal is paid for (the camp build, 13 Oct 2026): finished, or the thing it makes begun (what it needed was
 *  taken when he began it). Its lines stay ticked and nothing more is gathered for it, so the goal's count never goes
 *  backwards while he builds (the goal card, his book, the next step, gathering stopping once a goal has enough). */
export const goalPaid = (state: GameState, goal: Goal) => goalFinished(state, goal) || (!!goal.makes && begun(state, goal.makes));

/** The goal the goal card shows: the first in GOALS not finished, or the last one once all are (the card then says
 *  the camp is set up: allGoalsDone). */
export const currentGoal = (state: GameState): Goal => GOALS.find(g => !goalFinished(state, g)) ?? GOALS.at(-1)!;

/** Whether every goal is finished (since 0.0.19, with the storage chest): the camp is set up. */
export const allGoalsDone = (state: GameState) => GOALS.every(g => goalFinished(state, g));

/** The goal that has enough of `item` (0.0.21): at the camp, the current goal (until the camp is set up) asks for
 *  `item` and he has at least that many, carried or stored, or (the camp build) is paid for: the thing it makes is
 *  begun (goalPaid). Gathering it stops then, so the backpack doesn't fill up
 *  with more than the goal needs (the owner, 12 Oct 2026). Null when gathering goes on: the village, the camp set up,
 *  or a current goal that doesn't ask for it. The current goal here is the first not yet written down as finished
 *  (goalsDone, each step): a gathering goal is finished the moment it has enough, and the goal after it may not ask
 *  for the same thing (chapter 2: berries, fish), so the one just finished by what he gathered still counts. */
export function goalHasEnough(state: GameState, layout: Layout, item: string): Goal | null {
  if (!layout.camp || allGoalsDone(state)) return null;
  const goal = GOALS.find(g => !state.goalsDone.includes(g.id)) ?? currentGoal(state), need = goal.needs[item];
  // (the camp build) a goal whose thing is begun has had what it needs: none more is gathered for it
  if (need !== undefined) return owned(state, item) >= need || goalPaid(state, goal) ? goal : null;
  // a goal asking for cooked fish has enough raw fish once there are enough to cook what it still wants (13 Oct 2026:
  // before, fishing for the meal went on for ever); systems/gathering.ts then sends him to cook them
  const cooked = goal.needs[COOK.cooked];
  if (item !== COOK.raw || cooked === undefined) return null;
  return owned(state, item) >= Math.ceil((cooked - owned(state, COOK.cooked)) * COOK.rawPer) ? goal : null;
}

/** The goal to finish before `id` (data/making.ts) may be made: the first unfinished goal before the goal that makes
 *  it, or null when there is none. The goals come in order: the campfire waits for the wreck, since its planks are the
 *  wreck's, and using them first would leave the wreck never salvaged. */
export function goalFirst(state: GameState, id: string): Goal | null {
  const i = GOALS.findIndex(g => g.makes === id);
  return i < 0 ? null : GOALS.slice(0, i).find(g => !goalFinished(state, g)) ?? null;
}

/** Whether he may drop an item from his backpack: anything but the wreck's things (since chapter 2, food too: berries,
 *  cooked and burnt fish) and the goblin chief's torn map. The wreck came down only once (PICKUPS that never come back),
 *  and the chief is beaten only once, so the planks, the tarp and the map can't be dropped: a goal that needs them can
 *  never become impossible. */
export const canDrop = (item: string) => item !== CHIEF.drop && !Object.values(PICKUPS).some(p => p.respawn === null && p.gives !== 'book' && p.gives.item === item);

export function createState(layout: Layout, seed = 1): GameState {
  return {
    version: SAVE_VERSION,
    time: DAY_SECONDS * 0.32,   // start mid-morning (about 7:40)
    seed,
    player: { pos: { ...layout.start }, heading: Math.PI / 2, path: [], task: { kind: 'idle' }, pending: null, backpack: {}, trip: null, stoke: null, cook: null },
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
    equipment: Object.fromEntries(SLOTS.map(s => [s, null])) as Record<Slot, GearId | null>,
    combatStyle: 'attack',
    rats: freshRats(layout, DAY_SECONDS * 0.32),
    goblins: freshGoblins(layout, DAY_SECONDS * 0.32),
    goblinCamp: { chiefOut: false, cleared: false },
    restedUntil: 0,
    fedUntil: 0,
    ratsSinceHide: 0,
    thoughts: { journal: [], known: [], last: null, saidAt: null, passingAt: null },
    underway: {},
    resumeAt: 0,
    lostWay: false,
    needs: freshNeeds(),
    toolsInChest: [],
  };
}
