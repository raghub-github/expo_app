/**
 * Shared FoodMerchantsScreen chunk promise — Home warms it before the Food tab
 * mounts so the first tap does not wait on Metro/JS parse behind a blank Suspense.
 */
type FoodHomeModule = typeof import("@/app/home/index");

let foodHomeScreenPromise: Promise<FoodHomeModule> | null = null;

export function preloadFoodHomeScreen(): Promise<FoodHomeModule> {
  if (!foodHomeScreenPromise) {
    foodHomeScreenPromise = import("@/app/home/index");
  }
  return foodHomeScreenPromise;
}
