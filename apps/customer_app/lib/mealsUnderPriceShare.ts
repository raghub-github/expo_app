import * as Linking from "expo-linking";

/** Deep link that opens the meals-under-price screen in the customer app. */
export function buildMealsUnderPriceShareUrl(maxPrice?: number): string {
  const queryParams =
    maxPrice != null && Number.isFinite(maxPrice) && maxPrice > 0
      ? { maxPrice: String(Math.trunc(maxPrice)) }
      : undefined;
  return Linking.createURL("/home/meals-under-price", { queryParams });
}

export function buildMealsUnderPriceShareMessage(pageTitle: string, url: string): string {
  return `Hey, checkout ${pageTitle} on GatiMitra. Order now!\n${url}`;
}
