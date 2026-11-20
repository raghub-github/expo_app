'use client'

import { AppleStoreIcon, GooglePlayIcon } from '@/components/common/StoreBrandIcons'

type Tone = 'nav' | 'landing' | 'drawer'

const TONE: Record<
  Tone,
  {
    wrap: string
    label: string
    iconBtn: string
    playIcon: string
    appleIcon: string
  }
> = {
  landing: {
    wrap: 'inline-flex h-9 shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full bg-white/70 px-2 text-[13px] font-bold text-neutral-900 shadow-none transition hover:bg-white',
    label:
      'font-lora hidden whitespace-nowrap px-1 font-bold text-neutral-800 transition-colors hover:text-[#0d8a42] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#109D4C]/35 xl:inline',
    iconBtn:
      'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#109D4C]/35',
    playIcon: 'h-4 w-4',
    appleIcon: 'h-4 w-4 text-neutral-900',
  },
  nav: {
    wrap: 'inline-flex h-9 shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full bg-white/70 px-2 text-[13px] font-bold text-neutral-900 shadow-none transition hover:bg-white',
    label:
      'font-lora hidden whitespace-nowrap px-1 font-bold text-neutral-800 transition-colors hover:text-[#0d8a42] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#109D4C]/35 xl:inline',
    iconBtn:
      'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#109D4C]/35',
    playIcon: 'h-4 w-4',
    appleIcon: 'h-4 w-4 text-neutral-900',
  },
  drawer: {
    wrap: 'font-lora flex w-full items-center gap-2 px-5 py-3 text-[15px] font-bold text-neutral-800',
    label:
      'rounded-md py-0.5 transition-colors hover:text-[#0d8a42] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#109D4C]/35',
    iconBtn:
      'inline-flex items-center justify-center rounded-md p-1.5 transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#109D4C]/35',
    playIcon: 'h-5 w-5',
    appleIcon: 'h-5 w-5 text-neutral-900',
  },
}

/** Compact “Get app” control with Google Play + App Store marks. */
export default function GetAppNavControl({
  onOpen,
  tone = 'nav',
}: {
  onOpen: () => void
  tone?: Tone
}) {
  const t = TONE[tone]

  return (
    <div className={t.wrap} role="group" aria-label="Get app">
      <button type="button" onClick={onOpen} className={t.label}>
        Get app
      </button>
      <button
        type="button"
        onClick={onOpen}
        className={t.iconBtn}
        aria-label="Get Android app on Google Play"
        title="Google Play"
      >
        <GooglePlayIcon className={t.playIcon} />
      </button>
      <button
        type="button"
        onClick={onOpen}
        className={t.iconBtn}
        aria-label="Get iOS app on the App Store"
        title="App Store"
      >
        <AppleStoreIcon className={t.appleIcon} />
      </button>
    </div>
  )
}
