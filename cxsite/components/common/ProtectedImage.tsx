'use client'

import { useMemo, useState, useEffect, type CSSProperties } from 'react'
import { getBrowserImageSrcCandidates } from '@/lib/mediaUrl'

type ProtectedImageProps = {
  src: string
  alt: string
  width?: number
  height?: number
  className?: string
  imgClassName?: string
  objectFit?: 'cover' | 'contain'
  /** Fixed pixel box — resists browser zoom scaling */
  fixedSize?: boolean
  /** Fill parent relative container */
  fill?: boolean
  priority?: boolean
}

function withCacheBust(url: string, attempt: number): string {
  if (attempt <= 0) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}_cb=${attempt}`
}

export default function ProtectedImage({
  src,
  alt,
  width,
  height,
  className = '',
  imgClassName = '',
  objectFit = 'cover',
  fixedSize = false,
  fill = false,
  priority = false,
}: ProtectedImageProps) {
  const [attempt, setAttempt] = useState(0)
  const candidates = useMemo(() => getBrowserImageSrcCandidates(src), [src])

  const resolvedSrc = useMemo(() => {
    if (candidates.length === 0) return null
    const base = candidates[Math.min(attempt, candidates.length - 1)]
    const bustAttempt = Math.max(0, attempt - candidates.length + 1)
    return withCacheBust(base, bustAttempt)
  }, [candidates, attempt])

  useEffect(() => {
    setAttempt(0)
  }, [src])

  const boxStyle =
    fixedSize && width && height
      ? { width: `${width}px`, height: `${height}px`, minWidth: `${width}px`, minHeight: `${height}px` }
      : undefined

  const wrapperClass = [
    'gm-protected-media gm-no-browser-zoom',
    fill ? 'absolute inset-0' : 'relative',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const maxAttempts = candidates.length + 2
  const failed = attempt >= maxAttempts || !resolvedSrc

  if (failed) {
    return (
      <div
        className={`${wrapperClass} bg-gradient-to-br from-purple-light/40 to-mint-light/30 flex items-center justify-center`}
        style={boxStyle}
        aria-hidden={!alt}
      >
        <i className="fas fa-image text-text-light/25 text-xl" />
      </div>
    )
  }

  const imgStyle: CSSProperties = {
    objectFit,
    position: 'relative',
    zIndex: 1,
    ...(fixedSize && width && height ? { width: `${width}px`, height: `${height}px` } : {}),
    ...(fill ? { width: '100%', height: '100%' } : {}),
  }

  const handleError = () => {
    setAttempt((prev) => prev + 1)
  }

  return (
    <div className={wrapperClass} style={boxStyle}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={`${resolvedSrc}-${attempt}`}
        src={resolvedSrc}
        alt={alt}
        width={width}
        height={height}
        draggable={false}
        decoding={priority ? 'sync' : 'async'}
        loading={priority ? 'eager' : 'lazy'}
        className={fill ? `absolute inset-0 h-full w-full ${imgClassName}` : `block ${imgClassName}`}
        style={imgStyle}
        onError={handleError}
      />
    </div>
  )
}
