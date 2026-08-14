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
  /** Bypass partnersite asset cache (e.g. after super-admin upload). */
  refresh?: boolean;
  /** Shown when CMS asset is missing (sidebar brand mark). */
  fallbackSrc?: string;
};

const DEFAULT_LOGO_FALLBACK = "/onlylogo.png";

/** Renders a super-admin uploaded merchant app image when available. */
export function MerchantAppAssetImage({
  assetKey,
  alt,
  className,
  style,
  refresh = false,
  fallbackSrc = DEFAULT_LOGO_FALLBACK,
}: Props) {
  const stickyRef = useRef<string | null>(
    getMerchantAppAssetUrl(assetKey) ??
      (assetKey === MX_ASSET.authLogo ? fallbackSrc : null)
  );
  const [src, setSrc] = useState<string | null>(() => stickyRef.current);

  useEffect(() => {
    let cancelled = false;
    const cached = getMerchantAppAssetUrl(assetKey);
    if (cached) {
      stickyRef.current = cached;
      setSrc(cached);
    }

    void loadMerchantAppAssets({ refresh })
      .then(() => {
        if (cancelled) return;
        const next =
          getMerchantAppAssetUrl(assetKey) ??
          (assetKey === MX_ASSET.authLogo ? fallbackSrc : null);
        if (next) {
          stickyRef.current = next;
          setSrc(next);
        } else if (!stickyRef.current && assetKey === MX_ASSET.authLogo) {
          setSrc(fallbackSrc);
        }
        // Never clear a previously shown stage image on tab switch.
      })
      .catch(() => {
        if (!cancelled && assetKey === MX_ASSET.authLogo && !stickyRef.current) {
          setSrc(fallbackSrc);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [assetKey, refresh, fallbackSrc]);

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
      onError={() => {
        if (fallbackSrc && display !== fallbackSrc && assetKey === MX_ASSET.authLogo) {
          setSrc(fallbackSrc);
        }
      }}
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
