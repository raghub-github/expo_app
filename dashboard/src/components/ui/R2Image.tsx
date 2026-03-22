"use client";

interface R2ImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackSrc?: string;
}

export function R2Image({ src, alt, className = "", fallbackSrc }: R2ImageProps) {
  let resolvedSrc = src ?? "";

  // Normalize old backend attachment URLs (e.g. http://host:3000/v1/attachments/proxy?key=...)
  if (resolvedSrc) {
    try {
      const url = new URL(resolvedSrc);
      const path = url.pathname;
      const search = url.search || "";
      if (path.startsWith("/v1/attachments/proxy")) {
        // Use current origin + new dashboard proxy route
        resolvedSrc = `/api/attachments/proxy${search}`;
      } else if (path.startsWith("/api/attachments/proxy")) {
        resolvedSrc = `/api/attachments/proxy${search}`;
      }
    } catch {
      // If it's already a relative path, just keep it as is.
      if (resolvedSrc.startsWith("/v1/attachments/proxy")) {
        resolvedSrc = resolvedSrc.replace("/v1/attachments/proxy", "/api/attachments/proxy");
      }
    }
  }

  // Legacy DB values: raw R2 object key (e.g. merchants/.../menu/... or merchant-menu/...)
  if (
    resolvedSrc &&
    !resolvedSrc.includes("://") &&
    !resolvedSrc.startsWith("/") &&
    !resolvedSrc.startsWith("data:")
  ) {
    resolvedSrc = `/api/attachments/proxy?key=${encodeURIComponent(resolvedSrc)}`;
  }

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
