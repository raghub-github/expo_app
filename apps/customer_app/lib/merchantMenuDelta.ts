import type { MenuItem } from "@/services/merchant.service";

export type MenuDeltaPayload = {
  menuVersion: number;
  unchanged?: boolean;
  requiresFullSync?: boolean;
  deletedItemIds?: string[];
  changedItems?: MenuItem[];
};

function menuItemSignature(item: MenuItem): string {
  return [
    item.id,
    item.name,
    item.price,
    item.basePrice ?? "",
    item.imageUrl ?? "",
    item.inStock === false ? "0" : "1",
    item.categoryId ?? "",
    item.categoryName ?? "",
  ].join("|");
}

/** Merge delta into cached menu — unchanged rows keep object identity for React.memo. */
export function mergeMenuDelta(current: MenuItem[], delta: MenuDeltaPayload): MenuItem[] {
  const byId = new Map(current.map((item) => [item.id, item]));

  for (const id of delta.deletedItemIds ?? []) {
    if (id) byId.delete(id);
  }

  for (const next of delta.changedItems ?? []) {
    const prev = byId.get(next.id);
    if (prev && menuItemSignature(prev) === menuItemSignature(next)) {
      continue;
    }
    byId.set(next.id, next);
  }

  return Array.from(byId.values());
}

export function menuVersionsMatch(
  cachedVersion: number | undefined,
  serverVersion: number | undefined
): boolean {
  return (
    cachedVersion != null &&
    serverVersion != null &&
    Number.isFinite(cachedVersion) &&
    Number.isFinite(serverVersion) &&
    cachedVersion >= serverVersion
  );
}
