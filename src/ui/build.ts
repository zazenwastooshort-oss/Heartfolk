// The Build window, the camp's overview (data/building.ts; the owner, 12 and 13 Oct 2026: "The build section was a great
// suggestion, and thats where we can see if we have anything to upgreade anything to build etc, give a good overview
// and pressing it make the charachter walk to the building to start upgrading"; In 5): opened from the Build button in
// the row (from the campfire's goal on), it lists in sections what is under way (first), what can be built now (the
// camp's first five as their goals come up) and the upgrades (once the storage chest stands; D4). Each row has a line on
// what it is, what it needs as have / need (what's short standing out, with where a material comes from, and how many
// of one are kept for the current goal), how long the work takes him, how far along something begun is (its stage and
// %), and its button: Build, Upgrade or Carry on, or, when it can't be pressed now, why (still short of something,
// another build to finish first, knocked out). Pressing it sends the build command: he walks to its spot and gets to
// work (the spots are fixed: nothing is placed). With nothing to build it says what comes next, or that everything at
// the camp is built. Also the notices of building (a stage up, refusals) and the bark peeled off a log, drifting up over
// him. Reads state; never changes the game.
import type { GameState } from '../core/state';
import { allGoalsDone, owned } from '../core/state';
import type { EventBus } from '../core/events';
import type { Command } from '../systems/commands';
import type { Layout } from '../world/layout';
import type { Windows } from './windows';
import type { Hud } from './hud';
import { STAGED_IDS, buildOpen, buildRows, buildTime, buildWhy, forGoal, hasPlaceFor, haveFor, stagedDef, type BuildRow, type BuildWhy } from '../core/building';
import { SOURCES, STAGE_NAMES } from '../data/building';
import { MAKES, type MakeId } from '../data/making';
import { GOALS } from '../data/goals';
import { itemList, itemName } from './hud';
import { picture } from './pictures';

const $ = (id: string) => document.getElementById(id)!;
const el = (tag: string, className: string, text = '') => { const e = document.createElement(tag); e.className = className; e.textContent = text; return e; };

/** How long the work takes, in words: "30 seconds", "a minute and a half", "3 minutes" (to the nearest half minute). */
export function workTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} seconds`;
  const halves = Math.round(seconds / 30), whole = Math.floor(halves / 2), half = halves % 2 === 1;
  const mins = whole === 1 ? 'a minute' : `${whole} minutes`;
  return half ? (whole === 1 ? 'a minute and a half' : `${whole} and a half minutes`) : mins;
}

/** Why a build can't be pressed now, in plain words (the Build window's buttons and the camp's menu). */
export function buildWhyText(why: BuildWhy): string {
  switch (why.kind) {
    case 'down': return "He's knocked out.";
    case 'at': return "He's at it now.";
    case 'busy': return `Finish the ${MAKES[why.other].name.toLowerCase()} first.`;
    case 'missing': return `Still needs ${itemList(why.items, ' and ')}.`;
  }
}

/** The Build window's sections, in order: what is under way (always first), the camp's first five still to build (some
 *  faded, still short of something: "To build", not "Build now"), and the upgrades; only those with rows. */
export interface BuildSection { title: string; rows: BuildRow[] }
export function buildSections(rows: readonly BuildRow[]): BuildSection[] {
  return [
    { title: 'Under way', rows: rows.filter(r => r.begun) },
    { title: 'To build', rows: rows.filter(r => !r.begun && !r.staged.upgrades) },
    { title: 'Upgrades', rows: rows.filter(r => !r.begun && !!r.staged.upgrades) },
  ].filter(s => s.rows.length);
}

/** What the Build window says with nothing in it (T5.8): that everything at the camp is built, or that nothing can be
 *  built right now, and the goal that builds something next. Null while it lists anything. */
export function buildEmpty(state: GameState, layout: Layout): string | null {
  if (buildRows(state, layout).length) return null;
  const here = STAGED_IDS.filter(id => hasPlaceFor(layout, id));
  if (here.every(id => state.built.includes(id))) return 'Everything at the camp is built.';
  const next = allGoalsDone(state) ? null : GOALS.find(g => !state.goalsDone.includes(g.id) && !!g.makes && !!stagedDef(g.makes) && !state.built.includes(g.makes as MakeId));
  return next ? `Nothing to build right now. Next: ${next.title}.` : 'Nothing to build right now.';
}

/** A line of what a row needs: how many he has of it for this (have) of how many (need), whether it is short, and how
 *  many more of it he has that the current goal keeps (core/building.ts spare; none for the goal's own thing). */
export interface NeedLine { id: string; have: number; need: number; short: boolean; kept: number }
export function needLines(state: GameState, row: BuildRow): NeedLine[] {
  return Object.entries(row.def.needs).map(([id, need]) => {
    const can = haveFor(state, row.def, id), have = Math.min(need, can);
    const kept = forGoal(state, id) > 0 ? Math.max(0, Math.min(need - have, owned(state, id) - can)) : 0;
    return { id, have, need, short: have < need, kept };
  });
}

/** A row's button: Carry on for something begun, Upgrade for an upgrade, else Build (the firewood pile's too: its own
 *  verb, Stack, would read beside the pile's Stack logs as stacking logs on it); whether it can be pressed now, and why
 *  not (core/building.ts buildWhy). */
export function rowButton(state: GameState, row: BuildRow): { label: string; ready: boolean; why: string | null } {
  const why = buildWhy(state, row.id);
  const label = row.begun ? 'Carry on' : row.staged.upgrades ? 'Upgrade' : 'Build';
  return { label, ready: !why, why: why ? buildWhyText(why) : null };
}

/** What pressing a row sends (the same as a tap on its marker, or its entry in the camp's menu: T1.6). */
export const rowCommand = (row: BuildRow): Command => ({ type: 'build', id: row.id });

/** How far along something begun is, in whole percent, rounded down as the camp's menu and the goal card show it (so
 *  it says 100% only once it is built). */
export const percentDone = (progress: number): number => Math.floor(progress * 100);

/** The line under a row begun: "Half built: 96% done". */
export const progressLine = (row: BuildRow): string => `${STAGE_NAMES[Math.max(0, row.stage)]}: ${percentDone(row.progress)}% done`;

export class BuildWindow {
  private state: GameState | null = null;
  private shown = '';

  constructor(private windows: Windows, events: EventBus, private layout: Layout, private queue: Command[], hud: Hud) {
    // the list's buttons: one listener for them all
    $('buildList').addEventListener('click', e => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-build]');
      if (button && !button.disabled) this.pick(button.dataset.build as MakeId);
    });
    events.on(e => {
      const name = (id: MakeId) => MAKES[id].name.toLowerCase();
      if (e.type === 'begun') hud.notice(`He sets out the footings for the ${name(e.make)} and gets to work.`);
      else if (e.type === 'buildStage') hud.notice(e.stage === 1 ? `The ${name(e.make)}'s frame is up.` : `The ${name(e.make)} is ${STAGE_NAMES[e.stage]!.toLowerCase()}.`);
      else if (e.type === 'cantBuild') hud.notice(e.reason === 'busy' ? `Finish the ${name(e.other)} first.`
        : e.reason === 'down' ? "He can't build anything while he's knocked out."
        : e.reason === 'noShelter' ? `The ${name(e.make)} goes inside the shelter. Put up the ${name('shelter')} first.`
        : `The ${name(e.make)} can't be built yet.`);
      else if (e.type === 'barkPeeled' && this.state) hud.drift(`+1 ${itemName('bark', 1)}`, this.state.player.pos);
    });
  }

  /** Start on something from the list, or carry on with it: he walks to its spot. */
  private pick(id: MakeId): void {
    if (!this.state) return;
    const row = buildRows(this.state, this.layout).find(r => r.id === id);
    if (!row) return;
    this.queue.push(rowCommand(row));
    this.windows.close('build');
  }

  update(state: GameState): void {
    this.state = state;
    this.windows.setAvailable('build', buildOpen(state, this.layout));
    if (!this.windows.isOpen('build')) { this.shown = ''; return; }
    const rows = buildRows(state, this.layout), empty = buildEmpty(state, this.layout);
    const key = JSON.stringify([empty, rows.map(r => [r.id, r.begun, r.stage, percentDone(r.progress), Math.round(buildTime(state, r.id)), needLines(state, r), rowButton(state, r)])]);
    if (key === this.shown) return;
    this.shown = key;
    const focused = (document.activeElement as HTMLElement | null)?.dataset?.build;
    $('buildList').replaceChildren(...buildSections(rows).map(s => {
      const sec = el('section', 'bsec');
      sec.append(el('h3', '', s.title), ...s.rows.map(r => this.rowEl(state, r)));
      return sec;
    }));
    const none = $('buildNone');
    none.hidden = !empty;
    if (empty) none.textContent = empty;
    // keyboard focus stays on the button it was on
    if (focused) $('buildList').querySelector<HTMLButtonElement>(`button[data-build="${focused}"]`)?.focus({ preventScroll: true });
  }

  private rowEl(state: GameState, r: BuildRow): HTMLElement {
    const row = el('div', 'brow' + (r.begun ? ' begun' : ''));
    const head = el('div', 'brow-head'), time = buildTime(state, r.id);
    head.append(el('b', '', r.def.name), el('small', '', r.begun ? `${workTime(time)} left` : workTime(time)));
    row.append(head, el('p', 'brow-blurb', r.staged.blurb));
    if (r.begun) {
      const prog = el('div', 'brow-prog'), bar = el('div', 'bar'), fill = el('i', '');
      fill.style.width = `${percentDone(r.progress)}%`; bar.append(fill);
      prog.append(el('small', '', progressLine(r)), bar);
      row.append(prog);
    } else {
      const needs = el('ul', 'brow-needs');
      for (const n of needLines(state, r)) {
        // only what he can spare counts: what the current goal needs stays for the goal (core/building.ts spare), but
        // the goal's own thing has the goal's own count (haveFor)
        const li = el('li', n.short ? 'short' : '');
        li.innerHTML = picture(n.id, 'item-pic');
        li.append(el('span', '', `${n.have} / ${n.need} ${itemName(n.id, n.need)}`));
        if (n.kept > 0) li.append(el('small', 'brow-goal', ` (${n.kept} kept for your goal)`));
        needs.append(li);
      }
      row.append(needs);
      // where a short material comes from (bark is the hard one to guess)
      for (const id of Object.keys(r.missing)) if (Object.hasOwn(SOURCES, id)) row.append(el('p', 'brow-where', SOURCES[id]));
    }
    const button = rowButton(state, r), go = el('button', 'brow-go', button.label) as HTMLButtonElement;
    go.type = 'button'; go.dataset.build = r.id; go.disabled = !button.ready;
    if (button.why) {
      // why it can't be pressed now, over the button
      const why = el('p', 'brow-why', button.why);
      why.id = `buildWhy-${r.id}`; go.setAttribute('aria-describedby', why.id);
      row.append(why);
    }
    row.append(go);
    return row;
  }
}
