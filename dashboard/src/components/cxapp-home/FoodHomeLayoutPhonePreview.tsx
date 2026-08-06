"use client";

import { useEffect, useState } from "react";
import type { FoodHomeLayoutKey } from "@/lib/cxapp-home/food-home-layout";
import type {
  FoodHomePreviewMerchant,
  FoodHomePreviewPayload,
} from "@/lib/cxapp-home/food-home-preview-types";
import { resolveAttachmentProxyUrl } from "@/lib/attachments/resolve-attachment-proxy-url";
import { cn } from "@/lib/utils";

type Props = {
  stateId: string;
  layoutKey: FoodHomeLayoutKey;
  stateName?: string;
  subscriptionRowEnabled?: boolean;
  subscriptionRowText?: string;
  subscriptionRowBgColor?: string;
  under250Enabled?: boolean;
  under250FilterLabel?: string;
  under250TabImageUrl?: string | null;
};

function PhoneChrome({ children, skyTop }: { children: React.ReactNode; skyTop?: boolean }) {
  return (
    <div className="mx-auto w-full max-w-[248px] pb-1">
      <div className="rounded-[26px] border-[5px] border-slate-900 bg-slate-900 p-1 shadow-lg">
        <div className="overflow-hidden rounded-[20px] bg-[#F5F7FA]">
          <div
            className={cn(
              "flex items-center justify-between px-3 pb-1 pt-1.5",
              skyTop ? "bg-[#7DD3FC]" : "bg-white"
            )}
          >
            <span className="text-[9px] font-semibold text-slate-800">9:41</span>
            <div className="h-3.5 w-14 rounded-full bg-slate-900/90" />
            <div className="flex gap-0.5">
              <span className="h-1.5 w-1.5 rounded-sm bg-slate-700" />
              <span className="h-1.5 w-1.5 rounded-sm bg-slate-700" />
            </div>
          </div>
          <div className="max-h-[min(480px,calc(100dvh-14rem))] overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function Thumb({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  if (!src) {
    return <div className={cn("bg-slate-200", className)} />;
  }
  return <img src={src} alt={alt} className={cn("object-cover", className)} loading="lazy" />;
}

function merchantMetaLine(m: FoodHomePreviewMerchant): string | null {
  const parts: string[] = [];
  if (m.deliveryTime) parts.push(m.deliveryTime);
  if (m.distanceKm != null && Number.isFinite(m.distanceKm)) {
    parts.push(`${m.distanceKm.toFixed(1)} km`);
  }
  return parts.length > 0 ? parts.join(" | ") : null;
}

function RestaurantRow({ merchant }: { merchant: FoodHomePreviewMerchant }) {
  const meta = merchantMetaLine(merchant);
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200/80">
      <div className="relative h-[72px] bg-slate-200">
        <Thumb src={merchant.imageUrl} alt={merchant.name} className="h-full w-full" />
        {merchant.liveStatus === "OPEN" ? (
          <span className="absolute left-1.5 top-1.5 rounded bg-emerald-500 px-1.5 py-0.5 text-[6px] font-bold text-white">
            Open
          </span>
        ) : null}
        {merchant.cuisine ? (
          <span className="absolute bottom-1.5 left-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[6px] font-semibold text-white">
            {merchant.cuisine}
          </span>
        ) : null}
      </div>
      <div className="px-2 py-1.5">
        <p className="truncate text-[8px] font-bold text-slate-900">{merchant.name}</p>
        {meta ? <p className="mt-0.5 text-[7px] font-medium text-slate-500">{meta}</p> : null}
        {merchant.offerText ? (
          <p className="mt-0.5 truncate text-[7px] font-semibold text-rose-600">{merchant.offerText}</p>
        ) : null}
      </div>
    </div>
  );
}

function MerchantGridCard({ merchant }: { merchant: FoodHomePreviewMerchant }) {
  return (
    <div className="overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
      <div className="relative h-14 bg-slate-200">
        <Thumb src={merchant.imageUrl} alt={merchant.name} className="h-full w-full" />
        {merchant.offerText ? (
          <span className="absolute left-1 top-1 max-w-[90%] truncate rounded bg-rose-500 px-1 py-0.5 text-[6px] font-bold text-white">
            {merchant.offerText}
          </span>
        ) : null}
        {merchant.avgRating != null ? (
          <span className="absolute bottom-1 right-1 rounded bg-emerald-600 px-1 py-0.5 text-[6px] font-bold text-white">
            ★ {merchant.avgRating.toFixed(1)}
          </span>
        ) : null}
      </div>
      <div className="p-1.5">
        <p className="truncate text-[8px] font-bold text-slate-900">{merchant.name}</p>
        {merchantMetaLine(merchant) ? (
          <p className="truncate text-[7px] text-slate-500">{merchantMetaLine(merchant)}</p>
        ) : null}
      </div>
    </div>
  );
}

function PreviewHeader({
  areaLabel,
  sky,
  subscriptionName,
}: {
  areaLabel: string;
  sky?: boolean;
  subscriptionName?: string | null;
}) {
  return (
    <div className={cn("space-y-2 px-2.5 pb-2 pt-1", sky ? "bg-transparent" : "bg-white")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-0.5 truncate text-[9px] font-extrabold text-slate-900">
            Home <span className="text-[8px]">▾</span>
          </p>
          <p className="truncate text-[7px] font-medium text-slate-600">{areaLabel}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {subscriptionName ? (
            <span className="flex max-w-[52px] items-center gap-0.5 truncate rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[6px] font-extrabold text-amber-900">
              <span>👑</span>
              <span className="truncate">{subscriptionName}</span>
            </span>
          ) : null}
          <div className="flex h-7 items-center gap-1 rounded-full bg-white px-1.5 shadow-sm ring-1 ring-emerald-200">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[7px] text-white">
              👛
            </span>
            <span className="text-[7px] font-extrabold text-slate-800">₹0</span>
          </div>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[7px] font-bold text-emerald-600 ring-1 ring-white shadow-sm">
            GM
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex h-8 flex-1 items-center gap-1.5 rounded-xl bg-white px-2 shadow-sm ring-1 ring-black/5">
          <span className="text-[9px] text-emerald-500">🔍</span>
          <span className="truncate text-[7px] font-medium text-slate-400">
            Search &quot;comfort food&quot;
          </span>
          <span className="ml-auto text-[9px] text-emerald-500">🎤</span>
        </div>
        <div className="flex w-7 shrink-0 flex-col items-center gap-0.5">
          <span className="text-[6px] font-extrabold text-slate-700">VEG</span>
          <span className="h-3.5 w-7 rounded-full bg-slate-300 p-0.5">
            <span className="block h-2.5 w-2.5 rounded-full bg-white" />
          </span>
        </div>
      </div>
    </div>
  );
}

function CarnivalHeroPreview({ data }: { data: FoodHomePreviewPayload }) {
  const adminSlides = data.gridFirstHeroMedia ?? [];
  const slides = adminSlides.length > 0 ? adminSlides : data.offers.slice(0, 4);
  const first = slides[0];
  const merchantOffer = data.offers.find((o) => o.kind === "merchant" && o.cta?.trim());
  const cta = merchantOffer?.cta?.trim() || null;

  const previewUrl = (item: (typeof slides)[number]) => {
    if ("url" in item && item.url) {
      return resolveAttachmentProxyUrl(item.url) || item.url;
    }
    if ("imageUrl" in item) return item.imageUrl;
    return null;
  };

  const slideKind = (item: (typeof slides)[number]): "image" | "video" => {
    if ("kind" in item && item.kind === "video") return "video";
    return "image";
  };

  return (
    <div className="pt-0">
      {first ? (
        <>
          <div className="relative h-[104px] w-full overflow-hidden">
            {previewUrl(first) ? (
              slideKind(first) === "video" ? (
                <video
                  src={previewUrl(first)!}
                  className="absolute inset-0 h-full w-full object-cover"
                  muted
                  playsInline
                  loop
                  autoPlay
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl(first)!} alt="" className="absolute inset-0 h-full w-full object-cover" />
              )
            ) : (
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, #7DD3FC 0%, #BAE6FD 40%, #86EFAC 100%)",
                }}
              />
            )}
            {cta ? (
              <div className="absolute bottom-2 left-0 right-0 flex justify-center">
                <span className="flex items-center gap-0.5 rounded-full border border-neutral-800 bg-black px-2.5 py-1 text-[7px] font-extrabold text-white shadow">
                  {cta} ›
                </span>
              </div>
            ) : null}
          </div>
          {slides.length > 1 ? (
            <div className="mt-1.5 flex justify-center gap-1">
              {slides.map((s, i) => (
                <span
                  key={"id" in s ? s.id : `offer-${i}`}
                  className={cn("h-1 rounded-full", i === 0 ? "w-3 bg-emerald-500" : "w-1 bg-slate-300")}
                />
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div className="flex h-[104px] w-full items-center justify-center bg-sky-200 text-[8px] text-slate-500">
          No active offers
        </div>
      )}
    </div>
  );
}

function PromoCarousel({ data }: { data: FoodHomePreviewPayload }) {
  const slide = data.offers[0];
  return (
    <div className="px-2.5">
      {slide ? (
        <div className="relative h-[68px] overflow-hidden rounded-xl bg-slate-200">
          <Thumb src={slide.imageUrl} alt={slide.title} className="h-full w-full" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent p-2">
            <p className="max-w-[75%] text-[9px] font-bold text-white">{slide.title}</p>
            {slide.sub ? (
              <p className="mt-0.5 max-w-[75%] text-[7px] text-white/90">{slide.sub}</p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex h-[68px] items-center justify-center rounded-xl bg-slate-100 text-[8px] text-slate-500 ring-1 ring-slate-200">
          No active offers
        </div>
      )}
    </div>
  );
}

function GoldStrip({
  enabled,
  text,
  backgroundColor,
}: {
  enabled: boolean;
  text: string;
  backgroundColor: string;
}) {
  if (!enabled || !text.trim()) return null;
  return (
    <div
      className="mx-2.5 mt-2 overflow-hidden rounded-xl border border-amber-300/40 shadow-sm"
      style={{ backgroundColor }}
    >
      <div className="flex items-center gap-2 px-2.5 py-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-[9px]">
          🎗
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[7px] font-semibold leading-snug text-amber-950">
            {text.trim()}
            <span className="font-bold text-amber-900"> Know more ›</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function MealsUnderExplorePreview({
  maxPrice,
  imageUrl,
}: {
  maxPrice: number;
  imageUrl?: string | null;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center">
      <div className="flex h-[42px] w-[42px] flex-col overflow-hidden rounded-[10px] border border-amber-200/60 bg-[#FFF7ED] shadow-sm">
        {imageUrl ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-0.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" className="max-h-full max-w-full object-contain" />
          </div>
        ) : (
          <>
            <div className="bg-red-600 px-1 py-0.5 text-center text-[5px] font-black tracking-wide text-white">
              MEALS UNDER
            </div>
            <div className="flex flex-1 items-center justify-center text-[11px] font-black text-blue-700">
              ₹{maxPrice}
            </div>
          </>
        )}
        <div className="flex h-[10px] items-center justify-center bg-blue-600 text-[5px] font-extrabold text-white">
          Explore ›
        </div>
      </div>
      <div className="mt-0.5 h-0.5 w-6" />
    </div>
  );
}

function CategoryTabCell({
  label,
  imageUrl,
  active,
  fallback,
}: {
  label: string;
  imageUrl?: string | null;
  active?: boolean;
  fallback?: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center">
      {imageUrl ? (
        <Thumb src={imageUrl} alt={label} className="mb-1.5 h-8 w-8 rounded-full object-contain bg-white p-0.5" />
      ) : (
        <div className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-slate-50">
          <span className="text-[10px] text-slate-500">{fallback ?? "▦"}</span>
        </div>
      )}
      <span
        className={`max-w-full truncate px-0.5 text-center text-[7px] ${
          active ? "font-extrabold text-slate-900" : "font-semibold text-slate-600"
        }`}
      >
        {label}
      </span>
      {active ? (
        <div className="mt-0.5 h-0.5 w-6 rounded bg-rose-500" />
      ) : (
        <div className="mt-0.5 h-0.5 w-6" />
      )}
    </div>
  );
}

function CategoryTabs({
  data,
  under250Enabled = true,
  under250FilterLabel = "Meals under ₹250",
  under250TabImageUrl,
}: {
  data: FoodHomePreviewPayload;
  under250Enabled?: boolean;
  under250FilterLabel?: string;
  under250TabImageUrl?: string | null;
}) {
  const allTab = data.allTab ?? { label: "All", imageUrl: null };
  const showUnder = under250Enabled && under250FilterLabel.trim().length > 0;
  const tabImage =
    under250TabImageUrl ?? data.gridFirstUnder250TabImageUrl ?? null;
  const maxPrice = data.gridFirstUnder250MaxPrice ?? 250;
  const firstPageCats = data.categories.slice(0, showUnder ? 3 : 4);

  return (
    <div className="mt-2 overflow-hidden px-2.5 pb-1">
      <div className="flex gap-2">
        {showUnder ? (
          <MealsUnderExplorePreview maxPrice={maxPrice} imageUrl={tabImage} />
        ) : null}
        <CategoryTabCell
          label={allTab.label}
          imageUrl={allTab.imageUrl}
          active
          fallback="▦"
        />
        {firstPageCats.map((cat) => (
          <CategoryTabCell key={cat.id} label={cat.name} imageUrl={cat.imageUrl} />
        ))}
      </div>
    </div>
  );
}

function CategoryRail({ data }: { data: FoodHomePreviewPayload }) {
  const cats = data.categories.slice(0, 6);
  return (
    <div className="mt-2 flex gap-2 overflow-x-auto px-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {cats.map((cat) => (
        <div key={cat.id} className="flex shrink-0 flex-col items-center">
          <Thumb src={cat.imageUrl} alt={cat.name} className="h-8 w-8 rounded-full ring-1 ring-slate-200" />
          <span className="mt-1 max-w-[48px] truncate text-[7px] text-slate-600">{cat.name}</span>
        </div>
      ))}
    </div>
  );
}

function CategoryChips({ data }: { data: FoodHomePreviewPayload }) {
  const cats = data.categories.slice(0, 5);
  return (
    <div className="mt-2 flex gap-1 overflow-x-auto px-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <span className="shrink-0 rounded-full bg-emerald-500 px-2 py-0.5 text-[7px] font-semibold text-white">
        All
      </span>
      {cats.map((cat) => (
        <span
          key={cat.id}
          className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[7px] font-semibold ring-1 ring-slate-200"
        >
          {cat.name}
        </span>
      ))}
    </div>
  );
}

function FilterBar({
  data,
  layoutKey,
  under250Enabled,
  under250FilterLabel,
}: {
  data: FoodHomePreviewPayload;
  layoutKey: FoodHomeLayoutKey;
  under250Enabled?: boolean;
  under250FilterLabel?: string;
}) {
  if (layoutKey === "grid_first") {
    const chipLabel = under250FilterLabel ?? data.gridFirstUnder250FilterLabel;
    const showMealsChip = under250Enabled !== false && chipLabel?.trim();
    return (
      <div className="flex items-center justify-between gap-1 px-2.5 py-1.5">
        <div className="flex gap-1 overflow-hidden">
          <span className="shrink-0 rounded-lg bg-white px-2 py-1 text-[7px] font-semibold ring-1 ring-slate-200">
            Filters
          </span>
          <span className="shrink-0 rounded-lg bg-green-100 px-2 py-1 text-[7px] font-semibold text-green-800 ring-1 ring-green-200">
            ⚡ Near & Fast
          </span>
          <span className="shrink-0 rounded-lg bg-white px-2 py-1 text-[7px] font-semibold ring-1 ring-slate-200">
            No packaging charges
          </span>
          {showMealsChip ? (
            <span className="shrink-0 rounded-lg bg-rose-50 px-2 py-1 text-[7px] font-semibold text-rose-800 ring-1 ring-rose-200">
              {chipLabel}
            </span>
          ) : null}
        </div>
        <span className="shrink-0 text-[7px] font-semibold text-slate-500">{data.storeCountLabel}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-1 px-2.5 py-1.5">
      <div className="flex gap-1">
        <span className="rounded-lg bg-emerald-500 px-2 py-1 text-[7px] font-semibold text-white">Open Now</span>
        <span className="rounded-lg bg-white px-2 py-1 text-[7px] font-semibold ring-1 ring-slate-200">Sort</span>
        <span className="rounded-lg bg-white px-2 py-1 text-[7px] font-semibold ring-1 ring-slate-200">Filters</span>
      </div>
      <span className="text-[7px] font-semibold text-slate-500">{data.storeCountLabel}</span>
    </div>
  );
}

function LovedSection({
  data,
  layoutKey,
}: {
  data: FoodHomePreviewPayload;
  layoutKey: FoodHomeLayoutKey;
}) {
  const title = layoutKey === "grid_first" ? "RECOMMENDED WITH DEALS" : "LOVED BY CUSTOMERS";
  const merchants = data.lovedMerchants;
  if (merchants.length === 0) return null;

  if (layoutKey === "discovery") {
    return (
      <>
        <p className="px-2.5 text-[7px] font-bold tracking-wide text-slate-500">{title}</p>
        <div className="flex gap-1.5 overflow-x-auto px-2.5 py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {merchants.slice(0, 4).map((m) => (
            <div key={m.id} className="w-20 shrink-0">
              <MerchantGridCard merchant={m} />
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <p className="px-2.5 text-[7px] font-bold tracking-wide text-slate-500">{title}</p>
      <div
        className={cn(
          "gap-1.5 px-2.5 pb-1",
          layoutKey === "grid_first" ? "grid grid-cols-2" : "grid grid-cols-3"
        )}
      >
        {merchants.slice(0, layoutKey === "grid_first" ? 4 : 6).map((m) => (
          <MerchantGridCard key={m.id} merchant={m} />
        ))}
      </div>
    </>
  );
}

function RestaurantList({ data }: { data: FoodHomePreviewPayload }) {
  return (
    <div className="space-y-1.5 px-2.5 pb-4 pt-1">
      <p className="text-[7px] font-bold tracking-wide text-slate-500">RESTAURANTS NEAR YOU</p>
      {data.restaurants.length === 0 ? (
        <p className="text-[8px] leading-snug text-slate-500">
          {data.hasLocationSample
            ? "No restaurants in range of the sample location for this state."
            : "No ACTIVE food stores with coordinates in this state yet."}
        </p>
      ) : (
        data.restaurants.map((m) => <RestaurantRow key={m.id} merchant={m} />)
      )}
    </div>
  );
}

function PreviewBody({
  data,
  layoutKey,
  subscriptionRowEnabled,
  subscriptionRowText,
  subscriptionRowBgColor,
  under250Enabled,
  under250FilterLabel,
  under250TabImageUrl,
}: {
  data: FoodHomePreviewPayload;
  layoutKey: FoodHomeLayoutKey;
  subscriptionRowEnabled: boolean;
  subscriptionRowText: string;
  subscriptionRowBgColor: string;
  under250Enabled: boolean;
  under250FilterLabel: string;
  under250TabImageUrl?: string | null;
}) {
  if (layoutKey === "grid_first") {
    return (
      <>
        <div
          className="pb-1"
          style={{
            background: "linear-gradient(180deg, #7DD3FC 0%, #BAE6FD 45%, #E0F2FE 85%, #F0F9FF 100%)",
          }}
        >
          <PreviewHeader
            areaLabel={data.areaLabel}
            sky
            subscriptionName={data.subscriptionPlanName}
          />
          <CarnivalHeroPreview data={data} />
        </div>
        <GoldStrip
          enabled={subscriptionRowEnabled}
          text={subscriptionRowText}
          backgroundColor={subscriptionRowBgColor}
        />
        <CategoryTabs
          data={data}
          under250Enabled={under250Enabled}
          under250FilterLabel={under250FilterLabel}
          under250TabImageUrl={under250TabImageUrl}
        />
        <FilterBar
          data={data}
          layoutKey={layoutKey}
          under250Enabled={under250Enabled}
          under250FilterLabel={under250FilterLabel}
        />
        <LovedSection data={data} layoutKey={layoutKey} />
        <RestaurantList data={data} />
      </>
    );
  }

  return (
    <>
      <PreviewHeader areaLabel={data.areaLabel} />
      {layoutKey === "discovery" ? (
        <>
          <PromoCarousel data={data} />
          <CategoryChips data={data} />
        </>
      ) : (
        <>
          <PromoCarousel data={data} />
          <CategoryRail data={data} />
        </>
      )}
      <FilterBar data={data} layoutKey={layoutKey} />
      <LovedSection data={data} layoutKey={layoutKey} />
      <RestaurantList data={data} />
    </>
  );
}

export function FoodHomeLayoutPhonePreview({
  stateId,
  layoutKey,
  stateName,
  subscriptionRowEnabled: subscriptionRowEnabledProp,
  subscriptionRowText: subscriptionRowTextProp,
  subscriptionRowBgColor: subscriptionRowBgColorProp,
  under250Enabled: under250EnabledProp,
  under250FilterLabel: under250FilterLabelProp,
  under250TabImageUrl: under250TabImageUrlProp,
}: Props) {
  const cacheKey = stateId ? `cxapp-food-preview-v1:${stateId}` : "";
  const [data, setData] = useState<FoodHomePreviewPayload | null>(() => {
    if (typeof window === "undefined" || !cacheKey) return null;
    try {
      const raw = sessionStorage.getItem(cacheKey);
      return raw ? (JSON.parse(raw) as FoodHomePreviewPayload) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(() => !data);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stateId) return;
    let cancelled = false;
    const hadCache = !!data;
    // Keep cached preview visible; only show blocking spinner on cold load.
    if (!hadCache) setLoading(true);
    setError(null);

    const run = () => {
      void (async () => {
        try {
          const res = await fetch(`/api/super-admin/cxapp-home/food-preview/${stateId}`, {
            // Honor route Cache-Control instead of always bypassing.
            cache: "default",
          });
          const json = (await res.json()) as FoodHomePreviewPayload & { error?: string };
          if (!res.ok) throw new Error(json.error ?? "Failed to load preview");
          if (cancelled) return;
          setData(json);
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify(json));
          } catch {
            /* ignore quota */
          }
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : "Failed to load preview");
            if (!hadCache) setData(null);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    };

    // Defer heavy preview fetch so layout chrome paints first.
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(run, { timeout: 400 });
    } else {
      timeoutId = setTimeout(run, 0);
    }

    return () => {
      cancelled = true;
      if (idleId != null && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId != null) clearTimeout(timeoutId);
    };
    // Intentionally only re-fetch when state changes; cached `data` seeds first paint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateId, cacheKey]);

  const label = stateName ?? data?.stateName ?? "State / UT";
  const subscriptionRowEnabled = subscriptionRowEnabledProp === true;
  const subscriptionRowText =
    subscriptionRowTextProp ?? data?.gridFirstSubscriptionRowText ?? "";
  const subscriptionRowBgColor =
    subscriptionRowBgColorProp ??
    data?.gridFirstSubscriptionRowBgColor ??
    "#FFF4E8";
  const under250Enabled = under250EnabledProp ?? data?.gridFirstUnder250Enabled ?? true;
  const under250FilterLabel =
    under250FilterLabelProp ?? data?.gridFirstUnder250FilterLabel ?? "Meals under ₹250";
  const under250TabImageUrl =
    under250TabImageUrlProp ?? data?.gridFirstUnder250TabImageUrl ?? null;

  return (
    <div className="mb-2 rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-3">
      <div className="mb-2 text-center">
        <p className="text-sm font-semibold text-slate-900">Live app preview</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {label} — same APIs as customer food home
          {loading && data ? " · updating…" : ""}
        </p>
      </div>

      {error && !data ? (
        <p className="py-8 text-center text-xs text-red-600">{error}</p>
      ) : data ? (
        <PhoneChrome skyTop={layoutKey === "grid_first"}>
          <PreviewBody
            data={data}
            layoutKey={layoutKey}
            subscriptionRowEnabled={subscriptionRowEnabled}
            subscriptionRowText={subscriptionRowText}
            subscriptionRowBgColor={subscriptionRowBgColor}
            under250Enabled={under250Enabled}
            under250FilterLabel={under250FilterLabel}
            under250TabImageUrl={under250TabImageUrl}
          />
        </PhoneChrome>
      ) : loading ? (
        <PhoneChrome skyTop={layoutKey === "grid_first"}>
          <div className="space-y-2 px-2.5 py-3">
            <div className="h-8 animate-pulse rounded-lg bg-slate-200/80" />
            <div className="h-24 animate-pulse rounded-xl bg-slate-200/70" />
            <div className="flex gap-1.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 w-10 animate-pulse rounded-full bg-slate-200/70" />
              ))}
            </div>
            <div className="h-16 animate-pulse rounded-xl bg-slate-200/60" />
            <div className="h-16 animate-pulse rounded-xl bg-slate-200/60" />
          </div>
        </PhoneChrome>
      ) : null}

      {data ? (
        <p className="mt-2 text-center text-[10px] leading-snug text-slate-500">
          Sample: {data.areaLabel} · {data.storeCountLabel}
        </p>
      ) : null}
    </div>
  );
}
