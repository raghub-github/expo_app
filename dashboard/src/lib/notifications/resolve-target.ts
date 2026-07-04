import { getSql } from "@/lib/db/client";
import { resolveStorePublicIdInput } from "@/lib/merchants/normalize-store-search";
import { expandNotificationUserIdCandidates } from "@/lib/notifications/normalize-user-search";

export type ResolvedTarget =
  | {
      kind: "store";
      id: number;
      name: string;
      subtitle: string | null;
    }
  | {
      kind: "user";
      userId: string;
      role: "customer" | "merchant" | "rider" | "unknown";
      name: string;
      subtitle: string | null;
    };

type MerchantStoreRow = {
  id: number;
  store_id: string;
  store_name: string;
  store_display_name: string | null;
};

function mapResolvedStore(store: MerchantStoreRow): ResolvedTarget {
  const name =
    store.store_display_name?.trim() ||
    store.store_name?.trim() ||
    store.store_id?.trim() ||
    `Store #${store.id}`;
  return {
    kind: "store",
    id: store.id,
    name,
    subtitle: store.store_id ?? null,
  };
}

/** Accepts GMMC1025, 1025 (public suffix), or internal merchant_stores.id. */
export async function resolveNotificationStoreId(
  storeIdRaw: string,
): Promise<ResolvedTarget | null> {
  const trimmed = storeIdRaw.trim();
  if (!trimmed) return null;

  const sql = getSql();

  const publicId = resolveStorePublicIdInput(trimmed);
  if (/^GMMC\d+$/i.test(publicId)) {
    const byPublic = await sql<MerchantStoreRow[]>`
      SELECT id, store_id, store_name, store_display_name
      FROM merchant_stores
      WHERE UPPER(TRIM(store_id)) = UPPER(${publicId})
        AND deleted_at IS NULL
      LIMIT 1
    `;
    if (byPublic[0]) return mapResolvedStore(byPublic[0]);
  }

  if (/^\d+$/.test(trimmed)) {
    const internalId = Number(trimmed);
    if (Number.isFinite(internalId) && internalId > 0) {
      const byInternal = await sql<MerchantStoreRow[]>`
        SELECT id, store_id, store_name, store_display_name
        FROM merchant_stores
        WHERE id = ${internalId} AND deleted_at IS NULL
        LIMIT 1
      `;
      if (byInternal[0]) return mapResolvedStore(byInternal[0]);
    }
  }

  return null;
}

export async function resolveNotificationUserId(
  userIdRaw: string,
): Promise<ResolvedTarget | null> {
  const userId = userIdRaw.trim();
  if (!userId) return null;

  const sql = getSql();
  const { exactIds, riderPk, riderExplicit } = expandNotificationUserIdCandidates(userId);

  const resolveRider = async (pk: number): Promise<ResolvedTarget | null> => {
    const rows = await sql<Array<{ id: number; name: string | null; mobile: string | null }>>`
      SELECT id, name, mobile
      FROM riders
      WHERE id = ${pk} AND deleted_at IS NULL
      LIMIT 1
    `;
    const rider = rows[0];
    if (!rider) return null;
    return {
      kind: "user",
      userId: `usr_${rider.id}`,
      role: "rider",
      name: rider.name?.trim() || `Rider GMR${rider.id}`,
      subtitle: rider.mobile ?? `GMR${rider.id}`,
    };
  };

  if (riderExplicit && riderPk != null) {
    const rider = await resolveRider(riderPk);
    if (rider) return rider;
  }

  for (const candidate of exactIds) {
    const customerRows = await sql<
      Array<{ customer_id: string; full_name: string | null; primary_mobile: string | null }>
    >`
      SELECT customer_id, full_name, primary_mobile
      FROM customers
      WHERE LOWER(TRIM(customer_id)) = LOWER(${candidate})
        AND deleted_at IS NULL
      LIMIT 1
    `;
    const customer = customerRows[0];
    if (customer) {
      return {
        kind: "user",
        userId: customer.customer_id,
        role: "customer",
        name: customer.full_name?.trim() || customer.customer_id,
        subtitle: customer.primary_mobile ?? customer.customer_id,
      };
    }

    const merchantRows = await sql<
      Array<{
        parent_merchant_id: string;
        parent_name: string | null;
        owner_name: string | null;
        registered_phone: string | null;
      }>
    >`
      SELECT parent_merchant_id, parent_name, owner_name, registered_phone
      FROM merchant_parents
      WHERE LOWER(TRIM(parent_merchant_id)) = LOWER(${candidate})
      LIMIT 1
    `;
    const merchant = merchantRows[0];
    if (merchant) {
      return {
        kind: "user",
        userId: merchant.parent_merchant_id,
        role: "merchant",
        name: merchant.parent_name?.trim() || merchant.owner_name?.trim() || merchant.parent_merchant_id,
        subtitle: merchant.registered_phone ?? merchant.parent_merchant_id,
      };
    }
  }

  if (!riderExplicit && riderPk != null && Number.isFinite(riderPk) && riderPk > 0) {
    const rider = await resolveRider(riderPk);
    if (rider) return rider;
  }

  return null;
}
