'use client'

import Link from 'next/link'
import EcomArcheLayout from './EcomArcheLayout'

const CATEGORY_CARDS = [
  { id: 'phones', name: 'Smartphones', icon: 'fa-mobile-alt', href: '/ecommerce/electronics/phones' },
  { id: 'laptops', name: 'Laptops', icon: 'fa-laptop', href: '/ecommerce/electronics/laptops' },
  { id: 'tv', name: 'TV & Audio', icon: 'fa-tv', href: '/ecommerce/electronics/tv' },
  { id: 'gadgets', name: 'Smart Wear', icon: 'fa-clock', href: '/ecommerce/electronics/gadgets' },
  { id: 'cameras', name: 'Cameras', icon: 'fa-camera', href: '/ecommerce/electronics/gadgets' },
  { id: 'accessories', name: 'Accessories', icon: 'fa-headphones', href: '/ecommerce/electronics/gadgets' },
]

const FEATURED_PRODUCTS = [
  { id: '1', name: 'iPhone 15 Pro', price: 41999, originalPrice: 49999, rating: 4.99, badge: 'Best Seller', badgeColor: 'bg-[#ff6b35]' },
  { id: '2', name: 'Samsung Galaxy', price: 32999, originalPrice: 36999, rating: 4.8, badge: 'New Arrival', badgeColor: 'bg-[#2196F3]' },
  { id: '3', name: 'Dell XPS 13 Laptop', price: 89999, originalPrice: null, rating: 4.95, badge: 'Offer', badgeColor: 'bg-red-500' },
  { id: '4', name: 'Sony WH-1000XM5', price: 24999, originalPrice: 29999, rating: 4.99, badge: null, badgeColor: '' },
  { id: '5', name: 'Smart LED TV 55"', price: 44999, originalPrice: 52999, rating: 4.7, badge: null, badgeColor: '' },
  { id: '6', name: 'Canon EOS Camera', price: 59999, originalPrice: null, rating: 4.85, badge: null, badgeColor: '' },
]

export default function ElectronicsEcomPage() {
  return (
    <EcomArcheLayout>
      {/* Hero Banner - compact, animated bg, horizontal labels, Shop Now scrolls to shop area */}
      <section className="relative bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] text-white overflow-hidden">
        {/* Animated background - runs always without refresh */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-80 h-80 bg-[#ff6b35]/25 rounded-full blur-3xl ecom-hero-float1" />
          <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-[#2196F3]/25 rounded-full blur-3xl ecom-hero-float2" />
          <div className="absolute left-1/2 top-1/2 w-56 h-56 border border-[#ff6b35]/40 rounded-full ecom-hero-ring" />
          <div className="absolute left-1/2 top-1/2 w-32 h-32 border border-[#2196F3]/40 rounded-full ecom-hero-ring" style={{ animationDelay: '-5s' }} />
          <div className="absolute top-1/3 right-1/3 w-40 h-40 bg-[#16c2a5]/15 rounded-full blur-2xl ecom-hero-glow" />
        </div>
        <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6">
          <div className="flex-1">
            <p className="text-[#ff6b35] font-medium text-sm md:text-base mb-0.5" style={{ fontFamily: 'cursive' }}>Welcome to</p>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-1">GatiMitra Ecom Arche</h1>
            <p className="text-base md:text-lg text-white/90 font-semibold mb-3">Electronics Mega Store</p>
            <div className="flex flex-wrap items-center gap-3 md:gap-4 mb-4">
              {['Latest Tech', 'Best Prices', 'Fast Delivery'].map((item) => (
                <span key={item} className="flex items-center gap-1.5 text-white/90 text-sm">
                  <i className="fas fa-check-circle text-[#16c2a5] text-xs" /> {item}
                </span>
              ))}
            </div>
            <a
              href="#shop-area"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#ff6b35] hover:bg-[#ff8451] font-semibold text-white no-underline transition-colors shadow-lg text-sm"
            >
              Shop Now
            </a>
            <div className="flex flex-wrap gap-4 mt-5">
              {[
                { icon: 'fa-money-bill-wave', text: 'COD AVAILABLE UPTO ₹300' },
                { icon: 'fa-truck', text: 'SECURE & RELIABLE DELIVERY' },
                { icon: 'fa-check-double', text: 'QUALITY ASSURED PRODUCTS' },
              ].map(({ icon, text }) => (
                <div key={text} className="flex items-center gap-2 text-white/80 text-xs">
                  <i className={`fas ${icon} text-[#ff6b35]`} /> {text}
                </div>
              ))}
            </div>
          </div>
          <div className="relative flex-shrink-0">
            <div className="relative w-48 h-48 sm:w-56 sm:h-56 md:w-64 md:h-64">
              <img src="/img/add.png" alt="GatiMitra Ecom Arche" className="w-full h-full object-contain drop-shadow-2xl" />
              <div className="absolute -top-1 -right-1 sm:top-1 sm:right-1 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg">
                UP TO 50% OFF
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Category Browsing Cards - shop area (scroll target) */}
      <section id="shop-area" className="max-w-[1400px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 md:py-10 scroll-mt-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 sm:gap-6">
          {CATEGORY_CARDS.map((cat) => (
            <Link
              key={cat.id}
              href={cat.href}
              className="flex flex-col items-center p-6 rounded-2xl bg-[#f8fafc] shadow-md hover:shadow-xl border border-slate-200 transition-all no-underline text-slate-800"
            >
              <div className="w-16 h-16 rounded-xl bg-[#2196F3]/10 flex items-center justify-center mb-3">
                <i className={`fas ${cat.icon} text-[#2196F3] text-2xl`} />
              </div>
              <span className="text-sm font-bold text-center">{cat.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured Products */}
      <section className="max-w-[1400px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-12 pb-16">
        <h2 className="text-2xl sm:text-3xl font-bold text-[#0f172a] mb-1">Featured Products</h2>
        <p className="text-slate-500 text-sm sm:text-base mb-8">Best Deals on Trending Electronics</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6">
          {FEATURED_PRODUCTS.map((product) => (
            <Link
              key={product.id}
              href={`/ecommerce/product/${product.id}`}
              className="group flex flex-col bg-[#f8fafc] rounded-2xl overflow-hidden shadow-md hover:shadow-xl border border-slate-200 transition-all no-underline text-slate-800"
            >
              <div className="relative aspect-square bg-slate-100 flex items-center justify-center p-4">
                <div className="w-20 h-20 rounded-xl bg-slate-200 flex items-center justify-center">
                  <i className="fas fa-mobile-alt text-3xl text-slate-400 group-hover:text-[#2196F3]" />
                </div>
                {product.badge && (
                  <span className={`absolute top-2 left-2 text-[10px] font-bold px-2 py-1 rounded text-white ${product.badgeColor}`}>
                    {product.badge}
                  </span>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-bold text-sm text-[#0f172a] line-clamp-2 mb-2">{product.name}</h3>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg font-extrabold text-[#0f172a]">₹{product.price.toLocaleString('en-IN')}</span>
                  {product.originalPrice && (
                    <span className="text-xs text-slate-400 line-through">₹{product.originalPrice.toLocaleString('en-IN')}</span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-amber-500 text-xs">
                  <i className="fas fa-star" /> {product.rating}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </EcomArcheLayout>
  )
}
