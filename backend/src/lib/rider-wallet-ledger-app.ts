import { getSql } from "../db/client.js";

export type RiderLedgerSegment =
  | "all"
  | "food"
  | "parcel"
  | "ride"
  | "incentives"
  | "adjustments"
  | "penalties";

const ADJUSTMENT_ENTRY_TYPES = new Set(["adjustment", "refund", "onboarding_fee"]);

export type RiderLedgerPeriod = "this_month" | "last_month" | "all";

const CREDIT_ENTRY_TYPES = new Set([
  "earning",
  "bonus",
  "refund",
  "referral_bonus",
  "penalty_reversal",
]);

const INCENTIVE_ENTRY_TYPES = new Set(["bonus", "referral_bonus"]);

type LedgerRow = {
  id: number;
  entry_type: string;
  amount: string | number;
  balance: string | number | null;
  ref: string | null;
  ref_type: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
  service_type?: string | null;
};

export type RiderLedgerEntryDto = {
  id: number;
  entryType: string;
  flow: "credit" | "debit";
  category: string;
  description: string;
  amount: number;
  balance: number | null;
  ref: string | null;
  refType: string | null;
  serviceType: string | null;
  createdAt: string;
};

export function isCreditEntryType(entryType: string): boolean {
  return CREDIT_ENTRY_TYPES.has(entryType.toLowerCase());
}

function resolveServiceType(row: LedgerRow): string | null {
  const direct = row.service_type?.trim();
  if (direct) return direct.toLowerCase();
  const meta = row.metadata ?? {};
  for (const key of ["serviceType", "service_type", "service"]) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim().toLowerCase();
  }
  return null;
}

function categoryForRow(row: LedgerRow): string {
  const entryType = row.entry_type.toLowerCase();
  if (entryType === "penalty") return "penalties";
  if (ADJUSTMENT_ENTRY_TYPES.has(entryType)) return "adjustments";
  if (INCENTIVE_ENTRY_TYPES.has(entryType)) return "incentives";

  const service = resolveServiceType(row);
  if (service === "food") return "food";
  if (service === "parcel") return "parcel";
  if (service === "person_ride" || service === "ride") return "ride";

  if (entryType === "earning") return service ?? "food";
  return "other";
}

function descriptionForRow(row: LedgerRow): string {
  const desc = row.description?.trim();
  if (desc) return desc;

  const ref = row.ref?.trim();
  const refType = row.ref_type?.toLowerCase() ?? "";

  if (refType === "order" && ref) return `Order #${ref}`;
  if (refType === "withdrawal" && ref) return `Withdrawal #${ref}`;
  if (ref) return ref;

  switch (row.entry_type.toLowerCase()) {
    case "earning":
      return "Order earning";
    case "bonus":
      return "Bonus credited";
    case "referral_bonus":
      return "Referral bonus";
    case "penalty":
      return "Penalty deducted";
    case "refund":
      return "Refund credited";
    case "onboarding_fee":
      return "Onboarding fee";
    case "adjustment":
      return "Wallet adjustment";
    default:
      return row.entry_type.replace(/_/g, " ");
  }
}

function resolveDateRange(period: RiderLedgerPeriod): { from?: Date; to?: Date; label: string } {
  if (period === "all") {
    return { label: "All time" };
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  if (period === "this_month") {
    const from = new Date(year, month, 1, 0, 0, 0, 0);
    const to = new Date(year, month + 1, 0, 23, 59, 59, 999);
    return { from, to, label: "This month" };
  }

  const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const to = new Date(year, month, 0, 23, 59, 59, 999);
  return { from, to, label: "Last month" };
}

function segmentMatchesRow(segment: RiderLedgerSegment, row: LedgerRow): boolean {
  if (segment === "all") return true;

  const entryType = row.entry_type.toLowerCase();
  const category = categoryForRow(row);

  if (segment === "incentives") return INCENTIVE_ENTRY_TYPES.has(entryType);
  if (segment === "penalties") return entryType === "penalty";
  if (segment === "adjustments") return ADJUSTMENT_ENTRY_TYPES.has(entryType);
  if (segment === "food") return category === "food";
  if (segment === "parcel") return category === "parcel";
  if (segment === "ride") return category === "ride";
  return true;
}

function mapRow(row: LedgerRow): RiderLedgerEntryDto {
  const entryType = row.entry_type.toLowerCase();
  const amount = Math.abs(Number(row.amount ?? 0));
  return {
    id: Number(row.id),
    entryType,
    flow: isCreditEntryType(entryType) ? "credit" : "debit",
    category: categoryForRow(row),
    description: descriptionForRow(row),
    amount,
    balance: row.balance != null ? Number(row.balance) : null,
    ref: row.ref,
    refType: row.ref_type,
    serviceType: resolveServiceType(row),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function fetchLedgerRows(
  riderId: number,
  from?: Date,
  to?: Date,
): Promise<LedgerRow[]> {
  const sql = getSql();

  try {
    if (from && to) {
      return (await sql`
        SELECT
          id,
          entry_type,
          amount,
          balance,
          ref,
          ref_type,
          description,
          metadata,
          created_at,
          service_type
        FROM wallet_ledger
        WHERE rider_id = ${riderId}
          AND created_at >= ${from.toISOString()}
          AND created_at <= ${to.toISOString()}
        ORDER BY created_at DESC
      `) as LedgerRow[];
    }

    return (await sql`
      SELECT
        id,
        entry_type,
        amount,
        balance,
        ref,
        ref_type,
        description,
        metadata,
        created_at,
        service_type
      FROM wallet_ledger
      WHERE rider_id = ${riderId}
      ORDER BY created_at DESC
    `) as LedgerRow[];
  } catch {
    if (from && to) {
      return (await sql`
        SELECT
          id,
          entry_type,
          amount,
          balance,
          ref,
          ref_type,
          description,
          metadata,
          created_at
        FROM wallet_ledger
        WHERE rider_id = ${riderId}
          AND created_at >= ${from.toISOString()}
          AND created_at <= ${to.toISOString()}
        ORDER BY created_at DESC
      `) as LedgerRow[];
    }

    return (await sql`
      SELECT
        id,
        entry_type,
        amount,
        balance,
        ref,
        ref_type,
        description,
        metadata,
        created_at
      FROM wallet_ledger
      WHERE rider_id = ${riderId}
      ORDER BY created_at DESC
    `) as LedgerRow[];
  }
}

export async function getRiderLedgerForApp(args: {
  riderId: number;
  segment?: RiderLedgerSegment;
  period?: RiderLedgerPeriod;
  limit?: number;
  offset?: number;
}): Promise<{
  entries: RiderLedgerEntryDto[];
  total: number;
  hasMore: boolean;
  periodLabel: string;
}> {
  const segment = args.segment ?? "all";
  const period = args.period ?? "this_month";
  const limit = Math.min(100, Math.max(1, args.limit ?? 50));
  const offset = Math.max(0, args.offset ?? 0);
  const { from, to, label } = resolveDateRange(period);

  const rows = await fetchLedgerRows(args.riderId, from, to);
  const filtered = rows.filter((row) => segmentMatchesRow(segment, row));
  const total = filtered.length;
  const slice = filtered.slice(offset, offset + limit);
  const hasMore = offset + limit < total;

  return {
    entries: slice.map(mapRow),
    total,
    hasMore,
    periodLabel: label,
  };
}
