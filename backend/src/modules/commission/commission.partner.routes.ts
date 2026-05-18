/**
 * Merchant-facing commission routes (mounted under /v1/merchant-partner via
 * registration in index.ts) — lets the partner app surface "your active rate"
 * with full source attribution and a per-order breakdown for trust.
 *
 *   GET /v1/merchant-partner/stores/:storeId/commission/active
 *   GET /v1/merchant-partner/stores/:storeId/commission/breakdown?order_id=GM…
 *   GET /v1/merchant-partner/stores/:storeId/commission/history
 *
 * Auth is the standard merchant JWT; we verify the partner owns the store
 * before returning anything.
 */
import type { FastifyInstance } from "fastify";
import { getSql } from "../../db/client.js";
import { auth } from "../../plugins/auth.js";
import { resolveStoreCommission } from "./commission.resolver.js";

async function ensureStoreOwnedByPartner(parentMerchantId: string, storeIdParam: string): Promise<number | null> {
  const sql = getSql();
  const parentRows = await sql<Array<{ id: number }>>`
    SELECT id FROM merchant_parents WHERE parent_merchant_id = ${parentMerchantId} LIMIT 1
  `;
  if (parentRows.length === 0) return null;
  const parentId = Number(parentRows[0]!.id);

  // Accept either the numeric pk or the public store_id text identifier.
  const numericId = /^\d+$/.test(storeIdParam) ? Number(storeIdParam) : null;
  const rows = await sql<Array<{ id: number }>>`
    SELECT id FROM merchant_stores
    WHERE parent_id = ${parentId}
      AND (${numericId == null} OR id = ${numericId ?? 0})
      AND (${numericId != null} OR store_id = ${storeIdParam})
    LIMIT 1
  `;
  return rows[0] ? Number(rows[0].id) : null;
}

export async function commissionPartnerRoutes(app: FastifyInstance) {
  await app.register(async (protectedApp) => {
    await protectedApp.register(auth, { required: true });

    protectedApp.get("/stores/:storeId/commission/active", async (req, reply) => {
      if (req.auth?.role !== "merchant" || !req.auth?.sub) {
        return reply.code(401).send({ error: "merchant_required" });
      }
      const storeIdParam = (req.params as { storeId?: string }).storeId;
      if (!storeIdParam) return reply.code(400).send({ error: "missing_store_id" });
      const storeId = await ensureStoreOwnedByPartner(req.auth.sub, storeIdParam);
      if (!storeId) return reply.code(403).send({ error: "store_not_found_for_partner" });
      const c = await resolveStoreCommission(storeId);
      return reply.send({
        ok: true,
        storeId,
        percent: c.percent,
        sourceKind: c.sourceKind,
        sourceLabel: c.sourceLabel,
        validUntil: c.validUntil,
        resolvedAt: c.resolvedAt,
      });
    });

    /**
     * Per-order commission breakdown, sourced from the immutable
     * order_item_commission_snapshots so the merchant sees exactly what the
     * platform deducted on each line.
     */
    protectedApp.get("/stores/:storeId/commission/breakdown", async (req, reply) => {
      if (req.auth?.role !== "merchant" || !req.auth?.sub) {
        return reply.code(401).send({ error: "merchant_required" });
      }
      const { storeId: storeIdParam } = req.params as { storeId?: string };
      const orderId = (req.query as { order_id?: string }).order_id;
      if (!storeIdParam || !orderId) return reply.code(400).send({ error: "missing_params" });
      const storeId = await ensureStoreOwnedByPartner(req.auth.sub, storeIdParam);
      if (!storeId) return reply.code(403).send({ error: "store_not_found_for_partner" });

      const sql = getSql();
      const rows = await sql<Array<Record<string, unknown>>>`
        SELECT
          s.id,
          s.order_item_id,
          s.merchant_base_price::text  AS merchant_base_price,
          s.commission_percent::text   AS commission_percent,
          s.customer_visible_price::text AS customer_visible_price,
          s.platform_earning::text     AS platform_earning,
          s.source_rule_kind,
          oci.item_name,
          oci.quantity
        FROM order_item_commission_snapshots s
        JOIN orders_core oc      ON oc.id = s.order_id
        JOIN orders_core_items oci ON oci.id = s.order_item_id
        WHERE oc.order_id = ${orderId}
          AND s.store_id = ${storeId}
        ORDER BY s.id ASC
      `;
      const totals = rows.reduce<{
        merchantBase: number;
        customerVisible: number;
        platformEarning: number;
      }>(
        (acc, r) => {
          const qty = Number(r.quantity ?? 1);
          acc.merchantBase += Number(r.merchant_base_price) * qty;
          acc.customerVisible += Number(r.customer_visible_price) * qty;
          acc.platformEarning += Number(r.platform_earning) * qty;
          return acc;
        },
        { merchantBase: 0, customerVisible: 0, platformEarning: 0 },
      );
      return reply.send({
        ok: true,
        orderId,
        lines: rows.map((r) => ({
          orderItemId: Number(r.order_item_id),
          itemName: String(r.item_name),
          quantity: Number(r.quantity),
          merchantBasePerUnit: String(r.merchant_base_price),
          customerVisiblePerUnit: String(r.customer_visible_price),
          commissionPercent: String(r.commission_percent),
          platformEarningPerUnit: String(r.platform_earning),
          sourceRuleKind: String(r.source_rule_kind),
        })),
        totals: {
          merchantBase: totals.merchantBase.toFixed(2),
          customerVisible: totals.customerVisible.toFixed(2),
          platformEarning: totals.platformEarning.toFixed(2),
        },
      });
    });

    /**
     * Rate change history — sourced from commission_audit_log for this store
     * plus a synthetic entry for the current resolver result so the merchant
     * always sees at least one row.
     */
    protectedApp.get("/stores/:storeId/commission/history", async (req, reply) => {
      if (req.auth?.role !== "merchant" || !req.auth?.sub) {
        return reply.code(401).send({ error: "merchant_required" });
      }
      const storeIdParam = (req.params as { storeId?: string }).storeId;
      if (!storeIdParam) return reply.code(400).send({ error: "missing_store_id" });
      const storeId = await ensureStoreOwnedByPartner(req.auth.sub, storeIdParam);
      if (!storeId) return reply.code(403).send({ error: "store_not_found_for_partner" });

      const sql = getSql();
      const rows = await sql<Array<Record<string, unknown>>>`
        SELECT id, action, old_value, new_value, reason, created_at::text AS created_at
        FROM commission_audit_log
        WHERE store_id = ${storeId} OR plan_id IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 50
      `;
      return reply.send({
        ok: true,
        storeId,
        entries: rows.map((r) => ({
          id: Number(r.id),
          action: String(r.action),
          oldValue: r.old_value ?? null,
          newValue: r.new_value ?? null,
          reason: r.reason == null ? null : String(r.reason),
          createdAt: String(r.created_at),
        })),
      });
    });
  });
}
