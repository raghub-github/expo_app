"use client";

import { useEffect, useState } from "react";
import { resolveAttachmentProxyUrl } from "@/lib/attachments/resolve-attachment-proxy-url";

interface R2ImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackSrc?: string;
}

export function R2Image({ src, alt, className = "", fallbackSrc }: R2ImageProps) {
  const resolvedSrc = resolveAttachmentProxyUrl(src ?? "");

  const preferred =
    resolvedSrc &&
    (resolvedSrc.startsWith("http") ||
      resolvedSrc.startsWith("/") ||
      resolvedSrc.startsWith("data:") ||
      resolvedSrc.startsWith("blob:"))
      ? resolvedSrc
      : fallbackSrc ?? "";

  const [currentSrc, setCurrentSrc] = useState(preferred);

  useEffect(() => {
    setCurrentSrc(preferred);
  }, [preferred]);

  if (!currentSrc) {
    return <div className={`bg-gray-100 flex items-center justify-center ${className}`} aria-hidden />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- R2/proxy URLs; not next/image optimized assets
    <img
      key={currentSrc}
      src={currentSrc}
      alt={alt}
      className={className}
      loading="eager"
      decoding="async"
      onError={() => {
        if (fallbackSrc && currentSrc !== fallbackSrc) {
          setCurrentSrc(fallbackSrc);
        }
      }}
    />
  );
}
