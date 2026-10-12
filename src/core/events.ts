// Modules announce what happened instead of calling into each other. The renderer, the HUD and later
// sound and the chronicle subscribe. Events carry plain data only.
import type { SkillId, ToolId } from '../data/skills';
import type { GatherId, PickupKind } from '../data/pickups';
import type { MakeId } from '../data/making';
import type { CombatStyle } from '../data/combat';
import type { Misfit } from './building';

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
  /** asked to sleep by day: he isn't tired yet (systems/sleep.ts) */
  | { type: 'cantSleep' }
  /** asked to sleep while off to stoke the fire: he stokes it first, then goes to bed */
  | { type: 'bedLater' }
  /** he lay down in the shelter for the night */
  | { type: 'fellAsleep' }
  /** dawn: he got up after a full night's sleep, well rested */
  | { type: 'awake' }
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
   *  another (0.0.22): he carries on, since 0.0.25 training `next`, the next skill the goal asks for (none when the
   *  target can't teach it) */
  | { type: 'goalLevel'; skill: SkillId; level: number; goal: string; next?: CombatStyle }
  /** (0.0.25) the target he fights has taught him all it can of `from`, so he carries on training `to` */
  | { type: 'switchedStyle'; target: string; from: CombatStyle; to: CombatStyle }
  /** a fish came off the campfire (chapter 2, systems/cooking.ts): cooked (Cooking XP), or `burnt` */
  | { type: 'cooked'; burnt: boolean }
  /** asked to cook with no raw fish in the backpack or the chest: he stays put */
  | { type: 'cantCook' }
  /** cooking, he has cooked every raw fish he had, carried or in the chest, so he stops */
  | { type: 'cookedAll' }
  /** (chapter 2's rats, systems/rats.ts) a creature he fights bit him (or, a goblin, struck him) for `damage`, 0 for a
   *  miss */
  | { type: 'bitten'; by: string; damage: number }
  /** he beat `target` (a rat; since the goblin camp a goblin or the chief, `foe`): it topples over; `item` is what it
   *  left, which went into his backpack (a rat hide, the chief's torn map), or null */
  | { type: 'beaten'; target: string; item: string | null; foe?: 'goblin' | 'chief' }
  /** a beaten rat came back at its nest */
  | { type: 'ratBack'; id: string }
  /** (the goblin camp, systems/goblins.ts) a beaten goblin is up again in the camp */
  | { type: 'goblinBack'; id: string }
  /** all three goblins were down at once: the goblin chief comes out of his tent */
  | { type: 'chiefOut' }
  /** the goblin chief is beaten: the goblins are gone for good, and the camp's gate stands open */
  | { type: 'campCleared' }
  /** `by` (a rat; a goblin or the chief, `foe`) took his health to 0: he slumps, then wakes up back at camp (wokeUp) */
  | { type: 'knockedOut'; by: string; foe?: 'goblin' | 'chief' }
  /** he woke up back at camp after `by` knocked him out, with half his health and everything he had */
  | { type: 'wokeUp'; by: string }
  /** setting off to fight with no food in his backpack, he goes by the chest for some first */
  | { type: 'fetchFood' }
  /** at the chest on his way to fight, he took `items` of food */
  | { type: 'tookFood'; items: Record<string, number> }
  /** (the survival book) a tap on the goal card or his thought (systems/nextstep.ts): he is already doing what the goal
   *  needs. (His thoughts themselves are no events: ui/thoughts.ts sees GameState.thoughts change.) */
  | { type: 'onIt' }
  /** a tap on the goal card or his thought: there is nothing to do for the goal just now; `item` is what he waits for
   *  (stones and branches not back yet), or null */
  | { type: 'nothingYet'; item: string | null }
  /** (building in stages, data/building.ts) he set out to build `make`: what it needs was taken, and he gets to work */
  | { type: 'begun'; make: MakeId }
  /** what he builds went up a stage (1: its frame is up, 2: half built; STAGE_NAMES) */
  | { type: 'buildStage'; make: MakeId; stage: number }
  /** he can't begin `make`: it isn't to be built yet ('locked'), he needs Carpentry level `need` ('level'), or it
   *  doesn't fit where it was placed ('fit', and why: core/building.ts) */
  | { type: 'cantBuild'; make: MakeId; reason: 'locked' | 'level' | 'fit'; need?: number; misfit?: Misfit }
  /** chopping birch, he peeled a strip of bark off the log too (it went into his backpack: itemGained) */
  | { type: 'barkPeeled' }
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
