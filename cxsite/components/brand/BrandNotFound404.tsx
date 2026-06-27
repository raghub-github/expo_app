'use client'

import { useRouter } from 'next/navigation'

export default function BrandNotFound404() {
  const router = useRouter()

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="max-w-6xl w-full grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 items-center">
        <div className="relative h-80 md:h-[500px] rounded-3xl overflow-hidden shadow-2xl">
          <img
            src="/img/wrong.png"
            alt="Wrong turn illustration"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
        </div>

        <div className="text-center md:text-left space-y-6">
          <div>
            <h2 className="text-4xl md:text-5xl font-black text-gray-900 mb-2">
              Oops,
            </h2>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-2">
              Brand Not Found!
            </h1>
            <div className="text-8xl md:text-9xl font-black text-gray-900 opacity-10 -mt-6 -mb-4">
              404
            </div>
          </div>

          <p className="text-gray-600 text-lg leading-relaxed">
            Looks like we couldn&apos;t find details for this brand!
            Let&apos;s take you back to discover more amazing brands and stores.
          </p>

          <div className="space-y-4 pt-4">
            <button
              onClick={() => router.push('/')}
              className="inline-flex items-center gap-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-bold py-4 px-10 rounded-2xl text-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 active:translate-y-0 shadow-lg"
            >
              <span>Back to Brands</span>
              <i className="fas fa-home text-xl"></i>
            </button>

            <p className="text-gray-500 text-sm italic">
              Discover top brands across food, fashion, and online stores
            </p>
          </div>

          <div className="mt-10 pt-8 border-t border-gray-200">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shadow-md">
                  <i className="fas fa-utensils text-green-600 text-lg"></i>
                </div>
                <div>
                  <span className="text-sm font-semibold text-gray-700 block">Food Brands</span>
                  <span className="text-xs text-gray-500">Delivery & Restaurants</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shadow-md">
                  <i className="fas fa-tshirt text-blue-600 text-lg"></i>
                </div>
                <div>
                  <span className="text-sm font-semibold text-gray-700 block">Fashion Brands</span>
                  <span className="text-xs text-gray-500">Clothing & Accessories</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center shadow-md">
                  <i className="fas fa-shopping-bag text-purple-600 text-lg"></i>
                </div>
                <div>
                  <span className="text-sm font-semibold text-gray-700 block">Online Brands</span>
                  <span className="text-xs text-gray-500">E-commerce & Services</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
