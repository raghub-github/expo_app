import "dotenv/config";
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const dupes = await sql`
      SELECT code, role, count(*)::int AS n
      FROM notification_templates
      GROUP BY code, role
      HAVING count(*) > 1
      ORDER BY n DESC
    `;
    console.log("DUPLICATE_TEMPLATES", JSON.stringify(dupes));

    const key = await sql`
      SELECT code, role, channel, priority, enabled
      FROM notification_templates
      WHERE code IN ('RIDER_NEW_ORDER','RIDER_DISPATCH_OFFER','MERCHANT_NEW_ORDER')
      ORDER BY code
    `;
    console.log("KEY_TEMPLATES", JSON.stringify(key, null, 2));

    const fake = await sql`
      SELECT template_code, channel, status, error_code, count(*)::int AS n
      FROM notification_dispatch_logs
      WHERE queued_at > now() - interval '7 days'
        AND device_token = '__in_app_only__'
      GROUP BY 1,2,3,4
      ORDER BY n DESC
      LIMIT 25
    `;
    console.log("IN_APP_ONLY_7D", JSON.stringify(fake, null, 2));

    const uniq = await sql`
      SELECT
        (SELECT count(*) FROM pg_constraint WHERE conname ILIKE '%notification_template%') AS tmpl_constraints,
        (SELECT indexname FROM pg_indexes WHERE tablename='notification_templates' AND indexdef ILIKE '%unique%' LIMIT 1) AS uniq_idx
    `;
    console.log("TEMPLATE_UNIQUENESS", JSON.stringify(uniq));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
