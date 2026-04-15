import { getSql } from "../../db/client.js";

type Sql = ReturnType<typeof getSql>;

/** Values from backend/drizzle/0020_unified_ticket_system.sql — unified_ticket_title enum */
const LEGACY_UNIFIED_TICKET_TITLE_ENUM = new Set<string>([
  "ORDER_DELAYED",
  "ORDER_NOT_RECEIVED",
  "WRONG_ITEM_DELIVERED",
  "ITEM_MISSING",
  "ORDER_CANCELLED_WRONG",
  "PAYMENT_ISSUE",
  "REFUND_NOT_PROCESSED",
  "ORDER_DAMAGED",
  "ORDER_QUALITY_ISSUE",
  "RIDER_NOT_ARRIVED",
  "RIDER_BEHAVIOUR_ISSUE",
  "MERCHANT_NOT_PREPARING",
  "DELIVERY_ADDRESS_WRONG",
  "ORDER_NOT_ASSIGNED",
  "ORDER_REASSIGNMENT_NEEDED",
  "ACCOUNT_ISSUE",
  "PAYMENT_METHOD_ISSUE",
  "WALLET_ISSUE",
  "COUPON_NOT_APPLYING",
  "APP_TECHNICAL_ISSUE",
  "PROFILE_UPDATE_ISSUE",
  "ADDRESS_MANAGEMENT_ISSUE",
  "NOTIFICATION_NOT_RECEIVING",
  "EARNINGS_NOT_CREDITED",
  "WALLET_WITHDRAWAL_ISSUE",
  "APP_CRASH_OR_BUG",
  "LOCATION_TRACKING_ISSUE",
  "RIDER_ORDER_NOT_RECEIVING",
  "ONBOARDING_ISSUE",
  "DOCUMENT_VERIFICATION_ISSUE",
  "DUTY_LOG_ISSUE",
  "RATING_DISPUTE",
  "PAYOUT_DELAYED",
  "PAYOUT_NOT_RECEIVED",
  "SETTLEMENT_DISPUTE",
  "COMMISSION_DISPUTE",
  "MENU_UPDATE_ISSUE",
  "STORE_STATUS_ISSUE",
  "MERCHANT_ORDER_NOT_RECEIVING",
  "MERCHANT_APP_TECHNICAL_ISSUE",
  "VERIFICATION_ISSUE",
  "OTHER",
  "FEEDBACK",
  "COMPLAINT",
  "SUGGESTION",
]);

/**
 * ticket_titles.intake_unified_title can introduce codes not present on the legacy enum.
 * Until migration backend/drizzle/0201_unified_ticket_title_text_drop_enum.sql is applied,
 * map those to the closest legacy label. Metadata still stores the catalog id / row code.
 */
const INTAKE_TITLE_TO_LEGACY_ENUM: Record<string, string> = {
  STORE_LOCATION_ISSUE: "ADDRESS_MANAGEMENT_ISSUE",
};

let unifiedTicketsTicketTitlePgType: string | undefined = undefined;

async function loadUnifiedTicketsTicketTitlePgType(sql: Sql): Promise<string> {
  if (unifiedTicketsTicketTitlePgType !== undefined) {
    return unifiedTicketsTicketTitlePgType;
  }
  const rows = await sql`
    SELECT pg_catalog.format_type(a.atttypid, a.atttypmod) AS pg_type
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid AND c.relkind = 'r'
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE c.relname = 'unified_tickets'
      AND a.attname = 'ticket_title'
      AND a.attnum > 0
      AND NOT a.attisdropped
    LIMIT 1
  `;
  const t = String((rows[0] as { pg_type?: string } | undefined)?.pg_type ?? "").trim();
  unifiedTicketsTicketTitlePgType = t;
  return t;
}

/**
 * Value to bind for unified_tickets.ticket_title: full intake code when column is text/varchar;
 * otherwise a legacy enum label that Postgres accepts.
 */
export async function resolveTicketTitleForUnifiedTicketsInsert(sql: Sql, intakeTitle: string): Promise<string> {
  const code = String(intakeTitle ?? "").trim() || "OTHER";
  const pgType = await loadUnifiedTicketsTicketTitlePgType(sql);
  const isLegacyEnumColumn = pgType === "unified_ticket_title";
  if (!isLegacyEnumColumn) return code;
  if (LEGACY_UNIFIED_TICKET_TITLE_ENUM.has(code)) return code;
  return INTAKE_TITLE_TO_LEGACY_ENUM[code] ?? "OTHER";
}
