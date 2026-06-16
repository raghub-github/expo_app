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
        if (!cancelled) setWeather(data?.showBanner ? data : null);
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

  return (
    <div
      className={`mx-3 sm:mx-5 lg:mx-8 mt-2 mb-1 rounded-xl border px-3 py-2.5 flex items-start gap-2.5 ${
        isSevere
          ? 'border-amber-300 bg-amber-50 text-amber-950'
          : 'border-sky-200 bg-sky-50 text-sky-950'
      }`}
      role="status"
    >
      <CloudRain className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-snug">{weather.bannerTitle}</p>
        {weather.bannerSubtitle ? (
          <p className="text-xs mt-0.5 opacity-90 leading-relaxed">{weather.bannerSubtitle}</p>
        ) : null}
        {weather.zoneName ? (
          <p className="text-[11px] mt-1 opacity-70">{weather.zoneName}</p>
        ) : null}
      </div>
    </div>
  );
}
