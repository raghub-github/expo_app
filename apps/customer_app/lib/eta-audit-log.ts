/**
 * In-memory ETA audit trail (dev aid). Production timeline:
 * GET /v1/eta/orders/:id/timeline — immutable server history.
 */

export type EtaAuditEntry = {
  atIso: string;
  orderId: string;
  etaMinutes: number | null;
  reason: string;
  phase?: string;
};

const MAX_ENTRIES = 80;
const buffer: EtaAuditEntry[] = [];

export function pushEtaAudit(entry: Omit<EtaAuditEntry, "atIso"> & { atIso?: string }): void {
  buffer.push({
    atIso: entry.atIso ?? new Date().toISOString(),
    orderId: entry.orderId,
    etaMinutes: entry.etaMinutes,
    reason: entry.reason,
    phase: entry.phase,
  });
  if (buffer.length > MAX_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_ENTRIES);
  }
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    // eslint-disable-next-line no-console
    console.debug(
      `[eta-audit] ${entry.orderId} → ${entry.etaMinutes ?? "—"} (${entry.reason}${
        entry.phase ? ` · ${entry.phase}` : ""
      })`
    );
  }
}

export function getEtaAuditLog(orderId?: string): EtaAuditEntry[] {
  if (!orderId) return buffer.slice();
  return buffer.filter((e) => e.orderId === orderId);
}

export function clearEtaAuditLog(): void {
  buffer.length = 0;
}
