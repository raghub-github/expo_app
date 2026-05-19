"use client";

import React from "react";
import { Banknote } from "lucide-react";
import { useToast } from "@/context/ToastContext";

export function BankAccountsSection({
  storeId,
  initialAccounts,
  onVerify,
  canStoreVerify,
}: {
  storeId: string;
  initialAccounts: any[];
  onVerify?: () => void;
  canStoreVerify?: boolean;
}) {
  const { toast } = useToast();
  const [accounts, setAccounts] = React.useState<any[]>(initialAccounts ?? []);
  const [loading, setLoading] = React.useState(false);
  const [showAdd, setShowAdd] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [actionId, setActionId] = React.useState<number | null>(null);
  const [method, setMethod] = React.useState<"bank" | "upi">("bank");
  const [holder, setHolder] = React.useState("");
  const [accNum, setAccNum] = React.useState("");
  const [ifsc, setIfsc] = React.useState("");
  const [bankName, setBankName] = React.useState("");
  const [branch, setBranch] = React.useState("");
  const [upiId, setUpiId] = React.useState("");

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
    if (initialAccounts?.length) setAccounts(initialAccounts);
    else reload();
  }, [initialAccounts, reload]);

  const resetForm = () => {
    setMethod("bank"); setHolder(""); setAccNum(""); setIfsc(""); setBankName(""); setBranch(""); setUpiId("");
  };

  const handleAdd = async () => {
    if (!holder.trim() || !accNum.trim()) { toast("Holder name and account number required"); return; }
    if (method === "bank" && (!ifsc.trim() || !bankName.trim())) { toast("IFSC and bank name required"); return; }
    if (method === "upi" && !upiId.trim()) { toast("UPI ID required"); return; }
    setSaving(true);
    try {
      const r = await fetch(`/api/merchant/stores/${storeId}/bank-accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payout_method: method,
          account_holder_name: holder.trim(),
          account_number: accNum.trim(),
          ifsc_code: method === "bank" ? ifsc.trim().toUpperCase() : undefined,
          bank_name: method === "bank" ? bankName.trim() : undefined,
          branch_name: branch.trim() || null,
          upi_id: method === "upi" ? upiId.trim() : null,
        }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); toast(e?.error || "Failed to add"); return; }
      toast("Bank/UPI account added");
      resetForm(); setShowAdd(false); await reload();
    } catch { toast("Failed to add account"); } finally { setSaving(false); }
  };

  const handleSetDefault = async (id: number) => {
    setActionId(id);
    try {
      const r = await fetch(`/api/merchant/stores/${storeId}/bank-accounts/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ set_default: true }),
      });
      if (!r.ok) toast("Failed to set default");
      else await reload();
    } catch { toast("Failed"); } finally { setActionId(null); }
  };

  const handleToggleDisable = async (acc: any) => {
    if (acc.is_primary && !acc.is_disabled) { toast("Set another account as default first"); return; }
    setActionId(acc.id);
    try {
      const r = await fetch(`/api/merchant/stores/${storeId}/bank-accounts/${acc.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ set_disabled: !acc.is_disabled }),
      });
      if (!r.ok) toast("Failed to update");
      else await reload();
    } catch { toast("Failed"); } finally { setActionId(null); }
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Banknote size={16} className="text-blue-600" />
          Bank Details
        </h3>
        <button type="button" onClick={() => setShowAdd(!showAdd)} className="text-xs font-semibold text-orange-600 hover:text-orange-700">
          {showAdd ? "Cancel" : "+ Add Account"}
        </button>
      </div>

      {showAdd && (
        <div className="bg-white rounded-lg border border-orange-200 p-3 mb-3 space-y-2">
          <div className="flex gap-2 mb-2">
            <button type="button" onClick={() => setMethod("bank")} className={`px-3 py-1 rounded-full text-xs font-semibold ${method === "bank" ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-600"}`}>Bank</button>
            <button type="button" onClick={() => setMethod("upi")} className={`px-3 py-1 rounded-full text-xs font-semibold ${method === "upi" ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-600"}`}>UPI</button>
          </div>
          <input className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs" placeholder="Account holder name *" value={holder} onChange={(e) => setHolder(e.target.value)} />
          <input className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs" placeholder="Account number *" value={accNum} onChange={(e) => setAccNum(e.target.value)} />
          {method === "bank" && (
            <>
              <input className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs" placeholder="IFSC code *" value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} />
              <input className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs" placeholder="Bank name *" value={bankName} onChange={(e) => setBankName(e.target.value)} />
              <input className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs" placeholder="Branch name" value={branch} onChange={(e) => setBranch(e.target.value)} />
            </>
          )}
          {method === "upi" && (
            <input className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs" placeholder="UPI ID *" value={upiId} onChange={(e) => setUpiId(e.target.value)} />
          )}
          <button type="button" onClick={handleAdd} disabled={saving} className="w-full px-3 py-2 bg-orange-500 text-white rounded text-xs font-semibold hover:bg-orange-600 disabled:opacity-50">
            {saving ? "Adding..." : "Add Account"}
          </button>
        </div>
      )}

      {loading && accounts.length === 0 ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : accounts.length === 0 ? (
        <p className="text-xs text-gray-500">No bank/UPI accounts added yet.</p>
      ) : (
        <div className="space-y-2">
          {accounts.map((bank: any) => (
            <div key={bank.id} className={`bg-white rounded p-2 border text-xs ${bank.is_primary ? "border-orange-300" : bank.is_disabled ? "border-gray-200 opacity-60" : "border-gray-200"}`}>
              <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                {bank.is_primary && <span className="text-white bg-orange-500 px-2 py-0.5 rounded-full text-[10px] font-bold">Default</span>}
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold text-white ${bank.payout_method === "upi" ? "bg-purple-500" : "bg-blue-500"}`}>
                  {(bank.payout_method || "bank").toUpperCase()}
                </span>
                {bank.is_disabled && <span className="text-white bg-gray-400 px-2 py-0.5 rounded-full text-[10px] font-bold">Disabled</span>}
                {bank.is_verified ? (
                  <span className="text-white bg-green-500 px-2 py-0.5 rounded-full text-[10px] font-bold">Verified</span>
                ) : (
                  <button
                    type="button"
                    onClick={onVerify}
                    className="text-white bg-amber-500 px-2 py-0.5 rounded-full text-[10px] font-bold hover:bg-amber-600"
                  >
                    Pending
                  </button>
                )}
                {canStoreVerify && !bank.is_verified && onVerify && (
                  <button
                    type="button"
                    onClick={onVerify}
                    className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    Verify
                  </button>
                )}
              </div>
              <div className="space-y-0.5">
                <div><span className="text-gray-500">Holder:</span> <span className="font-semibold text-gray-900">{bank.account_holder_name}</span></div>
                <div><span className="text-gray-500">Account:</span> <span className="font-semibold text-gray-900">{bank.account_number_masked ?? "****"}</span></div>
                {bank.ifsc_code && bank.ifsc_code !== "N/A" && <div><span className="text-gray-500">IFSC:</span> <span className="font-semibold text-gray-900">{bank.ifsc_code}</span></div>}
                {bank.bank_name && bank.bank_name !== "UPI" && <div><span className="text-gray-500">Bank:</span> <span className="font-semibold text-gray-900">{bank.bank_name}</span></div>}
                {bank.branch_name && <div><span className="text-gray-500">Branch:</span> <span className="text-gray-900">{bank.branch_name}</span></div>}
                {bank.upi_id && <div><span className="text-gray-500">UPI:</span> <span className="text-gray-900">{bank.upi_id}</span></div>}
              </div>
              <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100">
                {!bank.is_primary && !bank.is_disabled && (
                  <button type="button" onClick={() => handleSetDefault(bank.id)} disabled={actionId === bank.id} className="px-2 py-1 text-[10px] font-semibold text-orange-600 border border-orange-200 rounded hover:bg-orange-50 disabled:opacity-50">
                    Set Default
                  </button>
                )}
                {!(bank.is_primary && !bank.is_disabled) && (
                  <button type="button" onClick={() => handleToggleDisable(bank)} disabled={actionId === bank.id} className={`px-2 py-1 text-[10px] font-semibold rounded ${bank.is_disabled ? "text-green-600 border border-green-200 hover:bg-green-50" : "text-red-600 border border-red-200 hover:bg-red-50"} disabled:opacity-50`}>
                    {bank.is_disabled ? "Enable" : "Disable"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
