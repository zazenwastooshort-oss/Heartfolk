// Sleeping in the shelter (12 Oct 2026, the owner: tap the tent to sleep; while he sleeps time goes by quickly, so the
// shadows turn from night to dawn; he wakes well rested, which gives his gathering a boost). systems/sleep.ts does it.

/** speed: how many times faster play goes while he sleeps (in play only, not in a catch-up: main.ts), so a whole night
 *  passes in about half a minute. frame: the real seconds of each frame that go quicker; a longer gap (the page hidden,
 *  the screen off) counts at real speed, so time away is never multiplied (13 Oct 2026: before, ten minutes with the
 *  screen off while he slept counted as about 16 days of play). wake: the time of day he gets up (07:00), once the
 *  light has turned from night to dawn (render/lighting.ts: night until 05:02, dawn at 06:29), so the dawn is seen
 *  (the owner: "you see the shadows turn from night to dawn"). rested: in-game seconds he stays well rested after a
 *  full night, from getting up (07:00) to nightfall (20:00): 13 hours of a 12-minute day. bonus: how much more often a
 *  tree, a rock or a fishing spot yields while he is well rested. */
export const SLEEP = { speed: 20, frame: 0.1, wake: 7 / 24, rested: 390, bonus: 0.25 };
