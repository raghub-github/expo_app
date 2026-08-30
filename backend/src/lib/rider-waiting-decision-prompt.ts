/**
 * Rider waiting-decision prompt processor (Step 4). Driven by the ETA sweep. When the rider
 * has waited past the decision threshold and the order still isn't ready, ask the rider to
 * continue or cancel — over realtime (primary) + push (recovery). A non-response is re-asked
 * every 10 min for up to 30 min, then prompting STOPS. It NEVER auto-cancels — only an
 * explicit rider CANCEL (via the decision endpoint) ends the order.
 */
import { getSql } from "../db/client.js";
import { send as sendNotification } from "../modules/notifications/notificationService.js";
import { publishRiderEvent } from "../modules/realtime/publish.js";
import {
  resolveRiderWaitingDecision,
  WAITING_DECISION_REPROMPT_INTERVAL_MIN,
} from "./rider-waiting-decision.js";

/** Rider is asked to decide once waiting reaches this many minutes (the included-wait limit). */
export const RIDER_WAITING_DECISION_PROMPT_AFTER_MINUTES = 15;

export async function processRiderWaitDecisionPrompt(args: {
  orderCoreId: number;
  orderIdText: string;
  riderId: number | null;
  riderWaitMinutes: number;
  promptAfterMinutes?: number;
}): Promise<void> {
  try {
    await processRiderWaitDecisionPromptInner(args);
  } catch (e) {
    // Best-effort from the ETA sweep. Tolerate a not-yet-migrated table (0584) and any
    // transient error — never let it disrupt the sweep or spam unhandled rejections.
    const msg = e instanceof Error ? e.message : String(e);
    if (!/does not exist|relation .* does not exist/i.test(msg)) {
      console.warn("[rider-wait-decision]", args.orderCoreId, msg);
    }
  }
}

async function processRiderWaitDecisionPromptInner(args: {
  orderCoreId: number;
  orderIdText: string;
  riderId: number | null;
  riderWaitMinutes: number;
  promptAfterMinutes?: number;
}): Promise<void> {
  if (!args.riderId || args.riderId <= 0) return;
  const promptAfter = args.promptAfterMinutes ?? RIDER_WAITING_DECISION_PROMPT_AFTER_MINUTES;
  if (args.riderWaitMinutes < promptAfter) return;

  const sql = getSql();
  const rows = await sql<
    {
      prompts_sent: number;
      first_prompt_at: string | Date | null;
      last_prompt_at: string | Date | null;
      decision: string | null;
      stopped_at: string | Date | null;
    }[]
  >`
    SELECT prompts_sent, first_prompt_at, last_prompt_at, decision, stopped_at
    FROM rider_waiting_decisions
    WHERE order_id = ${args.orderCoreId}
    LIMIT 1
  `;
  const cur = rows[0];
  if (cur?.decision != null) return; // rider already chose — stop
  if (cur?.stopped_at != null) return; // already past the window

  const now = Date.now();
  const promptsSent = Number(cur?.prompts_sent ?? 0);
  const lastMs = cur?.last_prompt_at ? new Date(cur.last_prompt_at).getTime() : null;
  const firstMs = cur?.first_prompt_at ? new Date(cur.first_prompt_at).getTime() : null;

  const decision = resolveRiderWaitingDecision({
    waitMinutes: args.riderWaitMinutes,
    promptAfterMinutes: promptAfter,
    riderDecided: false,
    promptsSent,
    minutesSinceLastPrompt: lastMs != null ? (now - lastMs) / 60_000 : null,
    minutesSinceFirstPrompt: firstMs != null ? (now - firstMs) / 60_000 : null,
  });

  if (decision.action === "STOP") {
    await sql`
      INSERT INTO rider_waiting_decisions (order_id, rider_id, prompts_sent, stopped_at)
      VALUES (${args.orderCoreId}, ${args.riderId}, ${promptsSent}, now())
      ON CONFLICT (order_id) DO UPDATE
        SET stopped_at = COALESCE(rider_waiting_decisions.stopped_at, now()),
            updated_at = now()
    `;
    return;
  }
  if (decision.action !== "PROMPT") return;

  await sql`
    INSERT INTO rider_waiting_decisions (order_id, rider_id, prompts_sent, first_prompt_at, last_prompt_at)
    VALUES (${args.orderCoreId}, ${args.riderId}, 1, now(), now())
    ON CONFLICT (order_id) DO UPDATE SET
      prompts_sent = rider_waiting_decisions.prompts_sent + 1,
      first_prompt_at = COALESCE(rider_waiting_decisions.first_prompt_at, now()),
      last_prompt_at = now(),
      rider_id = ${args.riderId},
      updated_at = now()
  `;

  const occurredAt = new Date().toISOString();
  await publishRiderEvent(args.riderId, {
    type: "waiting.decision_prompt",
    orderId: args.orderIdText,
    waitMinutes: args.riderWaitMinutes,
    promptNumber: promptsSent + 1,
    repromptIntervalMinutes: WAITING_DECISION_REPROMPT_INTERVAL_MIN,
    occurredAt,
  }).catch(() => {});

  await sendNotification({
    templateCode: "RIDER_WAITING_DECISION",
    variables: { orderId: args.orderIdText, waitMinutes: args.riderWaitMinutes },
    target: { user_id: `usr_${args.riderId}` },
    priority: "high",
    idempotencyKey: `rider_wait_decision:${args.orderCoreId}:${promptsSent + 1}`,
    metadata: {
      type: "rider_waiting_decision",
      orderId: args.orderIdText,
      gmType: "RIDER_WAITING_DECISION",
    },
  }).catch(() => {});
}

/** Record the rider's explicit decision (continue / cancel) — stops the prompt loop. Idempotent. */
export async function recordRiderWaitingDecision(args: {
  orderCoreId: number;
  riderId: number;
  decision: "continue" | "cancel";
}): Promise<{ recorded: boolean; alreadyDecided?: string | null }> {
  const sql = getSql();
  const rows = await sql<{ decision: string | null }[]>`
    INSERT INTO rider_waiting_decisions (order_id, rider_id, decision, decided_at)
    VALUES (${args.orderCoreId}, ${args.riderId}, ${args.decision}, now())
    ON CONFLICT (order_id) DO UPDATE SET
      decision = COALESCE(rider_waiting_decisions.decision, EXCLUDED.decision),
      decided_at = COALESCE(rider_waiting_decisions.decided_at, now()),
      rider_id = ${args.riderId},
      updated_at = now()
    RETURNING decision
  `;
  return { recorded: true, alreadyDecided: rows[0]?.decision ?? null };
}
