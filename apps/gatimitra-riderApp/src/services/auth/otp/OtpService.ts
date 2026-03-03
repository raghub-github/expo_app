import type React from "react";
import type { Session, OtpRequestResponse } from "@gatimitra/contracts";

export interface VerifyOtpArgs {
  phoneE164: string;
  otp: string;
  deviceId: string;
  /** If set, used for verify (e.g. from UI state); avoids "OTP not requested yet" after hot reload. */
  requestId?: string;
}

export interface OtpService {
  requestOtp(phoneE164: string): Promise<OtpRequestResponse>;
  verifyOtp(args: VerifyOtpArgs): Promise<Session>;
}

export type OtpServiceExtras = {
  /**
   * Some OTP providers require UI to complete verification (e.g. reCAPTCHA).
   * Render this element somewhere on the login screen.
   */
  ui?: React.ReactNode;
};


