"use client";

import {
  RIDE_PARCEL_PROMO_TYPES,
  RIDE_VEHICLE_OPTIONS,
  PEAK_SLOT_OPTIONS,
  PAYMENT_MODE_OPTIONS,
  emptyRideParcelPromoConfig,
  rideParcelPromoPreviewTitle,
  type RideParcelPromoConfig,
  type RideParcelPromoType,
} from "@/lib/billing/rideParcelPromo";

const controlCls =
  "w-full min-h-[42px] rounded-lg border border-slate-200/90 bg-slate-50/40 px-3 py-2.5 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] transition-[border-color,box-shadow,background-color] placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

const RIDE_PROMO_LABELS: Record<string, string> = {
  FLAT_OFF: "Flat fare discount (₹ OFF)",
  PERCENT_OFF: "Percentage discount (% OFF)",
  FREE_FIRST_N: "Free ride — first N rides",
  FREE_UP_TO_KM: "Free ride up to X km",
  FLAT_FARE_UP_TO_KM: "Flat fare up to distance",
  PAY_FIXED: "Pay fixed amount",
  FARE_CAP: "Fare cap (max payable)",
  DISTANCE_TIERED: "Distance-tiered discount",
  PEAK_HOUR: "Peak hour offer",
  ROUTE_ZONE: "Route / zone offer",
  PAYMENT_MODE: "Payment mode offer",
  NEW_USER_N: "New rider — first N rides",
  LOYALTY_MILESTONE: "Loyalty milestone",
  REFERRAL: "Refer & ride",
  SUBSCRIPTION: "Subscription benefit (GM Plus)",
  COUPON: "Coupon-based ride offer",
  FREE_PICKUP: "Free pickup",
  FREE_DROP: "Free drop",
  WEIGHT_BASED: "Weight-based discount",
  EXPRESS: "Express delivery discount",
  SAME_CITY: "Same-city parcel",
  INTERCITY: "Intercity parcel",
  BUSINESS: "Business parcel",
  BULK: "Bulk / corporate parcel",
};

const RIDE_TYPES: RideParcelPromoType[] = [
  "FLAT_OFF",
  "PERCENT_OFF",
  "FREE_FIRST_N",
  "FREE_UP_TO_KM",
  "FLAT_FARE_UP_TO_KM",
  "PAY_FIXED",
  "FARE_CAP",
  "DISTANCE_TIERED",
  "PEAK_HOUR",
  "ROUTE_ZONE",
  "PAYMENT_MODE",
  "NEW_USER_N",
  "LOYALTY_MILESTONE",
  "REFERRAL",
  "SUBSCRIPTION",
  "COUPON",
];

const PARCEL_TYPES: RideParcelPromoType[] = [
  "FLAT_OFF",
  "PERCENT_OFF",
  "FREE_FIRST_N",
  "FREE_UP_TO_KM",
  "FLAT_FARE_UP_TO_KM",
  "PAY_FIXED",
  "FARE_CAP",
  "NEW_USER_N",
  "FREE_PICKUP",
  "FREE_DROP",
  "WEIGHT_BASED",
  "EXPRESS",
  "SAME_CITY",
  "INTERCITY",
  "BUSINESS",
  "BULK",
  "COUPON",
  "PEAK_HOUR",
  "PAYMENT_MODE",
  "LOYALTY_MILESTONE",
  "REFERRAL",
  "SUBSCRIPTION",
];

function numStr(v: number | null | undefined): string {
  return v == null ? "" : String(v);
}

function parseNum(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

type Props = {
  service: "RIDE" | "PARCEL";
  promo: RideParcelPromoConfig;
  onChange: (next: RideParcelPromoConfig) => void;
  discountType: string;
  valueNumeric: string;
  onDiscountTypeChange: (v: string) => void;
  onValueNumericChange: (v: string) => void;
  maxDiscountAmount: string;
  onMaxDiscountChange: (v: string) => void;
  couponCode: string;
  startsAt: string;
  endsAt: string;
};

export function RideParcelPromoBuilder({
  service,
  promo,
  onChange,
  discountType,
  valueNumeric,
  onDiscountTypeChange,
  onValueNumericChange,
  maxDiscountAmount,
  onMaxDiscountChange,
  couponCode,
  startsAt,
  endsAt,
}: Props) {
  const types = service === "PARCEL" ? PARCEL_TYPES : RIDE_TYPES;
  const unit = service === "RIDE" ? "ride" : "parcel";
  const patch = (partial: Partial<RideParcelPromoConfig>) => onChange({ ...promo, ...partial });

  const t = promo.promo_type;
  const showFlatPct = t === "FLAT_OFF" || t === "PERCENT_OFF" || t === "COUPON" || t === "PEAK_HOUR" ||
    t === "ROUTE_ZONE" || t === "PAYMENT_MODE" || t === "NEW_USER_N" || t === "LOYALTY_MILESTONE" ||
    t === "REFERRAL" || t === "SUBSCRIPTION" || t === "WEIGHT_BASED" || t === "EXPRESS" ||
    t === "SAME_CITY" || t === "INTERCITY" || t === "BUSINESS" || t === "BULK";
  const showFirstN =
    t === "FREE_FIRST_N" || t === "FREE_UP_TO_KM" || t === "NEW_USER_N" || t === "FLAT_OFF" || t === "PERCENT_OFF";
  const showMaxKm = t === "FREE_FIRST_N" || t === "FREE_UP_TO_KM" || t === "FLAT_FARE_UP_TO_KM";
  const showFlatFare = t === "FLAT_FARE_UP_TO_KM";
  const showPayFixed = t === "PAY_FIXED";
  const showFareCap = t === "FARE_CAP";
  const showTiers = t === "DISTANCE_TIERED";
  const showPeak = t === "PEAK_HOUR" || (promo.peak_slots?.length ?? 0) > 0;
  const showVehicles = service === "RIDE";
  const showPayment = t === "PAYMENT_MODE" || true;
  const showParcelRules = service === "PARCEL";
  const showLoyalty = t === "LOYALTY_MILESTONE";

  const preview = rideParcelPromoPreviewTitle(
    promo,
    service,
    discountType,
    parseNum(valueNumeric)
  );
  const vehiclesLabel =
    promo.vehicle_types && promo.vehicle_types.length > 0
      ? promo.vehicle_types.join(", ")
      : "All vehicles";
  const dateRange =
    startsAt || endsAt
      ? `${startsAt ? startsAt.slice(0, 10) : "…"} – ${endsAt ? endsAt.slice(0, 10) : "…"}`
      : "No schedule limit";

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-slate-50 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Live preview</p>
        <p className="mt-1 text-lg font-semibold text-slate-900">
          {service === "RIDE" ? "🚕 " : "📦 "}
          {preview}
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
          {couponCode ? (
            <span className="rounded-md bg-white px-2 py-1 font-mono ring-1 ring-slate-200">
              {couponCode}
            </span>
          ) : null}
          <span className="rounded-md bg-white px-2 py-1 ring-1 ring-slate-200">{vehiclesLabel}</span>
          <span className="rounded-md bg-white px-2 py-1 ring-1 ring-slate-200">{dateRange}</span>
          <span className="rounded-md bg-white px-2 py-1 ring-1 ring-slate-200">
            {promo.auto_apply !== false ? "Auto apply" : "Manual coupon"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className="text-[13px] font-medium text-slate-700">Offer type</label>
          <select
            className={controlCls}
            value={promo.promo_type}
            onChange={(e) => {
              const next = e.target.value as RideParcelPromoType;
              if (!RIDE_PARCEL_PROMO_TYPES.includes(next)) return;
              const base = emptyRideParcelPromoConfig(service);
              onChange({
                ...base,
                ...promo,
                promo_type: next,
              });
              if (next === "PERCENT_OFF") onDiscountTypeChange("PERCENTAGE");
              if (next === "FLAT_OFF") onDiscountTypeChange("FIXED");
            }}
          >
            {types.map((pt) => (
              <option key={pt} value={pt}>
                {RIDE_PROMO_LABELS[pt] ?? pt}
              </option>
            ))}
          </select>
        </div>

        {showFlatPct ? (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-slate-700">Discount type</label>
              <select
                className={controlCls}
                value={discountType}
                onChange={(e) => onDiscountTypeChange(e.target.value)}
              >
                <option value="FIXED">Flat ₹ OFF</option>
                <option value="PERCENTAGE">Percentage % OFF</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-slate-700">
                {discountType === "PERCENTAGE" ? "Percent value" : "₹ amount"}
              </label>
              <input
                className={controlCls}
                value={valueNumeric}
                onChange={(e) => onValueNumericChange(e.target.value)}
                placeholder={discountType === "PERCENTAGE" ? "20" : "50"}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-slate-700">Max discount (₹)</label>
              <input
                className={controlCls}
                value={maxDiscountAmount}
                onChange={(e) => onMaxDiscountChange(e.target.value)}
                placeholder="Optional cap"
              />
            </div>
          </>
        ) : null}

        {showFirstN ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-slate-700">
              First N completed {unit}s (1–10)
            </label>
            <input
              className={controlCls}
              type="number"
              min={1}
              max={10}
              value={numStr(promo.first_n_completed)}
              onChange={(e) => patch({ first_n_completed: parseNum(e.target.value) })}
              placeholder="e.g. 3"
            />
          </div>
        ) : null}

        {t === "FREE_FIRST_N" ? (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-slate-700">Max free count</label>
              <input
                className={controlCls}
                type="number"
                min={1}
                max={10}
                value={numStr(promo.max_free_count)}
                onChange={(e) => patch({ max_free_count: parseNum(e.target.value) })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-slate-700">Max fare covered (₹)</label>
              <input
                className={controlCls}
                value={numStr(promo.max_fare_covered)}
                onChange={(e) => patch({ max_fare_covered: parseNum(e.target.value) })}
              />
            </div>
          </>
        ) : null}

        {showMaxKm ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-slate-700">Max km covered</label>
            <input
              className={controlCls}
              value={numStr(promo.max_km)}
              onChange={(e) => patch({ max_km: parseNum(e.target.value) })}
              placeholder="e.g. 5"
            />
          </div>
        ) : null}

        {showFlatFare ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-slate-700">Flat fare (₹)</label>
            <input
              className={controlCls}
              value={numStr(promo.flat_fare)}
              onChange={(e) => patch({ flat_fare: parseNum(e.target.value) })}
              placeholder="e.g. 19"
            />
          </div>
        ) : null}

        {showPayFixed ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-slate-700">Customer pays only (₹)</label>
            <input
              className={controlCls}
              value={numStr(promo.pay_fixed)}
              onChange={(e) => patch({ pay_fixed: parseNum(e.target.value) })}
              placeholder="e.g. 49"
            />
          </div>
        ) : null}

        {showFareCap ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-slate-700">Max fare / cap (₹)</label>
            <input
              className={controlCls}
              value={numStr(promo.fare_cap)}
              onChange={(e) => patch({ fare_cap: parseNum(e.target.value) })}
              placeholder="e.g. 199"
            />
          </div>
        ) : null}

        {showLoyalty ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-slate-700">
              Complete N {unit}s to unlock
            </label>
            <input
              className={controlCls}
              type="number"
              min={1}
              value={numStr(promo.loyalty_complete_count)}
              onChange={(e) => patch({ loyalty_complete_count: parseNum(e.target.value) })}
            />
          </div>
        ) : null}

        {showTiers ? (
          <div className="sm:col-span-2 space-y-2">
            <label className="text-[13px] font-medium text-slate-700">Distance tiers</label>
            {(promo.distance_tiers ?? []).map((tier, idx) => (
              <div key={idx} className="flex gap-2">
                <input
                  className={controlCls}
                  placeholder="Up to km"
                  value={numStr(tier.up_to_km)}
                  onChange={(e) => {
                    const tiers = [...(promo.distance_tiers ?? [])];
                    tiers[idx] = { ...tiers[idx]!, up_to_km: parseNum(e.target.value) };
                    patch({ distance_tiers: tiers });
                  }}
                />
                <input
                  className={controlCls}
                  placeholder="% OFF"
                  value={String(tier.discount_pct ?? "")}
                  onChange={(e) => {
                    const tiers = [...(promo.distance_tiers ?? [])];
                    tiers[idx] = {
                      ...tiers[idx]!,
                      discount_pct: Number(e.target.value) || 0,
                    };
                    patch({ distance_tiers: tiers });
                  }}
                />
                <button
                  type="button"
                  className="rounded-lg border px-3 text-sm text-slate-600"
                  onClick={() =>
                    patch({
                      distance_tiers: (promo.distance_tiers ?? []).filter((_, i) => i !== idx),
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-sm font-medium text-indigo-600"
              onClick={() =>
                patch({
                  distance_tiers: [
                    ...(promo.distance_tiers ?? []),
                    { up_to_km: 5, discount_pct: 50 },
                  ],
                })
              }
            >
              + Add tier
            </button>
          </div>
        ) : null}

        {showPeak ? (
          <div className="sm:col-span-2 flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-slate-700">Peak slots</label>
            <div className="flex flex-wrap gap-2">
              {PEAK_SLOT_OPTIONS.map((slot) => {
                const on = (promo.peak_slots ?? []).includes(slot);
                return (
                  <label
                    key={slot}
                    className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs ring-1 ${
                      on ? "bg-indigo-50 text-indigo-800 ring-indigo-200" : "bg-white text-slate-600 ring-slate-200"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      onChange={() => {
                        const cur = new Set(promo.peak_slots ?? []);
                        if (on) cur.delete(slot);
                        else cur.add(slot);
                        patch({ peak_slots: [...cur] });
                      }}
                    />
                    {slot.replace(/_/g, " ")}
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        {showVehicles ? (
          <div className="sm:col-span-2 flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-slate-700">
              Vehicle types (empty = all)
            </label>
            <div className="flex flex-wrap gap-2">
              {RIDE_VEHICLE_OPTIONS.map((v) => {
                const on = (promo.vehicle_types ?? []).includes(v);
                return (
                  <label
                    key={v}
                    className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs ring-1 ${
                      on ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-white text-slate-600 ring-slate-200"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      onChange={() => {
                        const cur = new Set(promo.vehicle_types ?? []);
                        if (on) cur.delete(v);
                        else cur.add(v);
                        patch({ vehicle_types: [...cur] });
                      }}
                    />
                    {v}
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        {showPayment ? (
          <div className="sm:col-span-2 flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-slate-700">
              Payment modes (empty = all) — prepaid & postpaid
            </label>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_MODE_OPTIONS.map((m) => {
                const on = (promo.payment_modes ?? []).includes(m);
                return (
                  <label
                    key={m}
                    className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs ring-1 ${
                      on ? "bg-sky-50 text-sky-800 ring-sky-200" : "bg-white text-slate-600 ring-slate-200"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      onChange={() => {
                        const cur = new Set(promo.payment_modes ?? []);
                        if (on) cur.delete(m);
                        else cur.add(m);
                        patch({ payment_modes: [...cur] });
                      }}
                    />
                    {m}
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        {showParcelRules ? (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-slate-700">Min weight (kg)</label>
              <input
                className={controlCls}
                value={numStr(promo.min_weight_kg)}
                onChange={(e) => patch({ min_weight_kg: parseNum(e.target.value) })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-slate-700">Max weight (kg)</label>
              <input
                className={controlCls}
                value={numStr(promo.max_weight_kg)}
                onChange={(e) => patch({ max_weight_kg: parseNum(e.target.value) })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-slate-700">Speed</label>
              <select
                className={controlCls}
                value={promo.parcel_speed ?? "any"}
                onChange={(e) =>
                  patch({
                    parcel_speed: e.target.value as RideParcelPromoConfig["parcel_speed"],
                  })
                }
              >
                <option value="any">Any</option>
                <option value="normal">Normal</option>
                <option value="express">Express</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-slate-700">Scope</label>
              <select
                className={controlCls}
                value={promo.parcel_scope ?? "any"}
                onChange={(e) =>
                  patch({
                    parcel_scope: e.target.value as RideParcelPromoConfig["parcel_scope"],
                  })
                }
              >
                <option value="any">Any</option>
                <option value="same_city">Same city</option>
                <option value="intercity">Intercity</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-slate-700">Audience</label>
              <select
                className={controlCls}
                value={promo.parcel_audience ?? "any"}
                onChange={(e) =>
                  patch({
                    parcel_audience: e.target.value as RideParcelPromoConfig["parcel_audience"],
                  })
                }
              >
                <option value="any">Any</option>
                <option value="personal">Personal</option>
                <option value="business">Business</option>
              </select>
            </div>
          </>
        ) : null}

        <label className="sm:col-span-2 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-indigo-600"
            checked={promo.auto_apply !== false}
            onChange={(e) => patch({ auto_apply: e.target.checked })}
          />
          Auto-apply when eligible (uncheck = customer must enter coupon)
        </label>
      </div>
    </div>
  );
}
