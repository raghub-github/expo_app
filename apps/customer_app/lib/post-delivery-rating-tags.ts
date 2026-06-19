/** Shared preset labels for post-delivery restaurant / rider ratings. */

export const RESTAURANT_RATING_TAGS = [
  "Great taste",
  "Fresh & hot",
  "Good packaging",
  "Portion size",
  "Value for money",
  "Would order again",
] as const;

export const DELIVERY_RATING_TAGS = [
  "Fast delivery",
  "Polite attitude",
  "Location awareness",
  "Responsive",
  "Neat & Clean",
  "Food handling",
  "Minimal calling",
] as const;

export const RIDE_CAPTAIN_RATING_TAGS = [
  "Safe riding",
  "Polite captain",
  "Clean vehicle",
  "On time",
  "Smooth ride",
  "Knew the route",
] as const;

export function defaultTagsForRating<T extends string>(
  tags: readonly T[],
  rating: number
): T[] {
  if (rating >= 5) return tags.slice(0, 3);
  if (rating >= 4) return tags.slice(0, 2);
  if (rating >= 3) return tags.slice(0, 1);
  return [];
}
