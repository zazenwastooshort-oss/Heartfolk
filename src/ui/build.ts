// The Build window (data/building.ts; the owner, 12 Oct 2026: "is it possible to do placement yourself?"): opened from
// the Build button in the row once the camp is set up, it lists what he can build now, each with a line on what it is,
// what it needs (and how many of each he has, what's short standing out, with where a new material comes from), the
// Carpentry level and how long the work takes; something begun shows how far along it is, with Carry on. Picking
// something to place (the log bench, the workbench) closes the window and starts placing: a see-through copy on the
// ground (render/building.ts) that follows the mouse until clicked, or goes where the ground is tapped and can be
// dragged about by a finger, snapped to a half-metre grid, green where it fits and red where it doesn't
// (core/building.ts fitOf), with a bar to turn it a quarter turn, place it or cancel (keys: R, Enter, Esc). Placing
// sends the build command; the shelter's upgrades are built where the tent stands, so they go straight off. Also the
// notices of building (footings out, a stage up, refusals) and the bark peeled off a log, drifting up over him. Reads
// state; never changes the game.
import type { GameState } from '../core/state';
import { owned } from '../core/state';
import type { EventBus } from '../core/events';
import type { Command } from '../systems/commands';
import type { Layout, Vec2 } from '../world/layout';
import type { View } from '../render/view';
import type { Windows } from './windows';
import type { Hud } from './hud';
import type { PlacingHooks } from './input';
import { buildOpen, buildRows, fitOf, isPlaced, placeStart, rectOf, snap, type BuildRow, type Misfit } from '../core/building';
import { SOURCES, STAGE_NAMES } from '../data/building';
import { MAKES, type MakeId } from '../data/making';
import { itemName, setText } from './hud';
import { picture } from './pictures';

const $ = (id: string) => document.getElementById(id)!;
const el = (tag: string, className: string, text = '') => { const e = document.createElement(tag); e.className = className; e.textContent = text; return e; };

/** Why a spot doesn't fit, in plain words for the placing bar and the notice. */
export const MISFIT_WORDS: Record<Misfit, string> = {
  land: "It has to go on the camp's open ground.",
  water: 'Too close to the water.',
  blocked: "Something's in the way there.",
  him: "He's standing there.",
  cutOff: 'That would block the way through the camp.',
};

/** How long the work takes, in words: "30 seconds", "a minute and a half", "3 minutes" (to the nearest half minute). */
export function workTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} seconds`;
  const halves = Math.round(seconds / 30), whole = Math.floor(halves / 2), half = halves % 2 === 1;
  const mins = whole === 1 ? 'a minute' : `${whole} minutes`;
  return half ? (whole === 1 ? 'a minute and a half' : `${whole} and a half minutes`) : mins;
}

/** What the row's button says: Carry on for something begun, Place for something he places, else Build. */
export const rowAction = (row: BuildRow) => row.begun ? 'Carry on' : isPlaced(row.id) ? 'Place' : 'Build';

/** Whether the row's button can be used: begun, or with the level and everything it needs. */
export const rowReady = (row: BuildRow) => row.begun || (row.levelOk && Object.keys(row.missing).length === 0);

/** What the player is placing: which thing, where (on the grid), turned how many quarter turns, whether he has set it
 *  down yet (a click or a tap: the mouse no longer drags it about), and whether it fits there. */
interface Placing { id: MakeId; pos: Vec2; turn: number; set: boolean; misfit: Misfit | null; checked: string }

export class BuildWindow {
  private placing: Placing | null = null;
  private state: GameState | null = null;
  private shown = '';
  private sinceCheck = 0;

  /** For ui/input.ts: while placing, taps, drags and the mouse move the see-through copy instead of walking. */
  readonly hooks: PlacingHooks = {
    active: () => !!this.placing,
    hover: at => { if (this.placing && !this.placing.set) this.moveTo(at); },
    tap: at => { if (this.placing) { this.moveTo(at); this.placing.set = true; } },
    grab: at => {
      const pl = this.placing, r = pl && rectOf(pl.id, { pos: pl.pos, turn: pl.turn });
      return !!r && Math.hypot(at.x - r.pos.x, at.z - r.pos.z) <= Math.max(r.w, r.d) / 2 + 0.4;
    },
    drag: at => { if (this.placing) { this.moveTo(at); this.placing.set = true; } },
  };

  constructor(private windows: Windows, private view: View, events: EventBus, private layout: Layout, private queue: Command[], private hud: Hud) {
    $('placeTurn').addEventListener('click', () => this.turn());
    $('placeOk').addEventListener('click', () => this.place());
    $('placeCancel').addEventListener('click', () => this.stop());
    window.addEventListener('keydown', e => {
      if (!this.placing || e.target instanceof HTMLInputElement) return;
      if (e.key === 'Escape') this.stop();
      else if (e.key === 'r' || e.key === 'R') this.turn();
      else if (e.key === 'Enter') this.place();
      else return;
      e.preventDefault();
    });
    // the list's buttons: one listener for them all
    $('buildList').addEventListener('click', e => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-build]');
      if (button && !button.disabled) this.pick(button.dataset.build as MakeId);
    });
    events.on(e => {
      const name = (id: MakeId) => MAKES[id].name.toLowerCase();
      if (e.type === 'begun') hud.notice(isPlaced(e.make) ? `He sets out the footings for the ${name(e.make)} and gets to work.` : `He gets to work on the ${name(e.make)}.`);
      else if (e.type === 'buildStage') hud.notice(e.stage === 1 ? `The ${name(e.make)}'s frame is up.` : `The ${name(e.make)} is ${STAGE_NAMES[e.stage]!.toLowerCase()}.`);
      else if (e.type === 'cantBuild') hud.notice(e.reason === 'level' ? `You need Carpentry level ${e.need} to build the ${name(e.make)}.`
        : e.reason === 'fit' ? MISFIT_WORDS[e.misfit ?? 'blocked'] : `The ${name(e.make)} can't be built yet.`);
      else if (e.type === 'barkPeeled' && this.state) hud.drift(`+1 ${itemName('bark', 1)}`, this.state.player.pos);
    });
  }

  /** Start on something from the list: place it, or (built where the tent stands, or begun) send him off to it. */
  private pick(id: MakeId): void {
    const state = this.state;
    if (!state) return;
    if (!isPlaced(id) || state.underway[id] !== undefined) { this.queue.push({ type: 'build', id }); this.windows.close('build'); return; }
    const cam = this.view.cam.camera.position;
    this.placing = { id, pos: placeStart(state, this.layout, id, { x: cam.x, z: cam.z }), turn: 0, set: false, misfit: null, checked: '' };
    this.windows.close('build');
    setText($('placeName'), `Place the ${MAKES[id].name.toLowerCase()}`);
    $('placeBar').hidden = false;
    this.check(true);
  }

  private moveTo(at: Vec2): void {
    if (!this.placing) return;
    this.placing.pos = snap(at);
    this.check(false);
  }

  private turn(): void {
    if (!this.placing) return;
    this.placing.turn = (this.placing.turn + 1) % 4;
    this.check(false);
  }

  private place(): void {
    const pl = this.placing;
    if (!pl || !this.state) return;
    this.check(true);
    if (pl.misfit) { this.hud.notice(MISFIT_WORDS[pl.misfit]); return; }
    this.queue.push({ type: 'build', id: pl.id, at: { ...pl.pos }, turn: pl.turn });
    this.stop();
  }

  private stop(): void {
    this.placing = null;
    $('placeBar').hidden = true;
    this.view.building.hideGhost();
  }

  /** Whether the copy fits where it is (worked out again when it moves or turns, and now and then as he walks about),
   *  shown in its colour and the bar's words. */
  private check(force: boolean): void {
    const pl = this.placing, state = this.state;
    if (!pl || !state) return;
    const key = `${pl.pos.x},${pl.pos.z},${pl.turn}`;
    if (force || key !== pl.checked) {
      pl.misfit = fitOf(state, this.layout, pl.id, pl.pos, pl.turn);
      pl.checked = key; this.sinceCheck = 0;
    }
    this.view.building.showGhost(pl.id, pl.pos, pl.turn, !pl.misfit);
    const says = $('placeSays');
    setText(says, pl.misfit ? MISFIT_WORDS[pl.misfit] : 'It fits here.');
    says.classList.toggle('bad', !!pl.misfit);
    ($('placeOk') as HTMLButtonElement).disabled = !!pl.misfit;
  }

  update(state: GameState, dt: number): void {
    this.state = state;
    this.windows.setAvailable('build', buildOpen(state, this.layout));
    if (this.placing) {
      // something else may have moved into the way (he walked there, a stone came back): look again now and then
      this.sinceCheck += dt;
      this.check(this.sinceCheck > 0.5);
      if (!buildOpen(state, this.layout) || state.built.includes(this.placing.id) || state.underway[this.placing.id] !== undefined) this.stop();
    }
    if (!this.windows.isOpen('build')) { this.shown = ''; return; }
    const rows = buildRows(state, this.layout);
    const key = JSON.stringify(rows.map(r => [r.id, r.begun, r.stage, Math.round(r.progress * 50), r.missing, r.levelOk, Object.keys(r.def.needs).map(i => owned(state, i))]));
    if (key === this.shown) return;
    this.shown = key;
    const list = $('buildList');
    list.replaceChildren(...rows.map(r => this.rowEl(state, r)));
    $('buildNone').hidden = rows.length > 0;
  }

  private rowEl(state: GameState, r: BuildRow): HTMLElement {
    const row = el('div', 'brow' + (r.begun ? ' begun' : ''));
    const head = el('div', 'brow-head');
    head.append(el('b', '', r.def.name), el('small', '', `Carpentry ${r.staged.level}, ${workTime(r.def.time)}`));
    row.append(head, el('p', 'brow-blurb', r.staged.blurb));
    if (r.begun) {
      const prog = el('div', 'brow-prog'), bar = el('div', 'bar'), fill = el('i', '');
      fill.style.width = `${Math.round(r.progress * 100)}%`; bar.append(fill);
      prog.append(el('small', '', `${STAGE_NAMES[Math.max(0, r.stage)]}: ${Math.round(r.progress * 100)}% done`), bar);
      row.append(prog);
    } else {
      const needs = el('ul', 'brow-needs');
      for (const [id, n] of Object.entries(r.def.needs)) {
        const have = Math.min(n, owned(state, id)), li = el('li', have < n ? 'short' : '');
        li.innerHTML = picture(id, 'item-pic');
        li.append(el('span', '', `${have} / ${n} ${itemName(id, n)}`));
        needs.append(li);
      }
      row.append(needs);
      // where a short new material comes from (bark is the hard one to guess)
      for (const id of Object.keys(r.missing)) if (Object.hasOwn(SOURCES, id)) row.append(el('p', 'brow-where', SOURCES[id]));
      if (!r.levelOk) row.append(el('p', 'brow-why', `Needs Carpentry level ${r.staged.level}.`));
    }
    const go = el('button', 'brow-go', rowAction(r)) as HTMLButtonElement;
    go.type = 'button'; go.dataset.build = r.id; go.disabled = !rowReady(r);
    row.append(go);
    return row;
  }
}
