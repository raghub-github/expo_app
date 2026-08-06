"use client";

import { useMemo, useState, type ComponentType } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BarChart3, Percent, Plus, Sparkles, Tag, Ticket, Users } from "lucide-react";
import { RiderIncentiveProgramsClient } from "@/components/super-admin/RiderIncentiveProgramsClient";
import {
  useDeleteBillingDiscountMutation,
  useDeleteBillingPlatformOfferMutation,
  useGetBillingDiscountsQuery,
  useGetBillingPlatformOffersQuery,
} from "@/store/api/billingAdminApi";
import { feeKindTableLabel } from "@/lib/billing/platformOfferKindUi";
import {
  parseRideParcelPromoConfig,
  rideParcelPromoPreviewTitle,
} from "@/lib/billing/rideParcelPromo";
import type { BillingAdminPlatformOfferRow } from "@/store/api/billingAdminApi";
import { cn } from "@/lib/utils";

const cardCls =
  "rounded-xl border border-slate-200/80 bg-white p-4 text-slate-900 shadow-sm ring-1 ring-slate-900/[0.03] sm:p-5";

function platformOfferKindLabel(o: BillingAdminPlatformOfferRow): string {
  const st = String(o.service_type ?? "").toUpperCase();
  if (st === "RIDE" || st === "PARCEL") {
    const cfg = parseRideParcelPromoConfig(o.promo_config);
    if (cfg?.promo_type) return cfg.promo_type;
  }
  return o.offer_kind || "—";
}

function platformOfferDiscountLabel(o: BillingAdminPlatformOfferRow): string {
  const st = String(o.service_type ?? "").toUpperCase();
  if (st === "RIDE" || st === "PARCEL") {
    const cfg = parseRideParcelPromoConfig(o.promo_config);
    if (cfg) {
      const raw = o.value_numeric != null && String(o.value_numeric).trim() !== ""
        ? Number(o.value_numeric)
        : null;
      return rideParcelPromoPreviewTitle(
        cfg,
        st === "PARCEL" ? "PARCEL" : "RIDE",
        o.discount_type,
        raw != null && Number.isFinite(raw) ? raw : null
      );
    }
  }
  if (o.discount_type && o.value_numeric != null && String(o.value_numeric).trim() !== "") {
    return o.discount_type === "PERCENTAGE" ? `${o.value_numeric}%` : `₹${o.value_numeric}`;
  }
  return "—";
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
  accent: "indigo" | "emerald" | "violet" | "amber";
}) {
  const iconBg =
    accent === "indigo"
      ? "bg-indigo-500/10 text-indigo-600"
      : accent === "emerald"
        ? "bg-emerald-500/10 text-emerald-600"
        : accent === "amber"
          ? "bg-amber-500/10 text-amber-700"
          : "bg-violet-500/10 text-violet-600";

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-slate-200/80 bg-white px-3 py-2 shadow-sm">
      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-lg font-semibold tabular-nums leading-tight text-slate-900">{value}</p>
      </div>
    </div>
  );
}

type PageMode = "offer" | "incentive";

function shortScheduleLabel(from: string | null | undefined, until: string | null | undefined): string {
  const a = from != null && String(from).trim() !== "" ? String(from).slice(0, 10) : "";
  const b = until != null && String(until).trim() !== "" ? String(until).slice(0, 10) : "";
  if (!a && !b) return "—";
  if (a && b) return `${a} → ${b}`;
  return a ? `from ${a}` : `until ${b}`;
}

function offerScheduleDisplay(startsAt: string | null | undefined, endsAt: string | null | undefined): string {
  const fmt = (raw: string | null | undefined): string | null => {
    if (raw == null || String(raw).trim() === "") return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return String(raw).slice(0, 16);
    return d
      .toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
      .replace(/\bam\b/i, (m) => m.toLowerCase())
      .replace(/\bpm\b/i, (m) => m.toLowerCase());
  };
  const start = fmt(startsAt);
  const end = fmt(endsAt);
  if (!start && !end) return "Never Expires";
  if (start && end) return `${start}\n↓\n${end}`;
  if (start && !end) return `${start}\n↓\nNever Expires`;
  return `Starts immediately\n↓\n${end}`;
}

function offerLifecycleStatus(o: {
  is_active?: boolean | null;
  starts_at?: string | null;
  ends_at?: string | null;
}): { label: "Active" | "Expired" | "Inactive" | "Upcoming"; className: string } {
  const now = Date.now();
  const endsAt = o.ends_at != null && String(o.ends_at).trim() !== "" ? new Date(o.ends_at).getTime() : null;
  const startsAt =
    o.starts_at != null && String(o.starts_at).trim() !== "" ? new Date(o.starts_at).getTime() : null;

  if (endsAt != null && !Number.isNaN(endsAt) && endsAt < now) {
    return { label: "Expired", className: "bg-rose-50 text-rose-700 ring-rose-600/20" };
  }
  if (o.is_active === false) {
    return { label: "Inactive", className: "bg-slate-100 text-slate-600 ring-slate-500/20" };
  }
  if (startsAt != null && !Number.isNaN(startsAt) && startsAt > now) {
    return { label: "Upcoming", className: "bg-amber-50 text-amber-800 ring-amber-600/20" };
  }
  return { label: "Active", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" };
}

export default function OffersCouponsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: offers = [], isLoading: offersLoading } = useGetBillingPlatformOffersQuery();
  const { data: coupons = [], isLoading: couponsLoading } = useGetBillingDiscountsQuery();
  const [deleteOffer] = useDeleteBillingPlatformOfferMutation();
  const [deleteCoupon] = useDeleteBillingDiscountMutation();
  const pageMode: PageMode =
    (searchParams.get("tab") ?? "").toLowerCase() === "incentive" ? "incentive" : "offer";
  const [err, setErr] = useState<string | null>(null);

  const setPageMode = (mode: PageMode) => {
    const next = new URLSearchParams(searchParams.toString());
    if (mode === "incentive") next.set("tab", "incentive");
    else next.delete("tab");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const offerStats = useMemo(() => {
    const total = offers.length;
    const active = offers.filter((o) => o.is_active).length;
    const nonCustomerAudience = offers.filter(
      (o) => String(o.offer_audience ?? "CUSTOMER").toUpperCase() !== "CUSTOMER",
    ).length;
    return { total, active, nonCustomerAudience };
  }, [offers]);

  const removeOffer = async (id: number) => {
    if (!confirm("Delete platform offer?")) return;
    setErr(null);
    try {
      await deleteOffer(id).unwrap();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to delete offer");
    }
  };

  const removeCoupon = async (id: number) => {
    if (!confirm("Delete coupon?")) return;
    setErr(null);
    try {
      await deleteCoupon(id).unwrap();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to delete coupon");
    }
  };

  return (
    <div className="w-full min-w-0 max-w-none space-y-4 bg-gradient-to-b from-slate-50/80 to-white px-4 pb-12 pt-4 text-slate-900 sm:px-6 sm:pb-16 lg:px-8">
      <header className="flex flex-nowrap items-center justify-end gap-3">
        <div
          className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-slate-50/80 p-0.5"
          role="tablist"
          aria-label="Offer or Incentive mode"
        >
          <button
            type="button"
            role="tab"
            aria-selected={pageMode === "offer"}
            className={cn(
              "min-h-[34px] rounded-md px-4 text-sm font-semibold transition",
              pageMode === "offer"
                ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80"
                : "text-slate-600 hover:text-slate-900",
            )}
            onClick={() => setPageMode("offer")}
          >
            Offer
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pageMode === "incentive"}
            className={cn(
              "min-h-[34px] rounded-md px-4 text-sm font-semibold transition",
              pageMode === "incentive"
                ? "bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-200/80"
                : "text-slate-600 hover:text-slate-900",
            )}
            onClick={() => setPageMode("incentive")}
          >
            Incentive
          </button>
        </div>
      </header>

      {pageMode === "incentive" ? (
        <RiderIncentiveProgramsClient />
      ) : (
        <>
          {err ? (
            <div
              className="rounded-lg border border-red-200/90 bg-red-50/90 px-3 py-2 text-sm text-red-800"
              role="alert"
            >
              {err}
            </div>
          ) : null}

          {/* 5 compact CTA / stat cards — never wrap */}
          <section className="flex flex-nowrap gap-2 overflow-x-auto pb-0.5">
            <StatCard label="Total offers" value={offerStats.total} icon={Tag} accent="indigo" />
            <StatCard label="Active offers" value={offerStats.active} icon={Sparkles} accent="emerald" />
            <StatCard
              label="Merchant / rider"
              value={offerStats.nonCustomerAudience}
              icon={Users}
              accent="violet"
            />
            <StatCard label="Coupons" value={coupons.length} icon={Percent} accent="amber" />
            <Link
              href="/dashboard/super-admin/offers-coupons/analytics"
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-indigo-200/80 bg-gradient-to-r from-indigo-50 to-white px-3 py-2 shadow-sm transition hover:border-indigo-300"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600">
                <BarChart3 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[10px] font-medium uppercase tracking-wide text-indigo-600">Analytics</p>
                <p className="truncate text-sm font-semibold leading-tight text-slate-900">Offer audit</p>
              </div>
            </Link>
          </section>

          {/* Compact promo actions strip */}
          <section className="flex flex-nowrap items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm">
            <p className="shrink-0 text-sm font-semibold text-slate-900">Promo</p>
            <span className="hidden h-4 w-px shrink-0 bg-slate-200 sm:block" aria-hidden />
            <p className="mr-auto hidden truncate text-xs text-slate-500 sm:block">
              Create &amp; edit on dedicated pages
            </p>
            <div className="flex flex-nowrap items-center gap-2">
              <Link
                href="/dashboard/super-admin/offers-coupons/new"
                className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                <Plus className="h-3.5 w-3.5" />
                Platform offer
              </Link>
              <Link
                href="/dashboard/super-admin/offers-coupons/coupons/new"
                className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Ticket className="h-3.5 w-3.5" />
                Checkout coupon
              </Link>
            </div>
          </section>

          <section className={cardCls}>
            <div className="mb-3 flex flex-nowrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold tracking-tight text-slate-900">Offers</h2>
              <Link
                href="/dashboard/super-admin/offers-coupons/new"
                className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
              >
                + New
              </Link>
            </div>
            <div className="rounded-xl border border-slate-200/80">
              <div className="overflow-x-auto overscroll-x-contain">
                <table className="w-max min-w-full border-collapse text-sm whitespace-nowrap">
                  <thead className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-3 py-2.5">Name</th>
                      <th className="px-3 py-2.5">Coupon</th>
                      <th className="px-3 py-2.5">Service</th>
                      <th className="px-3 py-2.5">Kind</th>
                      <th className="px-3 py-2.5">Discount</th>
                      <th className="px-3 py-2.5">Buy</th>
                      <th className="px-3 py-2.5">Get</th>
                      <th className="px-3 py-2.5">Fee target</th>
                      <th className="px-3 py-2.5">Audience</th>
                      <th className="px-3 py-2.5">Scope</th>
                      <th className="px-3 py-2.5">Segment</th>
                      <th className="px-3 py-2.5">Schedule</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Per user</th>
                      <th className="px-3 py-2.5">Budget</th>
                      <th className="px-3 py-2.5">Priority</th>
                      <th className="sticky right-0 z-10 bg-slate-50/95 px-3 py-2.5 shadow-[-6px_0_8px_-6px_rgba(15,23,42,0.15)]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {offersLoading ? (
                      <tr>
                        <td className="px-3 py-6 text-center text-slate-500" colSpan={17}>
                          Loading…
                        </td>
                      </tr>
                    ) : offers.length === 0 ? (
                      <tr>
                        <td className="px-3 py-8 text-center text-slate-500" colSpan={17}>
                          No offers yet.{" "}
                          <Link href="/dashboard/super-admin/offers-coupons/new" className="text-indigo-600 underline">
                            Create one
                          </Link>
                        </td>
                      </tr>
                    ) : (
                      offers.map((o) => {
                        const status = offerLifecycleStatus(o);
                        const kindLabel = platformOfferKindLabel(o);
                        const discountLabel = platformOfferDiscountLabel(o);
                        return (
                          <tr key={o.id} className="group transition-colors hover:bg-slate-50/80">
                            <td className="px-3 py-2.5 font-medium text-slate-900">
                              <div className="flex flex-col gap-1">
                                <span>{o.name ?? `Offer #${o.id}`}</span>
                                {(() => {
                                  const cond =
                                    o.conditions && typeof o.conditions === "object" && !Array.isArray(o.conditions)
                                      ? (o.conditions as Record<string, unknown>)
                                      : {};
                                  const promo = parseRideParcelPromoConfig(o.promo_config);
                                  const firstRide =
                                    cond.first_ride_only === true ||
                                    cond.first_ride_only === "true" ||
                                    cond.first_ride_only === 1 ||
                                    (promo != null &&
                                      promo.first_n_completed === 1 &&
                                      (promo.promo_type === "FREE_FIRST_N" ||
                                        promo.promo_type === "NEW_USER_N"));
                                  return firstRide ? (
                                    <span className="inline-flex w-fit rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 ring-1 ring-inset ring-violet-600/20">
                                      First ride only
                                    </span>
                                  ) : null;
                                })()}
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold tracking-wide text-slate-800 ring-1 ring-inset ring-slate-200">
                                {o.coupon_code?.trim() || "—"}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-slate-700">{o.service_type}</td>
                            <td className="px-3 py-2.5 text-slate-700">
                              <span className="whitespace-nowrap">{kindLabel}</span>
                            </td>
                            <td className="px-3 py-2.5 text-slate-700">
                              <span className="max-w-[14rem] whitespace-normal break-words tabular-nums">
                                {discountLabel}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 tabular-nums text-slate-700">
                              {o.buy_qty != null && String(o.buy_qty) !== "" ? o.buy_qty : "—"}
                            </td>
                            <td className="px-3 py-2.5 tabular-nums text-slate-700">
                              {o.get_qty != null && String(o.get_qty) !== "" ? o.get_qty : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-slate-600">
                              {feeKindTableLabel(String(o.offer_kind ?? ""))}
                            </td>
                            <td className="px-3 py-2.5 text-slate-700">
                              {String(o.offer_audience ?? "CUSTOMER").toUpperCase()}
                            </td>
                            <td className="px-3 py-2.5 text-slate-700">{o.target_scope}</td>
                            <td className="px-3 py-2.5 text-slate-700">{o.customer_segment}</td>
                            <td className="px-3 py-2.5 text-xs leading-snug text-slate-700">
                              <span className="inline-block whitespace-pre">
                                {offerScheduleDisplay(o.starts_at, o.ends_at)}
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              <span
                                className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${status.className}`}
                              >
                                {status.label}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 tabular-nums text-slate-700">
                              {o.max_uses_per_user != null ? o.max_uses_per_user : "∞"}
                            </td>
                            <td className="px-3 py-2.5 tabular-nums text-slate-700">
                              {o.budget_total != null && String(o.budget_total).trim() !== ""
                                ? o.budget_total
                                : "—"}
                            </td>
                            <td className="px-3 py-2.5 tabular-nums text-slate-700">{o.priority}</td>
                            <td className="sticky right-0 z-10 bg-white px-3 py-2.5 shadow-[-6px_0_8px_-6px_rgba(15,23,42,0.12)] group-hover:bg-slate-50/80">
                              <div className="flex flex-nowrap gap-2">
                                <Link
                                  href={`/dashboard/super-admin/offers-coupons/${o.id}/edit`}
                                  className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
                                >
                                  Edit
                                </Link>
                                <button
                                  type="button"
                                  className="text-xs font-medium text-red-600 hover:text-red-500"
                                  onClick={() => void removeOffer(o.id)}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className={cardCls}>
            <div className="mb-3 flex flex-nowrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold tracking-tight text-slate-900">Coupons</h2>
              <Link
                href="/dashboard/super-admin/offers-coupons/coupons/new"
                className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
              >
                + New
              </Link>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200/80">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm whitespace-nowrap">
                  <thead className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-3 py-2.5">Code</th>
                      <th className="px-3 py-2.5">Audience</th>
                      <th className="px-3 py-2.5">Service</th>
                      <th className="px-3 py-2.5">Discount</th>
                      <th className="px-3 py-2.5">Total cap</th>
                      <th className="px-3 py-2.5">Per user</th>
                      <th className="px-3 py-2.5">Used</th>
                      <th className="px-3 py-2.5">Schedule</th>
                      <th className="px-3 py-2.5">Active</th>
                      <th className="px-3 py-2.5">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {couponsLoading ? (
                      <tr>
                        <td className="px-3 py-6 text-center text-slate-500" colSpan={10}>
                          Loading…
                        </td>
                      </tr>
                    ) : coupons.length === 0 ? (
                      <tr>
                        <td className="px-3 py-8 text-center text-slate-500" colSpan={10}>
                          No coupons yet.{" "}
                          <Link
                            href="/dashboard/super-admin/offers-coupons/coupons/new"
                            className="text-indigo-600 underline"
                          >
                            Create one
                          </Link>
                        </td>
                      </tr>
                    ) : (
                      coupons.map((c) => {
                        const aud = String(c.offer_audience ?? "CUSTOMER").toUpperCase();
                        return (
                          <tr key={c.id} className="transition-colors hover:bg-slate-50/80">
                            <td className="px-3 py-2.5 font-medium text-slate-900">{c.code}</td>
                            <td className="px-3 py-2.5 text-slate-700">{aud}</td>
                            <td className="px-3 py-2.5 text-slate-700">{c.service_type ?? "FOOD"}</td>
                            <td className="px-3 py-2.5 text-slate-700">
                              {c.discount_type} · {c.value_numeric ?? "—"}
                            </td>
                            <td className="px-3 py-2.5 tabular-nums text-slate-700">
                              {c.usage_limit != null ? c.usage_limit : "∞"}
                            </td>
                            <td className="px-3 py-2.5 tabular-nums text-slate-700">
                              {c.per_user_usage_limit != null ? c.per_user_usage_limit : "∞"}
                            </td>
                            <td className="px-3 py-2.5 tabular-nums text-slate-700">{c.used_count}</td>
                            <td className="px-3 py-2.5 text-xs text-slate-600">
                              {shortScheduleLabel(c.valid_from, c.valid_until)}
                            </td>
                            <td className="px-3 py-2.5 text-slate-700">{c.is_active ? "Yes" : "No"}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex flex-nowrap gap-2">
                                <Link
                                  href={`/dashboard/super-admin/offers-coupons/coupons/${c.id}/edit`}
                                  className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
                                >
                                  Edit
                                </Link>
                                <button
                                  type="button"
                                  className="text-xs font-medium text-red-600 hover:text-red-500"
                                  onClick={() => void removeCoupon(c.id)}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
