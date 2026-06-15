import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { riders } from "../db/schema.js";

export type RiderEmergencyContact = {
  label: string;
  phone: string;
};

export const INDIA_EMERGENCY_DEFAULTS = {
  police: "100",
  ambulance: "108",
} as const;

const MAX_CONTACTS = 2;

export function normalizeIndianMobile(input: string): string | null {
  const digits = String(input ?? "").replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return null;
}

export function normalizeEmergencyContacts(raw: unknown): RiderEmergencyContact[] {
  if (!Array.isArray(raw)) return [];
  const out: RiderEmergencyContact[] = [];
  for (const item of raw) {
    if (out.length >= MAX_CONTACTS) break;
    if (item == null || typeof item !== "object") continue;
    const label = String((item as { label?: unknown }).label ?? "").trim();
    const phone = normalizeIndianMobile(String((item as { phone?: unknown }).phone ?? ""));
    if (!label || !phone) continue;
    out.push({ label: label.slice(0, 40), phone });
  }
  return out;
}

export async function getRiderEmergencyContacts(
  riderId: number
): Promise<RiderEmergencyContact[]> {
  const db = getDb();
  const [row] = await db
    .select({ emergencyContacts: riders.emergencyContacts })
    .from(riders)
    .where(eq(riders.id, riderId))
    .limit(1);
  return normalizeEmergencyContacts(row?.emergencyContacts);
}

export async function saveRiderEmergencyContacts(
  riderId: number,
  contacts: RiderEmergencyContact[]
): Promise<RiderEmergencyContact[]> {
  const normalized = normalizeEmergencyContacts(contacts);
  const db = getDb();
  await db
    .update(riders)
    .set({
      emergencyContacts: normalized,
      updatedAt: new Date(),
    })
    .where(eq(riders.id, riderId));
  return normalized;
}
