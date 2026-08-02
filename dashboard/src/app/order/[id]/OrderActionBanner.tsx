"use client";

import { OrderMixedText } from "@/components/orders/orders-typography";
import { loraDisplay as lora } from "@/lib/fonts/tickets-fonts";

export default function OrderActionBanner({ message }: { message: string }) {
  return (
    <div
      className="flex w-full min-h-0 items-center justify-center rounded-lg border border-teal-400/70 bg-teal-300 px-3 py-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
      role="status"
      aria-live="polite"
    >
      <p
        className={`${lora.className} text-center text-[11px] font-semibold leading-tight text-teal-900 tracking-wide`}
      >
        <OrderMixedText>{message}</OrderMixedText>
      </p>
    </div>
  );
}
