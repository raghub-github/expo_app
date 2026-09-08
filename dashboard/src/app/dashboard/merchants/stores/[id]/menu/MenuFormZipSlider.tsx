"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * Thin zip-style scroll rail for the add/edit menu item modal.
 * Native scrollbar stays hidden; this track is the only way to jump/drag.
 */
export function MenuFormZipSlider({
  scrollRef,
  resetKey,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  resetKey?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [metrics, setMetrics] = useState({ needed: false, thumbTop: 6, thumbH: 44 });

  const sync = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const needed = scrollHeight > clientHeight + 8;
    const trackH = Math.max(clientHeight - 12, 32);
    const thumbH = Math.max(
      40,
      Math.min(trackH - 8, Math.round((clientHeight / Math.max(scrollHeight, 1)) * trackH))
    );
    const maxTop = Math.max(trackH - thumbH, 0);
    const range = Math.max(scrollHeight - clientHeight, 1);
    const thumbTop = 6 + (scrollTop / range) * maxTop;
    setMetrics({ needed, thumbTop, thumbH });
  }, [scrollRef]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const ro = new ResizeObserver(() => sync());
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", sync);
      ro.disconnect();
    };
  }, [scrollRef, sync, resetKey]);

  const scrollFromClientY = (clientY: number) => {
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const rect = track.getBoundingClientRect();
    const y = clientY - rect.top - metrics.thumbH / 2;
    const maxTop = Math.max(rect.height - metrics.thumbH, 1);
    const ratio = Math.min(1, Math.max(0, y / maxTop));
    el.scrollTop = ratio * (el.scrollHeight - el.clientHeight);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!metrics.needed) return;
    e.preventDefault();
    draggingRef.current = true;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    scrollFromClientY(e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    scrollFromClientY(e.clientY);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  return (
    <>
      <style>{`
        .menu-item-form-zip-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .menu-item-form-zip-scroll::-webkit-scrollbar { width: 0; height: 0; display: none; }
      `}</style>
      <div
        ref={trackRef}
        className="relative w-5 shrink-0 self-stretch select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-hidden={!metrics.needed}
        title="Scroll form"
      >
        <div className="absolute inset-y-2 left-1/2 w-[4px] -translate-x-1/2 rounded-full bg-gray-300/80" />
        {metrics.needed ? (
          <div
            className="absolute left-1/2 z-10 -translate-x-1/2 cursor-grab active:cursor-grabbing"
            style={{ top: metrics.thumbTop, height: metrics.thumbH, width: 14 }}
          >
            <div className="h-full w-full rounded-full bg-orange-400 shadow-[0_1px_4px_rgba(251,146,60,0.45)] ring-1 ring-orange-300/80 hover:bg-orange-500 transition-colors flex flex-col items-center justify-center gap-[3px] py-1.5">
              <span className="block h-[1.5px] w-2.5 rounded-full bg-white/90" />
              <span className="block h-[1.5px] w-2.5 rounded-full bg-white/90" />
              <span className="block h-[1.5px] w-2.5 rounded-full bg-white/90" />
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
