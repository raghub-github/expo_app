/**
 * Prevents stacked /order/[id] screens when a card is tapped repeatedly.
 * One in-flight open at a time until the cooldown elapses.
 */

type OrderDetailHref = { pathname: "/order/[id]"; params: { id: string } };

type Pushable = {
  push: (href: OrderDetailHref | string) => void;
  replace?: (href: OrderDetailHref | string) => void;
};

let lockedUntil = 0;
let lastOpenedId: string | null = null;

const DEFAULT_COOLDOWN_MS = 1_200;

function parseOrderDetailId(path: string | undefined | null): string | null {
  const match = String(path ?? "").match(/\/order\/([^/?#]+)/);
  return match?.[1]?.trim() || null;
}

export function canOpenOrderDetail(orderId: string, now = Date.now()): boolean {
  const id = String(orderId ?? "").trim();
  if (!id || id.startsWith("core-")) return false;
  if (now < lockedUntil && lastOpenedId === id) return false;
  return true;
}

/** Returns true if navigation was started. */
export function openOrderDetailOnce(
  router: Pushable,
  orderId: string,
  opts?: {
    cooldownMs?: number;
    fromPath?: string;
    currentPath?: string;
    setReturnRoute?: (route: string | null) => void;
  }
): boolean {
  const id = String(orderId ?? "").trim();
  if (!id || id.startsWith("core-")) return false;

  const currentPath = opts?.currentPath ?? opts?.fromPath ?? "";
  const openOrderId = parseOrderDetailId(currentPath);
  if (openOrderId === id) return false;

  const now = Date.now();
  if (now < lockedUntil && lastOpenedId === id) return false;

  const cooldown = opts?.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  lockedUntil = now + cooldown;
  lastOpenedId = id;

  if (opts?.fromPath && opts?.setReturnRoute) {
    opts.setReturnRoute(opts.fromPath);
  }

  const href: OrderDetailHref = { pathname: "/order/[id]", params: { id } };
  const onOrderDetail = openOrderId != null;
  if (onOrderDetail && router.replace) {
    router.replace(href);
  } else {
    router.push(href);
  }
  return true;
}

export function openOrderDetailHrefOnce(
  router: Pushable,
  href: string,
  opts?: { cooldownMs?: number }
): boolean {
  const match = href.match(/\/order\/([^/?#]+)/);
  const id = match?.[1] ?? "";
  if (!canOpenOrderDetail(id)) return false;
  const now = Date.now();
  const cooldown = opts?.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  lockedUntil = now + cooldown;
  lastOpenedId = id;
  router.push(href);
  return true;
}

export function getLastOpenedOrderDetailId(): string | null {
  return lastOpenedId;
}
