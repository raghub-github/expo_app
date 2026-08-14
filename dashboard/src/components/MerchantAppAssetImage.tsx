"use client";

import { useEffect, useRef, useState } from "react";
import {
  MX_ASSET,
  getMerchantAppAssetUrl,
  hasUploadedMerchantAppAsset,
  loadMerchantAppAssets,
} from "@/lib/merchantAppAssets";

type Props = {
  assetKey: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  refresh?: boolean;
};

/** Renders a super-admin uploaded merchant app image when available. */
export function MerchantAppAssetImage({
  assetKey,
  alt,
  className,
  style,
  refresh = false,
}: Props) {
  const stickyRef = useRef<string | null>(
    refresh ? null : getMerchantAppAssetUrl(assetKey)
  );
  const [src, setSrc] = useState<string | null>(() => stickyRef.current);

  useEffect(() => {
    let cancelled = false;
    const cached = getMerchantAppAssetUrl(assetKey);
    if (cached) {
      stickyRef.current = cached;
      setSrc(cached);
    }

    void loadMerchantAppAssets({ refresh }).then(() => {
      if (cancelled) return;
      const next = getMerchantAppAssetUrl(assetKey);
      if (next) {
        stickyRef.current = next;
        setSrc(next);
      }
      // Keep last good URL — never blank stage images on tab switch.
    });
    return () => {
      cancelled = true;
    };
  }, [assetKey, refresh]);

  const display = src ?? stickyRef.current;
  if (!display) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={display}
      alt={alt}
      className={className}
      style={{ backgroundColor: "transparent", ...style }}
      loading="eager"
      decoding="async"
      fetchPriority="high"
    />
  );
}

/** Off-screen warm cache for all order empty-state illustrations. */
export function MerchantOrderEmptyAssetsWarmup() {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    void loadMerchantAppAssets()
      .then(() => {
        const keys = [
          MX_ASSET.ordersEmptyNew,
          MX_ASSET.ordersEmptyActive,
          MX_ASSET.ordersEmptyPreparing,
          MX_ASSET.ordersEmptyReady,
          MX_ASSET.ordersEmptyPickedUp,
          MX_ASSET.ordersEmptyCompleted,
          MX_ASSET.ordersEmptyRto,
          MX_ASSET.ordersEmptyScheduled,
        ] as const;
        const next: string[] = [];
        for (const key of keys) {
          const url = getMerchantAppAssetUrl(key);
          if (url) {
            next.push(url);
            const img = new window.Image();
            img.decoding = "async";
            img.src = url;
          }
        }
        setUrls(next);
      })
      .catch(() => undefined);
  }, []);

  if (urls.length === 0) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        width: 0,
        height: 0,
        overflow: "hidden",
        opacity: 0,
        pointerEvents: "none",
      }}
    >
      {urls.map((url) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={url} src={url} alt="" width={1} height={1} />
      ))}
    </div>
  );
}

export { MX_ASSET, hasUploadedMerchantAppAsset };
