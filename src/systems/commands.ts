// The only way the UI changes the game: it queues commands, and the simulation applies them at the start of a step.
import { goalFirst, type GameState } from '../core/state';
import { isNight } from '../core/clock';
import type { EventBus } from '../core/events';
import type { Layout, Vec2 } from '../world/layout';
import { walkTo, goWork, goVisit, goPickup, goMake } from '../actors/player';
import { RESOURCES } from '../data/skills';
import { SWINGS } from '../data/animation';
import { makeDef, type MakeId } from '../data/making';
import { levelOf } from './skills';
import { gatherOf, roomFor, tappable } from './pickups';
import { drop, isStore, stopStoking, stores } from './backpack';
import { canMake, missingFor } from './making';
import { eat } from './food';
import { mayFight, setStyle } from './combat';
import { setOffToFight } from './rats';
import type { CombatStyle } from '../data/combat';
import { canCook, fishToCook, goCook } from './cooking';
import { canSleep, goToBed } from './sleep';
import { nextCommands } from './nextstep';
import { pickJob, sent, stopJob } from './jobs';
import type { JobId } from '../data/jobs';

export type Command =
  | { type: 'walk'; to: Vec2 }
  | { type: 'work'; nodeId: string }
  /** a building (by id), something he built (the storage chest, to empty the backpack into it), or land that isn't
   *  the player's yet (parcel id, with where it was tapped) */
  | { type: 'visit'; id: string; at?: Vec2 }
  /** something lying on the ground (layout.pickups, by id): walk over and pick it up; a plank, stone or branch starts
   *  gathering more like it (systems/pickups) */
  | { type: 'pickup'; id: string }
  /** drop `count` of an item from the backpack (all of it when `count` is more than he carries) */
  | { type: 'drop'; item: string; count: number }
  /** make something (data/making.ts): the goal card's Build button, or a tap on its site. At the camp, a goal before
   *  the one that makes it still to finish, or without everything it needs, he says so and stays put. */
  | { type: 'make'; id: MakeId }
  /** eat one of an item from the backpack (chapter 2, 0.0.22): food heals him; nothing else stops */
  | { type: 'eat'; item: string }
  /** fight something (core/targets.ts, by id; 0.0.22): a tap on the built training dummy sends him to practise on it,
   *  (chapter 2) a tap on a rat to fight the rats. Without a weapon, or with nothing left for it to teach in the style
   *  he trains, he says so and stays put. */
  | { type: 'fight'; target: string }
  /** choose what fighting trains (the panel's Train choice, 0.0.22); nothing else stops */
  | { type: 'style'; style: CombatStyle }
  /** cook at the campfire (chapter 2, a tap on it once it stands): he cooks his raw fish one after another, fetching
   *  them from the chest when he carries none; with none anywhere he says so and stays put, or before he owns a rod,
   *  walks beside the fire */
  | { type: 'cook' }
  /** to bed in the shelter (a tap on it at night): off to stoke the fire, he stokes it first; by day he says he isn't
   *  tired yet */
  | { type: 'sleep' }
  /** go do it (the survival book): a tap on the goal card or on his thought sends him off on the current goal's next
   *  step (systems/nextstep.ts), as tapping the right thing in the world would; already on it, or with nothing to do
   *  yet, he says so */
  | { type: 'next' }
  /** (the idle core) make `job` his job (picked in ui/jobs.ts; systems/jobs.ts): refused, saying why, when he can't do it yet */
  | { type: 'job'; job: JobId }
  /** (the idle core) no job any more (the Stop button in ui/jobs.ts) */
  | { type: 'stopJob' };

export const isClaimed = (state: GameState, parcelId: string | undefined) => !parcelId || !!state.parcels[parcelId]?.claimed;

export function applyCommands(state: GameState, layout: Layout, queue: Command[], events: EventBus): void {
  for (const c of queue.splice(0)) {
    // dropping something doesn't send him anywhere: whatever he is doing carries on, a trip to the bank (the chest)
    // or stoking the fire included
    if (c.type === 'drop') { drop(state, c.item, c.count, events); continue; }
    if (c.type === 'stopJob') { stopJob(state, events); continue; }
    // knocked out (chapter 2's rats): nothing but choosing what he trains (or his job, to start once he wakes) until he
    // wakes, a moment later
    if (state.player.task.kind === 'knockedOut' && c.type !== 'style' && c.type !== 'job') continue;
    if (c.type === 'eat') { eat(state, c.item, events); continue; }
    if (c.type === 'style') { setStyle(state, c.style); continue; }
    // go do it: the goal's next step, applied as the commands a tap in the world would send
    if (c.type === 'next') { const next = nextCommands(state, layout, events); if (next.length) applyCommands(state, layout, next, events); continue; }
    let ok = true;
    // (the idle core) a job: refused, or to start later (he is asleep, say), or he set off on it
    if (c.type === 'job') { if (!pickJob(state, layout, c.job, events)) continue; }
    else if (c.type === 'walk') ok = walkTo(state, layout, c.to);
    else if (c.type === 'visit') ok = goVisit(state, layout, c.id, c.at);
    else if (c.type === 'pickup') {
      // lying there (or a berry bush picked bare: he goes to wait beside it)
      if (!tappable(state, layout, c.id)) continue;
      // no room for it: where there is a bank (or the camp's chest), gathering starts with a trip to empty the
      // backpack (systems/hauling), as working a tree does; otherwise he says so and stays put
      const toBankFirst = !!gatherOf(layout, c.id) && stores(state, layout).length > 0;
      if (!roomFor(state, layout, c.id) && !toBankFirst) { events.emit({ type: 'noRoom' }); continue; }
      ok = goPickup(state, layout, c.id);
    } else if (c.type === 'make') {
      const def = makeDef(c.id), task = state.player.task;
      // not here, already made (built, or a tool he owns), or already at work on it: nothing to do
      if (!def || !canMake(state, layout, def) || (task.kind === 'make' && task.id === def.id)) continue;
      // the camp's goals come in order: the campfire waits until the wreck is salvaged
      const first = layout.camp ? goalFirst(state, def.id) : null;
      if (first) { events.emit({ type: 'goalFirst', make: def.id, goal: first.id }); continue; }
      const missing = missingFor(state, def);
      if (Object.keys(missing).length) { events.emit({ type: 'missing', make: def.id, items: missing }); continue; }
      ok = goMake(state, layout, def.id);
    } else if (c.type === 'fight') {
      // nothing there to fight (the dummy not built), at it already, no weapon, or nothing left to learn: no setting off
      if (!mayFight(state, layout, c.target, events)) continue;
      // (chapter 2) to fight the rats with no food on him, he goes by the chest for some first: a trip it sets
      ok = setOffToFight(state, layout, c.target, events);
    } else if (c.type === 'sleep') {
      const p = state.player;
      if (!canSleep(state, layout) || p.task.kind === 'sleep') continue;
      if (!isNight(state.time)) { events.emit({ type: 'cantSleep' }); continue; }
      // off to stoke the fire: he finishes that, then goes to bed (systems/fire.ts goes back to { sleep })
      if (p.stoke) { p.stoke.back = { sleep: true }; events.emit({ type: 'bedLater' }); continue; }
      ok = goToBed(state, layout);
    } else if (c.type === 'cook') {
      // no campfire here, or already cooking: nothing to do
      if (!canCook(state, layout) || state.player.cook) continue;
      // no raw fish anywhere: with a rod to catch some he says so and stays put; before he has one, a tap on the fire
      // only walks him beside it, as it did before there was cooking
      if (!fishToCook(state, layout)) {
        if (state.tools.rod) { events.emit({ type: 'cantCook' }); continue; }
        ok = goVisit(state, layout, 'campfire');
      } else ok = goCook(state, layout);
    } else {
      const spot = layout.nodes.find(n => n.id === c.nodeId);
      const res = spot && RESOURCES[spot.resource];
      if (!spot || !res) continue;
      const tool = SWINGS[res.skill].tool;
      if (!isClaimed(state, spot.parcel)) { ok = goVisit(state, layout, spot.parcel!, spot.pos); }
      // without the tool for it he can't work it at all, so he doesn't set off
      else if (!state.tools[tool]) { events.emit({ type: 'needTool', tool, skill: res.skill }); continue; }
      else if (levelOf(state, res.skill) < res.level) { events.emit({ type: 'levelTooLow', skill: res.skill, need: res.level, what: res.name }); continue; }
      else ok = goWork(state, layout, c.nodeId);
    }
    if (!ok) { events.emit({ type: 'noPath' }); continue; }
    // the player's command wins over a trip to the bank or the chest (the backpack keeps its items), unless it sends
    // him there anyway. Sent to work (or to gather) with a full backpack, hauling starts a new trip at once. It wins
    // over stoking the fire too (systems/fire.ts): logs he carries go back where he took them from, and (0.0.21) he
    // sets off again once he has nothing to do, the same night. A tap on the pile or the chest while he is on his way
    // there for the logs sends him where he was going: at the chest he empties the backpack too, and stokes on.
    const toStore = c.type === 'visit' && isStore(state, layout, c.id), stoke = state.player.stoke;
    if (!toStore && c.type !== 'fight' && c.type !== 'job') state.player.trip = null;
    // (chapter 2) a tap on the chest while he is on his way there for food to fight with: he stores what he carries too
    if (toStore && state.player.trip && 'fight' in state.player.trip) state.player.trip.store = true;
    if (c.type !== 'cook' && c.type !== 'job') state.player.cook = null;      // any other command stops cooking (chapter 2; a job: systems/jobs.ts)
    if (stoke && stoke.logs === 0 && c.type === 'visit' && c.id === stoke.from) { if (c.id === 'chest') stoke.empty = true; }
    else if (stoke) { stopStoking(state); if (isNight(state.time)) state.stokeAgain = true; }
    // (the idle core) he was sent somewhere: his job waits until that's done, and so do a meal and bed (systems/jobs.ts)
    sent(state, c.type === 'job');
  }
}
