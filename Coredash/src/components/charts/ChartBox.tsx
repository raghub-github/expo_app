"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ResponsiveContainer } from "recharts";

/**
 * Mounts Recharts only after the container has a real size.
 * Prevents the noisy "width(0) and height(0)" warnings during HMR / flex layout.
 */
export function ChartBox({
  children,
  height = 280,
  className = "",
}: {
  children: ReactNode;
  height?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const { width, height: h } = el.getBoundingClientRect();
      setReady(width > 8 && h > 8);
    };

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    const onVis = () => {
      if (document.visibilityState === "visible") measure();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`w-full min-w-0 ${className}`}
      style={{ height, minHeight: height }}
    >
      {ready ? (
        <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={40}>
          {children as React.ReactElement}
        </ResponsiveContainer>
      ) : (
        <div className="h-full w-full animate-pulse rounded-xl bg-[#F4F6FF]" />
      )}
    </div>
  );
}
