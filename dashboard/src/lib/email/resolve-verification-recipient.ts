import { getSql } from "@/lib/db/client";

/** Store email, or agreement signer email if store email empty. */
export async function resolveVerificationRecipientEmail(
  storeInternalId: number,
  storeEmail: string | null | undefined
): Promise<string | null> {
  const direct =
    typeof storeEmail === "string" && storeEmail.trim() !== "" ? storeEmail.trim() : null;
  if (direct) return direct;
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT signer_email
      FROM merchant_store_agreement_acceptances
      WHERE store_id = ${storeInternalId}
      LIMIT 1
    `;
    const row = Array.isArray(rows) ? rows[0] : rows;
    const se = (row as { signer_email?: string | null } | undefined)?.signer_email;
    if (typeof se === "string" && se.includes("@") && se.trim().length > 4) {
      return se.trim();
    }
  } catch (e) {
    console.warn("[resolveVerificationRecipientEmail] agreement signer_email fallback failed", e);
  }
  return null;
}
