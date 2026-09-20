/**
 * CUSTOMER_SIGNUP OS push — profile complete often happens before the user
 * grants notification permission / registers an Expo+FCM token. We send at
 * profile completion (inbox fallback OK), then retry a real push once a token
 * lands so the welcome arrives as a system notification.
 */
import { getSql } from "../../db/client.js";
import { send } from "./notificationService.js";
import { IN_APP_ONLY_TOKEN } from "./targetResolver.js";

const SIGNUP_TEMPLATE = "CUSTOMER_SIGNUP";

export async function maybeRetryCustomerSignupOsPush(userId: string): Promise<void> {
  const uid = String(userId ?? "").trim();
  if (!uid) return;

  const sql = getSql();
  const profileRows = (await sql`
    SELECT full_name, profile_completed
    FROM public.customers
    WHERE customer_id = ${uid}
    LIMIT 1
  `) as unknown as Array<{ full_name: string | null; profile_completed: boolean | null }>;
  const profile = profileRows[0];
  if (!profile?.profile_completed) return;

  const delivered = (await sql`
    SELECT 1
    FROM public.notification_dispatch_logs
    WHERE recipient_user_id = ${uid}
      AND template_code = ${SIGNUP_TEMPLATE}
      AND channel = 'push'
      AND status IN ('sent', 'delivered', 'clicked')
      AND coalesce(device_token, '') <> ''
      AND device_token <> ${IN_APP_ONLY_TOKEN}
    LIMIT 1
  `) as unknown as Array<unknown>;
  if (delivered.length > 0) return;

  const name = (profile.full_name ?? "").trim();
  const customerName =
    name && name.toLowerCase() !== "pending" ? name : "";

  await send({
    templateCode: SIGNUP_TEMPLATE,
    variables: { customerName, name: customerName },
    target: { user_id: uid },
    channel: "push",
    deliverNow: true,
    // Distinct from the profile-complete attempt so inbox-only rows do not block OS push.
    idempotencyKey: `${SIGNUP_TEMPLATE}:${uid}:os_push`,
  });
}
