'use client'

import AppAssetImage from '@/components/common/AppAssetImage'
import { CX } from '@/lib/appAssetKeys'

type Props = {
  /** `withName` = header wordmark (default). `icon` = mark only. */
  variant?: 'withName' | 'icon'
  alt?: string
  className?: string
  width?: number
  height?: number
  decoding?: 'async' | 'auto' | 'sync'
  fetchPriority?: 'high' | 'low' | 'auto'
}

/** Single CMS logo source for all cxsite pages — same keys as customer app. */
export default function GatiMitraLogo({
  variant = 'withName',
  alt = 'GatiMitra',
  className,
  width,
  height,
  decoding,
  fetchPriority,
}: Props) {
  const assetKey = variant === 'icon' ? CX.auth.logo : CX.auth.logoWithName
  return (
    <AppAssetImage
      assetKey={assetKey}
      alt={alt}
      className={className}
      width={width}
      height={height}
      decoding={decoding}
      fetchPriority={fetchPriority}
    />
  )
}
