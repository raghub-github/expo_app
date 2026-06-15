export type FraudReportTargetType = "merchant" | "rider";

export type FraudReportOptionRow = {
  option_code: string;
  option_text: string;
  display_order: number;
  requires_details: boolean;
};

export function normalizeFraudReportTarget(raw: unknown): FraudReportTargetType | null {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (v === "merchant" || v === "restaurant" || v === "store") return "merchant";
  if (v === "rider" || v === "delivery" || v === "delivery_partner" || v === "ride_partner") {
    return "rider";
  }
  return null;
}

export function buildFraudReportTicketCopy(input: {
  targetType: FraudReportTargetType;
  displayOrderId: string;
  selectedOptions: Array<{ option_code: string; option_text: string }>;
  customDetails: string | null;
}): { subject: string; description: string } {
  const targetLabel =
    input.targetType === "merchant" ? "restaurant" : "delivery partner";
  const subject = `Order #${input.displayOrderId} — Report ${targetLabel} fraud`;
  const lines = input.selectedOptions.map((o) => `- ${o.option_text.trim()}`);
  const descriptionParts = [
    `Fraud report — ${targetLabel}`,
    "",
    "Selected concerns:",
    ...lines,
  ];
  const details = input.customDetails?.trim();
  if (details) {
    descriptionParts.push("", "Additional details:", details);
  }
  return { subject, description: descriptionParts.join("\n") };
}
