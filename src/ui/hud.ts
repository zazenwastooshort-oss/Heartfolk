// The panels laid over the game: Mining level and XP, what has been gathered, the clock, hover text, notices
// and floating "+xp" numbers. Reads state and listens to events; never changes the game.
import * as THREE from 'three';
import type { GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { View } from '../render/view';
import type { SkillId } from '../data/skills';
import type { BuildingKind, Layout } from '../world/layout';
import { levelFor, levelBounds } from '../data/xp';
import { ITEMS, SKILLS } from '../data/skills';
import { clockLabel } from '../core/clock';

const $ = (id: string) => document.getElementById(id)!;

export class Hud {
  private floats: { el: HTMLElement; pos: THREE.Vector3; t: number }[] = [];
  // events can arrive many at a time (catching up after the tab was in the background), so they are
  // gathered here and shown once per frame, above wherever the miner is
  private pendingXp = 0;
  private pendingLevel: { skill: SkillId; level: number } | null = null;
  private noticeTimer = 0;
  private hintGone = false;

  constructor(private view: View, events: EventBus, private layout: Layout) {
    events.on(e => {
      if (e.type === 'xpGained') this.pendingXp += e.amount;
      else if (e.type === 'visited') this.notice(this.visitText(e.id));
      else if (e.type === 'noPath') this.notice("He can't find a way there.");
      else if (e.type === 'levelUp') this.pendingLevel = { skill: e.skill, level: e.level };
      else if (e.type === 'levelTooLow') this.notice(`You need ${SKILLS[e.skill].name} level ${e.need} to mine ${e.what}.`);
    });
  }

  hover(label: string | null): void {
    const el = $('hover');
    if (!label) { el.textContent = 'Walk here'; return; }
    const [verb, thing] = label.split('|');
    el.innerHTML = ''; el.append(`${verb} `);
    const b = document.createElement('b'); b.textContent = thing ?? ''; el.append(b);
  }

  /** What a building or a piece of land says when the miner arrives, while it has no use yet. */
  private visitText(id: string): string {
    const b = this.layout.buildings.find(x => x.id === id);
    if (!b) return 'Unexplored land. You will be able to claim it at the city hall in a later update.';
    const text: Record<BuildingKind, string> = {
      bank: 'The bank opens in a later update. Until then, everything you gather is kept for you.',
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

    const xp = state.skills.mining, lvl = levelFor(xp), [lo, hi] = levelBounds(lvl);
    $('lvl').textContent = String(lvl);
    ($('xpbar') as HTMLElement).style.width = `${lvl >= 99 ? 100 : (xp - lo) / (hi - lo) * 100}%`;
    $('xptext').textContent = `${Math.floor(xp).toLocaleString()} / ${hi.toLocaleString()} xp`;
    const items = Object.entries(state.bank).filter(([, n]) => n > 0);
    $('bank').textContent = items.length ? items.map(([id, n]) => `${n} ${ITEMS[id]?.name.toLowerCase() ?? id}`).join(', ') : 'Nothing gathered yet';
    $('clock').textContent = clockLabel(state.time);
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
