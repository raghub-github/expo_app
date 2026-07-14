'use client'

import { AndroidRobotIcon, AppleStoreIcon } from '@/components/common/StoreBrandIcons'

type Tone = 'nav' | 'landing' | 'drawer'

const TONE: Record<
  Tone,
  {
    wrap: string
    label: string
    iconBtn: string
    icon: string
  }
> = {
  landing: {
    wrap: 'inline-flex items-center gap-2 text-[11px] font-medium leading-tight tracking-tight text-black sm:text-[12px] lg:text-[13px] xl:text-[14px]',
    label:
      'rounded-sm py-0.5 transition-colors hover:text-[#109D4C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#109D4C]/35',
    iconBtn:
      'inline-flex items-center justify-center rounded-sm p-0.5 transition-colors hover:text-[#109D4C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#109D4C]/35',
    icon: 'h-5 w-5 sm:h-6 sm:w-6',
  },
  nav: {
    wrap: 'inline-flex items-center gap-2 px-3 py-2 text-[14px] font-medium text-text',
    label:
      'rounded-md px-0.5 py-0.5 transition-colors hover:text-purple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple/30',
    iconBtn:
      'inline-flex items-center justify-center rounded-md p-1 transition-colors hover:bg-[rgba(75,42,212,0.08)] hover:text-purple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple/30',
    icon: 'h-5 w-5',
  },
  drawer: {
    wrap: 'flex w-full items-center gap-2 px-5 py-3 text-[15px] font-medium text-gray-700',
    label:
      'rounded-md py-0.5 transition-colors hover:text-purple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple/30',
    iconBtn:
      'inline-flex items-center justify-center rounded-md p-1.5 text-purple transition-colors hover:bg-[rgba(75,42,212,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple/30',
    icon: 'h-5 w-5',
  },
}

/** Reference-style “Get app:” + separate Android / Apple hit targets (all open download modal). */
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
        Get app:
      </button>
      <button
        type="button"
        onClick={onOpen}
        className={t.iconBtn}
        aria-label="Get Android app"
        title="Android"
      >
        <AndroidRobotIcon className={t.icon} />
      </button>
      <button
        type="button"
        onClick={onOpen}
        className={t.iconBtn}
        aria-label="Get iOS app"
        title="iOS"
      >
        <AppleStoreIcon className={t.icon} />
      </button>
    </div>
  )
}
