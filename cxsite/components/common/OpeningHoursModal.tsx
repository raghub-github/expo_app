'use client'

import { useEffect, useState } from 'react'

export type OperatingHoursDay = {
  day: string
  open: boolean
  slots: string[]
}

function getTodayWeekdayName(): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: 'Asia/Kolkata',
  }).format(new Date())
}

export default function OpeningHoursModal({
  isOpen,
  onClose,
  storeId,
}: {
  isOpen: boolean
  onClose: () => void
  storeId: string | null
}) {
  const [loading, setLoading] = useState(false)
  const [hours, setHours] = useState<OperatingHoursDay[] | null>(null)
  const [openingTime, setOpeningTime] = useState<string | null>(null)
  const [closingTime, setClosingTime] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !storeId) {
      setHours(null)
      setOpeningTime(null)
      setClosingTime(null)
      setFetchError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setFetchError(null)
    fetch(`/api/restaurants/${encodeURIComponent(storeId)}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    })
      .then(async (res) => {
        const data = (await res.json()) as Record<string, unknown>
        if (cancelled) return
        if (!res.ok || data?.error) {
          setHours(null)
          setOpeningTime(null)
          setClosingTime(null)
          setFetchError(
            typeof data?.error === 'string'
              ? data.error
              : !res.ok
                ? 'Could not load store hours.'
                : 'Could not load store hours.'
          )
          return
        }
        setFetchError(null)
        const oh = data.operating_hours
        setHours(Array.isArray(oh) && oh.length > 0 ? (oh as OperatingHoursDay[]) : null)
        setOpeningTime(data.opening_time != null ? String(data.opening_time) : null)
        setClosingTime(data.closing_time != null ? String(data.closing_time) : null)
      })
      .catch(() => {
        if (!cancelled) {
          setHours(null)
          setOpeningTime(null)
          setClosingTime(null)
          setFetchError('Could not load store hours.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, storeId])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [isOpen, onClose])

  const today = getTodayWeekdayName()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="opening-hours-title"
        className="relative z-[1] w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <h2 id="opening-hours-title" className="text-lg font-bold text-gray-900">
            Opening Hours
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
            aria-label="Close"
          >
            <i className="fas fa-times text-lg" />
          </button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-gray-500">Loading…</p>
        ) : fetchError ? (
          <p className="py-4 text-center text-sm text-rose-600">{fetchError}</p>
        ) : hours && hours.length > 0 ? (
          <ul className="max-h-[min(70vh,420px)] overflow-y-auto">
            {hours.map((row) => {
              const isToday = row.day === today
              const timeText =
                row.open && row.slots.length > 0
                  ? row.slots.join(' · ')
                  : row.open
                    ? 'Open'
                    : 'Closed all day'
              const isClosedDay = !row.open
              return (
                <li
                  key={row.day}
                  className={`flex items-start justify-between gap-4 border-b border-gray-100 py-3.5 text-sm last:border-0 ${
                    isToday ? 'font-bold' : 'font-normal text-gray-500'
                  }`}
                >
                  <span className={isToday ? 'text-gray-900' : ''}>{row.day}</span>
                  <span
                    className={`text-right ${
                      isClosedDay
                        ? 'font-medium text-rose-500'
                        : isToday
                          ? 'text-gray-900'
                          : 'text-gray-500'
                    }`}
                  >
                    {timeText}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : openingTime || closingTime ? (
          <p className="text-sm text-gray-600">
            {openingTime && closingTime ? (
              <>
                <span className="text-gray-500">Daily: </span>
                <span className="font-semibold text-gray-900">
                  {openingTime} – {closingTime}
                </span>
              </>
            ) : (
              <span className="text-gray-500">Hours on file: {openingTime || closingTime || '—'}</span>
            )}
          </p>
        ) : (
          <p className="py-4 text-center text-sm text-gray-500">No opening hours available for this store.</p>
        )}
      </div>
    </div>
  )
}
