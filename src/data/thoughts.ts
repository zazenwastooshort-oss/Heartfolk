// His thoughts (chapter 2, the survival book): the short lines he thinks out loud, in a small bubble over his head, and
// writes into the journal in his book. All of them are here, so they can be read and changed in one place. Each has a
// cue: a goal beginning (his own intention for it, also shown on the goal card), the first time he has something, the
// first time he comes near a place, the first nightfall, or the first time something knocks him out. A few are story
// moments (`story`): the book, the first night, the torn map. systems/thoughts.ts decides when each is said (the rules:
// THOUGHT below); every one is said once at most, ever.
//
// The voice: plain, warm, a little dry. Short (THOUGHT.maxLength at most), no jokes for their own sake, no exclamation
// marks. tests/thoughts.test.ts checks the length, the marks, that no two lines are the same, and that every goal has
// one (a new goal needs a line here).
import { BOOK } from './goals';

/** Places he notices by coming near them (core/survival.ts finds them in the layout). */
export type Place = 'wreck' | 'bushes' | 'fishing' | 'copper' | 'nest' | 'goblins';

/** What brings a thought on: a goal (data/goals.ts, by id) becoming the one he is on; the first time he has an item
 *  (carried or stored; BOOK for his book); the first time he comes near a place; the first nightfall; the first time
 *  something knocks him out. */
export type Cue = { goal: string } | { item: string } | { near: Place } | { night: true } | { knockedOut: true };

/** id: a name for the line, saved in his journal (keep it when the words change). story: a moment in his story, said
 *  before a passing thought waiting with it, and never dropped for waiting (THOUGHT.wait). */
export interface ThoughtDef { id: string; cue: Cue; text: string; story?: true }

export const THOUGHTS: ThoughtDef[] = [
  // each goal, as it begins: what he means to do, in his own words (the goal card shows it under the goal's title)
  { id: 'goal:salvage', cue: { goal: 'salvage' }, text: 'Still breathing. Some of my things washed up too.' },
  { id: 'goal:campfire', cue: { goal: 'campfire' }, text: 'Cold tonight. A fire would help.' },
  { id: 'goal:stone_axe', cue: { goal: 'stone_axe' }, text: 'A sharp stone on a stick. That would make an axe.' },
  { id: 'goal:firewood', cue: { goal: 'firewood' }, text: "A fire eats all night. I'll want a pile of logs." },
  { id: 'goal:shelter', cue: { goal: 'shelter' }, text: 'The tarp over a frame of logs would keep me dry.' },
  { id: 'goal:stone_pickaxe', cue: { goal: 'stone_pickaxe' }, text: 'A pointed stone might break into those rocks.' },
  { id: 'goal:copper', cue: { goal: 'copper' }, text: "There's green in those grey rocks. Copper, I'd say." },
  { id: 'goal:chest', cue: { goal: 'chest' }, text: "I can't carry everything. A chest by the shelter." },
  { id: 'goal:dummy', cue: { goal: 'dummy' }, text: 'Something moves in those woods. I should learn to fight.' },
  { id: 'goal:stone_club', cue: { goal: 'stone_club' }, text: "A heavy branch with a stone on the end. That'll do." },
  { id: 'goal:practice', cue: { goal: 'practice' }, text: 'Time to swing at that dummy until it feels right.' },
  { id: 'goal:berries', cue: { goal: 'berries' }, text: 'Those red berries by the camp look safe enough.' },
  { id: 'goal:rod', cue: { goal: 'rod' }, text: 'Fish in the pool. A few long branches make a rod.' },
  { id: 'goal:fish', cue: { goal: 'fish' }, text: 'Fish rise where the water ripples. Patience, then.' },
  { id: 'goal:meal', cue: { goal: 'meal' }, text: 'Fish are better cooked. The fire can see to that.' },
  { id: 'goal:rats', cue: { goal: 'rats' }, text: 'Rats down the river. Their hides would keep me warm.' },
  { id: 'goal:hide_cap', cue: { goal: 'hide_cap' }, text: 'Two of those hides would make a cap.' },
  { id: 'goal:hide_vest', cue: { goal: 'hide_vest' }, text: "Four more hides, and I'd have a vest." },
  { id: 'goal:hide_shield', cue: { goal: 'hide_shield' }, text: 'Hides over a frame of branches. A shield.' },
  { id: 'goal:ready', cue: { goal: 'ready' }, text: 'Goblins are no rats. I need to be stronger first.' },
  { id: 'goal:goblins', cue: { goal: 'goblins' }, text: 'Those goblins carry a map. Maybe it shows a way out.' },

  // moments in his story
  { id: 'story:book', cue: { item: BOOK }, story: true, text: 'My survival book made it. Soggy, but it reads.' },
  { id: 'story:night', cue: { night: true }, story: true, text: 'First night out here. The dark comes quickly.' },
  { id: 'story:map', cue: { item: 'old_map' }, story: true, text: 'A torn map. The river goes on past this valley.' },

  // first finds
  { id: 'first:logs', cue: { item: 'birch_logs' }, text: "Birch splits clean, and there's plenty of it." },
  { id: 'first:copper', cue: { item: 'copper_ore' }, text: 'Copper. Soft, but good for better tools one day.' },
  { id: 'first:berries', cue: { item: 'berries' }, text: "Sweet, a bit sour. They'll keep me going." },
  { id: 'first:fish', cue: { item: 'raw_fish' }, text: "A fish. Small, but it's supper." },
  { id: 'first:burnt', cue: { item: 'burnt_fish' }, text: 'Burnt that one. Less time over the flames.' },
  { id: 'first:nest', cue: { near: 'nest' }, text: "Rats nesting by the river. They don't seem to mind me." },
  { id: 'first:hide', cue: { item: 'rat_hide' }, text: "Tough hide. It'll stitch into something useful." },
  { id: 'first:goblins', cue: { near: 'goblins' }, text: 'Smoke and a fence of stakes. Goblins, by the look.' },
  { id: 'first:knockedOut', cue: { knockedOut: true }, text: 'That went badly. I need to be more careful.' },
];

/** The rules for when a thought is said (systems/thoughts.ts), in seconds of play unless said otherwise.
 *  gap: between two of his passing thoughts (first finds): at most one every few minutes. A new goal's thought is
 *  said at once whatever was said before it; the others (first finds, story moments) wait for it.
 *  quiet: at least this long after any bubble before the next (except a new goal's).
 *  wait: a passing thought that has to wait for its turn waits this long at most; then it is only in his journal. A
 *  story moment is never dropped: it waits however long its turn takes, said while its cue still holds (the first
 *  night's at night: one that waited past dawn is said the next night).
 *  show: real seconds a bubble stays up, fading in and out at its ends (ui/thoughts.ts).
 *  look: how often he takes in what is round him (what he has, where he is).
 *  see: how near (m) he comes to a place before he has seen it; the goblin camp is seen from further, `seeCamp` past
 *  its palisade.
 *  maxLength: the longest a line may be (characters). */
export const THOUGHT = { gap: 180, quiet: 20, wait: 60, show: 5, look: 0.5, see: 9, seeCamp: 8, maxLength: 60 };

/** The thought for a goal (its intention, on the goal card), or undefined for a goal without one. */
export const goalThought = (goal: string): ThoughtDef | undefined => THOUGHTS.find(t => 'goal' in t.cue && t.cue.goal === goal);

/** A thought by id, or undefined for one no longer in the table (an old save's). */
export const thoughtDef = (id: string): ThoughtDef | undefined => THOUGHTS.find(t => t.id === id);
