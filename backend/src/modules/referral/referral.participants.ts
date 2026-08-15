/**
 * Participant-type registry for the unified referral engine.
 * New types are added here instead of scattering if (customer) / if (rider) branches.
 */

import type { ReferralSettings, ReferralUserType } from "./referral.config.service.js";

export const REFERRAL_USER_TYPES = ["customer", "rider", "merchant"] as const;

export function isReferralUserType(v: unknown): v is ReferralUserType {
  return v === "customer" || v === "rider" || v === "merchant";
}

export function referralTrackingEnabled(
  settings: ReferralSettings,
  userType: ReferralUserType,
): boolean {
  if (!settings.enabled) return false;
  if (userType === "customer") return settings.customer_referral_enabled;
  if (userType === "rider") return settings.rider_referral_enabled;
  return Boolean(settings.merchant_referral_enabled);
}

/**
 * Whether NEW reward credits may be issued for this audience.
 * Independent of the service (tracking) toggle: turning Customer/Rider/Merchant
 * Referral OFF must not freeze already-created relationships or queued jobs.
 * Use `reward_enabled` + the per-audience reward toggle to pause credits.
 */
export function referralRewardsEnabled(
  settings: ReferralSettings,
  userType: ReferralUserType,
): boolean {
  if (!settings.enabled || !settings.reward_enabled) return false;
  if (userType === "customer") return settings.customer_reward_enabled;
  if (userType === "rider") return settings.rider_reward_enabled;
  return Boolean(settings.merchant_reward_enabled);
}

export function codePrefixFor(
  settings: ReferralSettings,
  userType: ReferralUserType,
): string {
  if (userType === "customer") return settings.code_prefix_customer ?? "GM";
  if (userType === "rider") return settings.code_prefix_rider ?? "RIDER";
  return settings.code_prefix_merchant ?? "MX";
}

export function deepLinkPathFor(
  settings: ReferralSettings,
  userType: ReferralUserType,
): string {
  if (userType === "customer") return settings.deep_link.customer_path_prefix || "/ref";
  if (userType === "rider") return settings.deep_link.rider_path_prefix || "/rider-ref";
  return settings.deep_link.merchant_path_prefix || "/merchant-ref";
}

export function playStorePackageFor(
  settings: ReferralSettings,
  userType: ReferralUserType,
): string {
  if (userType === "customer") return settings.deep_link.play_store_customer_package;
  if (userType === "rider") return settings.deep_link.play_store_rider_package;
  return settings.deep_link.play_store_merchant_package || "com.gatimitra.partner";
}

export function walletRewardTypeFor(
  userType: ReferralUserType,
): "GATICASH" | "WALLET_CREDIT" {
  return userType === "customer" ? "GATICASH" : "WALLET_CREDIT";
}
