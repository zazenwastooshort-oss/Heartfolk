// Discovery (game 0.0.38; the brief: docs/plans/2026-10-13-discovery.md): what he has found, what the tree shows, where
// each node sits in it, and each node's card, worked out headless from the game state, so the window (ui/) only draws
// what this says and the tests can check it. The nodes and how they join are data/discovery.ts; what he has found is
// GameState.discovered (systems/discovery.ts adds to it: the first tap on a thing in the world, and whatever comes into
// his hands or he makes or builds).
//
// THE API, for the window:
//
//   discoveryTree(state, layout): DiscoveryTree
//     The tree as it shows now. `nodes`: every node shown, each with its `col` and `row` (whole numbers, from 0; no two
//     on one spot) and its `state`:
//       'made'    found and made (built, a tool he owns, gear he wears): lit, marked made;
//       'found'   found (discovered): lit;
//       'glow'    not found, but one of what leads to it is (a recipe one of whose inputs is found): glowing, named;
//       'unknown' not found, an input of a shown recipe: drawn as "?", its name never shown (`name` is '?').
//     Nothing else shows (D3). `lines`: every main join (data/discovery.ts LINED: not what a thing is only used with,
//     the shelter the chest stands in, which is on the cards alone) between two shown nodes, `from` to `to` (always a
//     later column), with `how` (JoinHow) and `points`: its way through the grid, from `from`'s spot to `to`'s, one
//     point in each column between them; a point between columns' nodes never lands on a node (it takes a free row, or
//     a half row, x.5, between two nodes), so a line drawn straight across each column through its point and curving
//     between columns never runs through a node; a line within a band keeps to it, and one between two bands runs along
//     the gutter at the edge of the band it goes to (the half row between the bands). `cols`, `rows`: the grid's size.
//     `bands`: the three bands top to bottom (BANDS: food, the camp, fighting, so no line passes over a band; D4), each
//     with its first row and how many rows it has (a band with nothing shown has none and isn't listed). Columns are by
//     depth (a material gathered with a tool after the tool), with a thing from the ground just before the first thing
//     it leads to, and no empty column; rows are placed so lines cross as little as is easy.
//
//   nodeCard(state, layout, id): NodeCard | null
//     A shown node's card (null for one not shown): its name, kind, band and state; `words`, the book's lines for it
//     (D8: its Making note, its Food and Materials-and-places pages, and the page of the goal that makes it or asks for
//     it), each { title, text } (title null for the Making note); `needs`, its recipe: what it uses up, each with how
//     many (`need`), how many he has carried or stored (`have`, core/state.ts owned, not capped at `need`), whether it
//     is found (`found`) and its name (`name`: null for one the tree shows as "?"; a glowing one is named, not found);
//     `with`, what it is made, gathered, won or cooked with but never used up (the tool, the weapon, the fires (either
//     will do), the step it is built in place of, the shelter it stands in; `need` null, `have` 1 for one made);
//     `paid`: made or begun, so what it needed was taken (every line ticked, as the book did); `where`: where it is made
//     or cooked ('' for nothing to say); `from`: where it, or the found materials of its recipe, come from, one plain
//     line each; `usedIn`: what it leads to that shows in the tree (tap to go there), each with its name and state;
//     `heals`: for food, how much it heals (null otherwise); `owned`: for an item, how many he has (null for a thing
//     made). An 'unknown' node's card has only its `usedIn` (its name is '?', the rest empty).
//     Both are cheap enough to call every frame: the layout is kept for each set of nodes shown (read only: the same
//     tree object comes back while nothing new shows).
//
//   discoveredOrder(state): string[]   what he has found, in the order he found it (GameState.discovered: a new one is
//     always added at the end, so a window can remember how many it has shown, for a dot on its button).
//   isFound(state, id), shownNodes(state, layout): the states alone, without placing anything.
//   crossings(tree): how many times two lines cross (the tests keep it low).
//
// Saves (core/save.ts): heldThings, impliedDiscovered and savedDiscovered, below.
import { made, owned, begun, type GameState } from './state';
import { siteOf, type Layout } from '../world/layout';
import {
  BANDS, DROPS, FIRES, JOINS, LINED, NODES, NODE_IDS, ORIGINS, PAGES_OF, TOOL_MAKER, gearMaker, goalThings, isNode, pageThings,
  type Band, type JoinHow, type NodeKind, type Origin,
} from '../data/discovery';
import { ITEMS, RESOURCES, SKILLS, TOOL_IDS, TOOLS } from '../data/skills';
import { makeDef, type MakeId } from '../data/making';
import { FOOD } from '../data/food';
import { COOK } from '../data/cooking';
import { GOALS } from '../data/goals';
import { GATHERS, PICKUPS } from '../data/pickups';
import { SWINGS } from '../data/animation';
import { RAT } from '../data/rats';
import { CHIEF } from '../data/goblins';
import { SOURCES } from '../data/building';
import { STOKE } from '../data/fire';
import { SLOTS } from '../data/combat';
import { MAKE_NOTES, MAKE_WHERE, SITE_WHERE, SURVIVAL } from '../data/survival';
import { makeKey } from './thoughts';
import { createRng } from './rng';

export type NodeState = 'made' | 'found' | 'glow' | 'unknown';

export interface TreeNode { id: string; name: string; kind: NodeKind; band: Band; state: NodeState; col: number; row: number }
export interface TreePoint { col: number; row: number }
export interface TreeLine { from: string; to: string; how: JoinHow; points: TreePoint[] }
export interface BandRows { band: Band; top: number; rows: number }
export interface DiscoveryTree { nodes: TreeNode[]; lines: TreeLine[]; cols: number; rows: number; bands: BandRows[] }

export interface CardWords { title: string | null; text: string }
export interface CardInput { id: string; name: string | null; how: JoinHow; need: number | null; have: number; found: boolean }
export interface CardLink { id: string; name: string; state: NodeState }
export interface NodeCard {
  id: string; name: string; kind: NodeKind; band: Band; state: NodeState;
  words: CardWords[]; needs: CardInput[]; with: CardInput[]; paid: boolean;
  where: string; from: string[]; usedIn: CardLink[]; heals: number | null; owned: number | null;
}

// ---- what is found ----

const sets = new WeakMap<string[], Set<string>>();
/** What he has found, as a set (kept per list, made again whenever the list has grown). */
export function discoveredSet(state: GameState): ReadonlySet<string> {
  let set = sets.get(state.discovered);
  if (!set || set.size !== state.discovered.length) { set = new Set(state.discovered); sets.set(state.discovered, set); }
  return set;
}

/** What he has found, in the order he found it. */
export const discoveredOrder = (state: GameState): string[] => [...state.discovered];

/** Whether he has found `id`: discovered, or made (a thing made is always found). */
export const isFound = (state: GameState, id: string) => discoveredSet(state).has(id) || made(state, id);

/** Every node he has in hand now (`each` may be called twice for one, carried and stored): what he carries or stores,
 *  the logs on the firewood pile and in his arms to stoke the fire, the tools he owns, the gear he wears, what is built
 *  and what is begun. */
export function heldThings(state: GameState, each: (id: string) => void): void {
  const p = state.player;
  for (const id in p.backpack) if ((p.backpack[id] ?? 0) > 0) each(id);
  for (const id in state.bank) if ((state.bank[id] ?? 0) > 0) each(id);
  if (state.woodpile > 0 || (p.stoke?.logs ?? 0) > 0) each(STOKE.item);
  for (const t of TOOL_IDS) { const m = state.tools[t] ? TOOL_MAKER[t] : null; if (m) each(m); }
  for (const s of SLOTS) { const g = state.equipment[s], m = g ? gearMaker(g) : null; if (m) each(m); }
  for (const id of state.built) each(id);
  for (const id in state.underway) if (begun(state, id)) each(id);
}

// ---- what a layout has ----

/** Whether something in MAKES can be made in this layout: where he stands, or at a site the layout has. */
const madeIn = (layout: Layout, id: string) => { const d = makeDef(id); return !!d && (d.at === 'here' || siteOf(layout, d.at) !== null); };

const gettable = new WeakMap<Layout, Set<string>>();
/** Whether `id` can be had in this layout at all: made where he stands or at a site the layout has; an item with a
 *  source there (something to pick up, a node to work, rats, the goblin chief, a fire to cook at, birch to peel). The
 *  camp has no tin, iron or oak (the village's), so they never glow there. */
export function obtainable(layout: Layout, id: string): boolean {
  let set = gettable.get(layout);
  if (!set) {
    set = new Set();
    const has = (o: Origin): boolean => {
      if ('pickup' in o) return (layout.pickups ?? []).some(p => p.kind === o.pickup);
      if ('resource' in o) return layout.nodes.some(n => n.resource === o.resource);
      if ('foe' in o) return o.foe === 'rat' ? (layout.nests ?? []).some(n => n.rats > 0) : !!layout.goblinCamp;
      if ('peel' in o) return layout.nodes.some(n => n.resource === o.peel);
      return FIRES.some(f => madeIn(layout, f)) && (ORIGINS[COOK.raw] ?? []).some(has);
    };
    for (const n of NODE_IDS) if (makeDef(n) ? madeIn(layout, n) : (ORIGINS[n] ?? []).some(has)) set.add(n);
    gettable.set(layout, set);
  }
  return set.has(id);
}

// ---- what shows ----

/** Joins where any one of several leads there (the fires that cook, the tools that gather, the weapons that win): one
 *  "?" for them, only while none of them shows. The rest are all needed. */
const EITHER: JoinHow[] = ['cooks', 'gathers', 'drops'];

/** Every node the tree shows now, with its state (D3): found (made or found), each recipe one of whose inputs is found
 *  (glowing; only what this layout can have), and the inputs of what shows that aren't found ("?"; of several that
 *  each would do, the first, and only while none of them shows). */
export function shownNodes(state: GameState, layout: Layout): Map<string, NodeState> {
  const out = new Map<string, NodeState>();
  for (const id of NODE_IDS) if (isFound(state, id)) out.set(id, made(state, id) ? 'made' : 'found');
  const found = new Set(out.keys());
  for (const id of NODE_IDS) {
    if (!out.has(id) && obtainable(layout, id) && JOINS.some(j => j.to === id && found.has(j.from))) out.set(id, 'glow');
  }
  for (const [id, st] of [...out]) {
    if (st === 'unknown') continue;
    const into = JOINS.filter(j => j.to === id);
    for (const j of into) {
      if (out.has(j.from)) continue;
      if (EITHER.includes(j.how) && into.some(k => k.how === j.how && out.has(k.from))) continue;
      out.set(j.from, 'unknown');
    }
  }
  return out;
}

// ---- the layout ----

/** The best placement of rows for nodes in order, each wanting row `want[i]`, in `rows` rows: in the same order, no two
 *  on one row, each as near what it wants as can be (pool-adjacent-violators on row minus place, then rounded). */
function placeRows(want: number[], rows: number): number[] {
  const n = want.length, blocks: { sum: number; count: number }[] = [];
  for (let i = 0; i < n; i++) {
    blocks.push({ sum: want[i]! - i, count: 1 });
    while (blocks.length > 1 && blocks.at(-2)!.sum / blocks.at(-2)!.count > blocks.at(-1)!.sum / blocks.at(-1)!.count) {
      const last = blocks.pop()!; blocks.at(-1)!.sum += last.sum; blocks.at(-1)!.count += last.count;
    }
  }
  const out: number[] = [];
  for (const b of blocks) for (let k = 0; k < b.count; k++) out.push(Math.min(rows - n, Math.max(0, Math.round(b.sum / b.count))) + out.length);
  return out;
}

const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;

/** How many times two lines cross, between each pair of columns next to each other (lines meeting at a node don't):
 *  each line given as its row at every column from its first to its last. */
function crossed(ways: { first: number; rows: number[] }[], cols: number): number {
  let n = 0;
  for (let c = 0; c + 1 < cols; c++) {
    const span = ways.filter(w => w.first <= c && w.first + w.rows.length - 1 >= c + 1);
    for (let i = 0; i < span.length; i++) for (let k = i + 1; k < span.length; k++) {
      const a = span[i]!, b = span[k]!;
      if ((a.rows[c - a.first]! - b.rows[c - b.first]!) * (a.rows[c + 1 - a.first]! - b.rows[c + 1 - b.first]!) < 0) n++;
    }
  }
  return n;
}

/** How many times two lines that have nothing to do with each other (neither the same start nor the same end) pass a
 *  column at the same point between its nodes, so that they would read as one line there. */
function shared(ways: { first: number; rows: number[]; from: string; to: string }[]): number {
  const at = new Map<string, { from: string; to: string }[]>();
  for (const w of ways) for (let k = 1; k < w.rows.length - 1; k++) {
    const key = `${w.first + k}:${w.rows[k]}`, here = at.get(key) ?? [];
    here.push(w); at.set(key, here);
  }
  let n = 0;
  for (const here of at.values()) for (let i = 0; i < here.length; i++) for (let k = i + 1; k < here.length; k++) {
    if (here[i]!.from !== here[k]!.from && here[i]!.to !== here[k]!.to) n++;
  }
  return n;
}

/** How many starts the layout is tried from, and the seed of their shuffles. */
const STARTS = 4, STARTS_SEED = 38;

/** The trees laid out lately, by what shows (the layout depends on nothing else), so drawing it every frame doesn't
 *  lay it out again each time. Read only: the same tree is handed out again. */
const laidOut = new Map<string, DiscoveryTree>();

/** The tree for the nodes shown (shownNodes), laid out: columns by depth, with things from the ground moved on beside
 *  their use (no empty column); the three bands; and rows to keep lines short and tidy, tried from a few starts: sweeps
 *  ordering each column by where its neighbours are, each node then as near its neighbours' rows as its band allows,
 *  then each node moved to wherever in its column crosses fewest lines (or puts fewest on one way); the tidiest start
 *  kept. Each line's way through the columns between its ends takes a free row there, or a half row between two nodes,
 *  nearest the straight line between its ends (a line between bands, the gutter), then a point at a time wherever it is
 *  tidiest. */
export function layoutTree(shown: Map<string, NodeState>): DiscoveryTree {
  const ids = [...shown.keys()].sort((a, b) => NODES[a]!.order - NODES[b]!.order);
  const key = ids.map(id => `${id}:${shown.get(id)}`).join(',');
  const kept = laidOut.get(key);
  if (kept) return kept;
  const joins = JOINS.filter(j => LINED.includes(j.how) && shown.has(j.from) && shown.has(j.to));
  // columns by depth; then each thing nothing leads into (from the ground, or a "?") moved on to just before the first
  // thing it leads to, beside its use rather than a long line away (fibre by the wall tent, clay by the stone hearth);
  // then no empty column
  const depths = [...new Set(ids.map(id => NODES[id]!.depth))].sort((a, b) => a - b);
  const at = new Map(ids.map(id => [id, depths.indexOf(NODES[id]!.depth)]));
  for (const id of ids) {
    if (joins.some(j => j.to === id)) continue;
    const uses = joins.filter(j => j.from === id).map(j => at.get(j.to)!);
    if (uses.length) at.set(id, Math.min(...uses) - 1);
  }
  const used = [...new Set(at.values())].sort((a, b) => a - b);
  const col = new Map(ids.map(id => [id, used.indexOf(at.get(id)!)]));
  const cols = used.length;
  const near = new Map<string, string[]>(ids.map(id => [id, []]));
  for (const j of joins) { near.get(j.from)!.push(j.to); near.get(j.to)!.push(j.from); }
  const bands = BANDS.filter(b => ids.some(id => NODES[id]!.band === b));
  const groups = new Map(bands.map(b => [b, Array.from({ length: cols }, (_, c) => ids.filter(id => NODES[id]!.band === b && col.get(id) === c))]));
  const height = new Map(bands.map(b => [b, Math.max(...groups.get(b)!.map(g => g.length))]));
  const top = new Map<Band, number>();
  bands.reduce((at, b) => { top.set(b, at); return at + height.get(b)!; }, 0);
  const rows = bands.reduce((a, b) => a + height.get(b)!, 0);
  const y = new Map<string, number>();
  const stack = () => { for (const b of bands) for (const g of groups.get(b)!) g.forEach((id, i) => y.set(id, top.get(b)! + i)); };
  /** The order of each column's nodes, swept right then left: each by the mean row of its neighbours on the side
   *  swept from. */
  const sweep = () => {
    stack();
    for (let pass = 0; pass < 8; pass++) {
      const right = pass % 2 === 0;
      for (let k = 1; k < cols; k++) {
        const c = right ? k : cols - 1 - k;
        for (const b of bands) {
          const g = groups.get(b)![c]!;
          const by = new Map(g.map(id => {
            const side = near.get(id)!.filter(o => right ? col.get(o)! < c : col.get(o)! > c);
            return [id, side.length ? mean(side.map(o => y.get(o)!)) : y.get(id)!];
          }));
          g.sort((a, b2) => by.get(a)! - by.get(b2)! || y.get(a)! - y.get(b2)!);
        }
        stack();
      }
    }
  };
  // rows, in that order: each node as near the mean row of all its neighbours as its band and order allow, sweeping
  // right, left, right
  const place = () => {
    stack();
    for (let pass = 0; pass < 3; pass++) {
      const right = pass % 2 === 0;
      for (let k = 0; k < cols; k++) {
        const c = right ? k : cols - 1 - k;
        for (const b of bands) {
          const g = groups.get(b)![c]!, t = top.get(b)!;
          if (!g.length) continue;
          const want = g.map(id => (near.get(id)!.length ? mean(near.get(id)!.map(o => y.get(o)!)) : y.get(id)!) - t);
          placeRows(want, height.get(b)!).forEach((r, i) => y.set(g[i]!, t + r));
        }
      }
    }
  };
  /** Each line's row at every column from its first to its last. */
  const ways = () => {
    const taken = new Set(ids.map(id => `${col.get(id)}:${y.get(id)}`));
    return joins.map(j => {
      const a = col.get(j.from)!, ra = y.get(j.from)!, b = col.get(j.to)!, rb = y.get(j.to)!, out = [ra];
      // a line from one band to another runs along the gutter at the edge of the band it goes to, never among a
      // band's things on the way
      const from = NODES[j.from]!.band, to = NODES[j.to]!.band;
      const gutter = from === to ? null : bands.indexOf(to) > bands.indexOf(from) ? top.get(to)! - 0.5 : top.get(to)! + height.get(to)! - 0.5;
      for (let c = a + 1; c < b; c++) {
        if (gutter !== null) { out.push(gutter); continue; }
        const at = ra + (rb - ra) * (c - a) / (b - a), whole = Math.round(at);
        if (whole >= 0 && whole < rows && !taken.has(`${c}:${whole}`)) { out.push(whole); continue; }
        const up = Math.floor(at) + 0.5, down = up - 1;
        const row = Math.abs(up - at) < Math.abs(down - at) || (Math.abs(up - at) === Math.abs(down - at) && rb >= ra) ? up : down;
        out.push(Math.min(rows - 0.5, Math.max(-0.5, row)));
      }
      out.push(rb);
      return { first: a, rows: out, from: j.from, to: j.to, between: gutter !== null };
    });
  };
  /** How untidy a set of ways is: its crossings, and lines sharing a way that would read as one. */
  const untidy = (w: ReturnType<typeof ways>) => crossed(w, cols) + shared(w);
  /** Then each node moved to wherever in its column's order is tidiest (sifting), until none moves; how untidy that
   *  leaves it. */
  const sift = () => {
    place();
    let best = untidy(ways());
    for (let pass = 0, moved = true; pass < 8 && moved && best > 0; pass++) {
      moved = false;
      for (const b of bands) for (const g of groups.get(b)!) for (const id of [...g]) {
        let at = g.indexOf(id);
        for (let i = 0; i < g.length; i++) {
          g.splice(g.indexOf(id), 1); g.splice(i, 0, id);
          place();
          const n = untidy(ways());
          if (n < best) { best = n; at = i; moved = true; }
        }
        g.splice(g.indexOf(id), 1); g.splice(at, 0, id);
      }
    }
    return best;
  };
  // swept and sifted from a few starts (the nodes in their own order, then shuffled, the same way every time), the
  // tidiest kept
  const rng = createRng(STARTS_SEED);
  let least = Infinity, tidiest: string[][] = [];
  for (let start = 0; start < STARTS && least > 0; start++) {
    if (start) for (const b of bands) for (const g of groups.get(b)!) for (let i = g.length - 1; i > 0; i--) {
      const k = Math.floor(rng.next() * (i + 1));
      [g[i], g[k]] = [g[k]!, g[i]!];
    }
    sweep();
    const n = sift();
    if (n < least) { least = n; tidiest = bands.flatMap(b => groups.get(b)!.map(g => [...g])); }
  }
  bands.flatMap(b => groups.get(b)!).forEach((g, i) => g.splice(0, g.length, ...tidiest[i]!));
  place();
  // and last each line's way through the columns between its ends (a line within a band; one between bands keeps to
  // its gutter) moved a point at a time to wherever is tidiest, at a free row or between two nodes of its band, as
  // straight as that allows
  const routes = ways(), taken = new Set(ids.map(id => `${col.get(id)}:${y.get(id)}`));
  const travel = () => routes.reduce((a, w) => a + w.rows.reduce((t, r, k) => t + (k ? Math.abs(r - w.rows[k - 1]!) : 0), 0), 0);
  const score = () => untidy(routes) * 100 + travel();
  let now = score();
  for (let pass = 0, moved = true; pass < 4 && moved; pass++) {
    moved = false;
    for (const w of routes) {
      if (w.between) continue;
      const band = NODES[w.from]!.band, lo = top.get(band)! - 0.5, hi = top.get(band)! + height.get(band)! - 0.5;
      for (let k = 1; k < w.rows.length - 1; k++) {
        const c = w.first + k;
        let keep = w.rows[k]!;
        for (let r = lo; r <= hi; r += 0.5) {
          if (r === keep || (Number.isInteger(r) && taken.has(`${c}:${r}`))) continue;
          const was = w.rows[k]!;
          w.rows[k] = r;
          const n = score();
          if (n < now) { now = n; keep = r; moved = true; } else w.rows[k] = was;
        }
        w.rows[k] = keep;
      }
    }
  }
  const lines: TreeLine[] = routes.map((w, i) => ({
    from: joins[i]!.from, to: joins[i]!.to, how: joins[i]!.how, points: w.rows.map((row, k) => ({ col: w.first + k, row })),
  }));
  const nodes: TreeNode[] = ids.map(id => {
    const n = NODES[id]!, st = shown.get(id)!;
    return { id, name: st === 'unknown' ? '?' : n.name, kind: n.kind, band: n.band, state: st, col: col.get(id)!, row: y.get(id)! };
  });
  const tree = { nodes, lines, cols, rows, bands: bands.map(b => ({ band: b, top: top.get(b)!, rows: height.get(b)! })) };
  if (laidOut.size >= 8) laidOut.delete(laidOut.keys().next().value!);
  laidOut.set(key, tree);
  return tree;
}

/** The tree as it shows now (see the top of this file). */
export const discoveryTree = (state: GameState, layout: Layout): DiscoveryTree => layoutTree(shownNodes(state, layout));

/** How many times two lines of `tree` cross, between each pair of columns next to each other (lines meeting at a node
 *  don't). */
export const crossings = (tree: DiscoveryTree): number =>
  crossed(tree.lines.map(l => ({ first: l.points[0]!.col, rows: l.points.map(p => p.row) })), tree.cols);

// ---- the cards ----

/** A thing's name, lower case and plural ("copper rocks", "berry bushes"). */
const plural = (name: string) => { const s = name.toLowerCase(); return /(s|sh|ch|x)$/.test(s) ? `${s}es` : `${s}s`; };
const lower = (id: string) => (NODES[id]?.name ?? id).toLowerCase();
/** "the campfire or the stone hearth" */
const either = (ids: string[]) => ids.map(id => `the ${lower(id)}`).join(' or ');

/** Where an item comes from, in a plain line each, as the Build list says it (SOURCES in data/building.ts) where it
 *  has words for it, else from the pickups, the resources, the creatures and cooking: "Copper ore: mine the copper
 *  rocks with a pickaxe." */
export function fromLines(item: string): string[] {
  const def = ITEMS[item] && NODES[item];
  if (!def) return [];
  const source = SOURCES[item];
  if (source) return [source];
  const out = (ORIGINS[item] ?? []).map(o => {
    if ('pickup' in o) {
      const p = PICKUPS[o.pickup], g = p.gather ? GATHERS[p.gather] : null, verb = (g?.verb ?? 'Gather').toLowerCase();
      const what = p.plant ? `${verb} the ${plural(p.name)}` : g ? `${verb} the ${g.name.toLowerCase()}` : `pick up the ${p.name.toLowerCase()}`;
      const after = p.respawn === null ? 'No more will come.' : p.plant ? 'They fruit again a while later.' : 'More turn up in a while.';
      return `${def.name}: ${what}. ${after}`;
    }
    if ('resource' in o) {
      const r = RESOURCES[o.resource]!, tool = TOOLS[SWINGS[r.skill].tool];
      const what = r.hover ? `${r.hover.verb.toLowerCase()} ${r.hover.name.toLowerCase()} at the ${plural(r.name)}` : `${SKILLS[r.skill].verb.toLowerCase()} the ${plural(r.name)}`;
      return `${def.name}: ${what} with ${tool.a}.`;
    }
    if ('foe' in o) return o.foe === 'rat' ? `${def.name}: ${plural(RAT.name)} leave one now and then, when beaten.` : `${def.name}: the ${CHIEF.name.toLowerCase()} leaves it when he is beaten.`;
    if ('peel' in o) return `${def.name}: peeled now and then off ${plural(RESOURCES[o.peel]?.name ?? o.peel)} as they are cut.`;
    return o.cook === COOK.cooked ? `${def.name}: cook ${lower(COOK.raw)} at ${either(FIRES)}.` : `${def.name}: now and then one burns, cooking ${lower(COOK.raw)}.`;
  });
  return [...new Set(out)];
}

/** Where a thing is made: its Making page's words (MAKE_WHERE, else its site's, SITE_WHERE); what cooking makes, at
 *  which fire. */
function whereOf(id: string): string {
  const d = makeDef(id);
  if (d) return MAKE_WHERE[d.id] ?? SITE_WHERE[d.at] ?? '';
  return JOINS.some(j => j.to === id && j.how === 'cooks') ? `Cooked at ${either(FIRES)}.` : '';
}

/** The book's lines for a thing (D8): its Making note, its Food and Materials-and-places pages, and the page of each
 *  goal that makes it or asks for it. */
export function wordsOf(id: string): CardWords[] {
  const note = makeDef(id) ? MAKE_NOTES[id as MakeId] : undefined;
  return [
    ...(note ? [{ title: null, text: note }] : []),
    ...(PAGES_OF[id] ?? []).map(p => ({ title: p.title, text: p.text })),
    ...GOALS.filter(g => goalThings(g).includes(id)).map(g => ({ title: g.title, text: g.page })),
  ];
}

/** A shown node's card (see the top of this file); null for one the tree doesn't show. */
export function nodeCard(state: GameState, layout: Layout, id: string): NodeCard | null {
  const shown = shownNodes(state, layout), st = shown.get(id), n = NODES[id];
  if (!st || !n) return null;
  const nameIf = (o: string) => { const s = shown.get(o); return s && s !== 'unknown' ? NODES[o]!.name : null; };
  const usedIn = [...new Set(JOINS.filter(j => j.from === id && shown.has(j.to)).map(j => j.to))]
    .map(to => ({ id: to, name: nameIf(to) ?? '?', state: shown.get(to)! }));
  const base = { id, kind: n.kind, band: n.band, state: st, usedIn };
  if (st === 'unknown') {
    return { ...base, name: '?', words: [], needs: [], with: [], paid: false, where: '', from: [], heals: null, owned: null };
  }
  const input = (j: (typeof JOINS)[number]): CardInput => {
    const found = isFound(state, j.from);
    return {
      id: j.from, name: found ? NODES[j.from]!.name : nameIf(j.from), how: j.how, need: j.count ?? null, found,
      have: makeDef(j.from) ? (made(state, j.from) ? 1 : 0) : owned(state, j.from),
    };
  };
  const into = JOINS.filter(j => j.to === id), needs = into.filter(j => j.how === 'needs').map(input);
  const isItem = !makeDef(id);
  const from = [...new Set([...(isItem ? fromLines(id) : []), ...needs.filter(x => x.found).flatMap(x => fromLines(x.id))])];
  return {
    ...base, name: n.name, words: wordsOf(id), needs, with: into.filter(j => j.how !== 'needs').map(input),
    paid: made(state, id) || begun(state, id), where: whereOf(id), from,
    heals: FOOD[id]?.heals ?? null, owned: isItem ? owned(state, id) : null,
  };
}

// ---- saves ----

/** What an old save (from before Discovery, format 12 and before) has already come across (In 6): what he holds now
 *  (heldThings: what he carries or stores, his tools and what he wears, everything built or begun, with what each of
 *  those things was made of), every goal done
 *  and the things it made or asked for, and the things of the book's pages already come unstuck (GameState.thoughts,
 *  read before this: its Making pages' things, the Food pages' food, and what the Materials and places pages are
 *  about). In the nodes' order. */
export function impliedDiscovered(state: GameState): string[] {
  const out = new Set<string>();
  // what he holds, and for each thing built, begun, used or worn what went into it (the upgrades' fibre, clay and bark
  // are asked for by no goal)
  heldThings(state, id => { out.add(id); const def = makeDef(id); if (def) for (const n of Object.keys(def.needs)) out.add(n); });
  for (const g of GOALS) if (state.goalsDone.includes(g.id)) {
    if (g.makes) out.add(g.makes);
    for (const id of Object.keys(g.needs)) out.add(id);
  }
  for (const key of state.thoughts.known) {
    const m = NODE_IDS.find(id => makeKey(id) === key);
    if (m) out.add(m);
    for (const p of SURVIVAL) if (p.id === key) for (const id of pageThings(p)) out.add(id);
  }
  return NODE_IDS.filter(id => out.has(id));
}

/** What he has found, read back from a save (`v`): the nodes the game still has, each once, in the order found (so a
 *  save reads back exactly; anything he holds that a hand-edited list left out is found again on the next step). A save
 *  from before Discovery (none saved: the migration from format 12 leaves it out) or a damaged one (not a list, or one
 *  with something in it the game can't read) is given what it has already come across (impliedDiscovered), with no
 *  notice for any of it. */
export function savedDiscovered(v: unknown, state: GameState): string[] {
  if (!Array.isArray(v)) return impliedDiscovered(state);
  const kept = [...new Set(v.filter((id): id is string => typeof id === 'string' && isNode(id)))];
  // a damaged list (something in it the game can't read): what the save implies as well, first, so nothing is lost or
  // told again as new
  return kept.length === v.length ? kept : [...new Set([...impliedDiscovered(state), ...kept])];
}

/** What creatures leave, for a tap on one (systems/discovery.ts): a rat's hide, a goblin's and its chief's torn map. */
export const FOE_GIVES: Record<'rat' | 'goblin' | 'chief', string> = { rat: DROPS.rat, goblin: DROPS.chief, chief: DROPS.chief };
