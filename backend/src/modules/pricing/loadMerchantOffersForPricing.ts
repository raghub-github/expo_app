/**
 * Load active merchant offers for canonical item pricing (menu + cart rewrite).
 * Indexed by store_id + lifecycle/dates — does not load all offers in the system.
 */
import { getDb, getSql } from "../../db/client.js";
import {
  merchantOffers as merchantOffersTable,
} from "../../db/schema.js";
import { and, asc, eq, gte, lte, or, sql } from "drizzle-orm";
import type { MerchantOfferRow } from "../billing/types.js";

function n(v: unknown): number | null {
  if (v == null) return null;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : null;
}

export async function loadMerchantOffersForPricing(storeId: number): Promise<MerchantOfferRow[]> {
  if (!Number.isFinite(storeId) || storeId <= 0) return [];
  const db = getDb();
  const now = new Date();
  try {
    const mo = await db
      .select({
        id: merchantOffersTable.id,
        offerId: merchantOffersTable.offerId,
        offerTitle: merchantOffersTable.offerTitle,
        offerType: merchantOffersTable.offerType,
        offerSubType: merchantOffersTable.offerSubType,
        discountValue: merchantOffersTable.discountValue,
        discountPercentage: merchantOffersTable.discountPercentage,
        maxDiscountAmount: merchantOffersTable.maxDiscountAmount,
        minOrderAmount: merchantOffersTable.minOrderAmount,
        maxOrderAmount: merchantOffersTable.maxOrderAmount,
        buyQuantity: merchantOffersTable.buyQuantity,
        getQuantity: merchantOffersTable.getQuantity,
        couponCode: merchantOffersTable.couponCode,
        autoApply: merchantOffersTable.autoApply,
        isStackable: merchantOffersTable.isStackable,
        perOrderLimit: merchantOffersTable.perOrderLimit,
        firstOrderOnly: merchantOffersTable.firstOrderOnly,
        newUserOnly: merchantOffersTable.newUserOnly,
        maxUsesTotal: merchantOffersTable.maxUsesTotal,
        maxUsesPerUser: merchantOffersTable.maxUsesPerUser,
        currentUses: merchantOffersTable.currentUses,
        applicableOnDays: merchantOffersTable.applicableOnDays,
        applicableTimeStart: merchantOffersTable.applicableTimeStart,
        applicableTimeEnd: merchantOffersTable.applicableTimeEnd,
        maxDiscountPerOrder: merchantOffersTable.maxDiscountPerOrder,
        offerMetadata: merchantOffersTable.offerMetadata,
        displayPriority: merchantOffersTable.displayPriority,
        priority: merchantOffersTable.priority,
        createdSourcePlatform: merchantOffersTable.createdSourcePlatform,
        createdByRole: merchantOffersTable.createdByRole,
        approvalStatus: merchantOffersTable.approvalStatus,
      })
      .from(merchantOffersTable)
      .where(
        and(
          eq(merchantOffersTable.storeId, storeId),
          eq(merchantOffersTable.isActive, true),
          or(
            eq(merchantOffersTable.lifecycleStatus, "ACTIVE"),
            eq(merchantOffersTable.lifecycleStatus, "SCHEDULED"),
            sql`${merchantOffersTable.lifecycleStatus} IS NULL`
          ),
          lte(merchantOffersTable.validFrom, now),
          gte(merchantOffersTable.validTill, now)
        )
      )
      .orderBy(sql`${merchantOffersTable.displayPriority} DESC NULLS LAST`, asc(merchantOffersTable.id));

    const offerPks = mo.map((r) => Number(r.id)).filter((id) => Number.isFinite(id) && id > 0);
    const idsByOfferPk = new Map<number, string[]>();
    if (offerPks.length > 0) {
      try {
        const pg = getSql();
        const appRows = await pg`
          SELECT a.offer_id, a.menu_item_id, m.item_id
          FROM merchant_offer_applicability a
          LEFT JOIN merchant_menu_items m ON m.id = a.menu_item_id
          WHERE a.offer_id = ANY(${offerPks})
            AND a.menu_item_id IS NOT NULL
        `;
        const typed = appRows as unknown as Array<{
          offer_id: number | string;
          menu_item_id: number | string | null;
          item_id: string | null;
        }>;
        for (const row of typed) {
          const oid = Number(row.offer_id);
          if (!Number.isFinite(oid)) continue;
          const list = idsByOfferPk.get(oid) ?? [];
          if (row.menu_item_id != null) list.push(String(row.menu_item_id));
          if (row.item_id) list.push(String(row.item_id).trim());
          idsByOfferPk.set(oid, list);
        }
      } catch {
        /* applicability table optional */
      }
    }

    return mo.map((r) => {
      const meta =
        r.offerMetadata && typeof r.offerMetadata === "object"
          ? { ...(r.offerMetadata as Record<string, unknown>) }
          : {};
      const fromMetaRaw = meta.menu_item_ids ?? meta.menuItemIds ?? meta.selected_item_ids;
      const fromMeta = Array.isArray(fromMetaRaw)
        ? fromMetaRaw.map((v) => String(v).trim()).filter(Boolean)
        : [];
      const fromApp = idsByOfferPk.get(Number(r.id)) ?? [];
      const mergedIds = [...new Set([...fromMeta, ...fromApp])];
      if (mergedIds.length > 0) meta.menu_item_ids = mergedIds;
      return {
        id: r.id,
        offerId: r.offerId,
        title: r.offerTitle,
        offerType: String(r.offerType ?? "PERCENTAGE"),
        offerSubType: r.offerSubType ?? null,
        discountValue: n(r.discountValue),
        discountPercentage: n(r.discountPercentage),
        maxDiscountAmount: n(r.maxDiscountAmount),
        minOrderAmount: n(r.minOrderAmount),
        maxOrderAmount: n(r.maxOrderAmount),
        buyQuantity: r.buyQuantity ?? null,
        getQuantity: r.getQuantity ?? null,
        couponCode: r.couponCode ?? null,
        autoApply: r.autoApply ?? true,
        isStackable: r.isStackable ?? false,
        perOrderLimit: r.perOrderLimit ?? 1,
        firstOrderOnly: r.firstOrderOnly ?? false,
        newUserOnly: r.newUserOnly ?? false,
        maxUsesTotal: r.maxUsesTotal ?? null,
        maxUsesPerUser: r.maxUsesPerUser ?? null,
        currentUses: r.currentUses ?? 0,
        applicableOnDays: Array.isArray(r.applicableOnDays) ? (r.applicableOnDays as string[]) : null,
        applicableTimeStart: r.applicableTimeStart ?? null,
        applicableTimeEnd: r.applicableTimeEnd ?? null,
        maxDiscountPerOrder: n(r.maxDiscountPerOrder),
        metadata: meta,
        displayPriority: r.displayPriority ?? 0,
        priority: r.priority ?? 0,
        createdSourcePlatform: r.createdSourcePlatform ?? "MERCHANT_APP",
        createdByRole: r.createdByRole ?? "MERCHANT",
        approvalStatus: r.approvalStatus ?? "AUTO_APPROVED",
      };
    });
  } catch {
    return [];
  }
}
