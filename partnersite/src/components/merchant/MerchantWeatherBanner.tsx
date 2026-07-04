'use client';

import React, { useEffect, useState } from 'react';
import { CloudRain } from 'lucide-react';

type MerchantWeather = {
  severity: string;
  chipLabel: string | null;
  bannerTitle: string | null;
  bannerSubtitle: string | null;
  showBanner: boolean;
  zoneName: string | null;
};

export function MerchantWeatherBanner({ storeId }: { storeId: string | null | undefined }) {
  const [weather, setWeather] = useState<MerchantWeather | null>(null);

  useEffect(() => {
    if (!storeId) {
      setWeather(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/merchant/weather?storeId=${encodeURIComponent(storeId)}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as MerchantWeather;
        if (!cancelled) {
          const active =
            data?.showBanner &&
            data?.bannerTitle &&
            data.severity !== "CLEAR" &&
            data.severity !== "LIGHT_RAIN";
          setWeather(active ? data : null);
        }
      } catch {
        /* never block merchant UI on weather failures */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  if (!weather?.showBanner || !weather.bannerTitle) return null;

  const isSevere = weather.severity === 'EXTREME_WEATHER' || weather.severity === 'HEAVY_RAIN';

  const marqueeParts = [
    weather.bannerTitle,
    weather.bannerSubtitle,
    weather.zoneName,
  ].filter(Boolean);
  const marqueeText = marqueeParts.join(' — ');

  return (
    <div
      className={`mx-3 sm:mx-5 lg:mx-8 mt-2 mb-1 rounded-lg border px-2.5 py-1 flex items-center gap-2 overflow-hidden ${
        isSevere
          ? 'border-amber-300 bg-amber-50 text-amber-950'
          : 'border-sky-200 bg-sky-50 text-sky-950'
      }`}
      role="status"
      aria-live="polite"
    >
      <CloudRain className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex w-max animate-store-closed-marquee">
          {[0, 1].map((copy) => (
            <span
              key={copy}
              className="shrink-0 px-4 text-xs font-medium whitespace-nowrap"
              aria-hidden={copy === 1}
            >
              <span className="font-semibold">{weather.bannerTitle}</span>
              {weather.bannerSubtitle ? (
                <span className="font-normal opacity-90"> — {weather.bannerSubtitle}</span>
              ) : null}
              {weather.zoneName ? (
                <span className="font-normal opacity-70"> — {weather.zoneName}</span>
              ) : null}
            </span>
          ))}
        </div>
      </div>
      <span className="sr-only">{marqueeText}</span>
    </div>
  );
}
