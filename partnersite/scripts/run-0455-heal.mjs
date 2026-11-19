import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  const envPath = path.join(root, ".env.local");
  const raw = fs.readFileSync(envPath, "utf8");
  const m = raw.match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error("DATABASE_URL missing");
  return m[1].trim().replace(/^['"]|['"]$/g, "");
}

const sql = postgres(loadDatabaseUrl(), {
  ssl: "require",
  max: 1,
  prepare: false,
});

const [{ before }] = await sql`
  SELECT COUNT(*)::int AS before
  FROM merchant_menu_items
  WHERE approval_status = 'PENDING'::merchant_menu_item_approval_status
    AND COALESCE(is_deleted, FALSE) = FALSE
`;

const result = await sql`
  UPDATE merchant_menu_items m
  SET
    approval_status = 'APPROVED'::merchant_menu_item_approval_status,
    approved_at = COALESCE(m.approved_at, NOW()),
    approved_by = COALESCE(m.approved_by, 'system:0455_heal_orphaned_pending'),
    rejection_reason = CASE
      WHEN EXISTS (
        SELECT 1
        FROM merchant_menu_item_images img
        WHERE img.menu_item_id = m.id
          AND img.is_primary = TRUE
          AND UPPER(TRIM(COALESCE(img.moderation_status, ''))) = 'REJECTED'
      ) THEN m.rejection_reason
      ELSE NULL
    END,
    updated_at = NOW()
  WHERE m.approval_status = 'PENDING'::merchant_menu_item_approval_status
    AND COALESCE(m.is_deleted, FALSE) = FALSE
    AND NOT EXISTS (
      SELECT 1
      FROM merchant_menu_item_review_requests r
      WHERE r.menu_item_id = m.id
        AND r.status = 'PENDING'::merchant_menu_item_review_request_status
    )
    AND NOT EXISTS (
      SELECT 1
      FROM merchant_menu_item_images img
      WHERE img.menu_item_id = m.id
        AND img.is_primary = TRUE
        AND UPPER(TRIM(COALESCE(img.moderation_status, 'PENDING'))) = 'PENDING'
    )
`;

const [{ after }] = await sql`
  SELECT COUNT(*)::int AS after
  FROM merchant_menu_items
  WHERE approval_status = 'PENDING'::merchant_menu_item_approval_status
    AND COALESCE(is_deleted, FALSE) = FALSE
`;

console.log(
  JSON.stringify(
    {
      pending_before: before,
      updated: result.count ?? null,
      pending_after: after,
    },
    null,
    2
  )
);

await sql.end({ timeout: 5 });
