import { randomInt } from "crypto";

/** Generate a single 4-digit OTP string (1000–9999). */
export function generateFourDigitOtp(): string {
  return String(randomInt(1000, 10000));
}

/** Three unique 4-digit OTPs for pickup, delivery, and RTO on the same order. */
export function generateOrderOtps(): {
  pickupOtp: string;
  deliveryOtp: string;
  rtoOtp: string;
} {
  const set = new Set<string>();
  while (set.size < 3) {
    set.add(generateFourDigitOtp());
  }
  const [pickupOtp, deliveryOtp, rtoOtp] = Array.from(set);
  return { pickupOtp: pickupOtp!, deliveryOtp: deliveryOtp!, rtoOtp: rtoOtp! };
}
