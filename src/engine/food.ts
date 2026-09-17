/**
 * What a dose wants from a meal.
 *
 * `with_food` was a boolean, and a boolean cannot say "on an empty stomach,
 * half an hour before you eat" — which for several of the things people put in
 * a protocol is the whole instruction. So the relation is stored as a word and
 * the old column is kept in step with it: anything that is not 'none' still
 * reads as "with food" to everything that already joins on it.
 *
 * It does NOT move the dose. An offset is measured from the moment the day
 * starts, and a meal is not that moment — so "before a meal" is currently a
 * label on a dose the scheduler still places by `offset_minutes`. Tying the two
 * together needs an anchor the schedule does not have yet.
 */

export const FOOD_RELATIONS = ['none', 'with', 'before', 'after'] as const;

export type FoodRelation = (typeof FOOD_RELATIONS)[number];

export const FOOD_KEYS: Record<FoodRelation, string> = {
  none: 'foodNone',
  with: 'foodWith',
  before: 'foodBefore',
  after: 'foodAfter',
};

export function isFoodRelation(value: unknown): value is FoodRelation {
  return typeof value === 'string' && (FOOD_RELATIONS as readonly string[]).includes(value);
}

/**
 * The relation a stored row means.
 *
 * Rows written before the column existed have only the boolean, and a `1`
 * there meant "with food" — the reading this maps it back to.
 */
export function toFoodRelation(stored: string | null | undefined, withFood: number | boolean): FoodRelation {
  if (isFoodRelation(stored) ) return stored;
  return withFood === 1 || withFood === true ? 'with' : 'none';
}
