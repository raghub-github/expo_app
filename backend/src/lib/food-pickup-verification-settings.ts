import { getSql } from "../db/client.js";

export type FoodPickupVerificationSettings = {
  barcodeEnabled: boolean;
  otpEnabled: boolean;
  verificationRequired: boolean;
};

const DEFAULT_SETTINGS: FoodPickupVerificationSettings = {
  barcodeEnabled: true,
  otpEnabled: true,
  verificationRequired: true,
};

export async function loadFoodPickupVerificationSettings(): Promise<FoodPickupVerificationSettings> {
  const sql = getSql();
  const rows = (await sql`
    SELECT barcode_verification_enabled, otp_verification_enabled, is_active
    FROM platform_food_pickup_verification_settings
    WHERE id = 1
    LIMIT 1
  `) as Array<{
    barcode_verification_enabled: boolean;
    otp_verification_enabled: boolean;
    is_active: boolean;
  }>;

  const row = rows[0];
  if (!row?.is_active) {
    return { barcodeEnabled: false, otpEnabled: false, verificationRequired: false };
  }

  const barcodeEnabled = Boolean(row.barcode_verification_enabled);
  const otpEnabled = Boolean(row.otp_verification_enabled);
  return {
    barcodeEnabled,
    otpEnabled,
    verificationRequired: barcodeEnabled || otpEnabled,
  };
}

export function normalizeFoodPickupVerificationSettings(
  input?: Partial<FoodPickupVerificationSettings> | null
): FoodPickupVerificationSettings {
  if (!input) return DEFAULT_SETTINGS;
  const barcodeEnabled = input.barcodeEnabled !== false;
  const otpEnabled = input.otpEnabled !== false;
  return {
    barcodeEnabled,
    otpEnabled,
    verificationRequired: barcodeEnabled || otpEnabled,
  };
}
