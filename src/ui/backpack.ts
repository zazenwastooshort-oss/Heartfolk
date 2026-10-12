// What is in the backpack, opened by tapping the backpack row in the panel: each thing he carries, how many, and
// buttons to drop one or all of it, so a full backpack can always be made room in where there is no bank yet (the
// camp). Things he can't find again (canDrop: the wreck's planks and tarp) say so instead of offering a drop. Food
// (chapter 2: berries, cooked fish) has an Eat button too. Reads state and sends drop and eat commands; never changes
// the game itself.
import { canDrop, type GameState } from '../core/state';
import type { Command } from '../systems/commands';
import { ITEMS } from '../data/skills';
import { isFood } from '../data/food';

const $ = (id: string) => document.getElementById(id)!;

export class BackpackList {
  private toggle = $('pack') as HTMLButtonElement;
  private list = $('packList');
  private built: string | null = null;     // the backpack the list was last built from, so it is rebuilt only on a change

  constructor(private queue: Command[]) {
    this.toggle.addEventListener('click', () => this.open(this.toggle.getAttribute('aria-expanded') !== 'true'));
    this.list.addEventListener('keydown', e => { if (e.key === 'Escape') { this.open(false); this.toggle.focus(); } });
  }

  private open(yes: boolean): void {
    this.list.hidden = !yes; this.toggle.setAttribute('aria-expanded', String(yes)); this.built = null;
    this.toggle.parentElement?.classList.toggle('wide', yes);
  }

  private row(item: string, n: number): HTMLElement {
    const row = document.createElement('div'); row.className = 'prow';
    const name = document.createElement('span'); name.className = 'pname';
    name.textContent = (n === 1 && ITEMS[item]?.one) || ITEMS[item]?.name || item;
    const count = document.createElement('b'); count.textContent = n.toLocaleString();
    row.append(name, count);
    if (isFood(item)) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Eat';
      b.addEventListener('click', () => this.queue.push({ type: 'eat', item }));
      row.append(b);
    }
    if (!canDrop(item)) {
      const keep = document.createElement('small'); keep.textContent = "can't drop";
      keep.title = 'There is no other like it, so he keeps it.';
      row.append(keep);
      return row;
    }
    for (const [label, drop] of [['Drop 1', 1], ['Drop all', n]] as const) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.addEventListener('click', () => this.queue.push({ type: 'drop', item, count: drop }));
      row.append(b);
    }
    return row;
  }

  update(state: GameState): void {
    if (this.list.hidden) return;
    const items = Object.entries(state.player.backpack).filter(([, n]) => n > 0), key = JSON.stringify(items);
    if (key === this.built) return;
    this.built = key;
    this.list.replaceChildren(...(items.length ? items.map(([item, n]) => this.row(item, n)) : [Object.assign(document.createElement('small'), { textContent: 'Empty.' })]));
  }
}
