'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { MXLayoutWhite } from '@/components/MXLayoutWhite'
import { fetchRestaurantById, fetchRestaurantByName } from '@/lib/database'
import { Restaurant } from '@/lib/types'
import { DEMO_RESTAURANT_ID } from '@/lib/constants'
import {
  useMerchantWallet,
  useMerchantLedger,
  useMerchantBankAccounts,
  usePayoutRequestMutation,
  useInvalidateBankAccounts,
} from '@/hooks/useMerchantApi'
import {
  Wallet,
  ArrowDownToLine,
  X,
  Filter,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  TrendingUp,
  TrendingDown,
  Calendar,
  FileText,
  Building2,
  CreditCard,
  Plus,
  Check,
  Ban,
  ChevronDown,
  ChevronUp,
  Package,
  User,
  FileImage,
} from 'lucide-react'
import { PageSkeletonGeneric } from '@/components/PageSkeleton'
import { Toaster, toast } from 'sonner'
import { MobileHamburgerButton } from '@/components/MobileHamburgerButton'

export const dynamic = 'force-dynamic'

const LEDGER_CATEGORIES = [
  'ORDER_EARNING',
  'ORDER_ADJUSTMENT',
  'REFUND_REVERSAL',
  'FAILED_WITHDRAWAL_REVERSAL',
  'BONUS',
  'CASHBACK',
  'MANUAL_CREDIT',
  'SUBSCRIPTION_REFUND',
  'WITHDRAWAL',
  'PENALTY',
  'SUBSCRIPTION_FEE',
  'COMMISSION_DEDUCTION',
  'ADJUSTMENT',
  'REFUND_TO_CUSTOMER',
  'MANUAL_DEBIT',
  'TAX_ADJUSTMENT',
] as const

interface WalletSummary {
  available_balance: number
  pending_balance: number
  today_earning: number
  yesterday_earning: number
  total_earned: number
  total_withdrawn: number
  pending_withdrawal_total: number
}

interface BankAccount {
  id: number
  account_holder_name: string
  account_number_masked: string | null
  ifsc_code: string
  bank_name: string
  upi_id: string | null
  is_primary: boolean
  is_active: boolean
  is_disabled: boolean
  payout_method: string
}

interface LedgerEntry {
  id: number
  direction: 'CREDIT' | 'DEBIT'
  category: string
  balance_type: string
  amount: number
  balance_after: number
  reference_type: string
  reference_id: number | null
  reference_extra: string | null
  description: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  order_id: number | null
  formatted_order_id: string | null
  table_id: string | null
}

interface OrderDetailItem {
  id: number
  item_name: string
  item_title: string | null
  quantity: number
  unit_price: number
  total_price: number
  item_type: string | null
}

interface OrderDetailRider {
  id: number
  rider_id: number
  rider_name: string | null
  rider_mobile: string | null
  assignment_status: string
  assigned_at: string | null
  accepted_at: string | null
  rejected_at: string | null
  reached_merchant_at: string | null
  picked_up_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
}

function formatCategory(cat: string): string {
  return cat.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

function PaymentsContent() {
  const searchParams = useSearchParams()
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [showWithdrawal, setShowWithdrawal] = useState(false)
  const [withdrawalAmount, setWithdrawalAmount] = useState('')
  const [isWithdrawing, setIsWithdrawing] = useState(false)

  const [ledgerLimit] = useState(50)
  const [ledgerOffset, setLedgerOffset] = useState(0)
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterDirection, setFilterDirection] = useState<'all' | 'CREDIT' | 'DEBIT'>('all')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterSearch, setFilterSearch] = useState('')

  const [bankSectionExpanded, setBankSectionExpanded] = useState(false)

  const { data: wallet, isLoading: walletLoading } = useMerchantWallet(storeId)
  const ledgerParams = useMemo(() => ({
    limit: ledgerLimit,
    offset: ledgerOffset,
    from: filterFrom || undefined,
    to: filterTo || undefined,
    direction: filterDirection !== 'all' ? filterDirection : undefined,
    category: filterCategory || undefined,
    search: filterSearch || undefined,
  }), [ledgerLimit, ledgerOffset, filterFrom, filterTo, filterDirection, filterCategory, filterSearch])
  const { data: ledgerData, isLoading: ledgerLoading } = useMerchantLedger(storeId, ledgerParams)
  const ledger = ledgerData?.entries ?? []
  const ledgerTotal = ledgerData?.total ?? 0
  const { data: bankAccounts = [], isLoading: bankAccountsLoading } = useMerchantBankAccounts(storeId, { enabled: bankSectionExpanded || showWithdrawal })
  const payoutMutation = usePayoutRequestMutation()
  const invalidateBankAccounts = useInvalidateBankAccounts()

  const [showAddBank, setShowAddBank] = useState(false)
  const [bankActionLoading, setBankActionLoading] = useState<number | null>(null)
  const [withdrawBankId, setWithdrawBankId] = useState<number | ''>('')
  const [addBankForm, setAddBankForm] = useState({
    payout_method: 'bank' as 'bank' | 'upi',
    account_holder_name: '',
    account_number: '',
    ifsc_code: '',
    bank_name: '',
    branch_name: '',
    upi_id: '',
    bank_proof_type: '' as '' | 'passbook' | 'cancelled_cheque' | 'bank_statement',
    bank_proof_file_url: '',
  })
  const [bankProofFile, setBankProofFile] = useState<File | null>(null)
  const [bankProofUploading, setBankProofUploading] = useState(false)
  const [addBankSubmitting, setAddBankSubmitting] = useState(false)

  const [payoutQuote, setPayoutQuote] = useState<{ requested_amount: number; commission_percentage: number; commission_amount: number; gst_on_commission_percent: number; gst_on_commission: number; tds_amount: number; tax_amount: number; net_payout_amount: number } | null>(null)
  const [payoutQuoteLoading, setPayoutQuoteLoading] = useState(false)

  const [expandedLedgerId, setExpandedLedgerId] = useState<number | null>(null)
  const [expandedRidersLedgerId, setExpandedRidersLedgerId] = useState<number | null>(null)
  const [orderDetailsCache, setOrderDetailsCache] = useState<Record<number, { items: OrderDetailItem[]; riders: OrderDetailRider[] }>>({})
  const [orderDetailsLoading, setOrderDetailsLoading] = useState<number | null>(null)
  const [payoutDetailsCache, setPayoutDetailsCache] = useState<Record<number, { payout: { id: number; amount: number; net_payout_amount: number; commission_percentage: number; commission_amount: number; status: string; utr_reference: string | null; requested_at: string }; bank: { account_holder_name: string; account_number_masked: string | null; bank_name: string; payout_method: string; upi_id: string | null; ifsc_code?: string | null } | null }>>({})
  const [payoutDetailsLoading, setPayoutDetailsLoading] = useState<number | null>(null)

  useEffect(() => {
    const id = searchParams?.get('restaurantId') ?? searchParams?.get('storeId')
      ?? (typeof window !== 'undefined' ? localStorage.getItem('selectedStoreId') ?? localStorage.getItem('selectedRestaurantId') : null)
      ?? DEMO_RESTAURANT_ID
    setStoreId(id)
  }, [searchParams])

  useEffect(() => {
    if (!storeId) return
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      try {
        let data = await fetchRestaurantById(storeId)
        if (!data && !storeId.match(/^GMM\d{4}$/)) {
          data = await fetchRestaurantByName(storeId)
        }
        if (data) setRestaurant(data as unknown as Restaurant)
      } catch (e) {
        console.error('Error loading payments:', e)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [storeId])

  useEffect(() => {
    if (bankAccounts.length === 0) return
    const defaultAcc = bankAccounts.find((a) => a.is_primary && !a.is_disabled) ?? bankAccounts.find((a) => !a.is_disabled) ?? bankAccounts[0]
    const currentInvalid = withdrawBankId !== '' && !bankAccounts.some((a) => a.id === withdrawBankId && !a.is_disabled)
    if (defaultAcc && (withdrawBankId === '' || currentInvalid)) setWithdrawBankId(defaultAcc.id)
  }, [bankAccounts, withdrawBankId])

  useEffect(() => {
    if (!showWithdrawal || !storeId) {
      setPayoutQuote(null)
      return
    }
    const amount = parseFloat(withdrawalAmount)
    if (isNaN(amount) || amount < 100) {
      setPayoutQuote(null)
      return
    }
    let cancelled = false
    setPayoutQuoteLoading(true)
    setPayoutQuote(null)
    fetch(`/api/merchant/payout-quote?storeId=${encodeURIComponent(storeId)}&amount=${amount}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (data.success && data.requested_amount != null) {
          setPayoutQuote({
            requested_amount: data.requested_amount ?? amount,
            commission_percentage: data.commission_percentage ?? 0,
            commission_amount: data.commission_amount ?? 0,
            gst_on_commission_percent: data.gst_on_commission_percent ?? 18,
            gst_on_commission: data.gst_on_commission ?? 0,
            tds_amount: data.tds_amount ?? 0,
            tax_amount: data.tax_amount ?? 0,
            net_payout_amount: data.net_payout_amount ?? amount,
          })
        } else {
          setPayoutQuote(null)
        }
      })
      .catch(() => { if (!cancelled) setPayoutQuote(null) })
      .finally(() => { if (!cancelled) setPayoutQuoteLoading(false) })
    return () => { cancelled = true }
  }, [showWithdrawal, storeId, withdrawalAmount])

  const applyFilters = () => {
    setLedgerOffset(0)
  }

  const clearFilters = () => {
    setFilterFrom('')
    setFilterTo('')
    setFilterDirection('all')
    setFilterCategory('')
    setFilterSearch('')
    setLedgerOffset(0)
  }

  const handleWithdrawal = async () => {
    const amount = parseFloat(withdrawalAmount)
    if (!storeId || isNaN(amount) || amount < 100) {
      toast.error('Enter a valid amount (min ₹100)')
      return
    }
    const available = wallet?.available_balance ?? 0
    if (available < 100) {
      toast.error('Available balance is below the minimum withdrawal (₹100).')
      return
    }
    if (amount > available) {
      toast.error('Requested amount exceeds your available balance.')
      return
    }
    const bankId = withdrawBankId === '' ? null : Number(withdrawBankId)
    if (bankId == null || !bankAccounts.some((a) => a.id === bankId && !a.is_disabled)) {
      toast.error('Select a bank account')
      return
    }
    setIsWithdrawing(true)
    try {
      await payoutMutation.mutateAsync({ storeId, amount, bank_account_id: bankId })
      setWithdrawalAmount('')
      setShowWithdrawal(false)
      setPayoutQuote(null)
      toast.success('Withdrawal request submitted. You will receive the net amount in 2–3 business days.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Request failed. Please try again.')
    } finally {
      setIsWithdrawing(false)
    }
  }

  const fetchOrderDetails = useCallback(async (orderId: number) => {
    if (!storeId) return
    setOrderDetailsLoading(orderId)
    try {
      const res = await fetch(`/api/merchant/order-details?orderId=${orderId}&storeId=${encodeURIComponent(storeId)}`)
      const data = await res.json()
      if (data.success) {
        setOrderDetailsCache((prev) => ({ ...prev, [orderId]: { items: data.items ?? [], riders: data.riders ?? [] } }))
      } else {
        setOrderDetailsCache((prev) => ({ ...prev, [orderId]: { items: [], riders: [] } }))
      }
    } catch {
      setOrderDetailsCache((prev) => ({ ...prev, [orderId]: { items: [], riders: [] } }))
    } finally {
      setOrderDetailsLoading(null)
    }
  }, [storeId])

  const fetchPayoutDetails = useCallback(async (payoutRequestId: number) => {
    if (!storeId) return
    setPayoutDetailsLoading(payoutRequestId)
    try {
      const res = await fetch(`/api/merchant/payout-request/${payoutRequestId}?storeId=${encodeURIComponent(storeId)}`)
      const data = await res.json()
      if (data.success && data.payout) {
        setPayoutDetailsCache((prev) => ({
          ...prev,
          [payoutRequestId]: {
            payout: {
              id: data.payout.id,
              amount: data.payout.amount,
              net_payout_amount: data.payout.net_payout_amount,
              commission_percentage: data.payout.commission_percentage,
              commission_amount: data.payout.commission_amount,
              status: data.payout.status,
              utr_reference: data.payout.utr_reference ?? null,
              requested_at: data.payout.requested_at,
            },
            bank: data.bank ?? null,
          },
        }))
      } else {
        setPayoutDetailsCache((prev) => ({ ...prev, [payoutRequestId]: { payout: data.payout ?? {}, bank: null } }))
      }
    } catch {
      setPayoutDetailsCache((prev) => ({ ...prev, [payoutRequestId]: { payout: {} as never, bank: null } }))
    } finally {
      setPayoutDetailsLoading(null)
    }
  }, [storeId])

  const toggleExpand = (entry: LedgerEntry) => {
    if (expandedLedgerId === entry.id) {
      setExpandedLedgerId(null)
      setExpandedRidersLedgerId(null)
      return
    }
    setExpandedLedgerId(entry.id)
    setExpandedRidersLedgerId(null)
    if (entry.order_id != null && !orderDetailsCache[entry.order_id]) fetchOrderDetails(entry.order_id)
    if (entry.category === 'WITHDRAWAL' && entry.reference_id != null && !payoutDetailsCache[entry.reference_id]) fetchPayoutDetails(entry.reference_id)
  }

  const toggleRidersExpand = (ledgerId: number) => {
    setExpandedRidersLedgerId((prev) => (prev === ledgerId ? null : ledgerId))
  }

  const handleAddBank = async () => {
    const { payout_method, account_holder_name, account_number, ifsc_code, bank_name, branch_name, upi_id, bank_proof_type } = addBankForm
    if (!account_holder_name.trim() || !account_number.trim()) {
      toast.error('Account holder name and account number are required')
      return
    }
    if (payout_method === 'bank' && (!ifsc_code.trim() || !bank_name.trim())) {
      toast.error('IFSC and bank name are required for bank account')
      return
    }
    if (payout_method === 'upi' && !upi_id.trim()) {
      toast.error('UPI ID is required for UPI')
      return
    }
    const proofType = bank_proof_type === 'passbook' || bank_proof_type === 'cancelled_cheque' || bank_proof_type === 'bank_statement' ? bank_proof_type : null
    if (!proofType) {
      toast.error('Please select proof type (passbook, cancelled cheque, or bank statement)')
      return
    }
    if (!bankProofFile) {
      toast.error('Please upload cancelled cheque, bank statement, or passbook')
      return
    }
    if (!storeId) return
    setAddBankSubmitting(true)
    setBankProofUploading(true)
    let bankProofUrl = addBankForm.bank_proof_file_url
    try {
      const ext = bankProofFile.name.split('.').pop()?.toLowerCase() || 'pdf'
      const parent = `merchants/${storeId}/bank`
      const filename = `proof_${Date.now()}.${ext}`
      const formData = new FormData()
      formData.append('file', bankProofFile)
      formData.append('parent', parent)
      formData.append('filename', filename)
      const uploadRes = await fetch('/api/upload/r2', { method: 'POST', body: formData })
      const uploadData = await uploadRes.json()
      if (!uploadRes.ok || !uploadData.url) {
        toast.error(uploadData.error || 'Upload failed')
        setBankProofUploading(false)
        setAddBankSubmitting(false)
        return
      }
      bankProofUrl = uploadData.url
      setBankProofUploading(false)
      const res = await fetch('/api/merchant/bank-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          payout_method,
          account_holder_name: account_holder_name.trim(),
          account_number: (payout_method === 'upi' && !account_number.trim() ? upi_id.trim() : account_number.trim()) || upi_id.trim(),
          ifsc_code: ifsc_code.trim() || undefined,
          bank_name: bank_name.trim() || undefined,
          branch_name: branch_name.trim() || undefined,
          upi_id: payout_method === 'upi' ? upi_id.trim() : undefined,
          bank_proof_type: proofType,
          bank_proof_file_url: bankProofUrl,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Bank/UPI account added')
        setShowAddBank(false)
        setAddBankForm({ payout_method: 'bank', account_holder_name: '', account_number: '', ifsc_code: '', bank_name: '', branch_name: '', upi_id: '', bank_proof_type: '', bank_proof_file_url: '' })
        setBankProofFile(null)
        if (storeId) invalidateBankAccounts(storeId)
      } else {
        toast.error(data.error || 'Failed to add')
      }
    } catch {
      toast.error('Failed to add account')
      setBankProofUploading(false)
    } finally {
      setAddBankSubmitting(false)
    }
  }

  const displayName = (restaurant as { store_name?: string })?.store_name ?? (restaurant as Restaurant)?.restaurant_name

  if (isLoading) {
    return (
      <MXLayoutWhite restaurantName={displayName} restaurantId={storeId || ''}>
        <PageSkeletonGeneric />
      </MXLayoutWhite>
    )
  }

  return (
    <>
      <Toaster />
      <MXLayoutWhite restaurantName={displayName} restaurantId={storeId || DEMO_RESTAURANT_ID}>
        <div className="min-h-screen bg-[#f8fafc] px-4 sm:px-6 lg:px-8 py-6">
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <MobileHamburgerButton />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Payments & Ledger</h1>
                    <Link
                      href={storeId ? `/mx/refund-policy?storeId=${encodeURIComponent(storeId)}` : '/mx/refund-policy'}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-medium hover:bg-indigo-100 transition-colors"
                    >
                      <FileText size={14} />
                      View refund policy
                    </Link>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">Wallet balance and full transaction history</p>
                </div>
              </div>
              <button
                onClick={() => setShowWithdrawal(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition-colors"
              >
                <ArrowDownToLine size={18} />
                Withdraw
              </button>
            </div>

            {/* Wallet summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-2xl p-5 text-white shadow-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-emerald-100 text-xs font-medium uppercase tracking-wide">Available balance</p>
                    {walletLoading ? (
                      <div className="h-9 w-32 mt-2 bg-white/20 rounded animate-pulse" />
                    ) : (
                      <p className="text-2xl font-bold mt-1">
                        ₹{(wallet?.available_balance ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    )}
                  </div>
                  <Wallet size={40} className="text-white/30" />
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-orange-200/80 p-5 shadow-sm">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Today&apos;s earning</p>
                {walletLoading ? (
                  <div className="h-8 w-24 mt-2 bg-gray-100 rounded animate-pulse" />
                ) : (
                  <p className="text-xl font-bold text-orange-600 mt-1">
                    ₹{(wallet?.today_earning ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                )}
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Yesterday&apos;s earning</p>
                {walletLoading ? (
                  <div className="h-8 w-24 mt-2 bg-gray-100 rounded animate-pulse" />
                ) : (
                  <p className="text-xl font-bold text-slate-700 mt-1">
                    ₹{(wallet?.yesterday_earning ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                )}
              </div>
              <div className="bg-white rounded-2xl border border-violet-200/80 p-5 shadow-sm">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pending</p>
                {walletLoading ? (
                  <div className="h-8 w-24 mt-2 bg-gray-100 rounded animate-pulse" />
                ) : (
                  <p className="text-xl font-bold text-violet-700 mt-1">
                    ₹{(wallet?.pending_balance ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                )}
              </div>
              <div className="bg-white rounded-2xl border border-amber-200/80 p-5 shadow-sm">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pending withdrawal</p>
                {walletLoading ? (
                  <div className="h-8 w-24 mt-2 bg-gray-100 rounded animate-pulse" />
                ) : (
                  <p className="text-xl font-bold text-amber-700 mt-1">
                    ₹{(wallet?.pending_withdrawal_total ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                )}
                <p className="text-[10px] text-gray-500 mt-1">In process</p>
              </div>
            </div>

            {/* Bank / UPI – collapsed by default; click to view existing or add */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => setBankSectionExpanded((e) => !e)}
                className="w-full px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 text-left hover:bg-gray-50/80 transition-colors"
              >
                <div className="flex items-center gap-2 text-gray-700 font-medium">
                  <Building2 size={18} />
                  Bank & UPI accounts
                </div>
                <span className="text-sm text-gray-500">
                  {bankSectionExpanded ? 'Hide' : 'View or add accounts for withdrawals'}
                </span>
                {bankSectionExpanded ? <ChevronUp size={20} className="text-gray-500" /> : <ChevronDown size={20} className="text-gray-500" />}
              </button>
              {bankSectionExpanded && (
              <div className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <span className="text-sm text-gray-600">Manage payout accounts</span>
                  <button
                    onClick={() => { setBankProofFile(null); setAddBankForm((f) => ({ ...f, bank_proof_type: '', bank_proof_file_url: '' })); setShowAddBank(true); }}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                  >
                    <Plus size={16} />
                    Add bank / UPI
                  </button>
                </div>
                {bankAccountsLoading ? (
                  <div className="flex items-center justify-center py-8 text-gray-500">
                    <Loader2 size={24} className="animate-spin mr-2" />
                    Loading...
                  </div>
                ) : bankAccounts.length === 0 ? (
                  <p className="text-sm text-gray-500 py-4">No bank or UPI account added. Add one to withdraw.</p>
                ) : (
                  <div className="space-y-3">
                    {bankAccounts.map((acc) => (
                      <div
                        key={acc.id}
                        className={`flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border ${acc.is_disabled ? 'bg-gray-50 border-gray-200' : 'bg-gray-50/50 border-gray-200'}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-white border border-gray-200">
                            {acc.payout_method === 'upi' ? <CreditCard size={20} className="text-violet-600" /> : <Building2 size={20} className="text-blue-600" />}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{acc.account_holder_name}</p>
                            <p className="text-sm text-gray-600">
                              {acc.payout_method === 'upi' ? (acc.upi_id || '—') : `${acc.account_number_masked || '****'} · ${acc.bank_name}`}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              {acc.is_primary && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Default</span>
                              )}
                              {acc.is_disabled && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">Disabled</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!acc.is_primary && !acc.is_disabled && (
                            <button
                              onClick={async () => {
                                setBankActionLoading(acc.id)
                                try {
                                  const res = await fetch(`/api/merchant/bank-accounts/${acc.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ storeId, set_default: true }),
                                  })
                                  const data = await res.json()
                                  if (data.success) {
                                    toast.success('Set as default')
                                    if (storeId) invalidateBankAccounts(storeId)
                                  } else toast.error(data.error || 'Failed')
                                } catch {
                                  toast.error('Failed')
                                } finally {
                                  setBankActionLoading(null)
                                }
                              }}
                              disabled={bankActionLoading !== null}
                              className="text-xs font-medium text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded border border-emerald-200 hover:bg-emerald-50"
                            >
                              {bankActionLoading === acc.id ? <Loader2 size={14} className="animate-spin" /> : 'Set default'}
                            </button>
                          )}
                          {!acc.is_disabled && (
                            <button
                              onClick={async () => {
                                if (!confirm('Disable this account? It cannot be removed, but you can re-enable later.')) return
                                setBankActionLoading(acc.id)
                                try {
                                  const res = await fetch(`/api/merchant/bank-accounts/${acc.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ storeId, set_disabled: true }),
                                  })
                                  const data = await res.json()
                                  if (data.success) {
                                    toast.success('Account disabled')
                                    if (storeId) invalidateBankAccounts(storeId)
                                  } else toast.error(data.error || 'Failed')
                                } catch {
                                  toast.error('Failed')
                                } finally {
                                  setBankActionLoading(null)
                                }
                              }}
                              disabled={bankActionLoading !== null}
                              className="text-xs font-medium text-amber-600 hover:text-amber-700 px-2 py-1 rounded border border-amber-200 hover:bg-amber-50 flex items-center gap-1"
                            >
                              <Ban size={12} /> Disable
                            </button>
                          )}
                          {acc.is_disabled && (
                            <button
                              onClick={async () => {
                                setBankActionLoading(acc.id)
                                try {
                                  const res = await fetch(`/api/merchant/bank-accounts/${acc.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ storeId, set_disabled: false }),
                                  })
                                  const data = await res.json()
                                  if (data.success) {
                                    toast.success('Account enabled')
                                    if (storeId) invalidateBankAccounts(storeId)
                                  } else toast.error(data.error || 'Failed')
                                } catch {
                                  toast.error('Failed')
                                } finally {
                                  setBankActionLoading(null)
                                }
                              }}
                              disabled={bankActionLoading !== null}
                              className="text-xs font-medium text-gray-600 hover:text-gray-700 px-2 py-1 rounded border border-gray-200 hover:bg-gray-100"
                            >
                              Enable
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-3">Accounts can be disabled but not removed. One account must be default for withdrawals.</p>
              </div>
              )}
            </div>

            {/* Strong filters */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-gray-700 font-medium">
                  <Filter size={18} />
                  Filters
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={14} className="text-gray-400" />
                    <input
                      type="date"
                      value={filterFrom}
                      onChange={(e) => setFilterFrom(e.target.value)}
                      className="text-sm border border-gray-300 rounded-lg px-2.5 py-1.5"
                    />
                  </div>
                  <span className="text-gray-400">–</span>
                  <input
                    type="date"
                    value={filterTo}
                    onChange={(e) => setFilterTo(e.target.value)}
                    className="text-sm border border-gray-300 rounded-lg px-2.5 py-1.5"
                  />
                  <select
                    value={filterDirection}
                    onChange={(e) => setFilterDirection(e.target.value as 'all' | 'CREDIT' | 'DEBIT')}
                    className="text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white"
                  >
                    <option value="all">All</option>
                    <option value="CREDIT">Credit</option>
                    <option value="DEBIT">Debit</option>
                  </select>
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white min-w-[140px]"
                  >
                    <option value="">All categories</option>
                    {LEDGER_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{formatCategory(c)}</option>
                    ))}
                  </select>
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search description..."
                      value={filterSearch}
                      onChange={(e) => setFilterSearch(e.target.value)}
                      className="text-sm border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 w-44"
                    />
                  </div>
                  <button
                    onClick={applyFilters}
                    className="px-3 py-1.5 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-700"
                  >
                    Apply
                  </button>
                  <button
                    onClick={clearFilters}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-sm font-medium hover:bg-gray-50"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Ledger table */}
              <div className="overflow-x-auto">
                {ledgerLoading ? (
                  <div className="flex items-center justify-center py-16 text-gray-500">
                    <Loader2 size={28} className="animate-spin mr-2" />
                    Loading ledger...
                  </div>
                ) : ledger.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                    <FileText size={40} className="mb-2 opacity-50" />
                    <p>No transactions in this period</p>
                    <p className="text-sm mt-1">Adjust filters or wait for new activity</p>
                  </div>
                ) : (
                  <>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="w-9 py-3 px-2" />
                          <th className="text-left py-3 px-3 font-semibold text-slate-700">Date</th>
                          <th className="text-left py-3 px-3 font-semibold text-slate-700">Order ID</th>
                          <th className="text-left py-3 px-3 font-semibold text-slate-700">Formatted order ID</th>
                          <th className="text-left py-3 px-3 font-semibold text-slate-700">Table ID</th>
                          <th className="text-left py-3 px-3 font-semibold text-slate-700">Type</th>
                          <th className="text-left py-3 px-3 font-semibold text-slate-700 max-w-[180px]">Description</th>
                          <th className="text-left py-3 px-3 font-semibold text-slate-700">Direction</th>
                          <th className="text-right py-3 px-3 font-semibold text-slate-700">Amount</th>
                          <th className="text-right py-3 px-3 font-semibold text-slate-700">Balance after</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledger.map((row) => (
                          <React.Fragment key={row.id}>
                            <tr className={`border-b border-slate-100 transition-colors ${expandedLedgerId === row.id ? 'bg-slate-50/80' : 'hover:bg-slate-50/50'}`}>
                              <td className="py-2 px-2 align-middle">
                                {(row.reference_type === 'ORDER' && row.order_id != null) || (row.category === 'WITHDRAWAL' && row.reference_id != null) ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleExpand(row)}
                                    className="p-1.5 rounded-lg hover:bg-slate-200/80 text-slate-600 hover:text-slate-900 transition-colors"
                                    aria-label={expandedLedgerId === row.id ? 'Collapse' : 'Expand'}
                                  >
                                    {expandedLedgerId === row.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                  </button>
                                ) : (
                                  <span className="inline-block w-9" />
                                )}
                              </td>
                              <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                                {new Date(row.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                              </td>
                              <td className="py-3 px-3 font-medium text-slate-800 tabular-nums">
                                {row.order_id != null ? row.order_id : '—'}
                              </td>
                              <td className="py-3 px-3 font-medium text-slate-800">
                                {row.formatted_order_id ?? '—'}
                              </td>
                              <td className="py-3 px-3 text-slate-600">{row.table_id ?? '—'}</td>
                              <td className="py-3 px-3 font-medium text-slate-800">{formatCategory(row.category)}</td>
                              <td className="py-3 px-3 text-slate-600 max-w-[180px] truncate" title={row.description ?? row.reference_extra ?? ''}>
                                {row.description || row.reference_extra || '—'}
                              </td>
                              <td className="py-3 px-3">
                                {row.direction === 'CREDIT' ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                                    <TrendingUp size={14} /> Credit
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                                    <TrendingDown size={14} /> Debit
                                  </span>
                                )}
                              </td>
                              <td className={`py-3 px-3 text-right font-semibold tabular-nums ${row.direction === 'CREDIT' ? 'text-emerald-600' : 'text-red-600'}`}>
                                {row.direction === 'CREDIT' ? '+' : '-'}₹{row.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-3 px-3 text-right text-slate-700 tabular-nums">
                                ₹{row.balance_after.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                            {expandedLedgerId === row.id && row.category === 'WITHDRAWAL' && row.reference_id != null && (
                              <tr className="bg-slate-50/60 border-b border-slate-200">
                                <td colSpan={10} className="p-0">
                                  <div className="px-4 pb-4 pt-1">
                                    {payoutDetailsLoading === row.reference_id ? (
                                      <div className="flex items-center justify-center py-8 text-slate-500">
                                        <Loader2 size={24} className="animate-spin mr-2" />
                                        Loading payout details...
                                      </div>
                                    ) : (
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                                          <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                                            <CreditCard size={18} className="text-emerald-500" />
                                            Transaction details
                                          </h4>
                                          <dl className="space-y-1.5 text-sm">
                                            <div className="flex justify-between"><dt className="text-slate-500">Request ID</dt><dd className="font-medium tabular-nums">{payoutDetailsCache[row.reference_id]?.payout?.id ?? '—'}</dd></div>
                                            <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd className="font-medium">{payoutDetailsCache[row.reference_id]?.payout?.status ?? '—'}</dd></div>
                                            <div className="flex justify-between"><dt className="text-slate-500">Requested</dt><dd>{payoutDetailsCache[row.reference_id]?.payout?.requested_at ? new Date(payoutDetailsCache[row.reference_id].payout.requested_at).toLocaleString('en-IN') : '—'}</dd></div>
                                            {payoutDetailsCache[row.reference_id]?.payout?.utr_reference && (
                                              <div className="flex justify-between"><dt className="text-slate-500">UTR / Ref</dt><dd className="font-mono text-xs">{payoutDetailsCache[row.reference_id].payout.utr_reference}</dd></div>
                                            )}
                                            <div className="flex justify-between"><dt className="text-slate-500">Amount</dt><dd>₹{payoutDetailsCache[row.reference_id]?.payout?.amount?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) ?? '—'}</dd></div>
                                            <div className="flex justify-between"><dt className="text-slate-500">Net payout</dt><dd className="font-medium">₹{payoutDetailsCache[row.reference_id]?.payout?.net_payout_amount?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) ?? '—'}</dd></div>
                                            {payoutDetailsCache[row.reference_id]?.payout?.status === 'COMPLETED' && storeId && (
                                              <div className="pt-2 mt-2 border-t border-slate-100">
                                                <dt className="text-slate-500 text-xs mb-1">Invoice</dt>
                                                <dd className="flex gap-2 flex-wrap">
                                                  <a
                                                    href={`/api/merchant/invoice/${row.reference_id}?storeId=${encodeURIComponent(storeId)}&format=pdf`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700"
                                                  >
                                                    <FileText size={14} />
                                                    PDF
                                                  </a>
                                                  <a
                                                    href={`/api/merchant/invoice/${row.reference_id}?storeId=${encodeURIComponent(storeId)}&format=csv`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700"
                                                  >
                                                    <FileText size={14} />
                                                    CSV
                                                  </a>
                                                </dd>
                                              </div>
                                            )}
                                          </dl>
                                        </div>
                                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                                          <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                                            <Building2 size={18} className="text-slate-500" />
                                            Bank details
                                          </h4>
                                          {(() => {
                                            const details = payoutDetailsCache[row.reference_id];
                                            const bank = details?.bank;
                                            if (!bank) return <p className="text-sm text-slate-500">Bank details not available</p>;
                                            return (
                                            <dl className="space-y-1.5 text-sm">
                                              <div><dt className="text-slate-500">Account holder</dt><dd className="font-medium">{bank.account_holder_name}</dd></div>
                                              <div><dt className="text-slate-500">Account</dt><dd className="tabular-nums">{bank.account_number_masked ?? '—'}</dd></div>
                                              <div><dt className="text-slate-500">IFSC</dt><dd className="font-mono">{bank.ifsc_code ?? '—'}</dd></div>
                                              <div><dt className="text-slate-500">Bank</dt><dd>{bank.bank_name}</dd></div>
                                              {bank.payout_method === 'upi' && bank.upi_id && (
                                                <div><dt className="text-slate-500">UPI ID</dt><dd>{bank.upi_id}</dd></div>
                                              )}
                                            </dl>
                                            );
                                          })()}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                            {expandedLedgerId === row.id && row.order_id != null && (
                              <tr className="bg-slate-50/60 border-b border-slate-200">
                                <td colSpan={10} className="p-0">
                                  <div className="px-4 pb-4 pt-1">
                                    {orderDetailsLoading === row.order_id ? (
                                      <div className="flex items-center justify-center py-8 text-slate-500">
                                        <Loader2 size={24} className="animate-spin mr-2" />
                                        Loading details...
                                      </div>
                                    ) : (
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                          <button
                                            type="button"
                                            className="w-full flex items-center justify-between px-4 py-3 bg-slate-100/80 hover:bg-slate-200/80 transition-colors"
                                          >
                                            <span className="flex items-center gap-2 font-semibold text-slate-800">
                                              <Package size={18} className="text-violet-500" />
                                              Item details
                                            </span>
                                            <span className="text-xs text-slate-500">{(orderDetailsCache[row.order_id]?.items?.length ?? 0)} items</span>
                                          </button>
                                          <div className="max-h-48 overflow-y-auto">
                                            {(orderDetailsCache[row.order_id]?.items?.length ?? 0) > 0 ? (
                                              <ul className="divide-y divide-slate-100 p-2">
                                                {orderDetailsCache[row.order_id].items.map((item) => (
                                                  <li key={item.id} className="flex justify-between items-center py-2 px-2 text-sm">
                                                    <span className="font-medium text-slate-800 truncate pr-2">{item.item_name || item.item_title || '—'}</span>
                                                    <span className="text-slate-600 shrink-0">×{item.quantity} · ₹{item.total_price.toLocaleString('en-IN')}</span>
                                                  </li>
                                                ))}
                                              </ul>
                                            ) : (
                                              <p className="p-4 text-sm text-slate-500">No items</p>
                                            )}
                                          </div>
                                        </div>
                                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                          <button
                                            type="button"
                                            onClick={() => toggleRidersExpand(row.id)}
                                            className="w-full flex items-center justify-between px-4 py-3 bg-slate-100/80 hover:bg-slate-200/80 transition-colors"
                                          >
                                            <span className="flex items-center gap-2 font-semibold text-slate-800">
                                              <User size={18} className="text-amber-500" />
                                              Rider details
                                            </span>
                                            <span className="text-xs text-slate-500">{(orderDetailsCache[row.order_id]?.riders?.length ?? 0)} rider(s)</span>
                                            {expandedRidersLedgerId === row.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                          </button>
                                          {expandedRidersLedgerId === row.id && (
                                            <div className="max-h-48 overflow-y-auto border-t border-slate-100">
                                              {(orderDetailsCache[row.order_id]?.riders?.length ?? 0) > 0 ? (
                                                <ul className="divide-y divide-slate-100 p-2">
                                                  {orderDetailsCache[row.order_id].riders.map((rider, idx) => (
                                                    <li key={rider.id} className="py-3 px-3 rounded-lg bg-slate-50/80 text-sm">
                                                      <p className="font-semibold text-slate-800">Rider {idx + 1}</p>
                                                      <p className="text-slate-600">{rider.rider_name ?? '—'}</p>
                                                      <p className="text-slate-500 text-xs">{rider.rider_mobile ?? '—'}</p>
                                                      <p className="mt-1 text-xs font-medium text-slate-600">Status: {String(rider.assignment_status)}</p>
                                                      {rider.assigned_at && <p className="text-xs text-slate-500">Assigned: {new Date(rider.assigned_at).toLocaleString('en-IN')}</p>}
                                                      {rider.delivered_at && <p className="text-xs text-emerald-600">Delivered: {new Date(rider.delivered_at).toLocaleString('en-IN')}</p>}
                                                    </li>
                                                  ))}
                                                </ul>
                                              ) : (
                                                <p className="p-4 text-sm text-slate-500">No riders assigned</p>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                    {/* Pagination */}
                    {(ledgerTotal > ledgerLimit) && (
                      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50">
                        <p className="text-xs text-gray-600">
                          Showing {ledgerOffset + 1}–{Math.min(ledgerOffset + ledgerLimit, ledgerTotal)} of {ledgerTotal}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setLedgerOffset(Math.max(0, ledgerOffset - ledgerLimit))}
                            disabled={ledgerOffset === 0 || ledgerLoading}
                            className="p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ChevronLeft size={18} />
                          </button>
                          <button
                            onClick={() => setLedgerOffset(ledgerOffset + ledgerLimit)}
                            disabled={ledgerOffset + ledgerLimit >= ledgerTotal || ledgerLoading}
                            className="p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ChevronRight size={18} />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Withdrawal modal */}
        {showWithdrawal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden">
              <div className="flex-shrink-0 bg-gradient-to-r from-emerald-500 to-emerald-600 p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Wallet className="text-white" size={24} />
                  <h2 className="text-lg font-bold text-white">Withdraw</h2>
                </div>
                <button onClick={() => setShowWithdrawal(false)} className="text-white hover:bg-white/20 p-2 rounded-lg">
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <p className="text-sm text-emerald-600 font-medium">Available balance</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">
                    ₹{(wallet?.available_balance ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                  <div className="relative">
                    <span className="absolute left-4 top-3 text-gray-600 font-medium">₹</span>
                    <input
                      type="number"
                      value={withdrawalAmount}
                      onChange={(e) => setWithdrawalAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 outline-none"
                      disabled={isWithdrawing}
                    />
                  </div>
                </div>
                {(() => {
                  const amt = parseFloat(withdrawalAmount)
                  const showBreakdown = !payoutQuoteLoading && payoutQuote && !isNaN(amt) && amt >= 100
                  return showBreakdown ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                      <p className="text-sm font-medium text-slate-700">Withdrawal calculation</p>
                      <div className="flex justify-between text-sm text-slate-600">
                        <span>Requested amount (gross)</span>
                        <span className="tabular-nums">₹{payoutQuote.requested_amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-sm text-slate-600">
                        <span>Commission ({payoutQuote.commission_percentage}%)</span>
                        <span className="tabular-nums text-amber-600">−₹{(payoutQuote.commission_amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-sm text-slate-600">
                        <span>GST on Commission ({payoutQuote.gst_on_commission_percent ?? 18}%)</span>
                        <span className="tabular-nums text-amber-600">−₹{(payoutQuote.gst_on_commission ?? payoutQuote.tax_amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-sm text-slate-600">
                        <span>TDS</span>
                        <span className="tabular-nums">{(payoutQuote.tds_amount ?? 0) > 0 ? `−₹${(payoutQuote.tds_amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</span>
                      </div>
                      <div className="flex justify-between text-sm text-slate-600">
                        <span>TCS</span>
                        <span className="tabular-nums">—</span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold text-slate-800 pt-2 border-t border-slate-200">
                        <span>You receive (net payout)</span>
                        <span className="tabular-nums text-emerald-600">₹{payoutQuote.net_payout_amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  ) : payoutQuoteLoading && amt >= 100 ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-2 text-slate-600 text-sm">
                      <Loader2 size={18} className="animate-spin" />
                      Calculating...
                    </div>
                  ) : null
                })()}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Withdraw to</label>
                  <select
                    value={withdrawBankId}
                    onChange={(e) => setWithdrawBankId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 outline-none"
                    disabled={isWithdrawing}
                  >
                    {bankAccounts.filter((a) => !a.is_disabled).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.account_holder_name} {a.is_primary ? '(Default)' : ''} · {a.payout_method === 'upi' ? (a.upi_id ?? '') : (a.account_number_masked ?? '')}
                      </option>
                    ))}
                    {bankAccounts.filter((a) => !a.is_disabled).length === 0 && (
                      <option value="">Add a bank/UPI account first</option>
                    )}
                  </select>
                  {bankAccounts.length > 0 && (withdrawBankId === '' ? bankAccounts.find((a) => a.is_primary && !a.is_disabled) : bankAccounts.find((a) => a.id === withdrawBankId)) && (
                    (() => {
                      const sel = withdrawBankId === '' ? bankAccounts.find((a) => a.is_primary && !a.is_disabled) ?? bankAccounts.find((a) => !a.is_disabled) : bankAccounts.find((a) => a.id === withdrawBankId)
                      if (!sel) return null
                      return (
                        <div className="mt-2 p-3 bg-white border border-gray-200 rounded-lg text-sm">
                          <p className="font-medium text-gray-800">{sel.account_holder_name}{sel.is_primary ? ' (Default)' : ''}</p>
                          <p className="text-gray-600">{sel.payout_method === 'upi' ? `UPI: ${sel.upi_id ?? '—'}` : `${sel.bank_name} · ${sel.account_number_masked ?? '****'}`}</p>
                          {sel.payout_method !== 'upi' && <p className="text-gray-500 text-xs">IFSC: {sel.ifsc_code}</p>}
                        </div>
                      )
                    })()
                  )}
                </div>
                <div className="bg-gray-50 p-3 rounded-xl">
                  <p className="text-xs text-gray-600">Min ₹100. Funds typically arrive in 2–3 business days.</p>
                </div>
              </div>
              <div className="flex-shrink-0 bg-gray-50 px-5 py-4 flex gap-3 border-t border-gray-200">
                <button
                  onClick={() => setShowWithdrawal(false)}
                  disabled={isWithdrawing}
                  className="flex-1 py-2.5 text-gray-700 border border-gray-300 rounded-xl hover:bg-gray-100 font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleWithdrawal}
                  disabled={
                    isWithdrawing
                    || !withdrawalAmount
                    || parseFloat(withdrawalAmount) < 100
                    || (wallet?.available_balance ?? 0) < 100
                    || parseFloat(withdrawalAmount) > (wallet?.available_balance ?? 0)
                    || (withdrawBankId !== '' && !bankAccounts.some((a) => a.id === withdrawBankId && !a.is_disabled))
                    || (bankAccounts.filter((a) => !a.is_disabled).length === 0)
                  }
                  className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isWithdrawing ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Withdraw'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Bank / UPI modal */}
        {showAddBank && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden max-h-[90vh] overflow-y-auto">
              <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">Add bank or UPI</h2>
                <button onClick={() => setShowAddBank(false)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600">
                  <X size={20} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={addBankForm.payout_method}
                    onChange={(e) => setAddBankForm((f) => ({ ...f, payout_method: e.target.value as 'bank' | 'upi' }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl bg-white"
                  >
                    <option value="bank">Bank account</option>
                    <option value="upi">UPI</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Account holder name *</label>
                  <input
                    type="text"
                    value={addBankForm.account_holder_name}
                    onChange={(e) => setAddBankForm((f) => ({ ...f, account_holder_name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl"
                    placeholder="Name as per bank"
                  />
                </div>
                {addBankForm.payout_method === 'bank' ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Account number *</label>
                      <input
                        type="text"
                        value={addBankForm.account_number}
                        onChange={(e) => setAddBankForm((f) => ({ ...f, account_number: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl"
                        placeholder="Account number"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">IFSC *</label>
                      <input
                        type="text"
                        value={addBankForm.ifsc_code}
                        onChange={(e) => setAddBankForm((f) => ({ ...f, ifsc_code: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl"
                        placeholder="e.g. SBIN0001234"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Bank name *</label>
                      <input
                        type="text"
                        value={addBankForm.bank_name}
                        onChange={(e) => setAddBankForm((f) => ({ ...f, bank_name: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl"
                        placeholder="Bank name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Branch (optional)</label>
                      <input
                        type="text"
                        value={addBankForm.branch_name}
                        onChange={(e) => setAddBankForm((f) => ({ ...f, branch_name: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl"
                        placeholder="Branch name"
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">UPI ID *</label>
                    <input
                      type="text"
                      value={addBankForm.upi_id}
                      onChange={(e) => setAddBankForm((f) => ({ ...f, upi_id: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl"
                      placeholder="e.g. name@upi"
                    />
                    <p className="text-xs text-gray-500 mt-1">Account number can be same as UPI ID or any reference.</p>
                    <input
                      type="text"
                      value={addBankForm.account_number}
                      onChange={(e) => setAddBankForm((f) => ({ ...f, account_number: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl mt-2"
                      placeholder="Account number (optional for UPI)"
                    />
                  </div>
                )}
                <div className="border-t border-gray-200 pt-4 mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bank proof (cancelled cheque / statement / passbook) *
                  </label>
                  <p className="text-xs text-gray-500 mb-2">Upload a clear image or PDF of cancelled cheque, bank statement, or passbook showing account details.</p>
                  <select
                    value={addBankForm.bank_proof_type}
                    onChange={(e) => setAddBankForm((f) => ({ ...f, bank_proof_type: e.target.value as '' | 'passbook' | 'cancelled_cheque' | 'bank_statement' }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl bg-white mb-2"
                  >
                    <option value="">Select proof type</option>
                    <option value="cancelled_cheque">Cancelled cheque</option>
                    <option value="bank_statement">Bank statement</option>
                    <option value="passbook">Passbook</option>
                  </select>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer text-sm font-medium text-gray-700">
                      <FileImage size={18} />
                      {bankProofFile ? bankProofFile.name : 'Choose file'}
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={(e) => setBankProofFile(e.target.files?.[0] ?? null)}
                      />
                    </label>
                    {bankProofFile && (
                      <button
                        type="button"
                        onClick={() => setBankProofFile(null)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {bankProofUploading && (
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <Loader2 size={14} className="animate-spin" />
                      Uploading to secure storage...
                    </p>
                  )}
                </div>
              </div>
              <div className="p-5 border-t border-gray-200 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddBank(false)}
                  className="flex-1 py-2.5 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddBank}
                  disabled={addBankSubmitting || !bankProofFile || !addBankForm.bank_proof_type || (addBankForm.bank_proof_type !== 'passbook' && addBankForm.bank_proof_type !== 'cancelled_cheque' && addBankForm.bank_proof_type !== 'bank_statement')}
                  className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {addBankSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                  Add account
                </button>
              </div>
            </div>
          </div>
        )}
      </MXLayoutWhite>
    </>
  )
}

export default function PaymentsPage() {
  return (
    <React.Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <PaymentsContent />
    </React.Suspense>
  )
}

