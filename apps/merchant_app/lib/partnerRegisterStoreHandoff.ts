/**
 * Open partner-site register-store onboarding via SSO handoff (browser).
 * Shared by Partner Home "Add Another Store" and Profile "Add Another child".
 */

import { Linking } from "react-native";
import { getConfig } from "@/config/env";
import { merchantAuthService } from "@/services/auth.service";

export function partnerRegisterStorePath(parentId: number, storeId?: string): string {
  if (storeId) {
    return `/auth/register-store?parent_id=${parentId}&store_id=${encodeURIComponent(storeId)}`;
  }
  return `/auth/register-store?parent_id=${parentId}&new=1`;
}

export async function openPartnerRegisterStoreHandoff(opts: {
  accessToken: string;
  parentId: number;
  supabaseUserId?: string | null;
  /** Omit / undefined = new child store (`new=1`). */
  storeId?: string;
}): Promise<void> {
  const redirectPath = partnerRegisterStorePath(opts.parentId, opts.storeId);
  const handoff = await merchantAuthService.createPartnerHandoff({
    accessToken: opts.accessToken,
    redirectPath,
    supabaseUserId: opts.supabaseUserId,
  });
  const partnerBase = getConfig().partnerSiteBaseUrl.replace(/\/+$/, "");
  if (!handoff.handoffToken) {
    throw new Error("Could not create partner handoff. Please try again.");
  }
  const url = `${partnerBase}/auth/callback?t=${encodeURIComponent(handoff.handoffToken)}&redirect=${encodeURIComponent(handoff.redirectPath)}`;
  const canOpen = await Linking.canOpenURL(`${partnerBase}/auth/callback`);
  if (!canOpen) {
    throw new Error("Cannot open partner portal on this device.");
  }
  await Linking.openURL(url);
}
