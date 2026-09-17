import "dotenv/config";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function main() {
  const templates = await sql`
    SELECT code, role, channel, priority, enabled
    FROM notification_templates
    WHERE role IN ('merchant', 'rider') AND enabled = TRUE
    ORDER BY role, code
  `;
  console.log("TEMPLATES", JSON.stringify(templates, null, 2));

  const recentFake = await sql`
    SELECT id, template_code, recipient_user_id, device_token, channel, status, queued_at
    FROM notification_dispatch_logs
    WHERE queued_at >= now() - interval '14 days'
      AND (
        device_token = '__in_app_only__'
        OR channel = 'in_app'
      )
      AND template_code IN ('RIDER_NEW_ORDER', 'RIDER_DISPATCH_OFFER', 'MERCHANT_NEW_ORDER')
    ORDER BY queued_at DESC
    LIMIT 10
  `;
  console.log("RECENT_IN_APP_CRITICAL", JSON.stringify(recentFake, null, 2));

  const riderNew = await sql`
    SELECT code, enabled, role, priority, channel, title_template
    FROM notification_templates WHERE code = 'RIDER_NEW_ORDER'
  `;
  console.log("RIDER_NEW_ORDER", JSON.stringify(riderNew, null, 2));

  await sql.end({ timeout: 5 });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
