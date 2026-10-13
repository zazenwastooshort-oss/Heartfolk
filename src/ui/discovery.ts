// Discovery (game 0.0.38; the brief: docs/plans/2026-10-13-discovery.md; the owner, 13 Oct 2026: "I think lets call it
// discovery now, and as u click an object thats when u discover it and at that point u can access recepies so its
// really like a tree"). Two parts, both drawn from core/discovery.ts, both changing nothing in the game:
//
// The notice (In 3, D5): "Discovered: copper ore." once for each thing he finds (the 'discovered' event,
// systems/discovery.ts; never for what a new game starts with or an old save is given), in the names the game writes
// them with. Several found at once (a tap on the fire: the campfire and cooked fish) share one notice. The tap that found
// it often has its own notice in the same moment ("You need a pickaxe to mine rocks."): that one keeps its words, with
// the discovery after them; a notice still up from before is let finish first, so neither is lost.
//
// The window (In 2, D3, D4, D9), in the Book's place in the row of buttons: the tree, like Minecraft's advancements.
// Each node is a picture (ui/pictures.ts) with its name under it, in columns by depth and three bands (the camp, food,
// fighting), joined by lines (one SVG under the nodes): found things lit (made ones marked made), the recipes they open
// glowing, an input not found yet a "?". The tree scrolls and pans (a mouse drags it, a finger or a wheel scrolls it;
// on a phone it scrolls sideways), and opens centred on the current goal's node, else the newest thing found. Tapping a
// node opens its card beside the tree (under it on a phone held upright): the book's words for it, its recipe with how
// many he has of each ("?" for what he hasn't found), what it is made with, where, where it and its materials come from,
// what it is used for (each a link to that node), and for food how much it heals. Keyboard: Tab goes through the nodes,
// Enter opens a card, Left and Right follow the lines (to what it leads to, and back to what leads to it), Up and Down go
// to the node above or below in the same column, Esc closes the card and then the window. While open it redraws only
// when what shows changes (core/discovery.ts hands out the same tree object until then; the card when its words do).
// A dot on its button while something found hasn't been seen in the window yet (as the Book's dot did; what an opened
// save had counts as seen), and a dot on each thing found since the window was last opened.
import type { EventBus } from '../core/events';
import type { Hud } from './hud';
import type { Windows } from './windows';
import type { Layout } from '../world/layout';
import { allGoalsDone, currentGoal, type GameState } from '../core/state';
import { discoveryTree, nodeCard, type CardInput, type DiscoveryTree, type NodeCard, type NodeState, type TreeLine, type TreeNode } from '../core/discovery';
import { NODES, goalThings, type Band, type JoinHow, type NodeKind } from '../data/discovery';
import { makeDef } from '../data/making';
import { CLOSE_ICON, picture } from './pictures';

// ---- the notice ----

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

// ---- the tree, drawn ----

/** The tree's grid as drawn (px): a column's width and a row's height; a node's square tile (its middle on the row) and
 *  its name under it (the bottom of the name at most `nameBottom` below the row, at the largest text size); the strip
 *  at the top of each band for its name; the room between two bands and round the edge. index.html's .dn rules draw a
 *  node to these sizes (tests/discovery-window.test.ts checks they agree). */
export const GRID = { col: 120, row: 88, tile: 48, nameBottom: 45, head: 26, gap: 6, padX: 16, padY: 6 } as const;
/** A node's width: its column, less a little room either side. */
export const NODE_W = GRID.col - 8;
/** Half a line's straight run across a column: as wide as a tile and a little more, so it meets a node at its edge. */
const RUN = GRID.tile / 2 + 2;

/** The bands' names, as their strips say them (D4). */
export const BAND_NAMES: Record<Band, string> = { camp: 'Camp', food: 'Food', fighting: 'Fighting' };

/** The tree's place on the page: its size, each band's box (px from the top) and the height of every row's middle. */
export interface MapPlan { width: number; height: number; bands: { band: Band; top: number; height: number }[]; rowY: number[] }

/** Where everything goes for `tree`: the bands one under another, each a strip for its name and then its rows. */
export function planMap(tree: DiscoveryTree): MapPlan {
  const rowY: number[] = [], bands: MapPlan['bands'] = [];
  let y = GRID.padY;
  for (const b of tree.bands) {
    const height = GRID.head + b.rows * GRID.row;
    for (let r = 0; r < b.rows; r++) rowY[b.top + r] = y + GRID.head + r * GRID.row + GRID.tile / 2 + 6;
    bands.push({ band: b.band, top: y, height });
    y += height + GRID.gap;
  }
  return { width: tree.cols ? 2 * GRID.padX + tree.cols * GRID.col : 0, height: tree.bands.length ? y - GRID.gap + GRID.padY : 0, bands, rowY };
}

/** The middle of a column (px from the left of the tree). */
export const colX = (col: number) => GRID.padX + col * GRID.col + GRID.col / 2;

/** The height of a row (px from the top of the tree): a whole row's middle, or for a half row (x.5, where a line passes
 *  between two nodes of a column) the middle of the room between the name of the node above and the tile of the one
 *  below (above the first row and below the last, just clear of them). */
export function rowAt(plan: MapPlan, row: number): number {
  if (Number.isInteger(row)) return plan.rowY[row]!;
  const above = Math.floor(row), below = above + 1, last = plan.rowY.length - 1;
  if (above < 0) return plan.rowY[0]! - GRID.tile / 2 - 12;
  if (below > last) return plan.rowY[last]! + GRID.nameBottom + 10;
  return (plan.rowY[above]! + GRID.nameBottom + plan.rowY[below]! - GRID.tile / 2) / 2;
}

/** A node's box on the tree (px): its tile and its name under it. */
export function nodeBox(plan: MapPlan, n: { col: number; row: number }) {
  const x = colX(n.col), y = plan.rowY[n.row]!;
  return { left: x - NODE_W / 2, right: x + NODE_W / 2, top: y - GRID.tile / 2, bottom: y + GRID.nameBottom, x, y };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** A line's path (SVG): straight across each column it passes, at its point there (core/discovery.ts never puts that on
 *  a node), and an easy S between columns; it leaves its first node at the tile's right edge and meets the last at its
 *  left. */
export function linePath(plan: MapPlan, line: TreeLine): string {
  const pts = line.points.map(p => [colX(p.col), rowAt(plan, p.row)] as const);
  const bend = (GRID.col - 2 * RUN) / 2;
  let d = `M${r1(pts[0]![0] + RUN)} ${r1(pts[0]![1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!, [x1, y1] = pts[i]!;
    const a = x0 + RUN, b = x1 - RUN;
    d += `C${r1(a + bend)} ${r1(y0)} ${r1(b - bend)} ${r1(y1)} ${r1(b)} ${r1(y1)}`;
    if (i < pts.length - 1) d += `H${r1(x1 + RUN)}`;
  }
  return d;
}

/** How a line looks: lit between two things found, glowing into something not found yet, faint to or from a "?". */
export function lineLook(from: NodeState, to: NodeState): 'lit' | 'glow' | 'dim' {
  if (from === 'unknown' || to === 'unknown') return 'dim';
  return from === 'glow' || to === 'glow' ? 'glow' : 'lit';
}

/** A node's picture: its own (an item, a building), the tool's or the gear's for what makes them. */
export function nodePicture(id: string, className = 'item-pic'): string {
  const d = makeDef(id);
  if (d?.gives.kind === 'tool') return picture(d.gives.tool, className);
  if (d?.gives.kind === 'gear') return picture(d.gives.gear, className);
  return picture(id, className);
}

/** The node the window opens centred on: the current goal's (what it makes, or else what it asks for) while the tree
 *  shows it, else the newest thing found that the tree shows; null while the tree is empty. */
export function openingNode(state: GameState, tree: DiscoveryTree): string | null {
  const shown = new Set(tree.nodes.map(n => n.id));
  if (!allGoalsDone(state)) {
    const goal = goalThings(currentGoal(state)).find(id => shown.has(id));
    if (goal) return goal;
  }
  return [...state.discovered].reverse().find(id => shown.has(id)) ?? tree.nodes[0]?.id ?? null;
}

export type Arrow = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';
export const ARROWS: readonly string[] = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

/** Where an arrow key goes from node `id` (null for nowhere): Right along a line to what it leads to, Left back along one
 *  to what leads to it (of several, the nearest in height, the upper on a tie); Up and Down to the next node above or
 *  below in the same column. */
export function arrowTarget(tree: DiscoveryTree, id: string, key: Arrow): string | null {
  const at = tree.nodes.find(n => n.id === id);
  if (!at) return null;
  const byId = new Map(tree.nodes.map(n => [n.id, n]));
  const nearest = (list: TreeNode[]) => list.sort((a, b) => Math.abs(a.row - at.row) - Math.abs(b.row - at.row) || a.row - b.row)[0]?.id ?? null;
  if (key === 'ArrowRight') return nearest(tree.lines.filter(l => l.from === id).map(l => byId.get(l.to)!));
  if (key === 'ArrowLeft') return nearest(tree.lines.filter(l => l.to === id).map(l => byId.get(l.from)!));
  return nearest(tree.nodes.filter(n => n.col === at.col && (key === 'ArrowUp' ? n.row < at.row : n.row > at.row)));
}

/** What the window has shown, for the dots: how many things he had found when it last showed them (`seen`; the things
 *  an opened save had count as seen), and from which of them (`newFrom`, in the order found) a node is new in the
 *  window opened now. */
export class SeenCount {
  newFrom = Infinity;
  constructor(public seen: number) {}
  /** The window opens with `found` things found: those since it last showed them are new this time. */
  open(found: number): void { this.newFrom = this.seen; this.seen = found; }
  /** While the window is open everything found is seen. */
  showing(found: number): void { this.seen = Math.max(this.seen, found); }
  /** The button's dot: something found that the window hasn't shown yet. */
  dot(found: number): boolean { return found > this.seen; }
}

// ---- the card ----

/** What the card calls a thing by its kind. */
export const KIND_WORDS: Record<NodeKind, string> = { material: 'Material', food: 'Food', tool: 'Tool', gear: 'Gear', building: 'Building' };
/** What the card calls what a thing is made, gathered, won or cooked with but never uses up, by how it joins. */
export const WITH_WORDS: Record<Exclude<JoinHow, 'needs'>, string> = {
  gathers: 'Gathered with', drops: 'Won in a fight with', cooks: 'Cooked at', upgrade: 'Built in place of', inside: 'Stands in',
};

/** One line of a card's recipe: its name ("?" for one not found yet), how many he has of how many ("18 / 30"; nothing
 *  for what isn't used up), and whether it is ticked: enough of it, or made, or the thing itself made or begun already
 *  (what it needed was taken: every line ticked, as the book did). */
export function inputLine(input: CardInput, paid: boolean): { name: string; count: string; done: boolean } {
  const name = input.name ?? '?';
  if (input.need === null) return { name, count: '', done: paid || input.have > 0 };
  return { name, count: `${input.have} / ${input.need}`, done: paid || input.have >= input.need };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** The "?" drawn for a thing not found yet, in a tile or a line of a card. */
const QUESTION = '<b class="dc-q" aria-hidden="true">?</b>';

/** A node's card, as markup for the card's place in the window (see the top of this file). `shown`: the nodes the tree
 *  shows, so a line or a name of one of them is a link to it (`data-go`). */
export function cardHtml(card: NodeCard, shown: ReadonlySet<string>): string {
  const unknown = card.state === 'unknown';
  const mini = (id: string, q: boolean) => `<span class="dc-mini" aria-hidden="true">${q ? QUESTION : nodePicture(id)}</span>`;
  const said = (name: string) => (name === '?' ? 'Something not found yet' : name);
  const state = card.state === 'made' ? `<span class="dc-state made">${card.kind === 'building' ? 'Built' : 'Made'}</span>`
    : unknown || card.state === 'found' ? '' : '<span class="dc-state">Not found yet</span>';
  const out = [
    `<div class="dc-head"><span class="dc-pic" aria-hidden="true">${unknown ? QUESTION : nodePicture(card.id)}</span>` +
    `<div class="dc-names"><h3 class="dc-name" id="discCardName">${esc(unknown ? 'Not found yet' : card.name)}</h3>` +
    `${unknown ? '' : `<span class="dc-kind">${KIND_WORDS[card.kind]}</span>`}${state}</div>` +
    `<button class="win-x dc-x" type="button" aria-label="Close the card"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${CLOSE_ICON}</svg></button></div>`,
  ];
  const sec = (title: string) => `<h4 class="dc-sec">${esc(title)}</h4>`;
  const links = (list: { id: string; name: string }[]) => `<div class="dc-links">${list.map(u =>
    `<button class="dc-link" type="button" data-go="${esc(u.id)}" aria-label="${esc(said(u.name))}">${mini(u.id, u.name === '?')}<span>${esc(u.name)}</span></button>`).join('')}</div>`;
  if (unknown) {
    out.push('<p class="dc-text">Something you haven\'t come across yet.</p>');
    if (card.usedIn.length) out.push(sec('Used for'), links(card.usedIn));
    return out.join('');
  }
  const facts: string[] = [];
  if (card.heals !== null) facts.push(`Heals ${card.heals}.`);
  if (card.owned !== null && card.state !== 'glow') facts.push(card.owned > 0 ? `You have ${card.owned.toLocaleString()}.` : 'You have none just now.');
  if (facts.length) out.push(`<p class="dc-facts">${facts.join(' ')}</p>`);
  for (const w of card.words) {
    out.push(w.title === null ? `<p class="dc-note">${esc(w.text)}</p>` : `<h4 class="dc-title">${esc(w.title)}</h4><p class="dc-text">${esc(w.text)}</p>`);
  }
  const row = (i: CardInput) => {
    const line = inputLine(i, card.paid);
    const inner = `<span class="tick${line.done ? ' done' : ''}" aria-hidden="true"></span>${mini(i.id, i.name === null)}` +
      (i.name === null ? '<span class="dc-what unseen">Not found yet</span>' : `<span class="dc-what">${esc(line.name)}</span>`) +
      `<span class="dc-count">${line.count}</span>`;
    const label = `${said(line.name)}${line.count ? `: ${i.have} of ${i.need}` : ''}${line.done ? ', done' : ''}`;
    return shown.has(i.id) ? `<li><button class="dc-row" type="button" data-go="${esc(i.id)}" aria-label="${esc(label)}">${inner}</button></li>`
      : `<li><div class="dc-row">${inner}</div></li>`;
  };
  if (card.needs.length) out.push(sec('Needs'), `<ul class="dc-list">${card.needs.map(row).join('')}</ul>`);
  for (const how of [...new Set(card.with.map(i => i.how))] as Exclude<JoinHow, 'needs'>[]) {
    const group = card.with.filter(i => i.how === how);
    out.push(sec(`${WITH_WORDS[how]}${group.length === 2 ? ' (either will do)' : group.length > 2 ? ' (any will do)' : ''}`),
      `<ul class="dc-list">${group.map(row).join('')}</ul>`);
  }
  if (card.where) out.push(`<p class="dc-where">${esc(card.where)}</p>`);
  if (card.from.length) out.push(sec(card.from.length > 1 ? 'Where to find them' : 'Where to find it'), `<ul class="dc-from">${card.from.map(f => `<li>${esc(f)}</li>`).join('')}</ul>`);
  if (card.usedIn.length) out.push(sec('Used for'), links(card.usedIn));
  return out.join('');
}

// ---- the window ----

const $ = (id: string) => document.getElementById(id)!;
/** A phone held upright: the card goes under the tree (index.html's .disc rules). */
const UPRIGHT = matchMediaOr('(max-width: 600px)');
function matchMediaOr(query: string): { matches: boolean } {
  return typeof matchMedia === 'function' ? matchMedia(query) : { matches: false };
}

export class DiscoveryWindow {
  private camp: boolean;
  private counts: SeenCount;
  private dot = false;
  private tree: DiscoveryTree | null = null;     // the tree drawn
  private plan: MapPlan | null = null;
  private nodes = new Map<string, HTMLButtonElement>();
  private inners = new Map<string, string>();    // what each node's button was last filled with
  private selected: string | null = null;        // the node whose card is open
  private cardKey = '';                          // what the card was drawn from, so it is drawn again only on a change
  private lastOpened: string | null = null;      // the window opened last (Esc closes the card only while it is this one)
  private drag: { id: number; x: number; y: number; left: number; top: number; moved: boolean } | null = null;
  private dragged = false;                       // a drag just panned the tree: the click that ends it does nothing
  private win = $('discoveryWin');
  private body = $('discBody');
  private scroller = $('discTree');
  private map = $('discMap');
  private lines = $('discLines') as unknown as SVGSVGElement;
  private bandsEl = $('discBands');
  private empty = $('discEmpty');
  private side = $('discSide');
  private hint = $('discHint');
  private card = $('discCard');
  private button = document.querySelector<HTMLButtonElement>('[data-opens="discovery"]');

  constructor(private state: GameState, private layout: Layout, private windows: Windows) {
    this.camp = !!layout.camp;
    this.counts = new SeenCount(state.discovered.length);
    windows.setAvailable('discovery', this.camp);        // the camp's, like his thoughts (shown from a new game)
    if (!this.camp) return;
    windows.on((id, open) => {
      if (open) this.lastOpened = id;
      if (id === 'discovery' && open) this.opened();
    });
    // Esc closes the card first, then (windows.ts) the window: only while focus is in it or it was opened last
    const before = windows.escape;
    windows.escape = () => before() || this.escape();

    this.map.addEventListener('click', e => {
      const b = (e.target as Element).closest<HTMLButtonElement>('.dn');
      if (b?.dataset.id) this.select(b.dataset.id);
    });
    this.card.addEventListener('click', e => {
      const t = e.target as Element;
      if (t.closest('.dc-x')) { this.closeCard(); return; }
      const go = t.closest<HTMLElement>('[data-go]')?.dataset.go;
      if (go) this.go(go);
    });
    // the arrow keys follow the lines from a node (and keep the camera still: ui/input.ts hears them on the way up)
    this.map.addEventListener('keydown', e => {
      if (!ARROWS.includes(e.key)) return;
      const from = (e.target as Element).closest<HTMLButtonElement>('.dn')?.dataset.id;
      if (!from || !this.tree) return;
      e.preventDefault(); e.stopPropagation();
      const to = arrowTarget(this.tree, from, e.key as Arrow);
      if (!to) return;
      this.nodes.get(to)?.focus({ preventScroll: true });
      this.reveal(to, false);
      if (this.selected) this.select(to);
    });
    this.pan();
  }

  /** Dragging with a mouse pans the tree (a finger and a wheel scroll it as any scrolling box does); a wheel with no
   *  room to scroll up and down scrolls it sideways. */
  private pan(): void {
    const s = this.scroller;
    s.addEventListener('pointerdown', e => {
      this.dragged = false;
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: s.scrollLeft, top: s.scrollTop, moved: false };
    });
    s.addEventListener('pointermove', e => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.moved) {
        if (Math.hypot(dx, dy) < 5) return;
        d.moved = true;
        try { s.setPointerCapture(e.pointerId); } catch { /* gone already */ }
        s.classList.add('panning');
      }
      s.scrollLeft = d.left - dx; s.scrollTop = d.top - dy;
    });
    const end = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      this.dragged = d.moved; this.drag = null;
      s.classList.remove('panning');
    };
    s.addEventListener('pointerup', end);
    s.addEventListener('pointercancel', end);
    s.addEventListener('click', e => { if (this.dragged) { this.dragged = false; e.stopPropagation(); e.preventDefault(); } }, true);
    s.addEventListener('wheel', e => {
      if (e.ctrlKey || e.shiftKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      if (s.scrollHeight > s.clientHeight + 1 || s.scrollWidth <= s.clientWidth + 1) return;
      s.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 32 : 1);
      e.preventDefault();
    }, { passive: false });
  }

  /** The window opened: no card, everything found so far seen, centred on the goal's node (or the newest found). */
  private opened(): void {
    this.counts.open(this.state.discovered.length);
    this.closeCard();
    this.tree = null;
    this.drawTree(discoveryTree(this.state, this.layout), false);
    const at = this.tree ? openingNode(this.state, this.tree) : null;
    if (at) this.reveal(at, true, true);
    this.markDot();
  }

  private escape(): boolean {
    if (!this.selected || !this.windows.isOpen('discovery')) return false;
    if (!this.win.contains(document.activeElement) && this.lastOpened !== 'discovery') return false;
    this.closeCard();
    return true;
  }

  /** Open `id`'s card (or show another's in it). */
  private select(id: string): void {
    const changed = this.selected !== id;
    this.selected = id;
    if (changed) { this.cardKey = ''; this.side.scrollTop = 0; }
    this.card.hidden = false; this.hint.hidden = true;
    this.body.classList.add('carded');
    this.mark();
    this.drawCard();
    if (UPRIGHT.matches) this.reveal(id, false);         // the tree is shorter now, with the card under it
  }

  /** A link on the card: that node's card, the node in view and focused. */
  private go(id: string): void {
    if (!this.nodes.has(id)) return;
    this.select(id);
    this.nodes.get(id)!.focus({ preventScroll: true });
    this.reveal(id, false);
  }

  private closeCard(): void {
    const was = this.selected, inside = this.side.contains(document.activeElement);
    this.selected = null; this.cardKey = '';
    this.card.hidden = true; this.hint.hidden = false;
    this.body.classList.remove('carded');
    this.mark();
    // keyboard focus goes back to the node the card was of, rather than being lost with the card
    if (inside && was) this.nodes.get(was)?.focus({ preventScroll: true });
  }

  /** Scroll the tree so node `id` is in view: centred (`centre`), or only moved enough to bring it in. */
  private reveal(id: string, centre: boolean, instant = false): void {
    const n = this.tree?.nodes.find(t => t.id === id);
    if (!n || !this.plan) return;
    const s = this.scroller, box = nodeBox(this.plan, n);
    const x = this.map.offsetLeft + box.x, y = this.map.offsetTop + (box.top + box.bottom) / 2;
    const w = s.clientWidth, h = s.clientHeight, margin = 16;
    const inView = box.left + this.map.offsetLeft >= s.scrollLeft + margin && box.right + this.map.offsetLeft <= s.scrollLeft + w - margin &&
      box.top + this.map.offsetTop >= s.scrollTop + margin && box.bottom + this.map.offsetTop <= s.scrollTop + h - margin;
    if (!centre && inView) return;
    const smooth = !instant && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    s.scrollTo({ left: x - w / 2, top: y - h / 2, behavior: smooth ? 'smooth' : 'auto' });
  }

  /** Draw `tree` (a new set of nodes or states), keeping what the tree showed where it was: the open card's node (or
   *  the focused one) stays at the same place on the screen. */
  private drawTree(tree: DiscoveryTree, keep = true): void {
    const s = this.scroller, focused = (document.activeElement as HTMLElement | null)?.closest?.<HTMLElement>('.dn')?.dataset.id ?? null;
    const anchor = keep ? this.selected ?? focused : null;
    const oldAt = anchor && this.plan && this.tree ? this.tree.nodes.find(n => n.id === anchor) : undefined;
    const before = oldAt && this.plan ? nodeBox(this.plan, oldAt) : null;
    const offset = before ? { x: before.x + this.map.offsetLeft - s.scrollLeft, y: before.y + this.map.offsetTop - s.scrollTop } : null;

    this.tree = tree;
    const plan = this.plan = planMap(tree);
    this.map.style.width = `${plan.width}px`;
    this.map.style.height = `${plan.height}px`;
    this.empty.hidden = tree.nodes.length > 0;
    this.lines.setAttribute('width', String(plan.width));
    this.lines.setAttribute('height', String(plan.height));
    this.lines.setAttribute('viewBox', `0 0 ${plan.width} ${plan.height}`);
    this.bandsEl.innerHTML = plan.bands.map(b =>
      `<div class="disc-band ${b.band}" style="top:${b.top}px;height:${b.height}px"><span class="disc-band-name">${BAND_NAMES[b.band]}</span></div>`).join('');

    // the nodes: each kept from one drawing to the next (so keyboard focus stays on it), in reading order (Tab)
    const order = [...tree.nodes].sort((a, b) => a.col - b.col || a.row - b.row);
    const gone = new Set(this.nodes.keys());
    order.forEach((n, i) => {
      gone.delete(n.id);
      let b = this.nodes.get(n.id);
      if (!b) {
        b = document.createElement('button');
        b.type = 'button'; b.dataset.id = n.id;
        this.nodes.set(n.id, b);
      }
      const box = nodeBox(plan, n), isNew = this.counts.newFrom <= this.state.discovered.indexOf(n.id);
      const look = `dn ${n.state}${isNew ? ' new' : ''}${this.selected === n.id ? ' on' : ''}`;
      const inner = `<span class="dn-tile">${n.state === 'unknown' ? QUESTION : nodePicture(n.id)}${n.state === 'made' ? '<i class="dn-made" aria-hidden="true"></i>' : ''}</span>` +
        `<span class="dn-name">${n.state === 'unknown' ? '' : esc(n.name)}</span>`;
      if (b.className !== look) b.className = look;
      if (this.inners.get(n.id) !== inner) { b.innerHTML = inner; this.inners.set(n.id, inner); }
      b.style.left = `${box.left}px`; b.style.top = `${box.top}px`;
      b.setAttribute('aria-label', n.state === 'unknown' ? 'Something not found yet' : `${n.name}, ${STATE_WORDS[n.state]}${isNew ? ', new' : ''}`);
      if (this.map.children[i + 2] !== b) this.map.insertBefore(b, this.map.children[i + 2] ?? null);   // after the bands and the lines
    });
    for (const id of gone) { this.nodes.get(id)!.remove(); this.nodes.delete(id); this.inners.delete(id); }
    this.drawLines();
    if (focused && document.activeElement === document.body) this.nodes.get(focused)?.focus({ preventScroll: true });

    if (anchor && offset) {
      const now = tree.nodes.find(n => n.id === anchor);
      if (now) { const box = nodeBox(plan, now); s.scrollLeft = box.x + this.map.offsetLeft - offset.x; s.scrollTop = box.y + this.map.offsetTop - offset.y; }
    }
    if (this.selected && !this.nodes.has(this.selected)) this.closeCard();
  }

  /** The lines, those of the open card's node over the rest and picked out. */
  private drawLines(): void {
    if (!this.tree || !this.plan) return;
    const states = new Map(this.tree.nodes.map(n => [n.id, n.state]));
    const on = (l: TreeLine) => !!this.selected && (l.from === this.selected || l.to === this.selected);
    const lines = [...this.tree.lines].sort((a, b) => Number(on(a)) - Number(on(b)));
    const plan = this.plan;
    this.lines.innerHTML = lines.map(l => `<path class="${lineLook(states.get(l.from)!, states.get(l.to)!)}${on(l) ? ' on' : ''}" d="${linePath(plan, l)}"/>`).join('');
  }

  /** The open card's node marked on the tree, with its lines. */
  private mark(): void {
    for (const [id, b] of this.nodes) {
      const on = id === this.selected;
      if (b.classList.contains('on') !== on) { b.classList.toggle('on', on); b.setAttribute('aria-current', String(on)); }
    }
    this.drawLines();
  }

  /** The card, drawn again only when what it says changed (keeping keyboard focus on the same link). */
  private drawCard(): void {
    if (!this.selected) return;
    const card = nodeCard(this.state, this.layout, this.selected);
    if (!card) { this.closeCard(); return; }
    const key = JSON.stringify(card);
    if (key === this.cardKey) return;
    this.cardKey = key;
    const f = document.activeElement as HTMLElement | null, inside = !!f && this.card.contains(f);
    const again = inside ? (f!.dataset.go ? `[data-go="${f!.dataset.go}"]` : f!.classList.contains('dc-x') ? '.dc-x' : null) : null;
    this.card.innerHTML = cardHtml(card, new Set(this.nodes.keys()));
    if (again) this.card.querySelector<HTMLElement>(again)?.focus({ preventScroll: true });
  }

  private markDot(): void {
    const dot = this.counts.dot(this.state.discovered.length);
    if (dot !== this.dot) { this.dot = dot; this.button?.classList.toggle('new', dot); }
  }

  /** Once a frame: while open, the tree and the card as they are now (drawn again only on a change); the dot. */
  update(): void {
    if (!this.camp) return;
    if (this.windows.isOpen('discovery')) {
      this.counts.showing(this.state.discovered.length);
      const tree = discoveryTree(this.state, this.layout);
      if (tree !== this.tree) this.drawTree(tree);
      this.drawCard();
    }
    this.markDot();
  }
}

/** What a node is said to be, for a screen reader. */
const STATE_WORDS: Record<NodeState, string> = { made: 'made', found: 'found', glow: 'not found yet', unknown: 'not found yet' };
