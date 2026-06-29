'use client'

import { useState, useEffect, useRef } from 'react'
import { useLocationContext } from '@/components/providers/LocationProvider'
import { getRestaurantGeoQueryString } from '@/lib/buildRestaurantGeoQuery'

interface SearchProps {
  placeholder?: string;
  onSelect?: (item: any) => void;
  className?: string;
  inputClassName?: string;
}


export default function Search({ 
  placeholder = "🔍 Search for dishes, categories, restaurants…",
  onSelect,
  className = "",
  inputClassName = ""
}: SearchProps) {
  const [localQuery, setLocalQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const { location } = useLocationContext()
  const searchGeoQs = getRestaurantGeoQueryString(location)

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(localQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [localQuery])

  // Fetch search results from API
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([])
      setShowSuggestions(false)
      return
    }
    setLoading(true)
    setShowSuggestions(true)
    fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}${searchGeoQs ? `&${searchGeoQs}` : ''}`)
      .then(res => res.json())
      .then(data => {
        setResults(data || [])
        setLoading(false)
      })
      .catch(() => {
        setResults([])
        setLoading(false)
      })
  }, [debouncedQuery, searchGeoQs])

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setLocalQuery(value)
  }

  const handleSelect = (item: any) => {
    setLocalQuery(item.item_name || '')
    setShowSuggestions(false)
    if (onSelect) {
      onSelect(item)
    }
  }

  return (
    <div ref={searchRef} className={`relative ${className}`}>
      <input
        type="text"
        value={localQuery}
        onChange={handleInputChange}
        placeholder={placeholder}
        className={`w-full border-none outline-none px-[26px] py-[22px] text-base bg-transparent text-text placeholder:text-[rgba(30,30,47,0.55)] ${inputClassName}`}
        onFocus={() => {
          if (results.length > 0) {
            setShowSuggestions(true)
          }
        }}
      />

      {showSuggestions && (results.length > 0 || loading) && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 max-h-96 overflow-y-auto">
          {loading && (
            <div className="px-6 py-4 text-center text-gray-400">Searching…</div>
          )}
          {!loading && results.map((item, index) => (
            <div
              key={index}
              onClick={() => handleSelect(item)}
              className="px-6 py-4 hover:bg-purple-light cursor-pointer transition-colors border-b border-gray-100 last:border-b-0"
            >
              <div className="flex items-center gap-3">
                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt={item.item_name}
                    className="w-12 h-12 rounded-lg object-cover"
                  />
                )}
                <div className="flex-1">
                  <div className="font-semibold text-text">{item.item_name}</div>
                  {item.category && (
                    <div className="text-sm text-text-light">{item.category}</div>
                  )}
                  {item.category_item && (
                    <div className="text-xs text-gray-400">{item.category_item}</div>
                  )}
                  {item.price && (
                    <div className="text-xs text-gray-500 mt-1">₹{item.price}</div>
                  )}
                  {typeof item.score !== 'undefined' && (
                    <div className="text-xs text-green-600 mt-1">Score: {item.score}</div>
                  )}
                </div>
                {item.score === 100 && (
                  <span className="px-2 py-1 bg-mint-light text-purple text-xs font-bold rounded-full">
                    Exact Match
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showSuggestions && !loading && debouncedQuery && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 p-6 text-center">
          <div className="text-text-light">No results found for &quot;{debouncedQuery}&quot;</div>
        </div>
      )}
    </div>
  )
}

