'use client'
import { useSession } from "next-auth/react";
import { useState, useEffect } from 'react'
import { Dialog } from '@headlessui/react';
import { DialogBackdrop } from '@headlessui/react';
import { useRouter } from 'next/navigation'
import { ChefHat, ArrowLeft, Search, MapPin, Star, Loader, AlertCircle, User } from 'lucide-react'
import { toast } from 'sonner'
import { fetchAllStores } from '@/lib/database'
import { searchMerchantStore } from '@/lib/searchStore'
import Image from 'next/image'

interface Restaurant {
  id: number
  restaurant_id: string
  restaurant_name: string
  city: string
  avg_rating: number
  total_reviews: number
  is_active: boolean
  is_verified: boolean
  owner_phone?: string
}

export default function SearchPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStatus, setModalStatus] = useState<{ status: string; reason?: string }>({ status: '', reason: '' });
  const [stores, setStores] = useState<any[]>([])
  const [filteredStores, setFilteredStores] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchType, setSearchType] = useState('merchant_id') // 'merchant_id' or 'mobile'
  const [hasSearched, setHasSearched] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)

  // ALL HOOKS MUST BE CALLED UNCONDITIONALLY AND IN THE SAME ORDER
  useEffect(() => {
    if (status === "unauthenticated") {
      setIsRedirecting(true);
      router.push("/auth/login-store");
    }
  }, [status, router]);

  // Load restaurants from Supabase on component mount
  useEffect(() => {
    const loadStores = async () => {
      try {
        const data = await fetchAllStores()
        setStores(data)
      } catch (err) {
        console.error('Error loading stores:', err)
      }
    }

    if (status === "authenticated") {
      loadStores()
    }
  }, [status])

  // Handle search button click
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setError('Please enter a search value')
      return
    }
    setIsLoading(true)
    setError('')
    let filtered: any[] = []
    try {
      if (searchType === 'merchant_id') {
        filtered = stores.filter(store =>
          store.store_id?.toUpperCase().includes(searchQuery.trim().toUpperCase()) ||
          store.store_name?.toUpperCase().includes(searchQuery.trim().toUpperCase())
        )
      } else if (searchType === 'mobile') {
        filtered = stores.filter(store =>
          store.phone?.includes(searchQuery.trim())
        )
      }
      setFilteredStores(filtered)
      setHasSearched(true)
      if (filtered.length === 0) {
        setError('No stores matching your search were found. Please check your details and try again, or contact support if you need further assistance.')
      }
    } catch (err) {
      setError('Error searching stores. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectRestaurant = async (storeId: string) => {
    if (!storeId) {
      setModalStatus({ status: 'ERROR', reason: 'Invalid store ID.' });
      setModalOpen(true);
      return;
    }
    try {
      const res = await fetch(`/api/store-status?store_id=${storeId}`);
      const data = await res.json();
      // Find the selected store's name
      const selectedStore = stores.find((s) => s.store_id === storeId);
      if (selectedStore) {
        localStorage.setItem('selectedRestaurantName', selectedStore.store_name || 'User');
        localStorage.setItem('selectedRestaurantId', selectedStore.store_id || '');
      }
      // Always set correct key and redirect, let dashboard handle modal
      localStorage.setItem('selectedStoreId', storeId);
      router.push('/mx/dashboard');
    } catch (e) {
      setModalStatus({ status: 'ERROR', reason: 'Could not verify store status.' });
      setModalOpen(true);
    }
  }

  const handleLogout = async () => {
    // Implement logout logic here
    // For next-auth: signOut()
    router.push('/auth/login-store');
  }

  // Show loading state
  if (status === "loading" || isRedirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin mx-auto text-blue-600 mb-4" />
          <p className="text-slate-600">Loading authentication...</p>
        </div>
      </div>
    );
  }

  // Show nothing if unauthenticated (will redirect)
  if (status === "unauthenticated") {
    return null;
  }

  // Only render the page if authenticated
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Back</span>
        </button>
        <div className="flex items-center gap-2">
          <ChefHat className="w-6 h-6 text-blue-600" />
          <h1 className="text-xl font-bold text-slate-900">Find Your Store</h1>
        </div>
        
        {/* User Profile Section */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full border-2 border-white" style={{ marginRight: 4 }}></div>
            <div className="text-right">
              <p className="font-medium text-slate-900 text-sm flex items-center gap-1">
                {session?.user?.name ? (
                  <>
                    {session.user.name.charAt(0)}
                    {session.user.name.slice(1)}
                  </>
                ) : 'User'}
              </p>
              <p className="text-xs text-slate-500">
                {session?.user?.email || 'user@example.com'}
              </p>
            </div>
            <div className="relative">
              {session?.user?.image ? (
                <Image
                  src={session.user.image}
                  alt={session.user.name || 'User'}
                  width={40}
                  height={40}
                  className="rounded-full border-2 border-blue-100"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue-100 border-2 border-blue-200 flex items-center justify-center">
                  <User className="w-5 h-5 text-blue-600" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Search Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-slate-900 mb-6">
            Search merchant
          </h2>
          <p className="text-slate-600 mb-6">
            Select from the dropdown for the type of search
          </p>

          {/* Search Form */}
          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              {/* Search Type Dropdown */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Search Type
                </label>
                <select
                  value={searchType}
                  onChange={(e) => {
                    setSearchType(e.target.value)
                    setSearchQuery('')
                    setHasSearched(false)
                  }}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-slate-700 bg-white font-medium"
                >
                  <option value="merchant_id">Merchant ID</option>
                  <option value="mobile">Mobile Number</option>
                </select>
              </div>

              {/* Search Input */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {searchType === 'merchant_id' ? 'Merchant ID or Store Name' : 'Mobile Number'}
                </label>
                <div className="relative">
                  <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(
                      searchType === 'merchant_id'
                        ? e.target.value.toUpperCase()
                        : e.target.value
                    )}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder={searchType === 'merchant_id' ? 'Enter merchant ID or store name...' : 'Enter mobile number...'}
                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-slate-900 placeholder-slate-500"
                  />
                </div>
              </div>

              {/* Search Button */}
              <button
                onClick={handleSearch}
                disabled={isLoading || !searchQuery.trim()}
                className="px-8 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 h-fit w-full"
              >
                {isLoading ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Searching
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    SEARCH
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Results Section */}
        <div>
          {error ? (
            // Error state
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-900">Store not found</h3>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          ) : filteredStores.length === 0 ? (
            <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
              <MapPin className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                No stores found
              </h3>
              <p className="text-slate-600">
                Try adjusting your search criteria
              </p>
            </div>
          ) : (
            <div className="w-[90%] mx-auto">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">
                Available Stores ({filteredStores.length})
              </h3>
              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full border border-slate-200 bg-white" style={{ tableLayout: 'auto', width: '100%' }}>
                  <thead>
                    <tr className="bg-slate-900 text-white whitespace-nowrap">
                      <th className="px-4 py-3 text-left font-semibold">Store Name</th>
                      <th className="px-4 py-3 text-left font-semibold">Store ID</th>
                      <th className="px-4 py-3 text-left font-semibold">Parent ID</th>
                      <th className="px-4 py-3 text-left font-semibold">Status</th>
                      <th className="px-4 py-3 text-left font-semibold">City</th>
                      <th className="px-4 py-3 text-left font-semibold">Postal Code</th>
                      <th className="px-4 py-3 text-center font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredStores.map((store) => (
                      <tr key={store.id} className="bg-white hover:bg-blue-50 transition-colors cursor-pointer text-slate-800 whitespace-nowrap">
                        <td className="px-4 py-3 font-semibold text-blue-700 hover:text-blue-900 hover:underline transition-colors whitespace-normal break-words" style={{ wordBreak: 'break-word', whiteSpace: 'normal', overflow: 'visible', textOverflow: 'unset' }}>
                          <button onClick={() => handleSelectRestaurant(store.store_id)}>{store.store_name}</button>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-700 overflow-hidden text-ellipsis" style={{ maxWidth: 120 }}>
                          <button onClick={() => handleSelectRestaurant(store.store_id)}>{store.store_id}</button>
                        </td>
                        <td className="px-4 py-3 text-slate-700" style={{ maxWidth: 120 }}>
                          {store.parent_id ?? 'N/A'}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900" style={{ maxWidth: 120 }}>
                          {store.approval_status ?? 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-slate-700" style={{ maxWidth: 120 }}>
                          {store.city}
                        </td>
                        <td className="px-4 py-3 text-slate-700" style={{ maxWidth: 100 }}>
                          {store.pincode ?? store.postal_code ?? 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleSelectRestaurant(store.store_id)}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all text-sm"
                          >
                            View Store
                            <ArrowLeft className="w-4 h-4 rotate-180" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal for status */}
      <Dialog open={modalOpen} onClose={() => setModalOpen(false)} className="fixed z-50 inset-0 overflow-y-auto">
        <div className="flex items-center justify-center min-h-screen px-4">
          <DialogBackdrop className="fixed inset-0 bg-black opacity-30" />
          <div className="relative bg-white rounded-lg max-w-md mx-auto p-8 shadow-xl z-10">
            <Dialog.Title className="text-lg font-bold mb-2">Store Status</Dialog.Title>
            <div className="mb-4">
              {modalStatus.status === 'SUBMITTED' && <span className="text-blue-600 font-semibold">Your store is submitted and under review.</span>}
              {modalStatus.status === 'UNDER_VERIFICATION' && <span className="text-yellow-600 font-semibold">Your store is under verification.</span>}
              {modalStatus.status === 'REJECTED' && <span className="text-red-600 font-semibold">Your store registration was rejected.</span>}
              {modalStatus.status === 'ERROR' && <span className="text-red-600 font-semibold">{modalStatus.reason}</span>}
              {/* Fallback for unknown status */}
              {modalStatus.status && !['SUBMITTED','UNDER_VERIFICATION','REJECTED','ERROR'].includes(modalStatus.status) && (
                <span className="text-gray-700 font-semibold">Store status: {modalStatus.status}{modalStatus.reason ? ` - ${modalStatus.reason}` : ''}</span>
              )}
              {modalStatus.reason && modalStatus.status === 'REJECTED' && (
                <div className="mt-2 text-sm text-gray-700">Reason: {modalStatus.reason}</div>
              )}
            </div>
            <button 
              onClick={() => setModalOpen(false)} 
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}