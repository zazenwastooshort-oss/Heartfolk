// The combat bits of the panel (chapter 2, holding the camp, 0.0.22): his health, "Health 7 / 10" with a bar, shown
// once he has a weapon or isn't at full health, and a small bar over his head while he is hurt; the Train choice
// (Attack, Strength or Defence), shown once he has a weapon; the numbers that float up over what he strikes (0 for a
// miss), in calm colours; and the notices that go with fighting. Reads state and sends style commands; never changes
// the game itself.
import * as THREE from 'three';
import { maxHealth, type GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Command } from '../systems/commands';
import type { View } from '../render/view';
import type { Layout } from '../world/layout';
import { targetOf } from '../core/targets';
import { STYLES, type CombatStyle } from '../data/combat';
import { SKILLS, type SkillId } from '../data/skills';
import { GOALS } from '../data/goals';
import { levelFor } from '../data/xp';
import type { Hud } from './hud';

const $ = (id: string) => document.getElementById(id)!;

/** The numbers over what he strikes: how long one shows and how far it rises (seconds, pixels), how high over the
 *  target's foot it starts (metres), and how many at once at most. */
const HITS = { life: 1.1, rise: 26, at: 1.75, most: 4 };
/** The bar over his head while he is hurt: how high over his feet (metres), and below what share of his health it
 *  turns amber. */
const OVERHEAD = { at: 2.05, low: 0.4 };

/** "Attack, Strength or Defence" */
const either = (names: string[]) => names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names.at(-1)}` : names[0];

/** Why he can't fight: no weapon, or the dummy has taught him all it can of the style he trains (and which styles
 *  still have something to learn from it: picking one doesn't send him back, so a tap on the dummy does). */
export function cantFightText(state: GameState, layout: Layout, target: string, reason: 'weapon' | 'taught', skill: SkillId): string {
  if (reason === 'weapon') return 'You need a weapon to practise with. A stone club will do.';
  const t = targetOf(state, layout, target), name = t?.name.toLowerCase() ?? 'dummy';
  const next = either(t ? STYLES.filter(s => levelFor(state.skills[s]) < t.maxLevel).map(s => SKILLS[s].name) : []);
  return next ? `The ${name} can't teach you any more ${SKILLS[skill].name}. Pick ${next} under Train, then tap the dummy.`
    : `The ${name} has taught you all it can.`;
}

/** The skill he trains reached what the goal asks of it: say so, and which skills it still asks for ("Now pick
 *  Attack or Defence under Train."); he carries on meanwhile, so picking one is enough. */
export function goalLevelText(state: GameState, skill: SkillId, level: number, id: string): string {
  const goal = GOALS.find(g => g.id === id);
  const next = either(STYLES.filter(s => levelFor(state.skills[s]) < (goal?.levels?.[s] ?? 0)).map(s => SKILLS[s].name));
  return `${SKILLS[skill].name} level ${level}: that's enough for "${goal?.title ?? id}".${next ? ` Now pick ${next} under Train.` : ''}`;
}

export class CombatHud {
  private hits: { el: HTMLElement; pos: THREE.Vector3; t: number }[] = [];
  // hits can arrive many at a time (catching up), so only the last one is shown, once a frame
  private pendingHit: { target: string; damage: number } | null = null;
  private buttons = new Map<CombatStyle, HTMLButtonElement>();
  private overhead = document.createElement('div');
  private overheadFill = document.createElement('i');

  constructor(private state: GameState, private view: View, events: EventBus, private layout: Layout, queue: Command[], hud: Hud) {
    const row = $('trainRow');
    for (const style of STYLES) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = SKILLS[style].name;
      b.addEventListener('click', () => queue.push({ type: 'style', style }));
      row.append(b); this.buttons.set(style, b);
    }
    this.overhead.className = 'overhead'; this.overhead.hidden = true; this.overhead.append(this.overheadFill);
    $('floats').append(this.overhead);
    events.on(e => {
      if (e.type === 'hit') this.pendingHit = { target: e.target, damage: e.damage };
      else if (e.type === 'cantFight') hud.notice(cantFightText(this.state, this.layout, e.target, e.reason, e.skill));
      else if (e.type === 'goalLevel') hud.notice(goalLevelText(this.state, e.skill, e.level, e.goal));
    });
  }

  /** Where a point in the world is on the page, in pixels from the scene's top left. */
  private onPage(at: THREE.Vector3, box: DOMRect): { x: number; y: number } {
    const v = at.clone().project(this.view.cam.camera);
    return { x: (v.x + 1) / 2 * box.width, y: (1 - v.y) / 2 * box.height };
  }

  update(dt: number): void {
    const state = this.state, max = maxHealth(state), hurt = state.health < max, armed = state.equipment.weapon !== null;
    // his health in the panel, once he has a weapon or is hurt
    $('healthRow').hidden = !armed && !hurt;
    $('healthBar').style.width = `${Math.max(0, Math.min(1, state.health / max)) * 100}%`;
    $('healthText').textContent = `${Math.floor(state.health)} / ${max}`;
    // what he trains, once he has a weapon
    $('trainRow').hidden = !armed;
    for (const [style, b] of this.buttons) {
      const on = style === state.combatStyle;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    }
    const box = this.view.renderer.domElement.getBoundingClientRect();
    // the bar over his head while he is hurt
    this.overhead.hidden = !hurt;
    if (hurt) {
      const at = this.onPage(this.view.minerPos().add(new THREE.Vector3(0, OVERHEAD.at, 0)), box);
      this.overhead.style.left = `${at.x}px`; this.overhead.style.top = `${at.y}px`;
      this.overheadFill.style.width = `${Math.max(0, state.health / max) * 100}%`;
      this.overhead.classList.toggle('low', state.health / max < OVERHEAD.low);
    }
    // a hit (or a miss: 0) floats up over what he struck
    const hit = this.pendingHit, target = hit && targetOf(state, this.layout, hit.target);
    if (hit && target) {
      if (this.hits.length >= HITS.most) this.hits.shift()!.el.remove();
      const el = document.createElement('div'); el.className = hit.damage > 0 ? 'hit' : 'hit zero'; el.textContent = String(hit.damage);
      $('floats').append(el);
      this.hits.push({ el, pos: new THREE.Vector3(target.pos.x, HITS.at, target.pos.z), t: 0 });
    }
    this.pendingHit = null;
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i]!; h.t += dt;
      const at = this.onPage(h.pos, box);
      h.el.style.left = `${at.x}px`; h.el.style.top = `${at.y - h.t / HITS.life * HITS.rise}px`;
      h.el.style.opacity = String(Math.max(0, Math.min(1, (HITS.life - h.t) / 0.35)));
      if (h.t > HITS.life) { h.el.remove(); this.hits.splice(i, 1); }
    }
  }
}
