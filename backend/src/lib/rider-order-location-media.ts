import { getSql } from "../db/client.js";
import { toAbsoluteClientMediaUrl } from "../utils/publicAttachmentUrl.js";

export type RiderOrderLocationMedia = {
  dropAddressImageUrl: string | null;
  storeImageUrl: string | null;
};

function asMediaUrl(raw: unknown): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  return toAbsoluteClientMediaUrl(trimmed);
}

/**
 * Door photo (customer saved address) for drop. Store marketing banner is
 * never used — only a real pickup location photo would populate storeImageUrl.
 */
export async function loadRiderOrderLocationMedia(args: {
  orderId: string;
  customerId?: number | null;
  merchantStoreId?: number | null;
  dropLat?: number | null;
  dropLon?: number | null;
}): Promise<RiderOrderLocationMedia> {
  const orderId = args.orderId.trim();
  const sql = getSql();
  let dropAddressImageUrl: string | null = null;

  if (orderId) {
    try {
      const doorRows = (await sql`
        SELECT ca.delivery_door_image_url AS url
        FROM pending_orders po
        INNER JOIN customer_addresses ca ON ca.id = po.address_id_used
        WHERE po.finalized_order_id = ${orderId}
          AND ca.delivery_door_image_url IS NOT NULL
          AND btrim(ca.delivery_door_image_url) <> ''
        ORDER BY po.finalized_at DESC NULLS LAST
        LIMIT 1
      `) as Array<{ url: string | null }>;
      dropAddressImageUrl = asMediaUrl(doorRows[0]?.url);
    } catch (err) {
      console.warn(
        "[rider-media] door image via pending_orders failed",
        orderId,
        (err as Error).message
      );
    }
  }

  if (!dropAddressImageUrl && args.customerId != null && Number(args.customerId) > 0) {
    const customerId = Number(args.customerId);
    const lat = args.dropLat;
    const lon = args.dropLon;
    try {
      const byCoords =
        lat != null &&
        lon != null &&
        Number.isFinite(lat) &&
        Number.isFinite(lon)
          ? ((await sql`
              SELECT delivery_door_image_url AS url
              FROM customer_addresses
              WHERE customer_id = ${customerId}
                AND deleted_at IS NULL
                AND delivery_door_image_url IS NOT NULL
                AND btrim(delivery_door_image_url) <> ''
                AND latitude IS NOT NULL
                AND longitude IS NOT NULL
                AND abs(latitude::float8 - ${lat}) < 0.0008
                AND abs(longitude::float8 - ${lon}) < 0.0008
              ORDER BY last_used_at DESC NULLS LAST, updated_at DESC
              LIMIT 1
            `) as Array<{ url: string | null }>)
          : [];
      dropAddressImageUrl = asMediaUrl(byCoords[0]?.url);
    } catch (err) {
      console.warn(
        "[rider-media] door image via customer_addresses failed",
        customerId,
        (err as Error).message
      );
    }
  }

  return { dropAddressImageUrl, storeImageUrl: null };
}
