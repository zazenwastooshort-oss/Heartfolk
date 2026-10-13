// His hunger (12 Oct 2026; the owner: "he eats when he needs to eat, he is doing his main job but then other needs
// require his attention as well, like eating, sleeping"), as tables. How full he is falls over game time and food fills
// it (FOOD's `fills` in data/food.ts); hungry, he eats food to spare from his backpack, or walks to the chest for some,
// and goes back to what he was doing; with nothing to eat he works a little slower until he eats, never worse. Sleep's
// numbers (his bedtime) are in data/sleep.ts. systems/needs.ts does both.

/** perDay: how much of a full stomach he uses up in an in-game day (12 minutes of play): about one cooked fish a day.
 *  hungry: below this he is hungry, and eats. full: he eats until he is at least this full (or the food runs out).
 *  slow: while hungry, a tree, a rock or a fishing spot yields this much as often (with nothing to eat, until he eats).
 *  He gets hungry only once food is part of his story (core/needs.ts, hungerStarted): from the first goal about food
 *  (the Berries goal), until then he stays full. From full he gets hungry about 13 minutes of play later. */
export const HUNGER = { perDay: 0.6, hungry: 0.35, full: 0.9, slow: 0.8 };

/** How often (seconds of play) he looks again for a way to the chest for food or to bed when the last try found none,
 *  so a blocked way is never searched every step. */
export const NEEDS_RETRY = 2;
