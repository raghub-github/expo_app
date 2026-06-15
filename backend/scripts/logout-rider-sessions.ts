/**
 * Dev/admin: deactivate all device sessions for a rider so the app must log in again.
 * Usage: npx tsx scripts/logout-rider-sessions.ts 1053
 *        npx tsx scripts/logout-rider-sessions.ts +918972157515
 */
import { getSql } from "../src/db/client.js";
import { loadEnv } from "../src/config/loadEnv.js";

async function main() {
  loadEnv();
  const arg = process.argv[2]?.trim();
  if (!arg) {
    console.error("Usage: npx tsx scripts/logout-rider-sessions.ts <riderId|phoneE164>");
    process.exit(1);
  }

  const sql = getSql();
  let riderId: number | null = null;

  if (/^\d+$/.test(arg)) {
    riderId = parseInt(arg, 10);
  } else {
    const digits = arg.replace(/\D/g, "");
    const mobile = digits.startsWith("91") ? `+${digits}` : digits.length === 10 ? `+91${digits}` : arg;
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM riders WHERE mobile = ${mobile} LIMIT 1
    `;
    riderId = rows[0]?.id ?? null;
  }

  if (!riderId || !Number.isFinite(riderId)) {
    console.error("Rider not found for:", arg);
    process.exit(1);
  }

  const userId = `usr_${riderId}`;
  const updated = await sql`
    UPDATE user_device_sessions
    SET is_active = FALSE, last_active = now()
    WHERE user_id = ${userId} AND is_active = TRUE
    RETURNING id
  `;

  console.log(`Logged out rider ${riderId} (user_id=${userId}). Sessions deactivated: ${updated.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
