/**
 * Prevents stacked /order/[id] screens when a card is tapped repeatedly.
 * One in-flight open at a time until the cooldown elapses.
 */

type Pushable = {
  push: (href: { pathname: "/order/[id]"; params: { id: string } } | string) => void;
};

let lockedUntil = 0;
let lastOpenedId: string | null = null;

const DEFAULT_COOLDOWN_MS = 1_200;

export function canOpenOrderDetail(orderId: string, now = Date.now()): boolean {
  const id = String(orderId ?? "").trim();
  if (!id || id.startsWith("core-")) return false;
  if (now < lockedUntil) return false;
  return true;
}

/** Returns true if navigation was started. */
export function openOrderDetailOnce(
  router: Pushable,
  orderId: string,
  opts?: { cooldownMs?: number }
): boolean {
  const id = String(orderId ?? "").trim();
  if (!id || id.startsWith("core-")) return false;

  const now = Date.now();
  if (now < lockedUntil) return false;

  const cooldown = opts?.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  lockedUntil = now + cooldown;
  lastOpenedId = id;

  router.push({ pathname: "/order/[id]", params: { id } });
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
