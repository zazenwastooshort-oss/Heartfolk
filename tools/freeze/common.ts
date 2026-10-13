// Freezing old saves (the camp build, stage 0): the harness shared by the freeze scripts. tools/freeze_saves.mjs copies
// this file into a detached worktree of a release tag as tests/freeze_common.ts, beside the era's script as
// tests/freeze.test.ts, so every import below is that version's own code (createState, serialize, the simulation). It
// uses only what every camp release since 0.0.22 has. Not part of the game or its tests: these files are typechecked
// only against the tag they run in.
import { expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createState, type GameState } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { DAY_SECONDS } from '../src/core/clock';
import { readSave, serialize } from '../src/core/save';
import { step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import type { Vec2 } from '../src/world/layout';
import { applyCommands, type Command } from '../src/systems/commands';
import { BOOK, GOALS } from '../src/data/goals';
import { makeDef } from '../src/data/making';
import { ITEMS, type SkillId } from '../src/data/skills';
import { PICKUPS } from '../src/data/pickups';
import { GEAR } from '../src/data/combat';
import { XP_TABLE } from '../src/data/xp';

/** Set by tools/freeze_saves.mjs: on (HEARTHFOLK_FREEZE=1), where the saves go, the version they are from, and the
 *  real time (ms since 1970) each says it was played up to, as the game's own autosave writes it. */
export const ON = process.env.HEARTHFOLK_FREEZE === '1';
const OUT = process.env.HEARTHFOLK_FREEZE_OUT ?? '';
export const VERSION = process.env.HEARTHFOLK_FREEZE_VERSION ?? '';
const SAVED_AT = Number(process.env.HEARTHFOLK_FREEZE_SAVED_AT);

export { CAMP, STEP, DAY_SECONDS };

/** A game being played headless, as the tag's own tests set one up. */
export interface Game { state: GameState; events: EventBus; log: GameEvent[]; ctx: { layout: typeof CAMP; rng: ReturnType<typeof createRng>; events: EventBus } }

export function game(seed = 7): Game {
  const state = createState(CAMP, seed), events = new EventBus(), log: GameEvent[] = [];
  events.on(e => log.push(e));
  return { state, events, log, ctx: { layout: CAMP, rng: createRng(seed), events } };
}

/** A tap, as the page's queue applies it. */
export const send = (g: Game, c: Command) => applyCommands(g.state, CAMP, [c], g.events);

/** Play until `done` (failing if `max` seconds of play pass first). */
export function runUntil(g: Game, done: () => boolean, max: number, what = 'the situation'): void {
  for (let t = 0; t < max && !done(); t += STEP) step(g.state, STEP, g.ctx);
  if (!done()) throw new Error(`${VERSION}: ${what} never came about within ${max} s of play`);
}

/** Play `seconds` of play. */
export function run(g: Game, seconds: number): void { for (let t = 0; t < seconds; t += STEP) step(g.state, STEP, g.ctx); }

/** In-game time on `day` (from 0) at `hour` o'clock. */
export const at = (day: number, hour: number) => (day + hour / 24) * DAY_SECONDS;

/** Every goal up to and including `last` finished, as play would have left them: each written down as done, what each
 *  makes standing (a structure), owned (a tool) or worn (gear), the levels a levels goal asks for reached, his book
 *  found and the wreck's things taken for good once salvaged, and the firewood pile stacked with the logs it was built
 *  from. Null: nothing done. */
export function progressTo(s: GameState, last: string | null): void {
  const upto = last === null ? -1 : GOALS.findIndex(g => g.id === last);
  if (last !== null && upto < 0) throw new Error(`no goal ${last}`);
  for (const g of GOALS.slice(0, upto + 1)) {
    s.goalsDone.push(g.id);
    for (const [id, n] of Object.entries(g.levels ?? {})) {
      const skill = id as SkillId;
      s.skills[skill] = Math.max(s.skills[skill] ?? 0, XP_TABLE[n as number]!);
    }
    const def = g.makes ? makeDef(g.makes) : null;
    if (!def) continue;
    const gives = def.gives;
    if (gives.kind === 'structure') s.built.push(def.id);
    else if (gives.kind === 'tool') s.tools[gives.tool] = true;
    else s.equipment[GEAR[gives.gear].slot] = gives.gear;
  }
  if (s.goalsDone.length) {
    s.hasBook = true;
    for (const x of CAMP.pickups ?? []) if (PICKUPS[x.kind].respawn === null) s.taken[x.id] = null;
  }
  if (s.built.includes('woodpile')) s.woodpile = 10;
  // a little woodcutting and mining done on the way, as a player would have by then
  if (s.goalsDone.includes('firewood')) s.skills.woodcutting = Math.max(s.skills.woodcutting, XP_TABLE[4]!);
  if (s.goalsDone.includes('copper')) s.skills.mining = Math.max(s.skills.mining, XP_TABLE[2]!);
}

/** The wreck's things in his backpack, as salvaging leaves them (none of it used yet). */
export function wreckCarried(s: GameState): void {
  for (const [id, n] of Object.entries(GOALS[0]!.needs)) if (id !== BOOK) s.player.backpack[id] = n as number;
}

/** A chest full of things: some of every item this version has, a different number of each, so a lost or doubled
 *  stack shows; but none of what a gathering goal still to come asks for (food before the food goals, rat hides, the
 *  goblin chief's map), so no goal finishes by itself. */
export function fillChest(s: GameState, extra: Record<string, number> = {}): void {
  const later = new Set(GOALS.filter(g => !g.makes && !s.goalsDone.includes(g.id)).flatMap(g => Object.keys(g.needs)));
  Object.keys(ITEMS).forEach((id, i) => { if (!later.has(id)) s.bank[id] = 3 + i; });
  for (const [id, n] of Object.entries(extra)) s.bank[id] = (s.bank[id] ?? 0) + n;
}

/** He stands at the nearest open ground to `p` (`walkable`: this version's walking grid). */
export function standAt(s: GameState, p: Vec2, grid: { nearestWalkable(p: Vec2): Vec2 | null }): void {
  const q = grid.nearestWalkable(p);
  if (!q) throw new Error(`no open ground near ${JSON.stringify(p)}`);
  s.player.pos = { ...q }; s.player.path = []; s.player.task = { kind: 'idle' }; s.player.pending = null;
}

/** The written cases, for the list printed at the end. */
export const written: string[] = [];

/** Write the save of `g` as `<version>-<name>.json`: exactly the text the game keeps (serialize, with the time it was
 *  played up to). `check` says what the case is; it must hold for the game as it is and, read back by this version's
 *  own loader, for the game as it would carry on (so the save is one this version itself keeps). */
export function freeze(name: string, g: Game, check: (s: GameState) => void): void {
  check(g.state);
  const raw = serialize(g.state, SAVED_AT);
  check(readSave(raw, CAMP).state);
  expect(OUT).not.toBe('');
  writeFileSync(join(OUT, `${VERSION}-${name}.json`), raw);
  written.push(name);
}

/** The opposite side of the tent from the fire, `out` metres back from its middle. */
export function behindTent(out: number): Vec2 {
  const tent = CAMP.camp!.tent.pos, fire = CAMP.hearth.pos;
  const dx = tent.x - fire.x, dz = tent.z - fire.z, d = Math.hypot(dx, dz);
  return { x: tent.x + dx / d * out, z: tent.z + dz / d * out };
}
