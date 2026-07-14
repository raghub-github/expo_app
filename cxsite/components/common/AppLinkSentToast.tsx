'use client'

import { useEffect } from 'react'
import { APP_LINK_SENT_TOAST } from '@/lib/appDownload'

type Props = {
  open: boolean
  onClose: () => void
  /** Auto-hide after this many ms (default 3s). */
  durationMs?: number
}

/** Pale green banner toast after app-link share succeeds. */
export default function AppLinkSentToast({ open, onClose, durationMs = 3000 }: Props) {
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(onClose, durationMs)
    return () => window.clearTimeout(t)
  }, [open, onClose, durationMs])

  if (!open) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[4.75rem] z-[210] flex justify-center px-3 sm:top-[5.25rem]"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto inline-flex max-w-[calc(100vw-1.5rem)] items-center gap-3 rounded-full border border-[#c8e6c9] bg-[#e8f5e9] px-5 py-3 text-[#2e7d32] shadow-[0_8px_28px_rgba(46,125,50,0.18)] sm:px-6">
        <p className="whitespace-nowrap text-center text-[13px] font-medium leading-none sm:text-[14px]">
          {APP_LINK_SENT_TOAST}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="shrink-0 rounded-full p-1 text-[#2e7d32]/80 transition-colors hover:bg-[#c8e6c9]/60 hover:text-[#1b5e20]"
        >
          <i className="fas fa-times text-sm" aria-hidden />
        </button>
      </div>
    </div>
  )
}
