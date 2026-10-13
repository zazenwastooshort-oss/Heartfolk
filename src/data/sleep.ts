// Sleeping in the shelter (12 Oct 2026, the owner: while he sleeps time goes by quickly, so the shadows turn from night
// to dawn; he wakes well rested, which gives his gathering a boost; since 13 Oct 2026 only at his bedtime: a tap on
// the tent no longer sends him early, "not needed"). systems/sleep.ts does it.

/** speed: how many times faster play goes while he sleeps (in play only, not in a catch-up: main.ts), so a whole night
 *  passes in about half a minute. frame: the real seconds of each frame that go quicker; a longer gap (the page hidden,
 *  the screen off) counts at real speed, so time away is never multiplied (13 Oct 2026: before, ten minutes with the
 *  screen off while he slept counted as about 16 days of play). bonus: how much more often a tree, a rock or a fishing
 *  spot yields while he is well rested; the rest lasts from when he gets up until nightfall (20:00, STOKE.at in
 *  data/fire.ts), whatever time that is.
 *  Bedtime (13 Oct 2026, the owner: "going to bed is mandatory, every night ... you will need at least 6 hours of sleep,
 *  you can set the time"; "no earlier than 22.00 and indeed latest 7"): once the shelter stands, at his bedtime he
 *  finishes what he is doing (core/needs.ts midAction) and sleeps `hours` hours in the shelter from when he lies down
 *  (core/needs.ts, systems/needs.ts), however late that is (the owner, 13 Oct 2026, kept up late: "at that point he
 *  needs to sleep his 6 hours"). `bedtimes`: the hours the player can pick in Settings (22:00 to 01:00, so he wakes from
 *  about 04:00 to 07:00); `bedtime`: a new game's, 01:00, so he wakes a little after 07:00 once the light has turned
 *  from night to dawn (render/lighting.ts: night until 05:02, dawn at 06:29) and the dawn is seen (the owner: "you see
 *  the shadows turn from night to dawn"). Kept from bed past his bedtime (a fight, being knocked out, a shelter
 *  finished in the small hours), he still goes, until his waking hour. */
export const SLEEP = { speed: 20, frame: 0.1, bonus: 0.25, hours: 6, bedtimes: [22, 23, 0, 1] as readonly number[], bedtime: 1 };
