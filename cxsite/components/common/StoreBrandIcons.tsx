/** Inline SVG store marks — work without Font Awesome brand fonts. */

export function AppleStoreIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 15 2.94 10.53 4.7 7.5c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  )
}

/** Official-style Google Play triangle mark (4 brand colors). */
export function GooglePlayIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="#32BBFF" d="M3.07 1.64c-.3.16-.5.48-.5.9v18.92c0 .42.2.74.5.9l10.66-10.36L3.07 1.64z" />
      <path fill="#FBC11A" d="M16.2 15.18 13.06 12 3.07 21.72c.28.2.65.22 1.05.01l12.08-6.55z" />
      <path fill="#ED4A4C" d="M16.2 8.82 4.12 2.27C3.72 2.06 3.35 2.08 3.07 2.28L13.06 12l3.14-3.18z" />
      <path fill="#25C059" d="m13.06 12 3.14-3.18 3.6 1.96c.9.49.9 1.29 0 1.78l-3.6 1.96L13.06 12z" />
    </svg>
  )
}

export function AndroidRobotIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.6 9.48 19.4 6.4a.5.5 0 1 0-.87-.5l-1.86 3.22A11.4 11.4 0 0 0 12 8.5c-1.6 0-3.1.4-4.4.92L5.77 5.9a.5.5 0 1 0-.87.5l1.81 3.13C3.6 11.1 2.4 13.7 2.4 16.6h19.2c0-2.9-1.2-5.5-3.99-7.12ZM7.8 13.8a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Zm8.4 0a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Z" />
    </svg>
  )
}
