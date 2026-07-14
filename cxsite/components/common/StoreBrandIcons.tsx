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

export function GooglePlayIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#EA4335"
        d="M3.6 2.2c-.3.2-.6.6-.6 1.1v17.4c0 .5.3.9.6 1.1l9.3-9.8L3.6 2.2z"
      />
      <path
        fill="#FBBC04"
        d="M16.4 15.1 13.1 11.8l-9.5 9.9c.3.2.7.1 1.1-.1l11.7-6.5z"
      />
      <path
        fill="#4285F4"
        d="M20.5 10.9c-.5-.3-8.8-5-8.8-5L8.7 8.9l3.3 3.3L4.8 20.1l6.9-3.9 8.1-4.5c.5-.3.7-.8.7-.8z"
      />
      <path
        fill="#34A853"
        d="M11.7 5.9 4.1 1.6C3.9 1.5 3.7 1.5 3.6 1.6l9.5 9.5 3.3-3.2S12.2 6.2 11.7 5.9z"
      />
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
