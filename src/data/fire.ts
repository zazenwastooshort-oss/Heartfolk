// The campfire at night (game 0.0.19), as tables only: once the campfire and the storage chest both stand, each night
// at nightfall he leaves what he is doing, takes a few logs from the chest (or his backpack), stokes the fire and goes
// back to what he was doing. Without a log anywhere the fire burns low until it is next stoked. systems/fire.ts does
// the work; render/structures.ts draws the flare and the low fire.

export const STOKE = {
  /** nightfall, as a fraction of the day (0.75 = 18:00): when he sets off, once a night (core/clock.ts, nightOf) */
  at: 20 / 24,
  /** dawn: he still goes any time up to then if something kept him at nightfall (he was making something) */
  until: 5 / 24,
  /** the logs he takes (fewer if that's all there is) */
  item: 'birch_logs',
  logs: 3,
  /** seconds he stokes the fire before he goes back */
  time: 2.5,
};

/** How the fire looks: stoked, its flames flare up over `rise` seconds (`flare` times taller at the height of it, and
 *  its light `1 + flareLight` times brighter) and settle back over `settle` seconds; burning low, its flames are `low`
 *  of their size and its light `lowLight` of its brightness, eased into (and back out of once stoked) at `lowEase` per
 *  second. Taller flames are a little wider too (`widen` of the change in height), and the smoke thickens with them
 *  up to `smokeMax` times. */
export const FIRE_LOOK = { flare: 1.6, rise: 0.6, flareLight: 0.8, settle: 3, low: 0.5, lowLight: 0.35, lowEase: 1.5, widen: 0.25, smokeMax: 1.4 };
