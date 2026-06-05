/**
 * Effective store open/closed for order-page MX timings (hours + operational gates).
 */

export interface StoreOperationalGateInput {
  approval_status?: string | null;
  operational_status?: string | null;
  is_active?: boolean | null;
  is_accepting_orders?: boolean | null;
  is_available?: boolean | null;
  deleted_at?: string | Date | null;
  delisted_at?: string | Date | null;
}

/** True only when merchant store is allowed to accept orders (Partner Site parity). */
export function isStoreOperationallyOpen(store: StoreOperationalGateInput): boolean {
  const approval = String(store.approval_status ?? "").toUpperCase();
  if (approval === "DELISTED") return false;
  if (approval !== "APPROVED") return false;
  if (store.is_active !== true) return false;
  if (store.is_accepting_orders !== true) return false;
  if (store.is_available !== true) return false;
  if (String(store.operational_status ?? "CLOSED").toUpperCase() !== "OPEN") return false;
  if (store.deleted_at) return false;
  if (store.delisted_at) return false;
  return true;
}

export interface StoreTimingsDisplayInput {
  /** From today's operating-hours schedule. */
  withinHours: boolean;
  hoursLabel: string;
  operationallyOpen: boolean;
}

export function resolveStoreTimingsDisplay(input: StoreTimingsDisplayInput): {
  isOpen: boolean;
  pill: "Open" | "Closed";
  label: string;
} {
  const { withinHours, hoursLabel, operationallyOpen } = input;

  if (!operationallyOpen) {
    return {
      isOpen: false,
      pill: "Closed",
      label: "Store offline",
    };
  }

  if (!withinHours) {
    return {
      isOpen: false,
      pill: "Closed",
      label: hoursLabel || "Closed now",
    };
  }

  return {
    isOpen: true,
    pill: "Open",
    label: hoursLabel,
  };
}
