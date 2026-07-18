/**
 * App-wide typography — Lora for alphabetic text, Poppins for numeric text (₹, digits, %).
 * Prefer this over React Native `Text` on all screens/sheets.
 * Guard: `npm run lint:typography` (see scripts/check-apptext-typography.js).
 */
export { CheckoutText as AppText } from "@/components/checkout/CheckoutText";
