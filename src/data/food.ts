// What he can eat (chapter 2, holding the camp, 0.0.22), as a table: how much of his health each heals (GameState.health,
// never past maxHealth in core/state.ts). Berries are picked near the camp; fish are caught in the pool and the river
// and cooked at the campfire. Raw and burnt fish aren't food. systems/food.ts does the eating.
// fills (his hunger, 12 Oct 2026): how much of an empty stomach each fills (0 to 1; his hunger, data/needs.ts): a
// berry a little, a cooked fish a whole meal.

export interface FoodDef { heals: number; fills: number }

export const FOOD: Record<string, FoodDef> = {
  berries: { heals: 1, fills: 0.15 },
  cooked_fish: { heals: 5, fills: 0.6 },
};

export const isFood = (item: string) => Object.hasOwn(FOOD, item);
