"use client";

import { useEffect, useState } from "react";

/** SSR-safe matchMedia for Tailwind-style min-width breakpoints (e.g. 1024 = lg). */
export function useMinWidth(px: number) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${px}px)`);
    const sync = () => setMatches(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [px]);

  return matches;
}

export const LG_BREAKPOINT = 1024;
export const MD_BREAKPOINT = 768;
