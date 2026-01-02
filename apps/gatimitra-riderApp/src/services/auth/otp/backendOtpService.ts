import type { OtpRequestResponse, Session } from "@gatimitra/contracts";
import { getRiderAppConfig } from "../../../config/env";
import { postJson } from "../../http";
import type { OtpService } from "./OtpService";

export function createBackendOtpService(): OtpService {
  const cfg = getRiderAppConfig();
  const apiBaseUrl = cfg.apiBaseUrl;

  let requestId: string | null = null;
  let phoneBound: string | null = null;
  let generatedOtp: string | null = null;

  return {
    requestOtp: async (phoneE164) => {
      const resp = await postJson<OtpRequestResponse>(
        `${apiBaseUrl}/v1/auth/otp/request`, 
        { phoneE164 },
        { timeout: 15000 } // 15 second timeout
      );
      requestId = resp.requestId;
      phoneBound = phoneE164;
      generatedOtp = resp.otp || null; // Store OTP for display
      return resp; // Return response so caller can access OTP
    },

    verifyOtp: async ({ phoneE164, otp, deviceId }) => {
      if (!requestId || !phoneBound) throw new Error("OTP not requested yet");
      if (phoneBound !== phoneE164) throw new Error("Phone number mismatch for OTP request");

      return await postJson<Session>(
        `${apiBaseUrl}/v1/auth/otp/verify`,
        {
          requestId,
          phoneE164,
          otp,
          deviceId,
        },
        { timeout: 15000 } // 15 second timeout
      );
    },
  };
}


