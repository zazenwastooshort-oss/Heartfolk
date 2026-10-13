// Discovery's notice (game 0.0.38; the brief's In 3 and D5): "Discovered: copper ore." once for each thing he finds
// (the 'discovered' event, systems/discovery.ts; never for what a new game starts with or an old save is given), in the
// names the game writes them with. Several found at once (a tap on the fire: the campfire and cooked fish) share one
// notice. The tap that found it often has its own notice in the same moment ("You need a pickaxe to mine rocks."):
// that one keeps its words, with the discovery after them; a notice still up from before is let finish first, so
// neither is lost. Listens to events; changes nothing in the game. (The Discovery window itself comes next, in this
// file or beside it.)
import type { EventBus } from '../core/events';
import type { Hud } from './hud';
import { NODES } from '../data/discovery';

/** How many things one notice names before it says how many more. */
const NAMED = 3;

/** The notice for things found together: "Discovered: copper ore.", "Discovered: campfire and cooked fish.", and past
 *  NAMED of them, "Discovered: planks, stones and 3 more." */
export function discoveredText(ids: string[]): string {
  const names = ids.map(id => (NODES[id]?.name ?? id).toLowerCase());
  const shown = names.length > NAMED ? [...names.slice(0, NAMED - 1), `${names.length - (NAMED - 1)} more`] : names;
  const list = shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}` : shown[0] ?? '';
  return `Discovered: ${list}.`;
}

export class DiscoveryNotices {
  /** found since the last notice of them, in order */
  private waiting: string[] = [];
  /** the notice's words as they were at the end of the last frame, to tell one that came up this frame */
  private seen = '';

  constructor(events: EventBus, private hud: Hud) {
    events.on(e => { if (e.type === 'discovered' && !this.waiting.includes(e.id)) this.waiting.push(e.id); });
  }

  /** Once a frame, after the HUD's own notices: shows what was found, as said at the top. */
  update(): void {
    const el = document.getElementById('notice'), up = !!el?.classList.contains('show'), now = el?.textContent ?? '';
    if (this.waiting.length) {
      const text = discoveredText(this.waiting);
      if (!up) { this.hud.notice(text); this.waiting = []; }
      else if (now !== this.seen) { this.hud.notice(`${now} ${text}`); this.waiting = []; }
    }
    this.seen = el?.textContent ?? '';
  }
}
