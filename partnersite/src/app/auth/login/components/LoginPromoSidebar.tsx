'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, Banknote, Bell, ChevronDown, Landmark, ScrollText, ShoppingBag, Store, UtensilsCrossed, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { GM, GatiMitraWord, GM_POPPINS } from './gatimitra-brand';
import { ONBOARDING_DOCUMENTS } from '@/lib/onboarding-documents';
import { ONBOARDING_FAQ_ITEMS } from '@/lib/onboarding-faq';

export type AuthSidebarVariant = 'login' | 'signup';
export type SignupSidebarPanel = 'benefits' | 'documents' | 'faq';

type LoginSlidePill = {
  label: string;
  icon: LucideIcon;
  toneClass: string;
  positionClass: string;
};

/** Bump when replacing files under public/auth/ so browsers pick up the new asset. */
const AUTH_SIDEBAR_ASSET_VERSION = '20260808-v3';

function sidebarPreviewAsset(filename: string) {
  return `/auth/${filename}?v=${AUTH_SIDEBAR_ASSET_VERSION}`;
}

const LOGIN_SLIDES: Array<{
  eyebrow: string;
  headline: [string, string];
  accentLine: 1 | 2;
  body: string;
  previewSrc: string;
  previewAlt: string;
  pills: LoginSlidePill[];
}> = [
  {
    eyebrow: 'Partner Dashboard',
    headline: ['Welcome back,', 'Partner'],
    accentLine: 2,
    body: 'Sign in to manage live orders, update your menu, track store performance, and keep everything running smoothly — all from one powerful dashboard built for busy merchants.',
    previewSrc: sidebarPreviewAsset('login-sidebar-dashboard.png'),
    previewAlt: 'GatiMitra partner dashboard preview',
    pills: [
      {
        label: 'Live Orders',
        icon: ShoppingBag,
        toneClass: 'bg-white text-slate-800',
        positionClass: 'left-0 top-[14%]',
      },
      {
        label: 'Store Status',
        icon: Store,
        toneClass: 'bg-[#E5F5F0] text-[#006B4F]',
        positionClass: 'right-0 top-[18%]',
      },
      {
        label: 'Menu Updates',
        icon: UtensilsCrossed,
        toneClass: 'bg-[#FCEFD8] text-[#9A5B00]',
        positionClass: 'left-3 top-[42%]',
      },
      {
        label: 'Instant Alerts',
        icon: Bell,
        toneClass: 'bg-white/95 text-[#006B4F]',
        positionClass: 'right-1 bottom-[4%]',
      },
    ],
  },
  {
    eyebrow: 'Payments & Ledger',
    headline: ['Clear earnings', '& fast settlements'],
    accentLine: 2,
    body: 'Track wallet balance, request payouts, manage bank accounts, and review every settlement in your ledger — everything you need for transparent, fast payments in one hub.',
    previewSrc: sidebarPreviewAsset('login-sidebar-payments.png'),
    previewAlt: 'GatiMitra payments and ledger preview',
    pills: [
      {
        label: 'Wallet & Earnings',
        icon: Wallet,
        toneClass: 'bg-white text-slate-800',
        positionClass: 'left-0 top-[14%]',
      },
      {
        label: 'Fast Payouts',
        icon: Banknote,
        toneClass: 'bg-[#FCEFD8] text-[#9A5B00]',
        positionClass: 'right-0 top-[20%]',
      },
      {
        label: 'Bank Accounts',
        icon: Landmark,
        toneClass: 'bg-[#E5F5F0] text-[#006B4F]',
        positionClass: 'left-2 top-[44%]',
      },
      {
        label: 'Payout Ledger',
        icon: ScrollText,
        toneClass: 'bg-white/95 text-[#006B4F]',
        positionClass: 'right-1 bottom-[4%]',
      },
    ],
  },
];

const SIGNUP_HIGHLIGHTS = [
  {
    stat: '1000+',
    title: 'Growing merchant network',
    body: 'Restaurants, pharmacies, grocery & more trust GatiMitra for online orders and delivery.',
  },
  {
    stat: '24/7',
    title: 'Live order management',
    body: 'Get instant alerts, accept orders from app or web, and run your store without missing a beat.',
  },
  {
    stat: 'Fast',
    title: 'Transparent payouts',
    body: 'Track earnings, settlements, and wallet credits in real time with a clear payout breakdown.',
  },
] as const;

const SLIDE_INTERVAL_MS = 6000;

/** Fixed heights so carousel swaps never shift layout. */
const LOGIN_COPY_MIN_H = 'min-h-[168px]';
const LOGIN_PREVIEW_H = 'h-[172px]';
const LOGIN_VISUAL_BLOCK_H = 'h-[172px]';
const LOGIN_PILLS_MIN_H = 'min-h-[96px]';

function SidebarWave() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-40 overflow-hidden" aria-hidden>
      <svg
        className="absolute -top-2 left-0 h-full w-full"
        viewBox="0 0 400 200"
        preserveAspectRatio="none"
        fill="none"
      >
        <path
          d="M-20 80 C 80 20, 180 140, 280 70 S 420 30, 480 90"
          stroke={GM.wave}
          strokeWidth="1.5"
          opacity="0.55"
        />
        <path
          d="M-40 110 C 60 50, 160 170, 260 100 S 400 60, 500 120"
          stroke={GM.wave}
          strokeWidth="1"
          opacity="0.4"
        />
        <path
          d="M0 140 C 100 80, 200 200, 300 130 S 440 90, 520 150"
          stroke={GM.wave}
          strokeWidth="0.75"
          opacity="0.28"
        />
      </svg>
    </div>
  );
}

const sidebarCtaClass =
  'inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm font-semibold text-white';

function FloatingPill({ label, icon: Icon, toneClass, positionClass }: LoginSlidePill) {
  return (
    <span
      className={`absolute z-10 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold shadow-md xl:text-[11px] ${positionClass} ${toneClass}`}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {label}
    </span>
  );
}

function LoginSlideHeading({
  eyebrow,
  headline,
  accentLine,
  body,
}: Pick<(typeof LOGIN_SLIDES)[number], 'eyebrow' | 'headline' | 'accentLine' | 'body'>) {
  const [line1, line2] = headline;

  return (
    <header className="space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55 xl:text-[11px]">
        {eyebrow}
      </p>

      <h2 className="text-[1.35rem] font-bold leading-[1.12] tracking-tight text-white xl:text-[1.45rem]">
        <span className="block">{accentLine === 1 ? <AccentLine text={line1} /> : line1}</span>
        <span className="mt-0.5 block">
          {accentLine === 2 ? <AccentLine text={line2} /> : line2}
        </span>
      </h2>

      <p
        className="min-h-[5.25rem] text-[13px] leading-[1.65] xl:text-sm"
        style={{ color: GM.secondary }}
      >
        {body}
      </p>
    </header>
  );
}

function AccentLine({ text }: { text: string }) {
  return <span style={{ color: GM.mitra }}>{text}</span>;
}

function LoginMiddlePills({ activeIndex }: { activeIndex: number }) {
  return (
    <div className={`relative ${LOGIN_PILLS_MIN_H} flex-1 shrink basis-0`}>
      {LOGIN_SLIDES.map((slide, index) => (
        <div
          key={slide.previewSrc}
          className={`absolute inset-0 transition-opacity duration-500 ${
            index === activeIndex ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          aria-hidden={index !== activeIndex}
        >
          {slide.pills.map((pill) => (
            <FloatingPill key={pill.label} {...pill} />
          ))}
        </div>
      ))}
    </div>
  );
}

function LoginPreviewFrame({ activeIndex }: { activeIndex: number }) {
  return (
    <div className={`relative shrink-0 ${LOGIN_VISUAL_BLOCK_H} w-full`}>
      {LOGIN_SLIDES.map((slide, index) => (
        <div
          key={slide.previewSrc}
          className={`absolute inset-0 transition-opacity duration-500 ${
            index === activeIndex ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          aria-hidden={index !== activeIndex}
        >
          <div
            className={`absolute bottom-0 left-0 right-0 -mr-7 ${LOGIN_PREVIEW_H} overflow-hidden rounded-tl-2xl border border-white/20 border-b-0 border-r-0 bg-white shadow-[0_12px_36px_rgba(0,0,0,0.32)]`}
          >
            <Image
              src={slide.previewSrc}
              alt={slide.previewAlt}
              fill
              unoptimized
              className="object-cover object-left-top"
              sizes="340px"
              priority={index === 0}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function SignupDocumentsPanel({ onBack }: { onBack: () => void }) {
  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-white/70 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
        Back
      </button>
      <h2 className="text-lg font-bold leading-snug tracking-tight text-white xl:text-xl">
        Documents you need
      </h2>
      <p className="mt-2 text-sm leading-relaxed xl:text-[15px]" style={{ color: GM.secondary }}>
        Keep these ready for a smooth onboarding
      </p>
      <ul className="mt-6 space-y-5">
        {ONBOARDING_DOCUMENTS.map(({ icon: Icon, title, detail }) => (
          <li key={title} className="flex gap-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-snug text-white">{title}</p>
              <p className="mt-1 text-xs leading-relaxed xl:text-sm" style={{ color: GM.secondary }}>
                {detail}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function SignupFaqPanel({ onBack }: { onBack: () => void }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-white/70 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
        Back
      </button>
      <h2 className="text-lg font-bold leading-snug tracking-tight text-white xl:text-xl">
        Frequently asked questions
      </h2>
      <p className="mt-2 text-sm leading-relaxed xl:text-[15px]" style={{ color: GM.secondary }}>
        Quick answers to common questions
      </p>
      <ul className="mt-6 space-y-3">
        {ONBOARDING_FAQ_ITEMS.map((item, index) => {
          const isOpen = openIndex === index;
          return (
            <li
              key={item.question}
              className="overflow-hidden rounded-xl border border-white/10 bg-white/5"
            >
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left"
                aria-expanded={isOpen}
              >
                <span className="text-sm font-semibold leading-snug text-white">{item.question}</span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-white/60 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </button>
              {isOpen ? (
                <p
                  className="border-t border-white/10 px-3.5 pb-3.5 pt-2 text-xs leading-relaxed xl:text-sm"
                  style={{ color: GM.secondary }}
                >
                  {item.answer}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function SignupSidebarContent({
  panel,
  onPanelChange,
}: {
  panel: SignupSidebarPanel;
  onPanelChange: (panel: SignupSidebarPanel) => void;
}) {
  if (panel === 'documents' || panel === 'faq') {
    return (
      <div className={`flex min-h-0 flex-1 flex-col ${GM_POPPINS}`}>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-6 py-8 xl:px-7 xl:py-9">
          {panel === 'documents' ? (
            <SignupDocumentsPanel onBack={() => onPanelChange('benefits')} />
          ) : (
            <SignupFaqPanel onBack={() => onPanelChange('benefits')} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${GM_POPPINS}`}>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-6 py-8 xl:px-7 xl:py-9">
        <h2 className="whitespace-nowrap text-lg xl:text-xl font-bold leading-snug tracking-tight text-white">
          Why choose <GatiMitraWord />?
        </h2>
        <p className="mt-3 text-sm xl:text-[15px] leading-relaxed" style={{ color: GM.secondary }}>
          Join merchants who manage orders, grow sales, and get paid — all from one dashboard.
        </p>
        <ul className="mt-6 space-y-5">
          {SIGNUP_HIGHLIGHTS.map((item) => (
            <li key={item.stat} className="flex gap-3.5">
              <span className="shrink-0 min-w-[4rem] text-lg xl:text-xl font-bold text-white tabular-nums">
                {item.stat}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white leading-snug">{item.title}</p>
                <p className="mt-1 text-xs xl:text-sm leading-relaxed" style={{ color: GM.secondary }}>
                  {item.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="shrink-0 border-t border-white/10 px-6 py-4 xl:px-7 xl:py-5">
        <button
          type="button"
          onClick={() => onPanelChange('documents')}
          className={`${sidebarCtaClass} w-fit max-w-full transition-colors hover:border-white/30 hover:bg-white/10`}
        >
          Documents you need
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function LoginSidebarCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % LOGIN_SLIDES.length);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${GM_POPPINS}`}>
      <div className="flex min-h-0 flex-1 flex-col px-7 pt-10">
        {/* Copy — fixed height, opacity crossfade (no jump) */}
        <div className={`relative shrink-0 ${LOGIN_COPY_MIN_H}`}>
          {LOGIN_SLIDES.map((item, index) => (
            <div
              key={item.previewSrc}
              className={`transition-opacity duration-500 ${
                index === activeIndex
                  ? 'relative opacity-100'
                  : 'pointer-events-none absolute inset-0 opacity-0'
              }`}
              aria-hidden={index !== activeIndex}
            >
              <LoginSlideHeading
                eyebrow={item.eyebrow}
                headline={item.headline}
                accentLine={item.accentLine}
                body={item.body}
              />
            </div>
          ))}
        </div>

        <div className="mt-4 flex shrink-0 items-center gap-1.5">
          {LOGIN_SLIDES.map((_, index) => (
            <button
              key={index}
              type="button"
              aria-label={`Show slide ${index + 1}`}
              aria-current={index === activeIndex ? 'true' : undefined}
              onClick={() => setActiveIndex(index)}
              className={`h-[3px] rounded-full transition-all ${
                index === activeIndex ? 'w-7 bg-white' : 'w-4 bg-white/35 hover:bg-white/55'
              }`}
            />
          ))}
        </div>

        <LoginMiddlePills activeIndex={activeIndex} />

        <LoginPreviewFrame activeIndex={activeIndex} />
      </div>
    </div>
  );
}

interface LoginPromoSidebarProps {
  variant?: AuthSidebarVariant;
  signupPanel?: SignupSidebarPanel;
  onSignupPanelChange?: (panel: SignupSidebarPanel) => void;
}

export function LoginPromoSidebar({
  variant = 'login',
  signupPanel = 'benefits',
  onSignupPanelChange,
}: LoginPromoSidebarProps) {
  const isSignup = variant === 'signup';
  const setSignupPanel = onSignupPanelChange ?? (() => {});

  return (
    <aside
      className={`relative hidden h-dvh min-h-0 shrink-0 flex-col overflow-x-hidden overflow-y-hidden ${GM_POPPINS} lg:flex lg:w-[320px] xl:w-[340px]`}
      style={{ backgroundColor: GM.sidebar, color: GM.white }}
      aria-label={
        isSignup
          ? signupPanel === 'faq'
            ? 'Frequently asked questions'
            : signupPanel === 'documents'
              ? 'Documents you need'
              : 'Why choose GatiMitra'
          : 'Partner login benefits'
      }
    >
      <SidebarWave />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {isSignup ? (
          <SignupSidebarContent panel={signupPanel} onPanelChange={setSignupPanel} />
        ) : (
          <LoginSidebarCarousel />
        )}
      </div>
    </aside>
  );
}
