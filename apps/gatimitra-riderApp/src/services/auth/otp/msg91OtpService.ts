import { OTPWidget } from "@msg91comm/sendotp-react-native";
import { getRiderAppConfig } from "../../../config/env";
import { postJson } from "../../http";
import type { OtpService } from "./OtpService";
import type { Session } from "@gatimitra/contracts";

// MSG91 Widget ID - should match backend configuration
const MSG91_WIDGET_ID = "356c71695646393436333739";

let isWidgetInitialized = false;
let currentReqId: string | null = null;
let currentPhone: string | null = null;

/**
 * MSG91 OTP Service using React Native SDK
 * This service uses MSG91 widget SDK for client-side OTP verification
 */
export function createMsg91OtpService(): OtpService {
  const cfg = getRiderAppConfig();

  // Initialize widget on first use
  const initializeWidget = async () => {
    if (isWidgetInitialized) return;
    
    try {
      // Widget initialization - authToken is optional for widget-based OTP
      // According to MSG91 docs, widget can work without authToken
      await OTPWidget.initializeWidget(MSG91_WIDGET_ID, {});
      isWidgetInitialized = true;
    } catch (error) {
      console.error("Failed to initialize MSG91 widget:", error);
      throw new Error("Failed to initialize OTP service");
    }
  };

  return {
    requestOtp: async (phoneE164: string) => {
      await initializeWidget();

      try {
        // Remove + from phone number if present (MSG91 expects format without +)
        const identifier = phoneE164.replace(/^\+/, "");

        const response = await OTPWidget.sendOTP({
          identifier,
        });

        // Store request ID and phone for verification
        if (response.reqId) {
          currentReqId = response.reqId;
          currentPhone = phoneE164;
        }

        // MSG91 SDK doesn't return OTP in production (security)
        // Return response matching OtpRequestResponse format
        return {
          requestId: response.reqId || "",
          expiresInSec: 300, // 5 minutes default
          // OTP is not returned in production for security
        };
      } catch (error: any) {
        console.error("MSG91 sendOTP error:", error);
        throw new Error(
          error?.message || "Failed to send OTP. Please try again."
        );
      }
    },

    verifyOtp: async ({ phoneE164, otp, deviceId }) => {
      if (!currentReqId || !currentPhone) {
        throw new Error("OTP not requested yet. Tap \"Send OTP\" first and wait for the code.");
      }

      if (currentPhone !== phoneE164) {
        throw new Error("Phone number mismatch");
      }

      try {
        // Verify OTP using MSG91 SDK
        const verifyResponse = await OTPWidget.verifyOTP({
          reqId: currentReqId,
          otp: otp.trim(),
        });

        // Check if verification was successful
        if (!verifyResponse.success || !verifyResponse.authToken) {
          throw new Error(verifyResponse.message || "Invalid OTP");
        }

        // Exchange MSG91 auth token for backend session
        const session = await postJson<Session>(
          `${cfg.apiBaseUrl}/v1/auth/msg91/verify-token`,
          {
            authToken: verifyResponse.authToken,
            phoneE164,
            deviceId,
          },
          { timeout: 30000 }
        );

        // Clear stored values after successful verification
        currentReqId = null;
        currentPhone = null;

        return session;
      } catch (error: any) {
        console.error("MSG91 verifyOTP error:", error);
        
        // Handle specific error cases
        if (error?.message?.includes("Invalid OTP") || error?.message?.includes("invalid")) {
          throw new Error("Invalid OTP. Please check and try again.");
        }
        
        if (error?.message?.includes("expired")) {
          throw new Error("OTP has expired. Please request a new one.");
        }

        throw new Error(
          error?.message || "Failed to verify OTP. Please try again."
        );
      }
    },
  };
}

/**
 * Retry OTP on a different channel (e.g. resend via SMS).
 */
export async function retryOtp(
  reqId: string,
  channel?: "SMS" | "VOICE" | "EMAIL" | "WHATSAPP"
): Promise<{ success: boolean; reqId?: string; message?: string }> {
  try {
    const channelCode = channel
      ? {
          SMS: 11,
          VOICE: 4,
          EMAIL: 3,
          WHATSAPP: 12,
        }[channel]
      : undefined;

    const response = await OTPWidget.retryOTP({
      reqId,
      retryChannel: channelCode,
    });

    return {
      success: response.success || false,
      reqId: response.reqId,
      message: response.message,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || "Failed to retry OTP",
    };
  }
}
