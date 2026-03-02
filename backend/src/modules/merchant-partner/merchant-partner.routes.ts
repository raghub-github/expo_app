import type { FastifyInstance } from "fastify";
import { getSql } from "../../db/client.js";
import { auth } from "../../plugins/auth.js";

/**
 * Merchant partner routes: GET /me returns parent + child stores.
 * Requires Authorization: Bearer <jwt> with role=merchant; sub = parent_merchant_id.
 */
export async function merchantPartnerRoutes(app: FastifyInstance) {
  await app.register(
    async (protectedApp) => {
      await protectedApp.register(auth, { required: true });

      protectedApp.get("/me", async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }

          const parentMerchantId = req.auth.sub;
          const sql = getSql();

          const parentRows = await sql`
            SELECT id, parent_merchant_id, parent_name, owner_name, owner_email, brand_name, registered_phone
            FROM merchant_parents
            WHERE parent_merchant_id = ${parentMerchantId}
            LIMIT 1
          `;
          const parentRow = parentRows[0];
          if (!parentRow) {
            return reply.code(404).send({ error: "partner_not_found" });
          }

          const parentId = Number(parentRow.id);

          const storeRows = await sql`
            SELECT ms.id, ms.store_id, ms.store_name, ms.full_address, ms.approval_status,
                   msrp.current_step, msrp.total_steps, msrp.registration_status
            FROM merchant_stores ms
            LEFT JOIN merchant_store_registration_progress msrp ON msrp.store_id = ms.id AND msrp.parent_id = ${parentId}
            WHERE ms.parent_id = ${parentId}
            ORDER BY ms.created_at ASC
          `;

          let subscriptionRows: Array<{ store_id: number; payment_status: string }> = [];
          try {
            subscriptionRows = (await sql`
              SELECT store_id, payment_status
              FROM merchant_subscriptions
              WHERE merchant_id = ${parentId}
            `) as any;
          } catch {
            // table may not exist
          }

          const subByStore = new Map<number, string>();
          for (const row of subscriptionRows) {
            if (row?.store_id != null) subByStore.set(Number(row.store_id), String(row?.payment_status ?? "PENDING"));
          }

          const childStores = (storeRows as any[]).map((s) => {
            const step = s?.current_step != null ? Number(s.current_step) : 1;
            const total = s?.total_steps != null ? Number(s.total_steps) : 9;
            const paymentStatus = s?.id != null && subByStore.get(Number(s.id)) === "PAID" ? "Completed" : "Pending";
            return {
              id: s?.id,
              store_id: s?.store_id,
              store_name: s?.store_name,
              full_address: s?.full_address ?? "",
              approval_status: s?.approval_status ?? "DRAFT",
              current_step: step,
              total_steps: total,
              payment_status: paymentStatus,
              registration_status: s?.registration_status ?? "IN_PROGRESS",
            };
          });

          const parent = {
            id: parentId,
            parent_merchant_id: String(parentRow.parent_merchant_id),
            parent_name: parentRow.parent_name,
            owner_name: parentRow.owner_name,
            owner_email: parentRow.owner_email ?? "",
            brand_name: parentRow.brand_name ?? "",
            registered_phone: parentRow.registered_phone,
          };

          return { parent, childStores };
        }
      );
    },
    { prefix: "/merchant-partner" }
  );
}
