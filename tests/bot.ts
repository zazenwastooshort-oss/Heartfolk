// A headless player for the playthrough test (tests/playthrough.test.ts): it plays a camp game the way a sensible,
// low-effort idle player would. It sends only what the page lets a player send (the commands the UI queues: pickup,
// work, make, build, fight, cook, eat, drop, style), and decides only from what a player can see: the goal card
// (the current goal, what it needs and how much of it he has, carried or in the chest), what he carries, his health,
// what lies about the world (things on the ground, trees standing or felled, rats, goblins), what he is doing, and the
// notices (the events the HUD turns into notices). What things give is what a player learns from the hover text and
// the goal card's hints, so it is read from the data tables (data/pickups.ts, data/skills.ts, the creatures' drops,
// cooking's raw and cooked fish), never from goal ids or positions in the list: a new or changed goal needs no change
// here.
//
// How it decides (generically, by the kind of goal):
// - a gathering goal: it taps the nearest thing that gives what the goal still needs (a plank, the tarp, his book, a
//   stone, a branch, a birch, a copper rock, a berry bush, a fishing spot, a rat for its hide, a goblin for the
//   chief's map); the game gathers on by itself and stops once the goal has enough. Only a rat or goblin that is up:
//   a beaten one has no tap area until it is back (render/rats.ts, render/goblins.ts), so with none up it waits.
// - a making goal: what it still needs is gathered as above, then make (the goal card's Make button), or, for something
//   built at the camp's spots (in stages since the camp build), build (the goal card's Build button); once that is
//   begun the goal is paid for (its lines stay ticked), and he is left to build it, or sent back to it (Carry on).
// - a levels goal: for combat styles (and Vitality) it practises on the training dummy, picking under Train a style
//   the goal still asks for (as the notices say once one is done), and fights rats for a style the dummy has said it
//   can teach no more of; for a gathering skill it works that skill's nearest node; for Cooking it catches fish and
//   cooks them as for a meal. A levels goal in any other skill (none yet) finds nothing to do, so the run fails as
//   stuck: the bot then needs a line for that skill.
// - cooked fish: cook at the campfire whenever he has raw fish (the hint: "If some burn, catch a few more"), else
//   catch half again as many as are still wanted, then cook.
// - with a full backpack and nowhere to store it (before the chest), it drops what the goal doesn't need first, from
//   the backpack list: Drop all, or Drop 1 as often as it takes for the spare beyond what the goal needs.
// - before setting off to fight something that hits back with his health low (after a knock-out), it eats.
// While the player is there it looks every second of play (an attentive player, who also looks at once when a notice
// comes or the goal card moves on); with `visits` the player is there only now and then (Visits). It taps only when he
// has nothing useful to do (idle, or busy with something the goal no longer needs), so he is left to work otherwise.
// Stoking the fire at nightfall and being knocked out are never interrupted: he goes back to work by himself. Nor
// (his needs) are his meals and his nights in the shelter: a sensible player lets him eat and sleep (the night goes
// by quickly while he sleeps), and he goes back by himself.
// With `upgrades` (the camp build's review, PACE-no-upgrades) the player also builds up the camp: once the storage
// chest stands, with nothing under way and the goal card offering nothing to build, he begins the first upgrade the
// Build window offers that he has everything for, and lets him build it (the playthrough hands the materials in).
import { allGoalsDone, canDrop, currentGoal, goalPaid, maxHealth, owned, type GameState } from '../src/core/state';
import { begunIds, buildRows, stagedDef } from '../src/core/building';
import type { EventBus, GameEvent } from '../src/core/events';
import { ratUp, ratsOf } from '../src/core/rats';
import { CHIEF_ID, goblinsOf } from '../src/core/goblins';
import { foeKind, targetOf } from '../src/core/targets';
import type { Layout, Vec2 } from '../src/world/layout';
import { applyCommands, type Command } from '../src/systems/commands';
import { stores } from '../src/systems/backpack';
import { BOOK, type Goal } from '../src/data/goals';
import { makeDef, type MakeId } from '../src/data/making';
import { PICKUPS } from '../src/data/pickups';
import { RESOURCES, SKILLS, type SkillId } from '../src/data/skills';
import { SWINGS } from '../src/data/animation';
import { STYLES, type CombatStyle } from '../src/data/combat';
import { RAT } from '../src/data/rats';
import { CHIEF } from '../src/data/goblins';
import { COOK } from '../src/data/cooking';
import { FOOD } from '../src/data/food';
import { BACKPACK_SLOTS } from '../src/data/hauling';
import { levelFor } from '../src/data/xp';

/** The notices the bot reacts to at once (the HUD shows each as a notice, or opens something). */
const NOTICES = new Set<GameEvent['type']>([
  'goalLevel', 'backpackFull', 'noStorage', 'noRoom', 'cantFight', 'cantEat', 'cantCook', 'cookedAll', 'allGathered',
  'goalEnough', 'wokeUp', 'missing', 'goalFirst', 'noPath', 'needTool', 'levelTooLow', 'made', 'goalDone', 'cantDrop',
  'cantBuild',
]);

/** Commands that send him somewhere to do something: one that leaves him standing idle was refused. */
const SENDS = new Set<Command['type']>(['pickup', 'work', 'make', 'build', 'fight', 'cook', 'visit', 'walk']);

/** Seconds of play between looks while the player is there. */
const LOOK_EVERY = 1;
/** Seconds the bot waits before looking again after a tap was refused, so a refusal is never tapped again and again. */
const BACK_OFF = 5;
/** Below this share of his health, he eats before setting off to fight something that hits back. */
const EAT_BELOW = 0.6;
/** Raw fish caught for each cooked fish still wanted: half again as many, for the ones that burn. */
const RAW_PER_COOKED = 1.5;
/** The skill cooking trains (systems/cooking.ts), and for a goal asking a level of it, the cooked fish aimed for at a
 *  time (catching half again as many raw ones, then cooking them all). */
const COOKING = 'cooking' satisfies SkillId, COOK_BATCH = 10;

/** When the player is there to look at the game: a visit begins every `every` seconds of play (the first at the
 *  start) and lasts `stay` seconds; between visits nobody looks, and notices wait for the next visit. While there the
 *  player is attentive: a look every second, and at once when a notice comes or the goal card moves on. `stay` 0 is
 *  a single look per visit, tapping everything due at once: an upper bound on a check-in player's times, since one
 *  who stays a while taps several times per visit. */
export interface Visits { every: number; stay: number }

/** The foods, the one that heals most first (as the game eats them). */
const BEST_FOOD = Object.keys(FOOD).sort((a, b) => FOOD[b]!.heals - FOOD[a]!.heals);

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const levelOf = (state: GameState, skill: SkillId) => levelFor(state.skills[skill] ?? 0);
const isStyle = (s: string): s is CombatStyle => (STYLES as string[]).includes(s);

/** What the current goal still asks for, as the goal card shows it. items: things still wanted (how many more; none
 *  once the goal is paid for, its thing begun), with raw fish added while cooked fish are wanted (or a Cooking level)
 *  and he is out of raw ones (or still catching them); make: the goal's thing, once everything it needs is there (or
 *  it is begun); cook: cook at the campfire now; styles: combat
 *  styles still short of the level the goal asks; skills: other skills still short (Vitality, a gathering skill,
 *  Cooking). */
export interface Plan { goal: Goal; items: Record<string, number>; make: MakeId | null; cook: boolean; styles: CombatStyle[]; skills: SkillId[] }

/** A choice the bot made, for the pacing report: what it tapped, when, for which goal. */
export interface TapRecord { at: number; goal: string; command: Command; refused: boolean }

export class Bot {
  /** taps sent, by command type */
  readonly taps: Partial<Record<Command['type'], number>> = {};
  /** taps the game refused (he stayed idle): each is a sign the bot (or a player) was misled */
  refused = 0;
  /** every tap, in order */
  readonly log: TapRecord[] = [];
  /** the styles the training dummy said it can teach no more of (its notice), so they are trained on rats */
  private taught = new Set<CombatStyle>();
  /** the goals written down as finished when it last looked: the goal card moves on only when one is */
  private goalsDone = -1;
  private noticed = false;
  private nextLook = -Infinity;
  private quietUntil = -Infinity;
  /** with visits: when the first look was (the start of the first visit), and which visit the player is on */
  private start: number | null = null;
  private visit = -1;

  /** visits: when the player is there (Visits); null, the default, for always: an attentive player. upgrades: he also
   *  builds every upgrade he can along the way (see above). */
  constructor(private layout: Layout, events: EventBus, private visits: Visits | null = null, private upgrades = false) {
    events.on(e => {
      if (!NOTICES.has(e.type)) return;
      this.noticed = true;
      if (e.type === 'cantFight' && e.reason === 'taught' && e.target === 'dummy' && isStyle(e.skill)) this.taught.add(e.skill);
    });
  }

  /** Called every step, before the simulation steps (as the page applies its queue): while the player is there, looks
   *  when it is time (every second, at once when a notice comes or the goal card moves on, and as a visit begins), and
   *  taps what is needed through applyCommands, as the UI's queue does. Between visits it doesn't look. */
  tick(state: GameState, events: EventBus): void {
    const now = state.time, changed = state.goalsDone.length !== this.goalsDone;
    let fresh = false;
    if (this.visits) {
      this.start ??= now;
      const k = Math.floor((now - this.start) / this.visits.every);
      fresh = k !== this.visit;                                     // a visit begins: he looks at once
      if (!fresh && now - this.start - k * this.visits.every >= this.visits.stay) return;   // away until the next one
      this.visit = k;
    }
    const look = fresh || changed || (now >= this.quietUntil && (this.noticed || now >= this.nextLook));
    if (!look) return;
    this.goalsDone = state.goalsDone.length; this.noticed = false; this.nextLook = now + LOOK_EVERY;
    if (allGoalsDone(state)) return;
    const goal = currentGoal(state).id;
    for (const command of this.decide(state)) {
      applyCommands(state, this.layout, [command], events);
      const refused = SENDS.has(command.type) && idle(state);
      this.taps[command.type] = (this.taps[command.type] ?? 0) + 1;
      this.log.push({ at: now, goal, command, refused });
      if (refused) { this.refused++; this.quietUntil = now + BACK_OFF; break; }
    }
  }

  /** What the current goal still asks for. */
  plan(state: GameState): Plan {
    const goal = currentGoal(state), def = goal.makes ? makeDef(goal.makes) : null, items: Record<string, number> = {};
    if (!goalPaid(state, goal)) for (const [id, n] of Object.entries(def?.needs ?? goal.needs)) { const short = n - owned(state, id); if (short > 0) items[id] = short; }
    const make = def && !Object.keys(items).length ? def.id : null;
    const levels = Object.entries(goal.levels ?? {}).filter(([id, n]) => levelOf(state, id as SkillId) < n!).map(([id]) => id as SkillId);
    const styles = levels.filter(isStyle), skills = levels.filter(s => !isStyle(s));
    // cooked fish, for a goal that wants them or a Cooking level: cook while there are raw ones (finishing a catch
    // first), else catch some
    let cook = false;
    const cooked = items[COOK.cooked] ?? (skills.includes(COOKING) ? COOK_BATCH : 0);
    if (cooked > 0) {
      const raw = owned(state, COOK.raw), want = Math.ceil(cooked * RAW_PER_COOKED), p = state.player;
      const fishing = (p.task.kind === 'gather' && this.nodeGives(p.task.nodeId) === COOK.raw) || (p.pending?.kind === 'node' && this.nodeGives(p.pending.id) === COOK.raw);
      if (p.cook) cook = true;
      else if (fishing && raw < want) items[COOK.raw] = want - raw;
      else if (raw > 0) cook = true;
      else items[COOK.raw] = want;
    }
    return { goal, items, make, cook, styles, skills };
  }

  /** The taps to send now: none while he does something the goal still needs. */
  decide(state: GameState): Command[] {
    const p = state.player;
    // he wakes, stokes the fire, eats or sleeps, and goes back by himself
    if (p.task.kind === 'knockedOut' || p.stoke || p.task.kind === 'sleep' || state.needs.meal || state.needs.bed) return [];
    const plan = this.plan(state), out: Command[] = [];
    const style = this.styleFor(state, plan);
    if (style !== state.combatStyle) out.push({ type: 'style', style });
    const up = this.upgrade(state, plan);
    if (up) { out.push(up); return out; }
    if (this.useful(state, plan, style)) return out;
    const next = this.next(state, plan, style);
    if (!next) return out;
    // a full backpack with nowhere to store it: room first, by dropping what the goal doesn't need
    if (next.type === 'pickup' || next.type === 'work' || next.type === 'fight') out.push(...this.dropSpare(state, plan));
    // off to fight something that hits back, hurt: eat first
    if (next.type === 'fight' && foeKind(this.layout, next.target) && state.health < maxHealth(state) * EAT_BELOW) {
      const food = BEST_FOOD.find(f => (p.backpack[f] ?? 0) > 0);
      if (food) out.push({ type: 'eat', item: food });
    }
    out.push(next);
    return out;
  }

  /** The style to train: for a levels goal, the one he trains if the goal still asks for it (and the dummy can still
   *  teach it, while another it asks for can be learned there), else the first the goal asks for; otherwise his own. */
  private styleFor(state: GameState, plan: Plan): CombatStyle {
    const now = state.combatStyle;
    if (!plan.styles.length) return now;
    const atDummy = plan.styles.filter(s => !this.taught.has(s));
    if (plan.styles.includes(now) && (atDummy.includes(now) || !atDummy.length)) return now;
    return atDummy[0] ?? plan.styles[0]!;
  }

  /** Whether what he is doing helps the goal: he is left to get on with it. */
  private useful(state: GameState, plan: Plan, style: CombatStyle): boolean {
    const p = state.player, task = p.task, pending = p.pending, trip = p.trip;
    if (p.cook) return plan.cook;
    if (trip) {
      if ('nodeId' in trip) return this.wantsNode(plan, trip.nodeId);
      if ('pickupId' in trip) return this.wantsPickup(plan, trip.pickupId);
      return this.wantsFight(state, plan, trip.fight, style);
    }
    if (task.kind === 'make' || task.kind === 'raise') return plan.make === task.id || (task.kind === 'raise' && this.upgrading(task.id));
    if (task.kind === 'gather') return this.wantsNode(plan, task.nodeId);
    if (task.kind === 'pickup') return this.wantsPickup(plan, task.id);
    if (task.kind === 'fight') return this.wantsFight(state, plan, task.target, style);
    if (pending?.kind === 'make' || pending?.kind === 'raise') return plan.make === pending.id || (pending.kind === 'raise' && this.upgrading(pending.id));
    if (pending?.kind === 'node') return this.wantsNode(plan, pending.id);
    if (pending?.kind === 'pickup') return this.wantsPickup(plan, pending.id);
    if (pending?.kind === 'fight') return this.wantsFight(state, plan, pending.id, style);
    return false;                                                   // standing about, or walking nowhere useful
  }

  /** (upgrades) The upgrade to begin now: with nothing under way and the goal card offering nothing to build, the first
   *  the Build window offers that he has everything for. */
  private upgrade(state: GameState, plan: Plan): Command | null {
    if (!this.upgrades || plan.make || begunIds(state).length) return null;
    const row = buildRows(state, this.layout).find(r => !!r.staged.upgrades && !Object.keys(r.missing).length);
    return row ? { type: 'build', id: row.id } : null;
  }

  /** (upgrades) Whether building `id` is the player's own choice, an upgrade, so he is left to build it. */
  private upgrading(id: MakeId): boolean { return this.upgrades && !!stagedDef(id)?.upgrades; }

  private nodeGives(nodeId: string): string | null {
    const spot = this.layout.nodes.find(n => n.id === nodeId);
    return spot ? RESOURCES[spot.resource]?.item ?? null : null;
  }

  private wantsNode(plan: Plan, nodeId: string): boolean {
    const spot = this.layout.nodes.find(n => n.id === nodeId), res = spot && RESOURCES[spot.resource];
    return !!res && ((plan.items[res.item] ?? 0) > 0 || plan.skills.includes(res.skill));
  }

  private wantsPickup(plan: Plan, id: string): boolean {
    const spot = this.layout.pickups?.find(x => x.id === id), gives = spot && PICKUPS[spot.kind].gives;
    return !!gives && (plan.items[gives === 'book' ? BOOK : gives.item] ?? 0) > 0;
  }

  /** Whether fighting `target` helps: the dummy or a rat to train a style the goal asks for (rats once the dummy has
   *  taught all it can of it; any style for Vitality), a rat for its hide, a goblin (or the chief) for the map. */
  private wantsFight(state: GameState, plan: Plan, target: string, style: CombatStyle): boolean {
    const kind = foeKind(this.layout, target), trains = plan.styles.includes(style) || plan.skills.includes('vitality');
    if (!kind) return trains && !this.taught.has(style);              // the training dummy
    if (kind === 'rat') return (plan.items[RAT.drop.item] ?? 0) > 0 || (trains && (this.taught.has(style) || !targetOf(state, this.layout, 'dummy')));
    return (plan.items[CHIEF.drop] ?? 0) > 0;
  }

  /** The next thing to tap: make the goal's thing, cook, the nearest source of something still wanted, or training. */
  private next(state: GameState, plan: Plan, style: CombatStyle): Command | null {
    if (plan.make) return stagedDef(plan.make) ? { type: 'build', id: plan.make } : { type: 'make', id: plan.make };
    if (plan.cook) return { type: 'cook' };
    let best: { command: Command; d: number } | null = null;
    for (const item of Object.keys(plan.items)) {
      const found = this.sourceOf(state, item);
      if (found && (!best || found.d < best.d)) best = found;
    }
    if (best) return best.command;
    if (plan.styles.length || plan.skills.includes('vitality')) return this.trainAt(state, style);
    for (const skill of plan.skills) {
      const found = this.skillNode(state, skill);
      if (found) return found;
    }
    return null;
  }

  /** The nearest thing that gives `item`, with how far away it is: something on the ground (a plant picked bare only
   *  when none is ripe: he waits beside it), a resource node he has the tool and level for (one standing first), a
   *  creature that leaves it (a rat; for the chief's map, the chief once he is out, else a goblin), only one that is
   *  up: a beaten one has no tap area until it is back, so with none up there is nothing to tap yet. */
  private sourceOf(state: GameState, item: string): { command: Command; d: number } | null {
    const at = state.player.pos, layout = this.layout;
    const nearest = <T>(xs: T[], pos: (x: T) => Vec2) => xs.reduce<{ x: T; d: number } | null>((b, x) => {
      const d = dist(pos(x), at);
      return !b || d < b.d ? { x, d } : b;
    }, null);
    const spots = (layout.pickups ?? []).filter(x => { const g = PICKUPS[x.kind].gives; return item === BOOK ? g === 'book' : g !== 'book' && g.item === item; });
    if (spots.length) {
      const lying = spots.filter(x => !(x.id in state.taken));
      const bare = spots.filter(x => PICKUPS[x.kind].plant && typeof state.taken[x.id] === 'number');
      const pick = nearest(lying.length ? lying : bare, x => x.pos);
      if (pick) return { command: { type: 'pickup', id: pick.x.id }, d: pick.d };
    }
    const nodes = layout.nodes.filter(n => {
      const r = RESOURCES[n.resource];
      return !!r && r.item === item && state.tools[SWINGS[r.skill].tool] && levelOf(state, r.skill) >= r.level && (!n.parcel || !!state.parcels[n.parcel]?.claimed);
    });
    if (nodes.length) {
      const standing = nodes.filter(n => !state.nodes[n.id]?.depletedUntil);
      const pick = nearest(standing.length ? standing : nodes, n => n.pos);
      if (pick) return { command: { type: 'work', nodeId: pick.x.id }, d: pick.d };
    }
    if (item === RAT.drop.item) {
      const pick = nearest(ratsUp(state, layout), r => state.rats[r.id]!.pos);
      if (pick) return { command: { type: 'fight', target: pick.x.id }, d: pick.d };
    }
    if (item === CHIEF.drop && !state.goblinCamp.cleared) {
      if (state.goblinCamp.chiefOut && targetOf(state, layout, CHIEF_ID)) return { command: { type: 'fight', target: CHIEF_ID }, d: dist(state.goblins[CHIEF_ID]!.pos, at) };
      const pick = nearest(goblinsOf(layout).filter(g => !g.chief && state.goblins[g.id]?.downUntil === null), g => state.goblins[g.id]!.pos);
      if (pick) return { command: { type: 'fight', target: pick.x.id }, d: pick.d };
    }
    return null;
  }

  /** Where to train a combat style: the training dummy while it can still teach it, else the nearest rat up (with
   *  every rat beaten, nothing to tap until one is back, within a minute). */
  private trainAt(state: GameState, style: CombatStyle): Command | null {
    if (targetOf(state, this.layout, 'dummy') && !this.taught.has(style)) return { type: 'fight', target: 'dummy' };
    const at = state.player.pos, up = ratsUp(state, this.layout);
    if (!up.length) return null;
    const pick = up.reduce((a, b) => dist(state.rats[b.id]!.pos, at) < dist(state.rats[a.id]!.pos, at) ? b : a);
    return { type: 'fight', target: pick.id };
  }

  /** For a gathering skill a goal asks a level of: the nearest node of that skill he can work. */
  private skillNode(state: GameState, skill: SkillId): Command | null {
    if (!(skill in SKILLS)) return null;
    const at = state.player.pos, nodes = this.layout.nodes.filter(n => {
      const r = RESOURCES[n.resource];
      return !!r && r.skill === skill && state.tools[SWINGS[r.skill].tool] && levelOf(state, skill) >= r.level;
    });
    if (!nodes.length) return null;
    const pick = nodes.reduce((a, b) => dist(b.pos, at) < dist(a.pos, at) ? b : a);
    return { type: 'work', nodeId: pick.id };
  }

  /** With nowhere to store things (the camp before its chest) and the backpack (nearly) full: what a player would press
   *  in the backpack list (ui/backpack.ts, which has Drop 1 and Drop all), each press a tap: Drop all of everything the
   *  goal doesn't need, and Drop 1 as often as it takes of what he carries beyond what it needs. Things he can't drop
   *  (the wreck's planks and tarp, the map) stay. */
  private dropSpare(state: GameState, plan: Plan): Command[] {
    if (stores(state, this.layout).length) return [];
    const pack = state.player.backpack, carried = Object.values(pack).reduce((a, n) => a + n, 0);
    if (BACKPACK_SLOTS - carried >= 2) return [];                  // room for the next (the smashed crate gives 2)
    const def = plan.goal.makes ? makeDef(plan.goal.makes) : null, needs = def?.needs ?? plan.goal.needs;
    const out: Command[] = [];
    for (const [item, n] of Object.entries(pack)) {
      if (!canDrop(item)) continue;
      const keep = Math.min(n, needs[item] ?? 0);
      if (!keep) out.push({ type: 'drop', item, count: n });                          // Drop all
      else for (let i = keep; i < n; i++) out.push({ type: 'drop', item, count: 1 });  // Drop 1, as often as it takes
    }
    return out;
  }
}

/** The rats up (not beaten, so there is something to tap), by their spots in the layout. */
const ratsUp = (state: GameState, layout: Layout) => ratsOf(layout).filter(r => ratUp(state, r.id));

/** Whether he has nothing to do: standing about, going nowhere, on no trip, not cooking or stoking. */
const idle = (state: GameState) => {
  const p = state.player;
  return p.task.kind === 'idle' && !p.pending && !p.trip && !p.cook && !p.stoke && !p.path.length;
};
