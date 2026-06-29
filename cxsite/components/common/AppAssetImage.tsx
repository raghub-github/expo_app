'use client'

import { useAppAssetUrl } from '@/components/providers/AppAssetsProvider'

type Props = {
  assetKey: string
  alt?: string
  className?: string
  width?: number
  height?: number
  decoding?: 'async' | 'auto' | 'sync'
  fetchPriority?: 'high' | 'low' | 'auto'
  onLoad?: React.ReactEventHandler<HTMLImageElement>
}

/** CMS-managed image — same source as the customer mobile app. */
export default function AppAssetImage({
  assetKey,
  alt = '',
  className,
  width,
  height,
  decoding = 'async',
  fetchPriority,
  onLoad,
}: Props) {
  const url = useAppAssetUrl(assetKey)

  if (!url) {
    return (
      <span
        className={`block shrink-0 ${className ?? ''}`}
        aria-hidden={alt === ''}
        aria-label={alt === '' ? undefined : alt}
      />
    )
  }

  return (
    <img
      src={url}
      alt={alt}
      className={className}
      width={width}
      height={height}
      decoding={decoding}
      fetchPriority={fetchPriority}
      draggable={false}
      onLoad={onLoad}
    />
  )
}
