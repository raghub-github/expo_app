'use client';

import React from 'react';
import { Search } from 'lucide-react';

export type FoodOrdersEmptyVariant =
  | 'PREPARING'
  | 'READY_FOR_PICKUP'
  | 'OUT_FOR_DELIVERY'
  | 'RTO'
  | 'search';

const COPY: Record<
  Exclude<FoodOrdersEmptyVariant, 'search'>,
  { line1: string; line2: string }
> = {
  PREPARING: {
    line1: 'Orders you’re preparing on GatiMitra',
    line2: 'will show up here',
  },
  READY_FOR_PICKUP: {
    line1: 'Orders packed and ready for pickup',
    line2: 'will appear here',
  },
  OUT_FOR_DELIVERY: {
    line1: 'Orders out with GatiMitra delivery',
    line2: 'will appear here',
  },
  RTO: {
    line1: 'No return-to-origin orders right now',
    line2: 'RTO cases will list here when they occur',
  },
};

function IllustrationPreparing() {
  return (
    <svg viewBox="0 0 280 200" className="w-full max-w-[280px] h-auto text-slate-700" aria-hidden>
      <ellipse cx="140" cy="188" rx="100" ry="8" className="fill-slate-200/80" />
      {/* stove */}
      <rect x="88" y="120" width="104" height="56" rx="6" className="fill-slate-200 stroke-slate-300" strokeWidth="1.5" />
      <circle cx="108" cy="148" r="5" className="fill-slate-700" />
      <circle cx="140" cy="148" r="5" className="fill-slate-700" />
      <circle cx="172" cy="148" r="5" className="fill-slate-700" />
      <circle cx="108" cy="132" r="5" className="fill-slate-700" />
      <ellipse cx="140" cy="118" rx="22" ry="8" className="fill-slate-600" />
      <rect x="122" y="102" width="36" height="20" rx="4" className="fill-slate-500" />
      {/* chef */}
      <ellipse cx="178" cy="168" rx="28" ry="10" className="fill-slate-800/90" />
      <rect x="162" y="118" width="32" height="52" rx="4" className="fill-slate-600" />
      <rect x="158" y="100" width="40" height="24" rx="10" className="fill-white stroke-slate-300" strokeWidth="1.2" />
      <ellipse cx="178" cy="88" rx="20" ry="16" className="fill-amber-100 stroke-slate-300" strokeWidth="1" />
      <path d="M158 78 L198 78 L188 62 L168 62 Z" className="fill-white stroke-slate-300" strokeWidth="1.2" />
      <rect x="200" y="108" width="4" height="40" rx="1" className="fill-amber-800" transform="rotate(25 200 128)" />
      <ellipse cx="212" cy="100" rx="10" ry="6" className="fill-slate-500" transform="rotate(25 212 100)" />
    </svg>
  );
}

function IllustrationReady() {
  return (
    <svg viewBox="0 0 280 200" className="w-full max-w-[280px] h-auto" aria-hidden>
      <ellipse cx="140" cy="188" rx="100" ry="8" className="fill-slate-200/80" />
      {/* paper bag */}
      <path
        d="M95 52 L185 52 L195 168 L85 168 Z"
        className="fill-amber-100 stroke-amber-300/80"
        strokeWidth="2"
      />
      <path d="M100 52 Q140 28 180 52" className="fill-none stroke-amber-400" strokeWidth="2" />
      <rect x="118" y="88" width="44" height="52" rx="4" className="fill-orange-600" />
      <text
        x="140"
        y="108"
        textAnchor="middle"
        className="fill-white font-bold"
        style={{ fontSize: '11px', fontFamily: 'system-ui, sans-serif' }}
      >
        Gati
      </text>
      <text
        x="140"
        y="124"
        textAnchor="middle"
        className="fill-amber-100 font-bold"
        style={{ fontSize: '11px', fontFamily: 'system-ui, sans-serif' }}
      >
        Mitra
      </text>
      {/* burger */}
      <ellipse cx="125" cy="158" rx="34" ry="14" className="fill-amber-200 stroke-amber-400" strokeWidth="1.5" />
      <ellipse cx="125" cy="150" rx="30" ry="8" className="fill-amber-700/80" />
      <ellipse cx="125" cy="142" rx="32" ry="10" className="fill-amber-100 stroke-amber-300" strokeWidth="1" />
      <ellipse cx="125" cy="132" rx="30" ry="9" className="fill-amber-300" />
    </svg>
  );
}

function IllustrationPickedUp() {
  return (
    <svg viewBox="0 0 280 200" className="w-full max-w-[280px] h-auto" aria-hidden>
      <ellipse cx="140" cy="188" rx="100" ry="8" className="fill-slate-200/80" />
      {/* scooter body */}
      <ellipse cx="120" cy="158" rx="42" ry="14" className="fill-slate-300" />
      <circle cx="88" cy="168" r="14" className="fill-slate-700 stroke-slate-900" strokeWidth="2" />
      <circle cx="152" cy="168" r="14" className="fill-slate-700 stroke-slate-900" strokeWidth="2" />
      <path d="M95 140 L145 130 L155 155 L100 165 Z" className="fill-red-500" />
      <rect x="128" y="108" width="44" height="36" rx="4" className="fill-red-600" />
      <text
        x="150"
        y="128"
        textAnchor="middle"
        className="fill-white font-bold"
        style={{ fontSize: '9px', fontFamily: 'system-ui, sans-serif' }}
      >
        Gati
      </text>
      <text
        x="150"
        y="138"
        textAnchor="middle"
        className="fill-amber-100 font-bold"
        style={{ fontSize: '8px', fontFamily: 'system-ui, sans-serif' }}
      >
        Mitra
      </text>
      {/* rider */}
      <circle cx="175" cy="98" r="14" className="fill-amber-200" />
      <path d="M165 112 L185 112 L188 145 L162 145 Z" className="fill-red-500" />
      <ellipse cx="172" cy="88" rx="16" ry="6" className="fill-red-600" />
    </svg>
  );
}

function IllustrationRto() {
  return (
    <svg viewBox="0 0 200 160" className="w-full max-w-[200px] h-auto text-slate-500" aria-hidden>
      <path
        d="M40 120 L100 40 L160 120 Z"
        className="fill-none stroke-current"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M75 95 L125 95" className="stroke-current" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function FoodOrdersEmptyState({ variant }: { variant: FoodOrdersEmptyVariant }) {
  if (variant === 'search') {
    return (
      <div className="flex flex-col items-center justify-center py-12 sm:py-20 px-4 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-orange-50 text-orange-500">
          <Search className="h-10 w-10 opacity-80" strokeWidth={1.5} />
        </div>
        <p className="text-base sm:text-lg font-medium text-slate-700">No order matches that ID</p>
        <p className="mt-1 text-sm text-slate-500">Try another 4 digits from the order number</p>
      </div>
    );
  }

  const { line1, line2 } = COPY[variant];
  const ill =
    variant === 'PREPARING' ? (
      <IllustrationPreparing />
    ) : variant === 'READY_FOR_PICKUP' ? (
      <IllustrationReady />
    ) : variant === 'OUT_FOR_DELIVERY' ? (
      <IllustrationPickedUp />
    ) : (
      <IllustrationRto />
    );

  return (
    <div className="flex flex-col items-center justify-center py-10 sm:py-16 px-4 text-center min-h-[min(60vh,420px)]">
      <div className="mb-2 w-full max-w-[300px] flex justify-center">{ill}</div>
      <p className="text-base sm:text-lg font-medium text-slate-700 max-w-md">{line1}</p>
      <p className="mt-1 text-sm sm:text-base text-slate-500">{line2}</p>
    </div>
  );
}
