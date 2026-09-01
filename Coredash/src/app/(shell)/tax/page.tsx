"use client";

import { useState } from "react";
import { Landmark, ReceiptIndianRupee } from "lucide-react";
import { toast } from "sonner";
import { useCoreData } from "@/lib/hooks/useCoreData";
import { formatCount, formatDateTime, formatInr } from "@/lib/format";
import { DataTable, ErrorState, KpiCard, LoadingGrid, Panel } from "@/components/ui/Primitives";
import type { TaxData as Data } from "@/lib/data-types";

function lastDayOfMonth(ym: string) {
  const [year, month] = ym.split("-").map(Number);
  if (!year || !month) return `${ym}-28`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${ym}-${String(last).padStart(2, "0")}`;
}

export default function TaxPage() {
  const { data, loading, error, reload } = useCoreData<Data>("/api/tax");
  const [periodLabel, setPeriodLabel] = useState("");
  const [amountFiled, setAmountFiled] = useState("");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveFiling() {
    if (!periodLabel.trim() || !amountFiled) {
      toast.error("Period and amount are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/tax", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          taxType: "GST",
          periodLabel: periodLabel.trim(),
          periodStart: `${periodLabel.trim()}-01`,
          periodEnd: lastDayOfMonth(periodLabel.trim()),
          amountDue: data?.gstPlatform ?? data?.gstCollected ?? 0,
          amountFiled: Number(amountFiled),
          reference,
        }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error || "Could not save");
      toast.success("Filing recorded");
      setPeriodLabel("");
      setAmountFiled("");
      setReference("");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingGrid />;
  if (error || !data) return <ErrorState message={error || "Failed"} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="GST collected" value={formatInr(data.gstCollected, true)} hint="On customer bills" icon={ReceiptIndianRupee} />
        <KpiCard label="GST to remit" value={formatInr(data.gstPlatform, true)} hint="Platform + ride GST" icon={Landmark} tone="sky" />
        <KpiCard label="TDS on merchants" value={formatInr(data.tdsCollected, true)} hint="From settlement" icon={Landmark} tone="lavender" />
        <KpiCard label="Already filed" value={formatInr(data.gstFiled, true)} tone="green" icon={ReceiptIndianRupee} />
        <KpiCard
          label="Still due"
          value={formatInr(data.gstRemaining, true)}
          hint={data.lastFiledAt ? `Last filing ${formatDateTime(data.lastFiledAt)} (${data.lastFiledLabel})` : "No filing recorded yet"}
          tone="coral"
          icon={Landmark}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="GST / TDS by month">
          <DataTable
            columns={["Month", "Orders", "GST", "TDS"]}
            rows={data.monthly.map((r) => [r.month, formatCount(r.orders), formatInr(r.gst), formatInr(r.tds)])}
          />
        </Panel>
        <Panel title="Record a GST filing">
          <p className="mb-3 text-[12px] text-[#6B6894]">
            Track when GatiMitra last remitted GST. Use period like 2026-08.
          </p>
          <label className="text-[12px] font-medium text-[#6B6894]">Period (YYYY-MM)</label>
          <input
            className="mt-1 mb-3 h-10 w-full rounded-xl border border-[#E4E7F7] px-3 text-sm"
            placeholder="2026-08"
            value={periodLabel}
            onChange={(e) => setPeriodLabel(e.target.value)}
          />
          <label className="text-[12px] font-medium text-[#6B6894]">Amount filed (₹)</label>
          <input
            className="mt-1 mb-3 h-10 w-full rounded-xl border border-[#E4E7F7] px-3 text-sm"
            type="number"
            value={amountFiled}
            onChange={(e) => setAmountFiled(e.target.value)}
          />
          <label className="text-[12px] font-medium text-[#6B6894]">Challan / ARN</label>
          <input
            className="mt-1 mb-4 h-10 w-full rounded-xl border border-[#E4E7F7] px-3 text-sm"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveFiling()}
            className="rounded-xl bg-[#4B49AC] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save filing"}
          </button>
        </Panel>
      </div>

      <Panel title="Filing history">
        <DataTable
          pageSize={10}
          columns={["Period", "Type", "Due", "Filed", "Reference", "When"]}
          rows={data.filings.map((r) => [
            r.periodLabel,
            r.taxType,
            formatInr(r.amountDue),
            formatInr(r.amountFiled),
            r.reference,
            formatDateTime(r.filedAt),
          ])}
        />
      </Panel>
    </div>
  );
}
