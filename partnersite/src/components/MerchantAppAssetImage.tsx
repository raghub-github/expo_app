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
};

/** Renders a super-admin uploaded merchant app image when available. */
export function MerchantAppAssetImage({
  assetKey,
  alt,
  className,
  style,
  refresh = false,
}: Props) {
  const [src, setSrc] = useState<string | null>(() =>
    refresh ? null : getMerchantAppAssetUrl(assetKey)
  );

  useEffect(() => {
    let cancelled = false;
    void loadMerchantAppAssets({ refresh }).then(() => {
      if (cancelled) return;
      if (refresh || hasUploadedMerchantAppAsset(assetKey)) {
        setSrc(getMerchantAppAssetUrl(assetKey));
      } else {
        setSrc(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [assetKey, refresh]);

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
    />
  );
}

export { MX_ASSET };
