// The rats in the HUD (chapter 2, holding the camp, part 2): a small health bar over a rat while it is hurt, the numbers
// that float up over a rat he strikes (as over the training dummy: ui/combat.ts) and over him when a rat bites (a calm
// red; 0 for a miss), and the notices that go with fighting rats: going by the chest for food first, the food he takes
// along, and waking up back at camp after a rat knocked him out. Reads state and listens to events; never changes the
// game.
import * as THREE from 'three';
import type { GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { View } from '../render/view';
import type { Layout } from '../world/layout';
import { ratsOf } from '../core/rats';
import { RAT } from '../data/rats';
import { itemList, type Hud } from './hud';

const $ = (id: string) => document.getElementById(id)!;

/** The numbers: how long one shows and how far it rises (seconds, pixels), how high over a rat's feet and over his they
 *  start (metres: his lower than the "+xp" floats over his head, ui/hud.ts, and `side` pixels off to the side away from
 *  the rat that bit him, so they read apart), and how many at once at most (catching up can bring many at once). The bar
 *  over a hurt rat: how high over its feet. */
const HITS = { life: 1.1, rise: 26, rat: 0.8, him: 1.4, side: 30, most: 4 };
const BAR = { at: 0.66 };

/** The notices, in plain words. */
export const RAT_TEXT = {
  fetchFood: 'Off to the chest for some food first.',
  tookFood: (items: Record<string, number>) => `You take ${itemList(items, ' and ')} along.`,
  wokeUp: `A ${RAT.name.toLowerCase()} knocked you out. You wake up back at camp, a bit bruised.`,
};

export class RatsHud {
  /** the numbers showing: where each started, how long it has shown, and (over him) how far to the side, in pixels */
  private hits: { el: HTMLElement; pos: THREE.Vector3; t: number; dx: number }[] = [];
  /** numbers to show on the next frame, over a rat (its id) or over him (bitten by the rat `by`) */
  private pending: { rat: string | null; damage: number; by?: string }[] = [];
  private bars = new Map<string, { el: HTMLElement; fill: HTMLElement }>();

  constructor(private state: GameState, private view: View, events: EventBus, layout: Layout, hud: Hud) {
    for (const spot of ratsOf(layout)) {
      const el = document.createElement('div'), fill = document.createElement('i');
      el.className = 'overhead foe'; el.hidden = true; el.append(fill);
      $('floats').append(el);
      this.bars.set(spot.id, { el, fill });
    }
    events.on(e => {
      if (e.type === 'hit' && this.bars.has(e.target)) this.pending.push({ rat: e.target, damage: e.damage });
      else if (e.type === 'bitten') this.pending.push({ rat: null, damage: e.damage, by: e.by });
      else if (e.type === 'fetchFood') hud.notice(RAT_TEXT.fetchFood);
      else if (e.type === 'tookFood') hud.notice(RAT_TEXT.tookFood(e.items));
      else if (e.type === 'wokeUp') hud.notice(RAT_TEXT.wokeUp);
    });
  }

  /** Where a point in the world is on the page, in pixels from the scene's top left. */
  private onPage(at: THREE.Vector3, box: DOMRect): { x: number; y: number } {
    const v = at.clone().project(this.view.cam.camera);
    return { x: (v.x + 1) / 2 * box.width, y: (1 - v.y) / 2 * box.height };
  }

  update(dt: number): void {
    const box = this.view.renderer.domElement.getBoundingClientRect();
    // a bar over each rat that is up and hurt
    for (const [id, bar] of this.bars) {
      const r = this.state.rats[id], at = r && r.downUntil === null && r.health < RAT.health ? this.view.ratPos(id) : null;
      bar.el.hidden = !at;
      if (!at) continue;
      const p = this.onPage(at.setY(BAR.at), box);
      bar.el.style.left = `${p.x}px`; bar.el.style.top = `${p.y}px`;
      bar.fill.style.width = `${Math.max(0, r!.health / RAT.health) * 100}%`;
    }
    // new numbers: over the rat struck (0 for a miss), or over him when bitten, in a calm red, beside him on the side
    // away from the rat
    for (const n of this.pending.slice(-HITS.most)) {
      const at = n.rat ? this.view.ratPos(n.rat)?.setY(HITS.rat) : this.view.minerPos().setY(HITS.him);
      if (!at) continue;
      const from = !n.rat && n.by ? this.view.ratPos(n.by) : null;
      const dx = n.rat ? 0 : (from && this.onPage(from, box).x > this.onPage(at, box).x ? -1 : 1) * HITS.side;
      if (this.hits.length >= HITS.most) this.hits.shift()!.el.remove();
      const el = document.createElement('div');
      el.className = n.damage > 0 ? (n.rat ? 'hit' : 'hit me') : 'hit zero'; el.textContent = String(n.damage);
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
