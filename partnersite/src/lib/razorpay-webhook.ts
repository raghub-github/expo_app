import crypto from "crypto";

const WEBHOOK_HEADER = "x-razorpay-signature";

/**
 * Verify Razorpay webhook signature.
 * Uses raw request body and RAZORPAY_WEBHOOK_SECRET.
 * @see https://razorpay.com/docs/webhooks/validate-test/
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return expected === signature;
}

export function getRazorpayWebhookSignature(request: Request): string | null {
  return request.headers.get(WEBHOOK_HEADER);
}
