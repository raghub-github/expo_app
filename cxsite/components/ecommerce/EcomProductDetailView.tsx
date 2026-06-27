'use client'

import Link from 'next/link'
import EcomArcheLayout from './EcomArcheLayout'

const PRODUCTS: Record<string, { name: string; price: number; originalPrice: number | null; rating: number; description: string }> = {
  '1': { name: 'iPhone 15 Pro', price: 41999, originalPrice: 49999, rating: 4.99, description: 'Latest Apple flagship with A17 Pro chip, titanium design, and advanced camera system. Best-in-class display and battery life.' },
  '2': { name: 'Samsung Galaxy', price: 32999, originalPrice: 36999, rating: 4.8, description: 'Premium Android experience with stunning display, versatile cameras, and long-lasting battery. One UI and DeX support.' },
  '3': { name: 'Dell XPS 13 Laptop', price: 89999, originalPrice: null, rating: 4.95, description: 'Ultra-portable powerhouse with Intel Core processor, stunning InfinityEdge display, and premium build. Ideal for work and creativity.' },
  '4': { name: 'Sony WH-1000XM5', price: 24999, originalPrice: 29999, rating: 4.99, description: 'Industry-leading noise cancellation, exceptional sound quality, and all-day comfort. Premium wireless headphones.' },
  '5': { name: 'Smart LED TV 55"', price: 44999, originalPrice: 52999, rating: 4.7, description: '4K UHD Smart TV with HDR, built-in streaming apps, and immersive audio. Perfect for movies and gaming.' },
  '6': { name: 'Canon EOS Camera', price: 59999, originalPrice: null, rating: 4.85, description: 'Professional-grade mirrorless camera with superb image quality, fast autofocus, and 4K video. For enthusiasts and pros.' },
}

export default function EcomProductDetailView({ productId }: { productId: string }) {
  const product = PRODUCTS[productId] ?? {
    name: 'Product',
    price: 0,
    originalPrice: null,
    rating: 0,
    description: 'Product details coming soon.',
  }

  return (
    <EcomArcheLayout>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4 pb-10 bg-[#f1f5f9] min-h-[50vh]">
        <Link
          href="/ecommerce"
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#ff6b35] hover:text-[#ff8451] no-underline mb-4"
        >
          <i className="fas fa-arrow-left" /> Back to GatiMitra Ecom Arche
        </Link>

        <div className="bg-[#f8fafc] rounded-xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 p-4 sm:p-5">
            {/* Product image area - compact */}
            <div className="aspect-square max-h-[260px] md:max-h-none rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
              <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-lg bg-slate-200 flex items-center justify-center">
                <i className="fas fa-mobile-alt text-4xl sm:text-5xl text-slate-400" />
              </div>
            </div>

            {/* Product info - tighter spacing */}
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a] mb-1">{product.name}</h1>
              <div className="flex items-center gap-1.5 text-amber-500 text-xs mb-2">
                <i className="fas fa-star" /> {product.rating} rating
              </div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-xl sm:text-2xl font-extrabold text-[#0f172a]">
                  ₹{product.price.toLocaleString('en-IN')}
                </span>
                {product.originalPrice != null && (
                  <span className="text-sm text-slate-400 line-through">
                    ₹{product.originalPrice.toLocaleString('en-IN')}
                  </span>
                )}
              </div>
              <p className="text-slate-600 text-xs sm:text-sm mb-3 leading-snug">{product.description}</p>
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#0f172a]/5 text-[#0f172a] text-xs">
                  <i className="fas fa-truck text-[#ff6b35]" /> Free delivery
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#0f172a]/5 text-[#0f172a] text-xs">
                  <i className="fas fa-shield-alt text-[#ff6b35]" /> 1 year warranty
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#0f172a]/5 text-[#0f172a] text-xs">
                  <i className="fas fa-undo text-[#ff6b35]" /> Easy returns
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="px-5 py-2.5 rounded-lg bg-[#ff6b35] hover:bg-[#ff8451] font-semibold text-white text-sm transition-colors shadow-md"
                >
                  Add to Cart
                </button>
                <button
                  type="button"
                  className="px-5 py-2.5 rounded-lg border-2 border-[#0f172a] text-[#0f172a] text-sm font-semibold hover:bg-[#0f172a]/5 transition-colors"
                >
                  Buy Now
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </EcomArcheLayout>
  )
}
