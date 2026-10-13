// Discovery's window (game 0.0.38; ui/discovery.ts, drawn from core/discovery.ts; the brief, docs/plans/2026-10-13-
// discovery.md: In 2, D3, D4's drawing, D9): its markup and CSS in index.html (a window of its own where the Book's was, after
// the Build window's, its button in the Book's place in the row, shown from a new game, its look one block at the end of the styles); a
// picture for every node; the tree drawn (every node in its band and the map, none on another, every line from one
// node's edge to the next's and never through a node, at the sizes the CSS draws); where it opens (the current goal's
// node, else the newest found); where the arrow keys go; the dot on its button; and every card's words, recipe and
// links, for the whole camp.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createState, type GameState } from '../src/core/state';
import { createRng } from '../src/core/rng';
import { readSave } from '../src/core/save';
import { discoveryTree, nodeCard, obtainable, type DiscoveryTree } from '../src/core/discovery';
import { CAMP } from '../src/world/camp';
import { itemName } from '../src/ui/hud';
import { NODES, NODE_IDS, goalThings } from '../src/data/discovery';
import { GOALS } from '../src/data/goals';
import { BUILDING_PICTURES, BUNDLE, RAIL_ICONS } from '../src/ui/pictures';
import {
  BAND_NAMES, GRID, NODE_W, SeenCount, WITH_WORDS, arrowTarget, cardHtml, colX, inputLine, lineLook, linePath, nodeBox,
  nodePicture, openingNode, planMap, rowAt, type MapPlan,
} from '../src/ui/discovery';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
/** A CSS rule's body, by its selector as written. */
const rule = (selector: string) => style.match(new RegExp(`\\n${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';

/** What the camp can have at all. */
const CAMP_NODES = NODE_IDS.filter(id => obtainable(CAMP, id));
const wholeCamp = () => readSave(readFileSync(new URL('./fixtures/camp/whole-camp.json', import.meta.url), 'utf8'), CAMP).state;
function found(ids: string[]): GameState { const s = createState(CAMP, 1); s.discovered = [...ids]; return s; }
/** Trees to check the drawing on: the whole camp, everything found, and many sets of things found at random. */
function trees(): { what: string; tree: DiscoveryTree }[] {
  const out = [{ what: 'the whole camp', tree: discoveryTree(wholeCamp(), CAMP) }, { what: 'everything found', tree: discoveryTree(found(CAMP_NODES), CAMP) }];
  const rng = createRng(12);
  for (let n = 0; n < 40; n++) {
    const s = found(CAMP_NODES.filter(() => rng.next() < 0.3));
    out.push({ what: s.discovered.join(','), tree: discoveryTree(s, CAMP) });
  }
  return out;
}

describe('the window in the page (index.html)', () => {
  it('is a window of its own, where the Book\'s was (after Build\'s, before Settings), as wide as a desktop allows beside the Backpack', () => {
    expect(html).toMatch(/<\/section>\n {4}<section class="win disc-win" id="discoveryWin" data-win="discovery" data-width="(\d+)"[^>]*>/);
    const build = html.indexOf('id="buildWin"'), disc = html.indexOf('id="discoveryWin"'), settings = html.indexOf('id="settingsWin"');
    expect(build).toBeGreaterThan(0);
    expect(disc).toBeGreaterThan(build);
    expect(html).not.toContain('id="book"');                       // the old Book is gone (0.0.38)
    expect(settings).toBeGreaterThan(disc);
    // 860 px, with the Backpack's 368 beside it on a 1280 px screen (ui/windows.ts: 16 px edges, 8 px between)
    const width = Number(html.match(/data-win="discovery" data-width="(\d+)"/)![1]), backpack = Number(html.match(/data-win="backpack" data-width="(\d+)"/)![1]);
    expect(width + 8 + backpack).toBeLessThanOrEqual(1280 - 2 * 16);
    for (const id of ['discoveryTitle', 'discBody', 'discTree', 'discMap', 'discBands', 'discLines', 'discEmpty', 'discSide', 'discHint', 'discCard']) {
      expect(html, id).toContain(`id="${id}"`);
    }
  });

  it('its button is in the Book\'s place in the row, called Discovery, with its own icon, shown from a new game', () => {
    const row = [...html.matchAll(/<button class="rail-btn" type="button" data-opens="(\w+)"([^>]*)>[\s\S]*?<span>(\w+)<\/span>/g)];
    expect(row.map(m => m[1])).toEqual(['backpack', 'skills', 'build', 'discovery', 'settings']);
    const button = row.find(m => m[1] === 'discovery')!;
    expect(button[2]).toContain('aria-controls="discoveryWin"');
    expect(button[2]).not.toContain('hidden');
    expect(button[3]).toBe('Discovery');
    expect(html).not.toContain('data-opens="book"');                 // nothing in the row opens the old Book now
    expect(RAIL_ICONS.discovery).toMatch(/^<path /);
    expect(RAIL_ICONS.discovery).not.toBe(RAIL_ICONS.book);
  });

  it('its look is one block at the end of the styles', () => {
    const start = style.indexOf('/* Discovery (src/ui/discovery.ts');
    expect(start).toBeGreaterThan(0);
    const before = style.slice(0, start), block = style.slice(start);
    expect(before).not.toMatch(/\.(dn|disc|dc)[-\s.:{]/);
    expect(before).not.toContain('#discoveryWin');
    // every rule in the block is Discovery's own
    const rules = block.replace(/\/\*[\s\S]*?\*\//g, '').match(/(^|\n)\s*[^@\s{}][^{}]*\{/g) ?? [];
    expect(rules.length).toBeGreaterThan(40);
    for (const sel of rules) expect(sel.trim(), sel).toMatch(/^(#discoveryWin|\.disc|\.dn|\.dc|button\.dc-row)/);
  });

  it('draws a node to the grid ui/discovery.ts places it by: its width, its tile, and its name ending in time', () => {
    expect(rule('.dn')).toContain(`width: ${NODE_W}px`);
    expect(rule('.dn')).toContain('gap: 2px');
    expect(rule('.dn-tile')).toContain(`width: ${GRID.tile}px; height: ${GRID.tile}px`);
    // the name at its largest (13 px, line height 1.2, 1 + 2 px padding) ends no lower than GRID.nameBottom
    expect(rule('.dn-name')).toContain('padding: 1px 6px 2px');
    expect(rule('.dn-name')).toContain('font: 600 clamp(11px, 0.75rem, 13px)/1.2');
    expect(GRID.tile / 2 + 2 + 13 * 1.2 + 3).toBeLessThanOrEqual(GRID.nameBottom);
    // every tap target at least 44 px: a node's tile, a recipe line, a link
    expect(GRID.tile).toBeGreaterThanOrEqual(44);
    expect(rule('.dc-row')).toContain('min-height: 44px');
    expect(rule('.dc-link')).toContain('min-height: 44px');
  });
});

describe('a picture for every node (ui/pictures.ts)', () => {
  it('every item, tool, piece of gear and building has its own, none the bundle, no two alike', () => {
    const pics = NODE_IDS.map(id => nodePicture(id));
    for (const [i, id] of NODE_IDS.entries()) expect(pics[i], id).not.toContain(BUNDLE);
    expect(new Set(pics).size).toBe(pics.length);
    for (const [id, svg] of Object.entries(BUILDING_PICTURES)) {
      expect(NODES[id]?.kind, id).toBe('building');
      const opened = (svg.match(/<g[\s>]/g) ?? []).length, closed = (svg.match(/<\/g>/g) ?? []).length;
      expect(opened, id).toBe(closed);
      expect(svg, id).not.toMatch(/undefined|NaN|null/);
    }
    expect(Object.keys(BUILDING_PICTURES).sort()).toEqual(NODE_IDS.filter(id => NODES[id]!.kind === 'building').sort());
  });
});

describe('the tree drawn (planMap, linePath)', () => {
  const all = trees();

  /** A line's ends, as its path says them: where it starts, and where it ends. */
  const ends = (d: string) => {
    const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    return { start: [nums[0]!, nums[1]!], end: [nums.at(-2)!, nums.at(-1)!] };
  };

  it('every node is inside its band and the map, and none overlaps another', () => {
    for (const { what, tree } of all) {
      const plan = planMap(tree);
      const boxes = tree.nodes.map(n => ({ n, b: nodeBox(plan, n) }));
      for (const { n, b } of boxes) {
        expect(b.left, what).toBeGreaterThanOrEqual(0);
        expect(b.right, what).toBeLessThanOrEqual(plan.width);
        expect(b.top - 8, what).toBeGreaterThanOrEqual(0);              // room for the made tick over a tile's corner
        expect(b.bottom, what).toBeLessThanOrEqual(plan.height);
        const band = plan.bands.find(x => x.band === n.band)!;
        expect(b.top, `${what}: ${n.id}`).toBeGreaterThanOrEqual(band.top + GRID.head);   // under its band's name
        expect(b.bottom, `${what}: ${n.id}`).toBeLessThanOrEqual(band.top + band.height);
      }
      for (let i = 0; i < boxes.length; i++) for (let k = i + 1; k < boxes.length; k++) {
        const a = boxes[i]!.b, c = boxes[k]!.b;
        const apart = a.right <= c.left || c.right <= a.left || a.bottom <= c.top || c.bottom <= a.top;
        expect(apart, `${what}: ${boxes[i]!.n.id} and ${boxes[k]!.n.id}`).toBe(true);
      }
      // the bands one under another, in order, each with its name's strip
      expect(plan.bands.map(b => b.band), what).toEqual(tree.bands.map(b => b.band));
      for (let i = 1; i < plan.bands.length; i++) expect(plan.bands[i]!.top, what).toBeGreaterThan(plan.bands[i - 1]!.top + plan.bands[i - 1]!.height);
      for (const b of plan.bands) expect(BAND_NAMES[b.band]).toBeTruthy();
    }
  });

  it('every line leaves its first node at the tile\'s right edge, meets the last at its left, and passes no node between', () => {
    for (const { what, tree } of all) {
      const plan = planMap(tree), at = new Map(tree.nodes.map(n => [n.id, n]));
      for (const line of tree.lines) {
        const name = `${what}: ${line.from} -> ${line.to}`, a = nodeBox(plan, at.get(line.from)!), b = nodeBox(plan, at.get(line.to)!);
        const { start, end } = ends(linePath(plan, line));
        expect(start[0], name).toBeCloseTo(a.x + GRID.tile / 2 + 2, 0);
        expect(start[1], name).toBeCloseTo(a.y, 0);
        expect(end[0], name).toBeCloseTo(b.x - GRID.tile / 2 - 2, 0);
        expect(end[1], name).toBeCloseTo(b.y, 0);
        // between its ends it runs straight across each column at its point there, clear of every node in that column
        // (its tile and its name, with a little room)
        for (const p of line.points.slice(1, -1)) {
          const y = rowAt(plan, p.row);
          for (const n of tree.nodes.filter(x => x.col === p.col)) {
            const box = nodeBox(plan, n);
            expect(y < box.top - 6 || y > box.bottom + 6, `${name} at column ${p.col}, row ${p.row}, by ${n.id}`).toBe(true);
          }
          expect(linePath(plan, line), name).toContain(`H${Math.round((colX(p.col) + GRID.tile / 2 + 2) * 10) / 10}`);
        }
      }
    }
  });

  it('how a line looks: lit between found things, glowing into what is not found yet, faint to a "?"', () => {
    expect(lineLook('found', 'made')).toBe('lit');
    expect(lineLook('made', 'glow')).toBe('glow');
    expect(lineLook('unknown', 'glow')).toBe('dim');
    expect(lineLook('found', 'unknown')).toBe('dim');
  });

  it('an empty tree (a new game) takes no room', () => {
    const plan: MapPlan = planMap(discoveryTree(createState(CAMP, 1), CAMP));
    expect(plan).toMatchObject({ width: 0, height: 0, bands: [] });
  });
});

describe('where the window opens (openingNode)', () => {
  const goalAt = (id: string) => GOALS.slice(0, GOALS.findIndex(g => g.id === id)).map(g => g.id);

  it('on nothing in a new game, the tree being empty', () => {
    const s = createState(CAMP, 1);
    expect(openingNode(s, discoveryTree(s, CAMP))).toBeNull();
  });

  it('on the current goal\'s node while the tree shows it: what it asks for, or what it makes', () => {
    // the first goal asks for the wreck's planks and tarp (and his book, not a node): a plank found shows it
    const s = found(['plank']);
    expect(goalThings(GOALS[0]!)).toContain('plank');
    expect(openingNode(s, discoveryTree(s, CAMP))).toBe('plank');
    // the campfire goal, the campfire glowing from the planks found
    s.goalsDone = goalAt('campfire'); s.discovered = ['plank', 'tarp', 'stone'];
    expect(openingNode(s, discoveryTree(s, CAMP))).toBe('campfire');
  });

  it('else on the newest thing found that shows', () => {
    // the stone axe's goal with nothing of the axe's found: the tarp, found last
    const s = found(['plank', 'tarp']);
    s.goalsDone = goalAt('stone_axe');
    const tree = discoveryTree(s, CAMP);
    expect(tree.nodes.some(n => n.id === 'stone_axe')).toBe(false);
    expect(openingNode(s, tree)).toBe('tarp');
    // every goal done: the newest found
    const done = found(CAMP_NODES);
    done.goalsDone = GOALS.map(g => g.id);
    expect(openingNode(done, discoveryTree(done, CAMP))).toBe(CAMP_NODES.at(-1));
  });

  it('the whole camp opens on its current goal\'s thing', () => {
    const s = wholeCamp(), tree = discoveryTree(s, CAMP), at = openingNode(s, tree)!;
    expect(tree.nodes.some(n => n.id === at)).toBe(true);
  });
});

describe('the keyboard: where the arrow keys go (arrowTarget)', () => {
  const tree = discoveryTree(found(CAMP_NODES), CAMP);
  const node = (id: string) => tree.nodes.find(n => n.id === id)!;

  it('Right follows a line to what it leads to, the nearest in height', () => {
    const to = arrowTarget(tree, 'plank', 'ArrowRight')!;
    expect(tree.lines.some(l => l.from === 'plank' && l.to === to)).toBe(true);
    const outs = tree.lines.filter(l => l.from === 'plank').map(l => Math.abs(node(l.to).row - node('plank').row));
    expect(Math.abs(node(to).row - node('plank').row)).toBe(Math.min(...outs));
  });

  it('Left goes back along a line to what leads to it', () => {
    const from = arrowTarget(tree, 'shelter', 'ArrowLeft')!;
    expect(tree.lines.some(l => l.to === 'shelter' && l.from === from)).toBe(true);
    // and from every node, Left then Right comes back along joined nodes
    for (const n of tree.nodes) {
      const left = arrowTarget(tree, n.id, 'ArrowLeft');
      if (left) expect(tree.lines.some(l => l.from === left && l.to === n.id), n.id).toBe(true);
      const right = arrowTarget(tree, n.id, 'ArrowRight');
      if (right) expect(tree.lines.some(l => l.from === n.id && l.to === right), n.id).toBe(true);
    }
  });

  it('Up and Down go to the next node above or below in the same column, and nowhere past the ends', () => {
    for (const col of new Set(tree.nodes.map(n => n.col))) {
      const column = tree.nodes.filter(n => n.col === col).sort((a, b) => a.row - b.row);
      expect(arrowTarget(tree, column[0]!.id, 'ArrowUp')).toBeNull();
      expect(arrowTarget(tree, column.at(-1)!.id, 'ArrowDown')).toBeNull();
      for (let i = 0; i + 1 < column.length; i++) {
        expect(arrowTarget(tree, column[i]!.id, 'ArrowDown')).toBe(column[i + 1]!.id);
        expect(arrowTarget(tree, column[i + 1]!.id, 'ArrowUp')).toBe(column[i]!.id);
      }
    }
  });

  it('every node can be reached from any other with the arrow keys', () => {
    const seen = new Set([tree.nodes[0]!.id]), todo = [tree.nodes[0]!.id];
    while (todo.length) {
      const id = todo.pop()!;
      for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'] as const) {
        const to = arrowTarget(tree, id, key);
        if (to && !seen.has(to)) { seen.add(to); todo.push(to); }
      }
    }
    expect(seen.size).toBe(tree.nodes.length);
  });

  it('a node not in the tree goes nowhere', () => {
    expect(arrowTarget(tree, 'tin_ore', 'ArrowRight')).toBeNull();
  });
});

describe('the dot on the button (SeenCount)', () => {
  it('nothing new when a game opens; a find shows a dot until the window is opened; finds while open are seen', () => {
    const seen = new SeenCount(3);                  // a save opened with three things found: seen already
    expect(seen.dot(3)).toBe(false);
    expect(seen.dot(4)).toBe(true);                 // found one more
    seen.open(4);                                   // the window opened: the fourth is new in it this time
    expect(seen.newFrom).toBe(3);
    expect(seen.dot(4)).toBe(false);
    seen.showing(5);                                // found while it is open
    expect(seen.dot(5)).toBe(false);
    seen.open(5);                                   // opened again: nothing new since it last showed them
    expect(seen.newFrom).toBe(5);
    expect(new SeenCount(0).dot(0)).toBe(false);    // a new game
  });
});

describe('the cards (cardHtml)', () => {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  for (const [what, state] of [['the whole camp', wholeCamp()], ['everything found', found(CAMP_NODES)]] as const) {
    it(`${what}: every node's card has its words, its recipe as have / need, what it is made with, and its links`, () => {
      const tree = discoveryTree(state, CAMP), shown = new Set(tree.nodes.map(n => n.id));
      for (const n of tree.nodes) {
        const card = nodeCard(state, CAMP, n.id)!, out = cardHtml(card, shown);
        expect(out, n.id).toContain('class="win-x dc-x"');                          // it closes
        if (n.state === 'unknown') { expect(out, n.id).toContain('Not found yet'); continue; }
        expect(out, n.id).toContain(`>${esc(card.name)}</h3>`);
        for (const w of card.words) expect(out, n.id).toContain(esc(w.text));
        for (const i of card.needs) {
          if (card.paid) {
            // made or begun: what it took, ticked, not what he has now (the Log cabin's "30 birch logs", not "18 / 30")
            expect(out, `${n.id}: ${i.id}`).toContain(`>${i.need} ${itemName(i.id, i.need!)}</span>`);
            expect(out, `${n.id}: ${i.id}`).not.toContain(`${i.have} / ${i.need}`);
            continue;
          }
          expect(out, `${n.id}: ${i.id}`).toContain(i.name === null ? 'Not found yet' : `>${esc(i.name)}</span>`);
          expect(out, `${n.id}: ${i.id}`).toContain(`${i.have} / ${i.need}`);
        }
        if (card.paid) expect(out, n.id).not.toContain('<span class="tick" aria-hidden="true">');   // every line ticked
        for (const how of new Set(card.with.map(i => i.how))) expect(out, `${n.id}: ${how}`).toContain(WITH_WORDS[how as keyof typeof WITH_WORDS]);
        if (card.where) expect(out, n.id).toContain(esc(card.where));
        for (const f of card.from) expect(out, n.id).toContain(esc(f));
        for (const u of card.usedIn) expect(out, `${n.id} -> ${u.id}`).toContain(`data-go="${u.id}"`);
        if (card.heals !== null) expect(out, n.id).toContain(`Heals ${card.heals}.`);
        if (n.state === 'made') expect(out, n.id).toMatch(/class="dc-state made">(Made|Built)</);
        // every line of a recipe that the tree shows is a link to its node, 44 px tall
        for (const i of [...card.needs, ...card.with]) if (shown.has(i.id)) expect(out, `${n.id}: ${i.id}`).toContain(`class="dc-row" type="button" data-go="${i.id}"`);
      }
    });
  }

  it('a recipe line: have / need, ticked once there are enough, or made; the thing made or begun already, what it took', () => {
    const line = (have: number, need: number | null, name: string | null = 'Stones') => ({ id: 'stone', name, how: 'needs' as const, need, have, found: true });
    expect(inputLine(line(2, 4), false)).toEqual({ name: 'Stones', count: '2 / 4', done: false });
    expect(inputLine(line(5, 4), false)).toEqual({ name: 'Stones', count: '5 / 4', done: true });
    expect(inputLine(line(0, 4), true)).toEqual({ name: '4 stones', count: '', done: true });
    expect(inputLine({ ...line(18, 30, 'Birch logs'), id: 'birch_logs' }, true)).toEqual({ name: '30 birch logs', count: '', done: true });
    expect(inputLine({ ...line(0, 1, 'Tarp'), id: 'tarp' }, true).name).toBe('1 tarp');
    expect(inputLine(line(0, 4, null), false).name).toBe('?');
    expect(inputLine(line(1, null, 'Stone axe'), false)).toEqual({ name: 'Stone axe', count: '', done: true });
    expect(inputLine(line(0, null, 'Stone axe'), false).done).toBe(false);
  });

  it('cooked fish: either fire will do, it heals, and raw fish is a link', () => {
    const s = found(CAMP_NODES), shown = new Set(discoveryTree(s, CAMP).nodes.map(n => n.id));
    const out = cardHtml(nodeCard(s, CAMP, 'cooked_fish')!, shown);
    expect(out).toContain('Cooked at (either will do)');
    expect(out).toMatch(/Heals \d+\./);
    expect(out).toContain('data-go="raw_fish"');
  });

  it('a "?" says only that it is not found yet, and what it is used for', () => {
    const s = found(['plank']), tree = discoveryTree(s, CAMP), q = tree.nodes.find(n => n.state === 'unknown')!;
    const out = cardHtml(nodeCard(s, CAMP, q.id)!, new Set(tree.nodes.map(n => n.id)));
    expect(out).toContain('Not found yet');
    expect(out).not.toContain(esc(NODES[q.id]!.name));                // its name stays hidden
    expect(out).toContain('Used for');
  });
});
