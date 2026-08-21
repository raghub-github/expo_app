"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Full-viewport dim + blur so the sticky order header is covered with the page. */
export const ORDER_PAGE_OVERLAY_CLASS =
  "fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4";

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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
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
