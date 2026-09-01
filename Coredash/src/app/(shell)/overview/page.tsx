"use client";

import {
  Bike,
  Heart,
  IndianRupee,
  Landmark,
  ReceiptIndianRupee,
  ShoppingCart,
  Store,
  Ticket,
  Undo2,
  UserCircle,
  Wallet,
} from "lucide-react";
import { useCoreData } from "@/lib/hooks/useCoreData";
import { formatCount, formatInr, formatPct, prettyLabel } from "@/lib/format";
import { DataTable, ErrorState, GmvHead, KpiCard, LoadingGrid, Panel } from "@/components/ui/Primitives";
import { RevenueArea, ServiceBars } from "@/components/charts/Charts";
import type { OverviewData } from "@/lib/data-types";

export default function OverviewPage() {
  const { data, loading, error, reload } = useCoreData<OverviewData>("/api/overview");

  if (loading) return <LoadingGrid count={8} />;
  if (error || !data) return <ErrorState message={error || "Failed"} onRetry={reload} />;

  const k = data.kpis;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Platform revenue"
          sublabel="Collected from users"
          value={formatInr(k.platformRevenue ?? 0, true)}
          delta={k.platformRevenueDelta}
          hint={`Services ${formatInr(k.platformRevenueCharges ?? 0)} · Onboard ${formatInr(k.platformRevenueOnboarding ?? 0)} · Penalties ${formatInr(k.platformRevenuePenalties ?? 0)}`}
          icon={Landmark}
        />
        <KpiCard
          label="GMV"
          sublabel="Gross Merchandise Value"
          value={formatInr(k.gmv, true)}
          delta={k.gmvDelta}
          hint="Delivered value"
          icon={IndianRupee}
        />
        <KpiCard label="Orders" value={formatCount(k.orders)} delta={k.ordersDelta} hint={`${formatCount(k.live)} live now`} icon={ShoppingCart} tone="sky" />
        <KpiCard label="Completion" value={formatPct(k.completionRate)} hint={`${formatCount(k.delivered)} delivered`} icon={Store} tone="green" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="GST to remit"
          value={formatInr(k.gstCollected, true)}
          hint={`On bills ${formatInr(k.gstOnBills ?? 0)} · item GST with merchants`}
          icon={ReceiptIndianRupee}
        />
        <KpiCard
          label="Rider earnings"
          value={formatInr(k.riderEarning ?? 0, true)}
          hint="Waiting charges excluded"
          icon={Bike}
          tone="green"
        />
        <KpiCard
          label="GatiCash outstanding"
          value={formatInr(k.wallet, true)}
          hint={`${formatInr(k.walletUsed ?? 0)} used this period`}
          icon={Wallet}
          tone="sky"
        />
        <KpiCard
          label="Platform fee"
          value={formatInr(k.platformFee ?? 0, true)}
          hint="Booking + platform fee + GMitra Plus"
          icon={IndianRupee}
          tone="lavender"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Feeding India"
          value={formatInr(k.feedingIndia, true)}
          hint={`This period ${formatInr(k.feedingIndiaLifetime ?? 0)}`}
          icon={Heart}
          tone="coral"
        />
        <KpiCard
          label="Rider tips"
          value={formatInr(k.riderTips, true)}
          hint={`This period ${formatInr(k.riderTipsLifetime ?? 0)}`}
          icon={IndianRupee}
          tone="green"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Customers" value={formatCount(k.customers)} hint={`${formatCount(k.newCustomers)} new`} icon={UserCircle} tone="sky" />
        <KpiCard label="Riders online" value={`${formatCount(k.ridersOnline)} / ${formatCount(k.riders)}`} icon={Bike} />
        <KpiCard label="Live stores" value={`${formatCount(k.storesLive)} / ${formatCount(k.stores)}`} icon={Store} tone="lavender" />
        <KpiCard label="Refunds" value={formatInr(k.refunds, true)} icon={Undo2} tone="coral" />
        <KpiCard label="Open tickets" value={formatCount(k.openTickets)} icon={Ticket} tone="coral" />
      </div>
      <div className="grid gap-4 xl:grid-cols-5">
        <Panel title="Revenue trend" className="xl:col-span-3">
          <RevenueArea data={data.trend} />
        </Panel>
        <Panel title="By service" className="xl:col-span-2">
          <ServiceBars data={data.byType.map((r) => ({ type: prettyLabel(r.type), orders: r.orders, gmv: r.gmv }))} />
        </Panel>
      </div>
      <Panel title="Service mix">
        <DataTable
          columns={["Service", "Orders", "Delivered", <GmvHead key="gmv" />]}
          rows={data.byType.map((r) => [
            prettyLabel(r.type),
            formatCount(r.orders),
            formatCount(r.delivered),
            formatInr(r.gmv),
          ])}
        />
      </Panel>
    </div>
  );
}
