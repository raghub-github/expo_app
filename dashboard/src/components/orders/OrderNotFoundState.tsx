"use client";

type OrderNotFoundStateProps = {
  className?: string;
};

/** Dedicated asset — avoids stale browser/Next cache on generic `image.png`. */
const ORDER_NOT_FOUND_IMG = "/order-not-found.png";

/**
 * Empty state for standalone /order/[id] when lookup misses.
 */
export function OrderNotFoundState({ className = "" }: OrderNotFoundStateProps) {
  return (
    <div
      className={`flex h-full min-h-[50vh] w-full flex-1 flex-col items-center justify-center bg-[#F8FAFC] px-4 py-12 text-center ${className}`}
      role="alert"
    >
      {/* Plain img — Next/Image optimizer can serve an old optimized copy of /image.png */}
      <img
        src={ORDER_NOT_FOUND_IMG}
        alt=""
        width={56}
        height={56}
        decoding="async"
        className="mb-3 h-14 w-14 max-h-14 max-w-14 object-contain"
        aria-hidden
      />
      <p className="inline-flex max-w-full flex-nowrap items-center justify-center gap-1.5 whitespace-nowrap text-base font-medium text-slate-700 sm:text-lg">
        <span>Hmm… this order seems to be off the map.</span>
        <span className="inline-block shrink-0 text-[1.05em] leading-none" aria-hidden>
          🧭
        </span>
      </p>
    </div>
  );
}
