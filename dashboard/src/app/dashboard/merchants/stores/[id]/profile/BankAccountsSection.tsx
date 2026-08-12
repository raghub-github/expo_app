"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Banknote, Check, Loader2, X } from "lucide-react";
import { useToast } from "@/context/ToastContext";

type PolicyMode = "manual" | "auto" | "hybrid" | "disabled";

export function BankAccountsSection({
  storeId,
  initialAccounts,
  onVerify,
  canStoreVerify,
  canEditBank = false,
  storeName,
  readOnlyRestricted = false,
}: {
  storeId: string;
  initialAccounts: any[];
  onVerify?: () => void;
  canStoreVerify?: boolean;
  canEditBank?: boolean;
  storeName?: string | null;
  /** View-only on unassigned store — no mutations / no clear reload. */
  readOnlyRestricted?: boolean;
}) {
  const { toast } = useToast();
  const [accounts, setAccounts] = React.useState<any[]>(initialAccounts ?? []);
  const [loading, setLoading] = React.useState(false);
  const [showAdd, setShowAdd] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [actionId, setActionId] = React.useState<number | null>(null);
  const [verifyingId, setVerifyingId] = React.useState<number | null>(null);

  const [method, setMethod] = React.useState<"bank" | "upi">("bank");
  const [holder, setHolder] = React.useState("");
  const [accNum, setAccNum] = React.useState("");
  const [ifsc, setIfsc] = React.useState("");
  const [bankName, setBankName] = React.useState("");
  const [branch, setBranch] = React.useState("");
  const [upiId, setUpiId] = React.useState("");
  const [accountType, setAccountType] = React.useState<"" | "savings" | "current">("");

  const [bankPolicyMode, setBankPolicyMode] = React.useState<PolicyMode>("manual");
  const [upiPolicyMode, setUpiPolicyMode] = React.useState<PolicyMode>("manual");
  const [policyLoading, setPolicyLoading] = React.useState(false);
  const [forceManual, setForceManual] = React.useState(false);
  const [electronicVerified, setElectronicVerified] = React.useState(false);
  const [verifyError, setVerifyError] = React.useState<string | null>(null);
  const [verifying, setVerifying] = React.useState(false);
  const [pendingAccountId, setPendingAccountId] = React.useState<number | null>(null);

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/merchant/stores/${storeId}/bank-accounts`);
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.accounts) setAccounts(j.accounts);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  React.useEffect(() => {
    if (readOnlyRestricted) {
      setAccounts(initialAccounts ?? []);
      return;
    }
    if (initialAccounts?.length) setAccounts(initialAccounts);
    else void reload();
  }, [initialAccounts, reload, readOnlyRestricted]);

  const resetForm = React.useCallback(() => {
    setMethod("bank");
    setHolder("");
    setAccNum("");
    setIfsc("");
    setBankName("");
    setBranch("");
    setUpiId("");
    setAccountType("");
    setForceManual(false);
    setElectronicVerified(false);
    setVerifyError(null);
    setVerifying(false);
    setPendingAccountId(null);
  }, []);

  const closeSheet = React.useCallback(() => {
    setShowAdd(false);
    resetForm();
  }, [resetForm]);

  const openAddSheet = React.useCallback(async () => {
    if (!canEditBank) {
      toast("View-only access — adding accounts is disabled");
      return;
    }
    resetForm();
    setShowAdd(true);
    setPolicyLoading(true);
    try {
      const r = await fetch("/api/onboarding/verification-modes");
      const j = await r.json().catch(() => ({}));
      const bankRaw = String(j?.modes?.bank_account ?? j?.modes?.bank ?? "manual").toLowerCase();
      const upiRaw = String(j?.modes?.upi_penny_drop ?? j?.modes?.upi ?? "manual").toLowerCase();
      const asMode = (v: string): PolicyMode =>
        v === "auto" || v === "hybrid" || v === "disabled" || v === "manual" ? v : "manual";
      const bankMode = asMode(bankRaw);
      const upiMode = asMode(upiRaw);
      setBankPolicyMode(bankMode);
      setUpiPolicyMode(upiMode);
      if (bankMode === "manual" || bankMode === "disabled") setForceManual(true);
    } catch {
      setBankPolicyMode("manual");
      setUpiPolicyMode("manual");
      setForceManual(true);
    } finally {
      setPolicyLoading(false);
    }
  }, [resetForm, canEditBank, toast]);

  const activePolicy = method === "bank" ? bankPolicyMode : upiPolicyMode;
  const isElectronic =
    (activePolicy === "auto" || activePolicy === "hybrid") && !forceManual && !electronicVerified;

  const holderFallback = String(storeName || "Account Holder").trim() || "Account Holder";

  const handleAddManual = async () => {
    if (method === "bank") {
      if (!holder.trim() || !accNum.trim()) {
        toast("Holder name and account number required");
        return;
      }
      if (!ifsc.trim() || !bankName.trim()) {
        toast("IFSC and bank name required");
        return;
      }
    } else {
      if (!upiId.trim()) {
        toast("UPI ID required");
        return;
      }
    }
    setSaving(true);
    try {
      const r = await fetch(`/api/merchant/stores/${storeId}/bank-accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payout_method: method,
          account_holder_name: method === "bank" ? holder.trim() : holder.trim() || holderFallback,
          account_number: method === "bank" ? accNum.trim() : upiId.trim(),
          ifsc_code: method === "bank" ? ifsc.trim().toUpperCase() : undefined,
          bank_name: method === "bank" ? bankName.trim() : undefined,
          branch_name: method === "bank" ? branch.trim() || null : null,
          account_type: method === "bank" && accountType ? accountType : null,
          upi_id: method === "upi" ? upiId.trim() : null,
        }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        toast(e?.error || "Failed to add");
        return;
      }
      toast("Account added");
      closeSheet();
      await reload();
    } catch {
      toast("Failed to add account");
    } finally {
      setSaving(false);
    }
  };

  const handleElectronicVerify = async () => {
    if (method === "bank") {
      const account = accNum.replace(/\D/g, "");
      const ifscCode = ifsc.trim().toUpperCase();
      if (!account || account.length < 6) {
        toast("Enter a valid account number");
        return;
      }
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) {
        toast("Enter a valid IFSC code");
        return;
      }
      setVerifying(true);
      setVerifyError(null);
      try {
        const bankFallback = ifscCode.slice(0, 4);
        const addRes = await fetch(`/api/merchant/stores/${storeId}/bank-accounts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payout_method: "bank",
            account_holder_name: holderFallback,
            account_number: account,
            ifsc_code: ifscCode,
            bank_name: bankFallback,
          }),
        });
        const addJson = await addRes.json().catch(() => ({}));
        if (!addRes.ok) {
          toast(addJson?.error || "Failed to save account for verification");
          return;
        }
        const newId = Number(addJson?.account?.id ?? addJson?.id);
        if (!Number.isFinite(newId) || newId < 1) {
          toast("Account saved but id missing");
          await reload();
          return;
        }
        setPendingAccountId(newId);
        setAccNum(account);
        setIfsc(ifscCode);
        setBankName(bankFallback);
        setHolder(holderFallback);

        const vRes = await fetch(`/api/merchant/stores/${storeId}/bank-accounts/${newId}/verify`, {
          method: "POST",
        });
        const vJson = await vRes.json().catch(() => ({}));
        if (vRes.ok && vJson?.verified) {
          if (vJson?.name_at_bank) setHolder(String(vJson.name_at_bank));
          setElectronicVerified(true);
          setForceManual(false);
          toast(vJson.message || "Account verified — confirm account type and save");
          await reload();
          return;
        }
        const err = vJson?.error || vJson?.message || "Verification failed";
        setVerifyError(err);
        if (activePolicy === "hybrid") {
          setForceManual(true);
          toast(err);
        } else {
          toast(err);
        }
        await reload();
      } catch {
        const err = "Verification request failed";
        setVerifyError(err);
        if (activePolicy === "hybrid") setForceManual(true);
        toast(err);
      } finally {
        setVerifying(false);
      }
      return;
    }

    // UPI electronic
    const vpa = upiId.trim().toLowerCase();
    if (!/^[a-z0-9.\-_]{2,256}@[a-z0-9]{2,64}$/i.test(vpa)) {
      toast("Enter a valid UPI ID");
      return;
    }
    setVerifying(true);
    setVerifyError(null);
    try {
      const addRes = await fetch(`/api/merchant/stores/${storeId}/bank-accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payout_method: "upi",
          account_holder_name: holderFallback,
          account_number: vpa,
          upi_id: vpa,
        }),
      });
      const addJson = await addRes.json().catch(() => ({}));
      if (!addRes.ok) {
        toast(addJson?.error || "Failed to save UPI for verification");
        return;
      }
      const newId = Number(addJson?.account?.id ?? addJson?.id);
      if (!Number.isFinite(newId) || newId < 1) {
        toast("Account saved but id missing");
        await reload();
        return;
      }
      setPendingAccountId(newId);
      const vRes = await fetch(`/api/merchant/stores/${storeId}/bank-accounts/${newId}/verify`, {
        method: "POST",
      });
      const vJson = await vRes.json().catch(() => ({}));
      if (vRes.ok && vJson?.verified) {
        setElectronicVerified(true);
        setForceManual(false);
        toast(vJson.message || "UPI verified");
        closeSheet();
        await reload();
        return;
      }
      const err = vJson?.error || vJson?.message || "Verification failed";
      setVerifyError(err);
      if (activePolicy === "hybrid") {
        setForceManual(true);
        toast(err);
      } else {
        toast(err);
      }
      await reload();
    } catch {
      const err = "Verification request failed";
      setVerifyError(err);
      if (activePolicy === "hybrid") setForceManual(true);
      toast(err);
    } finally {
      setVerifying(false);
    }
  };

  const handleSaveVerified = async () => {
    if (method === "bank" && !accountType) {
      toast("Select account type");
      return;
    }
    if (!pendingAccountId) {
      closeSheet();
      await reload();
      return;
    }
    setSaving(true);
    try {
      if (method === "bank" && accountType) {
        await fetch(`/api/merchant/stores/${storeId}/bank-accounts/${pendingAccountId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            update: {
              account_type: accountType,
              account_holder_name: holder.trim() || holderFallback,
              bank_name: bankName.trim() || undefined,
            },
          }),
        });
      }
      toast("Verified account saved");
      closeSheet();
      await reload();
    } catch {
      toast("Saved, but account type update failed");
      closeSheet();
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const handleCashfreeVerify = async (bank: any) => {
    if (!canStoreVerify) {
      onVerify?.();
      return;
    }
    setVerifyingId(bank.id);
    try {
      const r = await fetch(`/api/merchant/stores/${storeId}/bank-accounts/${bank.id}/verify`, {
        method: "POST",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) {
        toast(j?.error || "Verification failed");
        return;
      }
      if (j?.verified) toast(j.message || "Account verified");
      else toast(j?.message || "Saved for manual review");
      await reload();
    } catch {
      toast("Verification failed");
    } finally {
      setVerifyingId(null);
    }
  };

  const handleSetDefault = async (id: number) => {
    setActionId(id);
    try {
      const r = await fetch(`/api/merchant/stores/${storeId}/bank-accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ set_default: true }),
      });
      if (!r.ok) toast("Failed to set default");
      else await reload();
    } catch {
      toast("Failed");
    } finally {
      setActionId(null);
    }
  };

  const handleToggleDisable = async (acc: any) => {
    if (acc.is_primary && !acc.is_disabled) {
      toast("Set another account as default first");
      return;
    }
    setActionId(acc.id);
    try {
      const r = await fetch(`/api/merchant/stores/${storeId}/bank-accounts/${acc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ set_disabled: !acc.is_disabled }),
      });
      if (!r.ok) toast("Failed to update");
      else await reload();
    } catch {
      toast("Failed");
    } finally {
      setActionId(null);
    }
  };

  const onMethodChange = (next: "bank" | "upi") => {
    setMethod(next);
    setForceManual(next === "bank" ? bankPolicyMode === "manual" || bankPolicyMode === "disabled" : upiPolicyMode === "manual" || upiPolicyMode === "disabled");
    setElectronicVerified(false);
    setVerifyError(null);
    setPendingAccountId(null);
  };

  const sheet =
    showAdd &&
    typeof document !== "undefined" &&
    createPortal(
      <div className="fixed inset-0 z-[1100] flex justify-end" role="presentation">
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
          aria-hidden
          onClick={closeSheet}
        />
        <aside
          className="relative flex h-dvh min-h-0 w-full max-w-md flex-col overflow-hidden border-l border-gray-200 bg-white shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dash-add-bank-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex-shrink-0 border-b border-gray-200 px-5 py-4 space-y-3 bg-white">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 id="dash-add-bank-title" className="text-lg font-bold text-gray-900">
                  Add account
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {policyLoading
                    ? "Loading…"
                    : activePolicy === "auto"
                      ? "Auto verify"
                      : activePolicy === "hybrid"
                        ? "Auto verify · manual fallback"
                        : "Manual add"}
                </p>
              </div>
              <button
                type="button"
                onClick={closeSheet}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1">
              <button
                type="button"
                onClick={() => onMethodChange("bank")}
                disabled={electronicVerified}
                className={`flex-1 rounded-md py-2 text-xs font-semibold transition-colors ${
                  method === "bank" ? "bg-orange-500 text-white shadow" : "text-gray-600 hover:text-gray-800"
                }`}
              >
                Bank
              </button>
              <button
                type="button"
                onClick={() => onMethodChange("upi")}
                disabled={electronicVerified}
                className={`flex-1 rounded-md py-2 text-xs font-semibold transition-colors ${
                  method === "upi" ? "bg-orange-500 text-white shadow" : "text-gray-600 hover:text-gray-800"
                }`}
              >
                UPI
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 space-y-4">
            {policyLoading ? (
              <div className="flex items-center justify-center py-16 text-gray-500 gap-2 text-sm">
                <Loader2 size={18} className="animate-spin" />
                Loading…
              </div>
            ) : (
              <>
                {activePolicy === "auto" && verifyError && isElectronic && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
                    <span className="font-semibold">Verification failed. </span>
                    {verifyError}
                  </div>
                )}

                {method === "bank" && isElectronic && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Account number *</label>
                      <input
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm font-mono"
                        placeholder="Account number"
                        value={accNum}
                        onChange={(e) => setAccNum(e.target.value.replace(/\D/g, "").slice(0, 18))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">IFSC *</label>
                      <input
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm font-mono uppercase"
                        placeholder="e.g. SBIN0001234"
                        value={ifsc}
                        onChange={(e) => setIfsc(e.target.value.toUpperCase().slice(0, 11))}
                      />
                    </div>
                  </>
                )}

                {method === "upi" && isElectronic && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">UPI ID *</label>
                    <input
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
                      placeholder="name@upi"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                    />
                  </div>
                )}

                {electronicVerified && (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
                      <p className="font-semibold flex items-center gap-1.5">
                        <Check size={16} className="text-emerald-600" />
                        Account verified
                      </p>
                      <p className="text-xs text-emerald-700 mt-1">
                        {method === "bank" ? "Confirm account type and save." : "UPI verified and saved."}
                      </p>
                    </div>
                    {method === "bank" && (
                      <>
                        {holder ? (
                          <p className="text-xs text-gray-600">
                            <span className="text-gray-500">Holder:</span>{" "}
                            <span className="font-semibold text-gray-900">{holder}</span>
                          </p>
                        ) : null}
                        <p className="text-xs text-gray-600 font-mono">
                          {accNum} · {ifsc}
                        </p>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Account type *</label>
                          <select
                            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white"
                            value={accountType}
                            onChange={(e) => setAccountType(e.target.value as "" | "savings" | "current")}
                          >
                            <option value="">Select account type</option>
                            <option value="savings">Savings</option>
                            <option value="current">Current</option>
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {(activePolicy === "manual" || forceManual) && !electronicVerified && method === "bank" && (
                  <div className="space-y-3">
                    <input
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
                      placeholder="Account holder name *"
                      value={holder}
                      onChange={(e) => setHolder(e.target.value)}
                    />
                    <input
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm font-mono"
                      placeholder="Account number *"
                      value={accNum}
                      onChange={(e) => setAccNum(e.target.value.replace(/\D/g, "").slice(0, 18))}
                    />
                    <input
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm font-mono uppercase"
                      placeholder="IFSC code *"
                      value={ifsc}
                      onChange={(e) => setIfsc(e.target.value.toUpperCase().slice(0, 11))}
                    />
                    <input
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
                      placeholder="Bank name *"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                    />
                    <input
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
                      placeholder="Branch name"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                    />
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white"
                      value={accountType}
                      onChange={(e) => setAccountType(e.target.value as "" | "savings" | "current")}
                    >
                      <option value="">Account type (optional)</option>
                      <option value="savings">Savings</option>
                      <option value="current">Current</option>
                    </select>
                  </div>
                )}

                {(activePolicy === "manual" || forceManual) && !electronicVerified && method === "upi" && (
                  <div className="space-y-3">
                    <input
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
                      placeholder="Account holder name (optional)"
                      value={holder}
                      onChange={(e) => setHolder(e.target.value)}
                    />
                    <input
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
                      placeholder="UPI ID *"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex-shrink-0 border-t border-gray-200 p-5 flex flex-col gap-2 bg-gray-50">
            {isElectronic && (
              <button
                type="button"
                onClick={() => void handleElectronicVerify()}
                disabled={verifying || policyLoading}
                className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {verifying ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Verify Account
              </button>
            )}
            {electronicVerified && method === "bank" && (
              <button
                type="button"
                onClick={() => void handleSaveVerified()}
                disabled={saving || !accountType}
                className="w-full py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save verified account"}
              </button>
            )}
            {(activePolicy === "manual" || forceManual) && !electronicVerified && (
              <button
                type="button"
                onClick={() => void handleAddManual()}
                disabled={saving}
                className="w-full py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 disabled:opacity-50"
              >
                {saving ? "Adding…" : "Add Account"}
              </button>
            )}
            <button
              type="button"
              onClick={closeSheet}
              className="w-full py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-white"
            >
              Cancel
            </button>
          </div>
        </aside>
      </div>,
      document.body
    );

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Banknote size={16} className="text-blue-600" />
          Bank Details
        </h3>
        {canEditBank ? (
          <button
            type="button"
            onClick={() => void openAddSheet()}
            className="text-xs font-semibold text-orange-600 hover:text-orange-700"
          >
            + Add Account
          </button>
        ) : null}
      </div>

      {sheet}

      {loading && accounts.length === 0 ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : accounts.length === 0 ? (
        <p className="text-xs text-gray-500">No bank/UPI accounts added yet.</p>
      ) : (
        <div className="space-y-2">
          {accounts.map((bank: any) => (
            <div
              key={bank.id}
              className={`bg-white rounded p-2 border text-xs ${
                bank.is_primary
                  ? "border-orange-300"
                  : bank.is_disabled
                    ? "border-gray-200 opacity-60"
                    : "border-gray-200"
              }`}
            >
              <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                {bank.is_primary && (
                  <span className="text-white bg-orange-500 px-2 py-0.5 rounded-full text-[10px] font-bold">
                    Default
                  </span>
                )}
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold text-white ${
                    bank.payout_method === "upi" ? "bg-purple-500" : "bg-blue-500"
                  }`}
                >
                  {(bank.payout_method || "bank").toUpperCase()}
                </span>
                {bank.is_disabled && (
                  <span className="text-white bg-gray-400 px-2 py-0.5 rounded-full text-[10px] font-bold">
                    Disabled
                  </span>
                )}
                {bank.is_verified ? (
                  <span className="text-white bg-green-500 px-2 py-0.5 rounded-full text-[10px] font-bold">
                    Verified
                  </span>
                ) : (
                  <span className="text-white bg-amber-500 px-2 py-0.5 rounded-full text-[10px] font-bold">
                    Pending
                  </span>
                )}
                {!bank.is_verified && (
                  <button
                    type="button"
                    onClick={() => handleCashfreeVerify(bank)}
                    disabled={verifyingId === bank.id}
                    className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                  >
                    {verifyingId === bank.id ? "Verifying…" : "Verify Account"}
                  </button>
                )}
                {!bank.is_verified && onVerify && (
                  <button
                    type="button"
                    onClick={onVerify}
                    className="text-[10px] font-semibold text-gray-500 hover:text-gray-700"
                  >
                    Open step verify
                  </button>
                )}
              </div>
              <div className="space-y-0.5">
                <div>
                  <span className="text-gray-500">Holder:</span>{" "}
                  <span className="font-semibold text-gray-900">{bank.account_holder_name}</span>
                </div>
                <div>
                  <span className="text-gray-500">Account:</span>{" "}
                  <span className="font-semibold text-gray-900">{bank.account_number_masked ?? "****"}</span>
                </div>
                {bank.ifsc_code && bank.ifsc_code !== "N/A" && (
                  <div>
                    <span className="text-gray-500">IFSC:</span>{" "}
                    <span className="font-semibold text-gray-900">{bank.ifsc_code}</span>
                  </div>
                )}
                {bank.bank_name && bank.bank_name !== "UPI" && (
                  <div>
                    <span className="text-gray-500">Bank:</span>{" "}
                    <span className="font-semibold text-gray-900">{bank.bank_name}</span>
                  </div>
                )}
                {bank.branch_name && (
                  <div>
                    <span className="text-gray-500">Branch:</span>{" "}
                    <span className="text-gray-900">{bank.branch_name}</span>
                  </div>
                )}
                {bank.upi_id && (
                  <div>
                    <span className="text-gray-500">UPI:</span>{" "}
                    <span className="text-gray-900">{bank.upi_id}</span>
                  </div>
                )}
              </div>
              {canEditBank ? (
                <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100">
                  {!bank.is_primary && !bank.is_disabled && (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(bank.id)}
                      disabled={actionId === bank.id}
                      className="px-2 py-1 text-[10px] font-semibold text-orange-600 border border-orange-200 rounded hover:bg-orange-50 disabled:opacity-50"
                    >
                      Set Default
                    </button>
                  )}
                  {!(bank.is_primary && !bank.is_disabled) && (
                    <button
                      type="button"
                      onClick={() => handleToggleDisable(bank)}
                      disabled={actionId === bank.id}
                      className={`px-2 py-1 text-[10px] font-semibold rounded ${
                        bank.is_disabled
                          ? "text-green-600 border border-green-200 hover:bg-green-50"
                          : "text-red-600 border border-red-200 hover:bg-red-50"
                      } disabled:opacity-50`}
                    >
                      {bank.is_disabled ? "Enable" : "Disable"}
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
