import type { OrderRecord } from "@/hooks/useOrders";

export type TerminalOrderFooterMeta = {
  text: string;
  tone: "success" | "neutral";
};

function diffSeconds(fromIso: string, toIso: string): number | null {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;
  return Math.floor((to - from) / 1000);
}

function formatDurationParts(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const parts: string[] = [];
  if (mins > 0) parts.push(`${mins} min${mins === 1 ? "" : "s"}`);
  if (secs > 0) parts.push(`${secs} second${secs === 1 ? "" : "s"}`);
  return parts.join(", ");
}

/** Footer timing for completed terminal cards (early prep or prepared duration). */
export function formatTerminalOrderFooter(order: OrderRecord): TerminalOrderFooterMeta | null {
  if (order.status !== "delivered") return null;

  if (order.preparedAt && order.prepReadyByAt) {
    const preparedMs = new Date(order.preparedAt).getTime();
    const deadlineMs = new Date(order.prepReadyByAt).getTime();
    if (Number.isFinite(preparedMs) && Number.isFinite(deadlineMs)) {
      const earlyMs = deadlineMs - preparedMs;
      if (earlyMs >= 60_000) {
        const earlyMins = Math.floor(earlyMs / 60_000);
        return {
          text: `${earlyMins} min${earlyMins === 1 ? "" : "s"} early`,
          tone: "success",
        };
      }
    }
  }

  const prepStart = order.acceptedAt ?? order.preparingAt ?? order.createdAt;
  if (order.preparedAt && prepStart) {
    const seconds = diffSeconds(prepStart, order.preparedAt);
    if (seconds != null && seconds > 0) {
      return {
        text: `Prepared in ${formatDurationParts(seconds)}`,
        tone: "neutral",
      };
    }
  }

  if (order.deliveredAt) {
    const seconds = diffSeconds(order.createdAt, order.deliveredAt);
    if (seconds != null && seconds > 0) {
      const mins = Math.max(1, Math.round(seconds / 60));
      return {
        text: `Delivered in ${mins} minute${mins === 1 ? "" : "s"}`,
        tone: "neutral",
      };
    }
  }

  return null;
}
