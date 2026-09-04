export type DeliveryProofSnapshot = {
  localUri?: string;
  uploaded?: { proxyUrl: string; key: string };
} | null;

export type DeliverySlideAction = "camera" | "reopen-otp" | "reopen-otp-and-upload";

/** One successful slide maps to exactly one next step. */
export function resolveDeliverySlideAction(proof: DeliveryProofSnapshot): DeliverySlideAction {
  if (proof?.uploaded?.proxyUrl && proof.uploaded.key && proof.localUri) {
    return "reopen-otp";
  }
  if (proof?.localUri) {
    return "reopen-otp-and-upload";
  }
  return "camera";
}
