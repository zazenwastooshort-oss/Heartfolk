// Sleeping in the shelter (12 Oct 2026, the owner: tap the tent to sleep; while he sleeps time goes by quickly, so the
// shadows turn from night to dawn; he wakes well rested, which gives his gathering a boost). systems/sleep.ts does it.

/** speed: how many times faster play goes while he sleeps (in play only, not in a catch-up: main.ts), so a whole night
 *  passes in about a quarter of a minute. rested: in-game seconds he stays well rested after a full night, from dawn
 *  (05:00) to nightfall (20:00): 15 hours of a 12-minute day. bonus: how much more often a tree, a rock or a fishing
 *  spot yields while he is well rested. */
export const SLEEP = { speed: 20, rested: 450, bonus: 0.25 };
