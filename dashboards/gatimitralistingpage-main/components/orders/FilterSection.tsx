'use client';

import { useState, useEffect, useRef } from 'react';

interface FilterSectionProps {
  filters: {
    category: string[];
    deliveryType: string[];
    userType: string[];
    department: string;
  };
  onFilterChange: (filterType: string, value: string | string[]) => void;
  onApplyFilters: () => void;
  onClearFilters: () => void;
  searchQuery: { type: string; value: string };
  onSearchClear: () => void;
}

export default function FilterSection({
  filters,
  onFilterChange,
  onApplyFilters,
  onClearFilters,
  searchQuery,
  onSearchClear,
}: FilterSectionProps) {
  const [showDeliveryPopup, setShowDeliveryPopup] = useState(false);
  const [showUserTypePopup, setShowUserTypePopup] = useState(false);
  const deliveryRef = useRef<HTMLDivElement>(null);
  const userTypeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (deliveryRef.current && !deliveryRef.current.contains(event.target as Node)) {
        setShowDeliveryPopup(false);
      }
      if (userTypeRef.current && !userTypeRef.current.contains(event.target as Node)) {
        setShowUserTypePopup(false);
      }
    };

    if (showDeliveryPopup || showUserTypePopup) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDeliveryPopup, showUserTypePopup]);

  const categories = ['Food', 'Fashion', 'Grocery', 'Pharma'];
  const deliveryTypes = ['GatiMitra', 'Merchant'];
  const userTypes = ['Premium', 'Very Good', 'Good', 'Bad'];

  const toggleDeliveryType = (type: string) => {
    const current = filters.deliveryType;
    if (current.includes(type)) {
      onFilterChange(
        'deliveryType',
        current.filter((t) => t !== type)
      );
    } else {
      onFilterChange('deliveryType', [...current, type]);
    }
  };

  const toggleUserType = (type: string) => {
    const current = filters.userType;
    if (current.includes(type)) {
      onFilterChange(
        'userType',
        current.filter((t) => t !== type)
      );
    } else {
      onFilterChange('userType', [...current, type]);
    }
  };

  const toggleCategory = (category: string) => {
    const current = filters.category;
    if (current.includes(category)) {
      onFilterChange(
        'category',
        current.filter((c) => c !== category)
      );
    } else {
      onFilterChange('category', [...current, category]);
    }
  };

  // Show selected filters in tags (not applied yet)
  const selectedFilterTags: string[] = [];
  if (filters.category.length > 0) {
    selectedFilterTags.push(...filters.category);
  }
  if (filters.deliveryType.length > 0) {
    selectedFilterTags.push(...filters.deliveryType);
  }
  if (filters.userType.length > 0) {
    selectedFilterTags.push(...filters.userType);
  }

  return (
    <>
      <div className="flex items-center justify-between mb-[25px] p-5 bg-white rounded-lg shadow-default border border-[#E2E8F0] flex-nowrap gap-[15px] w-full relative">
        <div className="flex items-center gap-3 flex-nowrap flex-1 min-w-0 overflow-x-visible">
          {/* Delivery / Pickup - Same categories-filter div */}
          <div className="flex gap-2 bg-neutral-light p-1.5 rounded-md flex-nowrap">
            <div className="relative" ref={deliveryRef}>
              <button
                onClick={() => setShowDeliveryPopup(!showDeliveryPopup)}
                className={`px-8 py-2 border rounded-md font-semibold text-sm whitespace-nowrap relative min-w-[120px] text-left transition-all ${
                  filters.deliveryType.length > 0
                    ? 'bg-primary-mint text-neutral-dark border-primary-mint'
                    : 'bg-white text-neutral-gray border-[#CBD5E1] hover:border-primary-mint'
                }`}
              >
                Delivery{filters.deliveryType.length > 0 ? ` (${filters.deliveryType.length})` : ''}
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-neutral-gray pointer-events-none">
                  ▼
                </span>
              </button>
              {showDeliveryPopup && (
                <div className="absolute top-full left-0 mt-[5px] bg-white rounded-md shadow-hover min-w-[180px] z-[1000] border border-[#E2E8F0] py-2 animate-fadeIn">
                  {deliveryTypes.map((type) => (
                    <div
                      key={type}
                      onClick={() => toggleDeliveryType(type)}
                      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer whitespace-nowrap transition-all ${
                        filters.deliveryType.includes(type)
                          ? 'bg-primary-light text-primary-dark'
                          : 'hover:bg-primary-light'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 border-2 rounded-sm flex items-center justify-center flex-shrink-0 transition-all ${
                          filters.deliveryType.includes(type)
                            ? 'bg-primary-mint border-primary-mint'
                            : 'border-[#CBD5E1]'
                        }`}
                      >
                        {filters.deliveryType.includes(type) && (
                          <span className="text-[10px] font-bold text-neutral-dark">✓</span>
                        )}
                      </div>
                      <span>{type}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => toggleCategory('Pickup')}
              className={`px-4 py-2 rounded-md font-semibold text-sm whitespace-nowrap border transition-all ${
                filters.category.includes('Pickup')
                  ? 'bg-primary-mint text-neutral-dark border-primary-mint'
                  : 'bg-transparent text-neutral-gray border-transparent hover:bg-white hover:border-[#CBD5E1]'
              }`}
            >
              Pickup
            </button>
          </div>

          {/* Categories Filter */}
          <div className="flex gap-2 bg-neutral-light p-1.5 rounded-md flex-nowrap">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => toggleCategory(category)}
                className={`px-4 py-2 rounded-md font-semibold text-sm whitespace-nowrap border transition-all ${
                  filters.category.includes(category)
                    ? 'bg-primary-mint text-neutral-dark border-primary-mint'
                    : 'bg-transparent text-neutral-gray border-transparent hover:bg-white hover:border-[#CBD5E1]'
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          {/* User Type Button */}
          <div className="relative" ref={userTypeRef}>
            <button
              onClick={() => setShowUserTypePopup(!showUserTypePopup)}
              className={`px-8 py-2 border rounded-md font-semibold text-sm whitespace-nowrap relative min-w-[120px] text-left transition-all ${
                filters.userType.length > 0
                  ? 'bg-primary-mint text-neutral-dark border-primary-mint'
                  : 'bg-white text-neutral-gray border-[#CBD5E1] hover:border-primary-mint'
              }`}
            >
              User-Type{filters.userType.length > 0 ? ` (${filters.userType.length})` : ''}
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-neutral-gray pointer-events-none">
                ▼
              </span>
            </button>
            {showUserTypePopup && (
              <div className="absolute top-full left-0 mt-1.5 bg-white rounded-md shadow-hover min-w-[180px] z-[1000] border border-[#E2E8F0] py-1.5 animate-fadeIn">
                {userTypes.map((type) => (
                  <div
                    key={type}
                    onClick={() => toggleUserType(type)}
                    className={`flex items-center gap-2.5 px-3.5 py-2 cursor-pointer whitespace-nowrap transition-all ${
                      filters.userType.includes(type)
                        ? 'bg-primary-light text-primary-dark'
                        : 'hover:bg-primary-light'
                    }`}
                  >
                    <div
                      className={`w-3.5 h-3.5 border-2 rounded-sm flex items-center justify-center flex-shrink-0 transition-all ${
                        filters.userType.includes(type)
                          ? 'bg-primary-mint border-primary-mint'
                          : 'border-[#CBD5E1]'
                      }`}
                    >
                      {filters.userType.includes(type) && (
                        <span className="text-[10px] font-bold text-neutral-dark">✓</span>
                      )}
                    </div>
                    <span>{type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Apply Filter Button */}
          <button
            onClick={onApplyFilters}
            className="bg-gradient-to-r from-[#93e8c8] to-[#5fd3b3] text-[#0f3d2e] font-semibold py-2.5 px-[18px] rounded-[10px] border-2 border-primary-dark shadow-[0_6px_14px_rgba(147,232,200,0.45)] transition-all hover:from-[#04c045] hover:to-[#3fbf9a] hover:text-[#060000] hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(63,191,154,0.55)] hover:border-[#0f3d2e] active:translate-y-0 active:shadow-[0_4px_10px_rgba(63,191,154,0.4)] min-w-[120px] flex-shrink-0 relative overflow-hidden whitespace-nowrap"
          >
            <span className="relative z-10">Apply Filter</span>
          </button>
        </div>

        {/* Applied Filters Tags */}
        <div className="flex gap-2 flex-nowrap items-center flex-1 min-w-0 pl-12 overflow-x-visible">
          {searchQuery.value && (
            <div className="bg-[#E0F2FE] border border-[#7DD3FC] text-[#0369A1] px-4 py-2 rounded-md text-sm font-semibold flex items-center justify-between flex-shrink-0">
              <span>
                Showing search results for : <strong>{searchQuery.value}</strong>
              </span>
              <button
                onClick={onSearchClear}
                className="ml-4 bg-transparent border border-[#7DD3FC] text-[#0369A1] px-3 py-1 rounded text-xs transition-all hover:bg-[#BAE6FD]"
              >
                Clear Search
              </button>
            </div>
          )}
          {selectedFilterTags.map((filter) => (
            <span
              key={filter}
              className="inline-flex items-center gap-1.5 bg-primary-light text-primary-dark px-3 py-1.5 rounded-2xl text-xs font-medium border border-primary-mint/30 whitespace-nowrap flex-shrink-0"
            >
              {filter}
              <button
                onClick={() => {
                  if (filters.category.includes(filter)) {
                    onFilterChange('category', filters.category.filter((c) => c !== filter));
                  } else if (filters.deliveryType.includes(filter)) {
                    onFilterChange('deliveryType', filters.deliveryType.filter((d) => d !== filter));
                  } else if (filters.userType.includes(filter)) {
                    onFilterChange('userType', filters.userType.filter((u) => u !== filter));
                  }
                }}
                className="text-[10px] cursor-pointer hover:bg-black/10 rounded-full p-0.5 transition-all"
              >
                <i className="fas fa-times"></i>
              </button>
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
