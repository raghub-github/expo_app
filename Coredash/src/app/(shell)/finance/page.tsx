"use client";

import { Heart, IndianRupee, Landmark, ReceiptIndianRupee, Undo2, Wallet } from "lucide-react";
import { useCoreData } from "@/lib/hooks/useCoreData";
import { formatCount, formatInr } from "@/lib/format";
import { ErrorState, KpiCard, LoadingGrid, Panel } from "@/components/ui/Primitives";
import type { FinanceData as Data } from "@/lib/data-types";

export default function FinancePage() {
  const { data, loading, error, reload } = useCoreData<Data>("/api/finance");
  if (loading) return <LoadingGrid />;
  if (error || !data) return <ErrorState message={error || "Failed"} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="GMV"
          sublabel="Gross Merchandise Value"
          value={formatInr(data.gmv, true)}
          icon={IndianRupee}
        />
        <KpiCard label="Commission" value={formatInr(data.commission, true)} icon={Landmark} tone="sky" />
        <KpiCard label="Platform fee" value={formatInr(data.platformFee, true)} hint="Booking + platform + GMitra Plus" icon={Landmark} tone="lavender" />
        <KpiCard
          label="Refunds"
          value={formatInr(data.refunds.amount, true)}
          hint={`${formatCount(data.refunds.count)} refunds`}
          icon={Undo2}
          tone="coral"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="GST to remit" value={formatInr(data.gst, true)} hint="Platform + ride GST" icon={ReceiptIndianRupee} />
        <KpiCard label="Rider earnings" value={formatInr(data.riderEarning, true)} hint="Waiting charges excluded" icon={Wallet} tone="sky" />
        <KpiCard label="Rider tips" value={formatInr(data.riderTips, true)} icon={IndianRupee} tone="green" />
        <KpiCard label="Feeding India" value={formatInr(data.feedingIndia, true)} icon={Heart} tone="coral" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Panel title="Customer wallet float">
          <p className="text-[28px] font-semibold text-[#1E1C4A]">{formatInr(data.customerWallet)}</p>
          <p className="mt-1 text-[13px] text-[#6B6894]">Sum of current_balance on customer_wallet</p>
        </Panel>
        <Panel title="Rider wallet float">
          <p className="text-[28px] font-semibold text-[#1E1C4A]">{formatInr(data.riderWallet)}</p>
          <p className="mt-1 text-[13px] text-[#6B6894]">Sum of total_balance on rider_wallet</p>
        </Panel>
      </div>
    </div>
  );
}
