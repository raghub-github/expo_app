/**
 * Customer push + inbox when a merchant replies to a store review.
 */
import type postgres from "postgres";
import { send as sendNotification } from "../modules/notifications/notificationService.js";
import { repliesApiFields } from "./merchant-review-replies.js";

type Sql = postgres.Sql;

function replyPreview(text: string, max = 140): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

/** Strip legacy [IMAGES:...] blob from merchant_response for display/push. */
function plainReplyText(raw: string | null | undefined): string {
  const t = String(raw ?? "").trim();
  if (!t) return "";
  return t.replace(/\n?\[IMAGES:\[[\s\S]*\]\]\s*$/i, "").trim();
}

export async function notifyCustomerStoreReviewReply(
  sql: Sql,
  args: { reviewId: number }
): Promise<void> {
  const reviewId = Number(args.reviewId);
  if (!Number.isInteger(reviewId) || reviewId < 1) return;

  const rows = await sql<
    Array<{
      merchant_response: string | null;
      merchant_responses: unknown;
      merchant_responded_at: string | Date | null;
      order_id: number | null;
      customer_user_id: string | null;
      order_text: string | null;
      formatted_order_id: string | null;
      store_name: string | null;
    }>
  >`
    SELECT
      msr.merchant_response,
      msr.merchant_responses,
      msr.merchant_responded_at,
      msr.order_id,
      c.customer_id AS customer_user_id,
      oc.order_id AS order_text,
      oc.formatted_order_id,
      COALESCE(NULLIF(TRIM(ms.store_display_name), ''), ms.store_name) AS store_name
    FROM merchant_store_ratings msr
    JOIN customers c ON c.id = msr.customer_id
    LEFT JOIN orders_core oc ON oc.id = msr.order_id
    LEFT JOIN merchant_stores ms ON ms.id = msr.store_id
    WHERE msr.id = ${reviewId}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row?.customer_user_id?.trim()) return;

  const legacyText = plainReplyText(row.merchant_response);
  const { replyText, repliedAt } = repliesApiFields(
    row.merchant_responses,
    legacyText,
    row.merchant_responded_at
  );
  if (!replyText?.trim()) return;

  const orderIdText =
    (row.formatted_order_id && String(row.formatted_order_id).trim()) ||
    (row.order_text && String(row.order_text).trim()) ||
    (row.order_id != null ? String(row.order_id) : "");
  if (!orderIdText) return;

  const storeName = (row.store_name ?? "Restaurant").trim() || "Restaurant";
  const preview = replyPreview(replyText);
  const idemAt = repliedAt ? new Date(repliedAt).getTime() : Date.now();

  await sendNotification({
    templateCode: "CUSTOMER_STORE_REVIEW_REPLY",
    variables: {
      storeName,
      replyPreview: preview,
      orderId: orderIdText,
    },
    target: { user_id: row.customer_user_id.trim() },
    idempotencyKey: `CUSTOMER_STORE_REVIEW_REPLY:${reviewId}:${idemAt}`,
    metadata: {
      gmType: "CUSTOMER_STORE_REVIEW_REPLY",
      orderId: orderIdText,
      reviewId,
      storeName,
    },
  });
}
