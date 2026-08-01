'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useSearchParams, usePathname } from 'next/navigation'
import { MXLayoutWhite } from '@/components/MXLayoutWhite'
import { PartnerPageHeader } from '@/context/PartnerShellHeaderContext'
import { Restaurant } from '@/lib/types'
import { usePartnerStoreRecord } from '@/hooks/usePartnerStoreRecord'
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
import { formatLedgerDescription } from '@/lib/wallet-types';
import {
  resolveLedgerDisplayAmount,
  resolveLedgerDisplayDescription,
  isMerchantVisibleLedgerEntry,
  resolveWalletDisplayBalance,
} from '@/lib/merchant-payout-utils';
import type { LedgerEntry } from '@/lib/wallet-types';
import { LedgerEntryAmount } from '@/components/payments/LedgerEntryAmount';
import { mergeCancellationLedgerEntries } from '@/lib/merge-cancellation-ledger-entries';
import { partnerPayoutHistoryHref } from '@/lib/partner-payments-routes';
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
  Phone,
  Copy,
} from 'lucide-react'
import { PaymentsOverviewCharts } from '@/components/payments/PaymentsOverviewCharts'
import { toast } from 'sonner'
import { MobileHamburgerButton } from '@/components/MobileHamburgerButton'
import { useHydrated } from '@/hooks/useHydrated'

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

const MIN_WITHDRAWAL = 100
const MAX_WITHDRAWAL_PER_REQUEST = 100_000

function getWithdrawableBalance(wallet: WalletSummary | undefined | null): number {
  return resolveWalletDisplayBalance(wallet)
}

function getMaxWithdrawalLimit(withdrawable: number): number {
  return Math.min(Math.max(0, withdrawable), MAX_WITHDRAWAL_PER_REQUEST)
}

function formatWithdrawalInputAmount(amount: number): string {
  const rounded = Math.round(amount * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
}

interface WalletSummary {
  available_balance: number
  pending_balance: number
  hold_balance?: number
  locked_balance?: number
  withdrawable_balance?: number
  locked_settlement_total?: number
  total_balance?: number
  settlement_paused?: boolean
  today_earning: number
  yesterday_earning: number
  total_earned: number
  total_withdrawn: number
  pending_withdrawal_total: number
  in_process_withdrawal_total: number
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
  const key = String(cat ?? "").trim().toUpperCase();
  if (key === "FAILED_WITHDRAWAL_REVERSAL") return "Withdrawal returned";
  if (key === "HOLD_LOCK") return "Withdrawal";
  if (key === "HOLD_RELEASE") return "Withdrawal update";
  if (key === "WITHDRAWAL") return "Withdrawal";
  if (key === "ORDER_EARNING") return "Order earning";
  return cat.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

async function copyTextToClipboard(text: string, successMessage = 'Copied to clipboard') {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(successMessage)
  } catch {
    toast.error('Could not copy')
  }
}

function PgTxnIdCell({ pgId }: { pgId: string | null | undefined }) {
  if (!pgId?.trim()) {
    return <span className="text-gray-400">—</span>
  }
  return (
    <div className="flex items-start gap-1.5">
      <span className="font-mono text-[11px] leading-snug break-all text-gray-700">{pgId}</span>
      <button
        type="button"
        onClick={() => void copyTextToClipboard(pgId, 'PG TNX ID copied')}
        className="shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-800"
        title="Copy PG TNX ID"
        aria-label="Copy PG TNX ID"
      >
        <Copy size={14} />
      </button>
    </div>
  )
}

function isCancellationNoCreditEntry(row: LedgerEntry): boolean {
  const meta = row.metadata as Record<string, unknown> | null
  if (meta?.entry_type === 'order_cancellation' && meta?.balance_impact === 'none') return true
  const display = meta?.cancellation_display as { creditAmount?: number } | undefined
  if (display && Number(display.creditAmount ?? 0) <= 0) return true
  return false
}

function formatLedgerRowDescription(row: LedgerEntry): string {
  return resolveLedgerDisplayDescription(row) || '—'
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
  const pathname = usePathname()
  const hydrated = useHydrated()
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  // Always start null on server + first client paint to avoid hydration mismatch
  // (window/localStorage differs between SSR and CSR).
  const [storeId, setStoreId] = useState<string | null>(null)
  const { data: storeRecord } = usePartnerStoreRecord(storeId)
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

  const { data: wallet, isLoading: walletLoading } = useMerchantWallet(storeId, { lite: false })
  // Gate loading UI until after hydration so SSR HTML matches the first client paint.
  const showWalletSkeleton = !hydrated || !storeId || walletLoading
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
  const ledger = (ledgerData?.entries ?? []).filter(isMerchantVisibleLedgerEntry)
  const displayLedger = useMemo(
    () => mergeCancellationLedgerEntries(ledger).entries,
    [ledger]
  )
  const ledgerTotal = ledgerData?.total ?? 0
  const withdrawableBalance = getWithdrawableBalance(wallet as WalletSummary | undefined)
  const maxWithdrawalLimit = getMaxWithdrawalLimit(withdrawableBalance)
  const withdrawalInputEnabled = maxWithdrawalLimit >= MIN_WITHDRAWAL && !isWithdrawing

  const openWithdrawalSheet = () => {
    const limit = getMaxWithdrawalLimit(getWithdrawableBalance(wallet as WalletSummary | undefined))
    if (limit >= MIN_WITHDRAWAL) {
      setWithdrawalAmount(formatWithdrawalInputAmount(limit))
    } else {
      setWithdrawalAmount('')
    }
    setShowWithdrawal(true)
  }

  const handleWithdrawalAmountChange = (raw: string) => {
    if (raw === '') {
      setWithdrawalAmount('')
      return
    }
    const num = parseFloat(raw)
    if (isNaN(num)) return
    const cap = getMaxWithdrawalLimit(getWithdrawableBalance(wallet as WalletSummary | undefined))
    if (num > cap) {
      setWithdrawalAmount(formatWithdrawalInputAmount(cap))
      return
    }
    setWithdrawalAmount(raw)
  }
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
    payout_method: 'bank' as 'bank',
    account_holder_name: '',
    account_number: '',
    ifsc_code: '',
    bank_name: '',
    branch_name: '',
    account_type: '' as '' | 'savings' | 'current',
    bank_proof_type: '' as '' | 'passbook' | 'cancelled_cheque' | 'bank_statement',
    bank_proof_file_url: '',
  })
  const [bankProofFile, setBankProofFile] = useState<File | null>(null)
  const [bankProofUploading, setBankProofUploading] = useState(false)
  const [addBankSubmitting, setAddBankSubmitting] = useState(false)
  const [bankVerifyLoading, setBankVerifyLoading] = useState<number | null>(null)
  /** Superadmin policy for bank_account: manual | auto | hybrid | disabled */
  const [bankPolicyMode, setBankPolicyMode] = useState<'manual' | 'auto' | 'hybrid' | 'disabled'>('manual')
  /** When hybrid verify fails, force the manual proof upload form */
  const [addBankForceManual, setAddBankForceManual] = useState(false)
  const [addBankElectronicVerified, setAddBankElectronicVerified] = useState(false)
  const [addBankVerifyError, setAddBankVerifyError] = useState<string | null>(null)
  const [addBankVerifying, setAddBankVerifying] = useState(false)
  const [bankPolicyLoading, setBankPolicyLoading] = useState(false)

  const [expandedLedgerId, setExpandedLedgerId] = useState<number | null>(null)
  const [expandedRidersLedgerId, setExpandedRidersLedgerId] = useState<number | null>(null)
  const [orderDetailsCache, setOrderDetailsCache] = useState<Record<number, { items: OrderDetailItem[]; riders: OrderDetailRider[] }>>({})
  const [orderDetailsLoading, setOrderDetailsLoading] = useState<number | null>(null)
  const [payoutDetailsCache, setPayoutDetailsCache] = useState<Record<number, { payout: { id: number; amount: number; net_payout_amount: number; status: string; utr_reference: string | null; pg_transaction_id: string | null; requested_at: string }; bank: { account_holder_name: string; account_number_masked: string | null; bank_name: string; payout_method: string; upi_id: string | null; ifsc_code?: string | null } | null }>>({})
  const [payoutDetailsLoading, setPayoutDetailsLoading] = useState<number | null>(null)

  useEffect(() => {
    const id =
      searchParams?.get('restaurantId') ??
      searchParams?.get('storeId') ??
      (typeof window !== 'undefined'
        ? localStorage.getItem('selectedStoreId') ?? localStorage.getItem('selectedRestaurantId')
        : null) ??
      DEMO_RESTAURANT_ID
    setStoreId(id)
  }, [searchParams])

  useEffect(() => {
    if (storeRecord) setRestaurant(storeRecord as unknown as Restaurant)
  }, [storeRecord])

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
    const available = wallet?.withdrawable_balance ?? wallet?.available_balance ?? 0
    if (available < 100) {
      toast.error('Available balance is below the minimum withdrawal (₹100).')
      return
    }
    if (amount > maxWithdrawalLimit) {
      toast.error('Requested amount exceeds your available balance or ₹1,00,000 limit.')
      return
    }
    if (amount > MAX_WITHDRAWAL_PER_REQUEST) {
      toast.error('Maximum withdrawal per request is ₹1,00,000.')
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
      toast.success('Withdrawal request submitted. Full amount will arrive within 24 to 48 hrs.')
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
              status: data.payout.status,
              utr_reference: data.payout.utr_reference ?? null,
              pg_transaction_id: data.payout.pg_transaction_id ?? data.payout.utr_reference ?? null,
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
    if ((entry.category === 'WITHDRAWAL' || entry.category === 'HOLD_LOCK') && entry.reference_id != null && !payoutDetailsCache[entry.reference_id]) fetchPayoutDetails(entry.reference_id)
  }

  const toggleRidersExpand = (ledgerId: number) => {
    setExpandedRidersLedgerId((prev) => (prev === ledgerId ? null : ledgerId))
  }

  const isElectronicBankMode = bankPolicyMode === 'auto' || bankPolicyMode === 'hybrid'

  const resetAddBankSheet = useCallback(() => {
    setAddBankForm({
      payout_method: 'bank',
      account_holder_name: '',
      account_number: '',
      ifsc_code: '',
      bank_name: '',
      branch_name: '',
      account_type: '',
      bank_proof_type: '',
      bank_proof_file_url: '',
    })
    setBankProofFile(null)
    setAddBankForceManual(false)
    setAddBankElectronicVerified(false)
    setAddBankVerifyError(null)
    setAddBankVerifying(false)
  }, [])

  const openAddBankSheet = useCallback(async () => {
    resetAddBankSheet()
    setShowAddBank(true)
    setBankPolicyLoading(true)
    try {
      const res = await fetch('/api/onboarding/verification-modes', { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      const raw = String(data?.modes?.bank_account ?? data?.modes?.bank ?? 'manual').toLowerCase()
      const mode =
        raw === 'auto' || raw === 'hybrid' || raw === 'disabled' || raw === 'manual' ? raw : 'manual'
      setBankPolicyMode(mode)
      if (mode === 'manual' || mode === 'disabled') setAddBankForceManual(true)
    } catch {
      setBankPolicyMode('manual')
      setAddBankForceManual(true)
    } finally {
      setBankPolicyLoading(false)
    }
  }, [resetAddBankSheet])

  const handleAddBank = async (opts?: { skipProof?: boolean; alreadyVerified?: boolean }) => {
    const { account_holder_name, account_number, ifsc_code, bank_name, branch_name, account_type, bank_proof_type } = addBankForm
    const skipProof = !!opts?.skipProof
    if (!account_holder_name.trim() || !account_number.trim()) {
      toast.error('Account holder name and account number are required')
      return
    }
    if (!ifsc_code.trim() || !bank_name.trim()) {
      toast.error('IFSC and bank name are required for bank account')
      return
    }
    if (!account_type || (account_type !== 'savings' && account_type !== 'current')) {
      toast.error('Please select account type (Savings or Current)')
      return
    }
    let bankProofUrl: string | undefined
    let proofType: 'passbook' | 'cancelled_cheque' | 'bank_statement' | null = null
    if (!skipProof) {
      proofType = bank_proof_type === 'passbook' || bank_proof_type === 'cancelled_cheque' || bank_proof_type === 'bank_statement' ? bank_proof_type : null
      if (!proofType) {
        toast.error('Please select proof type (passbook, cancelled cheque, or bank statement)')
        return
      }
      if (!bankProofFile) {
        toast.error('Please upload cancelled cheque, bank statement, or passbook')
        return
      }
    }
    if (!storeId) return
    setAddBankSubmitting(true)
    try {
      if (!skipProof && bankProofFile) {
        setBankProofUploading(true)
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
      }
      const res = await fetch('/api/merchant/bank-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          payout_method: 'bank',
          account_holder_name: account_holder_name.trim(),
          account_number: account_number.trim(),
          ifsc_code: ifsc_code.trim(),
          bank_name: bank_name.trim(),
          branch_name: branch_name.trim() || undefined,
          account_type: account_type.trim(),
          bank_proof_type: proofType || undefined,
          bank_proof_file_url: bankProofUrl,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        toast.error(data.error || 'Failed to add')
        return
      }

      const newId = Number(data?.account?.id ?? data?.id)
      if (opts?.alreadyVerified && Number.isFinite(newId) && newId > 0) {
        // Row was just created; Cashfree already confirmed — mark verified via verify API.
        try {
          await fetch('/api/merchant/bank-account/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              storeId,
              bankAccountId: newId,
              bank: {
                account_holder_name: account_holder_name.trim(),
                account_number: account_number.trim().replace(/\D/g, ''),
                ifsc_code: ifsc_code.trim().toUpperCase(),
                bank_name: bank_name.trim(),
                branch_name: branch_name.trim() || undefined,
              },
            }),
          })
        } catch {
          /* account saved; verify badge can be retried from list */
        }
      }

      toast.success(
        opts?.alreadyVerified
          ? 'Bank account added and verified'
          : 'Bank account added. You can verify it from the list.'
      )
      setShowAddBank(false)
      resetAddBankSheet()
      if (storeId) invalidateBankAccounts(storeId)
    } catch {
      toast.error('Failed to add account')
      setBankProofUploading(false)
    } finally {
      setAddBankSubmitting(false)
    }
  }

  const handleElectronicVerify = async () => {
    const account_number = addBankForm.account_number.trim().replace(/\D/g, '')
    const ifsc_code = addBankForm.ifsc_code.trim().toUpperCase()
    if (!account_number || account_number.length < 6) {
      toast.error('Enter a valid account number')
      return
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc_code)) {
      toast.error('Enter a valid IFSC code')
      return
    }
    if (!storeId) return
    const holderFallback =
      String(
        (restaurant as { store_display_name?: string; store_name?: string; owner_full_name?: string } | null)
          ?.store_display_name ||
          (restaurant as { store_name?: string } | null)?.store_name ||
          displayName ||
          'Account Holder'
      ).trim() || 'Account Holder'
    const bankFallback = ifsc_code.slice(0, 4)
    setAddBankVerifying(true)
    setAddBankVerifyError(null)
    try {
      const res = await fetch('/api/merchant/bank-account/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          storeId,
          bank: {
            account_holder_name: holderFallback,
            account_number,
            ifsc_code,
            bank_name: bankFallback,
          },
        }),
      })
      const data = await res.json()
      if (data.success && data.verified) {
        setAddBankForm((f) => ({
          ...f,
          account_holder_name: String(data.name_at_bank || f.account_holder_name || holderFallback).trim(),
          bank_name: String(data.bank_name || f.bank_name || bankFallback).trim(),
          account_number,
          ifsc_code,
        }))
        setAddBankElectronicVerified(true)
        setAddBankForceManual(false)
        toast.success(data.message || 'Account verified — confirm account type and save')
        if (storeId) invalidateBankAccounts(storeId)
        return
      }
      if (data.success && !data.verified) {
        if (bankPolicyMode === 'hybrid') {
          setAddBankForceManual(true)
          setAddBankVerifyError(data.message || 'Instant verification pending. Enter details and upload bank proof.')
        } else {
          setAddBankVerifyError(data.message || 'Could not verify instantly. Automatic verification is required.')
        }
        return
      }
      const err = data.error || 'Verification failed'
      setAddBankVerifyError(err)
      if (bankPolicyMode === 'hybrid') {
        setAddBankForceManual(true)
        toast.error(err)
      } else {
        toast.error(err)
      }
    } catch {
      const err = 'Verification request failed'
      setAddBankVerifyError(err)
      if (bankPolicyMode === 'hybrid') setAddBankForceManual(true)
      toast.error(err)
    } finally {
      setAddBankVerifying(false)
    }
  }

  const handleVerifyCashfree = async (acc: BankAccount) => {
    if (!storeId) return
    if (acc.is_verified) {
      toast.success('Account already verified')
      return
    }
    if (String(acc.payout_method || 'bank').toLowerCase() === 'upi') {
      toast.error('UPI add/verify is temporarily disabled. Please use a bank account.')
      return
    }
    const accountNumber = String(acc.account_number || '').replace(/\D/g, '')
    if (!accountNumber || !acc.ifsc_code || !acc.bank_name || !acc.account_holder_name) {
      toast.error('Bank details incomplete. Update the account and try again.')
      return
    }
    setBankVerifyLoading(acc.id)
    try {
      const res = await fetch('/api/merchant/bank-account/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          storeId,
          bankAccountId: acc.id,
          bank: {
            account_holder_name: acc.account_holder_name,
            account_number: accountNumber,
            ifsc_code: acc.ifsc_code,
            bank_name: acc.bank_name,
            branch_name: acc.branch_name || undefined,
          },
        }),
      })
      const data = await res.json()
      if (data.success && data.verified) {
        toast.success(data.message || 'Bank account verified')
        invalidateBankAccounts(storeId)
        if (selectedBankAccount?.id === acc.id) {
          setSelectedBankAccount({ ...acc, is_verified: true, verification_status: 'verified' })
        }
      } else if (data.success) {
        toast.success(data.message || 'Saved for manual verification')
        invalidateBankAccounts(storeId)
      } else {
        toast.error(data.error || 'Verification failed')
      }
    } catch {
      toast.error('Verification request failed')
    } finally {
      setBankVerifyLoading(null)
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
        resolveLedgerDisplayDescription(r).replace(/"/g, '""'),
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

  return (
    <>
      <MXLayoutWhite restaurantName={displayName} restaurantId={storeId || DEMO_RESTAURANT_ID}>
        <PartnerPageHeader title="Payments & Ledger" subtitle="Wallet balance and full transaction history" />
        <div className="mx-payments-page flex flex-1 flex-col min-h-0 h-0 w-full bg-[#f8fafc]">
          <div className="flex-1 min-h-0 h-0 overflow-y-auto overflow-x-hidden overscroll-contain hide-scrollbar bg-[#f8fafc]">
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
                  View refund &amp; cancellation policy
                </button>
                <button
                  onClick={openWithdrawalSheet}
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
              {/* Withdrawable - Primary Card */}
              <div className="bg-emerald-50 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">Withdrawable</p>
                    {showWalletSkeleton ? (
                      <div className="h-7 w-20 mt-1.5 bg-gray-200 rounded animate-pulse" />
                    ) : (
                      <p className="text-xl font-bold text-gray-900 mt-1">
                        {formatInr(wallet?.withdrawable_balance ?? wallet?.available_balance ?? 0)}
                      </p>
                    )}
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
                    {showWalletSkeleton ? (
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
                    {showWalletSkeleton ? (
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
                    {showWalletSkeleton ? (
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
                    {showWalletSkeleton ? (
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
                    {showWalletSkeleton ? (
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
              walletTotalEarned={wallet?.total_earned ?? 0}
            />

            {/* Bank & UPI + Quick Actions Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Bank & UPI Section */}
              <div className="lg:col-span-2 bg-white rounded-lg shadow-sm p-4 border border-gray-200">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <Building2 size={16} className="text-gray-700" />
                      Bank Accounts
                    </h3>
                    <p className="text-xs text-gray-600 mt-1">Add and verify bank accounts for payouts</p>
                  </div>
                  <button
                    onClick={() => { void openAddBankSheet() }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors flex-shrink-0"
                  >
                    <Plus size={14} />
                    Add Bank Account
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
                      <p className="text-sm text-gray-600 font-medium">No bank account added</p>
                      <p className="text-xs text-gray-500 mt-0.5">Add a bank account to start receiving payouts</p>
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
                              {acc.is_verified ? (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 whitespace-nowrap">Verified</span>
                              ) : (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">Pending</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {!acc.is_verified && String(acc.payout_method || 'bank').toLowerCase() !== 'upi' && (
                            <button
                              onClick={() => handleVerifyCashfree(acc)}
                              disabled={bankVerifyLoading === acc.id}
                              className="px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-700 text-xs font-medium hover:bg-indigo-50 transition-colors disabled:opacity-50"
                            >
                              {bankVerifyLoading === acc.id ? (
                                <span className="inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Verifying…</span>
                              ) : (
                                'Verify Account'
                              )}
                            </button>
                          )}
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
                    onClick={openWithdrawalSheet}
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

                  <Link
                    href={partnerPayoutHistoryHref(pathname)}
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
                  </Link>

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
                ) : displayLedger.length === 0 ? (
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
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">PG TNX ID</th>
                          <th className="text-right py-3 px-4 font-semibold text-gray-700">Amount</th>
                          <th className="text-center py-3 px-4 font-semibold text-gray-700">Status</th>
                          <th className="text-right py-3 px-4 font-semibold text-gray-700">Withdrawable After</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {displayLedger.map((row) => (
                          <React.Fragment key={row.id}>
                            <tr className={`transition-colors ${expandedLedgerId === row.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                              <td className="py-3 px-4">
                                {(row.reference_type === 'ORDER' && row.order_id != null) || ((row.category === 'WITHDRAWAL' || row.category === 'HOLD_LOCK') && row.reference_id != null) ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleExpand(row)}
                                    className="p-1 rounded hover:bg-gray-200 text-gray-600 hover:text-gray-900 transition-colors"
                                  >
                                    {expandedLedgerId === row.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                  </button>
                                ) : null}
                              </td>
                              <td className="py-3 px-4 font-medium text-gray-900">
                                {(() => {
                                  const meta = row.metadata as Record<string, unknown> | null
                                  const txType = String(meta?.transaction_type ?? '').trim()
                                  if (txType === 'COMPENSATION_CREDIT') return 'Compensation Credit'
                                  if (txType === 'COMPENSATION_RECOVERY') return 'Compensation Recovery'
                                  return formatCategory(row.category)
                                })()}
                              </td>
                              <td className="py-3 px-4 text-gray-600 font-mono text-xs">
                                {row.formatted_order_id ??
                                  (row.reference_type === 'ORDER' && row.reference_id != null
                                    ? `#${row.reference_id}`
                                    : '—')}
                              </td>
                              <td className="py-3 px-4 text-gray-600 whitespace-nowrap">{new Date(row.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td>
                              <td className="py-3 px-4 align-top text-gray-600 min-w-[200px] max-w-xs whitespace-normal break-words leading-relaxed">
                                {formatLedgerRowDescription(row)}
                              </td>
                              <td className="py-3 px-4 align-top text-gray-600 min-w-[160px]">
                                {row.category === 'WITHDRAWAL' ? (
                                  <PgTxnIdCell pgId={row.pg_transaction_id} />
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <LedgerEntryAmount display={resolveLedgerDisplayAmount(row)} />
                              </td>
                              <td className="py-3 px-4 text-center">
                                {(() => {
                                  if (isCancellationNoCreditEntry(row)) {
                                    return (
                                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
                                        <div className="w-2 h-2 rounded-full bg-amber-600"/>
                                        Cancelled
                                      </span>
                                    )
                                  }
                                  if (row.direction === 'CREDIT') {
                                    return (
                                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                                        <div className="w-2 h-2 rounded-full bg-emerald-600"/>
                                        Credit
                                      </span>
                                    )
                                  }
                                  return (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                                      <div className="w-2 h-2 rounded-full bg-red-600"/>
                                      Debit
                                    </span>
                                  )
                                })()}
                              </td>
                              <td className="py-3 px-4 text-right text-gray-700 tabular-nums">
                                {formatInr(row.balance_after)}
                              </td>
                            </tr>
                            {expandedLedgerId === row.id && (row.category === 'WITHDRAWAL' || row.category === 'HOLD_LOCK') && row.reference_id != null && (() => {
                              const payoutRefId = row.reference_id as number
                              const payoutDetail = payoutDetailsCache[payoutRefId]
                              return (
                              <tr className="bg-slate-50/60 border-b border-slate-200">
                                <td colSpan={9} className="p-0">
                                  <div className="px-4 pb-4 pt-1">
                                    {payoutDetailsLoading === payoutRefId ? (
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
                                            <div className="flex justify-between"><dt className="text-slate-500">Request ID</dt><dd className="font-medium tabular-nums">{payoutDetail?.payout?.id ?? '—'}</dd></div>
                                            <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd className="font-medium">{payoutDetail?.payout?.status ?? '—'}</dd></div>
                                            <div className="flex justify-between"><dt className="text-slate-500">Requested</dt><dd>{payoutDetail?.payout?.requested_at ? new Date(payoutDetail.payout.requested_at).toLocaleString('en-IN') : '—'}</dd></div>
                                            {payoutDetail?.payout?.pg_transaction_id && (
                                              <div className="flex justify-between gap-3">
                                                <dt className="shrink-0 text-slate-500">PG TNX ID</dt>
                                                <dd className="flex items-start justify-end gap-1.5 text-right">
                                                  <span className="font-mono text-xs break-all">
                                                    {payoutDetail.payout.pg_transaction_id}
                                                  </span>
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      void copyTextToClipboard(
                                                        payoutDetail.payout.pg_transaction_id!,
                                                        'PG TNX ID copied'
                                                      )
                                                    }
                                                    className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                                    title="Copy PG TNX ID"
                                                    aria-label="Copy PG TNX ID"
                                                  >
                                                    <Copy size={14} />
                                                  </button>
                                                </dd>
                                              </div>
                                            )}
                                            {payoutDetail?.payout?.utr_reference && (
                                              <div className="flex justify-between"><dt className="text-slate-500">UTR</dt><dd className="font-mono text-xs">{payoutDetail.payout.utr_reference}</dd></div>
                                            )}
                                            <div className="flex justify-between"><dt className="text-slate-500">Amount</dt><dd className="font-medium">{payoutDetail?.payout?.amount != null ? formatInr(payoutDetail.payout.amount) : '—'}</dd></div>
                                            {payoutDetail?.payout?.status === 'COMPLETED' && storeId && (
                                              <div className="pt-2 mt-2 border-t border-slate-100">
                                                <dt className="text-slate-500 text-xs mb-1">Invoice</dt>
                                                <dd className="flex gap-2 flex-wrap">
                                                  <a
                                                    href={`/api/merchant/invoice/${payoutRefId}?storeId=${encodeURIComponent(storeId)}&format=pdf`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700"
                                                  >
                                                    <FileText size={14} />
                                                    PDF
                                                  </a>
                                                  <a
                                                    href={`/api/merchant/invoice/${payoutRefId}?storeId=${encodeURIComponent(storeId)}&format=csv`}
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
                                            const bank = payoutDetail?.bank;
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
                              )
                            })()}
                            {expandedLedgerId === row.id && row.order_id != null && (
                              <tr className="bg-slate-50/60 border-b border-slate-200">
                                <td colSpan={9} className="p-0">
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
        </div>
      </MXLayoutWhite>

      {/* Withdraw sidesheet — portal to body (same as Store status: covers header + blurs rest) */}
      {showWithdrawal &&
        typeof document !== 'undefined' &&
        createPortal(
        <div className="fixed inset-0 z-[1100] flex justify-end" role="presentation">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            aria-hidden
            onClick={() => setShowWithdrawal(false)}
          />
          <aside
            className="relative flex h-dvh min-h-0 w-full max-w-md flex-col overflow-hidden border-l border-gray-200 bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="withdraw-sheet-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-shrink-0 px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-white">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-emerald-50">
                  <Wallet className="text-emerald-600 shrink-0" size={20} />
                </div>
                <div className="min-w-0">
                  <h2 id="withdraw-sheet-title" className="text-lg font-bold text-gray-900">Withdraw</h2>
                  <p className="text-xs text-gray-500 truncate">
                    Available {formatInr(wallet?.withdrawable_balance ?? wallet?.available_balance ?? 0)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowWithdrawal(false)}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar px-5 py-5 space-y-5">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Withdrawable balance</p>
                <p className="text-2xl font-bold text-emerald-900 mt-1 tabular-nums">
                  {formatInr(wallet?.withdrawable_balance ?? wallet?.available_balance ?? 0)}
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-2">Withdrawal amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 font-bold">₹</span>
                  <input
                    type="number"
                    min={MIN_WITHDRAWAL}
                    max={maxWithdrawalLimit}
                    step="1"
                    value={withdrawalAmount}
                    onChange={(e) => handleWithdrawalAmountChange(e.target.value)}
                    placeholder={withdrawalInputEnabled ? `Min ₹${MIN_WITHDRAWAL}` : 'Insufficient balance'}
                    className="w-full pl-9 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 outline-none text-lg font-semibold disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                    disabled={!withdrawalInputEnabled}
                  />
                </div>
                {(() => {
                  const amt = parseFloat(withdrawalAmount)
                  if (!withdrawalInputEnabled) {
                    return (
                      <p className="text-xs text-amber-700 mt-2">
                        Withdrawal unavailable — minimum ₹{MIN_WITHDRAWAL} required in your balance.
                      </p>
                    )
                  }
                  if (!isNaN(amt) && amt >= MIN_WITHDRAWAL) {
                    return (
                      <p className="text-xs text-emerald-700 mt-2 font-medium">
                        You receive full amount: {formatInr(amt)}
                      </p>
                    )
                  }
                  return (
                    <p className="text-xs text-gray-500 mt-2">
                      Minimum ₹{MIN_WITHDRAWAL} · Maximum {formatInr(maxWithdrawalLimit)} (up to ₹1,00,000 per request)
                    </p>
                  )
                })()}
                {withdrawalInputEnabled && withdrawalAmount.trim() !== '' && !isNaN(parseFloat(withdrawalAmount)) && parseFloat(withdrawalAmount) >= MIN_WITHDRAWAL && (
                  <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                    Feel free to adjust the withdrawal amount as needed, as long as it does not exceed your available balance.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
                  <Building2 size={16} className="text-emerald-600" />
                  Withdraw to
                </label>
                {bankAccountsLoading ? (
                  <div className="py-8 flex items-center justify-center gap-2 text-gray-500 text-sm">
                    <Loader2 size={18} className="animate-spin" />
                    Loading accounts…
                  </div>
                ) : bankAccounts.filter((a) => !a.is_disabled).length === 0 ? (
                  <div className="py-6 px-4 border border-dashed border-gray-300 rounded-xl text-center bg-gray-50">
                    <CreditCard size={28} className="mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-600 mb-3">No active bank account</p>
                    <button
                      type="button"
                      onClick={() => { setShowWithdrawal(false); void openAddBankSheet() }}
                      className="text-sm px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700"
                    >
                      Add account
                    </button>
                  </div>
                ) : (() => {
                  const activeAccounts = bankAccounts.filter((a) => !a.is_disabled)
                  const formatAccountLabel = (account: BankAccount) =>
                    account.payout_method === 'upi'
                      ? `${account.account_holder_name} · UPI ${account.upi_id ?? '—'}`
                      : `${account.account_holder_name} · ${account.bank_name ?? 'Bank'} ${account.account_number_masked ?? '****'}`

                  if (activeAccounts.length > 1) {
                    return (
                      <div className="space-y-2">
                        <select
                          value={withdrawBankId === '' ? '' : String(withdrawBankId)}
                          onChange={(e) => setWithdrawBankId(e.target.value ? Number(e.target.value) : '')}
                          disabled={isWithdrawing}
                          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm font-medium text-gray-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none disabled:opacity-50"
                        >
                          <option value="" disabled>Select bank account</option>
                          {activeAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {formatAccountLabel(account)}
                              {account.is_primary ? ' (Default)' : ''}
                            </option>
                          ))}
                        </select>
                        {withdrawBankId !== '' && (
                          <p className="text-xs text-gray-500 px-1">
                            Selected account will receive the withdrawal.
                          </p>
                        )}
                      </div>
                    )
                  }

                  const account = activeAccounts[0]
                  return (
                    <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3">
                      <p className="text-sm font-semibold text-gray-900">{account.account_holder_name}</p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {account.payout_method === 'upi'
                          ? `UPI · ${account.upi_id ?? '—'}`
                          : `${account.bank_name ?? 'Bank'} · ${account.account_number_masked ?? '****'}`}
                      </p>
                    </div>
                  )
                })()}
              </div>

              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <Clock size={14} className="shrink-0" />
                Funds arrive within 24 to 48 hrs
              </p>
            </div>

            <div className="flex-shrink-0 border-t border-gray-200 px-5 py-4 flex gap-3 bg-white">
              <button
                type="button"
                onClick={() => setShowWithdrawal(false)}
                disabled={isWithdrawing}
                className="flex-1 py-3 text-sm text-gray-700 border border-gray-300 rounded-xl hover:bg-gray-50 font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleWithdrawal}
                disabled={
                  isWithdrawing
                  || !withdrawalInputEnabled
                  || !withdrawalAmount
                  || parseFloat(withdrawalAmount) < MIN_WITHDRAWAL
                  || parseFloat(withdrawalAmount) > maxWithdrawalLimit
                  || (withdrawBankId !== '' && !bankAccounts.some((a) => a.id === withdrawBankId && !a.is_disabled))
                  || (bankAccounts.filter((a) => !a.is_disabled).length === 0)
                }
                className="flex-1 py-3 text-sm bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isWithdrawing ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Processing…
                  </>
                ) : (
                  <>
                    <ArrowDownToLine size={18} />
                    Withdraw
                  </>
                )}
              </button>
            </div>
          </aside>
        </div>,
        document.body
      )}

      {/* Refund Policy right-sheet */}
      {showRefundPolicy && (
        <div className="fixed inset-0 z-[9999] flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowRefundPolicy(false)} />
          <aside className="relative ml-auto w-full max-w-3xl h-full bg-white shadow-2xl flex flex-col overflow-hidden border-l border-gray-200">
            <div className="flex-shrink-0 px-4 sm:px-5 py-4 border-b border-gray-200 bg-white/95 backdrop-blur flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.18em] text-orange-600 font-semibold">Policy</p>
                <h2 className="text-base sm:text-lg font-bold text-gray-900 leading-tight">Refund &amp; Cancellation Policy</h2>
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
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs text-gray-500">Verification</p>
                  <p className={`font-semibold ${selectedBankAccount.is_verified ? 'text-green-600' : 'text-amber-600'}`}>
                    {selectedBankAccount.is_verified ? 'Verified' : 'Pending'}
                  </p>
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-gray-200 flex flex-wrap gap-2 bg-gray-50">
              {!selectedBankAccount.is_verified && String(selectedBankAccount.payout_method || 'bank').toLowerCase() !== 'upi' && (
                <button
                  type="button"
                  onClick={() => handleVerifyCashfree(selectedBankAccount)}
                  disabled={bankVerifyLoading === selectedBankAccount.id}
                  className="flex-1 min-w-[140px] py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {bankVerifyLoading === selectedBankAccount.id ? <Loader2 size={16} className="animate-spin" /> : null}
                  Verify Account
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowManageBank(false)}
                className="flex-1 min-w-[100px] py-2.5 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-white"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleDisableBank}
                disabled={selectedBankAccount.is_disabled || bankActionLoading === selectedBankAccount.id}
                className="flex-1 min-w-[120px] py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {bankActionLoading === selectedBankAccount.id ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
                {selectedBankAccount.is_disabled ? 'Disabled' : 'Disable account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Bank sidesheet — portal to body (same as Store status) */}
      {showAddBank &&
        typeof document !== 'undefined' &&
        createPortal(
        <div className="fixed inset-0 z-[1100] flex justify-end" role="presentation">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            aria-hidden
            onClick={() => { setShowAddBank(false); resetAddBankSheet() }}
          />
          <aside
            className="relative flex h-dvh min-h-0 w-full max-w-md flex-col overflow-hidden border-l border-gray-200 bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-bank-sheet-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-shrink-0 px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-white">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-emerald-50">
                  <Building2 className="text-emerald-600 shrink-0" size={20} />
                </div>
                <div className="min-w-0">
                  <h2 id="add-bank-sheet-title" className="text-lg font-bold text-gray-900">Add bank account</h2>
                  <p className="text-xs text-gray-500 truncate">
                    {bankPolicyLoading
                      ? 'Loading…'
                      : bankPolicyMode === 'auto'
                        ? 'Auto verify'
                        : bankPolicyMode === 'hybrid'
                          ? 'Auto verify · manual fallback'
                          : 'Manual add with bank proof'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setShowAddBank(false); resetAddBankSheet() }}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar px-5 py-5 space-y-4">
              {bankPolicyLoading ? (
                <div className="flex items-center justify-center py-16 text-gray-500 gap-2 text-sm">
                  <Loader2 size={18} className="animate-spin" />
                  Loading…
                </div>
              ) : (
                <>
                  {bankPolicyMode === 'auto' && addBankVerifyError && !addBankForceManual && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
                      <span className="font-semibold">Verification failed. </span>
                      {addBankVerifyError} Fix the details and retry.
                    </div>
                  )}

                  {/* Auto / hybrid electronic step: account number + IFSC only */}
                  {isElectronicBankMode && !addBankForceManual && !addBankElectronicVerified && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Account number *</label>
                        <input
                          type="text"
                          value={addBankForm.account_number}
                          onChange={(e) => setAddBankForm((f) => ({ ...f, account_number: e.target.value.replace(/\D/g, '').slice(0, 18) }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-xl font-mono"
                          placeholder="Account number"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">IFSC *</label>
                        <input
                          type="text"
                          value={addBankForm.ifsc_code}
                          onChange={(e) => setAddBankForm((f) => ({ ...f, ifsc_code: e.target.value.toUpperCase().slice(0, 11) }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-xl font-mono uppercase"
                          placeholder="e.g. SBIN0001234"
                        />
                      </div>
                    </>
                  )}

                  {addBankElectronicVerified && (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
                        <p className="font-semibold flex items-center gap-1.5">
                          <Check size={16} className="text-emerald-600" />
                          Account verified
                        </p>
                        <p className="text-xs text-emerald-700 mt-1">Confirm account type and save. No bank proof needed.</p>
                      </div>
                      {addBankForm.account_holder_name ? (
                        <div className="text-xs text-gray-600">
                          <span className="text-gray-500">Holder:</span>{' '}
                          <span className="font-semibold text-gray-900">{addBankForm.account_holder_name}</span>
                        </div>
                      ) : null}
                      <div className="text-xs text-gray-600">
                        <span className="text-gray-500">Account:</span>{' '}
                        <span className="font-semibold text-gray-900 font-mono">{addBankForm.account_number}</span>
                        {' · '}
                        <span className="font-semibold text-gray-900 font-mono">{addBankForm.ifsc_code}</span>
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
                    </div>
                  )}

                  {/* Manual form (policy manual, or hybrid fallback) */}
                  {(bankPolicyMode === 'manual' || addBankForceManual) && !addBankElectronicVerified && (
                    <div className="space-y-4">
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
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Account number *</label>
                        <input
                          type="text"
                          value={addBankForm.account_number}
                          onChange={(e) => setAddBankForm((f) => ({ ...f, account_number: e.target.value.replace(/\D/g, '').slice(0, 18) }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-xl font-mono"
                          placeholder="Account number"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">IFSC *</label>
                        <input
                          type="text"
                          value={addBankForm.ifsc_code}
                          onChange={(e) => setAddBankForm((f) => ({ ...f, ifsc_code: e.target.value.toUpperCase().slice(0, 11) }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-xl font-mono uppercase"
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
                      <div className="border-t border-gray-200 pt-4 space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Bank proof (cancelled cheque / statement / passbook) *
                          </label>
                          <p className="text-xs text-gray-500 mb-2">Upload a clear image or PDF showing account details.</p>
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
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex-shrink-0 p-5 border-t border-gray-200 flex flex-col gap-2 bg-gray-50">
              {isElectronicBankMode && !addBankForceManual && !addBankElectronicVerified && (
                <button
                  type="button"
                  onClick={() => void handleElectronicVerify()}
                  disabled={addBankVerifying || bankPolicyLoading}
                  className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {addBankVerifying ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                  Verify Account
                </button>
              )}
              {(addBankElectronicVerified || bankPolicyMode === 'manual' || addBankForceManual) && (
                <button
                  type="button"
                  onClick={() =>
                    void handleAddBank({
                      skipProof: addBankElectronicVerified,
                      alreadyVerified: addBankElectronicVerified,
                    })
                  }
                  disabled={
                    addBankSubmitting ||
                    !addBankForm.account_type ||
                    (!addBankElectronicVerified &&
                      (!bankProofFile ||
                        !addBankForm.bank_proof_type ||
                        (addBankForm.bank_proof_type !== 'passbook' &&
                          addBankForm.bank_proof_type !== 'cancelled_cheque' &&
                          addBankForm.bank_proof_type !== 'bank_statement')))
                  }
                  className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {addBankSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                  {addBankElectronicVerified ? 'Save verified account' : 'Add account'}
                </button>
              )}
              <button
                type="button"
                onClick={() => { setShowAddBank(false); resetAddBankSheet() }}
                className="w-full py-2.5 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-white"
              >
                Cancel
              </button>
            </div>
          </aside>
        </div>,
        document.body
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
