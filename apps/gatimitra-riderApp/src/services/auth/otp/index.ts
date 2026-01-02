import { getRiderAppConfig } from "../../../config/env";
import type { OtpService, OtpServiceExtras } from "./OtpService";
import { createBackendOtpService } from "./backendOtpService";

export function createOtpService(): { service: OtpService; extras?: OtpServiceExtras } {
  // Rider app must not integrate Firebase OTP / reCAPTCHA.
  // OTP is always backend-driven (MSG91 is called by backend).
  void getRiderAppConfig();
  return { service: createBackendOtpService() };
}


