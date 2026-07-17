'use client'

type EnableLocationModalProps = {
  isOpen: boolean
  onClose: () => void
  onTryAgain: () => void
  onManualEntry?: () => void
  loading?: boolean
}

/**
 * Shown when browser Location permission is blocked/denied.
 * Until the user enables it, the site stays in pan-India browse mode.
 */
export default function EnableLocationModal({
  isOpen,
  onClose,
  onTryAgain,
  onManualEntry,
  loading = false,
}: EnableLocationModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[1250] flex items-center justify-center bg-black/55 p-4">
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="enable-location-title"
      >
        <div className="border-b border-gray-200 px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 id="enable-location-title" className="text-lg font-bold text-gray-900">
                Turn on location
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                Location is off for this site. Enable it to see stores near you. Until then, we
                show pan-India stores.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 text-xl leading-none text-gray-400 hover:text-gray-600"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        <div className="space-y-3 px-6 py-5">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-gray-700">
            <li>Click the lock / site info icon in your browser address bar.</li>
            <li>Set <span className="font-semibold">Location</span> to Allow.</li>
            <li>Come back here and tap Try again.</li>
          </ol>

          <button
            type="button"
            onClick={onTryAgain}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-70"
          >
            {loading ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent" />
                Checking location…
              </>
            ) : (
              <>
                <i className="fas fa-location-arrow" aria-hidden />
                Try again
              </>
            )}
          </button>

          {onManualEntry ? (
            <button
              type="button"
              onClick={onManualEntry}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-70"
            >
              <i className="fas fa-map-marker-alt text-[#109D4C]" aria-hidden />
              Enter location manually
            </button>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700"
          >
            Continue with pan-India stores
          </button>
        </div>
      </div>
    </div>
  )
}
