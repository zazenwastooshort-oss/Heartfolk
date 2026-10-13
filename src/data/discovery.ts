// Discovery (game 0.0.38; the owner, 13 Oct 2026: "I think lets call it discovery now, and as u click an object thats
// when u discover it and at that point u can access recepies so its really like a tree"): everything he can find, as
// nodes of a tree like Minecraft's, and how they join. The brief is docs/plans/2026-10-13-discovery.md (the lead's
// picks D2 and D4). Tables only, and all of them worked out from the other tables, never written by hand, so a new item
// or a new row in MAKES joins the tree, takes its column and its band, and gets its words with no work here.
//
// The nodes (D2): things, not places. Every item (ITEMS in data/skills.ts: materials, and food, FOOD and what cooking
// makes) and every thing in MAKES (data/making.ts: tools, gear, the camp's buildings and their upgrades). Where things
// come from (a birch tree, a copper rock, the nest) is said on the cards (ORIGINS), never a node of its own.
// The joins, each from what leads to what:
//   needs: a material to the recipes that use it up (MAKES' needs), and raw fish to what cooking makes of it;
//   gathers: a tool to the material it gathers (SWINGS' tool for each skill in RESOURCES), the stone axe to the bark
//     peeled while chopping birch too (BARK);
//   drops: his first weapon (gear for the weapon slot, data/combat.ts) to what beaten creatures leave (RAT's hides, the
//     goblin chief's torn map);
//   cooks: each fire built at the fire spot (the campfire, the stone hearth) to what cooking makes (COOK);
//   upgrade: a camp building to the upgrade built in its place (STAGED's upgrades), the tent to the wall tent;
//   inside: the shelter to what stands in it (STAGED's inside: the storage chest).
// Berries alone join nothing: picked off the bushes and eaten as they are, no recipe uses them (a node from the ground,
// on its own in the food band).
// Each node has a kind (material, food, tool, gear, building), a band (D4: the camp, food, fighting) and a depth, its
// column: things from the ground first (nothing joins into them), then what they make, then what that makes, so a
// material gathered with a tool sits after the tool (1 more than the deepest thing joining into it).
import { ITEMS, RESOURCES, TOOL_IDS, type ToolId } from './skills';
import { FOOD } from './food';
import { MAKES, type MakeId } from './making';
import { SWINGS } from './animation';
import { GEAR } from './combat';
import { RAT } from './rats';
import { CHIEF } from './goblins';
import { COOK } from './cooking';
import { BARK, STAGED, LINES } from './building';
import { PICKUPS, type PickupKind } from './pickups';
import { SURVIVAL, type SurvivalDef } from './survival';
import { GOALS, type Goal } from './goals';
import type { Place } from './thoughts';

export type NodeKind = 'material' | 'food' | 'tool' | 'gear' | 'building';
/** The tree's three bands (D4): the camp (wood, stone, buildings), food, and fighting (the club, hides, armour, the
 *  map). BANDS, below, puts them top to bottom. */
export type Band = 'camp' | 'food' | 'fighting';
/** How one thing leads to another (the list at the top). */
export type JoinHow = 'needs' | 'gathers' | 'drops' | 'cooks' | 'upgrade' | 'inside';
/** The joins the tree draws as lines, the main ones: what a thing is made from, the tool that gathers it, the weapon
 *  that wins it, the fire that cooks it, the step it is built in place of. What a thing is only used with (the shelter
 *  the chest stands in) is said on the cards alone, so the tree keeps to the lines that lead on. */
export const LINED: JoinHow[] = ['needs', 'gathers', 'drops', 'cooks', 'upgrade'];

/** A node. name: as the game writes it ("Birch logs", "Stone axe", "Tent"; "Tarp" and "Torn map", of which there is
 *  only one: ONLY_ONE). depth: its column (at the top). order: its
 *  place among all the nodes (the items in ITEMS' order, then MAKES' order), which the layout starts from. */
export interface DiscoveryNode { id: string; name: string; kind: NodeKind; band: Band; depth: number; order: number }

/** One thing leading to another. count: how many of `from` the recipe uses up (a 'needs' join); the rest are needed
 *  but never used up (the tool, the weapon, the fire, the step before an upgrade, the shelter the chest stands in). */
export interface Join { from: string; to: string; how: JoinHow; count?: number }

/** The training dummy, the one camp building that is for fighting (core/targets.ts fights it by this id): in the
 *  fighting band with the club. */
const PRACTICE: MakeId = 'dummy';

const makes = Object.values(MAKES);
/** What makes each tool (the stone axe gives the axe). */
export const TOOL_MAKER: Record<ToolId, MakeId | null> = Object.fromEntries(TOOL_IDS.map(t =>
  [t, makes.find(d => d.gives.kind === 'tool' && d.gives.tool === t)?.id ?? null])) as Record<ToolId, MakeId | null>;
/** What makes a piece of gear (by its id in GEAR), or null. */
export const gearMaker = (gear: string): MakeId | null => makes.find(d => d.gives.kind === 'gear' && d.gives.gear === gear)?.id ?? null;
/** His weapons: what makes gear for the weapon slot (the stone club). */
const WEAPONS = makes.filter(d => d.gives.kind === 'gear' && GEAR[d.gives.gear].slot === 'weapon').map(d => d.id);
/** What beaten creatures leave, by who leaves it: a rat's hide, the goblin chief's torn map. */
export const DROPS: Record<'rat' | 'chief', string> = { rat: RAT.drop.item, chief: CHIEF.drop };
/** The fires he cooks at: what is built at the fire spot (the campfire, then the stone hearth). */
export const FIRES: MakeId[] = makes.filter(d => d.at === 'hearth').map(d => d.id);
/** What cooking makes of raw fish: a cooked fish, now and then a burnt one. */
const COOKED = [COOK.cooked, COOK.burnt];

function joins(): Join[] {
  const out: Join[] = [];
  for (const d of makes) {
    for (const [item, count] of Object.entries(d.needs)) out.push({ from: item, to: d.id, how: 'needs', count });
    const staged = STAGED[d.id];
    if (staged?.upgrades) out.push({ from: staged.upgrades, to: d.id, how: 'upgrade' });
    if (staged?.inside) out.push({ from: LINES[staged.inside][0]!, to: d.id, how: 'inside' });
  }
  for (const r of Object.values(RESOURCES)) {
    const maker = TOOL_MAKER[SWINGS[r.skill].tool];
    if (maker && !out.some(j => j.from === maker && j.to === r.item)) out.push({ from: maker, to: r.item, how: 'gathers' });
  }
  const peeler = TOOL_MAKER[SWINGS[RESOURCES[BARK.tree]!.skill].tool];
  if (peeler) out.push({ from: peeler, to: BARK.item, how: 'gathers' });
  for (const w of WEAPONS) for (const item of new Set(Object.values(DROPS))) out.push({ from: w, to: item, how: 'drops' });
  for (const item of COOKED) {
    out.push({ from: COOK.raw, to: item, how: 'needs', count: 1 });
    for (const fire of FIRES) out.push({ from: fire, to: item, how: 'cooks' });
  }
  return out;
}

/** Every join in the tree. */
export const JOINS: Join[] = joins();

/** What a node is, by its id. */
function kindOf(id: string): NodeKind {
  const d = Object.hasOwn(MAKES, id) ? MAKES[id as MakeId] : null;
  if (d) return d.gives.kind === 'tool' ? 'tool' : d.gives.kind === 'gear' ? 'gear' : 'building';
  return Object.hasOwn(FOOD, id) || id === COOK.raw || COOKED.includes(id) ? 'food' : 'material';
}

/** Its band: gear, what creatures leave and the training dummy are fighting; food, and a tool that gathers only food
 *  (the fishing rod), are food; everything else is the camp. */
function bandOf(id: string, kind: NodeKind): Band {
  if (kind === 'gear' || Object.values(DROPS).includes(id) || id === PRACTICE) return 'fighting';
  if (kind === 'food') return 'food';
  if (kind === 'tool') {
    const gathers = JOINS.filter(j => j.from === id && j.how === 'gathers').map(j => kindOf(j.to));
    if (gathers.length && gathers.every(k => k === 'food')) return 'food';
  }
  return 'camp';
}

/** Items there is only ever one of, called by their name for one ("Tarp", "Torn map", not "Tarps"): picked up on its
 *  own and never back (the torn tarp), or left once (the goblin chief's map). */
const ONLY_ONE = new Set([
  ...Object.values(PICKUPS).flatMap(p => p.respawn === null && p.gather === null && p.gives !== 'book' ? [p.gives.item] : []),
  CHIEF.drop,
]);

function nodes(): Record<string, DiscoveryNode> {
  const ids = [...Object.keys(ITEMS), ...Object.keys(MAKES)];
  const depth = new Map<string, number>();
  const into = (id: string) => JOINS.filter(j => j.to === id).map(j => j.from);
  const depthOf = (id: string, seen: string[] = []): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (seen.includes(id)) throw new Error(`the discovery tree goes round in a loop at ${id}`);
    const from = into(id), d = from.length ? 1 + Math.max(...from.map(f => depthOf(f, [...seen, id]))) : 0;
    depth.set(id, d);
    return d;
  };
  return Object.fromEntries(ids.map((id, order) => {
    const item = ITEMS[id], kind = kindOf(id);
    const name = item ? (ONLY_ONE.has(id) && item.one) || item.name : MAKES[id as MakeId].name;
    return [id, { id, name, kind, band: bandOf(id, kind), depth: depthOf(id), order }];
  }));
}

/** Every node, by id. */
export const NODES: Record<string, DiscoveryNode> = nodes();
/** Every node's id, in their order. */
export const NODE_IDS: string[] = Object.keys(NODES);
export const isNode = (id: string): boolean => Object.hasOwn(NODES, id);

/** The bands top to bottom: the order in which fewest lines pass over a band between their ends' bands (on a tie, the
 *  camp, food, fighting). The camp leads to both food and fighting and they to nothing of each other's, so the camp is
 *  in the middle: food above it, fighting below, and no line runs from the camp through the food to the club. */
function bandOrder(): Band[] {
  const listed: Band[] = ['camp', 'food', 'fighting'];
  const orders = (left: Band[]): Band[][] => left.length < 2 ? [left] : left.flatMap((b, i) => orders(left.filter((_, k) => k !== i)).map(o => [b, ...o]));
  const over = (order: Band[]) => JOINS.filter(j => LINED.includes(j.how))
    .reduce((n, j) => n + Math.max(0, Math.abs(order.indexOf(NODES[j.from]!.band) - order.indexOf(NODES[j.to]!.band)) - 1), 0);
  return orders(listed).reduce((best, o) => over(o) < over(best) ? o : best);
}
export const BANDS: Band[] = bandOrder();

/** Where an item comes from, for its card and for whether a layout has any (core/discovery.ts): picked up off the
 *  ground (a pickup kind, data/pickups.ts), gathered at a resource node (RESOURCES), left by a beaten creature, cooked
 *  at the fire, or peeled off what a tree gives (BARK). Things in MAKES are made. */
export type Origin = { pickup: PickupKind } | { resource: string } | { foe: 'rat' | 'chief' } | { cook: string } | { peel: string };

function origins(id: string): Origin[] {
  const out: Origin[] = [];
  for (const p of Object.values(PICKUPS)) if (p.gives !== 'book' && p.gives.item === id) out.push({ pickup: p.kind });
  for (const r of Object.values(RESOURCES)) if (r.item === id) out.push({ resource: r.id });
  for (const [foe, item] of Object.entries(DROPS) as ['rat' | 'chief', string][]) if (item === id) out.push({ foe });
  if (COOKED.includes(id)) out.push({ cook: id });
  if (id === BARK.item) out.push({ peel: BARK.tree });
  return out;
}

/** Where each item comes from (an item with none here comes from nowhere yet, as the village's tin did). */
export const ORIGINS: Record<string, Origin[]> = Object.fromEntries(Object.keys(ITEMS).map(id => [id, origins(id)]));

/** What each place in his book gives (data/thoughts.ts Place), so its Materials and places page goes on the cards of
 *  those things: the wreck's things that never come back (its planks and tarp), the berry bushes' berries, the fishing
 *  spots' fish, the copper rocks' ore, the nest's rat hides, the goblin camp's torn map. */
export const PLACE_GIVES: Record<Place, string[]> = {
  wreck: [...new Set(Object.values(PICKUPS).flatMap(p => p.respawn === null && p.gives !== 'book' ? [p.gives.item] : []))],
  bushes: Object.values(PICKUPS).flatMap(p => p.plant && p.gives !== 'book' ? [p.gives.item] : []),
  fishing: [RESOURCES.fishing_spot!.item],
  copper: [RESOURCES.copper_rock!.item],
  nest: [DROPS.rat],
  goblins: [DROPS.chief],
};

/** The things a goal is about, for the cards its page goes on: what a making goal makes, else what a gathering goal
 *  asks for (nodes only: not his book); none for a goal that asks only for skill levels (practice). */
export const goalThings = (g: Goal): string[] => g.makes ? (isNode(g.makes) ? [g.makes] : []) : Object.keys(g.needs).filter(isNode);

/** The things a page of the survival book (data/survival.ts) is about, for the cards its words go on (D8): its item,
 *  what its place gives, what it is about built, or the things of the goal it waits for (the falls: the wreck's planks
 *  and tarp, salvage's things). A tip is about no thing: Tips go to Information, not Discovery. */
export function pageThings(p: SurvivalDef): string[] {
  if (p.section === 'tips') return [];
  const f = p.found;
  if ('item' in f) return isNode(f.item) ? [f.item] : [];
  if ('near' in f) return PLACE_GIVES[f.near];
  if ('built' in f) return [f.built];
  if ('goal' in f) { const g = GOALS.find(x => x.id === f.goal); return g ? goalThings(g) : []; }
  return [];
}

/** The book's pages (Food, and Materials and places) by the thing they are about. */
export const PAGES_OF: Record<string, SurvivalDef[]> = Object.fromEntries(NODE_IDS.map(id => [id, SURVIVAL.filter(p => pageThings(p).includes(id))]));
