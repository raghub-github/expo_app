/**
 * Auto-refund after dashboard accept-timeout cancel.
 * Mirrors partnersite/src/lib/triggerOrderAutoRefund.ts — dashboard sync used to
 * cancel without moving money, leaving hollow Completed refunds / no wallet credit.
 */

export async function triggerOrderAutoRefund(args: {
  orderCorePk: number;
  reason: string;
  actorRole: string;
  actorEmail?: string | null;
  amount?: number | null;
}): Promise<void> {
  const orderCorePk = Number(args.orderCorePk);
  if (!Number.isInteger(orderCorePk) || orderCorePk < 1) return;

  const role = String(args.actorRole || "").trim().toLowerCase();
  if (role === "customer" || role === "cx") return;

  const backendUrl = (
    process.env.BACKEND_INTERNAL_URL ??
    process.env.BACKEND_URL ??
    process.env.NEXT_PUBLIC_BACKEND_URL ??
    ""
  ).replace(/\/$/, "");
  const secret =
    process.env.INTERNAL_API_TOKEN?.trim() ||
    process.env.BACKEND_SCHEDULE_TICK_SECRET?.trim();
  if (!backendUrl || !secret) {
    console.warn(
      "[triggerOrderAutoRefund] BACKEND_URL or INTERNAL_API_TOKEN missing; skipping"
    );
    return;
  }

  try {
    const res = await fetch(`${backendUrl}/v1/internal/orders/${orderCorePk}/auto-refund`, {
      method: "POST",
      headers: {
        "X-Internal-Secret": secret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reason: args.reason,
        actorRole: role,
        actorEmail: args.actorEmail ?? null,
        amount:
          args.amount != null && Number.isFinite(Number(args.amount)) && Number(args.amount) > 0
            ? Number(args.amount)
            : null,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(
        `[triggerOrderAutoRefund] ${res.status} for core=${orderCorePk}: ${text.slice(0, 200)}`
      );
    }
  } catch (err) {
    console.warn("[triggerOrderAutoRefund] request failed:", err);
  }
}
