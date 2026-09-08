import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RIDER_HIGH_TRAFFIC_MESSAGE,
  sanitizeRiderAuthError,
} from "./sanitizeRiderAuthError";

test("hides timeout + LAN API URL", () => {
  const raw =
    "Request timed out after 30s contacting http://10.52.43.181:3000/v1/auth/otp/request. Check that the backend is running and EXPO_PUBLIC_API_BASE_URL matches this device's network.";
  assert.equal(sanitizeRiderAuthError(raw), RIDER_HIGH_TRAFFIC_MESSAGE);
});

test("keeps invalid OTP copy", () => {
  assert.equal(sanitizeRiderAuthError("Invalid OTP."), "Invalid OTP.");
});

test("empty error uses fallback", () => {
  assert.equal(sanitizeRiderAuthError(""), RIDER_HIGH_TRAFFIC_MESSAGE);
});
