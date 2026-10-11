// Skills and what can be gathered, as tables only. Values come from prototypes/wanderskill.html (ACTIONS).
// time: seconds per item at tool tier 1; xp: per item; value: gold at the merchant.

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
  /** ore colour for rocks, chip colour for trees */
  color: string;
  /** what is drawn: 'Rock' from miner.glb (tinted with `color`), or a tree from village.glb with the stump it leaves */
  model: string; stump?: string;
}

export const RESOURCES: Record<string, ResourceDef> = {
  copper_rock: { id: 'copper_rock', skill: 'mining', name: 'Copper rock', item: 'copper_ore', level: 1, time: 2.4, xp: 12, value: 3, deplete: 0.3, respawn: 2.6, moveOnAfter: 0.5, color: '#c8763a', model: 'Rock' },
  tin_rock:    { id: 'tin_rock', skill: 'mining', name: 'Tin rock', item: 'tin_ore', level: 6, time: 2.6, xp: 16, value: 4, deplete: 0.3, respawn: 3.0, moveOnAfter: 0.5, color: '#c9ccd1', model: 'Rock' },
  iron_rock:   { id: 'iron_rock', skill: 'mining', name: 'Iron rock', item: 'iron_ore', level: 15, time: 3.0, xp: 30, value: 9, deplete: 0.35, respawn: 5.0, moveOnAfter: 0.5, color: '#9a6b55', model: 'Rock' },
  birch_tree:  { id: 'birch_tree', skill: 'woodcutting', name: 'Birch tree', item: 'birch_logs', level: 1, time: 2.2, xp: 10, value: 2, deplete: 0.15, respawn: 6, moveOnAfter: 1.0, color: '#e2c48e', model: 'TreeBirch', stump: 'StumpBirch' },
  oak_tree:    { id: 'oak_tree', skill: 'woodcutting', name: 'Oak tree', item: 'oak_logs', level: 10, time: 2.8, xp: 22, value: 6, deplete: 0.12, respawn: 9, moveOnAfter: 1.0, color: '#c9a066', model: 'TreeOak', stump: 'StumpOak' },
};

/** `one`: the name for a single one, where it differs ("Birch log" against "Birch logs") */
export interface ItemDef { id: string; name: string; one?: string; value: number }

export const ITEMS: Record<string, ItemDef> = {
  copper_ore: { id: 'copper_ore', name: 'Copper ore', value: 3 },
  tin_ore: { id: 'tin_ore', name: 'Tin ore', value: 4 },
  iron_ore: { id: 'iron_ore', name: 'Iron ore', value: 9 },
  birch_logs: { id: 'birch_logs', name: 'Birch logs', one: 'Birch log', value: 2 },
  oak_logs: { id: 'oak_logs', name: 'Oak logs', one: 'Oak log', value: 6 },
};
