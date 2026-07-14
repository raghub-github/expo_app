/**
 * Detect overlapping merchant offers for Partner Site conflict UX.
 */
import { and, eq, gte, lte, ne, or, sql } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { merchantOffers } from "../../db/schema.js";
import type { OfferConflict } from "./pricing.types.js";
import { lifecycleEligibleForPricing } from "./offer-lifecycle.js";

function num(v: unknown): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function parseIds(meta: Record<string, unknown> | null | undefined): string[] {
  const raw = meta?.menu_item_ids ?? meta?.menuItemIds;
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x).trim()).filter(Boolean);
}

function parseCategoryIds(meta: Record<string, unknown> | null | undefined): number[] {
  const raw = meta?.category_ids;
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => Number(x)).filter((n) => Number.isFinite(n));
}

function datesOverlap(
  aFrom: Date,
  aTill: Date,
  bFrom: Date,
  bTill: Date
): boolean {
  return aFrom <= bTill && bFrom <= aTill;
}

function daysOverlap(a: string[] | null | undefined, b: string[] | null | undefined): boolean {
  if (!a?.length || !b?.length) return true;
  const norm = (d: string) => d.trim().toUpperCase().slice(0, 3);
  const setB = new Set(b.map(norm));
  return a.some((d) => setB.has(norm(d)));
}

function timesOverlap(
  aStart: string | null | undefined,
  aEnd: string | null | undefined,
  bStart: string | null | undefined,
  bEnd: string | null | undefined
): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return true;
  return aStart <= bEnd && bStart <= aEnd;
}

export type ConflictCheckInput = {
  storeId: number;
  validFrom: string | Date;
  validTill: string | Date;
  menuItemIds?: string[];
  categoryIds?: number[];
  applicabilityType?: string;
  priority?: number;
  isStackable?: boolean;
  excludeOfferId?: number | null;
  applicableOnDays?: string[] | null;
  applicableTimeStart?: string | null;
  applicableTimeEnd?: string | null;
};

export async function detectOfferConflicts(input: ConflictCheckInput): Promise<OfferConflict[]> {
  const db = getDb();
  const now = new Date();
  const validFrom = new Date(input.validFrom);
  const validTill = new Date(input.validTill);
  const draftItems = new Set((input.menuItemIds ?? []).map((x) => String(x).trim()));
  const draftCats = new Set(input.categoryIds ?? []);
  const storeWide = !draftItems.size && !draftCats.size;

  const conditions = [
    eq(merchantOffers.storeId, input.storeId),
    eq(merchantOffers.isActive, true),
    or(
      eq(merchantOffers.lifecycleStatus, "ACTIVE"),
      eq(merchantOffers.lifecycleStatus, "SCHEDULED"),
      sql`${merchantOffers.lifecycleStatus} IS NULL`
    ),
    lte(merchantOffers.validFrom, validTill),
    gte(merchantOffers.validTill, validFrom),
  ];

  if (input.excludeOfferId != null && input.excludeOfferId > 0) {
    conditions.push(ne(merchantOffers.id, input.excludeOfferId));
  }

  const rows = await db
    .select({
      id: merchantOffers.id,
      title: merchantOffers.offerTitle,
      priority: merchantOffers.priority,
      isStackable: merchantOffers.isStackable,
      validFrom: merchantOffers.validFrom,
      validTill: merchantOffers.validTill,
      applicableOnDays: merchantOffers.applicableOnDays,
      applicableTimeStart: merchantOffers.applicableTimeStart,
      applicableTimeEnd: merchantOffers.applicableTimeEnd,
      offerMetadata: merchantOffers.offerMetadata,
      lifecycleStatus: merchantOffers.lifecycleStatus,
    })
    .from(merchantOffers)
    .where(and(...conditions));

  const conflicts: OfferConflict[] = [];

  for (const row of rows) {
    const status = row.lifecycleStatus as string | null;
    if (status && !lifecycleEligibleForPricing(status as "ACTIVE") && status !== "SCHEDULED") {
      continue;
    }

    const meta = (row.offerMetadata ?? {}) as Record<string, unknown>;
    const existingItems = parseIds(meta);
    const existingCats = parseCategoryIds(meta);
    const existingStoreWide = existingItems.length === 0 && existingCats.length === 0;

    if (
      !datesOverlap(validFrom, validTill, row.validFrom, row.validTill)
    ) {
      continue;
    }

    if (
      !daysOverlap(input.applicableOnDays, row.applicableOnDays ?? undefined) ||
      !timesOverlap(
        input.applicableTimeStart,
        input.applicableTimeEnd,
        row.applicableTimeStart,
        row.applicableTimeEnd
      )
    ) {
      continue;
    }

    const sharedItems = existingItems.filter((id) => draftItems.has(id));
    const sharedCats = existingCats.filter((id) => draftCats.has(id));

    if (sharedItems.length > 0) {
      conflicts.push({
        severity: input.isStackable === false || row.isStackable === false ? "error" : "warning",
        code: "PRODUCT_OVERLAP",
        message: `Overlaps on ${sharedItems.length} product(s) with "${row.title}"`,
        conflictingOfferId: row.id,
        conflictingOfferTitle: row.title,
        overlapType: "product",
      });
    } else if (sharedCats.length > 0) {
      conflicts.push({
        severity: "warning",
        code: "CATEGORY_OVERLAP",
        message: `Overlaps on ${sharedCats.length} categor${sharedCats.length === 1 ? "y" : "ies"} with "${row.title}"`,
        conflictingOfferId: row.id,
        conflictingOfferTitle: row.title,
        overlapType: "category",
      });
    } else if (storeWide && existingStoreWide) {
      conflicts.push({
        severity: num(input.priority) <= num(row.priority) ? "warning" : "info",
        code: "STORE_WIDE_OVERLAP",
        message: `Store-wide offer overlaps with "${row.title}"`,
        conflictingOfferId: row.id,
        conflictingOfferTitle: row.title,
        overlapType: "store",
      });
    }

    if (
      !input.isStackable &&
      !row.isStackable &&
      (sharedItems.length > 0 || sharedCats.length > 0 || (storeWide && existingStoreWide))
    ) {
      conflicts.push({
        severity: "error",
        code: "NON_STACKABLE_CLASH",
        message: `Both offers are non-stackable — only higher priority (${Math.max(num(input.priority), num(row.priority))}) wins at checkout`,
        conflictingOfferId: row.id,
        conflictingOfferTitle: row.title,
        overlapType: "stacking",
      });
    }

    if (
      num(input.priority) === num(row.priority) &&
      (sharedItems.length > 0 || sharedCats.length > 0 || (storeWide && existingStoreWide))
    ) {
      conflicts.push({
        severity: "warning",
        code: "PRIORITY_TIE",
        message: `Same priority (${num(row.priority)}) as "${row.title}" — tie-break uses offer id`,
        conflictingOfferId: row.id,
        conflictingOfferTitle: row.title,
        overlapType: "priority",
      });
    }
  }

  return conflicts;
}
