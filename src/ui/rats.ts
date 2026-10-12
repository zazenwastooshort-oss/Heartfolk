// The creatures in the HUD (chapter 2, holding the camp, part 2: the rats; since its last part the goblins and their
// chief too): a small health bar over one while it is hurt, the numbers that float up over one he strikes (as over the
// training dummy: ui/combat.ts) and over him when one bites or strikes him (a calm red; 0 for a miss), and the notices
// that go with fighting them: going by the chest for food first, the food he takes along, and waking up back at camp
// after one knocked him out. Reads state and listens to events; never changes the game.
import * as THREE from 'three';
import type { GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { View } from '../render/view';
import type { Layout } from '../world/layout';
import { foeIds, foeKind, foeName, targetOf, type Foe } from '../core/targets';
import { itemList, type Hud } from './hud';

const $ = (id: string) => document.getElementById(id)!;

/** The numbers: how long one shows and how far it rises (seconds, pixels), how high over his feet they start (metres:
 *  lower than the "+xp" floats over his head, ui/hud.ts, and `side` pixels off to the side away from the creature that
 *  hit him, so they read apart), and how many at once at most (catching up can bring many at once). Over a creature,
 *  by its kind: how high over its feet its bar is and its numbers start (metres). */
const HITS = { life: 1.1, rise: 26, him: 1.4, side: 30, most: 4 };
const OVER: Record<Foe['kind'], { bar: number; hit: number }> = {
  rat: { bar: 0.66, hit: 0.8 }, goblin: { bar: 1.6, hit: 1.75 }, chief: { bar: 1.85, hit: 2.0 },
};

/** The notices, in plain words. */
export const RAT_TEXT = {
  fetchFood: 'Off to the chest for some food first.',
  tookFood: (items: Record<string, number>) => `You take ${itemList(items, ' and ')} along.`,
  /** `name`: what knocked him out ("Rat", "Goblin chief") */
  wokeUp: (name: string) => `${name === 'Goblin chief' ? 'The goblin chief' : `A ${name.toLowerCase()}`} knocked you out. You wake up back at camp, a bit bruised.`,
};

export class RatsHud {
  /** the numbers showing: where each started, how long it has shown, and (over him) how far to the side, in pixels */
  private hits: { el: HTMLElement; pos: THREE.Vector3; t: number; dx: number }[] = [];
  /** numbers to show on the next frame, over a creature (its id) or over him (hit by the creature `by`) */
  private pending: { foe: string | null; damage: number; by?: string }[] = [];
  private bars = new Map<string, { el: HTMLElement; fill: HTMLElement }>();

  constructor(private state: GameState, private view: View, events: EventBus, private layout: Layout, hud: Hud) {
    for (const id of foeIds(layout)) {
      const el = document.createElement('div'), fill = document.createElement('i');
      el.className = 'overhead foe'; el.hidden = true; el.append(fill);
      $('floats').append(el);
      this.bars.set(id, { el, fill });
    }
    events.on(e => {
      if (e.type === 'hit' && this.bars.has(e.target)) this.pending.push({ foe: e.target, damage: e.damage });
      else if (e.type === 'bitten') this.pending.push({ foe: null, damage: e.damage, by: e.by });
      else if (e.type === 'fetchFood') hud.notice(RAT_TEXT.fetchFood);
      else if (e.type === 'tookFood') hud.notice(RAT_TEXT.tookFood(e.items));
      else if (e.type === 'wokeUp') hud.notice(RAT_TEXT.wokeUp(foeName(layout, e.by) ?? 'Rat'));
    });
  }

  /** Where a point in the world is on the page, in pixels from the scene's top left. */
  private onPage(at: THREE.Vector3, box: DOMRect): { x: number; y: number } {
    const v = at.clone().project(this.view.cam.camera);
    return { x: (v.x + 1) / 2 * box.width, y: (1 - v.y) / 2 * box.height };
  }

  update(dt: number): void {
    const box = this.view.renderer.domElement.getBoundingClientRect();
    // a bar over each creature that is up and hurt
    for (const [id, bar] of this.bars) {
      const foe = targetOf(this.state, this.layout, id)?.foe, at = foe && !foe.down && foe.health < foe.maxHealth ? this.view.foePos(id) : null;
      bar.el.hidden = !at;
      if (!at || !foe) continue;
      const p = this.onPage(at.setY(OVER[foe.kind].bar), box);
      bar.el.style.left = `${p.x}px`; bar.el.style.top = `${p.y}px`;
      bar.fill.style.width = `${Math.max(0, foe.health / foe.maxHealth) * 100}%`;
    }
    // new numbers: over the creature struck (0 for a miss), or over him when hit, in a calm red, beside him on the side
    // away from what hit him
    for (const n of this.pending.slice(-HITS.most)) {
      const kind = n.foe ? foeKind(this.layout, n.foe) : null;
      const at = n.foe ? this.view.foePos(n.foe)?.setY(OVER[kind ?? 'rat'].hit) : this.view.minerPos().setY(HITS.him);
      if (!at) continue;
      const from = !n.foe && n.by ? this.view.foePos(n.by) : null;
      const dx = n.foe ? 0 : (from && this.onPage(from, box).x > this.onPage(at, box).x ? -1 : 1) * HITS.side;
      if (this.hits.length >= HITS.most) this.hits.shift()!.el.remove();
      const el = document.createElement('div');
      el.className = n.damage > 0 ? (n.foe ? 'hit' : 'hit me') : 'hit zero'; el.textContent = String(n.damage);
      $('floats').append(el);
      this.hits.push({ el, pos: at, t: 0, dx });
    }
    this.pending = [];
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i]!; h.t += dt;
      const at = this.onPage(h.pos, box);
      h.el.style.left = `${at.x + h.dx}px`; h.el.style.top = `${at.y - h.t / HITS.life * HITS.rise}px`;
      h.el.style.opacity = String(Math.max(0, Math.min(1, (HITS.life - h.t) / 0.35)));
      if (h.t > HITS.life) { h.el.remove(); this.hits.splice(i, 1); }
    }
  }
}
