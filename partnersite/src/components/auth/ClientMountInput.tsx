"use client";

import { useEffect, useState, type InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement>;

/**
 * Defers rendering until after mount so browser extensions (temp-mail, autofill)
 * cannot inject attributes into SSR markup before React hydrates.
 */
export function ClientMountInput({ className, ...props }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className={className} aria-hidden />;
  }

  return <input className={className} {...props} />;
}
