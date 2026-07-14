'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  CUSTOMER_APP_SCREEN_IMG,
  RIDE_APP_SCREEN_IMG,
  resolveAndroidDownloadUrl,
  resolveIosDownloadUrl,
} from '@/lib/appDownload'
import { AppleStoreIcon, GooglePlayIcon } from '@/components/common/StoreBrandIcons'

interface AppDownloadModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  /** `ride` → ride.png, `customer` → dnscreen.png (food / parcel / general). */
  variant?: 'ride' | 'customer'
  /** Called after link is sent successfully (modal already closed). */
  onLinkSent?: () => void
}

export default function AppDownloadModal({
  isOpen,
  onClose,
  title = 'Get the GatiMitra App',
  description = 'For a better experience, please order through our mobile app.',
  variant = 'customer',
  onLinkSent,
}: AppDownloadModalProps) {
  const [downloadMode, setDownloadMode] = useState<'phone' | 'email'>('email')
  const [downloadValue, setDownloadValue] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setDownloadMode('email')
    setDownloadValue('')
    setStatus('idle')
    setErrorMessage('')
  }, [isOpen])

  const androidUrl = resolveAndroidDownloadUrl()
  const iosUrl = resolveIosDownloadUrl()
  const previewSrc = variant === 'customer' ? CUSTOMER_APP_SCREEN_IMG : RIDE_APP_SCREEN_IMG
  const panelBg = variant === 'ride' ? 'bg-[#e8fffa]' : 'bg-[#18d4b3]'

  const handleShare = useCallback(async () => {
    const value = downloadValue.trim()
    if (!value) {
      setStatus('error')
      setErrorMessage('Enter your email address.')
      return
    }
    setStatus('sending')
    setErrorMessage('')
    try {
      const res = await fetch('/api/share-app-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'email', value }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setStatus('error')
        setErrorMessage(data.error || 'Could not share the app link. Please try again.')
        return
      }
      onClose()
      onLinkSent?.()
    } catch {
      setStatus('error')
      setErrorMessage('Network error. Please try again.')
    }
  }, [downloadValue, onClose, onLinkSent])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/55 p-4">
      <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-neutral-200 bg-white text-gray-900 shadow-[0_30px_100px_-30px_rgba(0,0,0,0.6)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 h-8 w-8 rounded-full border border-gray-200 text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-800"
          aria-label="Close download app popup"
        >
          <i className="fas fa-xmark" />
        </button>

        <div className="grid grid-cols-1 items-stretch gap-0 md:grid-cols-[340px_minmax(0,1fr)]">
          <div
            className={`hidden min-h-[420px] items-center justify-center self-stretch px-4 py-5 md:flex md:px-5 md:py-6 ${panelBg}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- synced public/img asset */}
            <img
              src={previewSrc}
              alt={variant === 'ride' ? 'GatiMitra ride app' : 'GatiMitra customer app'}
              className="h-full w-full max-h-[460px] max-w-[320px] object-contain drop-shadow-[0_18px_40px_rgba(0,0,0,0.22)]"
              decoding="async"
              fetchPriority="high"
            />
          </div>

          <div className="p-6 md:p-8">
            <h3 className="pr-8 text-3xl font-semibold tracking-tight">{title}</h3>
            <p className="mt-3 max-w-xl text-sm text-gray-600">{description}</p>

            <div className="mt-6 flex items-center gap-6 text-sm">
              <label className="inline-flex cursor-not-allowed items-center gap-2 opacity-45">
                <input
                  type="radio"
                  name="appDownloadMode"
                  checked={false}
                  disabled
                  className="accent-[#e91e8c]"
                  aria-disabled="true"
                />
                <span>Phone</span>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="appDownloadMode"
                  checked={downloadMode === 'email'}
                  onChange={() => {
                    setDownloadMode('email')
                    setStatus('idle')
                    setErrorMessage('')
                  }}
                  className="accent-[#e91e8c]"
                />
                <span>Email</span>
              </label>
            </div>

            <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
              <div className="flex w-full">
                <input
                  type="email"
                  value={downloadValue}
                  onChange={(e) => {
                    setDownloadValue(e.target.value)
                    if (status !== 'idle') {
                      setStatus('idle')
                      setErrorMessage('')
                    }
                  }}
                  placeholder="you@example.com"
                  className="h-11 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-[#e91e8c]/40 focus:ring-2 focus:ring-[#e91e8c]/25"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void handleShare()
                    }
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => void handleShare()}
                disabled={status === 'sending'}
                className="h-11 whitespace-nowrap rounded-md bg-[#e91e8c] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#d0177d] disabled:opacity-60"
              >
                {status === 'sending' ? 'Sending…' : 'Share App Link'}
              </button>
            </div>
            {errorMessage ? (
              <p className="mt-2 text-xs text-red-600" role="alert">
                {errorMessage}
              </p>
            ) : null}

            <p className="mt-5 text-xs text-gray-500">Download app from</p>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <a
                href={androidUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md bg-[#1f2937] px-3 py-2 text-xs font-medium text-white"
              >
                <GooglePlayIcon className="h-4 w-4 shrink-0" />
                <span>GET IT ON Google Play</span>
              </a>
              <a
                href={iosUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md bg-[#1f2937] px-3 py-2 text-xs font-medium text-white"
              >
                <AppleStoreIcon className="h-4 w-4 shrink-0" />
                <span>Download on the App Store</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
