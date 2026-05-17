"use client";

import { resolveAttachmentProxyUrl } from "@/lib/attachments/resolve-attachment-proxy-url";

interface R2ImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackSrc?: string;
}

export function R2Image({ src, alt, className = "", fallbackSrc }: R2ImageProps) {
  const resolvedSrc = resolveAttachmentProxyUrl(src ?? "");

  const resolved =
    resolvedSrc &&
    (resolvedSrc.startsWith("http") ||
      resolvedSrc.startsWith("/") ||
      resolvedSrc.startsWith("data:") ||
      resolvedSrc.startsWith("blob:"))
      ? resolvedSrc
      : fallbackSrc;
  if (!resolved) {
    return <div className={`bg-gray-100 flex items-center justify-center ${className}`} aria-hidden />;
  }
  return (
    <img
      src={resolved}
      alt={alt}
      className={className}
      onError={(e) => {
        const t = e.currentTarget;
        if (fallbackSrc && t.src !== fallbackSrc) {
          t.src = fallbackSrc;
        }
      }}
    />
  );
}
