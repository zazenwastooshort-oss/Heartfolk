// The Backpack window (the UI foundation, 12 Oct 2026; opened from the Backpack button, ui/windows.ts). His 28 slots as
// a grid, 7 across and 4 down: one thing in each, as the backpack holds them (one item per slot, BACKPACK_SLOTS), each
// kind together, drawn in code (ui/pictures.ts). Tapping a thing picks it: every slot of that kind lights up, and the
// bar under the grid says what it is and how many he carries, with what he can do with it: Eat (food), Drop one and
// Drop all, so a full backpack can always be made room in where there is no bank yet (the camp); things he can't find
// again (canDrop: the wreck's planks and tarp) say so instead. Under it what he wears (ui/armour.ts fills it), then
// what is stored (the bank, or at the camp the chest once it is built, in the shelter) and the firewood pile once it
// stands, which he only looks at here: nothing is taken out of the chest by hand yet. While he carries anything, the
// Chest section's "Store everything" sends him to the chest, at the shelter's door, to put it all away (the camp
// build, D22). The Backpack button shows how many things he carries. Reads state and sends eat, drop and visit
// commands; never changes the game itself.
import { canDrop, type GameState } from '../core/state';
import type { Command } from '../systems/commands';
import type { Layout } from '../world/layout';
import type { Windows } from './windows';
import { chestHere } from '../core/camp';
import { ITEMS, TOOLS, type ToolId } from '../data/skills';
import { MAKES } from '../data/making';
import { FOOD, isFood } from '../data/food';
import { BACKPACK_SLOTS, KEEP_FOOD } from '../data/hauling';
import { WOODPILE } from '../data/fire';
import { itemName, setText } from './hud';
import { picture } from './pictures';

const $ = (id: string) => document.getElementById(id)!;

/** How many things he carries (one slot each). */
export const carried = (state: GameState) => Object.values(state.player.backpack).reduce((a, n) => a + n, 0);

/** What "Store everything" sends (the camp build, D22): to the chest at the shelter's door, where everything he carries
 *  goes into it (a few meals stay on him, KEEP_FOOD, as on any trip there), at a camp with the chest built in the
 *  shelter while he carries anything more than those meals; null for none (the button is hidden then). */
export function storeAll(state: GameState, layout: Layout): Command | null {
  const pack = state.player.backpack, meals = Object.keys(FOOD).reduce((a, f) => a + (pack[f] ?? 0), 0);
  return layout.camp && chestHere(state, layout) && carried(state) > Math.min(KEEP_FOOD, meals) ? { type: 'visit', id: 'chest' } : null;
}

/** The slots as the window shows them: one thing in each (an item id), each kind together in the order he first put it
 *  in, then the empty ones (null). Always `slots` long; more than fit (never in play) are left out. */
export function slotsOf(backpack: Record<string, number>, slots = BACKPACK_SLOTS): (string | null)[] {
  const out: (string | null)[] = [];
  for (const [id, n] of Object.entries(backpack)) for (let i = 0; i < Math.floor(n) && out.length < slots; i++) out.push(id);
  while (out.length < slots) out.push(null);
  return out;
}

/** A word or two more for things that can't be eaten as they are, so the missing Eat button makes sense (`one`: he
 *  carries just one). */
const NOTES: Record<string, (one: boolean) => string> = {
  raw_fish: one => `Cook ${one ? 'it' : 'them'} at the campfire first.`,
  burnt_fish: () => 'Too burnt to eat.',
};

/** What the bar under the slots says about a thing he carries: its name ("Birch logs", or "Birch log" for one), how
 *  many he carries and what it is good for (food: how much each heals), and what he can do with it: eat it (food),
 *  drop one or all of it, or nothing, with why (things from the wreck he won't find again). */
export interface ItemInfo { name: string; note: string; eat: boolean; drop: boolean }

/** Why he keeps something that isn't the wreck's (canDrop says he can't drop it). */
const KEEPS: Record<string, string> = { old_map: 'It shows the way along the river, so you keep it.' };

export function itemInfo(id: string, n: number): ItemInfo {
  const item = ITEMS[id], name = (n === 1 && item?.one) || item?.name || id, one = n === 1;
  const words = [`${n.toLocaleString()} in your backpack.`];
  if (isFood(id)) words.push(`${one ? 'It heals' : 'Each heals'} ${FOOD[id]!.heals}.`);
  else if (Object.hasOwn(NOTES, id)) words.push(NOTES[id]!(one));
  const drop = canDrop(id);
  if (!drop) words.push(Object.hasOwn(KEEPS, id) ? KEEPS[id]! : `From the wreck: you won't find ${one ? 'another' : 'more'}, so you keep ${one ? 'it' : 'them'}.`);
  return { name, note: words.join(' '), eat: isFood(id), drop };
}

/** What is stored (the bank, or the chest), kind by kind: its id and its words, "22 birch logs". */
export const storedList = (items: Record<string, number>): { id: string; text: string }[] =>
  Object.entries(items).filter(([, n]) => n > 0).map(([id, n]) => ({ id, text: `${n.toLocaleString()} ${itemName(id, n)}` }));

/** The firewood pile's words: how many logs, and how many it holds. */
export const pileText = (logs: number) => `${logs} / ${WOODPILE.max} logs`;

export class BackpackWindow {
  private grid = $('packList');
  private badge = $('packBadge');
  private slots: HTMLButtonElement[] = [];
  private hasBank: boolean;
  /** the kind picked (tapped), whose slots light up and whose bar shows; null for none */
  private picked: string | null = null;
  /** what the grid, the bar and the stored list were last drawn from, so each is redrawn only on a change */
  private drawn: string | null = null;
  private storedDrawn: string | null = null;
  /** how many of the picked thing he carries, for Drop all */
  private carriedNow = 0;
  /** a thing was just picked: its bar is brought into sight once drawn */
  private reveal = false;
  /** what Store everything sends now, or null while it is hidden */
  private storeCmd: Command | null = null;

  constructor(private windows: Windows, private queue: Command[], private layout: Layout) {
    // what is stored where: the bank in the village, the storage chest at the camp
    this.hasBank = layout.buildings.some(b => b.kind === 'bank');
    $('bankName').textContent = this.hasBank ? 'Bank' : 'Chest';
    for (let i = 0; i < BACKPACK_SLOTS; i++) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pack-slot'; b.disabled = true; b.dataset.item = '';
      this.slots.push(b);
    }
    this.grid.replaceChildren(...this.slots);
    this.grid.tabIndex = -1;              // keyboard focus can rest on the grid when nothing is left to pick (keepFocus)
    // a tap on a thing picks it, a tap on it again (or on one of its kind) lets it go
    this.grid.addEventListener('click', e => {
      const id = (e.target as Element).closest<HTMLButtonElement>('.pack-slot')?.dataset.item;
      if (!id) return;
      this.picked = this.picked === id ? null : id;
      this.reveal = this.picked !== null;
      this.drawn = null;
    });
    // opened afresh with nothing picked
    windows.on(id => { if (id === 'backpack') { this.picked = null; this.drawn = null; this.storedDrawn = null; } });
    for (const [button, act] of [['pickEat', 'eat'], ['pickDrop1', 'one'], ['pickDropAll', 'all']] as const) {
      $(button).addEventListener('click', () => this.act(act));
    }
    // Store everything: off to the chest with all he carries
    $('storeAll').addEventListener('click', () => { if (this.storeCmd) this.queue.push({ ...this.storeCmd }); });
  }

  /** The picked thing's buttons: eat one, drop one, or drop all of it (the same commands as ever). */
  private act(what: 'eat' | 'one' | 'all'): void {
    const item = this.picked;
    if (!item) return;
    if (what === 'eat') this.queue.push({ type: 'eat', item });
    else this.queue.push({ type: 'drop', item, count: what === 'one' ? 1 : this.carriedNow });
  }

  /** The grid and the bar under it, redrawn when what he carries (or what is picked) changed. */
  private draw(state: GameState): void {
    const pack = state.player.backpack;
    if (this.picked && !((pack[this.picked] ?? 0) > 0)) this.picked = null;    // eaten or dropped, all of it
    const key = `${JSON.stringify(pack)}|${this.picked}`;
    if (key === this.drawn) return;
    this.drawn = key;
    slotsOf(pack).forEach((id, i) => {
      const b = this.slots[i]!, item = id ?? '';
      if (b.dataset.item !== item) {
        const name = id ? ITEMS[id]?.one ?? ITEMS[id]?.name ?? id : 'Empty slot';
        b.dataset.item = item; b.disabled = !id; b.innerHTML = id ? picture(id) : '';
        b.setAttribute('aria-label', name);
        b.title = id ? name : '';
      }
      const on = !!id && id === this.picked;
      b.classList.toggle('on', on);
      if (id) b.setAttribute('aria-pressed', String(on)); else b.removeAttribute('aria-pressed');
    });
    // the bar: the picked thing, or how to pick one
    const id = this.picked, n = id ? pack[id] ?? 0 : 0;
    this.carriedNow = n;
    $('packPick').classList.toggle('picked', !!id);
    $('pickPic').innerHTML = id ? picture(id) : '';
    if (!id) {
      setText($('pickName'), carried(state) ? 'Tap something to eat or drop it.' : 'Your backpack is empty.');
      setText($('pickNote'), '');
      for (const b of ['pickEat', 'pickDrop1', 'pickDropAll']) $(b).hidden = true;
      return;
    }
    const info = itemInfo(id, n);
    setText($('pickName'), info.name);
    setText($('pickNote'), info.note);
    $('pickEat').hidden = !info.eat;
    $('pickDrop1').hidden = !info.drop;
    $('pickDropAll').hidden = !info.drop || n < 2;
    // just picked: the bar and its buttons come into sight (a phone held sideways has room for little more than the grid)
    if (this.reveal) {
      this.reveal = false;
      const body = this.grid.closest<HTMLElement>('.win-body'), bar = $('packPick');
      const below = body ? bar.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom + 12 : 0;
      if (body && below > 0) body.scrollTop += below;
    }
  }

  /** A button of the bar under the grid had keyboard focus and is gone now (all of the thing eaten or dropped, or
   *  Drop all with one left): focus moves to the bar's first button still there, else the first thing in the grid,
   *  else the grid itself, rather than being lost to the page. */
  private keepFocus(had: Element | null): void {
    if (!(had instanceof HTMLElement) || had.getClientRects().length) return;
    const shown = (b: HTMLElement) => b.getClientRects().length > 0;
    const next = [...$('packPick').querySelectorAll<HTMLButtonElement>('button')].find(shown) ?? this.slots.find(b => !b.disabled) ?? this.grid;
    next.focus({ preventScroll: true });
  }

  /** What is stored (the bank, or the chest once it stands in the shelter) and the firewood pile, each with its
   *  pictures; Store everything while he carries anything to put in the chest. */
  private drawStored(state: GameState): void {
    const camp = !!this.layout.camp, chest = this.hasBank || (camp && chestHere(state, this.layout));
    const pile = camp && state.built.includes('woodpile');
    this.storeCmd = storeAll(state, this.layout);
    const key = `${chest ? JSON.stringify(state.bank) : '-'}|${pile ? state.woodpile : '-'}|${state.toolsInChest.join()}|${!!this.storeCmd}`;
    if (key === this.storedDrawn) return;
    this.storedDrawn = key;
    $('bankRow').hidden = !chest;
    $('storeAll').hidden = !this.storeCmd;
    if (chest) {
      // (13 Oct 2026) the tools kept in the chest, then what is stored
      const list = [...state.toolsInChest.map(t => ({ id: t as string, text: toolName(t) })), ...storedList(state.bank)];
      $('bank').replaceChildren(...(list.length ? list.map(({ id, text }) => chip(id, text)) : [Object.assign(document.createElement('small'), { textContent: 'Empty.' })]));
    }
    $('pileRow').hidden = !pile;
    if (pile) $('pile').replaceChildren(chip('birch_logs', pileText(state.woodpile)));
  }

  update(state: GameState): void {
    // the button's count, always; amber once the backpack is full
    const n = carried(state), full = n >= BACKPACK_SLOTS;
    this.badge.hidden = n === 0;
    setText(this.badge, String(n));
    this.badge.classList.toggle('full', full);
    if (!this.windows.isOpen('backpack')) return;
    setText($('packCount'), `${n} / ${BACKPACK_SLOTS}`);
    $('packHead').classList.toggle('full', full);
    const focused = $('packPick').contains(document.activeElement) ? document.activeElement : null;
    this.draw(state);
    this.keepFocus(focused);
    this.drawStored(state);
  }
}

/** A tool's name as he made it (the stone axe at the camp), else as TOOLS has it. */
export const toolName = (t: ToolId) => Object.values(MAKES).find(m => m.gives.kind === 'tool' && m.gives.tool === t)?.name ?? TOOLS[t].name;

/** A stored thing: its picture and its words ("22 birch logs"). */
function chip(id: string, text: string): HTMLElement {
  const el = document.createElement('span');
  el.className = 'pack-chip';
  el.innerHTML = picture(id);
  el.append(text);
  return el;
}
