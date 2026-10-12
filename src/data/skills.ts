// Skills and what can be gathered, as tables only. Values come from prototypes/wanderskill.html (ACTIONS).
// time: seconds per item at tool tier 1 (about 3x the prototype's since 0.0.21: the owner found gathering far too quick
// for an idle game, 12 Oct 2026); xp: per item; value: gold at the merchant.

export type SkillId = 'mining' | 'woodcutting';

/** verb: what the hover text and notices call working a node of this skill */
export interface SkillDef { id: SkillId; name: string; verb: string; color: string }

export const SKILLS: Record<SkillId, SkillDef> = {
  mining: { id: 'mining', name: 'Mining', verb: 'Mine', color: '#d8a35a' },
  woodcutting: { id: 'woodcutting', name: 'Woodcutting', verb: 'Chop', color: '#8fd36e' },
};

export interface ResourceDef {
  id: string; skill: SkillId; name: string; item: string;
  level: number; time: number; xp: number; value: number;
  /** chance a node runs out after each item (a rock loses its ore, a tree falls); it grows back after `respawn` seconds */
  deplete: number; respawn: number;
  /** seconds the worker pauses after it runs out before moving on to another: long enough to see a tree land */
  moveOnAfter: number;
  /** ore colour for rocks (copper's is green since 0.0.21, as the owner asked), chip colour for trees */
  color: string;
  /** what is drawn: 'Rock' from miner.glb (tinted with `color`), or a tree from village.glb with the stump it leaves */
  model: string; stump?: string;
}

export const RESOURCES: Record<string, ResourceDef> = {
  copper_rock: { id: 'copper_rock', skill: 'mining', name: 'Copper rock', item: 'copper_ore', level: 1, time: 7.5, xp: 12, value: 3, deplete: 0.3, respawn: 2.6, moveOnAfter: 0.5, color: '#3f9a6b', model: 'Rock' },
  tin_rock:    { id: 'tin_rock', skill: 'mining', name: 'Tin rock', item: 'tin_ore', level: 6, time: 8.5, xp: 16, value: 4, deplete: 0.3, respawn: 3.0, moveOnAfter: 0.5, color: '#c9ccd1', model: 'Rock' },
  iron_rock:   { id: 'iron_rock', skill: 'mining', name: 'Iron rock', item: 'iron_ore', level: 15, time: 10, xp: 30, value: 9, deplete: 0.35, respawn: 5.0, moveOnAfter: 0.5, color: '#9a6b55', model: 'Rock' },
  birch_tree:  { id: 'birch_tree', skill: 'woodcutting', name: 'Birch tree', item: 'birch_logs', level: 1, time: 7, xp: 10, value: 2, deplete: 0.15, respawn: 6, moveOnAfter: 1.0, color: '#e2c48e', model: 'TreeBirch', stump: 'StumpBirch' },
  oak_tree:    { id: 'oak_tree', skill: 'woodcutting', name: 'Oak tree', item: 'oak_logs', level: 10, time: 9, xp: 22, value: 6, deplete: 0.12, respawn: 9, moveOnAfter: 1.0, color: '#c9a066', model: 'TreeOak', stump: 'StumpOak' },
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
};

/** The tools a skill's swing needs (SWINGS in data/animation). He owns each or not (GameState.tools): a new camp game
 *  starts with none, and working a tree or rock without its tool is refused. `a`: the tool with its article, and
 *  `use`: what it is for, for the notice "You need an axe to chop trees." */
export type ToolId = 'axe' | 'pick';
export interface ToolDef { id: ToolId; name: string; a: string; use: string }

export const TOOLS: Record<ToolId, ToolDef> = {
  axe: { id: 'axe', name: 'Axe', a: 'an axe', use: 'chop trees' },
  pick: { id: 'pick', name: 'Pickaxe', a: 'a pickaxe', use: 'mine rocks' },
};
export const TOOL_IDS = Object.keys(TOOLS) as ToolId[];
