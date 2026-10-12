// Modules announce what happened instead of calling into each other. The renderer, the HUD and later
// sound and the chronicle subscribe. Events carry plain data only.
import type { SkillId, ToolId } from '../data/skills';
import type { GatherId, PickupKind } from '../data/pickups';
import type { MakeId } from '../data/making';

export type GameEvent =
  | { type: 'strike'; nodeId: string }
  | { type: 'itemGained'; item: string; count: number }          // into the backpack
  | { type: 'backpackFull' }                                     // a trip to the bank (the camp's chest) starts
  | { type: 'banked'; items: Record<string, number> }            // the backpack was emptied into the bank (the chest)
  | { type: 'nothingToBank' }                                    // at the bank (the chest) with an empty backpack
  | { type: 'xpGained'; skill: SkillId; amount: number }
  | { type: 'levelUp'; skill: SkillId; level: number }
  | { type: 'nodeDepleted'; nodeId: string }
  | { type: 'nodeRespawned'; nodeId: string }
  | { type: 'levelTooLow'; skill: SkillId; need: number; what: string }
  /** sent to work a tree or rock without the tool for it: refused before he walks */
  | { type: 'needTool'; tool: ToolId; skill: SkillId }
  /** he picked something up off the ground: `item` x `count` went into his backpack, or it was his book (item null) */
  | { type: 'pickedUp'; id: string; kind: PickupKind; item: string | null; count: number }
  /** a stone or branch lies at its spot again */
  | { type: 'pickupBack'; id: string }
  /** gathering `gather` (GATHERS in data/pickups), he picked up the last one there is, so he stops */
  | { type: 'allGathered'; gather: GatherId }
  /** gathering `item` (off the ground, or from trees or rocks), the current goal now has enough, so he stops (0.0.21) */
  | { type: 'goalEnough'; item: string; goal: string }
  /** a tap on the firewood pile: `logs` he carried were stacked on it, now holding `pile`; none when he had none
   *  ('none') or it was full ('full') (0.0.21) */
  | { type: 'stacked'; logs: number; pile: number; reason?: 'none' | 'full' }
  /** no room in the backpack for what he was sent to pick up */
  | { type: 'noRoom' }
  /** `count` of `item` dropped from the backpack, gone for good */
  | { type: 'dropped'; item: string; count: number }
  /** asked to drop something he can't find again (canDrop in core/state): he keeps it */
  | { type: 'cantDrop'; item: string }
  | { type: 'visited'; id: string }
  | { type: 'noPath' }
  /** the backpack is full and there is nowhere to store it yet (the camp, before its storage chest is built) */
  | { type: 'noStorage' }
  /** asked to make something (data/making.ts) without everything it needs: `items` is what is still missing */
  | { type: 'missing'; make: MakeId; items: Record<string, number> }
  /** asked to make something at the camp before the goals before its goal are finished: `goal` is the first of those */
  | { type: 'goalFirst'; make: MakeId; goal: string }
  /** he made something: it stands at its site (GameState.built), or he owns the tool */
  | { type: 'made'; make: MakeId }
  /** a goal (data/goals.ts) is finished, for good */
  | { type: 'goalDone'; goal: string }
  /** nightfall: he sets off for logs to stoke the fire (systems/fire.ts): to the firewood pile, else the chest */
  | { type: 'stokeOff' }
  /** he stoked the fire with `logs` logs: its flames flare up */
  | { type: 'stoked'; logs: number }
  /** nightfall, and no logs in the pile, the chest or the backpack: the fire burns low until it is next stoked */
  | { type: 'fireLow' }
  /** he ate one `item` from his backpack (chapter 2, 0.0.22): it healed `healed`, and his health is now `health` */
  | { type: 'ate'; item: string; healed: number; health: number }
  /** asked to eat `item`: it isn't food ('notFood'), he carries none ('none'), or his health is full ('full') */
  | { type: 'cantEat'; item: string; reason: 'notFood' | 'none' | 'full' }
  /** he struck `target` (core/targets.ts) for `damage`, 0 for a miss (systems/combat.ts, 0.0.22) */
  | { type: 'hit'; target: string; damage: number }
  /** he can't fight `target`: he has no weapon ('weapon'), or it has taught him all it can of `skill`, the style he
   *  trains ('taught': the dummy's level limit), so he stops or doesn't set off */
  | { type: 'cantFight'; target: string; reason: 'weapon' | 'taught'; skill: SkillId }
  /** fighting, the skill he trains reached the level the camp's current goal asks for it, and the goal still asks for
   *  another (0.0.22): he carries on, and the player may choose another to train */
  | { type: 'goalLevel'; skill: SkillId; level: number; goal: string }
  /** a fish came off the campfire (chapter 2, systems/cooking.ts): cooked (Cooking XP), or `burnt` */
  | { type: 'cooked'; burnt: boolean }
  /** asked to cook with no raw fish in the backpack or the chest: he stays put */
  | { type: 'cantCook' }
  /** cooking, he has cooked every raw fish he had, carried or in the chest, so he stops */
  | { type: 'cookedAll' }
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
