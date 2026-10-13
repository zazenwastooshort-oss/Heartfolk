// The playthrough bot (the owner's go, 12 Oct 2026): a headless player (tests/bot.ts) plays brand-new games from the
// riverbank to the end of chapter 2 the way a player would, through the commands the UI sends, and the test fails if
// he ever gets stuck. For several seeds it plays from createState(CAMP, seed) and checks: chapter 1 (the storage chest)
// and chapter 2 (the torn map) finish within generous limits of play; he is never stuck (the goal card never stays
// still for 20 minutes of play: no goal finished, nothing more of what it counts, no XP toward a level it asks); his
// position stays a number, on ground he can stand on; the backpack never holds more than it can; and saves made at
// random moments through the whole run (one every 30 to 120 seconds of play, serialized, read back and played on from
// the loaded game, with fresh randomness as the page has after opening a save) read back exactly and change nothing
// about finishing. Then the bot's own habits: a full backpack with nowhere to store it, a levels goal the training
// dummy can't teach all of, and a Cooking levels goal. With HEARTHFOLK_PACING=1 it prints the pacing: how long each
// goal and each chapter takes (median and range over the seeds), the taps, knock-outs, food eaten and levels at the end
// of each chapter. For pacing studies: HEARTHFOLK_SEEDS=20 plays seeds 1 to 20 instead of 1 to 4; HEARTHFOLK_VISIT=300,60
// makes the bot a player who checks in every 5 minutes of play and stays a minute (attentive while there), and
// HEARTHFOLK_VISIT=300 one who looks once each time (one look per visit: an upper bound); HEARTHFOLK_TRACE=2 prints
// seed 2's taps and notices as it plays.
// (In PowerShell: $env:HEARTHFOLK_PACING=1; npx vitest run tests/playthrough.test.ts)
// The chapters are found by what ends them, never by position: chapter 1 ends with the goal that makes the storage
// chest, chapter 2 with the last goal; the goblin camp is the goal that asks for the chief's torn map.
import { afterAll, describe, expect, it } from 'vitest';
import { allGoalsDone, createState, currentGoal, type GameState } from '../src/core/state';
import { goalLines } from '../src/core/book';
import { targetOf } from '../src/core/targets';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { DAY_SECONDS } from '../src/core/clock';
import { deserialize, serialize } from '../src/core/save';
import { step, type SimContext } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { navFor, type NavGrid } from '../src/world/nav';
import { backpackCount } from '../src/systems/backpack';
import { GOALS, type Goal } from '../src/data/goals';
import { makeDef } from '../src/data/making';
import { CHIEF } from '../src/data/goblins';
import { DUMMY, GEAR } from '../src/data/combat';
import { SKILLS, type SkillId } from '../src/data/skills';
import { SWINGS } from '../src/data/animation';
import { BACKPACK_SLOTS } from '../src/data/hauling';
import { AWAY } from '../src/data/away';
import { SLEEP } from '../src/data/sleep';
import { levelFor, XP_TABLE } from '../src/data/xp';
import { Bot, type Visits } from './bot';

/** Whether the bot can clear the goblin camp under the current rules. Not in 0.0.24: the chief comes out only once all
 *  three goblins are down at once, which takes hitting hard and often (Strength around 6), and no goal asks him to train
 *  for it (the bot plays by the goals, as a player following the card does). He arrives with Attack 3 and Strength 3
 *  from practice and Defence about 10 (practice ends on Defence, and the rats train the style left chosen), can't down
 *  the three in time, and fights on for ever, gaining only Defence and Vitality and being knocked out now and then, so
 *  the camp is never cleared (with this on, the runs fail as stuck at the goblin camp). The lead is adding a levels
 *  goal before the goblin camp ("Ready for the goblins": Attack, Strength and Defence 7; with it, simulated, the bot
 *  cleared the camp on every seed in 2.5 to 8 minutes); once that is merged, set this to true: the runs then go on
 *  through the goblin camp and its test runs instead of being skipped. Mind the chief's save then: one made while he
 *  steps out of his tent reads him back at its door, standing (his 1.6 m step out crosses ground the walking grid
 *  blocks, and savedGoblins in core/goblins.ts sends a goblin there home), so the save test fails on it now and then
 *  (seed 4 in the simulation) until that is fixed in the game. */
const GOBLINS_CLEARABLE = true;

const SEEDS = Array.from({ length: Number(process.env.HEARTHFOLK_SEEDS) || 4 }, (_, i) => i + 1);
/** When the player is there (HEARTHFOLK_VISIT=every,stay, in seconds of play: a visit every `every` seconds, staying
 *  `stay`, 0 if left out), or null: always there, an attentive player (Visits in tests/bot.ts). */
const VISITS: Visits | null = (() => {
  const v = process.env.HEARTHFOLK_VISIT;
  if (!v) return null;
  const [every = NaN, stay = 0] = v.split(',').map(Number);
  if (!(every > 0) || !(stay >= 0)) throw new Error(`HEARTHFOLK_VISIT=${v}: give every,stay in seconds of play, e.g. 300,60`);
  return { every, stay };
})();
/** The longest a player who checks in leaves him without looking (seconds of play): the time between visits. */
const AWAY_GAP = VISITS ? Math.max(0, VISITS.every - VISITS.stay) : 0;
/** Never stuck: the goal card moves on at least this often (seconds of play; Card), plus the time between visits for a
 *  player who checks in. The longest it stayed still when this was set: 9.5 minutes over 80 seeds (3.3 the median),
 *  and under 9 with the levels goal before the goblin camp simulated, all waiting for rat hides, which come with half
 *  the rats. */
const STUCK = 20 * 60 + AWAY_GAP;
/** Generous limits for each chapter (seconds of play), as guard rails against a change that makes a chapter drag on,
 *  not pacing targets. Chapter 2's is two to three times the slowest seed's when it was set (29 to 45 minutes over 20
 *  seeds with the goblin camp and a levels goal before it, simulated). Chapter 1 took 4.8 to 8 minutes over 80 seeds;
 *  its limit is longer than STUCK, so a run stuck in it is called stuck, with what the card showed, before it runs out
 *  of time. A player who checks in gets the time of about 40 waits for a visit more: each tap may wait for one. */
const CHAPTER_LIMITS = [30 * 60, 90 * 60].map(n => n + 40 * AWAY_GAP);
/** Saves: one at a random moment this many seconds of play (shortest, longest) after the one before, through the whole
 *  run. */
const SAVE_GAP = [30, 120] as const;

const CHEST = GOALS.findIndex(g => g.makes === 'chest');
const GOBLIN_CAMP = GOALS.findIndex(g => (g.needs[CHIEF.drop] ?? 0) > 0);
/** Events too frequent to list in a stuck run's recent events, or in a trace (HEARTHFOLK_TRACE=seed). */
const QUIET = ['xpGained', 'strike', 'hit', 'bitten', 'arrived', 'itemGained', 'pickedUp', 'pickupBack', 'nodeDepleted', 'nodeRespawned', 'ratBack', 'goblinBack', 'cooked'];
/** The last goal of each chapter, by index in GOALS. */
const CHAPTER_ENDS = [CHEST, GOALS.length - 1];
const CHAPTER_NAMES = ['Chapter 1 (to the storage chest)', 'Chapter 2 (to the torn map)'];

/** One playthrough: when each goal finished, each chapter's end, and what the pacing report counts, per chapter. */
interface Run {
  seed: number;
  /** seconds of play from the start when each goal was finished, by id */
  done: Record<string, number>;
  /** seconds of play at the end of each chapter, or null if it wasn't reached */
  chapterEnd: (number | null)[];
  /** levels at the end of each chapter (or where the run stopped, for the chapter it stopped in) */
  levels: (Record<SkillId, number> | null)[];
  taps: number[]; knockouts: number[]; eaten: number[];
  /** (needs, 13 Oct 2026) seconds of play he slept in the shelter, nights he went to bed, and meals he ate when hungry,
   *  per chapter */
  asleep: number[]; nights: number[]; meals: number[];
  /** taps the game refused (he stayed idle) */
  refused: number;
  /** fight taps on something with no tap area when it was sent (a beaten rat or goblin, the chief in his tent): a
   *  player can't send them (render/rats.ts, render/goblins.ts) */
  untappable: string[];
  /** what was eaten in all, by item */
  ate: Record<string, number>;
  /** why the run stopped: every goal done, the goblin camp reached (while it can't be cleared), stuck, or out of time */
  end: 'done' | 'goblins' | 'stuck' | 'time';
  stuck: string | null;
  /** the longest the goal card stayed still (seconds of play), and on which goal */
  still: { for: number; goal: string };
  /** positions that weren't a number or weren't on ground he can stand on, and a backpack holding too much */
  problems: string[];
  /** each save: when (seconds of play), and where the game read back differed from the game saved, if it did */
  saves: { at: number; diff?: string }[];
  /** seconds of play in the run, and the real milliseconds it took */
  played: number; ms: number;
}

const levelsOf = (state: GameState) => Object.fromEntries(Object.keys(SKILLS).map(s => [s, levelFor(state.skills[s as SkillId])])) as Record<SkillId, number>;
/** What the goal card counts, as it shows it: each line's got / needed ("rat_hide 3/5", "attack level 2/3"). */
const cardText = (state: GameState) =>
  goalLines(state, currentGoal(state)).map(l => `${l.id}${l.level ? ' level' : ''} ${l.got}/${l.need}`).join(', ') || 'nothing to count';
const where = (state: GameState) => {
  const p = state.player;
  return `goal "${currentGoal(state).id}" (card: ${cardText(state)}), task ${JSON.stringify(p.task)}, pending ${JSON.stringify(p.pending)}, trip ${JSON.stringify(p.trip)}, `
    + `at ${p.pos.x.toFixed(2)}, ${p.pos.z.toFixed(2)}, backpack ${JSON.stringify(p.backpack)}, chest ${JSON.stringify(state.bank)}, health ${state.health}`;
};

/** How far the goal card has got, for the stuck check: the goals done; for the goal on the card, the things it counts
 *  (each as the card counts it, carried or stored, never more than it asks: goalLines, which the card uses), and the
 *  XP toward each level it asks for (never more than that level's). Training a skill it doesn't ask for, or past the
 *  level it asks, or gathering something it doesn't count, leaves it still. */
interface Card { goals: number; things: number; xp: number }
function cardAt(state: GameState): Card {
  const goal = currentGoal(state);
  const things = goalLines(state, goal).reduce((a, l) => a + (l.level ? 0 : l.got), 0);
  const xp = Object.entries(goal.levels ?? {}).reduce((a, [id, n]) => a + Math.min(state.skills[id as SkillId] ?? 0, XP_TABLE[n!] ?? Infinity), 0);
  return { goals: state.goalsDone.length, things, xp };
}

/** Whether a player can tap `id` to fight it: it is there (the training dummy once built, a rat, a goblin, the chief
 *  only once out of his tent) and not down (a beaten creature has no tap area until it is back: render/rats.ts,
 *  render/goblins.ts). */
const hasTapArea = (state: GameState, id: string) => { const t = targetOf(state, CAMP, id); return !!t && !t.foe?.down; };

/** Where a game read back from a save differs from the game saved: each value that differs, by its path, with both
 *  (`combatStyle "defence" -> "attack"`), the first few. Objects and arrays are compared key by key, a key holding
 *  undefined counting as missing (as toEqual does), and 0 the same as -0 (JSON can't tell them apart). */
function differences(saved: unknown, loaded: unknown, path = '', out: string[] = []): string[] {
  if (out.length >= 6 || saved === loaded || Object.is(saved, loaded)) return out;
  const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
  if (isObject(saved) && isObject(loaded) && Array.isArray(saved) === Array.isArray(loaded)) {
    for (const k of new Set([...Object.keys(saved), ...Object.keys(loaded)])) {
      if (saved[k] === undefined && loaded[k] === undefined) continue;
      differences(saved[k], loaded[k], Array.isArray(saved) ? `${path}[${k}]` : path ? `${path}.${k}` : k, out);
    }
    return out;
  }
  const show = (v: unknown) => v === undefined ? '(missing)' : JSON.stringify(v).slice(0, 100);
  out.push(`${path || 'the save'} ${show(saved)} -> ${show(loaded)}`);
  return out;
}

interface Game { state: GameState; events: EventBus; ctx: SimContext; bot: Bot }
function newGame(seed: number, visits: Visits | null = null): Game {
  const events = new EventBus();
  return { state: createState(CAMP, seed), events, ctx: { layout: CAMP, rng: createRng(seed), events }, bot: new Bot(CAMP, events, visits) };
}
/** Let the bot play `g` until `done` (or `max` seconds of play pass); returns the seconds played. */
function playUntil(g: Game, done: () => boolean, max: number): number {
  let t = 0;
  for (; t < max && !done(); t += STEP) { g.bot.tick(g.state, g.events); step(g.state, STEP, g.ctx); }
  return t;
}

/** Play a new game on `seed` with the bot until every goal is done (or, while the goblin camp can't be cleared yet, until
 *  it is the goal), he is stuck, or a chapter runs out of time. */
function play(seed: number): Run {
  const t0 = performance.now(), g = newGame(seed, VISITS), { events, ctx, bot } = g;
  const run: Run = {
    seed, done: {}, chapterEnd: CHAPTER_ENDS.map(() => null), levels: CHAPTER_ENDS.map(() => null),
    taps: CHAPTER_ENDS.map(() => 0), knockouts: CHAPTER_ENDS.map(() => 0), eaten: CHAPTER_ENDS.map(() => 0), refused: 0, untappable: [], ate: {},
    asleep: CHAPTER_ENDS.map(() => 0), nights: CHAPTER_ENDS.map(() => 0), meals: CHAPTER_ENDS.map(() => 0),
    end: 'time', stuck: null, still: { for: 0, goal: '' }, problems: [], saves: [], played: 0, ms: 0,
  };
  const start = g.state.time, played = () => g.state.time - start, min = (s: number) => (s / 60).toFixed(1);
  let chapter = 0, goalDone = false;
  // the goal card: the furthest it has got, when it last moved on, and the goal it shows
  let best = cardAt(g.state), moved = 0, onGoal = currentGoal(g.state).id;
  const recent: string[] = [], trace = process.env.HEARTHFOLK_TRACE === String(seed) ? [`Seed ${seed}, minutes of play:`] : null;
  const line = (text: string) => `${(played() / 60).toFixed(2).padStart(6)}  ${text}`;
  events.on(e => {
    if (e.type === 'goalDone') { run.done[e.goal] = played(); goalDone = true; }
    if (e.type === 'knockedOut') run.knockouts[chapter]!++;
    if (e.type === 'ate') { run.eaten[chapter]!++; run.ate[e.item] = (run.ate[e.item] ?? 0) + 1; }
    if (e.type === 'fellAsleep') run.nights[chapter]!++;
    if (e.type === 'meal') { run.meals[chapter]!++; for (const [item, n] of Object.entries(e.items)) { run.eaten[chapter]! += n; run.ate[item] = (run.ate[item] ?? 0) + n; } }
    if (!(QUIET as GameEvent['type'][]).includes(e.type)) {
      recent.push(line(JSON.stringify(e)));
      if (recent.length > 12) recent.shift();
      trace?.push(line(JSON.stringify(e)));
    }
  });
  // saves at random moments through the whole run
  const pick = createRng(seed * 7919 + 13), gap = () => SAVE_GAP[0] + pick.next() * (SAVE_GAP[1] - SAVE_GAP[0]);
  let saveAt = gap();
  let nav: NavGrid = navFor(CAMP, g.state.built), navBuilt = g.state.built.length;
  const limit = (c: number) => CHAPTER_LIMITS.slice(0, c + 1).reduce((a, n) => a + n, 0);
  for (;;) {
    const taps = bot.log.length;
    bot.tick(g.state, events);
    run.taps[chapter]! += bot.log.length - taps;
    for (const tap of bot.log.slice(taps)) {
      trace?.push(line(`TAP ${JSON.stringify(tap.command)}${tap.refused ? ' (refused)' : ''}`));
      // (sending him to fight changes nothing about the creature, so it is as it was when tapped)
      if (tap.command.type === 'fight' && !hasTapArea(g.state, tap.command.target)) run.untappable.push(`${tap.command.target} at ${min(played())} min`);
    }
    step(g.state, STEP, ctx);
    const t = played(), state = g.state;
    if (state.player.task.kind === 'sleep' && chapter < CHAPTER_ENDS.length) run.asleep[chapter]! += STEP;
    // the goal card moving on: a goal finished, or more of what the goal on it counts
    const card = cardAt(state);
    if (card.goals > best.goals || card.things > best.things || card.xp > best.xp) {
      if (t - moved > run.still.for) run.still = { for: t - moved, goal: onGoal };
      best = card.goals > best.goals ? card : { goals: best.goals, things: Math.max(best.things, card.things), xp: Math.max(best.xp, card.xp) };
      moved = t;
    }
    onGoal = currentGoal(state).id;
    if (goalDone) {
      goalDone = false;
      // the chapters: each ends when its last goal and every goal before it are done
      while (chapter < CHAPTER_ENDS.length && GOALS.slice(0, CHAPTER_ENDS[chapter]! + 1).every(x => x.id in run.done)) {
        run.chapterEnd[chapter] = t; run.levels[chapter] = levelsOf(state); chapter++;
      }
      if (allGoalsDone(state)) { run.end = 'done'; break; }
      if (!GOBLINS_CLEARABLE && GOALS.slice(0, GOBLIN_CAMP).every(x => x.id in run.done)) { run.end = 'goblins'; run.levels[chapter] = levelsOf(state); break; }
    }
    // never stuck, never off the land, never too much in the backpack
    if (t - moved > STUCK) {
      run.end = 'stuck';
      run.stuck = `stuck at ${min(t)} min: the goal card hasn't moved on since ${min(moved)} min; ${where(state)}\n  recent: ${recent.join('\n    ')}`;
      break;
    }
    if (t > limit(chapter)) { run.end = 'time'; run.stuck = `out of time in chapter ${chapter + 1} at ${min(t)} min (the goal card last moved on at ${min(moved)} min): ${where(state)}`; break; }
    if (state.built.length !== navBuilt) { nav = navFor(CAMP, state.built); navBuilt = state.built.length; }
    const p = state.player.pos;
    if (run.problems.length < 5) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) run.problems.push(`position not a number at ${t.toFixed(1)}s: ${where(state)}`);
      else if (!nav.walkable(p)) run.problems.push(`off the ground he can stand on at ${t.toFixed(1)}s: ${where(state)}`);
      if (backpackCount(state) > BACKPACK_SLOTS) run.problems.push(`backpack over ${BACKPACK_SLOTS} at ${t.toFixed(1)}s: ${where(state)}`);
      for (const [id, c] of [...Object.entries(state.rats), ...Object.entries(state.goblins)]) {
        if (!Number.isFinite(c.pos.x) || !Number.isFinite(c.pos.z)) run.problems.push(`${id}'s position not a number at ${t.toFixed(1)}s`);
      }
    }
    // a save made now, read back, and played on from the loaded game, with the randomness the page starts with when it
    // opens a save (main.ts); the bot is the same player and remembers what it learned
    if (t >= saveAt) {
      const back = deserialize(serialize(state), CAMP), diff = differences(state, back);
      run.saves.push(diff.length ? { at: t, diff: diff.join('; ') } : { at: t });
      g.state = back;
      ctx.rng = createRng(back.seed ^ Math.floor(back.time));
      saveAt = t + gap();
      trace?.push(line(`saved, read back${diff.length ? ` with differences: ${diff.join('; ')}` : ''}, played on`));
    }
  }
  run.refused = bot.refused;
  run.played = played();
  if (run.played - moved > run.still.for) run.still = { for: run.played - moved, goal: currentGoal(g.state).id };
  run.ms = performance.now() - t0;
  if (trace) process.stdout.write(`${[...trace, line(`ended "${run.end}": ${where(g.state)}`), ''].join('\n')}\n`);
  return run;
}

const runs = new Map<number, Run>();
const runOf = (seed: number) => { let r = runs.get(seed); if (!r) { r = play(seed); runs.set(seed, r); } return r; };
/** What a run says about itself when a check fails. */
const about = (r: Run) => `seed ${r.seed}: ended "${r.end}" after ${(r.played / 60).toFixed(1)} min of play${r.stuck ? `\n  ${r.stuck}` : ''}`;

describe('the playthrough bot', { timeout: 60_000 }, () => {
  it('plays chapter 1 to the storage chest on every seed, never stuck, always on the land, within the limit', () => {
    for (const seed of SEEDS) {
      const r = runOf(seed);
      // (a run stops where he gets stuck or runs out of time, so a chapter that ended was never stuck)
      expect(r.chapterEnd[0], about(r)).not.toBeNull();
      expect(r.chapterEnd[0]!, about(r)).toBeLessThan(CHAPTER_LIMITS[0]!);
      expect(r.problems, about(r)).toEqual([]);
      // every goal of chapter 1 finished, each no earlier than the one before it
      for (const [i, goal] of GOALS.slice(0, CHEST + 1).entries()) {
        expect(r.done[goal.id], `${about(r)}: "${goal.id}"`).toBeDefined();
        if (i > 0) expect(r.done[goal.id]!, `seed ${seed}: "${goal.id}" after the goal before it`).toBeGreaterThanOrEqual(r.done[GOALS[i - 1]!.id]!);
      }
    }
  });

  it('plays chapter 2 up to the goblin camp on every seed: every goal before it finished, never stuck, always on the land', () => {
    for (const seed of SEEDS) {
      const r = runOf(seed);
      expect(r.problems, about(r)).toEqual([]);
      for (const goal of GOALS.slice(0, GOBLIN_CAMP)) expect(r.done[goal.id], `${about(r)}: "${goal.id}"`).toBeDefined();
      const reached = Math.max(...GOALS.slice(0, GOBLIN_CAMP).map(x => r.done[x.id]!));
      expect(reached - r.chapterEnd[0]!, about(r)).toBeLessThan(CHAPTER_LIMITS[1]!);
    }
  });

  (GOBLINS_CLEARABLE ? it : it.skip)('clears the goblin camp on every seed: the end of chapter 2, every goal done, within the limit', () => {
    for (const seed of SEEDS) {
      const r = runOf(seed);
      expect(r.end, about(r)).toBe('done');
      expect(r.chapterEnd[1], about(r)).not.toBeNull();
      expect(r.chapterEnd[1]! - r.chapterEnd[0]!, about(r)).toBeLessThan(CHAPTER_LIMITS[1]!);
      expect(Object.keys(r.done).sort(), about(r)).toEqual(GOALS.map(x => x.id).sort());
    }
  });

  it('saves made at random moments through the whole run read back exactly, and playing on from them changes nothing about finishing', () => {
    for (const seed of SEEDS) {
      const r = runOf(seed);
      for (const s of r.saves) expect(s.diff, `seed ${seed}: the save at ${(s.at / 60).toFixed(1)} min read back differently`).toBeUndefined();
      // at least one save in each chapter it played (chapter 2 up to where the run stopped)
      for (const [c, end] of r.chapterEnd.entries()) {
        const from = c ? r.chapterEnd[c - 1] : 0, to = end ?? r.played;
        if (from === null || from === undefined) continue;
        expect(r.saves.filter(s => s.at > from && s.at <= to).length, `${about(r)}: saves in chapter ${c + 1}`).toBeGreaterThan(0);
      }
      // (finishing is the checks above: each run played on from its saves)
    }
  });

  it('is a low-effort player: under two taps a minute of play, none refused, none on what has no tap area; the runs are quick headless', () => {
    for (const seed of SEEDS) {
      const r = runOf(seed);
      expect(r.refused, about(r)).toBe(0);
      expect(r.untappable, about(r)).toEqual([]);
      // (a bot tapping again what he is already doing would tap every second)
      expect(r.taps.reduce((a, n) => a + n, 0), about(r)).toBeLessThan(r.played / 30);
    }
    expect(SEEDS.reduce((a, s) => a + runOf(s).ms, 0)).toBeLessThan(SEEDS.length * 5_000);
  });
});

/** A new game on `seed` at `goal`: every goal before it written down as done, with what their making gave (structures
 *  built, tools owned, gear worn), and his book found. */
function gameAt(seed: number, goal: Goal): Game {
  const g = newGame(seed), s = g.state, before = GOALS.slice(0, GOALS.indexOf(goal));
  s.goalsDone = before.map(x => x.id);
  for (const x of before) {
    const def = x.makes ? makeDef(x.makes) : null;
    if (def?.gives.kind === 'structure') s.built.push(def.id);
    else if (def?.gives.kind === 'tool') s.tools[def.gives.tool] = true;
    else if (def?.gives.kind === 'gear') s.equipment[GEAR[def.gives.gear].slot] = def.gives.gear;
  }
  s.hasBook = true;
  return g;
}

describe("the bot's habits", { timeout: 60_000 }, () => {
  it('with a full backpack and nowhere to store it, drops what the goal does not need, keeps the wreck, and plays on to the chest', () => {
    // a new game whose backpack is full of stones before he starts, and one that fills with stones mid-goal, while he chops
    for (const when of ['start', 'chopping'] as const) {
      const g = newGame(5), dropped: Record<string, number> = {};
      g.events.on(e => { if (e.type === 'dropped') dropped[e.item] = (dropped[e.item] ?? 0) + e.count; });
      const needsLogs = () => { const goal = currentGoal(g.state), def = goal.makes ? makeDef(goal.makes) : null; return !!(def?.needs ?? goal.needs).birch_logs; };
      if (when === 'chopping') playUntil(g, () => needsLogs() && (g.state.player.backpack.birch_logs ?? 0) >= 3, 20 * 60);
      expect(when === 'start' || needsLogs()).toBe(true);
      const pack = g.state.player.backpack;
      pack.stone = (pack.stone ?? 0) + BACKPACK_SLOTS - backpackCount(g.state);
      const at = g.state.time;
      playUntil(g, () => g.state.goalsDone.includes(GOALS[CHEST]!.id), CHAPTER_LIMITS[0]!);
      expect(g.state.goalsDone, when).toContain(GOALS[CHEST]!.id);
      expect(Object.keys(dropped), when).toEqual(['stone']);
      expect(g.bot.refused, when).toBe(0);
      expect(g.bot.log.some(l => l.command.type === 'drop' && l.at >= at), when).toBe(true);
    }
  });

  it("for a levels goal past the training dummy's limit, trains on rats once the dummy says it has taught all it can", () => {
    // the practice goal (the first levels goal) asking for one Attack level past what the dummy teaches, his Attack just
    // short of the dummy's limit, and everything before it done
    const goal = GOALS.find(x => x.levels)!, was = goal.levels;
    goal.levels = { attack: DUMMY.maxLevel + 1 };
    try {
      const g = gameAt(6, goal), s = g.state;
      s.skills.attack = XP_TABLE[DUMMY.maxLevel]! - 30;
      s.bank = { cooked_fish: 10 };
      const notices: GameEvent[] = [];
      g.events.on(e => { if (e.type === 'cantFight') notices.push(e); });
      expect(currentGoal(s)).toBe(goal);
      playUntil(g, () => s.goalsDone.includes(goal.id), 30 * 60);
      expect(s.goalsDone).toContain(goal.id);
      expect(notices).toContainEqual({ type: 'cantFight', target: 'dummy', reason: 'taught', skill: 'attack' });
      const fights = g.bot.log.filter(l => l.command.type === 'fight').map(l => (l.command as { target: string }).target);
      expect(fights[0]).toBe('dummy');
      expect(fights.slice(1).every(t => t.startsWith('rat'))).toBe(true);
      expect(fights.length).toBeGreaterThan(1);
      expect(g.bot.refused).toBe(0);
    } finally { goal.levels = was; }
  });

  it('for a Cooking levels goal, catches fish and cooks them at the campfire until the level is reached', () => {
    // the practice goal asking for Cooking 3 instead (12 fish cooked, more with the ones that burn), with his rod,
    // which comes later
    const goal = GOALS.find(x => x.levels)!, was = goal.levels;
    goal.levels = { cooking: 3 };
    try {
      const g = gameAt(7, goal), s = g.state;
      s.tools[SWINGS.fishing.tool] = true;
      expect(currentGoal(s)).toBe(goal);
      playUntil(g, () => s.goalsDone.includes(goal.id), 30 * 60);
      expect(s.goalsDone).toContain(goal.id);
      const sent = g.bot.log.map(l => l.command.type);
      expect(sent).toContain('work');
      expect(sent).toContain('cook');
      expect(g.bot.refused).toBe(0);
    } finally { goal.levels = was; }
  });
});

// ---- the pacing report (HEARTHFOLK_PACING=1) ----

const clock = (s: number) => {
  const t = Math.round(s), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };
const spread = (xs: number[], show: (n: number) => string = clock) =>
  xs.length ? `${show(median(xs)).padStart(8)}   ${show(Math.min(...xs))} to ${show(Math.max(...xs))}` : '       -';
/** A range of whole numbers, such as levels: "10", or "10 to 11" (a median between two levels would be one that can't
 *  be). */
const range = (xs: number[]) => { const lo = Math.min(...xs), hi = Math.max(...xs); return lo === hi ? `${lo}` : `${lo} to ${hi}`; };

afterAll(() => {
  if (process.env.HEARTHFOLK_PACING !== '1' || !runs.size) return;
  const all = SEEDS.map(s => runs.get(s)).filter((r): r is Run => !!r), lines: string[] = [];
  const count = (n: number) => String(Math.round(n));
  /** Whether a run got through chapter `c` (chapter 2: up to the goblin camp, while it can't be cleared). */
  const through = (r: Run, c: number) => r.chapterEnd[c] !== null || (c === 1 && !GOBLINS_CLEARABLE && r.end === 'goblins');
  /** When a run got through chapter `c`, in seconds of play from the chapter's start. */
  const took = (r: Run, c: number) => (r.chapterEnd[c] ?? Math.max(...GOALS.slice(0, GOBLIN_CAMP).map(x => r.done[x.id]!))) - (c ? r.chapterEnd[c - 1]! : 0);
  lines.push('', `Hearthfolk pacing: the playthrough bot on seeds ${all.map(r => r.seed).join(', ')} (minutes:seconds of play; median, then range)`, '');
  lines.push(`${'Goal'.padEnd(36)}${'median'.padStart(8)}   range`);
  let chapter = 0;
  for (const [i, goal] of GOALS.entries()) {
    const times = all.flatMap(r => {
      const at = r.done[goal.id];
      return at === undefined ? [] : [at - Math.max(0, ...GOALS.slice(0, i).map(b => r.done[b.id] ?? 0))];
    });
    lines.push(`  ${goal.title.padEnd(34)}${spread(times)}${i === GOBLIN_CAMP && !GOBLINS_CLEARABLE ? '   (not played: see GOBLINS_CLEARABLE)' : ''}`);
    if (i === CHAPTER_ENDS[chapter]) {
      const ends = all.filter(r => r.chapterEnd[chapter] !== null).map(r => took(r, chapter));
      lines.push(`${CHAPTER_NAMES[chapter]!.padEnd(36)}${spread(ends)}`);
      if (chapter === 1 && !GOBLINS_CLEARABLE) lines.push(`${'Chapter 2 up to the goblin camp'.padEnd(36)}${spread(all.filter(r => through(r, 1)).map(r => took(r, 1)))}`);
      lines.push('');
      chapter++;
    }
  }
  for (const [c, name] of CHAPTER_NAMES.entries()) {
    const upTo = c === 1 && !GOBLINS_CLEARABLE, done = all.filter(r => through(r, c));
    if (!done.length) continue;
    lines.push(`${name}${upTo ? ', up to the goblin camp' : ''}${done.length < all.length ? ` (the ${done.length} runs that got through it)` : ''}:`);
    lines.push(`  ${'taps'.padEnd(34)}${spread(done.map(r => r.taps[c]!), count)}`);
    lines.push(`  ${'knock-outs'.padEnd(34)}${spread(done.map(r => r.knockouts[c]!), count)}`);
    lines.push(`  ${'food eaten'.padEnd(34)}${spread(done.map(r => r.eaten[c]!), count)}`);
    lines.push(`  ${'meals when hungry'.padEnd(34)}${spread(done.map(r => r.meals[c]!), count)}`);
    lines.push(`  ${'nights in the shelter'.padEnd(34)}${spread(done.map(r => r.nights[c]!), count)}`);
    lines.push(`  ${'asleep in the shelter'.padEnd(34)}${spread(done.map(r => r.asleep[c]!))}`);
    // nights in the shelter go SLEEP.speed times quicker while the game is open and watched (main.ts, playSpeed)
    lines.push(`  ${'real time, watching'.padEnd(34)}${spread(done.map(r => took(r, c) - r.asleep[c]! * (1 - 1 / SLEEP.speed)))}`);
    const lv = done.flatMap(r => r.levels[c] ? [r.levels[c]!] : []);
    if (lv.length) lines.push(`  levels at ${upTo ? 'the goblin camp' : 'its end'} (range over the seeds): ${Object.keys(SKILLS).map(s => `${SKILLS[s as SkillId].name} ${range(lv.map(l => l[s as SkillId]))}`).join(', ')}`);
    lines.push('');
  }
  for (const r of all.filter(x => x.end === 'stuck' || x.end === 'time')) lines.push(`Seed ${r.seed} stopped early: ${r.stuck}`);
  const stillest = all.reduce((a, r) => r.still.for > a.still.for ? r : a), still = all.map(r => r.still.for);
  lines.push(`The goal card's longest stretch without moving on, per run: median ${clock(median(still))}, ${clock(Math.min(...still))} to ${clock(Math.max(...still))}`
    + ` (the longest on seed ${stillest.seed}, "${stillest.still.goal}"); the stuck check allows ${clock(STUCK)}.`);
  lines.push(`Saves read back, per run: ${range(all.map(r => r.saves.length))}, ${all.every(r => r.saves.every(s => s.diff === undefined)) ? 'all exactly' : 'NOT all exactly (see the save test)'}.`);
  lines.push(`Refused taps: ${all.map(r => r.refused).join(', ')}. Food eaten, by seed: ${all.map(r => `${r.seed} ${JSON.stringify(r.ate)}`).join('; ')}.`);
  lines.push(`Headless: ${all.map(r => `${(r.played / 60).toFixed(0)} min of play in ${(r.ms / 1000).toFixed(2)} s`).join('; ')}.`, '');
  lines.push('Game time and real time: the game runs at full speed whenever it is open (a background tab or a sleeping screen too),');
  lines.push(`so a minute of play is a minute of real time with the game open, and an in-game day is ${DAY_SECONDS / 60} real minutes. While the`);
  lines.push(`game is closed he works at ${AWAY.rate * 100}% speed for at most ${AWAY.max / 3600} hours (${AWAY.max * AWAY.rate / 60} minutes of play): a minute of play then takes ${1 / AWAY.rate} real minutes.`);
  lines.push(!VISITS ? 'The bot looks every second and taps at once: these are an attentive player\'s times; one who checks in now and then takes longer (HEARTHFOLK_VISIT).'
    : VISITS.stay > 0 ? `The bot checked in every ${VISITS.every} s of play and stayed ${VISITS.stay} s, looking every second while there: a player who checks in now and then, the game left open between.`
    : `The bot looked once every ${VISITS.every} s of play, tapping everything due at once: an upper bound for a player who checks in that often (one who stays a while taps several times per visit).`, '');
  // straight to the terminal: vitest keeps a passing test's console to itself
  process.stdout.write(`${lines.join('\n')}\n`);
});
