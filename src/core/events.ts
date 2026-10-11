// Modules announce what happened instead of calling into each other. The renderer, the HUD and later
// sound and the chronicle subscribe. Events carry plain data only.
import type { SkillId } from '../data/skills';

export type GameEvent =
  | { type: 'strike'; nodeId: string }
  | { type: 'itemGained'; item: string; count: number }          // into the backpack
  | { type: 'backpackFull' }                                     // a trip to the bank starts
  | { type: 'banked'; items: Record<string, number> }            // the backpack was emptied into the bank
  | { type: 'nothingToBank' }                                    // at the bank with an empty backpack
  | { type: 'xpGained'; skill: SkillId; amount: number }
  | { type: 'levelUp'; skill: SkillId; level: number }
  | { type: 'nodeDepleted'; nodeId: string }
  | { type: 'nodeRespawned'; nodeId: string }
  | { type: 'levelTooLow'; skill: SkillId; need: number; what: string }
  | { type: 'visited'; id: string }
  | { type: 'noPath' }
  /** the backpack is full and there is nowhere to store it yet (the camp, before its storage chest) */
  | { type: 'noStorage' }
  | { type: 'arrived' };

type Handler = (e: GameEvent) => void;

export class EventBus {
  private handlers: Handler[] = [];
  on(h: Handler): () => void {
    this.handlers.push(h);
    return () => { this.handlers = this.handlers.filter(x => x !== h); };
  }
  emit(e: GameEvent): void { for (const h of this.handlers) h(e); }
}
