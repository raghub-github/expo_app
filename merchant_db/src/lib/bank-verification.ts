/**
 * Bank/UPI verification: beneficiary name matching and 3 attempts per day limit.
 * Used by the verify API before creating Razorpay contact + fund account + payout.
 */

/** Max verification attempts (₹1 payouts) per merchant per calendar day. */
export const MAX_VERIFICATION_ATTEMPTS_PER_DAY = 3;

/** Amount sent per verification attempt, in paise (₹1 = 100 paise). */
export const VERIFICATION_AMOUNT_PAISE = 100;

/** Minimum similarity (0–1) to accept beneficiary name as matching store/owner. */
const BENEFICIARY_MATCH_THRESHOLD = 0.6;

/**
 * Normalize a name for comparison: lowercase, trim, collapse multiple spaces.
 */
export function normalizeName(name: string | null | undefined): string {
  if (name == null || typeof name !== "string") return "";
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Tokenize name into words (split on space), filter empty.
 */
function tokenize(name: string): string[] {
  return normalizeName(name).split(" ").filter(Boolean);
}

/**
 * Jaccard-like word overlap: |intersection| / |union|.
 * Returns a value in [0, 1]. Good for partial match (e.g. "Ramesh Kumar" vs "Ramesh Kumar Store").
 */
function wordOverlapScore(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setB = new Set(tb);
  const intersection = ta.filter((t) => setB.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Check if beneficiary name matches any of the allowed names (store, owner, parent, display).
 * Accepts exact match, contains, or word-overlap above threshold.
 */
export function isBeneficiaryNameAllowed(
  beneficiaryName: string,
  allowed: {
    storeName?: string | null;
    storeDisplayName?: string | null;
    ownerName?: string | null;
    parentName?: string | null;
  }
): boolean {
  const normalized = normalizeName(beneficiaryName);
  if (normalized.length < 2) return false;

  const candidates: string[] = [
    allowed.storeName,
    allowed.storeDisplayName,
    allowed.ownerName,
    allowed.parentName,
  ].filter((n): n is string => typeof n === "string" && n.trim().length > 0);

  for (const candidate of candidates) {
    const c = normalizeName(candidate);
    if (!c) continue;
    if (normalized === c) return true;
    if (normalized.includes(c) || c.includes(normalized)) return true;
    if (wordOverlapScore(normalized, c) >= BENEFICIARY_MATCH_THRESHOLD) return true;
  }
  return false;
}

/**
 * Mask account number for display/log: show last 4 digits.
 */
export function maskAccountNumber(accountNumber: string | null | undefined): string {
  if (accountNumber == null || typeof accountNumber !== "string") return "";
  const s = accountNumber.replace(/\D/g, "");
  if (s.length <= 4) return "****";
  return "*".repeat(s.length - 4) + s.slice(-4);
}

/**
 * Count verification attempts for a merchant (by parent_id) on the given calendar day (UTC).
 * Used to enforce MAX_VERIFICATION_ATTEMPTS_PER_DAY.
 */
/** Supabase-compatible client with from().select().eq().gte().lte() for count query. */
type SupabaseLikeClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (col: string, val: number) => {
        gte: (col: string, val: string) => {
          lte: (col: string, val: string) => Promise<{ data: unknown[] | null }>;
        };
      };
    };
  };
};

/**
 * Count verification attempts for a merchant (by parent_id) on the given calendar day (UTC).
 * Used to enforce MAX_VERIFICATION_ATTEMPTS_PER_DAY.
 */
export async function getVerificationAttemptsOnDay(
  db: SupabaseLikeClient,
  merchantParentId: number,
  dateUtc: Date
): Promise<number> {
  const y = dateUtc.getUTCFullYear();
  const m = String(dateUtc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dateUtc.getUTCDate()).padStart(2, "0");
  const dayStart = `${y}-${m}-${d}T00:00:00.000Z`;
  const dayEnd = `${y}-${m}-${d}T23:59:59.999Z`;

  const { data } = await db
    .from("merchant_bank_verification_payouts")
    .select("id")
    .eq("merchant_parent_id", merchantParentId)
    .gte("attempted_at", dayStart)
    .lte("attempted_at", dayEnd);
  return Array.isArray(data) ? data.length : 0;
}
