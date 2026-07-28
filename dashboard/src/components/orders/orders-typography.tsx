"use client";

import type { ReactNode } from "react";

/**
 * Splits mixed copy so digit / ID / money chunks render in Poppins (`orders-num`)
 * while surrounding words stay in Lora (`orders-typo` ancestor).
 */
const NUM_OR_ID_CHUNK =
  /(₹\s*\d[\d,.]*(?:\.\d+)?|#[A-Za-z]*\d[\w.-]*|\b(?:GMF|GMP|GMR|GM|TKT|GMMC|GMMP)[\w.-]*|\+?\d[\d\s:.,/\-]*)/g;

export function OrderMixedText({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const parts = children.split(NUM_OR_ID_CHUNK);
  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (!part) return null;
        if (/[\d₹#]/.test(part) && /\d/.test(part)) {
          return (
            <span key={i} className="orders-num">
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

export function OrderNum({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={`orders-num ${className}`.trim()}>{children}</span>;
}
