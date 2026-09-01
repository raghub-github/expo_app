"use client";

import {
  Banknote,
  Heart,
  IndianRupee,
  Landmark,
  ReceiptIndianRupee,
  Undo2,
  Wallet,
} from "lucide-react";
import { useCoreData } from "@/lib/hooks/useCoreData";
import { formatCount, formatDateTime, formatInr, prettyLabel } from "@/lib/format";
import { DataTable, ErrorState, GmvHead, KpiCard, LoadingGrid, Panel, StatusPill } from "@/components/ui/Primitives";
import { SharePie } from "@/components/charts/Charts";
import type { PaymentsData as Data } from "@/lib/data-types";

function FlowRow({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#F0F2FB] py-2.5 last:border-0">
      <div>
        <p className="text-[13px] text-[#1E1C4A]">{label}</p>
        {hint ? <p className="text-[11px] text-[#6B6894]">{hint}</p> : null}
      </div>
      <p className="text-[13px] font-semibold tabular-nums text-[#1E1C4A]">{formatInr(value)}</p>
    </div>
  );
}

export default function PaymentsPage() {
  const { data, loading, error, reload } = useCoreData<Data>("/api/payments");
  if (loading) return <LoadingGrid count={8} />;
  if (error || !data) return <ErrorState message={error || "Failed"} onRetry={reload} />;

  const w = data.waterflow ?? {
    orders: 0,
    gmv: 0,
    itemTotal: 0,
    realAmount: 0,
    walletAmount: 0,
    online: 0,
    cash: 0,
    gstCustomer: 0,
    gstPlatform: 0,
    tds: 0,
    platformFee: 0,
    commission: 0,
    merchantNet: 0,
    riderEarning: 0,
    riderTips: 0,
    feedingIndia: 0,
    refunds: 0,
    refundCount: 0,
    netAfterRefunds: 0,
  };
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Customer GMV"
          sublabel="Gross Merchandise Value"
          value={formatInr(w.gmv, true)}
          hint={`${formatCount(w.orders)} delivered orders`}
          icon={IndianRupee}
        />
        <KpiCard label="Gateway / cash" value={formatInr(w.realAmount, true)} hint="After GatiCash" icon={Banknote} tone="sky" />
        <KpiCard label="Wallet (GatiCash)" value={formatInr(w.walletAmount, true)} icon={Wallet} tone="lavender" />
        <KpiCard
          label="Refunds"
          value={formatInr(w.refunds, true)}
          hint={`${formatCount(w.refundCount)} refunds`}
          icon={Undo2}
          tone="coral"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="GST collected" value={formatInr(w.gstCustomer, true)} hint="Customer bill tax" icon={ReceiptIndianRupee} />
        <KpiCard label="GST to remit" value={formatInr(w.gstPlatform, true)} hint="Platform + ride GST" icon={Landmark} tone="sky" />
        <KpiCard label="Feeding India" value={formatInr(w.feedingIndia, true)} icon={Heart} tone="coral" />
        <KpiCard label="Rider tips" value={formatInr(w.riderTips, true)} icon={IndianRupee} tone="green" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Where the rupee goes (delivered)">
          <FlowRow label="Item / fare total" value={w.itemTotal || w.gmv} />
          <FlowRow label="Online (UPI / card)" value={w.online} hint="Razorpay and similar" />
          <FlowRow label="Cash / COD" value={w.cash} />
          <FlowRow label="Wallet / GatiCash" value={w.walletAmount} />
          <FlowRow label="Platform fee" value={w.platformFee} hint="Includes GMitra Plus" />
          <FlowRow label="Commission" value={w.commission} />
          <FlowRow label="Merchant net" value={w.merchantNet} />
          <FlowRow label="Rider earnings" value={w.riderEarning} hint="Waiting charges excluded" />
          <FlowRow label="Rider tips" value={w.riderTips} hint="Pass-through to rider" />
          <FlowRow label="Feeding India donations" value={w.feedingIndia} hint="Pass-through charity" />
          <FlowRow label="GST on customer bill" value={w.gstCustomer} />
          <FlowRow label="TDS on merchants" value={w.tds} />
          <FlowRow label="Refunds out" value={w.refunds} />
          <FlowRow label="Net after refunds" value={w.netAfterRefunds} />
        </Panel>
        <Panel title="Payment mix">
          <SharePie
            data={[
              { name: "Online", value: w.online },
              { name: "Cash", value: w.cash },
              { name: "Wallet", value: w.walletAmount },
            ]}
          />
        </Panel>
      </div>

      <Panel title="By service (delivered)">
        <DataTable
          columns={["Service", "Orders", <GmvHead key="gmv" />, "GST", "Tips", "Feeding India"]}
          rows={data.byService.map((r) => [
            prettyLabel(r.type),
            formatCount(r.orders),
            formatInr(r.gmv),
            formatInr(r.gst),
            formatInr(r.tips),
            formatInr(r.donations),
          ])}
        />
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Method × status">
          <DataTable
            columns={["Method", "Status", "Orders", "Amount"]}
            rows={data.mix.map((r) => [
              prettyLabel(r.method),
              <StatusPill key={`${r.method}-${r.status}`} value={r.status} />,
              formatCount(r.orders),
              formatInr(r.amount),
            ])}
          />
        </Panel>
        <Panel title="Onboarding fees">
          <DataTable
            columns={["Who", "Status", "Count", "Amount"]}
            rows={data.onboarding.map((r) => [
              prettyLabel(r.kind),
              prettyLabel(r.status),
              formatCount(r.count),
              formatInr(r.amount),
            ])}
          />
        </Panel>
      </div>
      <Panel title="Onboarding payment records">
        <DataTable
          pageSize={10}
          columns={["Type", "Name", "Status", "Amount", "When"]}
          rows={(data.onboardingRecords ?? []).map((r, i) => [
            prettyLabel(r.kind),
            r.name,
            <StatusPill key={`ob-${i}`} value={r.status} />,
            formatInr(r.amount),
            formatDateTime(r.createdAt),
          ])}
        />
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Merchant payouts (this period)">
          <DataTable
            columns={["Status", "Count", "Amount"]}
            rows={data.payouts.map((r) => [prettyLabel(r.status), formatCount(r.count), formatInr(r.amount)])}
          />
        </Panel>
        <Panel title="Rider withdrawals (this period)">
          <DataTable
            columns={["Status", "Count", "Amount"]}
            rows={data.withdrawals.map((r) => [prettyLabel(r.status), formatCount(r.count), formatInr(r.amount)])}
          />
        </Panel>
      </div>
      <Panel title="Merchant payout records">
        <DataTable
          pageSize={10}
          columns={["Store", "Status", "Requested", "Net payout", "UTR", "When"]}
          rows={(data.payoutRecords ?? []).map((r, i) => [
            r.store,
            <StatusPill key={`payout-${i}`} value={r.status} />,
            formatInr(r.amount),
            formatInr(r.net),
            r.utr,
            formatDateTime(r.createdAt),
          ])}
        />
      </Panel>
      <Panel title="Rider withdrawal records">
        <DataTable
          pageSize={10}
          columns={["Rider", "Status", "Amount", "When"]}
          rows={(data.withdrawalRecords ?? []).map((r, i) => [
            r.rider,
            <StatusPill key={`wd-${i}`} value={r.status} />,
            formatInr(r.amount),
            formatDateTime(r.createdAt),
          ])}
        />
      </Panel>
    </div>
  );
}
