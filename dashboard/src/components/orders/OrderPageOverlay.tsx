"use client";

import { useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Full-viewport dim + blur so the sticky order header is covered with the page. */
export const ORDER_PAGE_OVERLAY_CLASS =
  "fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4";

const emptySubscribe = () => () => {};

/**
 * Portal overlays must paint on the first client render.
 * A useEffect()+mounted gate deferred children one frame, so map callback-refs
 * stayed null and Rider Tracking got stuck on "waiting-container".
 */
export function OrderPageOverlay({
  children,
  onBackdropClick,
  className,
  zClass = "z-[200]",
  role,
}: {
  children: ReactNode;
  onBackdropClick?: (e: MouseEvent<HTMLDivElement>) => void;
  className?: string;
  zClass?: string;
  role?: string;
}) {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  if (!mounted) return null;
  return createPortal(
    <div
      className={
        className ??
        `fixed inset-0 ${zClass} flex items-center justify-center bg-black/50 backdrop-blur-sm p-4`
      }
      onClick={onBackdropClick}
      role={role}
    >
      {children}
    </div>,
    document.body
  );
}
