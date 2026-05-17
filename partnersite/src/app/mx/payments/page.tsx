'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { MXLayoutWhite } from '@/components/MXLayoutWhite'
import { PartnerPageHeader } from '@/context/PartnerShellHeaderContext'
import { fetchRestaurantById, fetchRestaurantByName } from '@/lib/database'
import { Restaurant } from '@/lib/types'
import { DEMO_RESTAURANT_ID } from '@/lib/constants'
import {
  useMerchantWallet,
  useMerchantLedger,
  useMerchantBankAccounts,
  useMerchantWalletAnalytics,
  useMerchantPayoutRequests,
  usePayoutRequestMutation,
  useInvalidateBankAccounts,
  type BankAccount,
  type WalletAnalyticsPeriod,
} from '@/hooks/useMerchantApi'
import { formatInr } from '@/lib/format-inr';
import { RefundPolicyContent } from '@/components/RefundPolicyContent'
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
  Clock,
  Calculator,
  Phone,
} from 'lucide-react'
import { PageSkeletonGeneric } from '@/components/PageSkeleton'
import { PaymentsOverviewCharts } from '@/components/payments/PaymentsOverviewCharts'
import { toast } from 'sonner'
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
  in_process_withdrawal_total: number
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

function pctChangeLabel(current: number, prior: number): { text: string; positive: boolean } {
  if (prior === 0) {
    if (current === 0) return { text: '0%', positive: true }
    return { text: '+100%', positive: true }
  }
  const pct = Math.round(((current - prior) / prior) * 100)
  return { text: `${pct > 0 ? '+' : ''}${pct}%`, positive: pct >= 0 }
}

function PaymentsContent() {
  const searchParams = useSearchParams()
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [showWithdrawal, setShowWithdrawal] = useState(false)
  const [withdrawalAmount, setWithdrawalAmount] = useState('')
  const [isWithdrawing, setIsWithdrawing] = useState(false)

  const [ledgerLimit, setLedgerLimit] = useState(50)
  const [ledgerOffset, setLedgerOffset] = useState(0)
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterDirection, setFilterDirection] = useState<'all' | 'CREDIT' | 'DEBIT'>('all')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterSearch, setFilterSearch] = useState('')

  const [bankSectionExpanded, setBankSectionExpanded] = useState(false)
  const [analyticsPeriod, setAnalyticsPeriod] = useState<WalletAnalyticsPeriod>('week')
  const ledgerSectionRef = React.useRef<HTMLDivElement>(null)

  const { data: wallet, isLoading: walletLoading } = useMerchantWallet(storeId)
  const { data: walletAnalytics, isLoading: analyticsLoading } = useMerchantWalletAnalytics(
    storeId,
    analyticsPeriod
  )
  const { data: payoutData, isLoading: payoutsLoading } = useMerchantPayoutRequests(storeId, 5)
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
  const { data: bankAccounts = [], isLoading: bankAccountsLoading } = useMerchantBankAccounts(storeId)
  const payoutMutation = usePayoutRequestMutation()
  const invalidateBankAccounts = useInvalidateBankAccounts()

  const [showAddBank, setShowAddBank] = useState(false)
  const [showRefundPolicy, setShowRefundPolicy] = useState(false)
  const [bankActionLoading, setBankActionLoading] = useState<number | null>(null)
  const [showManageBank, setShowManageBank] = useState(false)
  const [selectedBankAccount, setSelectedBankAccount] = useState<BankAccount | null>(null)
  const [withdrawBankId, setWithdrawBankId] = useState<number | ''>('')
  const [addBankForm, setAddBankForm] = useState({
    payout_method: 'bank' as 'bank' | 'upi',
    account_holder_name: '',
    account_number: '',
    ifsc_code: '',
    bank_name: '',
    branch_name: '',
    account_type: '' as '' | 'savings' | 'current',
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
    if (!showWithdrawal || bankAccounts.length === 0) return
    if (withdrawBankId === '' || withdrawBankId === 0) {
      const availableAcc = bankAccounts.find((a) => !a.is_disabled)
      if (availableAcc) setWithdrawBankId(availableAcc.id)
    }
  }, [showWithdrawal, bankAccounts, withdrawBankId])

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
        setPayoutDetailsCache((prev) => ({ ...prev, [payoutRequestId]: { payout: {} as never, bank: null } }))
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
    const { payout_method, account_holder_name, account_number, ifsc_code, bank_name, branch_name, account_type, upi_id, bank_proof_type } = addBankForm
    if (!account_holder_name.trim() || !account_number.trim()) {
      toast.error('Account holder name and account number are required')
      return
    }
    if (payout_method === 'bank') {
      if (!ifsc_code.trim() || !bank_name.trim()) {
        toast.error('IFSC and bank name are required for bank account')
        return
      }
      if (!account_type || (account_type !== 'savings' && account_type !== 'current')) {
        toast.error('Please select account type (Savings or Current)')
        return
      }
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
      if (!uploadRes.ok || (!uploadData.url && !uploadData.key && !uploadData.path)) {
        toast.error(uploadData.error || 'Upload failed')
        setBankProofUploading(false)
        setAddBankSubmitting(false)
        return
      }
      bankProofUrl = uploadData.key ?? uploadData.path ?? uploadData.url
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
          account_type: payout_method === 'bank' && account_type ? account_type.trim() : undefined,
          upi_id: payout_method === 'upi' ? upi_id.trim() : undefined,
          bank_proof_type: proofType,
          bank_proof_file_url: bankProofUrl,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Bank/UPI account added')
        setShowAddBank(false)
        setAddBankForm({ payout_method: 'bank', account_holder_name: '', account_number: '', ifsc_code: '', bank_name: '', branch_name: '', account_type: '', upi_id: '', bank_proof_type: '', bank_proof_file_url: '' })
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

  const handleOpenManageBank = (acc: BankAccount) => {
    setSelectedBankAccount(acc)
    setShowManageBank(true)
  }

  const handleDisableBank = async () => {
    if (!storeId || !selectedBankAccount || selectedBankAccount.is_disabled) return
    setBankActionLoading(selectedBankAccount.id)
    try {
      const res = await fetch(`/api/merchant/bank-accounts/${selectedBankAccount.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, set_disabled: true }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error || 'Failed to disable account')
        return
      }
      toast.success('Bank account disabled')
      setSelectedBankAccount((prev) => (prev ? { ...prev, is_disabled: true, is_active: false, is_primary: false } : prev))
      invalidateBankAccounts(storeId)
    } catch {
      toast.error('Failed to disable account')
    } finally {
      setBankActionLoading(null)
    }
  }

  const displayName = (restaurant as { store_name?: string })?.store_name ?? (restaurant as Restaurant)?.restaurant_name

  const todayVsYesterday = pctChangeLabel(wallet?.today_earning ?? 0, wallet?.yesterday_earning ?? 0)

  const scrollToLedger = useCallback((opts?: { category?: string }) => {
    if (opts?.category) setFilterCategory(opts.category)
    setLedgerOffset(0)
    requestAnimationFrame(() => {
      ledgerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  const downloadLedgerCsv = useCallback(async () => {
    if (!storeId) return
    try {
      const search = new URLSearchParams({ storeId, limit: '2000', offset: '0' })
      if (filterFrom) search.set('from', filterFrom)
      if (filterTo) search.set('to', filterTo)
      if (filterDirection !== 'all') search.set('direction', filterDirection)
      if (filterCategory) search.set('category', filterCategory)
      const res = await fetch(`/api/merchant/wallet/ledger?${search}`)
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Could not export ledger')
        return
      }
      const rows = (data.entries ?? []) as LedgerEntry[]
      const header = ['Date', 'Category', 'Description', 'Direction', 'Amount', 'Balance after']
      const lines = rows.map((r) => [
        new Date(r.created_at).toISOString(),
        r.category,
        (r.description ?? '').replace(/"/g, '""'),
        r.direction,
        String(r.amount),
        String(r.balance_after),
      ])
      const csv = [header, ...lines].map((line) => line.map((c) => `"${c}"`).join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ledger-${storeId}-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Ledger downloaded')
    } catch {
      toast.error('Export failed')
    }
  }, [storeId, filterFrom, filterTo, filterDirection, filterCategory])

  if (isLoading) {
    return (
      <MXLayoutWhite restaurantName={displayName} restaurantId={storeId || ''}>
        <PageSkeletonGeneric />
      </MXLayoutWhite>
    )
  }

  return (
    <>
      <MXLayoutWhite restaurantName={displayName} restaurantId={storeId || DEMO_RESTAURANT_ID}>
        <PartnerPageHeader title="Payments & Ledger" subtitle="Wallet balance and full transaction history" />
        <div className="min-h-screen bg-[#f8fafc]">
          <div className="bg-white">
            <div className="px-4 sm:px-6 lg:px-8 py-2.5 max-w-7xl mx-auto w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2">
                <MobileHamburgerButton />
                <h1 className="text-base font-semibold text-gray-900">Overview</h1>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setShowRefundPolicy(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors"
                >
                  <FileText size={16} />
                  View refund policy
                </button>
                <button
                  onClick={() => setShowWithdrawal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition-colors text-sm"
                >
                  <ArrowDownToLine size={16} />
                  Withdraw
                </button>
              </div>
            </div>
          </div>

          <div className="px-4 sm:px-6 lg:px-8 py-4 max-w-7xl mx-auto w-full space-y-3">
            {/* Wallet summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              {/* Available Balance - Primary Card */}
              <div className="lg:col-span-1 bg-emerald-50 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">Available Balance</p>
                    {walletLoading ? (
                      <div className="h-7 w-20 mt-1.5 bg-gray-200 rounded animate-pulse" />
                    ) : (
                      <p className="text-xl font-bold text-gray-900 mt-1">
                        {formatInr(wallet?.available_balance ?? 0)}
                      </p>
                    )}
                    <button className="text-xs font-medium text-emerald-700 hover:text-emerald-800 mt-1">View Details →</button>
                  </div>
                  <div className="p-2 rounded-lg bg-emerald-100 flex-shrink-0">
                    <Wallet size={16} className="text-emerald-700" />
                  </div>
                </div>
              </div>

              {/* Today's Earning */}
              <div className="bg-blue-50 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">Today&apos;s Earning</p>
                    {walletLoading ? (
                      <div className="h-7 w-16 mt-1.5 bg-gray-200 rounded animate-pulse" />
                    ) : (
                      <p className="text-xl font-bold text-gray-900 mt-1">
                        {formatInr(wallet?.today_earning ?? 0)}
                      </p>
                    )}
                    <p className="text-[10px] text-gray-600 mt-1">
                      vs yesterday{' '}
                      <span
                        className={`font-semibold ${todayVsYesterday.positive ? 'text-emerald-600' : 'text-red-600'}`}
                      >
                        {todayVsYesterday.text}
                      </span>
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-blue-100 flex-shrink-0">
                    <TrendingUp size={16} className="text-blue-700" />
                  </div>
                </div>
              </div>

              {/* Yesterday's Earning */}
              <div className="bg-purple-50 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">Yesterday&apos;s Earning</p>
                    {walletLoading ? (
                      <div className="h-7 w-16 mt-1.5 bg-gray-200 rounded animate-pulse" />
                    ) : (
                      <p className="text-xl font-bold text-gray-900 mt-1">
                        {formatInr(wallet?.yesterday_earning ?? 0)}
                      </p>
                    )}
                    <p className="text-[10px] text-gray-600 mt-1">Previous day earnings</p>
                  </div>
                  <div className="p-2 rounded-lg bg-purple-100 flex-shrink-0">
                    <TrendingDown size={16} className="text-purple-700" />
                  </div>
                </div>
              </div>

              {/* Pending */}
              <div className="bg-orange-50 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">Pending</p>
                    {walletLoading ? (
                      <div className="h-7 w-16 mt-1.5 bg-gray-200 rounded animate-pulse" />
                    ) : (
                      <p className="text-xl font-bold text-gray-900 mt-1">
                        {formatInr(wallet?.pending_balance ?? 0)}
                      </p>
                    )}
                    <p className="text-[10px] text-gray-600 mt-1">Orders awaiting settlement</p>
                  </div>
                  <div className="p-2 rounded-lg bg-orange-100 flex-shrink-0">
                    <Clock size={16} className="text-orange-700" />
                  </div>
                </div>
              </div>

              {/* Pending Withdrawal */}
              <div className="bg-red-50 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">Pending Withdrawal</p>
                    {walletLoading ? (
                      <div className="h-7 w-16 mt-1.5 bg-gray-200 rounded animate-pulse" />
                    ) : (
                      <p className="text-xl font-bold text-gray-900 mt-1">
                        {formatInr(wallet?.pending_withdrawal_total ?? 0)}
                      </p>
                    )}
                    <p className="text-[10px] text-gray-600 mt-1">In process</p>
                  </div>
                  <div className="p-2 rounded-lg bg-red-100 flex-shrink-0">
                    <ArrowDownToLine size={16} className="text-red-700" />
                  </div>
                </div>
              </div>

              {/* In Process */}
              <div className="bg-yellow-50 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">In Process</p>
                    {walletLoading ? (
                      <div className="h-7 w-16 mt-1.5 bg-gray-200 rounded animate-pulse" />
                    ) : (
                      <p className="text-xl font-bold text-gray-900 mt-1">
                        {formatInr(wallet?.in_process_withdrawal_total ?? 0)}
                      </p>
                    )}
                    <p className="text-[10px] text-gray-600 mt-1">Being processed</p>
                  </div>
                  <div className="p-2 rounded-lg bg-yellow-100 flex-shrink-0">
                    <Package size={16} className="text-yellow-700" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 sm:px-6 lg:px-8 py-4 max-w-7xl mx-auto w-full space-y-3">
            <PaymentsOverviewCharts
              analyticsPeriod={analyticsPeriod}
              onAnalyticsPeriodChange={setAnalyticsPeriod}
              analytics={walletAnalytics}
              analyticsLoading={analyticsLoading}
              payoutData={payoutData}
              payoutsLoading={payoutsLoading}
            />

            {/* Bank & UPI + Quick Actions Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Bank & UPI Section */}
              <div className="lg:col-span-2 bg-white rounded-lg shadow-sm p-4 border border-gray-200">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <Building2 size={16} className="text-gray-700" />
                      Bank & UPI Accounts
                    </h3>
                    <p className="text-xs text-gray-600 mt-1">Manage bank and UPI accounts for receiving payouts</p>
                  </div>
                  <button
                    onClick={() => { setBankProofFile(null); setAddBankForm((f) => ({ ...f, bank_proof_type: '', bank_proof_file_url: '' })); setShowAddBank(true); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors flex-shrink-0"
                  >
                    <Plus size={14} />
                    Add Bank / UPI
                  </button>
                </div>

                {/* Accounts List */}
                <div className="space-y-2">
                  {bankAccountsLoading ? (
                    <div className="flex items-center justify-center py-6 text-gray-500">
                      <Loader2 size={16} className="animate-spin mr-2" />
                      <span className="text-xs">Loading accounts...</span>
                    </div>
                  ) : bankAccounts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center bg-gray-50 rounded-lg">
                      <Building2 size={32} className="text-gray-300 mb-2" />
                      <p className="text-sm text-gray-600 font-medium">No bank or UPI account added</p>
                      <p className="text-xs text-gray-500 mt-0.5">Add an account to start receiving payouts</p>
                    </div>
                  ) : (
                    bankAccounts.map((acc) => (
                      <div
                        key={acc.id}
                        className={`flex items-center justify-between gap-3 p-3 rounded-lg border transition-all ${acc.is_disabled ? 'bg-gray-50 border-gray-200 opacity-70' : 'bg-white border-gray-200 hover:border-gray-300'}`}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div className={`p-2 rounded-lg flex-shrink-0 ${acc.is_disabled ? 'bg-gray-100' : acc.payout_method === 'upi' ? 'bg-violet-100' : 'bg-emerald-100'}`}>
                            {acc.payout_method === 'upi' ? <CreditCard size={16} className={acc.is_disabled ? 'text-gray-500' : 'text-violet-600'} /> : <Building2 size={16} className={acc.is_disabled ? 'text-gray-500' : 'text-emerald-600'} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-gray-900 text-sm">{acc.account_holder_name}</p>
                              <span className="text-xs text-gray-500">·</span>
                              <p className="text-xs text-gray-600">
                                {acc.payout_method === 'upi' ? (acc.upi_id || '—') : `${acc.account_number_masked || '****'} · ${acc.bank_name}`}
                              </p>
                              {acc.is_primary && (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 whitespace-nowrap">Default</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => handleOpenManageBank(acc)}
                            className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-50 transition-colors"
                          >
                            Manage
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h3>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    onClick={() => setShowWithdrawal(true)}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-emerald-100 group-hover:bg-emerald-200 transition-colors">
                        <ArrowDownToLine size={16} className="text-emerald-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-gray-900 text-xs">Withdraw Earnings</p>
                        <p className="text-[10px] text-gray-600">Transfer your earnings to bank account</p>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
                  </button>
                  
                  <button
                    type="button" onClick={() => scrollToLedger({ category: 'WITHDRAWAL' })}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-100 group-hover:bg-blue-200 transition-colors">
                        <ArrowDownToLine size={16} className="text-blue-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-gray-900 text-xs">Withdrawal History</p>
                        <p className="text-[10px] text-gray-600">View your withdrawal requests</p>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
                  </button>

                  <button
                    type="button" onClick={() => scrollToLedger({ category: 'WITHDRAWAL' })}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-purple-100 group-hover:bg-purple-200 transition-colors">
                        <FileText size={16} className="text-purple-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-gray-900 text-xs">Payout History</p>
                        <p className="text-[10px] text-gray-600">View all your payouts</p>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
                  </button>

                  <button
                    type="button" onClick={() => void downloadLedgerCsv()}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-orange-100 group-hover:bg-orange-200 transition-colors">
                        <FileText size={16} className="text-orange-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-gray-900 text-xs">Download Ledger</p>
                        <p className="text-[10px] text-gray-600">Download your transaction report</p>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
                  </button>
                </div>
              </div>
            </div>

            {/* Recent Transactions */}
            <div
              id="payments-ledger-section"
              ref={ledgerSectionRef}
              className="lg:col-span-3 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden"
            >
              <div className="px-4 py-2.5 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">Recent Transactions</h3>
              </div>
              
              {/* Filters */}
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Filter size={14} className="text-gray-600" />
                    <span className="text-xs font-medium text-gray-700">Filters</span>
                  </div>
                  <div className="flex-1 flex flex-wrap items-center gap-1.5">
                    <div className="flex items-center gap-1">
                      <Calendar size={12} className="text-gray-400" />
                      <input
                        type="date"
                        value={filterFrom}
                        onChange={(e) => setFilterFrom(e.target.value)}
                        className="text-[10px] border border-gray-300 rounded px-2 py-1 bg-white"
                      />
                    </div>
                    <span className="text-gray-400 text-[10px]">–</span>
                    <input
                      type="date"
                      value={filterTo}
                      onChange={(e) => setFilterTo(e.target.value)}
                      className="text-[10px] border border-gray-300 rounded px-2 py-1 bg-white"
                    />
                    <select
                      value={filterDirection}
                      onChange={(e) => setFilterDirection(e.target.value as 'all' | 'CREDIT' | 'DEBIT')}
                      className="text-[10px] border border-gray-300 rounded px-2 py-1 bg-white"
                    >
                      <option value="all">All</option>
                      <option value="CREDIT">Credit</option>
                      <option value="DEBIT">Debit</option>
                    </select>
                    <select
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className="text-[10px] border border-gray-300 rounded px-2 py-1 bg-white"
                    >
                      <option value="">All categories</option>
                      {LEDGER_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{formatCategory(c)}</option>
                      ))}
                    </select>
                    <div className="relative">
                      <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search..."
                        value={filterSearch}
                        onChange={(e) => setFilterSearch(e.target.value)}
                        className="text-[10px] border border-gray-300 rounded pl-6 pr-2 py-1 bg-white w-32"
                      />
                    </div>
                    <button
                      onClick={applyFilters}
                      className="px-2 py-1 rounded bg-emerald-600 text-white text-[10px] font-medium hover:bg-emerald-700 transition-colors"
                    >
                      Apply
                    </button>
                    <button
                      onClick={clearFilters}
                      className="px-2 py-1 rounded border border-gray-300 text-gray-600 text-[10px] font-medium hover:bg-gray-100 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>

              {/* Ledger table */}
              <div className="overflow-x-auto">
                {ledgerLoading ? (
                  <div className="flex items-center justify-center py-16 text-gray-500">
                    <Loader2 size={28} className="animate-spin mr-2" />
                    Loading transactions...
                  </div>
                ) : ledger.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                    <FileText size={40} className="mb-2 opacity-50" />
                    <p className="font-medium">No transactions found</p>
                    <p className="text-sm mt-1">Transactions will appear here once you start receiving orders.</p>
                  </div>
                ) : (
                  <>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-100 border-b border-gray-200">
                          <th className="w-8 py-3 px-4 text-left" />
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Type</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Order ID</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Date & Time</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Description</th>
                          <th className="text-right py-3 px-4 font-semibold text-gray-700">Amount</th>
                          <th className="text-center py-3 px-4 font-semibold text-gray-700">Status</th>
                          <th className="text-right py-3 px-4 font-semibold text-gray-700">Balance After</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {ledger.map((row) => (
                          <React.Fragment key={row.id}>
                            <tr className={`transition-colors ${expandedLedgerId === row.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                              <td className="py-3 px-4">
                                {(row.reference_type === 'ORDER' && row.order_id != null) || (row.category === 'WITHDRAWAL' && row.reference_id != null) ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleExpand(row)}
                                    className="p-1 rounded hover:bg-gray-200 text-gray-600 hover:text-gray-900 transition-colors"
                                  >
                                    {expandedLedgerId === row.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                  </button>
                                ) : null}
                              </td>
                              <td className="py-3 px-4 font-medium text-gray-900">{formatCategory(row.category)}</td>
                              <td className="py-3 px-4 text-gray-600">{row.order_id != null ? row.order_id : '—'}</td>
                              <td className="py-3 px-4 text-gray-600 whitespace-nowrap">{new Date(row.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td>
                              <td className="py-3 px-4 text-gray-600 truncate max-w-xs" title={row.description ?? ''}>{row.description || '—'}</td>
                              <td className={`py-3 px-4 text-right font-semibold tabular-nums ${row.direction === 'CREDIT' ? 'text-emerald-600' : 'text-red-600'}`}>
                                {row.direction === 'CREDIT' ? '+' : '-'}{formatInr(row.amount)}
                              </td>
                              <td className="py-3 px-4 text-center">
                                {row.direction === 'CREDIT' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                                    <div className="w-2 h-2 rounded-full bg-emerald-600"/>
                                    Credit
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                                    <div className="w-2 h-2 rounded-full bg-red-600"/>
                                    Debit
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right text-gray-700 tabular-nums">{formatInr(row.balance_after)}</td>
                            </tr>
                            {expandedLedgerId === row.id && row.category === 'WITHDRAWAL' && row.reference_id != null && (
                              <tr className="bg-slate-50/60 border-b border-slate-200">
                                <td colSpan={8} className="p-0">
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
                                            <div className="flex justify-between"><dt className="text-slate-500">Amount</dt><dd>{payoutDetailsCache[row.reference_id]?.payout?.amount != null ? formatInr(payoutDetailsCache[row.reference_id].payout.amount) : '—'}</dd></div>
                                            <div className="flex justify-between"><dt className="text-slate-500">Net payout</dt><dd className="font-medium">{payoutDetailsCache[row.reference_id]?.payout?.net_payout_amount != null ? formatInr(payoutDetailsCache[row.reference_id].payout.net_payout_amount) : '—'}</dd></div>
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
                                <td colSpan={8} className="p-0">
                                  <div className="px-4 pb-4 pt-1">
                                    {orderDetailsLoading === row.order_id ? (
                                      <div className="flex items-center justify-center py-8 text-slate-500">
                                        <Loader2 size={24} className="animate-spin mr-2" />
                                        Loading details...
                                      </div>
                                    ) : (
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                          <div className="w-full flex items-center justify-between px-4 py-3 bg-slate-100/80">
                                            <span className="flex items-center gap-2 font-semibold text-slate-800">
                                              <Package size={18} className="text-violet-500" />
                                              Item details
                                            </span>
                                            <span className="text-xs text-slate-500">{(orderDetailsCache[row.order_id]?.items?.length ?? 0)} items</span>
                                          </div>
                                          <div className="max-h-48 overflow-y-auto">
                                            {(orderDetailsCache[row.order_id]?.items?.length ?? 0) > 0 ? (
                                              <ul className="divide-y divide-slate-100 p-2">
                                                {orderDetailsCache[row.order_id].items.map((item) => (
                                                  <li key={item.id} className="flex justify-between items-center py-2 px-2 text-sm">
                                                    <span className="font-medium text-slate-800 truncate pr-2">{item.item_name || item.item_title || '—'}</span>
                                                    <span className="text-slate-600 shrink-0">×{item.quantity} · {formatInr(item.total_price)}</span>
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
                    <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50/50">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600">Show</span>
                        <select
                          value={ledgerLimit}
                          onChange={(e) => { setLedgerLimit(Number(e.target.value)); setLedgerOffset(0); }}
                          className="text-xs border border-gray-300 rounded-lg px-2 py-1 bg-white"
                        >
                          <option value={10}>10</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                        </select>
                        <span className="text-xs text-gray-600">entries</span>
                      </div>
                      <p className="text-xs text-gray-600">
                        Showing {ledgerOffset + 1}–{Math.min(ledgerOffset + ledgerLimit, ledgerTotal)} of {ledgerTotal}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setLedgerOffset(Math.max(0, ledgerOffset - ledgerLimit))}
                          disabled={ledgerOffset === 0 || ledgerLoading}
                          className="px-3 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-white text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() => setLedgerOffset(ledgerOffset + ledgerLimit)}
                          disabled={ledgerOffset + ledgerLimit >= ledgerTotal || ledgerLoading}
                          className="px-3 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-white text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </MXLayoutWhite>

      {/* Modals - Rendered after MXLayoutWhite but inside the Fragment */}
      {showWithdrawal && (
        <div className="fixed inset-0 z-[99999] flex">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowWithdrawal(false)}
          />
          <aside className="relative ml-auto w-full max-w-md h-full bg-gradient-to-b from-white to-gray-50 shadow-2xl flex flex-col overflow-hidden">
            {/* Header - More Attractive */}
            <div className="flex-shrink-0 bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 p-6 flex items-center justify-between shadow-lg">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/20 backdrop-blur-sm rounded-xl">
                  <Wallet className="text-white" size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Withdraw Money</h2>
                  <p className="text-xs text-emerald-100 mt-0.5">Transfer to your account</p>
                </div>
              </div>
              <button 
                onClick={() => setShowWithdrawal(false)} 
                className="text-white/80 hover:text-white hover:bg-white/20 p-2 rounded-lg transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar p-6 pb-8 space-y-5">
              {/* Balance Card - Enhanced */}
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-emerald-700 font-semibold uppercase tracking-wide">Available Balance</p>
                  <TrendingUp size={18} className="text-emerald-600" />
                </div>
                <p className="text-3xl font-bold text-emerald-900 tracking-tight">
                  {formatInr(wallet?.available_balance ?? 0)}
                </p>
                <p className="text-xs text-emerald-600 mt-2">Ready to withdraw</p>
              </div>

              {/* Amount Input - Enhanced */}
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-2.5">Withdrawal Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 font-bold text-lg">₹</span>
                  <input
                    type="number"
                    value={withdrawalAmount}
                    onChange={(e) => setWithdrawalAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-4 py-3.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-300 focus:border-emerald-500 outline-none bg-white font-semibold text-lg transition-all"
                    disabled={isWithdrawing}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">Minimum ₹100 • Maximum {formatInr(wallet?.available_balance ?? 0)}</p>
              </div>

              {/* Breakdown - Enhanced */}
              {(() => {
                const amt = parseFloat(withdrawalAmount)
                const showBreakdown = !payoutQuoteLoading && payoutQuote && !isNaN(amt) && amt >= 100
                return showBreakdown ? (
                  <div className="bg-gradient-to-br from-slate-50 to-gray-50 border-2 border-slate-200 rounded-xl p-4 space-y-3">
                    <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Calculator size={16} className="text-slate-600" />
                      Withdrawal Breakdown
                    </p>
                    <div className="space-y-2.5 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-700">Requested</span>
                        <span className="font-semibold text-gray-900">{formatInr(payoutQuote.requested_amount)}</span>
                      </div>
                      <div className="border-t border-gray-200"></div>
                      {payoutQuote.commission_percentage > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Commission ({payoutQuote.commission_percentage}%)</span>
                          <span className="font-semibold text-amber-600">−{formatInr(payoutQuote.commission_amount ?? 0)}</span>
                        </div>
                      )}
                      {(payoutQuote.gst_on_commission ?? 0) > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">GST ({payoutQuote.gst_on_commission_percent ?? 18}%)</span>
                          <span className="font-semibold text-amber-600">−{formatInr(payoutQuote.gst_on_commission ?? payoutQuote.tax_amount ?? 0)}</span>
                        </div>
                      )}
                      {(payoutQuote.tds_amount ?? 0) > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">TDS Deducted</span>
                          <span className="font-semibold text-red-600">−{formatInr(payoutQuote.tds_amount ?? 0)}</span>
                        </div>
                      )}
                      <div className="border-t border-gray-300 pt-2.5 flex justify-between items-center bg-emerald-50 -mx-4 px-4 py-2.5 rounded-lg">
                        <span className="font-bold text-gray-900">You Get</span>
                        <span className="text-xl font-bold text-emerald-700">{formatInr(payoutQuote.net_payout_amount)}</span>
                      </div>
                    </div>
                  </div>
                ) : payoutQuoteLoading && amt >= 100 ? (
                  <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-4 flex items-center justify-center gap-2 text-slate-600">
                    <Loader2 size={18} className="animate-spin" />
                    <span className="text-sm font-medium">Calculating...</span>
                  </div>
                ) : null
              })()}

              {/* Account Selection - Enhanced */}
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <Building2 size={16} className="text-emerald-600" />
                  Withdraw to
                </label>
                {bankAccountsLoading ? (
                  <div className="w-full px-4 py-6 border-2 border-gray-200 rounded-xl bg-gray-50 text-center flex items-center justify-center gap-2">
                    <Loader2 size={16} className="animate-spin text-gray-600" />
                    <span className="text-sm text-gray-600 font-medium">Loading accounts...</span>
                  </div>
                ) : bankAccounts.length === 0 ? (
                  <div className="w-full px-4 py-6 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 text-center">
                    <CreditCard size={24} className="mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-600 mb-3 font-medium">No accounts added</p>
                    <button
                      type="button"
                      onClick={() => {
                        setShowWithdrawal(false)
                        setShowAddBank(true)
                      }}
                      className="text-sm px-3 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-all shadow-sm"
                    >
                      Add Account
                    </button>
                  </div>
                ) : bankAccounts.filter((a) => !a.is_disabled).length === 0 ? (
                  <div className="w-full px-4 py-6 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 text-center">
                    <Ban size={24} className="mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-600 mb-3 font-medium">All accounts disabled</p>
                    <button
                      type="button"
                      onClick={() => {
                        setShowWithdrawal(false)
                        setShowAddBank(true)
                      }}
                      className="text-sm px-3 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-all shadow-sm"
                    >
                      Add New Account
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {bankAccounts.filter((a) => !a.is_disabled).map((account) => (
                      <label
                        key={account.id}
                        className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all transform hover:scale-102 ${
                          withdrawBankId === account.id
                            ? 'border-emerald-500 bg-emerald-50 shadow-md'
                            : 'border-gray-200 bg-white hover:border-emerald-300'
                        }`}
                        onClick={() => setWithdrawBankId(account.id)}
                      >
                        <div className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center ${withdrawBankId === account.id ? 'border-emerald-600 bg-emerald-600' : 'border-gray-300'}`}>
                          {withdrawBankId === account.id && <Check size={14} className="text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-bold text-gray-900 text-sm">{account.account_holder_name}</p>
                            {account.is_primary && <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-bold">Default</span>}
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-xs text-gray-600 font-medium">
                              {account.payout_method === 'upi' ? (
                                <>UPI • {account.upi_id ?? '—'}</>
                              ) : (
                                <>{account.bank_name ?? 'Bank'} • {account.account_number_masked ?? '****'}</>
                              )}
                            </p>
                            {account.payout_method !== 'upi' && account.ifsc_code && (
                              <p className="text-xs text-gray-500">IFSC: {account.ifsc_code}</p>
                            )}
                          </div>
                        </div>
                        {account.payout_method === 'upi' ? (
                          <Phone size={16} className="text-blue-500 flex-shrink-0" />
                        ) : (
                          <Building2 size={16} className="text-blue-600 flex-shrink-0" />
                        )}
                      </label>
                    ))}
                    <button
                      type="button"
                      onClick={() => setShowAddBank(true)}
                      className="w-full mt-2 px-4 py-2.5 border-2 border-dashed border-emerald-300 rounded-xl text-emerald-700 font-semibold hover:bg-emerald-50 transition-all text-sm flex items-center justify-center gap-2"
                    >
                      <Plus size={16} />
                      Add Another Account
                    </button>
                  </div>
                )}
              </div>

              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 flex gap-2.5">
                <Clock size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-800 font-medium">Funds arrive in 2-3 business days. Minimum withdrawal: ₹100</p>
              </div>
            </div>

            {/* Footer Buttons - Enhanced */}
            <div className="flex-shrink-0 bg-white border-t-2 border-gray-200 px-6 py-4 flex gap-3 shadow-lg">
              <button
                onClick={() => setShowWithdrawal(false)}
                disabled={isWithdrawing}
                className="flex-1 py-3 text-gray-700 border-2 border-gray-300 rounded-xl hover:bg-gray-100 font-bold disabled:opacity-50 transition-all"
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
                className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:shadow-lg font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-all transform hover:scale-105 active:scale-95"
              >
                {isWithdrawing ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <ArrowDownToLine size={18} />
                    <span>Withdraw Now</span>
                  </>
                )}
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Refund Policy right-sheet */}
      {showRefundPolicy && (
        <div className="fixed inset-0 z-[9999] flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowRefundPolicy(false)} />
          <aside className="relative ml-auto w-full max-w-3xl h-full bg-white shadow-2xl flex flex-col overflow-hidden border-l border-gray-200">
            <div className="flex-shrink-0 px-4 sm:px-5 py-4 border-b border-gray-200 bg-white/95 backdrop-blur flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.18em] text-orange-600 font-semibold">Policy</p>
                <h2 className="text-base sm:text-lg font-bold text-gray-900 leading-tight">Refund Policy</h2>
              </div>
              <button onClick={() => setShowRefundPolicy(false)} className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-xl hover:bg-gray-100 text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto hide-scrollbar px-0 py-0">
              <RefundPolicyContent compact />
            </div>
          </aside>
        </div>
      )}

      {/* Manage Bank / UPI modal */}
      {showManageBank && selectedBankAccount && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999] p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Account details</h2>
              <button onClick={() => setShowManageBank(false)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto hide-scrollbar">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs text-gray-500">Account holder</p>
                  <p className="font-medium text-gray-900">{selectedBankAccount.account_holder_name || '—'}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs text-gray-500">Payout method</p>
                  <p className="font-medium text-gray-900 uppercase">{selectedBankAccount.payout_method || '—'}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3 col-span-2">
                  <p className="text-xs text-gray-500">Account number</p>
                  <p className="font-medium text-gray-900 tabular-nums">{selectedBankAccount.account_number || selectedBankAccount.account_number_masked || '—'}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs text-gray-500">UPI ID</p>
                  <p className="font-medium text-gray-900">{selectedBankAccount.upi_id || '—'}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs text-gray-500">IFSC</p>
                  <p className="font-medium text-gray-900">{selectedBankAccount.ifsc_code || '—'}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs text-gray-500">Bank name</p>
                  <p className="font-medium text-gray-900">{selectedBankAccount.bank_name || '—'}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs text-gray-500">Branch</p>
                  <p className="font-medium text-gray-900">{selectedBankAccount.branch_name || '—'}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs text-gray-500">Account type</p>
                  <p className="font-medium text-gray-900">{selectedBankAccount.account_type || '—'}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs text-gray-500">Status</p>
                  <p className={`font-semibold ${selectedBankAccount.is_disabled ? 'text-red-600' : 'text-emerald-600'}`}>
                    {selectedBankAccount.is_disabled ? 'Disabled' : 'Active'}
                  </p>
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-gray-200 flex gap-3 bg-gray-50">
              <button
                type="button"
                onClick={() => setShowManageBank(false)}
                className="flex-1 py-2.5 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-white"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleDisableBank}
                disabled={selectedBankAccount.is_disabled || bankActionLoading === selectedBankAccount.id}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {bankActionLoading === selectedBankAccount.id ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
                {selectedBankAccount.is_disabled ? 'Disabled' : 'Disable account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Bank / UPI modal */}
      {showAddBank && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999] p-4">
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Account type *</label>
                    <select
                      value={addBankForm.account_type}
                      onChange={(e) => setAddBankForm((f) => ({ ...f, account_type: e.target.value as '' | 'savings' | 'current' }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl bg-white"
                    >
                      <option value="">Select account type</option>
                      <option value="savings">Savings</option>
                      <option value="current">Current</option>
                    </select>
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
                disabled={addBankSubmitting || !bankProofFile || !addBankForm.bank_proof_type || (addBankForm.bank_proof_type !== 'passbook' && addBankForm.bank_proof_type !== 'cancelled_cheque' && addBankForm.bank_proof_type !== 'bank_statement') || (addBankForm.payout_method === 'bank' && !addBankForm.account_type)}
                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {addBankSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                Add account
              </button>
            </div>
          </div>
        </div>
      )}
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
