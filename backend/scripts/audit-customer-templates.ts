/**
 * One-shot: list enabled customer templates + recent multi-channel dispatch rows.
 */
import "dotenv/config";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  const sql = postgres(url, { max: 1 });
  try {
    const templates = await sql<{
      code: string;
      channel: string;
      priority: string;
      enabled: boolean;
    }[]>`
      SELECT code, channel, priority, enabled
      FROM notification_templates
      WHERE role = 'customer' AND enabled = true
      ORDER BY code
    `;
    console.log("=== CUSTOMER TEMPLATES ===");
    for (const t of templates) {
      console.log(`${t.code}\t${t.channel}\t${t.priority}`);
    }

    const logs = await sql<{
      template_code: string;
      channel: string;
      status: string;
      error_code: string | null;
      tok: string | null;
      queued_at: Date;
    }[]>`
      SELECT template_code, channel, status, error_code,
             left(coalesce(device_token, ''), 18) AS tok,
             queued_at
      FROM notification_dispatch_logs
      WHERE queued_at > now() - interval '3 days'
        AND (
          template_code LIKE 'ORDER_%'
          OR template_code LIKE 'RIDE_%'
          OR template_code LIKE 'PARCEL_%'
          OR template_code LIKE 'CUSTOMER_%'
          OR template_code IN ('RIDER_NEW_ORDER', 'RIDER_DISPATCH_OFFER', 'MERCHANT_NEW_ORDER')
        )
      ORDER BY queued_at DESC
      LIMIT 40
    `;
    console.log("=== RECENT LOGS ===");
    console.log(JSON.stringify(logs, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
