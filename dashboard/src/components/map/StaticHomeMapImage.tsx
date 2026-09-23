"use client";

import { ImageIcon } from "lucide-react";
import { resolveAttachmentProxyUrl } from "@/lib/attachments/resolve-attachment-proxy-url";
import { cn } from "@/lib/utils";

type StaticHomeMapImageProps = {
  proxyUrl: string | null | undefined;
  className?: string;
};

/**
 * Static Home map fills its parent (viewport-sized on Home).
 * object-contain keeps the full image visible — scales up/down with screen, no crop/zoom/overlap.
 */
export function StaticHomeMapImage({ proxyUrl, className = "" }: StaticHomeMapImageProps) {
  const src = proxyUrl ? resolveAttachmentProxyUrl(proxyUrl) || proxyUrl : "";

  if (!src) {
    return (
      <div
        className={cn(
          "relative flex h-full w-full min-h-[240px] flex-col items-center justify-center gap-2",
          className
        )}
        role="img"
        aria-label="Static home map unavailable"
      >
        <ImageIcon className="h-10 w-10 text-[#121212]/25" strokeWidth={1.5} />
        <p className="max-w-sm px-4 text-center text-sm font-medium text-[#121212]/55">
          Static map image not uploaded yet
        </p>
        <p className="max-w-sm px-4 text-center text-xs text-[#121212]/40">
          Super Admin → App Images → Home Map to upload an image, or switch back to Live Mapbox Map.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex h-full w-full min-h-[240px] items-center justify-center overflow-hidden",
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="GatiMitra service coverage map"
        className="max-h-full max-w-full h-full w-full object-contain object-center select-none"
        decoding="async"
        draggable={false}
      />
    </div>
  );
}
