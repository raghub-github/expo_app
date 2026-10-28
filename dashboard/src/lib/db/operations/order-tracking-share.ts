import { getSql } from "../client";
import { randomBytes } from "crypto";

const MAX_LINK_TTL_MS = 24 * 60 * 60 * 1000;

function generateTripShareToken(): string {
  const raw = randomBytes(8).toString("hex").toUpperCase();
  return `GTL${raw.slice(0, 10)}`;
}

/** Public customer tracking page URL for a share token (mirrors backend buildTripShareUrl). */
export function buildDashboardTripShareUrl(token: string): string {
  const explicit = process.env.TRACK_BASE_URL?.trim().replace(/\/+$/, "");
  if (explicit) return `${explicit}/${token}`;
  if (process.env.NODE_ENV !== "production") {
    const apiBase =
      process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, "") ||
      process.env.BACKEND_URL?.trim().replace(/\/+$/, "");
    if (apiBase) return `${apiBase}/trip/${token}`;
    return `http://localhost:3000/trip/${token}`;
  }
  return `https://track.gatimitra.com/trip/${token}`;
}

export type OrderTrackingShareResult = {
  token: string;
  url: string;
  expiresAt: string;
  created: boolean;
};

/**
 * Resolve (or create) an active trip share link for the public Tracking URL
 * shown on the control-dashboard Rider details card.
 *
 * `tripId` in trip_share_links is the formatted order id (e.g. GMF100053).
 */
export async function getOrCreateOrderTrackingShare(args: {
  orderIdText: string;
  orderCoreId?: number | null;
}): Promise<OrderTrackingShareResult | null> {
  const orderIdText = args.orderIdText.trim();
  if (!orderIdText) return null;

  const sql = getSql();
  // Never pass JS Date into postgres.js tagged templates here — it throws
  // ERR_INVALID_ARG_TYPE. Use SQL NOW() / interval instead.

  const existing = await sql<{ token: string; expires_at: Date | string }[]>`
    SELECT token, expires_at
    FROM trip_share_links
    WHERE trip_id = ${orderIdText}
      AND is_active = TRUE
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (existing[0]?.token) {
    return {
      token: existing[0].token,
      url: buildDashboardTripShareUrl(existing[0].token),
      expiresAt:
        existing[0].expires_at instanceof Date
          ? existing[0].expires_at.toISOString()
          : String(existing[0].expires_at),
      created: false,
    };
  }

  let customerPk: number | null = null;
  if (args.orderCoreId != null && Number.isFinite(args.orderCoreId) && args.orderCoreId > 0) {
    const rows = await sql<{ customer_id: number | string | null }[]>`
      SELECT customer_id
      FROM orders_core
      WHERE id = ${args.orderCoreId}
      LIMIT 1
    `;
    const cid = rows[0]?.customer_id;
    customerPk = cid != null && Number.isFinite(Number(cid)) ? Number(cid) : null;
  }
  if (customerPk == null) {
    const rows = await sql<{ customer_id: number | string | null }[]>`
      SELECT customer_id
      FROM orders_core
      WHERE formatted_order_id = ${orderIdText}
         OR order_id = ${orderIdText}
      ORDER BY id DESC
      LIMIT 1
    `;
    const cid = rows[0]?.customer_id;
    customerPk = cid != null && Number.isFinite(Number(cid)) ? Number(cid) : null;
  }

  const ttlHours = Math.max(1, Math.round(MAX_LINK_TTL_MS / (60 * 60 * 1000)));
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = generateTripShareToken();
    try {
      const inserted = await sql<{ expires_at: Date | string }[]>`
        INSERT INTO trip_share_links (trip_id, token, created_by, expires_at, is_active)
        VALUES (
          ${orderIdText},
          ${token},
          ${customerPk},
          NOW() + (${ttlHours}::text || ' hours')::interval,
          TRUE
        )
        RETURNING expires_at
      `;
      const expiresAt =
        inserted[0]?.expires_at instanceof Date
          ? inserted[0].expires_at.toISOString()
          : inserted[0]?.expires_at != null
            ? String(inserted[0].expires_at)
            : new Date(Date.now() + MAX_LINK_TTL_MS).toISOString();
      return {
        token,
        url: buildDashboardTripShareUrl(token),
        expiresAt,
        created: true,
      };
    } catch {
      /* unique token collision — retry */
    }
  }
  return null;
}
