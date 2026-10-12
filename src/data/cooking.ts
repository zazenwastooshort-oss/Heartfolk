// Cooking at the campfire (chapter 2, holding the camp), as tables only: tapping the built campfire with raw fish, he
// cooks them one after another, each over the flames for `time` seconds. Each comes out cooked (Cooking XP) or now and
// then burnt (no XP), less often as his Cooking level rises. systems/cooking.ts does the work; render/cooking.ts draws
// the fish on a stick over the flames.

export const COOK = {
  /** what he cooks, and what it comes out as */
  raw: 'raw_fish', cooked: 'cooked_fish', burnt: 'burnt_fish',
  /** seconds over the fire, each */
  time: 3,
  /** Cooking XP for each one cooked (none for a burnt one) */
  xp: 15,
  /** the chance one burns at Cooking level 1; it falls evenly to none at level `safe` */
  burn: 0.35, safe: 25,
};

/** The chance a fish burns at Cooking level `level`: COOK.burn at level 1, falling evenly to none at COOK.safe. */
export const burnChance = (level: number) => Math.max(0, COOK.burn * (COOK.safe - level) / (COOK.safe - 1));
