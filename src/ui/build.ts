// The Build window (data/building.ts; the owner, 12 and 13 Oct 2026): opened from the Build button in the row (from the
// campfire's goal on), it lists what he can build now (the camp's first five as their goals come up, the upgrades once
// the storage chest stands), each with a line on what it is, what it needs (and how many of each
// he has, what's short standing out, with where a material comes from) and how long the work takes; something begun
// shows how far along it is, with Carry on. Pressing a row sends the build command: he walks to its spot and gets to
// work (the spots are fixed: nothing is placed). Also the notices of building (a stage up, refusals) and the bark
// peeled off a log, drifting up over him. Reads state; never changes the game.
import type { GameState } from '../core/state';
import { owned } from '../core/state';
import type { EventBus } from '../core/events';
import type { Command } from '../systems/commands';
import type { Layout } from '../world/layout';
import type { Windows } from './windows';
import type { Hud } from './hud';
import { buildOpen, buildRows, buildTime, forGoal, haveFor, spare, type BuildRow } from '../core/building';
import { SOURCES, STAGE_NAMES } from '../data/building';
import { MAKES, type MakeId } from '../data/making';
import { itemName } from './hud';
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

/** What the row's button says: Carry on for something begun, else Build. */
export const rowAction = (row: BuildRow) => row.begun ? 'Carry on' : 'Build';

/** Whether the row's button can be used: begun, or with everything it needs. */
export const rowReady = (row: BuildRow) => row.begun || Object.keys(row.missing).length === 0;

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
        : e.reason === 'down' ? "He can't build anything while he's knocked out." : `The ${name(e.make)} can't be built yet.`);
      else if (e.type === 'barkPeeled' && this.state) hud.drift(`+1 ${itemName('bark', 1)}`, this.state.player.pos);
    });
  }

  /** Start on something from the list, or carry on with it: he walks to its spot. */
  private pick(id: MakeId): void {
    if (!this.state) return;
    this.queue.push({ type: 'build', id });
    this.windows.close('build');
  }

  update(state: GameState): void {
    this.state = state;
    this.windows.setAvailable('build', buildOpen(state, this.layout));
    if (!this.windows.isOpen('build')) { this.shown = ''; return; }
    const rows = buildRows(state, this.layout);
    const key = JSON.stringify(rows.map(r => [r.id, r.begun, r.stage, Math.round(r.progress * 50), Math.round(buildTime(state, r.id)), r.missing, Object.keys(r.def.needs).map(i => [owned(state, i), spare(state, i)])]));
    if (key === this.shown) return;
    this.shown = key;
    const list = $('buildList');
    list.replaceChildren(...rows.map(r => this.rowEl(state, r)));
    $('buildNone').hidden = rows.length > 0;
  }

  private rowEl(state: GameState, r: BuildRow): HTMLElement {
    const row = el('div', 'brow' + (r.begun ? ' begun' : ''));
    const head = el('div', 'brow-head');
    head.append(el('b', '', r.def.name), el('small', '', workTime(buildTime(state, r.id))));
    row.append(head, el('p', 'brow-blurb', r.staged.blurb));
    if (r.begun) {
      const prog = el('div', 'brow-prog'), bar = el('div', 'bar'), fill = el('i', '');
      fill.style.width = `${Math.round(r.progress * 100)}%`; bar.append(fill);
      prog.append(el('small', '', `${STAGE_NAMES[Math.max(0, r.stage)]}: ${Math.round(r.progress * 100)}% done`), bar);
      row.append(prog);
    } else {
      const needs = el('ul', 'brow-needs');
      for (const [id, n] of Object.entries(r.def.needs)) {
        // only what he can spare counts: what the current goal needs stays for the goal (core/building.ts spare), but
        // the goal's own thing has the goal's own count (haveFor)
        const have = Math.min(n, haveFor(state, r.def, id)), li = el('li', have < n ? 'short' : '');
        li.innerHTML = picture(id, 'item-pic');
        li.append(el('span', '', `${have} / ${n} ${itemName(id, n)}`));
        if (have < n && forGoal(state, id) > 0 && owned(state, id) > have) li.append(el('small', 'brow-goal', ' (the rest are for your goal)'));
        needs.append(li);
      }
      row.append(needs);
      // where a short material comes from (bark is the hard one to guess)
      for (const id of Object.keys(r.missing)) if (Object.hasOwn(SOURCES, id)) row.append(el('p', 'brow-where', SOURCES[id]));
    }
    const go = el('button', 'brow-go', rowAction(r)) as HTMLButtonElement;
    go.type = 'button'; go.dataset.build = r.id; go.disabled = !rowReady(r);
    row.append(go);
    return row;
  }
}
