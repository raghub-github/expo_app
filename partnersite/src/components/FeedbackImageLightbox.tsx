"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

export function FeedbackImageLightbox({
  urls,
  index,
  onClose,
  onIndexChange,
}: {
  urls: string[];
  index: number;
  onClose: () => void;
  onIndexChange: (next: number) => void;
}) {
  const startX = useRef<number | null>(null);
  const [current, setCurrent] = useState(index);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setCurrent(index);
  }, [index]);

  const go = useCallback(
    (delta: number) => {
      if (urls.length < 2) return;
      const next = (current + delta + urls.length) % urls.length;
      setCurrent(next);
      onIndexChange(next);
    },
    [current, onIndexChange, urls.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [go, onClose]);

  const src = urls[current];
  if (!src) return null;

  const node = (
    <div
      className="fixed inset-y-0 right-0 left-0 z-[10050] flex items-center justify-center bg-black/70 backdrop-blur-md md:left-[var(--mx-partner-sidebar-w,14rem)]"
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-[10051] inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
        aria-label="Close"
      >
        <X size={22} />
      </button>

      {urls.length > 1 ? (
        <div className="absolute top-5 left-1/2 z-[10051] -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white">
          {current + 1} / {urls.length}
        </div>
      ) : null}

      {urls.length > 1 ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            go(-1);
          }}
          className="absolute left-3 z-[10051] inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
          aria-label="Previous photo"
        >
          <ChevronLeft size={24} />
        </button>
      ) : null}

      {urls.length > 1 ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            go(1);
          }}
          className="absolute right-3 z-[10051] inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
          aria-label="Next photo"
        >
          <ChevronRight size={24} />
        </button>
      ) : null}

      <img
        src={src}
        alt=""
        className="max-h-[86vh] max-w-[92vw] rounded-xl object-contain shadow-2xl select-none"
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          startX.current = e.clientX;
        }}
        onPointerUp={(e) => {
          if (startX.current == null) return;
          const dx = e.clientX - startX.current;
          startX.current = null;
          if (dx > 48) go(-1);
          else if (dx < -48) go(1);
        }}
      />
    </div>
  );

  if (!mounted) return null;
  return createPortal(node, document.body);
}
