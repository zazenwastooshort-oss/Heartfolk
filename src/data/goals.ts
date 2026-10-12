// The goals that take a new player from washing up below the falls to a working camp (12 Oct 2026), in order. Each
// asks for things he has: items carried or banked, and 'book' (BOOK), which counts 1 once he has found his book
// (GameState.hasBook). A goal finished stays finished (GameState.goalsDone, since 0.0.15), so using things up for the
// next one never sends the card back. Gathering goals finish once their needs are all there; making goals (`makes`)
// once the thing is made (a tool once he owns it: an old save that kept its axe has the stone axe goal done). The goal
// card shows the first goal not finished. Since 0.0.16: salvage, the campfire, the stone axe, firewood, then the
// shelter, which waits on its ready text until a later update adds it to data/making.ts.
import { MAKES } from './making';

/** needs: what it asks for (the goal card counts them). ready: what the card says once they are all there.
 *  makes: for a making goal, the thing it makes (an id in MAKES, data/making.ts): it is finished once that is made,
 *  and with everything there the card offers to make it. A making goal whose thing isn't in MAKES yet (it comes in a
 *  later update) can't be finished, so the card waits on it with its `ready` text. */
export interface Goal { id: string; title: string; hint: string; ready: string; needs: Record<string, number>; makes?: string }

/** The key in `needs` for his book, which is not an item: it takes no backpack slot. */
export const BOOK = 'book';

export const GOALS: Goal[] = [
  { id: 'salvage', title: 'Salvage the wreck', hint: 'Pick up what washed up along the bank.',
    ready: 'You have it all.', needs: { plank: 7, tarp: 1, [BOOK]: 1 } },
  { id: 'campfire', title: 'A fire for the night', hint: 'Gather stones from the ground.',
    ready: 'You have it all. Tap Build, or tap the fire spot.', needs: MAKES.campfire.needs, makes: 'campfire' },
  { id: 'stone_axe', title: 'A stone axe', hint: 'Gather branches and stones from the ground.',
    ready: 'You have it all. Tap Make.', needs: MAKES.stone_axe.needs, makes: 'stone_axe' },
  { id: 'firewood', title: 'Firewood', hint: 'Tap a birch tree round the clearing to chop it.',
    ready: 'You have enough firewood.', needs: { birch_logs: 10 } },
  { id: 'shelter', title: 'A shelter', hint: 'Chop birch trees for logs.',
    ready: 'You have it all. Building the shelter comes in a later update.', needs: { tarp: 1, plank: 4, birch_logs: 10 }, makes: 'shelter' },
];
