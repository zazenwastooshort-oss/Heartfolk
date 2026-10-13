// Discovery (game 0.0.38; the brief: docs/plans/2026-10-13-discovery.md): the tree's nodes and joins come from the
// data (every item and every thing in MAKES, none left on its own; a tool leads to what it gathers, the club to the
// hides and the map, the fires to cooked fish); what shows (found and made, the recipes they open glowing, their unknown
// inputs as "?", nothing else); the layout (columns by depth, three bands, no two nodes on one spot, every line's ends
// shown, its way never through a node, few crossings); every card's words (no Making, Food or Materials-and-places
// page's words lost), recipe and links; discovering by each kind of tap, by gaining, making and building, each once,
// with its notice, never for what a new game starts with; and a new game played by the bot through chapter 1, its tree
// growing as he goes. Old saves given what they have come across are in tests/saves.test.ts.
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createState, made, SAVE_VERSION, type GameState } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { deserialize, readSave, serialize } from '../src/core/save';
import { crossings, discoveryTree, nodeCard, obtainable, shownNodes, type DiscoveryTree, type NodeState } from '../src/core/discovery';
import { goblinsOf, CHIEF_ID } from '../src/core/goblins';
import { ratsOf } from '../src/core/rats';
import { step, type SimContext } from '../src/sim';
import { applyCommands, type Command } from '../src/systems/commands';
import { discoveredText, DiscoveryNotices } from '../src/ui/discovery';
import type { Hud } from '../src/ui/hud';
import { CAMP } from '../src/world/camp';
import { VILLAGE, type Layout } from '../src/world/layout';
import { BANDS, JOINS, LINED, NODES, NODE_IDS, PAGES_OF, isNode } from '../src/data/discovery';
import { ITEMS, RESOURCES } from '../src/data/skills';
import { MAKES, type MakeId } from '../src/data/making';
import { FOOD } from '../src/data/food';
import { GOALS } from '../src/data/goals';
import { MAKE_NOTES, MAKE_WHERE, SITE_WHERE, SURVIVAL } from '../src/data/survival';
import { SOURCES } from '../src/data/building';
import { PICKUPS, type PickupKind } from '../src/data/pickups';
import { Bot } from './bot';

function setup(layout: Layout = CAMP, seed = 3) {
  const state = createState(layout, seed), events = new EventBus(), log: GameEvent[] = [];
  events.on(e => log.push(e));
  const ctx: SimContext = { layout, rng: createRng(seed), events };
  return { state, events, log, ctx, layout };
}
type Setup = ReturnType<typeof setup>;
const send = (s: Setup, c: Command) => applyCommands(s.state, s.layout, [c], s.events);
const run = (s: Setup, seconds: number) => { for (let t = 0; t < seconds; t += STEP) step(s.state, STEP, s.ctx); };
const found = (s: Setup) => s.log.flatMap(e => e.type === 'discovered' ? [e.id] : []);
const pickupOf = (kind: PickupKind) => CAMP.pickups!.find(p => p.kind === kind)!.id;
const nodeOf = (resource: string) => CAMP.nodes.find(n => n.resource === resource)!.id;
/** What the camp can have at all (the village's tin, iron and oak can't be had there). */
const CAMP_NODES = NODE_IDS.filter(id => obtainable(CAMP, id));
/** A game at the camp with everything it can have found (nothing made). */
function allFound(): GameState { const s = createState(CAMP, 1); s.discovered = [...CAMP_NODES]; return s; }
const wholeCamp = () => readSave(readFileSync(new URL('./fixtures/camp/whole-camp.json', import.meta.url), 'utf8'), CAMP).state;

describe('the nodes and how they join, from the data (D2, D4)', () => {
  it('every item and every thing in MAKES is a node, once, with its name as the game writes it', () => {
    expect(NODE_IDS).toEqual([...Object.keys(ITEMS), ...Object.keys(MAKES)]);
    expect(new Set(NODE_IDS).size).toBe(NODE_IDS.length);              // no item shares an id with a thing made
    // (the name for one, for what there is only one of: the torn tarp, the chief's map)
    for (const id of Object.keys(ITEMS)) expect(NODES[id]!.name, id).toBe(['tarp', 'old_map'].includes(id) ? ITEMS[id]!.one : ITEMS[id]!.name);
    for (const d of Object.values(MAKES)) expect(NODES[d.id]!.name).toBe(d.name);
    for (const j of JOINS) { expect(isNode(j.from), j.from).toBe(true); expect(isNode(j.to), j.to).toBe(true); }
  });

  it('a material leads to every recipe that uses it, with how many it uses up; none is left on its own', () => {
    for (const d of Object.values(MAKES)) for (const [item, n] of Object.entries(d.needs)) {
      expect(JOINS.filter(j => j.from === item && j.to === d.id && j.how === 'needs').map(j => j.count), `${item} -> ${d.id}`).toEqual([n]);
    }
    // (berries alone join nothing: picked off the bushes and eaten as they are, no recipe uses them)
    for (const id of NODE_IDS) expect(JOINS.some(j => j.from === id || j.to === id) || id === 'berries', `${id} joins nothing`).toBe(true);
    // every thing made has a recipe or comes after something
    for (const id of Object.keys(MAKES)) expect(JOINS.some(j => j.to === id), id).toBe(true);
  });

  it('a tool leads to what it gathers, the club to the hides and the map, the fires to cooked fish, a building to its upgrade', () => {
    const joined = (from: string, to: string, how: string) => JOINS.some(j => j.from === from && j.to === to && j.how === how);
    expect(joined('stone_axe', 'birch_logs', 'gathers')).toBe(true);
    expect(joined('stone_axe', 'bark', 'gathers')).toBe(true);
    expect(joined('stone_pickaxe', 'copper_ore', 'gathers')).toBe(true);
    expect(joined('rod', 'raw_fish', 'gathers')).toBe(true);
    expect(joined('stone_club', 'rat_hide', 'drops')).toBe(true);
    expect(joined('stone_club', 'old_map', 'drops')).toBe(true);
    for (const fire of ['campfire', 'stone_hearth']) for (const out of ['cooked_fish', 'burnt_fish']) expect(joined(fire, out, 'cooks'), `${fire} ${out}`).toBe(true);
    expect(joined('raw_fish', 'cooked_fish', 'needs')).toBe(true);
    expect(joined('shelter', 'wall_tent', 'upgrade') && joined('wall_tent', 'log_cabin', 'upgrade')).toBe(true);
    expect(joined('campfire', 'stone_hearth', 'upgrade') && joined('woodpile', 'woodshed', 'upgrade')).toBe(true);
    expect(joined('shelter', 'chest', 'inside')).toBe(true);
    // every resource's item is gathered by the tool its skill swings (birch and oak with the axe, every rock with the pick)
    for (const r of Object.values(RESOURCES)) expect(JOINS.some(j => j.to === r.item && j.how === 'gathers'), r.id).toBe(true);
  });

  it('columns by depth: things from the ground first, what they make after, a material gathered with a tool after the tool', () => {
    for (const p of Object.values(PICKUPS)) if (p.gives !== 'book') expect(NODES[p.gives.item]!.depth, p.kind).toBe(0);
    for (const j of JOINS) expect(NODES[j.to]!.depth, `${j.from} -> ${j.to}`).toBeGreaterThan(NODES[j.from]!.depth);
    expect(NODES.birch_logs!.depth).toBeGreaterThan(NODES.stone_axe!.depth);
    expect(NODES.copper_ore!.depth).toBeGreaterThan(NODES.stone_pickaxe!.depth);
    expect(NODES.log_cabin!.depth).toBeGreaterThan(NODES.wall_tent!.depth);
  });

  it('kinds and bands: the camp (wood, stone, buildings), food, and fighting (the club, hides, armour, the map)', () => {
    const band = (id: string) => NODES[id]!.band, kind = (id: string) => NODES[id]!.kind;
    for (const id of ['plank', 'stone', 'birch_logs', 'copper_ore', 'campfire', 'shelter', 'log_cabin', 'stone_axe', 'stone_pickaxe']) expect(band(id), id).toBe('camp');
    for (const id of ['berries', 'raw_fish', 'cooked_fish', 'burnt_fish', 'rod']) expect(band(id), id).toBe('food');
    for (const id of ['stone_club', 'rat_hide', 'hide_cap', 'hide_vest', 'hide_shield', 'old_map', 'dummy']) expect(band(id), id).toBe('fighting');
    expect([kind('plank'), kind('berries'), kind('cooked_fish'), kind('stone_axe'), kind('rod'), kind('stone_club'), kind('hide_vest'), kind('campfire'), kind('chest')])
      .toEqual(['material', 'food', 'food', 'tool', 'tool', 'gear', 'gear', 'building', 'building']);
    for (const id of NODE_IDS) expect(BANDS).toContain(band(id));
  });

  it('the bands top to bottom: food, the camp, fighting, so no line passes over a band (the camp leads to both, they to nothing of the other)', () => {
    expect(BANDS).toEqual(['food', 'camp', 'fighting']);
    for (const j of JOINS.filter(x => LINED.includes(x.how))) {
      expect(Math.abs(BANDS.indexOf(NODES[j.from]!.band) - BANDS.indexOf(NODES[j.to]!.band)), `${j.from} -> ${j.to}`).toBeLessThanOrEqual(1);
    }
  });

  it('the tree draws the main joins as lines; what a thing is only used with (the shelter the chest stands in) is on the cards alone', () => {
    expect(LINED).toEqual(['needs', 'gathers', 'drops', 'cooks', 'upgrade']);
    const tree = discoveryTree(allFound(), CAMP);
    expect(tree.lines.some(l => l.from === 'shelter' && l.to === 'chest')).toBe(false);
    expect(nodeCard(allFound(), CAMP, 'chest')!.with.map(i => [i.id, i.how])).toEqual([['shelter', 'inside']]);
    expect(nodeCard(allFound(), CAMP, 'shelter')!.usedIn.map(u => u.id)).toContain('chest');
  });
});

describe('what shows (D3)', () => {
  const shown = (state: GameState) => Object.fromEntries(shownNodes(state, CAMP)) as Record<string, NodeState>;

  it('a new game at the camp shows nothing; nothing is found yet', () => {
    const s = createState(CAMP, 1);
    expect(s.discovered).toEqual([]);
    expect(discoveryTree(s, CAMP)).toMatchObject({ nodes: [], lines: [], cols: 0, rows: 0 });
  });

  it('a plank found lights it, the recipes it opens glow, their unknown inputs are "?", and nothing else shows', () => {
    const s = createState(CAMP, 1);
    s.discovered = ['plank'];
    expect(shown(s)).toEqual({ plank: 'found', campfire: 'glow', shelter: 'glow', stone: 'unknown', tarp: 'unknown', birch_logs: 'unknown' });
    const tree = discoveryTree(s, CAMP);
    expect(tree.nodes.filter(n => n.state === 'unknown').every(n => n.name === '?')).toBe(true);
    expect(tree.nodes.find(n => n.id === 'shelter')!.name).toBe('Tent');
  });

  it('made things are marked made; a tool glows what it gathers, but only what this place has (no tin or iron at the camp)', () => {
    const s = createState(CAMP, 1);
    s.discovered = ['stone_pickaxe']; s.tools.pick = true;
    const now = shown(s);
    expect(now.stone_pickaxe).toBe('made');
    expect(now.copper_ore).toBe('glow');
    expect(now.tin_ore).toBeUndefined();
    expect(now.iron_ore).toBeUndefined();
    expect(obtainable(VILLAGE, 'tin_ore')).toBe(true);
    // the stone pickaxe's own parts are "?"
    expect(now.branch).toBe('unknown');
    expect(now.stone).toBe('unknown');
  });

  it('either fire cooks: with the campfire there, the stone hearth is no "?" of cooked fish (it glows on its own)', () => {
    const s = createState(CAMP, 1);
    s.discovered = ['campfire']; s.built = ['campfire'];
    expect(shown(s)).toEqual({
      campfire: 'made', cooked_fish: 'glow', burnt_fish: 'glow', stone_hearth: 'glow', raw_fish: 'unknown', stone: 'unknown', clay: 'unknown',
      plank: 'unknown',                                                 // (what the campfire was made of, not found)
    });
  });

  it('everything the camp can have, found: the whole tree, chapter 1 and 2, and nothing the camp lacks', () => {
    const tree = discoveryTree(allFound(), CAMP);
    expect(tree.nodes.map(n => n.id).sort()).toEqual([...CAMP_NODES].sort());
    expect(CAMP_NODES).not.toContain('tin_ore');
    for (const g of GOALS) for (const id of [...Object.keys(g.needs), ...(g.makes ? [g.makes] : [])]) if (isNode(id)) expect(CAMP_NODES, `${g.id}: ${id}`).toContain(id);
  });
});

describe('the layout (D4)', () => {
  /** Checks a tree is tidy: nodes on whole spots, none shared, in their band's rows; every line between two nodes shown,
   *  a point for every column it crosses, never on a node's spot; no empty column. */
  function tidy(tree: DiscoveryTree, what: string): void {
    const at = new Map<string, string>();
    for (const n of tree.nodes) {
      expect(Number.isInteger(n.col) && Number.isInteger(n.row), `${what}: ${n.id}`).toBe(true);
      const key = `${n.col}:${n.row}`;
      expect(at.get(key), `${what}: ${n.id} on ${at.get(key)}'s spot`).toBeUndefined();
      at.set(key, n.id);
      const band = tree.bands.find(b => b.band === n.band)!;
      expect(n.row >= band.top && n.row < band.top + band.rows, `${what}: ${n.id} outside its band`).toBe(true);
      expect(n.col >= 0 && n.col < tree.cols).toBe(true);
    }
    for (let c = 0; c < tree.cols; c++) expect(tree.nodes.some(n => n.col === c), `${what}: column ${c} empty`).toBe(true);
    const byId = new Map(tree.nodes.map(n => [n.id, n]));
    for (const l of tree.lines) {
      const a = byId.get(l.from), b = byId.get(l.to), name = `${what}: ${l.from} -> ${l.to}`;
      expect(a && b, name).toBeTruthy();
      expect(l.points[0]).toEqual({ col: a!.col, row: a!.row });
      expect(l.points.at(-1)).toEqual({ col: b!.col, row: b!.row });
      expect(l.points.map(p => p.col), name).toEqual(Array.from({ length: b!.col - a!.col + 1 }, (_, k) => a!.col + k));
      for (const p of l.points.slice(1, -1)) {
        expect(at.has(`${p.col}:${p.row}`), `${name} runs through ${at.get(`${p.col}:${p.row}`)}`).toBe(false);
        expect(p.row >= -0.5 && p.row <= tree.rows - 0.5, name).toBe(true);
      }
    }
    // every main join between two nodes shown is a line, once
    const ids = new Set(tree.nodes.map(n => n.id));
    expect(tree.lines.length).toBe(JOINS.filter(j => LINED.includes(j.how) && ids.has(j.from) && ids.has(j.to)).length);
    // a line within a band keeps to it (its rows, or between them and at its edges); one between two bands runs along
    // the gutter at the edge of the band it goes to, never among a band's things on the way
    const band = (id: string) => tree.bands.find(b => b.band === NODES[id]!.band)!;
    for (const l of tree.lines) {
      const a = band(l.from), b = band(l.to), name = `${what}: ${l.from} -> ${l.to}`;
      const gutter = a === b ? null : b.top > a.top ? b.top - 0.5 : b.top + b.rows - 0.5;
      for (const p of l.points.slice(1, -1)) {
        if (gutter !== null) expect(p.row, name).toBe(gutter);
        else expect(p.row >= a.top - 0.5 && p.row <= a.top + a.rows - 0.5, name).toBe(true);
      }
    }
    expect(tree.bands.map(b => b.band)).toEqual(BANDS.filter(b => tree.nodes.some(n => n.band === b)));
    expect(tree.rows).toBe(tree.bands.reduce((a, b) => a + b.rows, 0));
  }

  it('the whole tree, and the whole camp save, are tidy, with few crossings', () => {
    for (const [what, state] of [['everything found', allFound()], ['the whole camp', wholeCamp()]] as const) {
      const tree = discoveryTree(state, CAMP);
      tidy(tree, what);
      // (the stones and branches feed most of chapter 1 and 2's recipes, in all three bands, so some crossing beside
      // them is unavoidable: 22 when this was written, 43 before the bands were put food, camp, fighting, things from
      // the ground beside their use, the shelter's line to the chest left to the cards and the layout tried from a few
      // starts)
      expect(crossings(tree), what).toBeLessThanOrEqual(24);
    }
  });

  it('any set of things found is tidy too, with few crossings, and laid out the same each time', () => {
    const rng = createRng(38);
    for (let n = 0; n < 60; n++) {
      const s = createState(CAMP, 1);
      s.discovered = CAMP_NODES.filter(() => rng.next() < 0.35);
      const tree = discoveryTree(s, CAMP);
      tidy(tree, s.discovered.join(','));
      expect(crossings(tree), s.discovered.join(',')).toBeLessThanOrEqual(26);   // (at most 25 when this was written; 44 before)
      expect(JSON.stringify(discoveryTree({ ...s, discovered: [...s.discovered].reverse() }, CAMP))).toBe(JSON.stringify(tree));
    }
  });

  it('columns by depth, in order, and a material gathered with a tool in a column after the tool', () => {
    const tree = discoveryTree(allFound(), CAMP), col = (id: string) => tree.nodes.find(n => n.id === id)!.col;
    for (const l of tree.lines) expect(col(l.to), `${l.from} -> ${l.to}`).toBeGreaterThan(col(l.from));
    expect(col('plank')).toBe(0);
    expect(col('birch_logs')).toBeGreaterThan(col('stone_axe'));
    expect(col('raw_fish')).toBeGreaterThan(col('rod'));
    expect(col('log_cabin')).toBe(tree.cols - 1);
    // a thing from the ground sits just before the first thing it leads to, beside its use rather than a long line
    // away: fibre by the wall tent, the tarp by the tent, clay by the stone hearth
    for (const n of tree.nodes) {
      if (tree.lines.some(l => l.to === n.id)) continue;
      const uses = tree.lines.filter(l => l.from === n.id).map(l => col(l.to));
      if (uses.length) expect(n.col, n.id).toBe(Math.min(...uses) - 1);
    }
    expect([col('fibre'), col('tarp'), col('clay')]).toEqual([col('wall_tent') - 1, col('shelter') - 1, col('stone_hearth') - 1]);
  });
});

describe('the cards (D8)', () => {
  const state = allFound();
  const cards = CAMP_NODES.map(id => nodeCard(state, CAMP, id)!);

  it('no Making, Food or Materials-and-places page\'s words are lost: every one is on a card', () => {
    const words = new Set(cards.flatMap(c => c.words.map(w => w.text))), wheres = new Set(cards.map(c => c.where));
    for (const text of Object.values(MAKE_NOTES)) expect(words.has(text!), text).toBe(true);
    for (const p of SURVIVAL.filter(x => x.section !== 'tips')) expect(words.has(p.text), p.id).toBe(true);
    for (const text of [...Object.values(MAKE_WHERE), ...Object.values(SITE_WHERE)]) expect(wheres.has(text!), text).toBe(true);
    // and every goal page about a thing (not the practice goals, which are about levels: Information's Story has them)
    for (const g of GOALS) if (g.makes || Object.keys(g.needs).some(isNode)) expect(words.has(g.page), g.id).toBe(true);
    // the source lines of the Build list too
    const from = new Set(cards.flatMap(c => c.from));
    for (const line of Object.values(SOURCES)) expect(from.has(line), line).toBe(true);
  });

  it('every card has its words, where it comes from or is made, and its links', () => {
    for (const c of cards) {
      expect(c.words.length + c.from.length, c.id).toBeGreaterThan(0);
      if (MAKES[c.id as MakeId]) {
        expect(c.words[0], c.id).toEqual({ title: null, text: MAKE_NOTES[c.id as MakeId] });
        expect(c.where, c.id).not.toBe('');
      } else expect(c.from.length, c.id).toBeGreaterThan(0);
      expect(c.from.every(line => /^[A-Z][^:]+: [a-z].*\.$/.test(line)), c.from.join(' | ')).toBe(true);
      for (const link of c.usedIn) expect(JOINS.some(j => j.from === c.id && j.to === link.id), `${c.id} -> ${link.id}`).toBe(true);
    }
    // a food page is on its food's card, with how much it heals
    expect(nodeCard(state, CAMP, 'cooked_fish')).toMatchObject({ heals: FOOD.cooked_fish!.heals, where: 'Cooked at the campfire or the stone hearth.' });
    expect(nodeCard(state, CAMP, 'cooked_fish')!.words.map(w => w.title)).toEqual(['Cooked fish', 'A cooked meal']);
    expect(nodeCard(state, CAMP, 'plank')!.heals).toBeNull();
    // the places' pages go on what they give: the nest on rat hides, the goblin camp on the torn map
    expect(PAGES_OF.rat_hide!.map(p => p.id)).toEqual(['place:nest']);
    expect(PAGES_OF.old_map!.map(p => p.id)).toEqual(['place:goblins']);
    expect(nodeCard(state, CAMP, 'copper_ore')!.from).toEqual(['Copper ore: mine the copper rocks with a pickaxe.']);
    expect(nodeCard(state, CAMP, 'rat_hide')!.usedIn.map(l => l.id)).toEqual(['hide_cap', 'hide_vest', 'hide_shield']);
  });

  it('its recipe: each need with how many he has, carried or stored, and whether it is found ("?" if not)', () => {
    const s = createState(CAMP, 1);
    s.discovered = ['plank', 'tarp']; s.player.backpack = { plank: 2 }; s.bank = { plank: 1 };
    const card = nodeCard(s, CAMP, 'shelter')!;
    expect(card.state).toBe('glow');
    expect(card.needs).toEqual([
      { id: 'tarp', name: 'Tarp', how: 'needs', need: 1, have: 0, found: true },
      { id: 'plank', name: 'Planks', how: 'needs', need: 4, have: 3, found: true },
      { id: 'birch_logs', name: null, how: 'needs', need: 10, have: 0, found: false },
    ]);
    // where its found materials come from; the "?" one's isn't told
    expect(card.from).toEqual(['Tarp: pick up the torn tarp. No more will come.', 'Planks: gather the planks. No more will come.']);
    expect(card.paid).toBe(false);
    // the gathered: what it is gathered with; a "?" card says nothing of itself
    s.discovered.push('stone_axe'); s.tools.axe = true;
    expect(nodeCard(s, CAMP, 'birch_logs')!.with).toEqual([{ id: 'stone_axe', name: 'Stone axe', how: 'gathers', need: null, have: 1, found: true }]);
    expect(nodeCard(s, CAMP, 'campfire')!.needs.find(n => n.id === 'stone')).toMatchObject({ name: null, found: false });
    expect(nodeCard(s, CAMP, 'stone')).toMatchObject({ name: '?', state: 'unknown', words: [], needs: [], from: [] });
    expect(nodeCard(s, CAMP, 'stone')!.usedIn.map(l => l.id)).toContain('campfire');
    // nothing for a node not shown
    expect(nodeCard(s, CAMP, 'log_cabin')).toBeNull();
    expect(nodeCard(s, CAMP, 'no_such_thing')).toBeNull();
  });
});

describe('discovering (In 3, D1)', () => {
  it('the first tap discovers what it names, even before he can use it: a copper rock with no pickaxe, copper ore', () => {
    const s = setup();
    send(s, { type: 'work', nodeId: nodeOf('copper_rock') });
    expect(s.log.map(e => e.type)).toEqual(['discovered', 'needTool']);
    expect(s.state.discovered).toEqual(['copper_ore']);
    // a second tap: nothing new
    send(s, { type: 'work', nodeId: nodeOf('copper_rock') });
    expect(found(s)).toEqual(['copper_ore']);
  });

  it('each kind of tap: trees, rocks, ripples, things on the ground, the book, creatures, the camp\'s buildings and the fire', () => {
    const tap = (c: Command, prep?: (st: GameState) => void) => { const s = setup(); prep?.(s.state); send(s, c); return found(s); };
    expect(tap({ type: 'work', nodeId: nodeOf('birch_tree') })).toEqual(['birch_logs']);
    expect(tap({ type: 'work', nodeId: nodeOf('fishing_spot') })).toEqual(['raw_fish']);
    expect(tap({ type: 'pickup', id: pickupOf('plank') })).toEqual(['plank']);
    expect(tap({ type: 'pickup', id: pickupOf('crate') })).toEqual(['plank']);
    expect(tap({ type: 'pickup', id: pickupOf('tarp') })).toEqual(['tarp']);
    expect(tap({ type: 'pickup', id: pickupOf('stone') })).toEqual(['stone']);
    expect(tap({ type: 'pickup', id: pickupOf('branch') })).toEqual(['branch']);
    expect(tap({ type: 'pickup', id: pickupOf('bush') })).toEqual(['berries']);
    expect(tap({ type: 'pickup', id: pickupOf('reeds') })).toEqual(['fibre']);
    expect(tap({ type: 'pickup', id: pickupOf('clay') })).toEqual(['clay']);
    expect(tap({ type: 'pickup', id: pickupOf('book') })).toEqual([]);
    expect(tap({ type: 'fight', target: ratsOf(CAMP)[0]!.id })).toEqual(['rat_hide']);          // even with no weapon yet
    expect(tap({ type: 'fight', target: goblinsOf(CAMP).find(g => !g.chief)!.id })).toEqual(['old_map']);
    expect(tap({ type: 'fight', target: CHIEF_ID }, st => { st.goblinCamp.chiefOut = true; })).toEqual(['old_map']);
    expect(tap({ type: 'fight', target: CHIEF_ID })).toEqual([]);                                // in his tent: nothing to tap
    expect(tap({ type: 'fight', target: 'dummy' })).toEqual([]);                                 // not built: nothing there
    expect(tap({ type: 'fight', target: 'dummy' }, st => { st.built = ['dummy']; st.discovered = ['dummy']; })).toEqual([]);
    expect(tap({ type: 'build', id: 'campfire' })).toEqual(['campfire']);                        // its marker (refused or not)
    expect(tap({ type: 'visit', id: 'chest' }, st => { st.built = ['shelter', 'chest']; })).toEqual(['chest']);
    expect(tap({ type: 'cook' }, st => { st.built = ['campfire']; })).toEqual(['campfire', 'cooked_fish']);
    expect(tap({ type: 'cook' })).toEqual([]);                                                    // no fire: nothing
    expect(tap({ type: 'walk', to: { x: 1, z: 1 } })).toEqual([]);
    // the goal's next step discovers what the tap it sends names (his book found, the wreck's planks or tarp)
    expect(['plank', 'tarp']).toContain(tap({ type: 'next' }, st => { st.hasBook = true; })[0]);
  });

  it('a tap while he sleeps or lies knocked out still discovers (the tap waits, the discovery does not)', () => {
    const s = setup();
    s.state.player.task = { kind: 'knockedOut', wakeAt: s.state.time + 3, by: 'rat1' };
    send(s, { type: 'work', nodeId: nodeOf('birch_tree') });
    expect(found(s)).toEqual(['birch_logs']);
  });

  it('whatever comes into his hands, or he makes or builds, is discovered on the step; each once, in order', () => {
    const s = setup();
    s.state.player.backpack = { stone: 2, branch: 2 }; s.state.goalsDone = ['salvage', 'campfire']; s.state.built = ['campfire'];
    run(s, STEP);
    expect(found(s)).toEqual(['stone', 'branch', 'campfire']);
    send(s, { type: 'make', id: 'stone_axe' });
    run(s, MAKES.stone_axe.time + 1);
    expect(made(s.state, 'stone_axe')).toBe(true);
    expect(found(s)).toEqual(['stone', 'branch', 'campfire', 'stone_axe']);
    // gear he wears, things built and begun, things stored, the logs on the pile
    s.state.equipment.weapon = 'stone_club'; s.state.built.push('woodpile'); s.state.underway = { shelter: 3 }; s.state.bank = { rat_hide: 1 };
    run(s, STEP);
    expect(found(s).slice(4).sort()).toEqual(['rat_hide', 'shelter', 'stone_club', 'woodpile']);
    s.state.woodpile = 4;
    run(s, STEP);
    expect(found(s).at(-1)).toBe('birch_logs');
    expect(s.state.discovered).toEqual(found(s));
    run(s, 5);
    expect(new Set(found(s)).size).toBe(found(s).length);
  });

  it('nothing for what a new game starts with; nothing at all in the village (it has no Discovery)', () => {
    const s = setup();
    run(s, 5);
    expect(found(s)).toEqual([]);
    const v = setup(VILLAGE);
    expect(v.state.discovered).toEqual(['stone_axe', 'stone_pickaxe', 'rod']);      // it starts with every tool
    v.state.player.backpack = { copper_ore: 3 };
    send(v, { type: 'work', nodeId: VILLAGE.nodes[0]!.id });
    run(v, 5);
    expect(found(v)).toEqual([]);
  });

  it('a save made as he plays reads back exactly, the order found kept', () => {
    const s = setup();
    send(s, { type: 'pickup', id: pickupOf('stone') });
    send(s, { type: 'work', nodeId: nodeOf('copper_rock') });
    run(s, 20);
    expect(s.state.discovered).toEqual(['stone', 'copper_ore']);
    const back = deserialize(serialize(s.state), CAMP);
    expect(back).toEqual(s.state);
    // checked: a list with something in it the game can't read (a number, an unknown thing, a repeat) keeps the ones it
    // can, and is given what the save implies as well (the review of 0.0.38: nothing lost, nothing told again); one that
    // isn't a list is given what the save implies
    const raw = JSON.parse(serialize(s.state));
    raw.discovered = ['copper_ore', 7, 'no_such_thing', 'copper_ore', 'stone'];
    const mended = deserialize(JSON.stringify(raw), CAMP).discovered;
    expect(mended).toEqual(expect.arrayContaining(['copper_ore', 'stone']));
    expect(new Set(mended).size).toBe(mended.length);
    // (the copper rock only tapped is lost with a list that isn't one; the stone he picked up isn't)
    raw.discovered = 'x';
    expect(deserialize(JSON.stringify(raw), CAMP).discovered).toEqual(expect.arrayContaining(['stone']));
  });
});

describe('the notice (D5)', () => {
  it('names what was found as the game writes it', () => {
    expect(discoveredText(['copper_ore'])).toBe('Discovered: copper ore.');
    expect(discoveredText(['campfire', 'cooked_fish'])).toBe('Discovered: campfire and cooked fish.');
    expect(discoveredText(['plank', 'stone', 'tarp'])).toBe('Discovered: planks, stones and tarp.');
    expect(discoveredText(['old_map'])).toBe('Discovered: torn map.');
    expect(discoveredText(['plank', 'stone', 'tarp', 'branch', 'clay'])).toBe('Discovered: planks, stones and 3 more.');
  });

  /** A notice line as the page has it, and the HUD's notice(), for the listener to work with outside a browser. */
  function page() {
    const el = { textContent: '', shown: false, classList: { contains: (c: string) => c === 'show' && el.shown } };
    const hud = { notice: (text: string) => { el.textContent = text; el.shown = true; } } as unknown as Hud;
    (globalThis as { document?: unknown }).document = { getElementById: (id: string) => (id === 'notice' ? el : null) };
    return { el, hud };
  }
  afterEach(() => { delete (globalThis as { document?: unknown }).document; });

  it('once per thing; with the tap\'s own notice it comes after its words; a notice already up is let finish first', () => {
    const { el, hud } = page(), s = setup(), notices = new DiscoveryNotices(s.events, hud);
    // the tap's refusal and the discovery in the same moment: both said
    s.events.on(e => { if (e.type === 'needTool') hud.notice('You need a pickaxe to mine rocks.'); });
    send(s, { type: 'work', nodeId: nodeOf('copper_rock') });
    notices.update();
    expect(el.textContent).toBe('You need a pickaxe to mine rocks. Discovered: copper ore.');
    // the same again: nothing new to say
    el.shown = false;
    send(s, { type: 'work', nodeId: nodeOf('copper_rock') });
    notices.update();
    expect(el.textContent).toBe('You need a pickaxe to mine rocks.');
    el.shown = false;
    notices.update();
    // found while an older notice is still up: it waits for it to go
    hud.notice('Nightfall: off to stoke the fire.');
    notices.update();
    send(s, { type: 'pickup', id: pickupOf('stone') });
    notices.update();
    expect(el.textContent).toBe('Nightfall: off to stoke the fire.');
    el.shown = false;
    notices.update();
    expect(el.textContent).toBe('Discovered: stones.');
  });
});

describe('a new game, played (the playthrough bot through chapter 1)', () => {
  it('the tree grows as he goes: every thing of chapter 1 found, each told once, the tree tidy all along', () => {
    const s = setup(CAMP, 2), bot = new Bot(CAMP, s.events);
    const chest = GOALS.findIndex(g => g.makes === 'chest');
    const sizes: number[] = [];
    let last = -1;
    for (let t = 0; t < 40 * 60 && !s.state.goalsDone.includes('chest'); t += STEP) {
      bot.tick(s.state, s.events);
      step(s.state, STEP, s.ctx);
      if (s.state.discovered.length !== last) { last = s.state.discovered.length; sizes.push(last); }
    }
    expect(s.state.goalsDone).toContain('chest');
    for (const g of GOALS.slice(0, chest + 1)) for (const id of [...Object.keys(g.needs), ...(g.makes ? [g.makes] : [])]) {
      if (isNode(id)) expect(s.state.discovered, `${g.id}: ${id}`).toContain(id);
    }
    expect(found(s)).toEqual(s.state.discovered);
    expect(sizes.length).toBeGreaterThan(5);                  // found a few at a time, not all at once
    const tree = discoveryTree(s.state, CAMP);
    expect(tree.nodes.filter(n => n.state === 'made').map(n => n.id).sort()).toEqual(['campfire', 'chest', 'shelter', 'stone_axe', 'stone_pickaxe', 'woodpile']);
  });
});

describe('old and damaged saves (the review of 0.0.38)', () => {
  const whole = () => JSON.parse(readFileSync(new URL('./fixtures/camp/whole-camp.json', import.meta.url), 'utf8')) as Record<string, unknown>;

  it("an old save finds what went into what he built, though none of it is left: the upgrades' fibre, clay and bark", () => {
    const raw = whole();
    raw.version = 12; delete raw.discovered;
    const keep = (o: unknown) => { const r = o as Record<string, number>; for (const k of ['fibre', 'clay', 'bark']) delete r[k]; };
    keep(raw.bank); keep((raw.player as Record<string, unknown>).backpack);
    const state = readSave(JSON.stringify(raw), CAMP).state;
    expect(state.built).toEqual(expect.arrayContaining(['wall_tent', 'log_cabin', 'stone_hearth', 'woodshed']));
    for (const id of ['fibre', 'clay', 'bark']) expect(state.discovered, id).toContain(id);
    expect(nodeCard(state, CAMP, 'wall_tent')!.needs.every(n => n.found)).toBe(true);
  });

  it('a damaged list (something in it the game cannot read) is given what the save implies too, so nothing is told again', () => {
    const raw = whole();
    const good = readSave(JSON.stringify(raw), CAMP).state.discovered;
    for (const junk of [[1, 2], ['nonsense'], ['plank', 7]]) {
      const r = whole(); r.version = SAVE_VERSION; r.discovered = junk;
      const s = readSave(JSON.stringify(r), CAMP).state, events = new EventBus(), log: GameEvent[] = [];
      events.on(e => log.push(e));
      expect(new Set(s.discovered), JSON.stringify(junk)).toEqual(new Set([...good, ...(junk.includes('plank') ? ['plank'] : [])]));
      step(s, STEP, { layout: CAMP, rng: createRng(1), events });
      expect(log.filter(e => e.type === 'discovered'), JSON.stringify(junk)).toEqual([]);
    }
    // a good list reads back exactly, in its order
    const r = whole(); r.version = SAVE_VERSION; r.discovered = [...good].reverse();
    expect(readSave(JSON.stringify(r), CAMP).state.discovered).toEqual([...good].reverse());
  });
});
