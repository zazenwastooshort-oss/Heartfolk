// The panels laid over the game: each skill's level and XP, the backpack and the bank, the clock, hover text,
// notices and floating "+xp" numbers. Reads state and listens to events; never changes the game.
import * as THREE from 'three';
import type { GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { View } from '../render/view';
import type { SkillId } from '../data/skills';
import type { BuildingKind, Layout } from '../world/layout';
import { levelFor, levelBounds } from '../data/xp';
import { ITEMS, SKILLS } from '../data/skills';
import { BACKPACK_SLOTS } from '../data/hauling';
import { GOALS } from '../data/goals';
import { clockLabel } from '../core/clock';

const $ = (id: string) => document.getElementById(id)!;
const el = (tag: string, className: string, text = '') => { const e = document.createElement(tag); e.className = className; e.textContent = text; return e; };
/** "28 birch logs"; several are joined by commas, the last by `last` ("20 birch logs and 8 copper ore") */
const itemList = (items: Record<string, number>, last = ', ') => {
  const parts = Object.entries(items).filter(([, n]) => n > 0).map(([id, n]) => `${n.toLocaleString()} ${((n === 1 && ITEMS[id]?.one) || ITEMS[id]?.name)?.toLowerCase() ?? id}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')}${last}${parts.at(-1)}` : parts[0] ?? '';
};

interface SkillRow { row: HTMLElement; lvl: HTMLElement; bar: HTMLElement; text: HTMLElement }

export class Hud {
  private floats: { el: HTMLElement; pos: THREE.Vector3; t: number }[] = [];
  // events can arrive many at a time (catching up after the tab was in the background), so they are
  // gathered here and shown once per frame, above wherever the miner is
  private pendingXp = 0;
  private pendingLevel: { skill: SkillId; level: number } | null = null;
  private noticeTimer = 0;
  private hintGone = false;
  private rows = new Map<SkillId, SkillRow>();
  private active: SkillId | null = null;

  constructor(private view: View, events: EventBus, private layout: Layout) {
    // the bank line only where there is a bank; the goal card only at the camp (it leads a new player on)
    $('bankRow').hidden = !layout.buildings.some(b => b.kind === 'bank');
    $('goal').hidden = !layout.camp;
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
      else if (e.type === 'backpackFull') this.notice('Backpack full: off to the bank.');
      else if (e.type === 'banked') this.notice(`Banked ${itemList(e.items, ' and ')}.`);
      else if (e.type === 'nothingToBank') this.notice('Your backpack is empty.');
      else if (e.type === 'noPath') this.notice("He can't find a way there.");
      else if (e.type === 'noStorage') this.notice("Your backpack is full, and there's nowhere to store it yet.");
      else if (e.type === 'levelUp') this.pendingLevel = { skill: e.skill, level: e.level };
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

  /** The goal card: the first goal (data/goals), how much of what it needs has been gathered so far. Building it
   *  comes in a later update, so a goal that has everything says so. */
  private updateGoal(state: GameState): void {
    const goal = GOALS[0]!, have = (id: string) => (state.player.backpack[id] ?? 0) + (state.bank[id] ?? 0);
    const parts = Object.entries(goal.needs).map(([id, n]) => ({ id, n, got: Math.min(n, have(id)) }));
    const got = parts.reduce((a, p) => a + p.got, 0), need = parts.reduce((a, p) => a + p.n, 0);
    $('goalTitle').textContent = goal.title;
    $('goalCount').textContent = parts.map(p => `${p.got} / ${p.n} ${((p.n === 1 && ITEMS[p.id]?.one) || ITEMS[p.id]?.name)?.toLowerCase() ?? p.id}`).join(', ');
    ($('goalBar') as HTMLElement).style.width = `${need ? got / need * 100 : 100}%`;
    $('goalHint').textContent = got >= need ? goal.ready : goal.hint;
    $('goal').classList.toggle('ready', got >= need);
  }

  /** What a building or a piece of land says when the miner arrives, while it has no use yet. The bank has one: its
   *  notice says what was banked. */
  private visitText(id: string): string | null {
    const b = this.layout.buildings.find(x => x.id === id);
    if (!b) return 'Unexplored land. You will be able to claim it at the city hall in a later update.';
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
    $('bank').textContent = itemList(state.bank) || 'empty';
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
