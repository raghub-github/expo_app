'use client'

import { useCallback, useRef, useState } from 'react'
import Image from 'next/image'

const ZOOM = 2.4
const LENS_RATIO = 0.34

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export type ProductImageZoomState = {
  active: boolean
  focus: { x: number; y: number }
  lens: { left: number; top: number; size: number }
  containerRef: React.RefObject<HTMLDivElement | null>
  onEnter: () => void
  onLeave: () => void
  onMove: (e: React.MouseEvent<HTMLDivElement>) => void
}

export function useGroceryProductImageZoom(src: string | null): ProductImageZoomState {
  const containerRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(false)
  const [lens, setLens] = useState({ left: 0, top: 0, size: 0 })
  const [focus, setFocus] = useState({ x: 50, y: 50 })

  const onMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = containerRef.current
      if (!el || !src) return
      const rect = el.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const size = rect.width * LENS_RATIO
      const left = clamp(x - size / 2, 0, rect.width - size)
      const top = clamp(y - size / 2, 0, rect.height - size)
      const px = ((left + size / 2) / rect.width) * 100
      const py = ((top + size / 2) / rect.height) * 100
      setLens({ left, top, size })
      setFocus({ x: px, y: py })
    },
    [src]
  )

  const onEnter = useCallback(() => {
    if (!src) return
    const el = containerRef.current
    if (!el) return
    const size = el.clientWidth * LENS_RATIO
    setLens({
      left: (el.clientWidth - size) / 2,
      top: (el.clientHeight - size) / 2,
      size,
    })
    setFocus({ x: 50, y: 50 })
    setActive(true)
  }, [src])

  const onLeave = useCallback(() => setActive(false), [])

  return { active, focus, lens, containerRef, onEnter, onLeave, onMove }
}

export function GroceryProductImageSource({
  src,
  alt,
  zoom,
}: {
  src: string | null
  alt: string
  zoom: ProductImageZoomState
}) {
  const { active, lens, containerRef, onEnter, onLeave, onMove } = zoom

  return (
    <div
      ref={containerRef}
      className="relative mx-auto aspect-square w-full max-w-[320px] cursor-crosshair sm:max-w-[360px] lg:mx-0"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onMouseMove={onMove}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          className="object-contain p-5 drop-shadow-sm"
          unoptimized
          priority
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm text-[#9ca3af]">
          No image available
        </div>
      )}

      {active && src ? (
        <div
          className="pointer-events-none absolute z-10 hidden border-2 border-white/90 bg-[#16c2a5]/10 shadow-[0_0_0_1px_rgba(22,194,165,0.55)] lg:block"
          style={{
            width: lens.size,
            height: lens.size,
            left: lens.left,
            top: lens.top,
          }}
          aria-hidden
        />
      ) : null}
    </div>
  )
}

export function GroceryProductZoomPanel({
  src,
  focus,
  active,
}: {
  src: string | null
  focus: { x: number; y: number }
  active: boolean
}) {
  if (!src) return null

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-20 hidden overflow-hidden rounded-2xl border border-[#e8e8ee] bg-white shadow-[0_12px_40px_rgba(0,0,0,0.08)] transition-opacity duration-200 lg:block ${
        active ? 'opacity-100' : 'opacity-0'
      }`}
      aria-hidden
    >
      <div
        className="h-full w-full bg-white bg-no-repeat"
        style={{
          backgroundImage: `url(${src})`,
          backgroundSize: `${ZOOM * 100}%`,
          backgroundPosition: `${focus.x}% ${focus.y}%`,
        }}
      />
    </div>
  )
}
