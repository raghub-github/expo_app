import Constants from "expo-constants";
import { getRiderAppConfig } from "../../../config/env";
import type { OtpService, OtpServiceExtras } from "./OtpService";
import { createBackendOtpService } from "./backendOtpService";

let cachedService: OtpService | null = null;

/** True when running in Expo Go (no native MSG91/Mapbox etc). */
function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

async function getOtpService(): Promise<OtpService> {
  if (cachedService) return cachedService;
  if (isExpoGo()) {
    cachedService = createBackendOtpService();
    return cachedService;
  }
  try {
    const { createMsg91OtpService } = await import("./msg91OtpService");
    cachedService = createMsg91OtpService();
    return cachedService;
  } catch (_e) {
    cachedService = createBackendOtpService();
    return cachedService;
  }
}

const proxyService: OtpService = {
  requestOtp: async (phoneE164: string) => {
    let service = await getOtpService();
    try {
      return await service.requestOtp(phoneE164);
    } catch (firstError) {
      // If MSG91 fails (e.g. native module not linked), try backend so user can still get OTP
      if (cachedService && (firstError as Error)?.message?.toLowerCase().includes("native")) {
        cachedService = createBackendOtpService();
        service = cachedService;
        return await service.requestOtp(phoneE164);
      }
      throw firstError;
    }
  },
  verifyOtp: async (args) => {
    const service = await getOtpService();
    return service.verifyOtp(args);
  },
};

export function createOtpService(): { service: OtpService; extras?: OtpServiceExtras } {
  void getRiderAppConfig();
  return { service: proxyService };
}

/** Retry OTP (e.g. resend via SMS). Falls back to no-op if MSG91 not available. */
export async function retryOtp(
  reqId: string,
  channel?: "SMS" | "VOICE" | "EMAIL" | "WHATSAPP"
): Promise<{ success: boolean; reqId?: string; message?: string }> {
  if (isExpoGo()) return { success: false, message: "Retry not available" };
  try {
    const m = await import("./msg91OtpService");
    return await m.retryOtp(reqId, channel);
  } catch {
    return { success: false, message: "Retry not available" };
  }
}


