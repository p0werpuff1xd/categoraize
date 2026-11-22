/**
 * Priority rules shared by the category UI and the classification request.
 *
 * Scale: 5 is Critical (top of the inbox) and 1 is Minimal. The scoring
 * service (fastapi_core/app/ml/priority_rules.py) uses the same direction.
 */

/** Canonical key sent to the scoring service for the promotions template. */
export const PROMOTION_SLUG = "promotions";

/** Highest priority a promotions category may take. Matches PROMOTION_CAP in the service. */
export const PROMOTION_MAX_BASE_PRIORITY = 2;

/**
 * Canonical slug for a category name, or null for user-named categories.
 * The scoring service applies promotions rules only when the slug is present.
 */
export function categorySlugFor(name: string): string | null {
  return name.trim().toLowerCase() === PROMOTION_SLUG ? PROMOTION_SLUG : null;
}

/** Base-priority choices a category may use, highest first. */
export function allowedBasePriorities(name: string): number[] {
  const max =
    categorySlugFor(name) === PROMOTION_SLUG ? PROMOTION_MAX_BASE_PRIORITY : 5;
  return [5, 4, 3, 2, 1].filter((level) => level <= max);
}

/** Clamp a stored base priority to what the category may use. */
export function clampBasePriority(name: string, level: number): number {
  const max = Math.max(...allowedBasePriorities(name));
  return Math.min(level, max);
}
