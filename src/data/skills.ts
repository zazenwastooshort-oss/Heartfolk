// Skills and what can be gathered, as tables only. Values come from prototypes/wanderskill.html (ACTIONS).
// time: seconds per item at tool tier 1 (about 3x the prototype's since 0.0.21: the owner found gathering far too quick
// for an idle game, 12 Oct 2026); xp: per item; value: gold at the merchant.

/** The skills worked at a node (a rock, a tree, since chapter 2 a fishing spot) with a tool: each has a swing (SWINGS in
 *  data/animation). */
export type GatherSkill = 'mining' | 'woodcutting' | 'fishing';
/** Chapter 2, holding the camp (0.0.22): the combat skills, Attack, Strength and Defence as in OSRS, and Vitality,
 *  which sets his health (not Hitpoints, so it differs a bit: the owner, 12 Oct 2026); Fishing and Cooking for food. */
export type SkillId = GatherSkill | 'attack' | 'strength' | 'defence' | 'vitality' | 'fishing' | 'cooking';

/** verb: what the hover text and notices call working a node of this skill */
export interface SkillDef { id: SkillId; name: string; verb: string; color: string }

export const SKILLS: Record<SkillId, SkillDef> = {
  mining: { id: 'mining', name: 'Mining', verb: 'Mine', color: '#d8a35a' },
  woodcutting: { id: 'woodcutting', name: 'Woodcutting', verb: 'Chop', color: '#8fd36e' },
  attack: { id: 'attack', name: 'Attack', verb: 'Train', color: '#c9705f' },
  strength: { id: 'strength', name: 'Strength', verb: 'Train', color: '#d9a441' },
  defence: { id: 'defence', name: 'Defence', verb: 'Train', color: '#7397c4' },
  vitality: { id: 'vitality', name: 'Vitality', verb: 'Train', color: '#d8798e' },
  fishing: { id: 'fishing', name: 'Fishing', verb: 'Fish', color: '#62b4c4' },
  cooking: { id: 'cooking', name: 'Cooking', verb: 'Cook', color: '#c98a52' },
};

export interface ResourceDef {
  id: string; skill: GatherSkill; name: string; item: string;
  level: number; time: number; xp: number; value: number;
  /** chance a node runs out after each item (a rock loses its ore, a tree falls); it grows back after `respawn` seconds */
  deplete: number; respawn: number;
  /** seconds the worker pauses after it runs out before moving on to another: long enough to see a tree land */
  moveOnAfter: number;
  /** ore colour for rocks (copper's is green since 0.0.21, as the owner asked), chip colour for trees, the ripples'
   *  colour for a fishing spot */
  color: string;
  /** what is drawn: 'Rock' from miner.glb (tinted with `color`), a tree from village.glb with the stump it leaves, or
   *  'Ripples' (chapter 2): a fishing spot in the water, drawn in code by render/fishing.ts */
  model: string; stump?: string;
  /** the hover text's words for working it, where they aren't the skill's verb and `name` ("Catch|Fish", not
   *  "Fish|Fishing spot") */
  hover?: { verb: string; name: string };
}

export const RESOURCES: Record<string, ResourceDef> = {
  copper_rock: { id: 'copper_rock', skill: 'mining', name: 'Copper rock', item: 'copper_ore', level: 1, time: 7.5, xp: 12, value: 3, deplete: 0.3, respawn: 2.6, moveOnAfter: 0.5, color: '#3f9a6b', model: 'Rock' },
  tin_rock:    { id: 'tin_rock', skill: 'mining', name: 'Tin rock', item: 'tin_ore', level: 6, time: 8.5, xp: 16, value: 4, deplete: 0.3, respawn: 3.0, moveOnAfter: 0.5, color: '#c9ccd1', model: 'Rock' },
  iron_rock:   { id: 'iron_rock', skill: 'mining', name: 'Iron rock', item: 'iron_ore', level: 15, time: 10, xp: 30, value: 9, deplete: 0.35, respawn: 5.0, moveOnAfter: 0.5, color: '#9a6b55', model: 'Rock' },
  birch_tree:  { id: 'birch_tree', skill: 'woodcutting', name: 'Birch tree', item: 'birch_logs', level: 1, time: 7, xp: 10, value: 2, deplete: 0.15, respawn: 6, moveOnAfter: 1.0, color: '#e2c48e', model: 'TreeBirch', stump: 'StumpBirch' },
  oak_tree:    { id: 'oak_tree', skill: 'woodcutting', name: 'Oak tree', item: 'oak_logs', level: 10, time: 9, xp: 22, value: 6, deplete: 0.12, respawn: 9, moveOnAfter: 1.0, color: '#c9a066', model: 'TreeOak', stump: 'StumpOak' },
  // chapter 2: fish rising in the pool below the falls and along the river, caught with a rod from the bank; now and
  // then the fish move off and the spot goes quiet for a while (he moves on to another, as from a fallen tree)
  fishing_spot: { id: 'fishing_spot', skill: 'fishing', name: 'Fishing spot', item: 'raw_fish', level: 1, time: 9, xp: 12, value: 2, deplete: 0.12, respawn: 25, moveOnAfter: 1.0, color: '#eef6f8', model: 'Ripples', hover: { verb: 'Catch', name: 'Fish' } },
};

/** `one`: the name for a single one, where it differs ("Birch log" against "Birch logs") */
export interface ItemDef { id: string; name: string; one?: string; value: number }

export const ITEMS: Record<string, ItemDef> = {
  copper_ore: { id: 'copper_ore', name: 'Copper ore', value: 3 },
  tin_ore: { id: 'tin_ore', name: 'Tin ore', value: 4 },
  iron_ore: { id: 'iron_ore', name: 'Iron ore', value: 9 },
  birch_logs: { id: 'birch_logs', name: 'Birch logs', one: 'Birch log', value: 2 },
  oak_logs: { id: 'oak_logs', name: 'Oak logs', one: 'Oak log', value: 6 },
  // materials picked up by hand at the camp (data/pickups.ts): what he builds his first things from
  plank: { id: 'plank', name: 'Planks', one: 'Plank', value: 1 },
  tarp: { id: 'tarp', name: 'Tarps', one: 'Tarp', value: 1 },
  stone: { id: 'stone', name: 'Stones', one: 'Stone', value: 0 },
  branch: { id: 'branch', name: 'Branches', one: 'Branch', value: 0 },
  // food (chapter 2, 0.0.22): berries picked near the camp, fish caught in the pool and the river and cooked at the
  // campfire, sometimes burnt; what heals and by how much is FOOD in data/food.ts
  berries: { id: 'berries', name: 'Berries', one: 'Berry', value: 1 },
  raw_fish: { id: 'raw_fish', name: 'Raw fish', value: 2 },
  cooked_fish: { id: 'cooked_fish', name: 'Cooked fish', value: 4 },
  burnt_fish: { id: 'burnt_fish', name: 'Burnt fish', value: 0 },
  // chapter 2, part 2: rats in the woods leave their hides, which hide armour is made from
  rat_hide: { id: 'rat_hide', name: 'Rat hides', one: 'Rat hide', value: 1 },
  // the goblin camp: the goblin chief's torn map, of the way on down the river (it can't be dropped: canDrop)
  old_map: { id: 'old_map', name: 'Torn maps', one: 'Torn map', value: 0 },
};

/** The tools a skill's swing needs (SWINGS in data/animation). He owns each or not (GameState.tools): a new camp game
 *  starts with none, and working a tree or rock (since chapter 2 a fishing spot) without its tool is refused. `a`: the
 *  tool with its article, and `use`: what it is for, for the notice "You need an axe to chop trees." */
export type ToolId = 'axe' | 'pick' | 'rod';
export interface ToolDef { id: ToolId; name: string; a: string; use: string }

export const TOOLS: Record<ToolId, ToolDef> = {
  axe: { id: 'axe', name: 'Axe', a: 'an axe', use: 'chop trees' },
  pick: { id: 'pick', name: 'Pickaxe', a: 'a pickaxe', use: 'mine rocks' },
  // chapter 2: a long branch with a line of thread from the tarp's frayed edge (data/making.ts)
  rod: { id: 'rod', name: 'Fishing rod', a: 'a fishing rod', use: 'catch fish' },
};
export const TOOL_IDS = Object.keys(TOOLS) as ToolId[];
