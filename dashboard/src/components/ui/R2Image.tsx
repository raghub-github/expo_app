"use client";

interface R2ImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackSrc?: string;
}

export function R2Image({ src, alt, className = "", fallbackSrc }: R2ImageProps) {
  const resolved = src && (src.startsWith("http") || src.startsWith("/") || src.startsWith("data:")) ? src : fallbackSrc;
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
