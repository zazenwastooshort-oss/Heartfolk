// Skills and what can be gathered, as tables only. Values come from prototypes/wanderskill.html (ACTIONS).
// time: seconds per item at tool tier 1; xp: per item; value: gold at the merchant.

export type SkillId = 'mining' | 'woodcutting';

export interface SkillDef { id: SkillId; name: string; color: string }

export const SKILLS: Record<SkillId, SkillDef> = {
  mining: { id: 'mining', name: 'Mining', color: '#d8a35a' },
  woodcutting: { id: 'woodcutting', name: 'Woodcutting', color: '#8fd36e' },
};

export interface ResourceDef {
  id: string; skill: SkillId; name: string; item: string;
  level: number; time: number; xp: number; value: number;
  /** chance a node runs out after each item; it grows back after `respawn` seconds */
  deplete: number; respawn: number;
  color: string;
}

export const RESOURCES: Record<string, ResourceDef> = {
  copper_rock: { id: 'copper_rock', skill: 'mining', name: 'Copper rock', item: 'copper_ore', level: 1, time: 2.4, xp: 12, value: 3, deplete: 0.3, respawn: 2.6, color: '#c8763a' },
  tin_rock:    { id: 'tin_rock', skill: 'mining', name: 'Tin rock', item: 'tin_ore', level: 6, time: 2.6, xp: 16, value: 4, deplete: 0.3, respawn: 3.0, color: '#c9ccd1' },
  iron_rock:   { id: 'iron_rock', skill: 'mining', name: 'Iron rock', item: 'iron_ore', level: 15, time: 3.0, xp: 30, value: 9, deplete: 0.35, respawn: 5.0, color: '#9a6b55' },
};

export interface ItemDef { id: string; name: string; value: number }

export const ITEMS: Record<string, ItemDef> = {
  copper_ore: { id: 'copper_ore', name: 'Copper ore', value: 3 },
  tin_ore: { id: 'tin_ore', name: 'Tin ore', value: 4 },
  iron_ore: { id: 'iron_ore', name: 'Iron ore', value: 9 },
};
