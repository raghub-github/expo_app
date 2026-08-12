"use client";

import { useEffect, useState } from "react";
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
  const [src, setSrc] = useState<string | null>(() =>
    refresh
      ? null
      : getMerchantAppAssetUrl(assetKey) ?? (assetKey === MX_ASSET.authLogo ? fallbackSrc : null)
  );

  useEffect(() => {
    let cancelled = false;
    void loadMerchantAppAssets({ refresh })
      .then(() => {
        if (cancelled) return;
        if (refresh || hasUploadedMerchantAppAsset(assetKey)) {
          setSrc(
            getMerchantAppAssetUrl(assetKey) ??
              (assetKey === MX_ASSET.authLogo ? fallbackSrc : null)
          );
        } else {
          setSrc(assetKey === MX_ASSET.authLogo ? fallbackSrc : null);
        }
      })
      .catch(() => {
        if (!cancelled && assetKey === MX_ASSET.authLogo) setSrc(fallbackSrc);
      });
    return () => {
      cancelled = true;
    };
  }, [assetKey, refresh, fallbackSrc]);

  if (!src) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      style={{ backgroundColor: "transparent", ...style }}
      loading="eager"
      decoding="async"
      onError={() => {
        if (fallbackSrc && src !== fallbackSrc) setSrc(fallbackSrc);
      }}
    />
  );
}

export { MX_ASSET };
