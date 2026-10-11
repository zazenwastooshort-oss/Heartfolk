// XP and levels.
import type { GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { SkillId } from '../data/skills';
import { levelFor, MAX_XP } from '../data/xp';

export function addXp(state: GameState, skill: SkillId, amount: number, events: EventBus): void {
  const before = levelFor(state.skills[skill]);
  state.skills[skill] = Math.min(MAX_XP, state.skills[skill] + amount);
  events.emit({ type: 'xpGained', skill, amount });
  const after = levelFor(state.skills[skill]);
  if (after > before) events.emit({ type: 'levelUp', skill, level: after });
}

export const levelOf = (state: GameState, skill: SkillId) => levelFor(state.skills[skill]);
