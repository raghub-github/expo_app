export type CustomerFraudAlertRow = {
  alertType: string;
  alertDescription: string;
  alertSeverity?: string | null;
  createdAt?: Date | string | null;
  isResolved?: boolean | null;
};

/** Human-readable reasons why a customer is in the FRAUD tier. */
export function buildCustomerFraudReasons(input: {
  trustTier?: string | null;
  trustScore?: number | string | null;
  statusReason?: string | null;
  fraudAlerts?: CustomerFraudAlertRow[];
}): string[] {
  if ((input.trustTier ?? "").toUpperCase() !== "FRAUD") return [];

  const reasons: string[] = [];
  const status = input.statusReason?.trim();
  if (status) reasons.push(status);

  for (const alert of input.fraudAlerts ?? []) {
    const type = alert.alertType?.trim() || "ALERT";
    const desc = alert.alertDescription?.trim() || "No description";
    const sev = alert.alertSeverity?.trim();
    reasons.push(sev ? `${type} (${sev}): ${desc}` : `${type}: ${desc}`);
  }

  if (reasons.length > 0) return reasons;

  const score =
    input.trustScore == null || input.trustScore === ""
      ? null
      : Number(input.trustScore);
  if (score != null && !Number.isNaN(score) && score >= 86) {
    return [
      `Risk score is ${score.toFixed(0)} (fraud band: 86–100). Lower scores mean better trust.`,
    ];
  }

  return ["Customer is marked Fraud by system trust-tier rules."];
}
