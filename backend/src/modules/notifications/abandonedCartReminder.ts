/**
 * Abandoned-cart reminder queue — schedule / cancel / poll+send.
 * Client calls schedule when app backgrounds with items; cancel on foreground / clear / order.
 */
import { getSql } from "../../db/client.js";
import { readSetting } from "./db.js";
import { send } from "./notificationService.js";

function firstNameFromFull(full: string | null | undefined): string {
  const t = (full ?? "").trim();
  if (!t) return "there";
  return t.split(/\s+/)[0] ?? "there";
}

export async function scheduleAbandonedCartReminder(args: {
  userId: string;
  storeId: string;
  storeName: string;
}): Promise<{ ok: true; sendAfter: string }> {
  const sql = getSql();
  const delayMin = (await readSetting<number>("abandoned_cart_delay_min")) ?? 15;
  const minutes = Math.max(5, Math.min(180, Number(delayMin) || 15));
  const storeId = args.storeId.trim().slice(0, 128);
  const storeName = args.storeName.trim().slice(0, 200) || "your store";
  if (!args.userId || !storeId) {
    throw Object.assign(new Error("invalid_payload"), { statusCode: 400 });
  }

  const rows = (await sql`
    INSERT INTO public.customer_abandoned_cart_reminders
      (user_id, store_id, store_name, send_after, status, updated_at)
    VALUES (
      ${args.userId},
      ${storeId},
      ${storeName},
      now() + (${minutes}::text || ' minutes')::interval,
      'pending',
      now()
    )
    ON CONFLICT (user_id) WHERE status = 'pending'
    DO UPDATE SET
      store_id = EXCLUDED.store_id,
      store_name = EXCLUDED.store_name,
      send_after = EXCLUDED.send_after,
      updated_at = now()
    RETURNING send_after::text AS send_after
  `) as unknown as Array<{ send_after: string }>;

  return { ok: true, sendAfter: rows[0]?.send_after ?? "" };
}

export async function cancelAbandonedCartReminder(userId: string): Promise<{ ok: true; cancelled: number }> {
  const sql = getSql();
  const rows = (await sql`
    UPDATE public.customer_abandoned_cart_reminders
    SET status = 'cancelled', updated_at = now()
    WHERE user_id = ${userId} AND status = 'pending'
    RETURNING id
  `) as unknown as Array<{ id: number }>;
  return { ok: true, cancelled: rows.length };
}

export async function pollAbandonedCartReminders(limit = 40): Promise<number> {
  const sql = getSql();
  let sent = 0;
  try {
    const due = (await sql`
      SELECT id, user_id, store_id, store_name
      FROM public.customer_abandoned_cart_reminders
      WHERE status = 'pending' AND send_after <= now()
      ORDER BY send_after ASC
      LIMIT ${limit}
    `) as unknown as Array<{
      id: number;
      user_id: string;
      store_id: string;
      store_name: string;
    }>;

    for (const row of due) {
      const claimed = (await sql`
        UPDATE public.customer_abandoned_cart_reminders
        SET status = 'sent', sent_at = now(), updated_at = now()
        WHERE id = ${row.id} AND status = 'pending'
        RETURNING id
      `) as unknown as Array<{ id: number }>;
      if (!claimed.length) continue;

      let firstName = "there";
      try {
        const names = (await sql`
          SELECT full_name
          FROM public.user_profiles
          WHERE user_id = ${row.user_id}
          LIMIT 1
        `) as unknown as Array<{ full_name: string | null }>;
        firstName = firstNameFromFull(names[0]?.full_name);
      } catch {
        /* profile optional */
      }

      const deepLink = `/home/merchant/${encodeURIComponent(row.store_id)}`;
      const dayKey = new Date().toISOString().slice(0, 10);
      const result = await send({
        templateCode: "CUSTOMER_ABANDONED_CART",
        variables: {
          firstName,
          storeName: row.store_name,
          storeId: row.store_id,
        },
        target: { user_id: row.user_id },
        overrides: {
          deepLink,
        },
        metadata: {
          target_type: "STORE",
          target_store_id: row.store_id,
          targetStoreId: row.store_id,
        },
        idempotencyKey: `CUSTOMER_ABANDONED_CART:${row.user_id}:${row.store_id}:${dayKey}`,
      });
      sent += result.queued;
    }
  } catch (e) {
    console.warn("[notifications] abandoned cart poll skipped:", (e as Error).message);
  }
  return sent;
}
