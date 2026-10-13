// What he is doing, over his head (13 Oct 2026, the owner: in an idle game you watch him, so show what he is doing on
// him rather than in a corner): a small parchment tag with an icon and a few words ("Chopping birch", "Building the
// wall tent"), with a thin bar for what has a clear end (building, making, cooking). It shows only while he does
// something worth saying (not while he stands idle or just walks), steps aside while one of his thoughts is up
// (ui/thoughts.ts) or a window covers the spot, and a Settings switch hides it (remembered in this browser only).
// `activityOf` says what the tag says (headless, tested); the class draws it. Reads the game; changes nothing in it.
import * as THREE from 'three';
import type { GameState } from '../core/state';
import { progressOf } from '../core/building';
import { targetOf } from '../core/targets';
import type { Layout } from '../world/layout';
import type { View } from '../render/view';
import { MAKES } from '../data/making';
import { PICKUPS } from '../data/pickups';
import { RESOURCES, type SkillId } from '../data/skills';
import { COOK } from '../data/cooking';
import { itemName } from './hud';
import { wakeLabel } from './needs';
import { RAIL_ICONS, SKILL_ICONS } from './pictures';

/** What the tag says: an icon (an SVG's inner lines, from ui/pictures.ts) or none, the words, and how far along (0..1)
 *  for what has a clear end, else null. */
export interface Activity { icon: string | null; text: string; progress: number | null }

/** How high over the ground the tag's foot sits (m): over his head, under where his thoughts show (ui/thoughts.ts). */
const ABOVE = 2.15;
const SHOW_KEY = 'hearthfolk_activity';

const lower = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);
const thing = (id: string) => lower(MAKES[id as keyof typeof MAKES]?.name ?? id);
const skillIcon = (skill: SkillId) => SKILL_ICONS[skill] ?? null;
const left = (doneAt: number, time: number, now: number) => Math.min(1, Math.max(0, 1 - (doneAt - now) / time));

/** The words for working a node: chopping birch, mining copper, fishing; `to`: on his way there. */
function nodeWords(layout: Layout, nodeId: string, to: boolean): Activity | null {
  const node = layout.nodes.find(n => n.id === nodeId), res = node && RESOURCES[node.resource];
  if (!res) return null;
  const what = lower(res.name.replace(/ (tree|rock)$/i, ''));
  const text = res.skill === 'woodcutting' ? (to ? `Off to chop ${what}` : `Chopping ${what}`)
    : res.skill === 'mining' ? (to ? `Off to mine ${what}` : `Mining ${what}`)
    : (to ? 'Off to fish' : 'Fishing');
  return { icon: skillIcon(res.skill), text, progress: null };
}

/** The words for picking things up: picking berries, gathering stones. */
function pickupWords(layout: Layout, id: string): Activity | null {
  const spot = layout.pickups?.find(x => x.id === id), gives = spot && PICKUPS[spot.kind].gives;
  if (!gives) return null;
  if (gives === 'book') return { icon: null, text: 'Picking up his book', progress: null };
  return { icon: null, text: gives.item === 'berries' ? 'Picking berries' : `Gathering ${itemName(gives.item, 2)}`, progress: null };
}

/** What he is doing, in a few words, or null when there is nothing worth saying (idle, or just walking somewhere). */
export function activityOf(state: GameState, layout: Layout): Activity | null {
  const p = state.player, t = p.task, now = state.time;
  switch (t.kind) {
    case 'sleep': {
      const until = state.needs.bed?.until;
      return { icon: null, text: typeof until === 'number' ? `Asleep until ${wakeLabel(until)}` : 'Asleep', progress: null };
    }
    case 'knockedOut': return { icon: null, text: 'Knocked out', progress: null };
    case 'raise': return { icon: skillIcon('carpentry'), text: `Building the ${thing(t.id)}`, progress: progressOf(state, t.id) };
    case 'make': return { icon: RAIL_ICONS.build ?? null, text: `Making the ${thing(t.id)}`, progress: left(t.doneAt, MAKES[t.id].time, now) };
    case 'cook': return { icon: skillIcon('cooking'), text: 'Cooking fish', progress: left(t.doneAt, COOK.time, now) };
    case 'stoke': return { icon: null, text: 'Stoking the fire', progress: null };
    case 'fight': {
      const foe = targetOf(state, layout, t.target)?.foe;
      const text = !foe ? 'Practising at the dummy' : foe.kind === 'rat' ? 'Fighting a rat' : foe.kind === 'chief' ? 'Fighting the goblin chief' : 'Fighting a goblin';
      return { icon: skillIcon('attack'), text, progress: null };
    }
    case 'gather': return nodeWords(layout, t.nodeId, false);
    case 'pickup': return pickupWords(layout, t.id);
  }
  // on his way somewhere: say what for, when there is an errand
  if (p.stoke) return { icon: null, text: 'Off to stoke the fire', progress: null };
  if (state.needs.meal) return { icon: null, text: 'Off for a bite to eat', progress: null };
  if (state.needs.bed) return { icon: null, text: 'Off to bed', progress: null };
  if (p.cook) return { icon: skillIcon('cooking'), text: p.cook.fetch ? 'Fetching fish from the chest' : 'Off to cook', progress: null };
  if (p.trip) {
    const trip = p.trip;
    if ('tool' in trip && trip.tool) return { icon: null, text: 'Fetching a tool from the chest', progress: null };
    if ('nodeId' in trip || 'pickupId' in trip) return { icon: RAIL_ICONS.backpack ?? null, text: 'Taking his load to the chest', progress: null };
    return { icon: null, text: 'Off to the chest for food', progress: null };
  }
  const go = p.pending;
  if (go?.kind === 'raise') return { icon: skillIcon('carpentry'), text: `Off to build the ${thing(go.id)}`, progress: null };
  if (go?.kind === 'make') return { icon: RAIL_ICONS.build ?? null, text: `Off to make the ${thing(go.id)}`, progress: null };
  if (go?.kind === 'node') return nodeWords(layout, go.id, true);
  if (go?.kind === 'pickup') return pickupWords(layout, go.id);
  return null;
}

/** Whether the tag shows (Settings), remembered in this browser; shown unless switched off. */
export const activityShown = {
  get(): boolean { try { return localStorage.getItem(SHOW_KEY) !== 'off'; } catch { return true; } },
  set(on: boolean): void { try { localStorage.setItem(SHOW_KEY, on ? 'on' : 'off'); } catch { /* storage blocked: it lasts until the page closes */ } },
};

/** The tag over his head. */
export class ActivityTag {
  private el = document.createElement('div');
  private words = document.createElement('span');
  private icon = document.createElement('span');
  private bar = document.createElement('span');
  private fill = document.createElement('i');
  private said = '';
  private at = new THREE.Vector3();
  /** Shown at all (the Settings switch). */
  shown = activityShown.get();

  constructor(private view: View, private layout: Layout) {
    this.el.className = 'activity'; this.el.hidden = true; this.el.setAttribute('aria-hidden', 'true');
    const row = document.createElement('span'); row.className = 'act-row';
    this.icon.className = 'act-icon';
    row.append(this.icon, this.words);
    this.bar.className = 'bar'; this.bar.append(this.fill);
    this.el.append(row, this.bar);
    document.getElementById('floats')!.append(this.el);
  }

  update(state: GameState): void {
    const a = this.shown ? activityOf(state, this.layout) : null;
    if (!a || document.querySelector('.win.note:not([hidden])') || document.querySelector('.thought.show:not([hidden])')) { this.el.hidden = true; return; }
    const p = state.player.pos, b = this.view.renderer.domElement.getBoundingClientRect();
    const v = this.at.set(p.x, ABOVE, p.z).project(this.view.cam.camera);
    const x = (v.x + 1) / 2 * b.width, y = (1 - v.y) / 2 * b.height;
    if (v.z > 1 || this.covered(b.left + x, b.top + y - 10)) { this.el.hidden = true; return; }
    const key = `${a.icon ?? ''}|${a.text}`;
    if (key !== this.said) {
      this.said = key;
      this.words.textContent = a.text;
      this.icon.innerHTML = a.icon ? `<svg class="icon" viewBox="0 0 24 24">${a.icon}</svg>` : '';
      this.icon.hidden = !a.icon;
    }
    this.bar.hidden = a.progress === null;
    if (a.progress !== null) this.fill.style.width = `${Math.round(a.progress * 100)}%`;
    this.el.hidden = false;
    const half = this.el.offsetWidth / 2 + 6;
    this.el.style.left = `${Math.min(Math.max(x, half), b.width - half)}px`;
    this.el.style.top = `${Math.max(y, this.el.offsetHeight + 6)}px`;
  }

  /** Whether an open window covers this spot (in the page's coordinates). */
  private covered(x: number, y: number): boolean {
    for (const w of document.querySelectorAll<HTMLElement>('.wins > .win:not([hidden])')) {
      const r = w.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
    }
    return false;
  }
}
