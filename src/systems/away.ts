// Away time (game 0.0.20; numbers in data/away.ts): how much play a stretch of real time is worth, and what he did in
// it, for the "While you were away" note (ui/away.ts). While the game is closed he works at a fifth of his speed for
// at most 2 hours of real time; a game left open (in a background tab, or with the screen off) catches up at full
// speed. sim.ts runs the steps (catchUp, catchUpAway); this works out the time (FrameClock: the real time between
// frames, a phone's sleep included), counts what happened from the events sent meanwhile, and keeps what the note
// tells (tellAway). It never reads a clock: the real time comes in as numbers, so the tests can set it.
import type { GameEvent } from '../core/events';
import type { SkillId } from '../data/skills';
import type { MakeId } from '../data/making';
import { AWAY } from '../data/away';

/** A stretch of real time and the play it is worth: `real` seconds away, the `counted` seconds of it that count (at
 *  most the cap), and the `game` seconds of play they make: a fifth of `counted` while the game was closed, all of it
 *  while it stayed `open` in a background tab. */
export interface Away { real: number; counted: number; game: number; open: boolean }

const none = (open: boolean): Away => ({ real: 0, counted: 0, game: 0, open });

/** The game was closed (or reloaded) from `savedAt`, the real time its save had been played up to (ms since 1970), to
 *  `now`: a fifth of that time, for at most AWAY.max of it. Nothing for a save that doesn't say when (from before
 *  0.0.20), a broken number, or a clock gone backwards (the save looks written in the future). */
export function closedFor(savedAt: number | null, now: number): Away {
  if (savedAt === null || !Number.isFinite(savedAt) || !Number.isFinite(now) || now <= savedAt) return none(false);
  const real = (now - savedAt) / 1000, counted = Math.min(real, AWAY.max);
  return { real, counted, game: counted * AWAY.rate, open: false };
}

/** The game stayed open but drew nothing for `seconds` of real time (a background tab, a phone's screen off): all of
 *  it counts, at full speed, up to AWAY.openMax at once. Nothing for a broken or negative time. */
export function openFor(seconds: number): Away {
  if (!Number.isFinite(seconds) || seconds <= 0) return none(true);
  const counted = Math.min(seconds, AWAY.openMax);
  return { real: seconds, counted, game: counted, open: true };
}

/** A gap between two clock readings, in ms: never negative (a clock gone backwards) and never broken. */
const gap = (ms: number) => Number.isFinite(ms) ? Math.max(0, ms) : 0;

/** The real time between frames, from two clocks main.ts reads at each frame: the page's steady clock
 *  (performance.now()) and the wall clock (Date.now(), ms since 1970). The steady clock never jumps, but on many phones
 *  and Macs it stops while the device sleeps (the screen off), so after the page was hidden the wall clock's gap
 *  counts instead when it is longer: with the screen off the game still counts as open. Otherwise only the steady
 *  clock counts, so changing the clock while playing does nothing. openFor caps how much of a long gap counts. */
export class FrameClock {
  /** the page was hidden since the last frame: frames stop then, and the device may sleep */
  private hidden: boolean;

  constructor(private steady: number, private wall: number, hidden = false) { this.hidden = hidden; }

  /** The page was hidden (another tab, the screen off) or closed. */
  hide(): void { this.hidden = true; }

  /** A frame at these readings of the two clocks: the real seconds since the last frame. */
  frame(steady: number, wall: number): number {
    const ms = Math.max(gap(steady - this.steady), this.hidden ? gap(wall - this.wall) : 0);
    this.steady = steady; this.wall = wall; this.hidden = false;
    return ms / 1000;
  }

  /** The real time the game has been played up to (ms since 1970), which each save records and away time is counted
   *  from: the last frame's, so time hidden or asleep since then is never taken as played. */
  get playedTo(): number { return this.wall; }
}

/** What he did while away, counted from the events sent while catching up. */
export interface AwaySummary {
  /** items he gathered, from trees and rocks or off the ground, by item id */
  items: Record<string, number>;
  /** XP gained, by skill */
  xp: Partial<Record<SkillId, number>>;
  /** the level reached, for each skill that went up */
  levels: Partial<Record<SkillId, number>>;
  /** times he stoked the fire */
  stoked: number;
  /** nights there were no logs, so the fire burned low */
  fireLow: number;
  /** things he finished making (he was at it when the game closed) */
  made: MakeId[];
  /** his backpack filled with nowhere to store it, so he stopped */
  full: boolean;
  /** (0.0.22) he stopped practising on `target` (the training dummy) once it had taught him all it could of `skill`,
   *  the style he trained (its level limit); only there when he did */
  taught?: { target: string; skill: SkillId };
}

export const emptySummary = (): AwaySummary => ({ items: {}, xp: {}, levels: {}, stoked: 0, fireLow: 0, made: [], full: false });

/** Count one event into the summary. Whatever goes into the backpack sends `itemGained`, from a tree or rock or off
 *  the ground alike (a pickup's `pickedUp` comes with one, so it isn't counted again). */
export function tally(s: AwaySummary, e: GameEvent): void {
  switch (e.type) {
    case 'itemGained': s.items[e.item] = (s.items[e.item] ?? 0) + e.count; break;
    case 'xpGained': s.xp[e.skill] = (s.xp[e.skill] ?? 0) + e.amount; break;
    case 'levelUp': s.levels[e.skill] = Math.max(s.levels[e.skill] ?? 0, e.level); break;
    case 'stoked': s.stoked++; break;
    case 'fireLow': s.fireLow++; break;
    case 'made': s.made.push(e.make); break;
    case 'noStorage': s.full = true; break;
    case 'cantFight': if (e.reason === 'taught') s.taught = { target: e.target, skill: e.skill }; break;
    default: break;
  }
}

/** Add what he did in `more` to `into`: a later catch-up told in the same note (the game opened in a background tab and
 *  looked at later, say). */
export function addSummary(into: AwaySummary, more: AwaySummary): void {
  for (const [id, n] of Object.entries(more.items)) into.items[id] = (into.items[id] ?? 0) + n;
  for (const [id, xp] of Object.entries(more.xp) as [SkillId, number][]) into.xp[id] = (into.xp[id] ?? 0) + xp;
  for (const [id, level] of Object.entries(more.levels) as [SkillId, number][]) into.levels[id] = Math.max(into.levels[id] ?? 0, level);
  into.stoked += more.stoked;
  into.fireLow += more.fireLow;
  into.made.push(...more.made);
  into.full ||= more.full;
  if (more.taught) into.taught = { ...more.taught };
}

/** Whether he did anything worth telling: gathered something, gained XP, saw to the fire or finished making something. */
export const didSomething = (s: AwaySummary) =>
  Object.keys(s.items).length > 0 || Object.keys(s.xp).length > 0 || s.stoked > 0 || s.fireLow > 0 || s.made.length > 0;

/** Whether the "While you were away" note shows: at least a minute of play (AWAY.note) was caught up, and he did
 *  something in it. */
export const worthNoting = (away: Away, s: AwaySummary) => away.game >= AWAY.note && didSomething(s);

/** The stretches away a note tells, with `away` added: an open stretch after another open one joins it (their times
 *  added), so the note never says more than how long the game was closed, then how long it was open. */
export function addSpan(spans: Away[], away: Away): Away[] {
  const last = spans.at(-1);
  if (!last?.open || !away.open) return [...spans, away];
  return [...spans.slice(0, -1), { real: last.real + away.real, counted: last.counted + away.counted, game: last.game + away.game, open: true }];
}

/** What the "While you were away" note tells: the stretches away and what he did in them. */
export interface Told { spans: Away[]; summary: AwaySummary }

/** A catch-up for the note (main.ts): what the note then tells, added to `told`, what it tells while it is still up or
 *  waiting (null once it was closed: it starts afresh). Null when there is nothing worth telling (worthNoting), and
 *  in a brand-new game's first session, whose welcome is theirs. Changes neither `told` nor `summary`. */
export function tellAway(told: Told | null, away: Away, summary: AwaySummary, newGame: boolean): Told | null {
  if (newGame || !worthNoting(away, summary)) return null;
  const all = emptySummary();
  if (told) addSummary(all, told.summary);
  addSummary(all, summary);
  return { spans: addSpan(told?.spans ?? [], away), summary: all };
}
