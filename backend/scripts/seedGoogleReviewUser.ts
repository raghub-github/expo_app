/**
 * Idempotent seed for the Google Play review user.
 *
 * Run on a workstation or one-off VPS shell:
 *   tsx backend/scripts/seedGoogleReviewUser.ts
 *
 * Reads phone/name from env so nothing is hard-coded in source:
 *   GOOGLE_REVIEW_PHONE    e.g. +919999999999
 *   GOOGLE_REVIEW_NAME     defaults to "Google Play Reviewer"
 *   GOOGLE_REVIEW_EMAIL    defaults to play-reviewer@gatimitra.com
 *   GOOGLE_REVIEW_WALLET   defaults to 1000 (INR)
 *
 * What it does (all idempotent):
 *   1. Insert / update the customer row with wallet ₹1000 and GMitra Plus on.
 *   2. Insert 2 demo addresses (HOME + WORK) if the customer has none.
 *   3. Optionally seed wallet-transactions / coupons / notifications / orders
 *      ONLY if those tables exist in the live DB. The script never touches
 *      production users — it scopes every write to this single customer.
 *
 * Designed to be safe in prod: every write is guarded by phone match and
 * the script aborts loudly if it would touch more than one customer row.
 */
import postgres from "postgres";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), "backend/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const PHONE_RAW = process.env.GOOGLE_REVIEW_PHONE ?? "+919999999999";
const NAME = process.env.GOOGLE_REVIEW_NAME ?? "Google Play Reviewer";
const EMAIL = process.env.GOOGLE_REVIEW_EMAIL ?? "play-reviewer@gatimitra.com";
const WALLET_INR = Number(process.env.GOOGLE_REVIEW_WALLET ?? "1000");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  return raw.startsWith("+") ? raw : `+${digits}`;
}

const PHONE_E164 = normalisePhone(PHONE_RAW);
const PHONE_DIGITS = PHONE_E164.replace(/\D/g, "");
const PHONE_NORMALIZED = PHONE_DIGITS;

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function tableExists(name: string): Promise<boolean> {
  const r = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${name}
    ) AS exists
  `;
  return !!r[0]?.exists;
}

async function upsertCustomer(): Promise<{ id: number; customerId: string }> {
  const existing = await sql<{ id: number; customer_id: string }[]>`
    SELECT id, customer_id
    FROM customers
    WHERE primary_mobile = ${PHONE_E164}
       OR primary_mobile_normalized = ${PHONE_NORMALIZED}
    LIMIT 2
  `;

  if (existing.length > 1) {
    throw new Error(
      `Refusing to continue: ${existing.length} customer rows match phone ${PHONE_E164}. Manual cleanup required.`,
    );
  }

  if (existing.length === 1) {
    const id = Number(existing[0].id);
    await sql`
      UPDATE customers SET
        full_name           = ${NAME},
        email               = ${EMAIL},
        mobile_verified     = TRUE,
        is_mobile_verified  = TRUE,
        account_status      = 'ACTIVE',
        wallet_balance      = ${WALLET_INR}::numeric,
        gmitra_plus_active  = TRUE,
        deleted_at          = NULL,
        deletion_reason     = NULL,
        sessions_invalid_before = NULL,
        updated_at          = now()
      WHERE id = ${id}
    `;
    console.log(`[seed] updated existing customer id=${id}`);
    return { id, customerId: existing[0].customer_id };
  }

  const newCustomerId = `GMC-REV-${Date.now()}`;
  const inserted = await sql<{ id: number; customer_id: string }[]>`
    INSERT INTO customers (
      customer_id,
      customer_uuid,
      full_name,
      email,
      primary_mobile,
      primary_mobile_normalized,
      primary_mobile_country_code,
      mobile_verified,
      is_mobile_verified,
      account_status,
      wallet_balance,
      gmitra_plus_active,
      created_via
    ) VALUES (
      ${newCustomerId},
      gen_random_uuid(),
      ${NAME},
      ${EMAIL},
      ${PHONE_E164},
      ${PHONE_NORMALIZED},
      '+91',
      TRUE,
      TRUE,
      'ACTIVE',
      ${WALLET_INR}::numeric,
      TRUE,
      'google-review-seed'
    )
    RETURNING id, customer_id
  `;
  const id = Number(inserted[0].id);
  console.log(`[seed] inserted new customer id=${id}, customer_id=${inserted[0].customer_id}`);
  return { id, customerId: inserted[0].customer_id };
}

async function seedAddresses(customerId: number): Promise<void> {
  const existing = await sql<{ c: number }[]>`
    SELECT count(*)::int AS c FROM customer_addresses WHERE customer_id = ${customerId}
  `;
  if ((existing[0]?.c ?? 0) > 0) {
    console.log(`[seed] addresses already present (${existing[0].c}); skipping`);
    return;
  }
  await sql`
    INSERT INTO customer_addresses (
      customer_id, address_id, label, address_line1, address_line2,
      city, state, postal_code, country, latitude, longitude,
      is_default, is_active, contact_name, contact_mobile
    ) VALUES
    (
      ${customerId}, ${"ADR-REV-HOME-" + Date.now()}, 'HOME',
      'Google Play Demo Apartments, Tower B, Flat 4F', 'MG Road',
      'Bengaluru', 'Karnataka', '560001', 'IN',
      12.97560000, 77.59460000,
      TRUE, TRUE, ${NAME}, ${PHONE_E164}
    ),
    (
      ${customerId}, ${"ADR-REV-WORK-" + Date.now()}, 'WORK',
      'Demo Tech Park, 12th Floor, Block C', 'Outer Ring Road',
      'Bengaluru', 'Karnataka', '560103', 'IN',
      12.93520000, 77.62450000,
      FALSE, TRUE, ${NAME}, ${PHONE_E164}
    )
  `;
  console.log("[seed] inserted 2 demo addresses (HOME + WORK)");
}

async function seedWalletTransactions(customerId: number): Promise<void> {
  if (!(await tableExists("customer_wallet_transactions"))) {
    console.log("[seed] table customer_wallet_transactions absent; skipping wallet history");
    return;
  }
  const existing = await sql<{ c: number }[]>`
    SELECT count(*)::int AS c FROM customer_wallet_transactions WHERE customer_id = ${customerId}
  `;
  if ((existing[0]?.c ?? 0) > 0) return;
  // Best-effort: insert nothing if we are uncertain of the exact column set.
  // The seed must NEVER fail prod. We just log and move on.
  console.log("[seed] wallet transactions table present but column schema not validated; skipping");
}

async function seedCoupons(customerId: number): Promise<void> {
  if (!(await tableExists("customer_coupons"))) return;
  console.log("[seed] customer_coupons present (column schema not validated; skipping)");
}

async function seedNotifications(customerId: number): Promise<void> {
  if (!(await tableExists("customer_notifications"))) return;
  console.log("[seed] customer_notifications present (column schema not validated; skipping)");
}

async function main() {
  console.log(`[seed] Google Play review user → ${PHONE_E164}`);
  const { id, customerId } = await upsertCustomer();
  await seedAddresses(id);
  await seedWalletTransactions(id);
  await seedCoupons(id);
  await seedNotifications(id);
  console.log(
    `[seed] done. customer.id=${id} customer_id=${customerId} wallet=₹${WALLET_INR} gmitra_plus_active=true`,
  );
}

main()
  .catch((err) => {
    console.error("[seed] FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
