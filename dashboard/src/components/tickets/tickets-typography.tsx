"use client";

import type { ReactNode } from "react";

/**
 * Splits mixed copy so digit / ID chunks render in Poppins (`tickets-num`)
 * while surrounding words stay in Lora (`tickets-typo` ancestor).
 */
const NUM_OR_ID_CHUNK =
  /(#[A-Za-z]*\d[\w.-]*|\b(?:TKT|GM|GMR|GMP)[\w.-]*|\d[\d:.,/\-]*)/g;

export function TicketMixedText({
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
        if (/\d/.test(part)) {
          return (
            <span key={i} className="tickets-num">
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

export function TicketNum({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={`tickets-num ${className}`.trim()}>{children}</span>;
}
