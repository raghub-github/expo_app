import { Suspense } from 'react'
import GroceryPage from '@/components/grocery/GroceryPage'
import GatiMitraSpinner from '@/components/common/GatiMitraSpinner'
import { pageTitleSegment } from '@/lib/pageTitle'

export const metadata = {
  title: pageTitleSegment('Grocery'),
  description:
    'Browse groceries from local stores on GatiMitra — daily essentials, pantry staples, and more delivered to your door.',
}

function GroceryLoading() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <GatiMitraSpinner message="Loading grocery..." />
    </div>
  )
}

export default function GroceryRoutePage() {
  return (
    <Suspense fallback={<GroceryLoading />}>
      <GroceryPage />
    </Suspense>
  )
}
