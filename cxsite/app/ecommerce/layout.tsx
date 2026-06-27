'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/** Adds body class on ecom routes to hide scrollbar; removes on leave. */
export default function EcommerceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isEcom = pathname?.startsWith('/ecommerce')

  useEffect(() => {
    if (typeof document === 'undefined') return
    if (isEcom) {
      document.body.classList.add('ecom-page')
    } else {
      document.body.classList.remove('ecom-page')
    }
    return () => {
      document.body.classList.remove('ecom-page')
    }
  }, [isEcom])

  return <>{children}</>
}
