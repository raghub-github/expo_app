"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Keep a compact placeholder until the block enters the viewport. */
  fallback?: ReactNode;
  rootMargin?: string;
  /** Mount immediately (above-the-fold / critical). */
  eager?: boolean;
  className?: string;
  minHeight?: number;
};

/**
 * IntersectionObserver gate — children stay unmounted until visible.
 * Use for below-the-fold panels to cut initial DOM + JS work.
 */
export function DeferredMount({
  children,
  fallback = null,
  rootMargin = "200px 0px",
  eager = false,
  className,
  minHeight,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(eager);

  useEffect(() => {
    if (eager) {
      setMounted(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setMounted(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setMounted(true);
          io.disconnect();
        }
      },
      { rootMargin, threshold: 0.01 }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [eager, rootMargin]);

  return (
    <div ref={ref} className={className} style={minHeight && !mounted ? { minHeight } : undefined}>
      {mounted ? children : fallback}
    </div>
  );
}
