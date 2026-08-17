"use client";

import { OrderMixedText } from "@/components/orders/orders-typography";
import { loraDisplay as lora } from "@/lib/fonts/tickets-fonts";

export default function OrderActionBanner({
  message,
  etaBreached = false,
}: {
  message: string;
  /** When First ETA has passed and order is still open — use red ops alert styling. */
  etaBreached?: boolean;
}) {
  return (
    <div
      className={
        etaBreached
          ? "flex w-full min-h-0 items-center justify-center rounded-lg border border-red-500/80 bg-red-500 px-3 py-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
          : "flex w-full min-h-0 items-center justify-center rounded-lg border border-teal-400/70 bg-teal-300 px-3 py-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
      }
      role="status"
      aria-live="polite"
    >
      <p
        className={
          etaBreached
            ? `${lora.className} text-center text-[11px] font-semibold leading-tight text-white tracking-wide`
            : `${lora.className} text-center text-[11px] font-semibold leading-tight text-teal-900 tracking-wide`
        }
      >
        <OrderMixedText>{message}</OrderMixedText>
      </p>
    </div>
  );
}
