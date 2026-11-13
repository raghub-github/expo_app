"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { acquireImageSlot } from "@/lib/image-load-queue";

type Props = {
  src: string;
  alt?: string;
  className?: string;
  /** Above-the-fold / hero — load immediately with high priority. */
  priority?: boolean;
  rootMargin?: string;
};

/**
 * IntersectionObserver-backed thumbnail loader with a global concurrency gate.
 * Priority images skip observation but still share the load queue (small cap).
 */
export function LazyThumb({
  src,
  alt = "",
  className,
  priority = false,
  rootMargin = "80px 0px",
}: Props) {
  const ref = useRef<HTMLImageElement | null>(null);
  const releaseRef = useRef<(() => void) | null>(null);
  const [inView, setInView] = useState(priority);
  const [activeSrc, setActiveSrc] = useState<string | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  const releaseSlot = () => {
    releaseRef.current?.();
    releaseRef.current = null;
  };

  useEffect(() => {
    setFailed(false);
    if (priority) {
      setInView(true);
      return;
    }
    setInView(false);
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin, threshold: 0.01 }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [src, priority, rootMargin]);

  useEffect(() => {
    if (!inView || !src || failed) {
      releaseSlot();
      setActiveSrc(undefined);
      return;
    }
    let cancelled = false;
    void acquireImageSlot().then((rel) => {
      if (cancelled) {
        rel();
        return;
      }
      releaseRef.current = rel;
      setActiveSrc(src);
    });
    return () => {
      cancelled = true;
      releaseSlot();
      setActiveSrc(undefined);
    };
  }, [inView, src, failed]);

  if (failed || !src) {
    return <div className={cn("bg-slate-200", className)} aria-hidden />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={activeSrc}
      alt={alt}
      className={cn(className, !activeSrc && "bg-slate-100")}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "low"}
      onLoad={releaseSlot}
      onError={() => {
        releaseSlot();
        setFailed(true);
      }}
    />
  );
}
