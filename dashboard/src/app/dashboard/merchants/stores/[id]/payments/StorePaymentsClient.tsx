"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import {
  Wallet,
  X,
  Filter,
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
  Search,
  FileImage,
  ArrowDownToLine,
  Clock,
} from "lucide-react";
import { formatInr } from "@/lib/format-inr";
import {
  PaymentsOverviewCharts,
  type WalletAnalyticsPeriod,
} from "@/components/merchants/payments/PaymentsOverviewCharts";
import { useToast } from "@/context/ToastContext";
import { useMerchantDashboardAccess } from "@/hooks/useMerchantDashboardAccess";
import { WalletRequestsSection } from "@/components/merchants/WalletRequestsSection";
import {
  type WalletSummary,
  type BankAccount,
  type LedgerEntry,
  useGetStoreWalletQuery,
  useGetStoreLedgerQuery,
  useGetBankAccountsQuery,
  useLazyGetPayoutQuoteQuery,
  useCreatePayoutRequestMutation,
} from "@/store/api/merchantStoreApi";
import { useMerchantWalletRequestsSummaryQuery } from "@/hooks/queries/useMerchantWalletRequestsSummaryQuery";
import { useStore } from "@/hooks/useStore";
import { RefundPolicyContent } from "@/components/RefundPolicyContent";

const LEDGER_CATEGORIES = [
  "ORDER_EARNING",
  "ORDER_ADJUSTMENT",
  "REFUND_REVERSAL",
  "FAILED_WITHDRAWAL_REVERSAL",
  "BONUS",
  "CASHBACK",
  "MANUAL_CREDIT",
  "SUBSCRIPTION_REFUND",
  "WITHDRAWAL",
  "PENALTY",
  "SUBSCRIPTION_FEE",
  "COMMISSION_DEDUCTION",
  "ADJUSTMENT",
  "REFUND_TO_CUSTOMER",
  "MANUAL_DEBIT",
  "TAX_ADJUSTMENT",
] as const;

interface OrderDetailItem {
  id: number;
  item_name: string;
  item_title: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  item_type: string | null;
}

interface OrderDetailRider {
  id: number;
  rider_id: number;
  rider_name: string | null;
  rider_mobile: string | null;
  assignment_status: string;
  assigned_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  reached_merchant_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
}

type OrderDetailsCache = { [key: number]: { items: OrderDetailItem[]; riders: OrderDetailRider[] } };

interface PayoutDetailItem {
  payout: {
    id: number;
    amount: number;
    net_payout_amount: number;
    commission_percentage: number;
    commission_amount: number;
    status: string;
    utr_reference: string | null;
    requested_at: string;
  };
  bank: {
    account_holder_name: string;
    account_number_masked: string | null;
    bank_name: string;
    payout_method: string;
    upi_id: string | null;
    ifsc_code?: string | null;
  } | null;
}
type PayoutDetailsCache = { [key: number]: PayoutDetailItem };

function formatCategory(cat: string): string {
  return cat.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function pctChangeLabel(current: number, prior: number): { text: string; positive: boolean } {
  if (prior === 0) {
    if (current === 0) return { text: "0%", positive: true };
    return { text: "+100%", positive: true };
  }
  const pct = Math.round(((current - prior) / prior) * 100);
  return { text: `${pct > 0 ? "+" : ""}${pct}%`, positive: pct >= 0 };
}

export function StorePaymentsClient({
  storeId,
  initialRefundPolicyOpen = false,
}: {
  storeId: string;
  initialRefundPolicyOpen?: boolean;
}) {
  const { toast } = useToast();
  const { canManageBank, isViewOnly } = useMerchantDashboardAccess();
  const canEditBankAccounts = canManageBank && !isViewOnly;
  const { store } = useStore(storeId);
  const storeName = store?.store_name ?? store?.name ?? "";
  const [showRefundPolicy, setShowRefundPolicy] = useState(initialRefundPolicyOpen);
  const [showWithdrawal, setShowWithdrawal] = useState(false);
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const [ledgerLimit] = useState(50);
  const [ledgerOffset, setLedgerOffset] = useState(0);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterDirection, setFilterDirection] = useState<"all" | "CREDIT" | "DEBIT">("all");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterSearch, setFilterSearch] = useState("");

  const [analyticsPeriod, setAnalyticsPeriod] = useState<WalletAnalyticsPeriod>("week");
  const ledgerSectionRef = useRef<HTMLDivElement>(null);

  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  const [showAddBank, setShowAddBank] = useState(false);
  const [bankActionLoading, setBankActionLoading] = useState<number | null>(null);
  const [withdrawBankId, setWithdrawBankId] = useState<number | "">("");
  const [addBankForm, setAddBankForm] = useState({
    payout_method: "bank" as "bank" | "upi",
    account_holder_name: "",
    account_number: "",
    ifsc_code: "",
    bank_name: "",
    branch_name: "",
    upi_id: "",
    bank_proof_type: "" as "" | "passbook" | "cancelled_cheque" | "bank_statement",
    bank_proof_file_url: "",
  });
  const [bankProofFile, setBankProofFile] = useState<File | null>(null);
  const [bankProofUploading, setBankProofUploading] = useState(false);
  const [addBankSubmitting, setAddBankSubmitting] = useState(false);

  const [payoutQuote, setPayoutQuote] = useState<{
    requested_amount: number;
    commission_percentage: number;
    commission_amount: number;
    gst_on_commission_percent: number;
    gst_on_commission: number;
    tds_amount: number;
    tax_amount: number;
    net_payout_amount: number;
  } | null>(null);
  const [payoutQuoteLoading, setPayoutQuoteLoading] = useState(false);

  const [expandedLedgerId, setExpandedLedgerId] = useState<number | null>(null);
  const [expandedRidersLedgerId, setExpandedRidersLedgerId] = useState<number | null>(null);
  const [orderDetailsCache, setOrderDetailsCache] = useState<OrderDetailsCache>({});
  const [orderDetailsLoading, setOrderDetailsLoading] = useState<number | null>(null);
  const [payoutDetailsCache, setPayoutDetailsCache] = useState<PayoutDetailsCache>({});
  const [payoutDetailsLoading, setPayoutDetailsLoading] = useState<number | null>(null);

  const ledgerParams = useMemo(
    () => ({
      storeId,
      limit: ledgerLimit,
      offset: ledgerOffset,
      from: filterFrom || undefined,
      to: filterTo || undefined,
      direction: filterDirection !== "all" ? filterDirection : undefined,
      category: filterCategory || undefined,
      search: filterSearch || undefined,
    }),
    [
      storeId,
      ledgerLimit,
      ledgerOffset,
      filterFrom,
      filterTo,
      filterDirection,
      filterCategory,
      filterSearch,
    ]
  );

  const {
    data: walletQueryData,
    isLoading: walletQueryLoading,
    isFetching: walletFetching,
  } = useGetStoreWalletQuery(storeId, {
    skip: !storeId,
  });

  const { data: walletRequestsSummaryData } = useMerchantWalletRequestsSummaryQuery(storeId);

  const {
    data: ledgerQueryData,
    isLoading: ledgerQueryLoading,
    isFetching: ledgerFetching,
  } = useGetStoreLedgerQuery(ledgerParams, {
    skip: !storeId,
  });

  const {
    data: bankAccountsQueryData,
    isLoading: bankAccountsQueryLoading,
    refetch: refetchBankAccounts,
  } = useGetBankAccountsQuery(storeId, {
    skip: !storeId,
  });

  const [triggerPayoutQuote] = useLazyGetPayoutQuoteQuery();
  const [createPayoutRequest] = useCreatePayoutRequestMutation();

  useEffect(() => {
    if (walletQueryData) {
      setWallet(walletQueryData);
    }
  }, [walletQueryData]);

  useEffect(() => {
    if (bankAccountsQueryData) {
      setBankAccounts(bankAccountsQueryData);
    }
  }, [bankAccountsQueryData]);

  const walletLoading = walletQueryLoading || walletFetching;

  const ledger: LedgerEntry[] = useMemo(
    () => (ledgerQueryData?.entries ?? []) as LedgerEntry[],
    [ledgerQueryData]
  );
  const ledgerTotal = ledgerQueryData?.total ?? 0;
  const ledgerLoading = ledgerQueryLoading || ledgerFetching;

  const bankAccountsLoading = bankAccountsQueryLoading;

  useEffect(() => {
    if (bankAccounts.length === 0) return;
    const defaultAcc =
      bankAccounts.find((a) => a.is_primary && !a.is_disabled) ??
      bankAccounts.find((a) => !a.is_disabled) ??
      bankAccounts[0];
    const currentInvalid =
      withdrawBankId !== "" && !bankAccounts.some((a) => a.id === withdrawBankId && !a.is_disabled);
    if (defaultAcc && (withdrawBankId === "" || currentInvalid)) setWithdrawBankId(defaultAcc.id);
  }, [bankAccounts, withdrawBankId]);

  useEffect(() => {
    if (!showWithdrawal || !storeId) {
      setPayoutQuote(null);
      return;
    }
    const amount = parseFloat(withdrawalAmount);
    if (isNaN(amount) || amount < 100) {
      setPayoutQuote(null);
      return;
    }
    setPayoutQuoteLoading(true);
    triggerPayoutQuote({ storeId, amount })
      .unwrap()
      .then((data) => {
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
          });
        } else {
          setPayoutQuote(null);
        }
      })
      .catch(() => {
        setPayoutQuote(null);
      })
      .finally(() => {
        setPayoutQuoteLoading(false);
      });
  }, [showWithdrawal, storeId, triggerPayoutQuote, withdrawalAmount]);

  const applyFilters = () => setLedgerOffset(0);
  const clearFilters = () => {
    setFilterFrom("");
    setFilterTo("");
    setFilterDirection("all");
    setFilterCategory("");
    setFilterSearch("");
    setLedgerOffset(0);
  };

  const todayVsYesterday = pctChangeLabel(
    wallet?.today_earning ?? 0,
    wallet?.yesterday_earning ?? 0
  );

  const payoutSummaryForCharts = useMemo(
    () => ({
      paid: wallet?.total_withdrawn ?? 0,
      in_process: 0,
      pending: wallet?.pending_withdrawal_total ?? 0,
      failed: 0,
      total:
        (wallet?.total_withdrawn ?? 0) + (wallet?.pending_withdrawal_total ?? 0),
    }),
    [wallet]
  );

  const scrollToLedger = useCallback((opts?: { category?: string }) => {
    if (opts?.category) setFilterCategory(opts.category);
    setLedgerOffset(0);
    requestAnimationFrame(() => {
      ledgerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const downloadLedgerCsv = useCallback(async () => {
    if (!storeId) return;
    try {
      const search = new URLSearchParams({
        limit: "2000",
        offset: "0",
      });
      if (filterFrom) search.set("from", filterFrom);
      if (filterTo) search.set("to", filterTo);
      if (filterDirection !== "all") search.set("direction", filterDirection);
      if (filterCategory) search.set("category", filterCategory);
      const res = await fetch(`/api/merchant/stores/${storeId}/ledger?${search}`);
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Could not export ledger");
        return;
      }
      const rows = (data.entries ?? []) as LedgerEntry[];
      const header = ["Date", "Category", "Description", "Direction", "Amount", "Balance after"];
      const lines = rows.map((r) => [
        new Date(r.created_at).toISOString(),
        r.category,
        (r.description ?? "").replace(/"/g, '""'),
        r.direction,
        String(r.amount),
        String(r.balance_after),
      ]);
      const csv = [header, ...lines]
        .map((line) => line.map((c) => `"${c}"`).join(","))
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ledger-${storeId}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast("Ledger downloaded");
    } catch {
      toast("Export failed");
    }
  }, [storeId, filterFrom, filterTo, filterDirection, filterCategory, toast]);

  const handleWithdrawal = async () => {
    const amount = parseFloat(withdrawalAmount);
    if (!storeId || isNaN(amount) || amount < 100) {
      toast("Enter a valid amount (min ₹100)");
      return;
    }
    const available = wallet?.withdrawable_balance ?? wallet?.available_balance ?? 0;
    if (available < 100) {
      toast("Available balance is below the minimum withdrawal (₹100).");
      return;
    }
    if (amount > available) {
      toast("Requested amount exceeds your available balance.");
      return;
    }
    const bankId = withdrawBankId === "" ? null : Number(withdrawBankId);
    if (bankId == null || !bankAccounts.some((a) => a.id === bankId && !a.is_disabled)) {
      toast("Select a bank account");
      return;
    }
    setIsWithdrawing(true);
    try {
      const result = await createPayoutRequest({
        storeId,
        amount,
        bank_account_id: bankId,
      }).unwrap();
      if (result.success) {
        setWithdrawalAmount("");
        setShowWithdrawal(false);
        setPayoutQuote(null);
        toast("Withdrawal request submitted. You will receive the net amount in 2–3 business days.");
      } else {
        toast(result.error || "Request failed. Please try again.");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Request failed. Please try again.");
    } finally {
      setIsWithdrawing(false);
    }
  };

  const fetchOrderDetails = useCallback(
    async (orderId: number) => {
      if (!storeId) return;
      setOrderDetailsLoading(orderId);
      try {
        const res = await fetch(
          `/api/merchant/stores/${storeId}/order-details?orderId=${orderId}`
        );
        const data = await res.json();
        if (data.success) {
          setOrderDetailsCache((prev) => ({
            ...prev,
            [orderId]: { items: data.items ?? [], riders: data.riders ?? [] },
          }));
        } else {
          setOrderDetailsCache((prev) => ({ ...prev, [orderId]: { items: [], riders: [] } }));
        }
      } catch {
        setOrderDetailsCache((prev) => ({ ...prev, [orderId]: { items: [], riders: [] } }));
      } finally {
        setOrderDetailsLoading(null);
      }
    },
    [storeId]
  );

  const fetchPayoutDetails = useCallback(
    async (payoutRequestId: number) => {
      if (!storeId) return;
      setPayoutDetailsLoading(payoutRequestId);
      try {
        const res = await fetch(
          `/api/merchant/stores/${storeId}/payout-request/${payoutRequestId}`
        );
        const data = await res.json();
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
          }));
        } else {
          setPayoutDetailsCache((prev) => ({
            ...prev,
            [payoutRequestId]: { payout: data.payout ?? {}, bank: null },
          }));
        }
      } catch {
        setPayoutDetailsCache((prev) => ({
          ...prev,
          [payoutRequestId]: { payout: {} as never, bank: null },
        }));
      } finally {
        setPayoutDetailsLoading(null);
      }
    },
    [storeId]
  );

  const toggleExpand = (entry: LedgerEntry) => {
    if (expandedLedgerId === entry.id) {
      setExpandedLedgerId(null);
      setExpandedRidersLedgerId(null);
      return;
    }
    setExpandedLedgerId(entry.id);
    setExpandedRidersLedgerId(null);
    if (entry.order_id != null && !orderDetailsCache[entry.order_id]) fetchOrderDetails(entry.order_id);
    if (
      entry.category === "WITHDRAWAL" &&
      entry.reference_id != null &&
      !payoutDetailsCache[entry.reference_id]
    )
      fetchPayoutDetails(entry.reference_id);
  };

  const toggleRidersExpand = (ledgerId: number) => {
    setExpandedRidersLedgerId((prev) => (prev === ledgerId ? null : ledgerId));
  };

  const handleAddBank = async () => {
    const {
      payout_method,
      account_holder_name,
      account_number,
      ifsc_code,
      bank_name,
      branch_name,
      upi_id,
      bank_proof_type,
    } = addBankForm;
    if (!account_holder_name.trim() || !account_number.trim()) {
      toast("Account holder name and account number are required");
      return;
    }
    if (payout_method === "bank" && (!ifsc_code.trim() || !bank_name.trim())) {
      toast("IFSC and bank name are required for bank account");
      return;
    }
    if (payout_method === "upi" && !upi_id.trim()) {
      toast("UPI ID is required for UPI");
      return;
    }
    const proofType =
      bank_proof_type === "passbook" ||
      bank_proof_type === "cancelled_cheque" ||
      bank_proof_type === "bank_statement"
        ? bank_proof_type
        : null;
    if (!proofType) {
      toast("Please select proof type (passbook, cancelled cheque, or bank statement)");
      return;
    }
    if (!bankProofFile) {
      toast("Please upload cancelled cheque, bank statement, or passbook");
      return;
    }
    if (!storeId) return;
    setAddBankSubmitting(true);
    setBankProofUploading(true);
    let bankProofUrl = addBankForm.bank_proof_file_url;
    try {
      const formData = new FormData();
      formData.append("file", bankProofFile);
      const uploadRes = await fetch(`/api/merchant/stores/${storeId}/bank-accounts/upload`, {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.url) {
        toast(uploadData.error || "Upload failed");
        setBankProofUploading(false);
        setAddBankSubmitting(false);
        return;
      }
      bankProofUrl = uploadData.url;
      setBankProofUploading(false);
      const res = await fetch(`/api/merchant/stores/${storeId}/bank-accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payout_method,
          account_holder_name: account_holder_name.trim(),
          account_number:
            (payout_method === "upi" && !account_number.trim() ? upi_id.trim() : account_number.trim()) ||
            upi_id.trim(),
          ifsc_code: ifsc_code.trim() || undefined,
          bank_name: bank_name.trim() || undefined,
          branch_name: branch_name.trim() || undefined,
          upi_id: payout_method === "upi" ? upi_id.trim() : undefined,
          bank_proof_type: proofType,
          bank_proof_file_url: bankProofUrl,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast("Bank/UPI account added");
        setShowAddBank(false);
        setAddBankForm({
          payout_method: "bank",
          account_holder_name: "",
          account_number: "",
          ifsc_code: "",
          bank_name: "",
          branch_name: "",
          upi_id: "",
          bank_proof_type: "",
          bank_proof_file_url: "",
        });
        setBankProofFile(null);
        void refetchBankAccounts();
      } else {
        toast(data.error || "Failed to add");
      }
    } catch {
      toast("Failed to add account");
      setBankProofUploading(false);
    } finally {
      setAddBankSubmitting(false);
    }
  };

  const patchBankAccount = async (
    accountId: number,
    body: { set_default?: boolean; set_disabled?: boolean }
  ) => {
    if (!storeId) return;
    setBankActionLoading(accountId);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/bank-accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        if (body.set_default) toast("Set as default");
        else if (body.set_disabled === true) toast("Account disabled");
        else if (body.set_disabled === false) toast("Account enabled");
        void refetchBankAccounts();
      } else toast(data.error || "Failed");
    } catch {
      toast("Failed");
    } finally {
      setBankActionLoading(null);
    }
  };

  return (
    <>
    <div className="flex flex-1 flex-col min-h-0 h-full w-full bg-[#f8fafc] overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-6">
      <div className="bg-white">
        <div className="px-4 sm:px-6 lg:px-8 py-2.5 max-w-7xl mx-auto w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 min-w-0">
          <div>
            <h1 className="text-base font-semibold text-gray-900">Overview</h1>
            {storeName ? (
              <p className="text-xs text-gray-500 mt-0.5 truncate">{storeName}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowRefundPolicy(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors"
            >
              <FileText size={16} />
              View refund policy
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-4 max-w-7xl mx-auto w-full space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-1 bg-emerald-50 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">Withdrawable</p>
                {walletLoading ? (
                  <div className="h-7 w-20 mt-1.5 bg-gray-200 rounded animate-pulse" />
                ) : (
                  <>
                    <p className="text-xl font-bold text-gray-900 mt-1">
                      {formatInr(wallet?.withdrawable_balance ?? wallet?.available_balance ?? 0)}
                    </p>
                  </>
                )}
              </div>
              <div className="p-2 rounded-lg bg-emerald-100 flex-shrink-0">
                <Wallet size={16} className="text-emerald-700" />
              </div>
            </div>
          </div>

          <div className="bg-blue-50 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">Today&apos;s Earning</p>
                {walletLoading ? (
                  <div className="h-7 w-16 mt-1.5 bg-gray-200 rounded animate-pulse" />
                ) : (
                  <p className="text-xl font-bold text-gray-900 mt-1">{formatInr(wallet?.today_earning ?? 0)}</p>
                )}
                <p className="text-[10px] text-gray-600 mt-1">
                  vs yesterday{" "}
                  <span className={`font-semibold ${todayVsYesterday.positive ? "text-emerald-600" : "text-red-600"}`}>
                    {todayVsYesterday.text}
                  </span>
                </p>
              </div>
              <div className="p-2 rounded-lg bg-blue-100 flex-shrink-0">
                <TrendingUp size={16} className="text-blue-700" />
              </div>
            </div>
          </div>

          <div className="bg-purple-50 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">Yesterday&apos;s Earning</p>
                {walletLoading ? (
                  <div className="h-7 w-16 mt-1.5 bg-gray-200 rounded animate-pulse" />
                ) : (
                  <p className="text-xl font-bold text-gray-900 mt-1">{formatInr(wallet?.yesterday_earning ?? 0)}</p>
                )}
                <p className="text-[10px] text-gray-600 mt-1">Previous day earnings</p>
              </div>
              <div className="p-2 rounded-lg bg-purple-100 flex-shrink-0">
                <TrendingDown size={16} className="text-purple-700" />
              </div>
            </div>
          </div>

          <div className="bg-orange-50 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">Pending</p>
                {walletLoading ? (
                  <div className="h-7 w-16 mt-1.5 bg-gray-200 rounded animate-pulse" />
                ) : (
                  <p className="text-xl font-bold text-gray-900 mt-1">{formatInr(wallet?.pending_balance ?? 0)}</p>
                )}
                <p className="text-[10px] text-gray-600 mt-1">Orders awaiting settlement</p>
              </div>
              <div className="p-2 rounded-lg bg-orange-100 flex-shrink-0">
                <Clock size={16} className="text-orange-700" />
              </div>
            </div>
          </div>

          <div className="bg-red-50 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">Pending Withdrawal</p>
                {walletLoading ? (
                  <div className="h-7 w-16 mt-1.5 bg-gray-200 rounded animate-pulse" />
                ) : (
                  <p className="text-xl font-bold text-gray-900 mt-1">{formatInr(wallet?.pending_withdrawal_total ?? 0)}</p>
                )}
                <p className="text-[10px] text-gray-600 mt-1">Awaiting processing</p>
              </div>
              <div className="p-2 rounded-lg bg-red-100 flex-shrink-0">
                <ArrowDownToLine size={16} className="text-red-700" />
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">In Process</p>
                {walletLoading ? (
                  <div className="h-7 w-16 mt-1.5 bg-gray-200 rounded animate-pulse" />
                ) : (
                  <p className="text-xl font-bold text-gray-900 mt-1">{formatInr(0)}</p>
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
          analytics={undefined}
          analyticsLoading={false}
          payoutSummary={payoutSummaryForCharts}
          payoutsLoading={walletLoading}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-lg shadow-sm p-4 border border-gray-200">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <Building2 size={16} className="text-gray-700" />
                  Bank & UPI Accounts
                </h3>
                <p className="text-xs text-gray-600 mt-1">Manage bank and UPI accounts for receiving payouts</p>
              </div>
              {canEditBankAccounts ? (
                <button
                  type="button"
                  onClick={() => {
                    setBankProofFile(null);
                    setAddBankForm((f) => ({ ...f, bank_proof_type: "", bank_proof_file_url: "" }));
                    setShowAddBank(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors flex-shrink-0"
                >
                  <Plus size={14} />
                  Add Bank / UPI
                </button>
              ) : null}
            </div>
            <div className="space-y-2">
              {bankAccountsLoading ? (
                <div className="space-y-2" aria-busy aria-label="Loading bank accounts">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-white"
                    >
                      <div className="h-9 w-9 rounded-lg bg-gray-100 animate-pulse shrink-0" />
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="h-3.5 w-32 rounded bg-gray-200 animate-pulse" />
                        <div className="h-3 w-48 max-w-full rounded bg-gray-100 animate-pulse" />
                      </div>
                      <div className="h-6 w-16 rounded-full bg-gray-100 animate-pulse shrink-0" />
                    </div>
                  ))}
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
                    className={`flex items-center justify-between gap-3 p-3 rounded-lg border transition-all ${acc.is_disabled ? "bg-gray-50 border-gray-200 opacity-70" : "bg-white border-gray-200 hover:border-gray-300"}`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`p-2 rounded-lg flex-shrink-0 ${acc.is_disabled ? "bg-gray-100" : acc.payout_method === "upi" ? "bg-violet-100" : "bg-emerald-100"}`}>
                        {acc.payout_method === "upi" ? (
                          <CreditCard size={16} className={acc.is_disabled ? "text-gray-500" : "text-violet-600"} />
                        ) : (
                          <Building2 size={16} className={acc.is_disabled ? "text-gray-500" : "text-emerald-600"} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900 text-sm">{acc.account_holder_name}</p>
                          <span className="text-xs text-gray-500">·</span>
                          <p className="text-xs text-gray-600 truncate">
                            {acc.payout_method === "upi"
                              ? acc.upi_id || "—"
                              : `${acc.account_number_masked || "****"} · ${acc.bank_name}`}
                          </p>
                          {acc.is_primary && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 whitespace-nowrap">
                              Default
                            </span>
                          )}
                          {acc.is_disabled && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 whitespace-nowrap">
                              Disabled
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {canEditBankAccounts ? (
                      <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                        {!acc.is_primary && !acc.is_disabled && (
                          <button
                            type="button"
                            onClick={() => patchBankAccount(acc.id, { set_default: true })}
                            disabled={bankActionLoading !== null}
                            className="px-2 py-1 rounded-lg border border-gray-300 text-gray-700 text-[10px] font-medium hover:bg-gray-50 disabled:opacity-50"
                          >
                            Set default
                          </button>
                        )}
                        {!acc.is_disabled ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (!confirm("Disable this account?")) return;
                              patchBankAccount(acc.id, { set_disabled: true });
                            }}
                            disabled={bankActionLoading !== null}
                            className="px-2 py-1 rounded-lg border border-amber-200 text-amber-700 text-[10px] font-medium hover:bg-amber-50 disabled:opacity-50"
                          >
                            Disable
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => patchBankAccount(acc.id, { set_disabled: false })}
                            disabled={bankActionLoading !== null}
                            className="px-2 py-1 rounded-lg border border-gray-300 text-gray-700 text-[10px] font-medium hover:bg-gray-50 disabled:opacity-50"
                          >
                            Enable
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h3>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => scrollToLedger({ category: "WITHDRAWAL" })}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 group-hover:bg-blue-200 transition-colors">
                    <ArrowDownToLine size={16} className="text-blue-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-gray-900 text-xs">Withdrawal History</p>
                    <p className="text-[10px] text-gray-600">View withdrawal ledger entries</p>
                  </div>
                </div>
                <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
              </button>
              <button
                type="button"
                onClick={() => void downloadLedgerCsv()}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-orange-100 group-hover:bg-orange-200 transition-colors">
                    <FileText size={16} className="text-orange-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-gray-900 text-xs">Download Ledger</p>
                    <p className="text-[10px] text-gray-600">Export transaction report (CSV)</p>
                  </div>
                </div>
                <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
              </button>
            </div>
          </div>
        </div>

        {/* Wallet adjustment requests */}
        <WalletRequestsSection storeId={storeId} summaryCounts={walletRequestsSummaryData?.counts ?? null} />

        <div
          id="payments-ledger-section"
          ref={ledgerSectionRef}
          className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden"
        >
          <div className="px-4 py-2.5 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Recent Transactions</h3>
          </div>
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
              <span className="text-gray-400">–</span>
              <input
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                className="text-[10px] border border-gray-300 rounded px-2 py-1 bg-white"
              />
              <select
                value={filterDirection}
                onChange={(e) =>
                  setFilterDirection(e.target.value as "all" | "CREDIT" | "DEBIT")
                }
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
                  <option key={c} value={c}>
                    {formatCategory(c)}
                  </option>
                ))}
              </select>
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
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

          <div className="overflow-x-auto">
            {ledgerLoading ? (
              <div className="p-4 space-y-3" aria-busy aria-label="Loading ledger">
                <div className="hidden sm:grid grid-cols-8 gap-3 px-2 pb-2 border-b border-gray-100">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <div key={i} className="h-3 rounded bg-gray-100 animate-pulse" />
                  ))}
                </div>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-2 py-3 border-b border-gray-50 last:border-0"
                  >
                    <div className="h-4 w-4 rounded bg-gray-100 animate-pulse shrink-0" />
                    <div className="h-3.5 w-24 rounded bg-gray-200 animate-pulse shrink-0" />
                    <div className="h-3 w-16 rounded bg-gray-100 animate-pulse shrink-0 hidden sm:block" />
                    <div className="h-3 w-28 rounded bg-gray-100 animate-pulse shrink-0 hidden md:block" />
                    <div className="h-3 flex-1 rounded bg-gray-100 animate-pulse min-w-0" />
                    <div className="h-3.5 w-16 rounded bg-gray-200 animate-pulse shrink-0" />
                    <div className="h-5 w-14 rounded-full bg-gray-100 animate-pulse shrink-0 hidden sm:block" />
                    <div className="h-3 w-16 rounded bg-gray-100 animate-pulse shrink-0 hidden lg:block" />
                  </div>
                ))}
              </div>
            ) : ledger.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                <FileText size={40} className="mb-2 opacity-50" />
                <p>No transactions in this period</p>
                <p className="text-sm mt-1">Adjust filters or wait for new activity</p>
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
                  <tbody>
                    {ledger.map((row) => (
                      <React.Fragment key={row.id}>
                        <tr
                          className={`transition-colors divide-y divide-gray-100 ${
                            expandedLedgerId === row.id ? "bg-blue-50" : "hover:bg-gray-50"
                          }`}
                        >
                          <td className="py-3 px-4">
                            {(row.reference_type === "ORDER" && row.order_id != null) ||
                            (row.category === "WITHDRAWAL" && row.reference_id != null) ? (
                              <button
                                type="button"
                                onClick={() => toggleExpand(row)}
                                className="p-1 rounded hover:bg-gray-200 text-gray-600 hover:text-gray-900 transition-colors"
                              >
                                {expandedLedgerId === row.id ? (
                                  <ChevronUp size={16} />
                                ) : (
                                  <ChevronDown size={16} />
                                )}
                              </button>
                            ) : null}
                          </td>
                          <td className="py-3 px-4 font-medium text-gray-900">
                            {formatCategory(row.category)}
                          </td>
                          <td className="py-3 px-4 text-gray-600 tabular-nums">
                            {row.order_id != null ? row.order_id : "—"}
                          </td>
                          <td className="py-3 px-4 text-gray-600 whitespace-nowrap">
                            {new Date(row.created_at).toLocaleString("en-IN", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </td>
                          <td
                            className="py-3 px-4 text-gray-600 truncate max-w-xs"
                            title={row.description ?? row.reference_extra ?? ""}
                          >
                            {row.description || row.reference_extra || "—"}
                          </td>
                          <td
                            className={`py-3 px-4 text-right font-semibold tabular-nums ${
                              row.direction === "CREDIT" ? "text-emerald-600" : "text-red-600"
                            }`}
                          >
                            {row.direction === "CREDIT" ? "+" : "-"}
                            {formatInr(row.amount)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {row.direction === "CREDIT" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                                Credit
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                                <span className="w-2 h-2 rounded-full bg-red-600" />
                                Debit
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-700 tabular-nums">
                            {formatInr(row.balance_after)}
                          </td>
                        </tr>
                        {expandedLedgerId === row.id &&
                          row.category === "WITHDRAWAL" &&
                          row.reference_id != null && (
                            <tr className="bg-slate-50/60 border-b border-slate-200">
                              <td colSpan={8} className="p-0">
                                <div className="px-4 pb-4 pt-1">
                                  {payoutDetailsLoading === row.reference_id ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-busy aria-label="Loading payout details">
                                      {[1, 2].map((i) => (
                                        <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
                                          <div className="h-4 w-36 rounded bg-gray-200 animate-pulse" />
                                          {[1, 2, 3, 4].map((j) => (
                                            <div key={j} className="flex justify-between gap-3">
                                              <div className="h-3 w-20 rounded bg-gray-100 animate-pulse" />
                                              <div className="h-3 w-24 rounded bg-gray-100 animate-pulse" />
                                            </div>
                                          ))}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                                        <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                                          <CreditCard size={18} className="text-emerald-500" />
                                          Transaction details
                                        </h4>
                                        <dl className="space-y-1.5 text-sm">
                                          <div className="flex justify-between">
                                            <dt className="text-slate-500">Request ID</dt>
                                            <dd className="font-medium tabular-nums">
                                              {payoutDetailsCache[row.reference_id]?.payout?.id ?? "—"}
                                            </dd>
                                          </div>
                                          <div className="flex justify-between">
                                            <dt className="text-slate-500">Status</dt>
                                            <dd className="font-medium">
                                              {payoutDetailsCache[row.reference_id]?.payout?.status ?? "—"}
                                            </dd>
                                          </div>
                                          <div className="flex justify-between">
                                            <dt className="text-slate-500">Requested</dt>
                                            <dd>
                                              {payoutDetailsCache[row.reference_id]?.payout?.requested_at
                                                ? new Date(
                                                    payoutDetailsCache[row.reference_id].payout
                                                      .requested_at
                                                  ).toLocaleString("en-IN")
                                                : "—"}
                                            </dd>
                                          </div>
                                          {payoutDetailsCache[row.reference_id]?.payout
                                            ?.utr_reference && (
                                            <div className="flex justify-between">
                                              <dt className="text-slate-500">UTR / Ref</dt>
                                              <dd className="font-mono text-xs">
                                                {
                                                  payoutDetailsCache[row.reference_id].payout
                                                    .utr_reference
                                                }
                                              </dd>
                                            </div>
                                          )}
                                          <div className="flex justify-between">
                                            <dt className="text-slate-500">Amount</dt>
                                            <dd>
                                              ₹
                                              {payoutDetailsCache[row.reference_id]?.payout?.amount?.toLocaleString(
                                                "en-IN",
                                                { minimumFractionDigits: 2 }
                                              ) ?? "—"}
                                            </dd>
                                          </div>
                                          <div className="flex justify-between">
                                            <dt className="text-slate-500">Net payout</dt>
                                            <dd className="font-medium">
                                              ₹
                                              {payoutDetailsCache[row.reference_id]?.payout?.net_payout_amount?.toLocaleString(
                                                "en-IN",
                                                { minimumFractionDigits: 2 }
                                              ) ?? "—"}
                                            </dd>
                                          </div>
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
                                          if (!bank)
                                            return (
                                              <p className="text-sm text-slate-500">
                                                Bank details not available
                                              </p>
                                            );
                                          return (
                                            <dl className="space-y-1.5 text-sm">
                                              <div>
                                                <dt className="text-slate-500">Account holder</dt>
                                                <dd className="font-medium">
                                                  {bank.account_holder_name}
                                                </dd>
                                              </div>
                                              <div>
                                                <dt className="text-slate-500">Account</dt>
                                                <dd className="tabular-nums">
                                                  {bank.account_number_masked ?? "—"}
                                                </dd>
                                              </div>
                                              <div>
                                                <dt className="text-slate-500">IFSC</dt>
                                                <dd className="font-mono">
                                                  {bank.ifsc_code ?? "—"}
                                                </dd>
                                              </div>
                                              <div>
                                                <dt className="text-slate-500">Bank</dt>
                                                <dd>{bank.bank_name}</dd>
                                              </div>
                                              {bank.payout_method === "upi" && bank.upi_id && (
                                                <div>
                                                  <dt className="text-slate-500">UPI ID</dt>
                                                  <dd>{bank.upi_id}</dd>
                                                </div>
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
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-busy aria-label="Loading order details">
                                    {[1, 2].map((i) => (
                                      <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                        <div className="px-4 py-3 bg-slate-100/80">
                                          <div className="h-4 w-28 rounded bg-gray-200 animate-pulse" />
                                        </div>
                                        <div className="p-3 space-y-2">
                                          {[1, 2, 3].map((j) => (
                                            <div key={j} className="h-8 rounded-lg bg-gray-50 animate-pulse" />
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                      <div className="w-full flex items-center justify-between px-4 py-3 bg-slate-100/80">
                                        <span className="flex items-center gap-2 font-semibold text-slate-800">
                                          <Package size={18} className="text-violet-500" />
                                          Item details
                                        </span>
                                        <span className="text-xs text-slate-500">
                                          {orderDetailsCache[row.order_id]?.items?.length ?? 0} items
                                        </span>
                                      </div>
                                      <div className="max-h-48 overflow-y-auto">
                                        {(orderDetailsCache[row.order_id]?.items?.length ?? 0) > 0 ? (
                                          <ul className="divide-y divide-slate-100 p-2">
                                            {orderDetailsCache[row.order_id].items.map((item) => (
                                              <li
                                                key={item.id}
                                                className="flex justify-between items-center py-2 px-2 text-sm"
                                              >
                                                <span className="font-medium text-slate-800 truncate pr-2">
                                                  {item.item_name || item.item_title || "—"}
                                                </span>
                                                <span className="text-slate-600 shrink-0">
                                                  ×{item.quantity} ·
                                                  ₹{item.total_price.toLocaleString("en-IN")}
                                                </span>
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
                                        <span className="text-xs text-slate-500">
                                          {orderDetailsCache[row.order_id]?.riders?.length ?? 0}{" "}
                                          rider(s)
                                        </span>
                                        {expandedRidersLedgerId === row.id ? (
                                          <ChevronUp size={16} />
                                        ) : (
                                          <ChevronDown size={16} />
                                        )}
                                      </button>
                                      {expandedRidersLedgerId === row.id && (
                                        <div className="max-h-48 overflow-y-auto border-t border-slate-100">
                                          {(orderDetailsCache[row.order_id]?.riders?.length ?? 0) > 0 ? (
                                            <ul className="divide-y divide-slate-100 p-2">
                                              {orderDetailsCache[row.order_id].riders.map(
                                                (rider, idx) => (
                                                  <li
                                                    key={rider.id}
                                                    className="py-3 px-3 rounded-lg bg-slate-50/80 text-sm"
                                                  >
                                                    <p className="font-semibold text-slate-800">
                                                      Rider {idx + 1}
                                                    </p>
                                                    <p className="text-slate-600">
                                                      {rider.rider_name ?? "—"}
                                                    </p>
                                                    <p className="text-slate-500 text-xs">
                                                      {rider.rider_mobile ?? "—"}
                                                    </p>
                                                    <p className="mt-1 text-xs font-medium text-slate-600">
                                                      Status: {String(rider.assignment_status)}
                                                    </p>
                                                    {rider.assigned_at && (
                                                      <p className="text-xs text-slate-500">
                                                        Assigned:{" "}
                                                        {new Date(
                                                          rider.assigned_at
                                                        ).toLocaleString("en-IN")}
                                                      </p>
                                                    )}
                                                    {rider.delivered_at && (
                                                      <p className="text-xs text-emerald-600">
                                                        Delivered:{" "}
                                                        {new Date(
                                                          rider.delivered_at
                                                        ).toLocaleString("en-IN")}
                                                      </p>
                                                    )}
                                                  </li>
                                                )
                                              )}
                                            </ul>
                                          ) : (
                                            <p className="p-4 text-sm text-slate-500">
                                              No riders assigned
                                            </p>
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
                {ledgerTotal > ledgerLimit && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50">
                    <p className="text-xs text-gray-600">
                      Showing {ledgerOffset + 1}–
                      {Math.min(ledgerOffset + ledgerLimit, ledgerTotal)} of {ledgerTotal}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          setLedgerOffset(Math.max(0, ledgerOffset - ledgerLimit))
                        }
                        disabled={ledgerOffset === 0 || ledgerLoading}
                        className="p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        onClick={() => setLedgerOffset(ledgerOffset + ledgerLimit)}
                        disabled={
                          ledgerOffset + ledgerLimit >= ledgerTotal || ledgerLoading
                        }
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
    </div>

      {/* Withdrawal modal — removed: agents cannot withdraw; merchants use app/partnersite */}
      {false && showWithdrawal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex-shrink-0 bg-gradient-to-r from-emerald-500 to-emerald-600 p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Wallet className="text-white" size={24} />
                <h2 className="text-lg font-bold text-white">Withdraw</h2>
              </div>
              <button
                onClick={() => setShowWithdrawal(false)}
                className="text-white hover:bg-white/20 p-2 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <p className="text-sm text-emerald-600 font-medium">Available balance</p>
                <p className="text-2xl font-bold text-emerald-700 mt-1">
                  ₹
                  {(wallet?.available_balance ?? 0).toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
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
                const amt = parseFloat(withdrawalAmount);
                if (payoutQuoteLoading && amt >= 100) {                  return (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-2 text-slate-600 text-sm">
                      <Loader2 size={18} className="animate-spin" />
                      Calculating...
                    </div>
                  );
                }
                if (payoutQuote == null || isNaN(amt) || amt < 100) {
                  return null;
                }
                const q = payoutQuote as NonNullable<typeof payoutQuote>;
                return (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                      <p className="text-sm font-medium text-gray-700">
                        Withdrawal calculation
                      </p>
                      <div className="flex justify-between text-sm text-slate-600">
                        <span>Requested amount (gross)</span>
                        <span className="tabular-nums">
                          ₹
                          {q.requested_amount.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm text-slate-600">
                        <span>Commission ({q.commission_percentage}%)</span>
                        <span className="tabular-nums text-amber-600">
                          −₹
                          {(q.commission_amount ?? 0).toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm text-slate-600">
                        <span>
                          GST on Commission (
                          {q.gst_on_commission_percent ?? 18}%)
                        </span>
                        <span className="tabular-nums text-amber-600">
                          −₹
                          {(q.gst_on_commission ?? q.tax_amount ?? 0).toLocaleString(
                            "en-IN",
                            { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm text-slate-600">
                        <span>TDS</span>
                        <span className="tabular-nums">
                          {(q.tds_amount ?? 0) > 0
                            ? `−₹${(q.tds_amount ?? 0).toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}`
                            : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm text-slate-600">
                        <span>TCS</span>
                        <span className="tabular-nums">—</span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold text-slate-800 pt-2 border-t border-slate-200">
                        <span>You receive (net payout)</span>
                        <span className="tabular-nums text-emerald-600">
                          ₹
                          {q.net_payout_amount.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    </div>                );
              })()}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Withdraw to
                </label>
                <select
                  value={withdrawBankId}
                  onChange={(e) =>
                    setWithdrawBankId(e.target.value ? Number(e.target.value) : "")
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 outline-none"
                  disabled={isWithdrawing}
                >
                  {bankAccounts
                    .filter((a) => !a.is_disabled)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.account_holder_name} {a.is_primary ? "(Default)" : ""} ·{" "}
                        {a.payout_method === "upi"
                          ? a.upi_id ?? ""
                          : a.account_number_masked ?? ""}
                      </option>
                    ))}
                  {bankAccounts.filter((a) => !a.is_disabled).length === 0 && (
                    <option value="">Add a bank/UPI account first</option>
                  )}
                </select>
                {bankAccounts.length > 0 &&
                  (withdrawBankId === ""
                    ? bankAccounts.find((a) => a.is_primary && !a.is_disabled)
                    : bankAccounts.find((a) => a.id === withdrawBankId)) && (
                  <div className="mt-2 p-3 bg-white border border-gray-200 rounded-lg text-sm">
                    <p className="font-medium text-gray-800">
                      {(
                        withdrawBankId === ""
                          ? bankAccounts.find((a) => a.is_primary && !a.is_disabled) ??
                            bankAccounts.find((a) => !a.is_disabled)
                          : bankAccounts.find((a) => a.id === withdrawBankId)
                      )?.account_holder_name}
                      {(withdrawBankId === ""
                        ? bankAccounts.find((a) => a.is_primary && !a.is_disabled) ??
                          bankAccounts.find((a) => !a.is_disabled)
                        : bankAccounts.find((a) => a.id === withdrawBankId)
                      )?.is_primary
                        ? " (Default)"
                        : ""}
                    </p>
                    <p className="text-gray-600">
                      {(withdrawBankId === ""
                        ? bankAccounts.find((a) => a.is_primary && !a.is_disabled) ??
                          bankAccounts.find((a) => !a.is_disabled)
                        : bankAccounts.find((a) => a.id === withdrawBankId)
                      )?.payout_method === "upi"
                        ? `UPI: ${
                            (withdrawBankId === ""
                              ? bankAccounts.find((a) => a.is_primary && !a.is_disabled) ??
                                bankAccounts.find((a) => !a.is_disabled)
                              : bankAccounts.find((a) => a.id === withdrawBankId)
                            )?.upi_id ?? "—"
                          }`
                        : `${(withdrawBankId === ""
                            ? bankAccounts.find((a) => a.is_primary && !a.is_disabled) ??
                              bankAccounts.find((a) => !a.is_disabled)
                            : bankAccounts.find((a) => a.id === withdrawBankId)
                          )?.bank_name} · ${
                            (withdrawBankId === ""
                              ? bankAccounts.find((a) => a.is_primary && !a.is_disabled) ??
                                bankAccounts.find((a) => !a.is_disabled)
                              : bankAccounts.find((a) => a.id === withdrawBankId)
                            )?.account_number_masked ?? "****"
                          }`}
                    </p>
                    {(withdrawBankId === ""
                      ? bankAccounts.find((a) => a.is_primary && !a.is_disabled) ??
                        bankAccounts.find((a) => !a.is_disabled)
                      : bankAccounts.find((a) => a.id === withdrawBankId)
                    )?.payout_method !== "upi" && (
                      <p className="text-gray-500 text-xs">
                        IFSC:{" "}
                        {(withdrawBankId === ""
                          ? bankAccounts.find((a) => a.is_primary && !a.is_disabled) ??
                            bankAccounts.find((a) => !a.is_disabled)
                          : bankAccounts.find((a) => a.id === withdrawBankId)
                        )?.ifsc_code}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="bg-gray-50 p-3 rounded-xl">
                <p className="text-xs text-gray-600">
                  Min ₹100. Funds typically arrive in 2–3 business days.
                </p>
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
                  isWithdrawing ||
                  !withdrawalAmount ||
                  parseFloat(withdrawalAmount) < 100 ||
                  (wallet?.available_balance ?? 0) < 100 ||
                  parseFloat(withdrawalAmount) > (wallet?.available_balance ?? 0) ||
                  (withdrawBankId !== "" &&
                    !bankAccounts.some((a) => a.id === withdrawBankId && !a.is_disabled)) ||
                  bankAccounts.filter((a) => !a.is_disabled).length === 0
                }
                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isWithdrawing ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Withdraw"
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
              <button
                onClick={() => setShowAddBank(false)}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={addBankForm.payout_method}
                  onChange={(e) =>
                    setAddBankForm((f) => ({
                      ...f,
                      payout_method: e.target.value as "bank" | "upi",
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl bg-white"
                >
                  <option value="bank">Bank account</option>
                  <option value="upi">UPI</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account holder name *
                </label>
                <input
                  type="text"
                  value={addBankForm.account_holder_name}
                  onChange={(e) =>
                    setAddBankForm((f) => ({ ...f, account_holder_name: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl"
                  placeholder="Name as per bank"
                />
              </div>
              {addBankForm.payout_method === "bank" ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Account number *
                    </label>
                    <input
                      type="text"
                      value={addBankForm.account_number}
                      onChange={(e) =>
                        setAddBankForm((f) => ({ ...f, account_number: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl"
                      placeholder="Account number"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">IFSC *</label>
                    <input
                      type="text"
                      value={addBankForm.ifsc_code}
                      onChange={(e) =>
                        setAddBankForm((f) => ({ ...f, ifsc_code: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl"
                      placeholder="e.g. SBIN0001234"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bank name *
                    </label>
                    <input
                      type="text"
                      value={addBankForm.bank_name}
                      onChange={(e) =>
                        setAddBankForm((f) => ({ ...f, bank_name: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl"
                      placeholder="Bank name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Branch (optional)
                    </label>
                    <input
                      type="text"
                      value={addBankForm.branch_name}
                      onChange={(e) =>
                        setAddBankForm((f) => ({ ...f, branch_name: e.target.value }))
                      }
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
                    onChange={(e) =>
                      setAddBankForm((f) => ({ ...f, upi_id: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl"
                    placeholder="e.g. name@upi"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Account number can be same as UPI ID or any reference.
                  </p>
                  <input
                    type="text"
                    value={addBankForm.account_number}
                    onChange={(e) =>
                      setAddBankForm((f) => ({ ...f, account_number: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl mt-2"
                    placeholder="Account number (optional for UPI)"
                  />
                </div>
              )}
              <div className="border-t border-gray-200 pt-4 mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bank proof (cancelled cheque / statement / passbook) *
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Upload a clear image or PDF of cancelled cheque, bank statement, or passbook
                  showing account details.
                </p>
                <select
                  value={addBankForm.bank_proof_type}
                  onChange={(e) =>
                    setAddBankForm((f) => ({
                      ...f,
                      bank_proof_type: e.target.value as
                        | ""
                        | "passbook"
                        | "cancelled_cheque"
                        | "bank_statement",
                    }))
                  }
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
                    {bankProofFile ? bankProofFile.name : "Choose file"}
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
                disabled={
                  addBankSubmitting ||
                  !bankProofFile ||
                  !addBankForm.bank_proof_type ||
                  (addBankForm.bank_proof_type !== "passbook" &&
                    addBankForm.bank_proof_type !== "cancelled_cheque" &&
                    addBankForm.bank_proof_type !== "bank_statement")
                }
                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {addBankSubmitting ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Check size={18} />
                )}
                Add account
              </button>
            </div>
          </div>
        </div>
      )}

      {showRefundPolicy && (
        <div className="fixed inset-0 z-[9999] flex">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowRefundPolicy(false)}
            aria-hidden
          />
          <aside className="relative ml-auto w-full max-w-3xl h-full bg-white shadow-2xl flex flex-col overflow-hidden border-l border-gray-200">
            <div className="flex-shrink-0 px-4 sm:px-5 py-4 border-b border-gray-200 bg-white/95 backdrop-blur flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.18em] text-orange-600 font-semibold">Policy</p>
                <h2 className="text-base sm:text-lg font-bold text-gray-900 leading-tight">Refund Policy</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowRefundPolicy(false)}
                className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-xl hover:bg-gray-100 text-gray-600"
                aria-label="Close refund policy"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto hide-scrollbar px-0 py-0">
              <RefundPolicyContent compact />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
