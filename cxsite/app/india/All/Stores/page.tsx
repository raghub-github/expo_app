import { Suspense } from 'react'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import AroundYouPage from '@/components/around-you/AroundYouPage'
import GatiMitraSpinner from '@/components/common/GatiMitraSpinner'

export default function IndiaAllStoresPage() {
  return (
    <main>
      <Header />
      <Suspense
        fallback={
          <div className="flex min-h-[50vh] items-center justify-center bg-[#f3f3f3]">
            <GatiMitraSpinner message="Loading…" />
          </div>
        }
      >
        <AroundYouPage />
      </Suspense>
      <Footer />
    </main>
  )
}
