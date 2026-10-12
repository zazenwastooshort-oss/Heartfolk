// The panels laid over the game: each skill's level and XP, the backpack and what is stored (the bank, or at the
// camp the storage chest once it is built), the clock, hover text, notices and floating "+xp" numbers, and the goal
// card with its Build button (tapping the card opens his book: ui/book.ts), which says the camp is set up once every
// goal is done. Reads state and listens to events; never changes the game (the Build button sends a command).
import * as THREE from 'three';
import { allGoalsDone, currentGoal, made, type GameState } from '../core/state';
import { goalLines } from '../core/book';
import type { EventBus } from '../core/events';
import type { Command } from '../systems/commands';
import type { View } from '../render/view';
import type { SkillId } from '../data/skills';
import type { BuildingKind, Layout } from '../world/layout';
import { levelFor, levelBounds } from '../data/xp';
import { ITEMS, SKILLS, TOOLS } from '../data/skills';
import { BACKPACK_SLOTS } from '../data/hauling';
import { BOOK, CAMP_DONE, GOALS } from '../data/goals';
import { GATHERS } from '../data/pickups';
import { MAKES, makeDef } from '../data/making';
import { clockLabel } from '../core/clock';

const $ = (id: string) => document.getElementById(id)!;
const el = (tag: string, className: string, text = '') => { const e = document.createElement(tag); e.className = className; e.textContent = text; return e; };
/** What `n` of an item are called: "birch logs", "1 birch log" (ITEMS' `one`); his book is "book". */
export const itemName = (id: string, n: number) => id === BOOK ? 'book' : ((n === 1 && ITEMS[id]?.one) || ITEMS[id]?.name)?.toLowerCase() ?? id;
/** "28 birch logs"; several are joined by commas, the last by `last` ("20 birch logs and 8 copper ore") */
export const itemList = (items: Record<string, number>, last = ', ') => {
  const parts = Object.entries(items).filter(([, n]) => n > 0).map(([id, n]) => `${n.toLocaleString()} ${itemName(id, n)}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')}${last}${parts.at(-1)}` : parts[0] ?? '';
};

interface SkillRow { row: HTMLElement; lvl: HTMLElement; bar: HTMLElement; text: HTMLElement }

export class Hud {
  private floats: { el: HTMLElement; pos: THREE.Vector3; t: number }[] = [];
  // events can arrive many at a time (catching up after the tab was in the background), so they are
  // gathered here and shown once per frame, above wherever the miner is
  private pendingXp = 0;
  private pendingItems: Record<string, number> = {};
  private pendingLevel: { skill: SkillId; level: number } | null = null;
  private noticeTimer = 0;
  private hintGone = false;
  private rows = new Map<SkillId, SkillRow>();
  private active: SkillId | null = null;

  private buildFor: string | null = null;     // what the goal card's Build button makes, while it shows
  private hasBank: boolean;
  /** what the place things are stored is called in notices: the bank, or at the camp the chest */
  private store: string;

  constructor(private view: View, events: EventBus, private layout: Layout, queue: Command[]) {
    // the storage line where there is a bank, or at the camp once the chest is built (update); the goal card only at
    // the camp (it leads a new player on)
    this.hasBank = layout.buildings.some(b => b.kind === 'bank');
    this.store = this.hasBank ? 'bank' : 'chest';
    $('bankName').textContent = this.hasBank ? 'Bank' : 'Chest';
    $('bankRow').hidden = !this.hasBank;
    $('goal').hidden = !layout.camp;
    $('goalBuild').addEventListener('click', () => {
      const def = this.buildFor && makeDef(this.buildFor);
      if (def) queue.push({ type: 'make', id: def.id });
    });
    // one row per skill in data/skills, so a new skill shows up here without touching the page
    for (const s of Object.values(SKILLS)) {
      const row = el('div', 'srow'), head = el('div', 'row'), lvl = el('span', 'lvl', '1'), bar = el('i', ''), text = el('small', '');
      head.append(el('span', 'name', s.name), lvl);
      const track = el('div', 'bar'); track.append(bar); bar.style.background = s.color;
      row.append(head, track, text); $('skills').append(row);
      this.rows.set(s.id, { row, lvl, bar, text });
    }
    events.on(e => {
      if (e.type === 'xpGained') { this.pendingXp += e.amount; this.active = e.skill; }
      else if (e.type === 'visited') { const text = this.visitText(e.id); if (text) this.notice(text); }
      else if (e.type === 'backpackFull') this.notice(`Backpack full: off to the ${this.store}.`);
      else if (e.type === 'banked') this.notice(this.hasBank ? `Banked ${itemList(e.items, ' and ')}.` : `Stored ${itemList(e.items, ' and ')} in the chest.`);
      else if (e.type === 'stokeOff') this.notice('Nightfall: off to stoke the fire.');
      else if (e.type === 'fireLow') this.notice('No logs to stoke the fire tonight. It burns low.');
      else if (e.type === 'nothingToBank') this.notice('Your backpack is empty.');
      else if (e.type === 'noPath') this.notice("He can't find a way there.");
      else if (e.type === 'noStorage') this.notice("Your backpack is full, and there's nowhere to store it yet. Open the backpack to drop something.");
      else if (e.type === 'levelUp') this.pendingLevel = { skill: e.skill, level: e.level };
      else if (e.type === 'needTool') { const t = TOOLS[e.tool]; this.notice(`You need ${t.a} to ${t.use}.`); }
      else if (e.type === 'allGathered') this.notice(`That's all the ${GATHERS[e.gather].name.toLowerCase()}.`);
      else if (e.type === 'goalEnough') this.notice(`That's enough ${itemName(e.item, 2)} for "${GOALS.find(g => g.id === e.goal)?.title ?? e.goal}".`);
      else if (e.type === 'stacked') this.notice(e.logs > 0 ? `Stacked ${itemList({ birch_logs: e.logs })} on the firewood pile (${e.pile} there now).`
        : e.reason === 'full' ? 'The firewood pile is full.' : 'You have no logs to stack on the firewood pile.');
      else if (e.type === 'noRoom') this.notice('Your backpack is full. Open the backpack to drop something.');
      else if (e.type === 'dropped') this.notice(`Dropped ${itemList({ [e.item]: e.count })}.`);
      else if (e.type === 'cantDrop') this.notice(`You won't find more ${itemName(e.item, 2)}, so you keep them.`);
      else if (e.type === 'missing') {
        const def = MAKES[e.make];
        this.notice(`To ${def.verb.toLowerCase()} the ${def.name.toLowerCase()} you still need ${itemList(e.items, ' and ')}.`);
      }
      else if (e.type === 'goalFirst') this.notice(`Finish "${GOALS.find(g => g.id === e.goal)?.title ?? e.goal}" first.`);
      else if (e.type === 'made') this.notice(MAKES[e.make].done);
      // picking up his book opens it instead of a notice (ui/book.ts)
      else if (e.type === 'pickedUp' && e.item) this.pendingItems[e.item] = (this.pendingItems[e.item] ?? 0) + e.count;
      else if (e.type === 'levelTooLow') {
        const s = SKILLS[e.skill];
        this.notice(`You need ${s.name} level ${e.need} to ${s.verb.toLowerCase()} ${e.what.toLowerCase()}s.`);
      }
    });
  }

  hover(label: string | null): void {
    const el = $('hover');
    if (!label) { el.textContent = 'Walk here'; return; }
    const [verb, thing] = label.split('|');
    el.innerHTML = ''; el.append(`${verb} `);
    const b = document.createElement('b'); b.textContent = thing ?? ''; el.append(b);
  }

  /** The goal card: the goal currentGoal picks (the first not finished), and how much of each thing it needs he has
   *  (carried or banked; the book once found), counted by goalLines like his book's pages. A making goal with everything there shows the Build button (or says he
   *  is on his way or working on it, while he is); one whose thing can't be made yet says so in its ready text. */
  private updateGoal(state: GameState): void {
    if (allGoalsDone(state)) {
      // the camp is set up: the card says so, and that more comes later
      $('goalTitle').textContent = CAMP_DONE.title;
      $('goalCount').textContent = '';
      ($('goalBar') as HTMLElement).style.width = '100%';
      $('goalHint').textContent = CAMP_DONE.text;
      $('goal').classList.add('ready');
      this.buildFor = null; ($('goalBuild') as HTMLButtonElement).hidden = true;
      return;
    }
    const goal = currentGoal(state);
    const parts = goalLines(state, goal);
    const got = parts.reduce((a, p) => a + p.got, 0), need = parts.reduce((a, p) => a + p.need, 0), ready = got >= need;
    const def = goal.makes ? makeDef(goal.makes) : null, task = state.player.task, pending = state.player.pending;
    const building = !!def && task.kind === 'make' && task.id === def.id;
    const going = !!def && pending?.kind === 'make' && pending.id === def.id;
    const offer = !!def && ready && !building && !going && !made(state, def.id);
    $('goalTitle').textContent = goal.title;
    $('goalCount').textContent = parts.map(p => `${p.got} / ${p.need} ${itemName(p.id, p.need)}`).join(', ');
    ($('goalBar') as HTMLElement).style.width = `${need ? got / need * 100 : 100}%`;
    $('goalHint').textContent = building ? `Working on the ${def.name.toLowerCase()}...`
      : going ? `On the way to ${def.verb.toLowerCase()} the ${def.name.toLowerCase()}...` : ready ? goal.ready : goal.hint;
    $('goal').classList.toggle('ready', ready);
    this.buildFor = offer ? def.id : null;
    const button = $('goalBuild') as HTMLButtonElement;
    button.hidden = !offer;
    if (offer) button.textContent = `${def.verb} the ${def.name.toLowerCase()}`;
  }

  /** What a building or a piece of land says when the miner arrives, while it has no use yet. The bank has one: its
   *  notice says what was banked; so does the camp's chest, and the campfire he stokes says nothing. */
  private visitText(id: string): string | null {
    const b = this.layout.buildings.find(x => x.id === id);
    if (!b) return this.layout.parcels.some(x => x.id === id) ? 'Unexplored land. You will be able to claim it at the city hall in a later update.' : null;
    const text: Record<BuildingKind, string | null> = {
      bank: null,
      cityhall: 'The city hall will handle land claims in a later update.',
      forge: 'The forge is cold for now. Smithing comes in a later update.',
      stall: "The merchant hasn't arrived yet.",
      inn: 'The inn opens its doors in a later update.',
      barn: 'The barn will hold carts and tools in a later update.',
      house: 'Nobody lives here yet. Villagers move in later.',
    };
    return text[b.kind];
  }

  private notice(text: string): void {
    // notices take the hint's place, and by then the player knows how to play, so the hint goes for good
    this.hintGone = true; $('hint').classList.add('gone');
    const el = $('notice'); el.textContent = text; el.classList.add('show'); this.noticeTimer = 3;
  }

  private float(text: string, big: boolean, at: { x: number; z: number }): void {
    if (this.floats.length > 8) this.floats.shift()!.el.remove();
    const el = document.createElement('div'); el.className = 'float' + (big ? ' big' : ''); el.textContent = text;
    $('floats').appendChild(el);
    this.floats.push({ el, pos: new THREE.Vector3(at.x, big ? 2.5 : 2.15, at.z), t: 0 });
  }

  update(state: GameState, dt: number): void {
    // the how-to-play hint fades once the player has sent the miner somewhere (or a save already has him busy)
    if (!this.hintGone && state.player.task.kind !== 'idle') { this.hintGone = true; $('hint').classList.add('gone'); }
    if (this.pendingXp) { this.float(`+${Math.round(this.pendingXp).toLocaleString()} xp`, false, state.player.pos); this.pendingXp = 0; }
    for (const [item, n] of Object.entries(this.pendingItems)) this.float(`+${n} ${itemName(item, n)}`, false, state.player.pos);
    this.pendingItems = {};
    if (this.pendingLevel) {
      this.float(`${SKILLS[this.pendingLevel.skill].name} level ${this.pendingLevel.level}!`, true, state.player.pos);
      this.pendingLevel = null;
    }
    if (this.noticeTimer > 0) { this.noticeTimer -= dt; if (this.noticeTimer <= 0) $('notice').classList.remove('show'); }

    for (const [id, r] of this.rows) {
      const xp = state.skills[id], lvl = levelFor(xp), [lo, hi] = levelBounds(lvl);
      r.lvl.textContent = String(lvl);
      r.bar.style.width = `${lvl >= 99 ? 100 : (xp - lo) / (hi - lo) * 100}%`;
      r.text.textContent = `${Math.floor(xp).toLocaleString()} / ${hi.toLocaleString()} xp`;
      r.row.classList.toggle('active', id === this.active);
    }
    const carried = Object.values(state.player.backpack).reduce((a, n) => a + n, 0);
    $('packCount').textContent = `${carried} / ${BACKPACK_SLOTS}`;
    $('packBar').style.width = `${Math.min(100, carried / BACKPACK_SLOTS * 100)}%`;
    $('pack').classList.toggle('full', carried >= BACKPACK_SLOTS);
    $('bankRow').hidden = !this.hasBank && !(this.layout.camp && state.built.includes('chest'));
    $('bank').textContent = itemList(state.bank) || 'empty';
    // the firewood pile (0.0.21), once it stands: how many logs it holds for stoking the fire
    const pile = !!this.layout.camp && state.built.includes('woodpile');
    $('pileRow').hidden = !pile;
    if (pile) $('pile').textContent = `${state.woodpile} ${state.woodpile === 1 ? 'log' : 'logs'}`;
    $('clock').textContent = clockLabel(state.time);
    if (this.layout.camp) this.updateGoal(state);
    const b = this.view.renderer.domElement.getBoundingClientRect();
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]!; f.t += dt;
      const v = f.pos.clone().project(this.view.cam.camera);
      f.el.style.left = `${(v.x + 1) / 2 * b.width}px`;
      f.el.style.top = `${(1 - v.y) / 2 * b.height - f.t * 30}px`;
      f.el.style.opacity = String(Math.max(0, 1 - f.t / 1.3));
      if (f.t > 1.3) { f.el.remove(); this.floats.splice(i, 1); }
    }
  }
}
