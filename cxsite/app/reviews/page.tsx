import { Suspense } from 'react'
import MyReviewsPage from '@/components/reviews/MyReviewsPage'
import { pageTitleSegment } from '@/lib/pageTitle'

export const metadata = {
  title: pageTitleSegment('Reviews & feedback'),
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center bg-[#f7f7f5] text-sm text-slate-500">
          Loading…
        </div>
      }
    >
      <MyReviewsPage />
    </Suspense>
  )
}
