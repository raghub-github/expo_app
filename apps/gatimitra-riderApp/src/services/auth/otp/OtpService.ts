import type React from "react";
import type { Session } from "@gatimitra/contracts";

export interface OtpService {
  requestOtp(phoneE164: string): Promise<{ otp?: string }>;
  verifyOtp(args: { phoneE164: string; otp: string; deviceId: string }): Promise<Session>;
}

export type OtpServiceExtras = {
  /**
   * Some OTP providers require UI to complete verification (e.g. reCAPTCHA).
   * Render this element somewhere on the login screen.
   */
  ui?: React.ReactNode;
};


