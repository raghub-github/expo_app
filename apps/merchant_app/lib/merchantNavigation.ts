import { useCallback } from "react";
import { usePathname, useRouter, type Router } from "expo-router";
import { useProfileNav } from "@/context/ProfileNavContext";

type MerchantTabGroup = "home" | "orders" | "menu" | "profile" | "hub" | "root" | "order-detail" | "other";

/** Screens opened from another tab/area — back should restore `returnRoute` when stack back is wrong. */
const CROSS_TAB_ENTRY_SUFFIXES = [
  "/profile/offers",
  "/profile/complaints",
  "/profile/reviews",
  "/profile/vacation",
  "/profile/hours",
  "/profile/status",
  "/profile/tickets",
  "/profile/help",
  "/profile/learning",
  "/order-history",
  "/restaurant-status",
] as const;

function normalizePath(path: string | undefined | null): string {
  if (!path) return "/(tabs)";
  let p = path.split("?")[0]?.split("#")[0] ?? "/(tabs)";
  if (!p.startsWith("/")) p = `/${p}`;
  return p.replace(/\/+$/, "") || "/(tabs)";
}

/** Push payloads may include a url — only allow in-app merchant routes. */
export function isSafeMerchantPushHref(url: string): boolean {
  const raw = url.trim();
  if (!raw || raw.includes("://") || raw.includes("\\") || raw.includes("..")) return false;
  const path = (raw.startsWith("/") ? raw : `/${raw}`).split("?")[0]?.split("#")[0] ?? "";
  if (!path.startsWith("/")) return false;
  if (/^\/order\/\d+$/.test(path)) return true;
  if (path === "/restaurant-status" || path.startsWith("/restaurant-status/")) return true;
  if (path === "/order-history" || path.startsWith("/order-history/")) return true;
  if (path === "/(tabs)" || path.startsWith("/(tabs)/")) return true;
  return false;
}

/** Flow hub routes (Earnings, Growth, Offers, Reviews). */
export function isHubPath(path: string | undefined | null): boolean {
  const p = normalizePath(path);
  return (
    p.includes("/earnings") ||
    p.includes("/growth") ||
    p.includes("/reviews") ||
    p.includes("/complaints") ||
    p.includes("/profile/offers")
  );
}

export function hubTabFromPath(path: string | undefined | null): "earnings" | "growth" | "offers" | "reviews" | null {
  const p = normalizePath(path);
  if (p.includes("/earnings")) return "earnings";
  if (p.includes("/growth")) return "growth";
  if (p.includes("/profile/offers") || p.includes("/offers")) return "offers";
  if (p.includes("/reviews") || p.includes("/complaints")) return "reviews";
  return null;
}

function resolveTabGroup(path: string): MerchantTabGroup {
  const p = normalizePath(path);
  if (p === "/order-history" || p.endsWith("/order-history")) return "root";
  if (p.includes("/restaurant-status")) return "root";
  if (p.includes("/order/")) return "order-detail";
  if (p.includes("/profile")) return "profile";
  if (p.includes("/menu")) return "menu";
  if (p.includes("/orders")) return "orders";
  if (
    p.includes("/earnings") ||
    p.includes("/growth") ||
    p.includes("/reviews") ||
    p.includes("/complaints")
  ) {
    return "hub";
  }
  if (p.includes("/(tabs)") || p === "/" || p.endsWith("/index")) return "home";
  return "other";
}

function shouldRememberReturnRoute(fromPath: string, toPath: string): boolean {
  const from = normalizePath(fromPath);
  const to = normalizePath(toPath);
  const fromGroup = resolveTabGroup(from);
  const toGroup = resolveTabGroup(to);

  if (fromGroup !== toGroup) return true;

  // Root stack screens (sibling of tabs) always remember where we came from.
  if (toGroup === "root" || toGroup === "order-detail") return true;

  return false;
}

export function inferMerchantBackFallback(pathname: string | undefined): string {
  const p = normalizePath(pathname);
  if (p.includes("/profile/")) return "/(tabs)/profile";
  if (p.includes("/earnings")) return "/(tabs)/earnings";
  if (p.includes("/menu/")) return "/(tabs)/menu";
  if (p.includes("/orders")) return "/(tabs)/orders";
  if (p === "/order-history") return "/(tabs)/orders";
  if (p.includes("/restaurant-status")) return "/(tabs)";
  if (p.includes("/order/")) return "/(tabs)/orders";
  if (p.includes("/support/chat")) return "/(tabs)/profile/tickets";
  return "/(tabs)";
}

function isCrossTabEntryScreen(pathname: string | undefined): boolean {
  const p = normalizePath(pathname);
  return CROSS_TAB_ENTRY_SUFFIXES.some((suffix) => p.includes(suffix));
}

function isRootStackScreen(pathname: string | undefined): boolean {
  const p = normalizePath(pathname);
  return p.includes("/order/") || p === "/order-history" || p.includes("/restaurant-status");
}

function isProfileRootPath(pathname: string | undefined): boolean {
  const p = normalizePath(pathname);
  if (!p.includes("/profile")) return false;
  const afterProfile = p.split("/profile")[1] ?? "";
  return afterProfile === "" || afterProfile === "/";
}

export function merchantGoBack(
  router: Router,
  options: {
    pathname?: string;
    returnRoute?: string | null;
    clearReturnRoute?: () => void;
    fallback?: string;
  }
) {
  const pathname = options.pathname;
  const returnRoute = options.returnRoute ?? null;
  const fallback = options.fallback ?? inferMerchantBackFallback(pathname);

  // Catalog opened from onboarding benefits — always return there (not Home).
  if (
    returnRoute &&
    pathname?.includes("/menu") &&
    returnRoute.includes("onboarding-benefits")
  ) {
    options.clearReturnRoute?.();
    router.replace(returnRoute as never);
    return;
  }

  if (
    returnRoute &&
    (isCrossTabEntryScreen(pathname) ||
      isRootStackScreen(pathname) ||
      isProfileRootPath(pathname))
  ) {
    options.clearReturnRoute?.();
    router.replace(returnRoute as never);
    return;
  }

  if (router.canGoBack()) {
    router.back();
    return;
  }

  if (returnRoute) {
    options.clearReturnRoute?.();
    router.replace(returnRoute as never);
    return;
  }

  router.replace(fallback as never);
}

export function merchantPush(
  router: Router,
  target: string,
  options: {
    fromPath?: string;
    returnRoute?: string;
    setReturnRoute?: (route: string | null) => void;
  }
) {
  const to = normalizePath(target);
  const from = normalizePath(options.fromPath);
  const remember =
    options.returnRoute != null ||
    (options.fromPath != null && shouldRememberReturnRoute(from, to));

  if (remember && options.setReturnRoute) {
    options.setReturnRoute(options.returnRoute ?? from);
  }

  router.push(target as never);
}

export function useMerchantGoBack(fallback?: string) {
  const router = useRouter();
  const pathname = usePathname();
  const { returnRoute, clearReturnRoute } = useProfileNav();

  return useCallback(() => {
    merchantGoBack(router, {
      pathname,
      returnRoute,
      clearReturnRoute,
      fallback: fallback ?? inferMerchantBackFallback(pathname),
    });
  }, [router, pathname, returnRoute, clearReturnRoute, fallback]);
}

export function useMerchantNavigate() {
  const router = useRouter();
  const pathname = usePathname();
  const { setReturnRoute } = useProfileNav();
  const goBack = useMerchantGoBack();

  const push = useCallback(
    (target: string, returnRoute?: string) => {
      merchantPush(router, target, {
        fromPath: pathname,
        returnRoute,
        setReturnRoute,
      });
    },
    [router, pathname, setReturnRoute]
  );

  return { push, goBack, pathname };
}
