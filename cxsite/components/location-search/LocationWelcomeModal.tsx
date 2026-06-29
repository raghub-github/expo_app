'use client'

type LocationWelcomeModalProps = {
  isOpen: boolean
  onClose: () => void
  onAutoDetect: () => void
  onManualEntry: () => void
  detecting?: boolean
  errorMessage?: string | null
}

/** Centered first-visit prompt — not the side sheet or browser-settings help modal. */
export default function LocationWelcomeModal({
  isOpen,
  onClose,
  onAutoDetect,
  onManualEntry,
  detecting = false,
  errorMessage = null,
}: LocationWelcomeModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4">
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl animate-scaleIn"
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-welcome-title"
      >
        <div className="border-b border-gray-200 px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 id="location-welcome-title" className="text-lg font-bold text-gray-900">
                Set your delivery location
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                Pick where you want food delivered so we can show stores near you.
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
          <button
            type="button"
            onClick={onAutoDetect}
            disabled={detecting}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-70"
          >
            {detecting ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent" />
                Detecting location…
              </>
            ) : (
              <>
                <i className="fas fa-crosshairs" aria-hidden />
                Auto-detect current location
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onManualEntry}
            disabled={detecting}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-70"
          >
            <i className="fas fa-map-marker-alt text-[#109D4C]" aria-hidden />
            Enter location manually
          </button>

          {errorMessage ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950">
              {errorMessage}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
