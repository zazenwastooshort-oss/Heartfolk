// The goals that take a new player from washing up below the falls to a working camp (12 Oct 2026), in order. Each
// asks for things he has: items carried or banked, and 'book' (BOOK), which counts 1 once he has found his book
// (GameState.hasBook). The goal card shows the first goal whose needs aren't met. Making things comes in the next
// updates, so for now the card counts what has been gathered, and `ready` says what happens once it's all there.

export interface Goal { id: string; title: string; hint: string; ready: string; needs: Record<string, number> }

/** The key in `needs` for his book, which is not an item: it takes no backpack slot. */
export const BOOK = 'book';

export const GOALS: Goal[] = [
  { id: 'salvage', title: 'Salvage the wreck', hint: 'Pick up what washed up along the bank.',
    ready: 'You have it all.', needs: { plank: 7, tarp: 1, [BOOK]: 1 } },
  { id: 'campfire', title: 'A fire for the night', hint: 'Gather stones from the ground.',
    ready: 'You have it all. Making the fire comes in the next update.', needs: { plank: 3, stone: 4 } },
];
