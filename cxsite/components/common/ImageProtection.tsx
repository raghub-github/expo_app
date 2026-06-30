'use client'

import { useEffect } from 'react'

const PROTECT_ATTR = 'data-gm-protect-media'

function shouldBlockMediaEvent(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false
  if (target.tagName === 'IMG') return true
  if (target.closest(`[${PROTECT_ATTR}]`)) return true
  if (target.closest('picture, figure, .gm-protected-media')) return true
  return false
}

function protectImageElement(img: HTMLImageElement) {
  img.draggable = false
  img.setAttribute('draggable', 'false')
  img.setAttribute('decoding', img.getAttribute('decoding') ?? 'async')

  const parent = img.parentElement
  if (!parent || parent.tagName === 'A') return

  // Hero arc chips use position:absolute — data-gm-protect-media forces position:relative and breaks the arc.
  if (
    parent.tagName === 'BUTTON' ||
    parent.classList.contains('landing-hero-arc-chip') ||
    parent.closest('.landing-hero-arc-root')
  ) {
    parent.removeAttribute(PROTECT_ATTR)
    return
  }

  const onlyMediaChild =
    parent.childElementCount <= 2 &&
    parent.querySelector('img') &&
    !parent.querySelector('button, a, input, textarea, select')

  if (onlyMediaChild || parent.classList.contains('gm-protected-media')) {
    parent.setAttribute(PROTECT_ATTR, '')
  }
}

export default function ImageProtection() {
  useEffect(() => {
    const syncViewportScale = () => {
      const scale = window.visualViewport?.scale ?? 1
      document.documentElement.style.setProperty('--gm-vv-scale', String(scale > 0 ? scale : 1))
    }

    syncViewportScale()
    window.visualViewport?.addEventListener('resize', syncViewportScale)
    window.visualViewport?.addEventListener('scroll', syncViewportScale)

    const block = (e: Event) => {
      if (!shouldBlockMediaEvent(e.target)) return
      e.preventDefault()
      e.stopPropagation()
    }

    const patchAllImages = () => {
      document.querySelectorAll('img').forEach((node) => protectImageElement(node))
    }

    patchAllImages()

    const observer = new MutationObserver(patchAllImages)
    observer.observe(document.body, { childList: true, subtree: true })

    const onAuxClick = (e: Event) => {
      if (e instanceof MouseEvent && e.button === 1 && shouldBlockMediaEvent(e.target)) {
        e.preventDefault()
      }
    }

    document.addEventListener('contextmenu', block, true)
    document.addEventListener('dragstart', block, true)
    document.addEventListener('selectstart', block, true)
    document.addEventListener('copy', block, true)
    document.addEventListener('cut', block, true)
    document.addEventListener('auxclick', onAuxClick, true)

    return () => {
      window.visualViewport?.removeEventListener('resize', syncViewportScale)
      window.visualViewport?.removeEventListener('scroll', syncViewportScale)
      observer.disconnect()
      document.removeEventListener('contextmenu', block, true)
      document.removeEventListener('dragstart', block, true)
      document.removeEventListener('selectstart', block, true)
      document.removeEventListener('copy', block, true)
      document.removeEventListener('cut', block, true)
      document.removeEventListener('auxclick', onAuxClick, true)
    }
  }, [])

  return null
}
