import { router, type Href } from "expo-router";

/** Back when stack exists; otherwise replace so cold redirects don't throw GO_BACK. */
export function goBackOrReplace(fallback: Href) {
  if (!router.canGoBack()) {
    router.replace(fallback);
    return;
  }
  router.back();
}
