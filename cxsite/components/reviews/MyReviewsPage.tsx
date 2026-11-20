'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAppSelector } from '@/lib/hooks'
import { truncateDisplayName } from '@/lib/truncateDisplayName'

type ReviewRow = {
  id: string
  source: 'order' | 'feedback'
  title: string
  subtitle: string | null
  rating: number | null
  review: string | null
  response: string | null
  status: string | null
  created_at: string | null
  order_id: number | null
  store_id: number | null
  store_image: string | null
  store_slug: string | null
  service_label: string
}

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const diff = Date.now() - t
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`
  const years = Math.floor(months / 12)
  return `${years} year${years === 1 ? '' : 's'} ago`
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

export default function MyReviewsPage() {
  const router = useRouter()
  const { user, isAuthenticated, isLoading } = useAppSelector((s) => s.auth)
  const [hasMounted, setHasMounted] = useState(false)
  const [reviews, setReviews] = useState<ReviewRow[]>([])
  const [profileImage, setProfileImage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [imgBroken, setImgBroken] = useState(false)

  const displayName = truncateDisplayName(user?.name || user?.phone || 'Guest')
  const initials = (user?.name || user?.phone || 'G').charAt(0).toUpperCase()
  const email = (user?.email || '').trim().toLowerCase()
  const phone = (user?.phone || '').trim()

  useEffect(() => {
    setHasMounted(true)
  }, [])

  useEffect(() => {
    if (!hasMounted || isLoading) return
    if (!isAuthenticated || !user) {
      setLoading(false)
      return
    }

    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const qs = new URLSearchParams()
        if (phone) qs.set('phone', phone)
        if (email) qs.set('email', email)
        // Scope strictly to this logged-in account (never mix users)
        if (user.user_id) qs.set('customerId', user.user_id)
        if (user.id) qs.set('id', String(user.id))
        const res = await fetch(`/api/reviews/mine?${qs.toString()}`)
        const data = (await res.json()) as {
          ok?: boolean
          reviews?: ReviewRow[]
          profile_image_url?: string | null
          customer_code?: string | null
          error?: string
        }
        if (cancelled) return
        if (!res.ok || !data.ok) {
          setError(data.error || 'Could not load reviews')
          setReviews([])
          return
        }
        setReviews(data.reviews ?? [])
        setProfileImage(data.profile_image_url ?? null)
        setImgBroken(false)
      } catch {
        if (!cancelled) {
          setError('Could not load reviews')
          setReviews([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [hasMounted, isAuthenticated, isLoading, user, email, phone])

  const storeReviews = useMemo(
    () => reviews.filter((r) => r.source === 'order'),
    [reviews]
  )
  const platformReviews = useMemo(
    () => reviews.filter((r) => r.source === 'feedback'),
    [reviews]
  )

  const avgStars = useMemo(() => {
    const scored = storeReviews.filter((r) => r.rating != null && r.rating > 0)
    if (!scored.length) return 0
    return scored.reduce((a, r) => a + (r.rating || 0), 0) / scored.length
  }, [storeReviews])

  const showPhoto = Boolean(profileImage) && !imgBroken

  // Same shell on server + first client paint — avoids hydration mismatch (auth is localStorage).
  if (!hasMounted || isLoading) {
    return (
      <div className="flex min-h-[50vh] w-full items-center justify-center bg-[#f4f6f5] text-sm text-slate-500">
        Loading…
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-4 bg-[#f4f6f5] px-4 text-center">
        <p className="text-lg font-semibold text-[#142018]">Sign in to see your reviews</p>
        <Link
          href="/"
          className="rounded-xl bg-[#109D4C] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0d7a3c]"
        >
          Go to home
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full bg-[#f4f6f5]">
      {/* Top bar — full width */}
      <header className="sticky top-0 z-20 w-full border-b border-black/[0.06] bg-white/95 backdrop-blur">
        <div className="flex w-full items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-10 xl:px-14">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex h-10 w-10 items-center justify-center rounded-full text-[#1c1c1c] transition hover:bg-[#f0f4f1]"
              aria-label="Go back"
            >
              <i className="fas fa-arrow-left text-sm" />
            </button>
            <div>
              <p className="text-lg font-bold leading-tight text-[#1c1c1c]">Reviews & feedback</p>
              <p className="text-xs text-[#6b7a70]">Your ratings across GatiMitra stores</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/orders?filter=all&from=%2Freviews"
              className="hidden rounded-xl border border-[#d8e0db] bg-white px-4 py-2 text-xs font-semibold text-[#1c1c1c] transition hover:bg-[#f0f4f1] sm:inline-flex"
            >
              Order history
            </Link>
            <Link
              href="/support?type=feedback"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#109D4C] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#0d7a3c]"
            >
              <i className="fas fa-plus text-[10px]" />
              Write feedback
            </Link>
          </div>
        </div>
      </header>

      {/* Full-bleed profile hero */}
      <section className="relative w-full overflow-hidden bg-[#109D4C]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 80% 120% at 0% 0%, rgba(255,255,255,0.22), transparent 55%), radial-gradient(ellipse 60% 80% at 100% 100%, rgba(8,90,45,0.55), transparent 50%)',
          }}
        />
        <div className="relative flex w-full flex-col gap-6 px-4 py-8 sm:flex-row sm:items-end sm:justify-between sm:px-6 sm:py-10 lg:px-10 xl:px-14">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-full bg-white shadow-lg ring-4 ring-white/30 sm:h-24 sm:w-24">
              {showPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profileImage!}
                  alt={displayName}
                  className="h-full w-full object-cover"
                  onError={() => setImgBroken(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-3xl font-extrabold text-[#109D4C]">
                  {initials}
                </div>
              )}
            </div>
            <div className="min-w-0 text-white">
              <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
                {displayName}
              </h1>
              <p className="mt-1 truncate text-sm text-white/85 sm:text-base">
                {email || phone}
              </p>
              {user.user_id || user.id ? (
                <p className="mt-1 font-mono text-xs text-white/70">{user.user_id || user.id}</p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 sm:gap-4">
            <div className="min-w-[110px] rounded-2xl bg-white/15 px-5 py-3 backdrop-blur-sm">
              <p className="text-2xl font-bold tabular-nums text-white sm:text-3xl">
                {storeReviews.length}
              </p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/80">
                Store reviews
              </p>
            </div>
            <div className="min-w-[110px] rounded-2xl bg-white/15 px-5 py-3 backdrop-blur-sm">
              <p className="text-2xl font-bold tabular-nums text-white sm:text-3xl">
                {avgStars > 0 ? avgStars.toFixed(1) : '—'}
              </p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/80">
                Avg rating
              </p>
            </div>
            {platformReviews.length > 0 ? (
              <div className="min-w-[110px] rounded-2xl bg-white/15 px-5 py-3 backdrop-blur-sm">
                <p className="text-2xl font-bold tabular-nums text-white sm:text-3xl">
                  {platformReviews.length}
                </p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/80">
                  Site feedback
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* Full-width content */}
      <main className="w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-10 xl:px-14">
        <div className="mb-6 flex w-full flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[#142018] sm:text-3xl">
              Your store reviews
            </h2>
            <p className="mt-1 text-sm text-[#5a6b60]">
              Feedback you&apos;ve given to restaurants after delivery
            </p>
          </div>
          <Link
            href="/orders?filter=all&from=%2Freviews"
            className="inline-flex rounded-xl border border-[#d8e0db] bg-white px-4 py-2 text-xs font-semibold text-[#1c1c1c] transition hover:bg-[#eef3ef] sm:hidden"
          >
            Order history
          </Link>
        </div>

        {loading ? (
          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                className="h-56 animate-pulse rounded-2xl border border-[#e2e8e4] bg-white"
              />
            ))}
          </div>
        ) : error ? (
          <div className="w-full rounded-2xl border border-red-100 bg-red-50 px-5 py-10 text-center text-sm text-red-700">
            {error}
          </div>
        ) : storeReviews.length === 0 ? (
          <div className="w-full rounded-2xl border border-[#e2e8e4] bg-white px-5 py-16 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#e8f3ec] text-[#109D4C]">
              <i className="fas fa-store text-2xl" />
            </div>
            <p className="mt-5 text-xl font-bold text-[#142018]">No store reviews yet</p>
            <p className="mx-auto mt-2 max-w-lg text-sm text-[#5a6b60]">
              After you rate a restaurant on a delivered order, it will show up here.
            </p>
            <Link
              href="/orders?filter=all&from=%2Freviews"
              className="mt-6 inline-flex rounded-xl bg-[#109D4C] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0d7a3c]"
            >
              View order history
            </Link>
          </div>
        ) : (
          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {storeReviews.map((r) => {
              const stars = r.rating != null ? Math.round(r.rating) : null
              const storeHref = r.store_slug ? `/restaurant/${r.store_slug}` : null

              return (
                <article
                  key={r.id}
                  className="flex w-full flex-col rounded-2xl border border-[#e2e8e4] bg-white p-4 shadow-[0_1px_3px_rgba(16,60,40,0.04)] transition hover:border-[#109D4C]/35 hover:shadow-md sm:p-5"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[#eef2ef]">
                      {r.store_image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.store_image}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[#6b7a70]">
                          <i className="fas fa-store" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-base font-bold text-[#142018]">{r.title}</p>
                          {r.subtitle ? (
                            <p className="mt-0.5 truncate text-xs text-[#6b7a70]">{r.subtitle}</p>
                          ) : (
                            <p className="mt-0.5 text-xs text-[#6b7a70]">Food delivery</p>
                          )}
                        </div>
                        {stars != null ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#109D4C] px-2 py-1 text-[11px] font-bold leading-none text-white">
                            {stars} ★
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="my-3.5 border-t border-[#eef2ef]" />

                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#8a968e]">
                    <span>{r.service_label}</span>
                    <span className="text-[#c5cdc8]">·</span>
                    <span className="normal-case tracking-normal text-[#6b7a70]" title={formatDate(r.created_at)}>
                      {relativeTime(r.created_at) || formatDate(r.created_at)}
                    </span>
                  </div>

                  {r.review ? (
                    <p className="mt-3 line-clamp-4 flex-1 text-sm leading-relaxed text-[#3d4a42]">
                      {r.review}
                    </p>
                  ) : (
                    <p className="mt-3 flex-1 text-sm italic text-[#9aa59d]">
                      Rated without a written review
                    </p>
                  )}

                  {r.response ? (
                    <div className="mt-3 rounded-xl border border-[#109D4C]/18 bg-[#eef6f1] px-3 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#0d7a3c]">
                        Restaurant replied
                      </p>
                      <p className="mt-1 line-clamp-3 text-sm text-[#244033]">{r.response}</p>
                    </div>
                  ) : null}

                  <div className="mt-auto flex justify-end pt-4">
                    {storeHref ? (
                      <Link
                        href={storeHref}
                        className="inline-flex items-center rounded-lg border border-[#109D4C] px-3.5 py-1.5 text-xs font-semibold text-[#109D4C] transition hover:bg-[#e8f3ec]"
                      >
                        View Details
                      </Link>
                    ) : (
                      <span className="inline-flex items-center rounded-lg border border-[#c5d0c9] px-3.5 py-1.5 text-xs font-semibold text-[#8a968e]">
                        View Details
                      </span>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}

        {platformReviews.length > 0 ? (
          <section className="mt-12 w-full">
            <h3 className="mb-4 text-xl font-bold text-[#142018]">Website feedback</h3>
            <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {platformReviews.map((r) => {
                const stars = r.rating != null ? Math.round(r.rating) : null
                return (
                  <div
                    key={r.id}
                    className="rounded-2xl border border-[#e2e8e4] bg-white px-4 py-4 sm:px-5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {stars != null ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-[#109D4C] px-2 py-0.5 text-[11px] font-bold text-white">
                          {stars} ★
                        </span>
                      ) : null}
                      <span className="text-xs text-[#6b7a70]">
                        {relativeTime(r.created_at) || formatDate(r.created_at)}
                      </span>
                      {r.status && r.status.toLowerCase() === 'pending' ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                          Under review
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-[#3d4a42]">{r.review}</p>
                    {r.response ? (
                      <p className="mt-2 text-sm text-[#0d7a3c]">
                        <span className="font-semibold">GatiMitra:</span> {r.response}
                      </p>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  )
}
