/**
 * Fire the appropriate backend `/v1/verification/submit/*` after a merchant
 * document upload succeeds.
 *
 * Never throws — errors are logged and swallowed so /api/merchant/
 * store-documents/upload keeps returning success. The backend consults the
 * policy engine and no-ops if the slot is on mode='manual' (the default
 * seed), so this hook is safe to enable everywhere without any behaviour
 * change until admin flips a policy.
 */
import { fetchBackend } from '@/lib/fetch-backend';
import type { MerchantDocumentPrefix } from '@/lib/merchantLicenseExpiry';

type Args = {
  storeId: number;             // internal merchant_stores.id
  documentPrefix: MerchantDocumentPrefix;
  documentNumber?: string | null;
  ownerName?: string | null;
};

/**
 * Map merchant document prefix → backend submit endpoint + payload builder.
 * Prefixes we don't support (fssai, drug_license, shop_establishment, trade_license,
 * pharmacist_certificate, pharmacy_council_registration, other) return null
 * and the hook becomes a no-op.
 */
function submitPathAndBody(args: Args): { path: string; body: Record<string, unknown> } | null {
  const base = { subject_type: 'merchant_store', subject_id: args.storeId };
  switch (args.documentPrefix) {
    case 'pan':
      if (!args.documentNumber || !args.ownerName) return null;
      return {
        path: '/v1/verification/submit/pan',
        body: { ...base, pan: args.documentNumber.trim().toUpperCase(), name: args.ownerName.trim() },
      };
    case 'gst':
      if (!args.documentNumber) return null;
      return {
        path: '/v1/verification/submit/gstin',
        body: { ...base, gstin: args.documentNumber.trim().toUpperCase() },
      };
    case 'udyam':
      // No dedicated submit endpoint yet; skip.
      return null;
    case 'aadhaar':
      // Aadhaar goes through DigiLocker (redirect flow) — not fired here.
      return null;
    // Manual-only prefixes:
    case 'fssai':
    case 'drug_license':
    case 'shop_establishment':
    case 'trade_license':
    case 'pharmacist_certificate':
    case 'pharmacy_council_registration':
    case 'other':
      return null;
  }
  return null;
}

/**
 * Kick off an auto-verify if the newly-uploaded document is a kind we support.
 * Never blocks the caller and never throws.
 */
export async function triggerMerchantAutoVerify(args: Args): Promise<void> {
  const call = submitPathAndBody(args);
  if (!call) return;
  try {
    const res = await fetchBackend(call.path, {
      method: 'POST',
      body: JSON.stringify(call.body),
    });
    if (res && !res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(
        `[verification-hook] backend ${call.path} responded ${res.status}: ${text.slice(0, 200)}`,
      );
    }
  } catch (e) {
    console.warn(`[verification-hook] ${call.path} failed:`, (e as Error).message);
  }
}
