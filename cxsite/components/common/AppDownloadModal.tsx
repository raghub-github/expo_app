'use client'

import Image from 'next/image'

interface AppDownloadModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
}

export default function AppDownloadModal({
  isOpen,
  onClose,
  title = 'Book rides in the GatiMitra App',
  description = 'Web ride booking is currently unavailable. Please download the app to continue.',
}: AppDownloadModalProps) {
  if (!isOpen) return null

  const androidUrl = process.env.NEXT_PUBLIC_APP_DOWNLOAD_URL || 'https://play.google.com/store'
  const iosUrl = process.env.NEXT_PUBLIC_IOS_APP_DOWNLOAD_URL || 'https://www.apple.com/app-store/'
  const qrData = encodeURIComponent(androidUrl)
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${qrData}`

  return (
    <div className="fixed inset-0 z-[1100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-white/20 bg-white shadow-[0_35px_90px_-25px_rgba(0,0,0,0.55)]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close app download popup"
          className="absolute right-7 top-6 z-10 text-gray-500 hover:text-gray-800 transition-colors"
        >
          <i className="fas fa-times text-lg"></i>
        </button>

        <div className="grid grid-cols-1 md:grid-cols-[360px_minmax(0,1fr)] md:items-stretch">
          {/* Same image as hero — sized with width/height so nothing gets clipped */}
          <div className="hidden md:flex items-center justify-center bg-gradient-to-b from-[#e8fffa] to-[#f8f9ff] border-r border-gray-100 p-5">
            <Image
              src="/img/ride.png"
              alt="GatiMitra ride app screens"
              width={615}
              height={881}
              className="h-auto w-full max-h-[480px] object-contain"
              sizes="360px"
              unoptimized
              priority
            />
          </div>

          <div className="flex flex-col justify-center p-6 md:p-8">
            <h3 className="text-3xl font-bold text-gray-900 pr-8">{title}</h3>
            <p className="mt-3 text-sm text-gray-600 leading-relaxed max-w-xl">{description}</p>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a
                href={androidUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1f2937] text-white px-4 py-3 text-sm font-semibold hover:bg-[#111827] transition-colors"
              >
                <i className="fab fa-google-play text-base" />
                Get it on Google Play
              </a>
              <a
                href={iosUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1f2937] text-white px-4 py-3 text-sm font-semibold hover:bg-[#111827] transition-colors"
              >
                <i className="fab fa-apple text-base" />
                Download on App Store
              </a>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <img
                src={qrUrl}
                alt="Download app QR code"
                className="w-[104px] h-[104px] rounded-lg border border-gray-200 bg-white p-1"
              />
              <div>
                <p className="text-sm font-semibold text-gray-900">Scan QR to download quickly</p>
                <p className="text-xs text-gray-600 mt-1">
                  Open your phone camera and scan this code to install the app.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
