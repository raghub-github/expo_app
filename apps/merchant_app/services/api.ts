/**
 * Merchant app API client — uses backend from config (backend/.env).
 */

import { getConfig } from "@/config/env";

const { apiBaseUrl, storeId } = getConfig();

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}

/** Base URL for REST calls (e.g. fetch(`${getApiBaseUrl()}/api/merchant/...`)) */
export const API_BASE_URL = apiBaseUrl;

/** Current store ID from env (EXPO_PUBLIC_STORE_ID). Used for subscription-by-store. */
export const STORE_ID = storeId;

export type SubscriptionPlan = {
  plan_id: number;
  plan_code: string;
  plan_name: string;
  expiry_date: string | null;
  subscription_status: string;
  active_from: string;
};

export type SubscriptionResponse = {
  active: boolean;
  plan: SubscriptionPlan | null;
};

/** Fetch active subscription for a store. Returns { active: false, plan: null } when no store_id or no active plan. */
export async function fetchSubscription(storeIdParam: number | null): Promise<SubscriptionResponse> {
  if (storeIdParam == null || storeIdParam < 1) {
    return { active: false, plan: null };
  }
  try {
    const res = await fetch(
      `${API_BASE_URL}/v1/subscription?store_id=${encodeURIComponent(storeIdParam)}`,
      { method: "GET" }
    );
    if (!res.ok) return { active: false, plan: null };
    const data = (await res.json()) as SubscriptionResponse;
    return {
      active: data?.active === true && data?.plan != null,
      plan: data?.plan ?? null,
    };
  } catch {
    return { active: false, plan: null };
  }
}
